"""
Servidor MCP (stdio) do FlightGear.

Expõe ferramentas para ler o estado do voo, mexer nos comandos, piloto automático,
rádios, câmera e executar fgcommands/Nasal. Tudo passa pela API HTTP do simulador,
então o FlightGear precisa estar aberto com --httpd=8080 (ou FG_HTTP_PORT).
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Literal

from mcp.server.mcpserver import Image, MCPServer

from .client import FlightGearClient, FlightGearError

# O httpx loga cada requisição em INFO; no stdio isso só polui o log do cliente MCP.
logging.getLogger("httpx").setLevel(logging.WARNING)

mcp = MCPServer(
    "flightgear",
    instructions=(
        "Controla o simulador FlightGear pela árvore de propriedades. "
        "Use get_flight_data para o estado geral e get_motion_cues para os sinais que alimentam "
        "a Plataforma de Stewart. get_property/set_property alcançam qualquer propriedade; "
        "os caminhos de piloto automático e rádios variam entre aeronaves."
    ),
)

_client: FlightGearClient | None = None


def fg() -> FlightGearClient:
    global _client
    if _client is None:
        _client = FlightGearClient()
    return _client


POSITION = {
    "latitude_deg": "/position/latitude-deg",
    "longitude_deg": "/position/longitude-deg",
    "altitude_ft": "/position/altitude-ft",
    "altitude_agl_ft": "/position/altitude-agl-ft",
}
ATTITUDE = {
    "roll_deg": "/orientation/roll-deg",
    "pitch_deg": "/orientation/pitch-deg",
    "heading_deg": "/orientation/heading-deg",
}
VELOCITY = {
    "airspeed_kt": "/velocities/airspeed-kt",
    "groundspeed_kt": "/velocities/groundspeed-kt",
    "vertical_speed_fps": "/velocities/vertical-speed-fps",
    "mach": "/velocities/mach",
}
CONTROLS = {
    "throttle": "/controls/engines/engine[0]/throttle",
    "mixture": "/controls/engines/engine[0]/mixture",
    "aileron": "/controls/flight/aileron",
    "elevator": "/controls/flight/elevator",
    "rudder": "/controls/flight/rudder",
    "flaps": "/controls/flight/flaps",
    "parking_brake": "/controls/gear/brake-parking",
    "gear_down": "/controls/gear/gear-down",
}
ENGINE = {
    "running": "/engines/engine[0]/running",
    "rpm": "/engines/engine[0]/rpm",
    "thrust_lbs": "/engines/engine[0]/thrust_lb",
}
MOTION = {
    **ATTITUDE,
    "roll_rate_degps": "/orientation/roll-rate-degps",
    "pitch_rate_degps": "/orientation/pitch-rate-degps",
    "yaw_rate_degps": "/orientation/yaw-rate-degps",
    "accel_x_fps2": "/accelerations/pilot/x-accel-fps_sec",
    "accel_y_fps2": "/accelerations/pilot/y-accel-fps_sec",
    "accel_z_fps2": "/accelerations/pilot/z-accel-fps_sec",
    "load_factor_g": "/accelerations/pilot-g",
}
AUTOPILOT = {
    "heading_mode": "/autopilot/locks/heading",
    "altitude_mode": "/autopilot/locks/altitude",
    "speed_mode": "/autopilot/locks/speed",
    "heading_bug_deg": "/autopilot/settings/heading-bug-deg",
    "target_altitude_ft": "/autopilot/settings/target-altitude-ft",
    "target_speed_kt": "/autopilot/settings/target-speed-kt",
    "vertical_speed_fpm": "/autopilot/settings/vertical-speed-fpm",
}
RADIOS = {
    "com1": "/instrumentation/comm[0]/frequencies/selected-mhz",
    "com2": "/instrumentation/comm[1]/frequencies/selected-mhz",
    "nav1": "/instrumentation/nav[0]/frequencies/selected-mhz",
    "nav2": "/instrumentation/nav[1]/frequencies/selected-mhz",
    "adf": "/instrumentation/adf/frequencies/selected-khz",
    "transponder": "/instrumentation/transponder/id-code",
}
SIM = {
    "aircraft": "/sim/aircraft",
    "description": "/sim/description",
    "paused": "/sim/freeze/master",
    "elapsed_sec": "/sim/time/elapsed-sec",
}


async def _set_given(paths: dict[str, str], **values: Any) -> dict[str, Any]:
    changed = {k: v for k, v in values.items() if v is not None}
    if not changed:
        raise FlightGearError("Nenhum valor informado.")
    for key, value in changed.items():
        await fg().set(paths[key], value)
    return changed


def _flatten(node: dict[str, Any]) -> dict[str, Any]:
    """Converte a resposta de /json em {caminho: valor} / lista de filhos, mais fácil de ler."""
    out: dict[str, Any] = {"path": node.get("path"), "type": node.get("type")}
    if "value" in node:
        out["value"] = node["value"]
    if node.get("children"):
        out["children"] = [
            {k: c[k] for k in ("path", "type", "value", "nChildren") if k in c} for c in node["children"]
        ]
    return out


# ---- Leitura -------------------------------------------------------------------------------


@mcp.tool()
async def get_flight_data() -> dict[str, Any]:
    """Estado geral: simulação, posição, atitude, velocidades, motor e comandos."""
    groups = {"sim": SIM, "position": POSITION, "attitude": ATTITUDE, "velocity": VELOCITY,
              "engine": ENGINE, "controls": CONTROLS}
    return {name: await fg().get_many(paths) for name, paths in groups.items()}


@mcp.tool()
async def get_motion_cues() -> dict[str, Any]:
    """Atitude, velocidades angulares e acelerações no piloto: o que a Plataforma de Stewart reproduz."""
    return await fg().get_many(MOTION)


@mcp.tool()
async def get_property(path: str, depth: int = 1) -> dict[str, Any]:
    """Lê qualquer nó da árvore de propriedades (ex.: /orientation/roll-deg).

    depth=2 lista também os filhos, útil para explorar (ex.: get_property("/controls", 2)).
    """
    node = await fg().get_node(path, depth)
    if node is None:
        raise FlightGearError(f"Propriedade inexistente: {path}")
    return _flatten(node)


@mcp.tool()
async def set_property(path: str, value: str | float | bool) -> str:
    """Grava qualquer propriedade (cria se não existir)."""
    await fg().set(path, value)
    return f"{path} = {value!r}"


# ---- Comandos de voo -----------------------------------------------------------------------


@mcp.tool()
async def set_controls(
    throttle: float | None = None,
    aileron: float | None = None,
    elevator: float | None = None,
    rudder: float | None = None,
    flaps: float | None = None,
    mixture: float | None = None,
    parking_brake: float | None = None,
    gear_down: bool | None = None,
) -> dict[str, Any]:
    """Ajusta comandos de voo; só os informados mudam.

    throttle, mixture, flaps e parking_brake vão de 0 a 1; aileron, elevator e rudder de -1 a 1.
    """
    return await _set_given(CONTROLS, throttle=throttle, aileron=aileron, elevator=elevator, rudder=rudder,
                            flaps=flaps, mixture=mixture, parking_brake=parking_brake, gear_down=gear_down)


@mcp.tool()
async def get_autopilot() -> dict[str, Any]:
    """Modos e alvos do piloto automático genérico (/autopilot)."""
    return await fg().get_many(AUTOPILOT)


@mcp.tool()
async def set_autopilot(
    heading_mode: str | None = None,
    altitude_mode: str | None = None,
    speed_mode: str | None = None,
    heading_bug_deg: float | None = None,
    target_altitude_ft: float | None = None,
    target_speed_kt: float | None = None,
    vertical_speed_fpm: float | None = None,
) -> dict[str, Any]:
    """Configura o piloto automático genérico; só os campos informados mudam.

    Modos comuns: heading_mode "dg-heading-hold" / "true-heading-hold" / "nav1-hold";
    altitude_mode "altitude-hold" / "vertical-speed-hold"; speed_mode "speed-with-throttle".
    String vazia desliga o modo. Aeronaves com piloto automático próprio (ex.: KAP140 do c172p)
    usam outras propriedades: explore com get_property.
    """
    return await _set_given(AUTOPILOT, heading_mode=heading_mode, altitude_mode=altitude_mode,
                            speed_mode=speed_mode, heading_bug_deg=heading_bug_deg,
                            target_altitude_ft=target_altitude_ft, target_speed_kt=target_speed_kt,
                            vertical_speed_fpm=vertical_speed_fpm)


@mcp.tool()
async def get_radios() -> dict[str, Any]:
    """Frequências de COM/NAV/ADF e código do transponder."""
    return await fg().get_many(RADIOS)


@mcp.tool()
async def set_radio(radio: Literal["com1", "com2", "nav1", "nav2", "adf", "transponder"], value: float) -> str:
    """Sintoniza um rádio (MHz para COM/NAV, kHz para ADF, código de 4 dígitos para transponder)."""
    await fg().set(RADIOS[radio], int(value) if radio == "transponder" else value)
    return f"{radio} = {value}"


# ---- Câmera --------------------------------------------------------------------------------


async def _view_names() -> list[str]:
    names = await asyncio.gather(*(fg().get(f"/sim/view[{i}]/name") for i in range(20)))
    return [n for n in names if n is not None]


@mcp.tool()
async def get_views() -> dict[str, Any]:
    """Câmera atual, campo de visão e lista de vistas disponíveis (índice = posição na lista)."""
    current = await fg().get_many({
        "view_number": "/sim/current-view/view-number",
        "field_of_view_deg": "/sim/current-view/field-of-view",
        "heading_offset_deg": "/sim/current-view/heading-offset-deg",
        "pitch_offset_deg": "/sim/current-view/pitch-offset-deg",
    })
    return {**current, "available": await _view_names()}


@mcp.tool()
async def set_view(
    view: str | int | None = None,
    field_of_view_deg: float | None = None,
    heading_offset_deg: float | None = None,
    pitch_offset_deg: float | None = None,
) -> dict[str, Any]:
    """Troca a câmera (nome como "Cockpit View"/"Chase View" ou índice) e/ou ajusta zoom e direção do olhar."""
    changed: dict[str, Any] = {}
    if view is not None:
        if isinstance(view, str) and not view.isdigit():
            names = await _view_names()
            match = [i for i, n in enumerate(names) if view.lower() in n.lower()]
            if not match:
                raise FlightGearError(f"Vista {view!r} não encontrada. Disponíveis: {names}")
            view = match[0]
        await fg().set("/sim/current-view/view-number", int(view))
        changed["view_number"] = int(view)
    for key, prop, value in (("field_of_view_deg", "field-of-view", field_of_view_deg),
                             ("heading_offset_deg", "heading-offset-deg", heading_offset_deg),
                             ("pitch_offset_deg", "pitch-offset-deg", pitch_offset_deg)):
        if value is not None:
            await fg().set(f"/sim/current-view/{prop}", value)
            changed[key] = value
    if not changed:
        raise FlightGearError("Nenhum valor informado.")
    return changed


@mcp.tool()
async def screenshot() -> Image:
    """Captura a tela atual do FlightGear."""
    return Image(data=await fg().screenshot("jpg"), format="jpeg")


# ---- Simulação -----------------------------------------------------------------------------


@mcp.tool()
async def set_pause(paused: bool) -> str:
    """Pausa ou retoma a simulação."""
    if bool(await fg().get(SIM["paused"], False)) != paused:
        await fg().run_command("pause")
    return "pausado" if paused else "rodando"


@mcp.tool()
async def set_time_of_day(
    time: Literal["real", "dawn", "morning", "noon", "afternoon", "dusk", "evening", "midnight"],
) -> str:
    """Muda a hora do dia no simulador."""
    await fg().run_command("timeofday", {"timeofday": time})
    return f"hora do dia: {time}"


@mcp.tool()
async def reset_flight() -> str:
    """Reinicia o voo na posição inicial."""
    await fg().run_command("reset")
    return "voo reiniciado"


@mcp.tool()
async def run_fgcommand(command: str, args: dict[str, Any] | None = None) -> str:
    """Executa um fgcommand arbitrário (ex.: "view-cycle-forwards", "dialog-show" com {"dialog-name": "map"})."""
    return await fg().run_command(command, args)


@mcp.tool()
async def run_nasal(script: str, result_property: str | None = None) -> dict[str, Any]:
    """Executa código Nasal dentro do FlightGear.

    O fgcommand não devolve saída: para obter um resultado, grave-o numa propriedade no script
    (ex.: setprop("/mcp/result", ...)) e passe result_property="/mcp/result".
    """
    status = await fg().run_command("nasal", {"script": script})
    out: dict[str, Any] = {"status": status}
    if result_property:
        out["result"] = await fg().get(result_property)
    return out


def main() -> None:
    mcp.run("stdio")


if __name__ == "__main__":
    main()
