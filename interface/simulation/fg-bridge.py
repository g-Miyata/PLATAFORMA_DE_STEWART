"""
Bridge para fazer ponte que consulta o FlightGear via telnet, limita roll/pitch e encaminha
poses para o backend FastAPI da plataforma Stewart.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from typing import Dict, Tuple

import httpx
from flightgear_python.fg_if import TelnetConnection


API_BASE_URL = os.getenv("STEWARD_API_BASE", "http://localhost:8001")
CALCULATE_URL = f"{API_BASE_URL}/calculate"
APPLY_URL = f"{API_BASE_URL}{os.getenv('STEWARD_APPLY_PATH', '/apply_pose')}"
STATUS_URL = f"{API_BASE_URL}/flight-simulation/status"
PREVIEW_URL = f"{API_BASE_URL}/flight-simulation/preview"

FG_TELNET_HOST = os.getenv("FG_TELNET_HOST", "localhost")
FG_TELNET_PORT = int(os.getenv("FG_TELNET_PORT", "5050"))
POLL_INTERVAL = float(os.getenv("FG_POLL_INTERVAL", "0.1"))
RECONNECT_DELAY = float(os.getenv("FG_RECONNECT_DELAY", "2.0"))

SAFE_Z = float(os.getenv("FG_SAFE_Z", "540.0"))
SAFE_YAW = float(os.getenv("FG_SAFE_YAW", "0.0"))
ANGLE_LIMIT = float(os.getenv("FG_ANGLE_LIMIT", "15.0"))


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("fg_bridge")


def clamp_angle(value: float, limit: float = ANGLE_LIMIT) -> float:
    """Limita um ângulo a ±limit graus."""
    return max(-limit, min(limit, value))


class FlightSimulationGate:
    """Cachea a flag /flight-simulation/status para saber quando encaminhar poses."""

    def __init__(self, status_url: str, ttl: float = 0.5) -> None:
        self._status_url = status_url
        self._ttl = ttl
        self._last_check = 0.0
        self._enabled = False

    async def is_enabled(self, client: httpx.AsyncClient) -> bool:
        """Retorna True quando o backend indica que a simulação pode controlar a plataforma."""
        now = time.monotonic()
        if (now - self._last_check) < self._ttl:
            return self._enabled

        try:
            response = await client.get(self._status_url, timeout=5.0)
            response.raise_for_status()
            data = response.json()
            enabled_flag = bool(data.get("enabled", False))
            if enabled_flag != self._enabled:
                logger.info("Flag de simulação de voo mudou -> %s", enabled_flag)
            self._enabled = enabled_flag
        except httpx.HTTPError as exc:
            logger.error("Falha ao obter status da simulação de voo: %s", exc)
            self._enabled = False

        self._last_check = now
        return self._enabled


FLIGHT_GATE = FlightSimulationGate(STATUS_URL)


def read_roll_pitch(telnet_conn: TelnetConnection) -> Tuple[float, float]:
    """Helper bloqueante que obtém roll/pitch do FlightGear (graus)."""
    roll = telnet_conn.get_prop("/orientation/roll-deg")
    pitch = telnet_conn.get_prop("/orientation/pitch-deg")
    return float(roll), float(pitch)


async def calculate_preview(pose: Dict[str, float], client: httpx.AsyncClient) -> Dict | None:
    """Chama /calculate para obter a geometria da plataforma para fins de pré-visualização."""
    try:
        response = await client.post(CALCULATE_URL, json=pose)
        if response.status_code != 200:
            logger.error(
                "Backend /calculate rejeitou pose: status=%s body=%s",
                response.status_code,
                response.text,
            )
            return None
        return response.json()
    except httpx.HTTPError as exc:
        logger.exception("Falha ao chamar /calculate: %s", exc)
        return None


async def publish_preview(preview: Dict, client: httpx.AsyncClient) -> None:
    """Envia a última resposta de /calculate para o backend para que a UI possa renderizar sem telemetria."""
    try:
        await client.post(PREVIEW_URL, json=preview, timeout=5.0)
    except httpx.HTTPError as exc:
        logger.error("Falha ao publicar pré-visualização da simulação de voo: %s", exc)

async def apply_pose(pose: Dict[str, float], client: httpx.AsyncClient) -> bool:
    """Chama /apply_pose com a pose atual."""
    try:
        resp = await client.post(APPLY_URL, json=pose)
        if resp.status_code != 200:
            logger.error(
                "Backend /apply_pose falhou: status=%s body=%s",
                resp.status_code,
                resp.text,
            )
            return False
    except httpx.HTTPError as exc:
        logger.exception("Falha ao chamar /apply_pose: %s", exc)
        return False
    return True


async def poll_flightgear() -> None:
    """Consulta continuamente o FlightGear via Telnet e encaminha poses para o backend."""
    async with httpx.AsyncClient() as client:
        while True:
            telnet_conn = TelnetConnection(FG_TELNET_HOST, FG_TELNET_PORT)

            try:
                logger.info(
                    "Conectando ao telnet do FlightGear em %s:%s",
                    FG_TELNET_HOST,
                    FG_TELNET_PORT,
                )
                await asyncio.to_thread(telnet_conn.connect)
                logger.info("Conectado ao telnet do FlightGear")

                while True:
                    try:
                        roll, pitch = await asyncio.to_thread(read_roll_pitch, telnet_conn)
                    except Exception as exc:
                        logger.error("Falha ao ler ângulos: %s", exc)
                        await asyncio.sleep(POLL_INTERVAL)
                        continue

                    logger.info("FG: roll=%.2f°, pitch=%.2f°", roll, pitch)
                    clamped_roll = clamp_angle(roll)
                    clamped_pitch = clamp_angle(pitch)
                    logger.info(
                        "Roll limitado=%.2f°, Pitch limitado=%.2f°",
                        clamped_roll,
                        clamped_pitch,
                    )

                    pose = {
                        "x": 0.0,
                        "y": 0.0,
                        "z": SAFE_Z,
                        "roll": clamped_roll,
                        "pitch": clamped_pitch,
                        "yaw": SAFE_YAW,
                    }

                    preview = await calculate_preview(pose, client)
                    if preview:
                        await publish_preview(preview, client)
                        if not preview.get("valid", False):
                            logger.warning("Pose de pré-visualização fora do espaço de trabalho seguro; pulando aplicação")
                            await asyncio.sleep(POLL_INTERVAL)
                            continue
                    else:
                        await asyncio.sleep(POLL_INTERVAL)
                        continue

                    if not await FLIGHT_GATE.is_enabled(client):
                        logger.info("Simulação de voo desativada -> não aplicando pose")
                        await asyncio.sleep(POLL_INTERVAL)
                        continue

                    logger.info("Enviando pose para /apply_pose")
                    success = await apply_pose(pose, client)
                    if not success:
                        logger.error("Falha na aplicação da pose; tentará novamente na próxima amostra")

                    await asyncio.sleep(POLL_INTERVAL)

            except ConnectionRefusedError:
                logger.error(
                    "Telnet do FlightGear recusou conexão em %s:%s",
                    FG_TELNET_HOST,
                    FG_TELNET_PORT,
                )
            except Exception as exc:
                logger.exception("Erro inesperado no telnet: %s", exc)
            finally:
                try:
                    await asyncio.to_thread(telnet_conn.disconnect)
                except Exception:
                    pass
                logger.info(
                    "Reconectando ao FlightGear em %.1f segundos",
                    RECONNECT_DELAY,
                )
                await asyncio.sleep(RECONNECT_DELAY)


async def main() -> None:
    """Conecta ao FlightGear e encaminha poses indefinidamente."""
    await poll_flightgear()


if __name__ == "__main__":
    asyncio.run(main())
