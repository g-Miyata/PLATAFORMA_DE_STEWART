"""
Faz o FlightGear voar a rotina de demonstração (demo-flight.nas) pela API HTTP,
com o ERJ145 (padrão) ou o C172P.

O Nasal do FlightGear só lê arquivos de pastas autorizadas, então o código vai
no corpo do fgcommand "nasal". Requer o simulador aberto com --httpd (o
start-flightgear-cueing.ps1 já liga na porta 8080). Liga os motores sozinho.

    python fly-demo.py          # carrega e decola
    python fly-demo.py --stop   # devolve os comandos ao piloto
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

import httpx

FG = f"http://{os.getenv('FG_HTTP_HOST', '127.0.0.1')}:{os.getenv('FG_HTTP_PORT', '8080')}"
SCRIPT = Path(__file__).with_name("demo-flight.nas")


def nasal(client: httpx.Client, code: str, module: str = "stewartdemo") -> None:
    body = {"children": [{"name": "script", "value": code}, {"name": "module", "value": module}]}
    r = client.post(f"{FG}/run.cgi", params={"value": "nasal"}, json=body)
    r.raise_for_status()


def prop(client: httpx.Client, path: str):
    r = client.get(f"{FG}/json{path}")
    return r.json().get("value") if r.status_code == 200 else None


def start_engines(client: httpx.Client) -> bool:
    """Partida automática do próprio avião; espera os motores firmarem."""
    aircraft = prop(client, "/sim/aircraft")
    if aircraft == "erj145":
        running = lambda: all(prop(client, f"/engines/engine[{i}]/running") for i in (0, 1))
        # o ERJ145 abre com os tanques desmarcados (motores "sem combustível"); autostart alterna liga/desliga
        command = ("foreach (var i; [0, 1, 2]) setprop(\"/consumables/fuel/tank[\" ~ i ~ \"]/selected\", 1);"
                   "setprop(\"/sim/autostart/started\", 0); engines.autostart();")
        wait_s = 60
    elif aircraft == "c172p":
        running = lambda: bool(prop(client, "/engines/active-engine/running"))
        command, wait_s = "c172p.autostart(0);", 15
    else:
        print(f"Aeronave {aircraft!r} sem perfil no piloto de demonstração (use erj145 ou c172p).", file=sys.stderr)
        return False
    if running():
        return True
    print(f"Ligando os motores de {aircraft}...")
    nasal(client, command, module="stewartdemo_ctl")
    if aircraft == "erj145":
        # o piloto do ERJ abre com a apresentação do avião, que espera os motores pegarem
        return True
    t0 = time.monotonic()
    while time.monotonic() - t0 < wait_s:
        if running():
            time.sleep(3)  # rotação estabilizar
            return True
        time.sleep(1)
    print("Os motores não pegaram. Ligue pelo menu do avião e rode de novo.", file=sys.stderr)
    return False


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--stop", action="store_true", help="para o piloto de demonstração")
    args = parser.parse_args()
    with httpx.Client(timeout=15.0) as client:
        try:
            if args.stop:
                nasal(client, "stewartdemo.stop();", module="stewartdemo_ctl")
                print("Piloto de demonstração parado.")
                return 0
            if not start_engines(client):
                return 1
            nasal(client, SCRIPT.read_text(encoding="utf-8"))
            nasal(client, "stewartdemo.start();", module="stewartdemo_ctl")
        except httpx.HTTPError as exc:
            print(f"FlightGear inacessível em {FG}: {exc}", file=sys.stderr)
            return 1
        print("Voo iniciado. Acompanhe a fase em /stewart-demo/phase (Ctrl+C só sai deste script).")
        last = None
        while True:
            phase = prop(client, "/stewart-demo/phase")
            if phase != last:
                print(f"  fase: {phase}")
                last = phase
            if phase in ("fim", "parado", None):
                return 0
            time.sleep(1.0)


if __name__ == "__main__":
    raise SystemExit(main())
