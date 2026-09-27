"""Lançador do backend no modo rede local (celular no mesmo Wi-Fi).

    set STEWART_LAN=1
    python serve.py

Sobe o MESMO app (uma serial, um estado) em dois servidores no mesmo processo:
HTTP em 0.0.0.0:8001 e HTTPS em 0.0.0.0:8443 (certificado autoassinado em certs/,
necessário para o giroscópio do celular). Sem STEWART_LAN, use o run-backend.cmd de
sempre (127.0.0.1, com --reload).
"""
import asyncio
import os

import uvicorn


def main():
    os.environ.setdefault("STEWART_LAN", "1")
    import lan
    from app import app, lan_guard

    ips = lan.local_ips()
    cert, key = lan.ensure_certificate(ips)
    http = uvicorn.Server(uvicorn.Config(app, host="0.0.0.0", port=lan.HTTP_PORT, log_level="info"))
    # o segundo servidor não repete o startup do app (serial, loop de eventos)
    https = uvicorn.Server(uvicorn.Config(app, host="0.0.0.0", port=lan.HTTPS_PORT, ssl_certfile=str(cert), ssl_keyfile=str(key), lifespan="off", log_level="info"))

    print("\n=== Plataforma de Stewart na rede local ===")
    print(f"No PC:      http://localhost:{lan.HTTP_PORT}/")
    for u in lan_guard.urls():
        print(f"No celular: {u['https']}   (aceite o aviso de certificado uma vez)")
    print(f"PIN para comandar pelo celular: {lan_guard.pin}")
    print("Se o Windows perguntar, libere o Python no firewall (rede privada).\n")

    async def run():
        await asyncio.gather(http.serve(), https.serve())

    asyncio.run(run())


if __name__ == "__main__":
    main()
