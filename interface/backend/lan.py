"""Acesso pela rede local (celular no mesmo Wi-Fi).

Com STEWART_LAN=1 (start.bat rede), serve.py sobe o backend em 0.0.0.0, em HTTP (8001)
e HTTPS (8443). Sem isso, o próprio PC pode ligar o modo rede depois, pela tela Celular
(POST /lan/start): sobe só o HTTPS 8443 em 0.0.0.0, no mesmo processo. O HTTPS usa um
certificado autoassinado gerado aqui na primeira vez: o celular mostra um aviso uma vez,
e depois o giroscópio funciona (DeviceOrientation só existe em HTTPS).

Qualquer aparelho no Wi-Fi alcança a porta, então comandos que vêm de fora do PC
precisam de um PIN de 6 dígitos (mostrado na interface do PC). O próprio PC nunca pede
PIN, e a parada de emergência funciona sem PIN em qualquer aparelho. Um celular por vez:
com um já conectado, outro só entra depois que ele desconectar (ou o PC desconectá-lo).
"""
import asyncio
import datetime
import hmac
import ipaddress
import json
import os
import secrets
import socket
import time
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

HTTP_PORT = int(os.environ.get("STEWART_PORT", "8001"))
HTTPS_PORT = int(os.environ.get("STEWART_HTTPS_PORT", "8443"))
CERT_DIR = Path(__file__).resolve().parent / "certs"
COOKIE = "stewart_lan"
LOOPBACK = {"127.0.0.1", "::1", "localhost"}
# rotas que comandam mas precisam funcionar sem PIN
OPEN_PATHS = {"/lan/auth", "/lan/logout", "/emergency-stop"}
MAX_FAILS = 5
LOCKOUT_S = 60.0
# um aparelho conta como conectado se falou com o backend nos últimos N segundos
ACTIVE_S = 15.0


def lan_enabled() -> bool:
    return os.environ.get("STEWART_LAN", "").strip().lower() in ("1", "true", "sim", "yes", "rede")


def local_ips() -> List[str]:
    """IPv4 da máquina na rede local (sem loopback)."""
    ips: Set[str] = set()
    try:
        # descobre a interface de saída sem mandar nada de fato
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("10.255.255.255", 1))
            ips.add(s.getsockname()[0])
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ips.add(info[4][0])
    except OSError:
        pass
    ips = {ip for ip in ips if not ip.startswith("127.") and not ip.startswith("169.254.")}
    # Wi-Fi doméstico/escolar primeiro; 172.16–31 costuma ser adaptador virtual (WSL, Hyper-V)
    rank = lambda ip: (0 if ip.startswith("192.168.") else 1 if ip.startswith("10.") else 2, ip)
    return sorted(ips, key=rank)


