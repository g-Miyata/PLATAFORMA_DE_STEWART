"""Acesso pela rede local (celular no mesmo Wi-Fi).

Com STEWART_LAN=1 (start.bat rede), serve.py sobe o backend em 0.0.0.0, em HTTP (8001)
e HTTPS (8443). O HTTPS usa um certificado autoassinado gerado aqui na primeira vez: o
celular mostra um aviso uma vez, e depois o giroscópio funciona (DeviceOrientation só
existe em HTTPS).

Qualquer aparelho no Wi-Fi alcança a porta, então comandos que vêm de fora do PC
precisam de um PIN de 6 dígitos (mostrado na interface do PC). O próprio PC nunca pede
PIN, e a parada de emergência funciona sem PIN em qualquer aparelho.
"""
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
OPEN_PATHS = {"/lan/auth", "/emergency-stop"}
MAX_FAILS = 5
LOCKOUT_S = 60.0


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
    """PIN da sessão, tokens dos aparelhos autorizados e bloqueio por tentativas erradas."""

    def __init__(self, enabled: bool):
        self.enabled = enabled
        self.pin = f"{secrets.randbelow(10 ** 6):06d}"
        self.tokens: Set[str] = set()
        self.fails: Dict[str, Tuple[int, float]] = {}

    @staticmethod
    def is_local(request: Request) -> bool:
        host = request.client.host if request.client else ""
        return host in LOOPBACK

    def authorized(self, request: Request) -> bool:
        if not self.enabled or self.is_local(request):
            return True
        tok = request.cookies.get(COOKIE)
        return bool(tok) and tok in self.tokens

    def needs_pin(self, request: Request) -> bool:
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return False
        if request.url.path in OPEN_PATHS:
            return False
        return not self.authorized(request)

    def try_pin(self, ip: str, pin: str) -> Optional[str]:
        """Token novo se o PIN estiver certo; bloqueia o IP por um minuto após 5 erros."""
        now = time.monotonic()
        n, until = self.fails.get(ip, (0, 0.0))
        if until and now < until:
            raise HTTPException(status_code=429, detail="Muitas tentativas erradas. Espere um minuto.")
        if until:
            n = 0
        if hmac.compare_digest(pin.strip(), self.pin):
            self.fails.pop(ip, None)
            tok = secrets.token_urlsafe(24)
            self.tokens.add(tok)
            return tok
        n += 1
        self.fails[ip] = (n, now + LOCKOUT_S if n >= MAX_FAILS else 0.0)
        return None

    def urls(self) -> List[dict]:
        out = []
        for ip in local_ips():
            out.append({"ip": ip, "https": f"https://{ip}:{HTTPS_PORT}/celular", "http": f"http://{ip}:{HTTP_PORT}/celular"})
        return out


class PinRequest(BaseModel):
    pin: str = Field(..., min_length=1, max_length=12)


def install(app, guard: LanGuard):
    """Middleware do PIN e as rotas /lan/*."""

    @app.middleware("http")
    async def lan_pin(request: Request, call_next):
        if guard.enabled and guard.needs_pin(request):
            return JSONResponse(status_code=401, content={"detail": "PIN necessário: digite o PIN que aparece na interface do PC."})
        return await call_next(request)

    router = APIRouter(prefix="/lan", tags=["rede local"])

    @router.get("/status")
    def lan_status(request: Request):
        """O que o aparelho precisa saber: modo rede, se é o próprio PC e se já tem PIN."""
        return {"lan": guard.enabled, "local": guard.is_local(request), "authorized": guard.authorized(request)}

    @router.get("/info")
    def lan_info(request: Request):
        """Endereços para o celular e o PIN. Só o próprio PC vê."""
        if not guard.is_local(request):
            raise HTTPException(status_code=403, detail="Só no PC da bancada.")
        return {"lan": guard.enabled, "pin": guard.pin if guard.enabled else None, "urls": guard.urls() if guard.enabled else [], "https_port": HTTPS_PORT}

    @router.post("/auth")
    def lan_auth(req: PinRequest, request: Request, response: Response):
        if not guard.enabled:
            return {"ok": True}
        ip = request.client.host if request.client else "?"
        tok = guard.try_pin(ip, req.pin)
        if not tok:
            raise HTTPException(status_code=401, detail="PIN errado.")
        response.set_cookie(COOKIE, tok, httponly=True, samesite="strict", secure=request.url.scheme == "https", max_age=12 * 3600)
        return {"ok": True}

    app.include_router(router)
