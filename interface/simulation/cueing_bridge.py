"""
Ponte do motion cueing: recebe a saída UDP do FlightGear (protocolo genérico
stewart-cueing) e repassa cada frame ao backend pelo WebSocket /cueing/ingest.

O washout, os limites e o envio aos pistões ficam no backend (cueing.py); esta
ponte só converte unidades e mantém a conexão. Rodar com:

    python fg-bridge.py --cueing
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from typing import Dict, Optional

import websockets

FT_TO_M = 0.3048

# Mesma ordem dos <chunk> de fgdata/Protocol/stewart-cueing.xml
FIELDS = ["t", "fx", "fy", "fz", "p", "q", "r", "roll", "pitch", "heading", "ias", "agl", "alt",
          "wow", "paused", "replay", "aircraft"]
# v2: posição e superfícies, para o FlightGear redesenhar o voo gravado depois
VISUAL_FIELDS = ["lat", "lon", "gear", "flaps", "elevator", "aileron", "rudder", "speedbrake"]
# v3: câmera, para o replay repetir o enquadramento (inclusive a apresentação do avião)
CAMERA_FIELDS = ["cam_view", "cam_hdg", "cam_pitch", "cam_fov", "cam_dist"]

UDP_HOST = os.getenv("FG_CUEING_UDP_HOST", "127.0.0.1")
UDP_PORT = int(os.getenv("FG_CUEING_UDP_PORT", "5510"))
API_BASE = os.getenv("STEWARD_API_BASE", "http://localhost:8001")
RECONNECT_DELAY = float(os.getenv("FG_RECONNECT_DELAY", "2.0"))

logger = logging.getLogger("fg_cueing_bridge")


def ingest_url(api_base: str = API_BASE) -> str:
    base = api_base.rstrip("/")
    if base.startswith("https://"):
        return "wss://" + base[len("https://"):] + "/cueing/ingest"
    return "ws://" + base.removeprefix("http://") + "/cueing/ingest"


def parse_line(line: str) -> Optional[Dict]:
    """Uma linha do FlightGear -> amostra no formato de /cueing/ingest (SI e °/s)."""
    parts = line.strip().split(",")
    if len(parts) < len(FIELDS) - 1:
        return None
    try:
        v = [float(x) for x in parts[:13]]
        flags = [parts[i].strip().lower() in ("1", "true") for i in (13, 14, 15)]
    except ValueError:
        return None
    sample = {
        "t": v[0],
        "f": [v[1] * FT_TO_M, v[2] * FT_TO_M, v[3] * FT_TO_M],
        "w": [v[4], v[5], v[6]],
        "roll": v[7], "pitch": v[8], "heading": v[9],
        "ias": v[10], "agl": v[11], "alt": v[12],
        "wow": flags[0], "paused": flags[1], "replay": flags[2],
        "aircraft": parts[16].strip() if len(parts) > 16 else None,
    }
    n = len(FIELDS)
    for extra in (VISUAL_FIELDS, CAMERA_FIELDS):
        if len(parts) < n + len(extra):
            break
        try:
            sample.update({k: float(x) for k, x in zip(extra, parts[n:n + len(extra)])})
        except ValueError:
            break
        n += len(extra)
    return sample


class _UdpReceiver(asyncio.DatagramProtocol):
    def __init__(self, queue: asyncio.Queue, stats: Dict[str, int]):
        self.queue = queue
        self.stats = stats

    def datagram_received(self, data: bytes, addr) -> None:
        for line in data.decode("ascii", errors="replace").splitlines():
            sample = parse_line(line)
            if sample is None:
                self.stats["bad"] += 1
                continue
            self.stats["udp"] += 1
            if self.queue.full():  # backend atrasado: descarta o mais velho
                self.queue.get_nowait()
                self.stats["dropped"] += 1
            self.queue.put_nowait(sample)


async def _report(stats: Dict[str, int]) -> None:
    last, t0 = dict(stats), time.monotonic()
    while True:
        await asyncio.sleep(5.0)
        now = time.monotonic()
        rate = (stats["udp"] - last["udp"]) / (now - t0)
        sent = (stats["sent"] - last["sent"]) / (now - t0)
        if rate == 0:
            logger.warning("Nenhum frame do FlightGear em %s:%s nos últimos 5 s", UDP_HOST, UDP_PORT)
        else:
            logger.info("FlightGear %.0f Hz -> backend %.0f Hz (descartados %d)", rate, sent, stats["dropped"])
        last, t0 = dict(stats), now


async def run_cueing_bridge(udp_host: str = UDP_HOST, udp_port: int = UDP_PORT, api_base: str = API_BASE) -> None:
    loop = asyncio.get_running_loop()
    queue: asyncio.Queue = asyncio.Queue(maxsize=240)
    stats = {"udp": 0, "sent": 0, "dropped": 0, "bad": 0}
    transport, _ = await loop.create_datagram_endpoint(lambda: _UdpReceiver(queue, stats), local_addr=(udp_host, udp_port))
    url = ingest_url(api_base)
    logger.info("Ouvindo o FlightGear em udp://%s:%s", udp_host, udp_port)
    reporter = asyncio.create_task(_report(stats))
    try:
        while True:
            try:
                async with websockets.connect(url, ping_interval=20, max_queue=None) as ws:
                    logger.info("Conectado ao backend em %s", url)
                    while not queue.empty():  # frames velhos não servem para cueing
                        queue.get_nowait()
                    while True:
                        sample = await queue.get()
                        await ws.send(json.dumps(sample, separators=(",", ":")))
                        stats["sent"] += 1
            except (OSError, websockets.exceptions.WebSocketException) as exc:
                logger.error("Backend indisponível em %s (%s); tentando de novo em %.0f s", url, exc, RECONNECT_DELAY)
                await asyncio.sleep(RECONNECT_DELAY)
    finally:
        reporter.cancel()
        transport.close()