def ensure_certificate(ips: List[str], folder: Path = CERT_DIR) -> Tuple[Path, Path]:
    """Certificado autoassinado para localhost e os IPs da rede (refaz se os IPs mudarem)."""
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.x509.oid import NameOID

    folder.mkdir(parents=True, exist_ok=True)
    cert_path, key_path, meta_path = folder / "stewart.crt", folder / "stewart.key", folder / "stewart.json"
    names = sorted(set(ips) | {"127.0.0.1"})
    if cert_path.is_file() and key_path.is_file() and meta_path.is_file():
        try:
            if json.loads(meta_path.read_text(encoding="utf-8")).get("ips") == names:
                return cert_path, key_path
        except (ValueError, OSError):
            pass
    key = ec.generate_private_key(ec.SECP256R1())
    subject = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Plataforma de Stewart (rede local)")])
    now = datetime.datetime.now(datetime.timezone.utc)
    san = [x509.DNSName("localhost")] + [x509.IPAddress(ipaddress.ip_address(ip)) for ip in names]
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(subject)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - datetime.timedelta(days=1))
        .not_valid_after(now + datetime.timedelta(days=825))
        .add_extension(x509.SubjectAlternativeName(san), critical=False)
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
        .sign(key, hashes.SHA256())
    )
    key_path.write_bytes(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
    cert_path.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    meta_path.write_text(json.dumps({"ips": names}), encoding="utf-8")
    return cert_path, key_path


class LanGuard:
    """PIN da sessão, aparelhos autorizados (um por vez) e bloqueio por tentativas erradas."""

    def __init__(self, enabled: bool):
        self.enabled = enabled
        # "startup": serve.py (start.bat rede); "runtime": ligado pela tela Celular
        self.mode: Optional[str] = "startup" if enabled else None
        self.pin = self.new_pin()
        self.tokens: Set[str] = set()
        self.fails: Dict[str, Tuple[int, float]] = {}
        # token -> {id, ip, agent, since, seen}
        self.devices: Dict[str, dict] = {}
        # IP -> {agent, seen}: abriram a página e ainda não digitaram o PIN
        self.waiting: Dict[str, dict] = {}
        self.server = None
        self.task: Optional[asyncio.Task] = None

    @staticmethod
    def new_pin() -> str:
        return f"{secrets.randbelow(10 ** 6):06d}"

    @staticmethod
    def is_local(request: Request) -> bool:
        host = request.client.host if request.client else ""
        return host in LOOPBACK

    def authorized(self, request: Request) -> bool:
        if not self.enabled or self.is_local(request):
            return True
        tok = request.cookies.get(COOKIE)
        return bool(tok) and tok in self.tokens

    def touch(self, request: Request):
        """Marca o aparelho como visto agora (conectado ou esperando o PIN)."""
        if not self.enabled or self.is_local(request):
            return
        now = time.monotonic()
        ip = request.client.host if request.client else "?"
        tok = request.cookies.get(COOKIE)
        dev = self.devices.get(tok) if tok else None
        if dev:
            dev["seen"] = now
            dev["ip"] = ip
            self.waiting.pop(ip, None)
        else:
            self.waiting[ip] = {"agent": request.headers.get("user-agent", "")[:200], "seen": now}

    def active(self, exclude_ip: Optional[str] = None) -> List[dict]:
        """Aparelhos autorizados que falaram com o backend há pouco."""
        now = time.monotonic()
        return [d for d in self.devices.values() if now - d["seen"] <= ACTIVE_S and d["ip"] != exclude_ip]

    def busy_for(self, request: Request) -> bool:
        """Outro celular já está conectado (e não é este)."""
        if not self.enabled or self.is_local(request) or self.authorized(request):
            return False
        ip = request.client.host if request.client else "?"
        return bool(self.active(exclude_ip=ip))

    def revoke(self, token: str):
        self.tokens.discard(token)
        self.devices.pop(token, None)

    def revoke_id(self, dev_id: str) -> bool:
        for tok, d in list(self.devices.items()):
            if d["id"] == dev_id:
                self.revoke(tok)
                return True
        return False

    def revoke_all(self):
        self.tokens.clear()
        self.devices.clear()
        self.waiting.clear()

    def snapshot(self) -> dict:
        now = time.monotonic()
        devices = [
            {"id": d["id"], "ip": d["ip"], "agent": d["agent"], "since_s": round(now - d["since"]), "seen_s": round(now - d["seen"], 1), "active": now - d["seen"] <= ACTIVE_S}
            for d in self.devices.values()
        ]
        waiting = [{"ip": ip, "agent": w["agent"], "seen_s": round(now - w["seen"], 1)} for ip, w in self.waiting.items() if now - w["seen"] <= ACTIVE_S]
        return {"devices": devices, "waiting": waiting}

    def needs_pin(self, request: Request) -> bool:
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return False
        if request.url.path in OPEN_PATHS:
            return False
        return not self.authorized(request)

    def try_pin(self, ip: str, pin: str, agent: str = "") -> Optional[str]:
        """Token novo se o PIN estiver certo; bloqueia o IP por um minuto após 5 erros.

        Um celular por vez: com outro conectado, recusa (409) até ele desconectar. O mesmo
        aparelho (mesmo IP) entrando de novo troca o token antigo pelo novo.
        """
        now = time.monotonic()
        n, until = self.fails.get(ip, (0, 0.0))
        if until and now < until:
            raise HTTPException(status_code=429, detail="Muitas tentativas erradas. Espere um minuto.")
        if until:
            n = 0
        other = self.active(exclude_ip=ip)
        if other:
            raise HTTPException(
                status_code=409,
                detail=f"Já tem um celular conectado ({other[0]['ip']}). Desconecte ele primeiro: no próprio celular, em Desconectar, ou no PC, na tela Celular.",
            )
        if hmac.compare_digest(pin.strip(), self.pin):
            self.fails.pop(ip, None)
            for old, d in list(self.devices.items()):
                if d["ip"] == ip:
                    self.revoke(old)
            tok = secrets.token_urlsafe(24)
            self.tokens.add(tok)
            self.devices[tok] = {"id": secrets.token_hex(4), "ip": ip, "agent": agent[:200], "since": now, "seen": now}
            self.waiting.pop(ip, None)
            return tok
        n += 1
        self.fails[ip] = (n, now + LOCKOUT_S if n >= MAX_FAILS else 0.0)
        return None

    def urls(self) -> List[dict]:
        out = []
        for ip in local_ips():
            # ligado pela tela Celular, só o HTTPS escuta na rede
            http = f"http://{ip}:{HTTP_PORT}/celular" if self.mode == "startup" else None
            out.append({"ip": ip, "https": f"https://{ip}:{HTTPS_PORT}/celular", "http": http})
        return out

    async def start_server(self, app) -> None:
        """Liga o modo rede sem reiniciar: HTTPS em 0.0.0.0:HTTPS_PORT no mesmo processo."""
        if self.enabled:
            return
        import uvicorn

        class _Server(uvicorn.Server):
            # quem cuida do Ctrl+C é o servidor principal
            def install_signal_handlers(self) -> None:
                pass

        ips = local_ips()
        if not ips:
            raise HTTPException(status_code=409, detail="Este PC não está em nenhuma rede. Conecte no Wi-Fi e tente de novo.")
        cert, key = ensure_certificate(ips)
        # o socket é aberto aqui: porta ocupada vira erro da rota, não derruba o processo
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            sock.bind(("0.0.0.0", HTTPS_PORT))
            sock.listen(128)
        except OSError as exc:
            sock.close()
            raise HTTPException(status_code=409, detail=f"A porta {HTTPS_PORT} já está em uso neste PC ({exc.strerror or exc}).")
        sock.setblocking(False)
        config = uvicorn.Config(app, ssl_certfile=str(cert), ssl_keyfile=str(key), lifespan="off", log_level="info")
        self.server = _Server(config)
        self.pin = self.new_pin()
        self.revoke_all()
        self.fails.clear()
        self.enabled, self.mode = True, "runtime"
        self.task = asyncio.create_task(self.server.serve(sockets=[sock]))
        for _ in range(50):
            if self.server.started or self.task.done():
                break
            await asyncio.sleep(0.05)
        if self.task.done() and not self.server.started:
            self.enabled, self.mode, self.server, self.task = False, None, None, None
            raise HTTPException(status_code=500, detail="O servidor da rede não subiu. Veja o terminal do backend.")

    async def stop_server(self) -> None:
        """Desliga o que a tela Celular ligou (o modo do start.bat rede fica)."""
        if self.mode != "runtime":
            return
        self.enabled, self.mode = False, None
        self.revoke_all()
        server, task = self.server, self.task
        self.server, self.task = None, None
        if server:
            server.should_exit = True
        if task:
            try:
                await asyncio.wait_for(task, timeout=5)
            except Exception:
                pass


class PinRequest(BaseModel):
    pin: str = Field(..., min_length=1, max_length=12)


def install(app, guard: LanGuard):
    """Middleware do PIN e as rotas /lan/*."""

    @app.middleware("http")
    async def lan_pin(request: Request, call_next):
        if guard.enabled:
            guard.touch(request)
            if guard.needs_pin(request):
                return JSONResponse(status_code=401, content={"detail": "PIN necessário: digite o PIN que aparece na interface do PC."})
        return await call_next(request)

    def only_pc(request: Request):
        if not guard.is_local(request):
            raise HTTPException(status_code=403, detail="Só no PC da bancada.")

    router = APIRouter(prefix="/lan", tags=["rede local"])

    @router.get("/status")
    def lan_status(request: Request):
        """O que o aparelho precisa saber: modo rede, se é o próprio PC, se já tem PIN e se outro celular ocupa a vez."""
        return {"lan": guard.enabled, "local": guard.is_local(request), "authorized": guard.authorized(request), "busy": guard.busy_for(request)}

    @router.get("/info")
    def lan_info(request: Request):
        """Endereços para o celular, o PIN e os aparelhos conectados. Só o próprio PC vê."""
        only_pc(request)
        base = {"lan": guard.enabled, "mode": guard.mode, "https_port": HTTPS_PORT}
        if not guard.enabled:
            return {**base, "pin": None, "urls": [], "devices": [], "waiting": []}
        return {**base, "pin": guard.pin, "urls": guard.urls(), **guard.snapshot()}

    @router.post("/start")
    async def lan_start(request: Request):
        """Liga o modo rede daqui do PC, sem reiniciar o backend."""
        only_pc(request)
        await guard.start_server(app)
        return lan_info(request)

    @router.post("/stop")
    async def lan_stop(request: Request):
        only_pc(request)
        if guard.mode == "startup":
            raise HTTPException(status_code=409, detail="O modo rede foi ligado pelo start.bat rede. Para desligar, feche o backend e abra com start.bat.")
        await guard.stop_server()
        return lan_info(request)

    @router.post("/pin")
    def lan_new_pin(request: Request):
        """Gera outro PIN (os celulares já conectados continuam)."""
        only_pc(request)
        guard.pin = guard.new_pin()
        return lan_info(request)

    @router.delete("/devices/{dev_id}")
    def lan_kick(dev_id: str, request: Request):
        """Desconecta um celular: ele volta a só acompanhar até digitar o PIN de novo."""
        only_pc(request)
        if not guard.revoke_id(dev_id):
            raise HTTPException(status_code=404, detail="Esse aparelho já saiu.")
        return lan_info(request)

    @router.post("/auth")
    def lan_auth(req: PinRequest, request: Request, response: Response):
        if not guard.enabled:
            return {"ok": True}
        ip = request.client.host if request.client else "?"
        tok = guard.try_pin(ip, req.pin, request.headers.get("user-agent", ""))
        if not tok:
            raise HTTPException(status_code=401, detail="PIN errado.")
        response.set_cookie(COOKIE, tok, httponly=True, samesite="strict", secure=request.url.scheme == "https", max_age=12 * 3600)
        return {"ok": True}

    @router.post("/logout")
    def lan_logout(request: Request, response: Response):
        """O celular sai: libera a vez para outro aparelho."""
        tok = request.cookies.get(COOKIE)
        if tok:
            guard.revoke(tok)
        response.delete_cookie(COOKIE)
        return {"ok": True}

    app.include_router(router)
