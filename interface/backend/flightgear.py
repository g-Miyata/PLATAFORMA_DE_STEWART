"""FlightGear como "tela" das páginas Simulador de voo e Orientação do avião.

O backend abre o FlightGear sem física (fdm=null) com o ERJ145 na pintura do IFSP,
e o motor de cueing (cueing.py) manda a posição do voo gravado por UDP a cada
frame: o avião na tela e a plataforma andam juntos, com o backend como relógio.
A imagem volta para a página pelo MJPEG do servidor HTTP do FlightGear
(/screenshot?stream=y), repassado em /fg/stream.

Antes de abrir, check() confere cada pré-requisito e devolve o que falta com a
correção, em vez de deixar o FlightGear falhar com uma caixa de diálogo.
"""
from __future__ import annotations

import atexit
import ctypes
import os
import re
import shutil
import socket
import subprocess
import sys
import threading
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

AIRCRAFT = "erj145"
AIRCRAFT_FOLDER = "Embraer-ERJ-145"
LIVERY_NAME = "Instituto Federal"
LIVERY_XML = "ifsp.xml"
LIVERY_PNG = "ifsp-flightgear-livery.png"
HTTP_PORT = int(os.getenv("FG_HTTP_PORT", "8080"))
VISUAL_PORT = int(os.getenv("FG_VISUAL_PORT", "5511"))
CHASE_VIEW = 2
MIN_FREE_MB = 4000
# sem resposta do servidor HTTP nesse tempo = travado (diálogo de erro aberto, por exemplo)
STUCK_S = 120.0

SIM_DIR = Path(__file__).resolve().parent.parent / "simulation"
ASSETS_DIR = SIM_DIR / "assets"
EXTRA_DATA_DIR = SIM_DIR / "fgdata"
SETUP_DOC = "FLIGHTGEAR-SETUP.md"


@dataclass
class CheckItem:
    id: str
    label: str
    ok: bool
    detail: str
    fix: str = ""
    severity: str = "error"  # error: impede abrir; warning: abre mesmo assim


# -------------------- localizar instalação --------------------
def _registry_installs() -> List[Dict[str, str]]:
    if sys.platform != "win32":
        return []
    import winreg

    found = []
    keys = [
        (winreg.HKEY_LOCAL_MACHINE, r"Software\Microsoft\Windows\CurrentVersion\Uninstall"),
        (winreg.HKEY_LOCAL_MACHINE, r"Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"),
        (winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Uninstall"),
    ]
    for hive, path in keys:
        try:
            root = winreg.OpenKey(hive, path)
        except OSError:
            continue
        for i in range(winreg.QueryInfoKey(root)[0]):
            try:
                sub = winreg.OpenKey(root, winreg.EnumKey(root, i))
                name = winreg.QueryValueEx(sub, "DisplayName")[0]
                if "flightgear" not in str(name).lower():
                    continue
                loc = winreg.QueryValueEx(sub, "InstallLocation")[0]
                try:
                    ver = winreg.QueryValueEx(sub, "DisplayVersion")[0]
                except OSError:
                    ver = ""
                found.append({"location": loc, "version": ver})
            except OSError:
                continue
    return found


def find_fgfs() -> Optional[Path]:
    env = os.getenv("FGFS")
    if env:
        return Path(env) if Path(env).is_file() else None
    exe = "fgfs.exe" if sys.platform == "win32" else "fgfs"
    candidates = [Path(r["location"]) / "bin" / exe for r in _registry_installs() if r["location"]]
    for base in (os.getenv("ProgramFiles"), os.getenv("ProgramFiles(x86)")):
        if base:
            candidates += sorted(Path(base).glob(f"FlightGear*/bin/{exe}"), reverse=True)
    which = shutil.which("fgfs")
    if which:
        candidates.append(Path(which))
    return next((c for c in candidates if c.is_file()), None)


def fgfs_version(fgfs: Path) -> Optional[str]:
    """Versão maior.menor ("2024.1") pelo nome da pasta ou pelo registro."""
    m = re.search(r"(\d{4}\.\d+)", str(fgfs))
    if m:
        return m.group(1)
    for r in _registry_installs():
        if r["location"] and Path(r["location"]) in fgfs.parents and r["version"]:
            m = re.match(r"(\d{4}\.\d+)", r["version"])
            if m:
                return m.group(1)
    return None


def _fgdata_version(root: Path) -> Optional[str]:
    try:
        return (root / "version").read_text(encoding="utf-8").strip()
    except OSError:
        return None


def find_fgroot(version: Optional[str], fgfs: Optional[Path] = None) -> Optional[Path]:
    candidates: List[Path] = []
    if os.getenv("FG_ROOT"):
        candidates.append(Path(os.environ["FG_ROOT"]))
    home = Path.home() / "FlightGear"
    candidates += sorted(home.glob("fgdata*"), reverse=True)
    candidates += sorted((home / "Downloads").glob("fgdata*"), reverse=True)
    if fgfs:
        candidates.append(fgfs.parent.parent / "data")
    valid = [c for c in candidates if _fgdata_version(c)]
    if version:
        match = [c for c in valid if _fgdata_version(c).startswith(version)]
        if match:
            return match[0]
    return valid[0] if valid else None


def find_aircraft() -> Optional[Path]:
    roots: List[Path] = []
    for part in (os.getenv("FG_AIRCRAFT") or "").split(os.pathsep):
        if part:
            roots.append(Path(part))
    home = Path.home() / "FlightGear"
    roots += sorted((home / "Downloads" / "Aircraft").glob("*/Aircraft"), reverse=True)
    roots.append(home / "Custom Aircraft")
    for root in roots:
        for cand in (root / AIRCRAFT_FOLDER, root):
            if (cand / f"{AIRCRAFT}-set.xml").is_file():
                return cand
        if root.is_dir():
            for sub in root.iterdir():
                if (sub / f"{AIRCRAFT}-set.xml").is_file():
                    return sub
    return None


def install_livery(aircraft_dir: Path, assets: Path = ASSETS_DIR) -> bool:
    """Copia a pintura do IFSP para o avião (se faltar ou mudou). Devolve True se copiou."""
    liveries = aircraft_dir / "Models" / "Liveries"
    pairs = [(assets / LIVERY_XML, liveries / LIVERY_XML), (assets / LIVERY_PNG, liveries / "2048x2048" / LIVERY_PNG)]
    changed = False
    for src, dst in pairs:
        if dst.is_file() and dst.read_bytes() == src.read_bytes():
            continue
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, dst)
        changed = True
    return changed


def livery_installed(aircraft_dir: Path, assets: Path = ASSETS_DIR) -> bool:
    liveries = aircraft_dir / "Models" / "Liveries"
    try:
        return (liveries / LIVERY_XML).read_bytes() == (assets / LIVERY_XML).read_bytes() and \
            (liveries / "2048x2048" / LIVERY_PNG).read_bytes() == (assets / LIVERY_PNG).read_bytes()
    except OSError:
        return False


def tcp_port_free(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("127.0.0.1", port)) != 0


def udp_port_free(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        try:
            s.bind(("127.0.0.1", port))
            return True
        except OSError:
            return False


def free_commit_mb() -> Optional[float]:
    """Memória virtual livre (o FlightGear cai quando ela acaba). Só no Windows."""
    if sys.platform != "win32":
        return None

    class MEMORYSTATUSEX(ctypes.Structure):
        _fields_ = [("dwLength", ctypes.c_ulong), ("dwMemoryLoad", ctypes.c_ulong),
                    ("ullTotalPhys", ctypes.c_ulonglong), ("ullAvailPhys", ctypes.c_ulonglong),
                    ("ullTotalPageFile", ctypes.c_ulonglong), ("ullAvailPageFile", ctypes.c_ulonglong),
                    ("ullTotalVirtual", ctypes.c_ulonglong), ("ullAvailVirtual", ctypes.c_ulonglong),
                    ("ullAvailExtendedVirtual", ctypes.c_ulonglong)]

    st = MEMORYSTATUSEX()
    st.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
    if not ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(st)):
        return None
    return st.ullAvailPageFile / 1024 / 1024


def fg_log_path() -> Path:
    if sys.platform == "win32":
        return Path(os.getenv("APPDATA", Path.home())) / "flightgear.org" / "fgfs.log"
    return Path.home() / ".fgfs" / "fgfs.log"


_NOISE = re.compile(r"subsystem_mgr|terrasync|shader|effect|material|sound|texture|Unbind of|Shutdown of|file not handled|\[WARN\]:osg", re.I)


def log_problems(path: Optional[Path] = None, n: int = 8) -> List[str]:
    """Últimas linhas de alerta do log do FlightGear, sem o ruído do desligamento."""
    try:
        lines = (path or fg_log_path()).read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        return []
    out = []
    for line in lines:
        # só alertas e erros fatais: os [WARN] são quase sempre rede (TerraSync sem internet) ou modelos
        if ("[ALRT]" in line or "Fatal" in line or "xception" in line) and not _NOISE.search(line):
            # tira o caminho do arquivo-fonte do FlightGear, que só polui
            out.append(re.sub(r"\s+\S+\.(?:cxx|cpp|hxx):\d+:", "", line).strip())
    return out[-n:]


# -------------------- gerenciador --------------------
class StartRequest(BaseModel):
    flight: Optional[str] = None


class FlightGearManager:
    def __init__(self, *, flight_start: Callable[[Optional[str]], Optional[Dict[str, float]]] = lambda _id: None):
        self.flight_start = flight_start
        self.proc: Optional[subprocess.Popen] = None
        self.started_at = 0.0
        self.stopping = False
        self.lock = threading.Lock()
        self.last_error: Optional[Dict[str, Any]] = None
        self.view_set = False
        self._http = httpx.Client(timeout=1.0)
        # backend fechando não deixa um FlightGear órfão segurando as portas
        atexit.register(self._kill_on_exit)

    def _kill_on_exit(self):
        try:
            if self.running():
                self.proc.kill()
        except Exception:
            pass

    # ---- pré-requisitos ----
    def check(self, fix: bool = False) -> Dict[str, Any]:
        items: List[CheckItem] = []
        paths: Dict[str, Optional[str]] = {}
        doc = f"Veja o passo a passo em {SETUP_DOC}."

        fgfs = find_fgfs()
        version = fgfs_version(fgfs) if fgfs else None
        paths["fgfs"] = str(fgfs) if fgfs else None
        items.append(CheckItem(
            "fgfs", "FlightGear instalado", bool(fgfs),
            f"{fgfs} (versão {version or '?'})" if fgfs else "fgfs não encontrado.",
            "" if fgfs else f"Instale com: winget install FlightGear.FlightGear (ou defina FGFS com o caminho do fgfs). {doc}"))

        root = find_fgroot(version, fgfs)
        root_ver = _fgdata_version(root) if root else None
        compatible = bool(root and (not version or root_ver.startswith(version)))
        paths["fg_root"] = str(root) if root else None
        items.append(CheckItem(
            "fgdata", "Dados base (FGData)", compatible,
            f"{root} (versão {root_ver})" if root else "FGData não encontrado.",
            "" if compatible else (
                f"FGData {root_ver} não combina com o FlightGear {version}. Baixe o FGData {version}." if root
                else f"Baixe o FlightGear-{version or '2024.1'}.x-data.txz e extraia em %USERPROFILE%\\FlightGear, ou defina FG_ROOT. {doc}")))

        ac = find_aircraft()
        paths["aircraft_dir"] = str(ac) if ac else None
        items.append(CheckItem(
            "aircraft", "Avião Embraer ERJ145", bool(ac),
            str(ac) if ac else "erj145-set.xml não encontrado.",
            "" if ac else f"No launcher do FlightGear: aba Aircraft, busque \"ERJ\" e instale o Embraer ERJ 145 (ou extraia em %USERPROFILE%\\FlightGear\\Custom Aircraft). {doc}"))

        if ac:
            if fix and not livery_installed(ac):
                try:
                    install_livery(ac)
                except OSError as exc:
                    items.append(CheckItem("livery", "Pintura do IFSP", False, f"Não foi possível copiar: {exc}",
                                           f"Copie assets/{LIVERY_XML} e {LIVERY_PNG} para {ac}\\Models\\Liveries manualmente."))
            if not any(i.id == "livery" for i in items):
                ok = livery_installed(ac)
                items.append(CheckItem("livery", "Pintura do IFSP", ok,
                                       "Instalada no ERJ145." if ok else "Ainda não copiada para o avião.",
                                       "" if ok else "Será copiada automaticamente ao rodar.", severity="warning"))

        protos = [EXTRA_DATA_DIR / "Protocol" / f for f in ("stewart-visual.xml", "stewart-cueing.xml")]
        missing = [p.name for p in protos if not p.is_file()]
        items.append(CheckItem("protocols", "Protocolos UDP", not missing,
                               "Presentes em interface/simulation/fgdata/Protocol." if not missing else f"Faltando: {', '.join(missing)}",
                               "" if not missing else "Restaure a pasta interface/simulation/fgdata do repositório."))

        ours = self.running()
        http_free = ours or tcp_port_free(HTTP_PORT)
        udp_free = ours or udp_port_free(VISUAL_PORT)
        items.append(CheckItem(
            "ports", "Portas livres", http_free and udp_free,
            f"TCP {HTTP_PORT} e UDP {VISUAL_PORT} disponíveis." if http_free and udp_free
            else f"Em uso: {', '.join(p for p, ok in ((f'TCP {HTTP_PORT}', http_free), (f'UDP {VISUAL_PORT}', udp_free)) if not ok)}.",
            "" if http_free and udp_free else "Feche o outro FlightGear aberto (ou o programa usando a porta) e tente de novo."))

        free = free_commit_mb()
        if free is not None:
            ok = free >= MIN_FREE_MB
            items.append(CheckItem("memory", "Memória livre", ok, f"{free:,.0f} MB de memória virtual livre.".replace(",", "."),
                                   "" if ok else "O FlightGear precisa de ~4 GB e pode fechar sozinho. Feche programas pesados (Blender, navegadores).",
                                   severity="warning"))

        ready = all(i.ok for i in items if i.severity == "error")
        return {"ok": ready, "items": [asdict(i) for i in items], "paths": paths}

    # ---- linha de comando ----
    @staticmethod
    def build_command(paths: Dict[str, Optional[str]], start: Optional[Dict[str, float]] = None) -> List[str]:
        start = start or {"lat": -23.4323, "lon": -46.4695, "alt": 3000.0, "heading": 270.0}
        cmd = [
            paths["fgfs"],
            f"--fg-root={paths['fg_root']}",
            f"--data={EXTRA_DATA_DIR}",
            f"--aircraft-dir={paths['aircraft_dir']}",
            f"--aircraft={AIRCRAFT}",
            f"--prop:/sim/model/livery/name={LIVERY_NAME}",
            f"--prop:/sim/current-view/view-number={CHASE_VIEW}",
            "--fdm=null",
            f"--generic=socket,in,60,127.0.0.1,{VISUAL_PORT},udp,stewart-visual",
            f"--httpd={HTTP_PORT}",
            f"--lat={start['lat']:.6f}",
            f"--lon={start['lon']:.6f}",
            f"--altitude={max(start['alt'], 0):.0f}",
            f"--heading={start['heading'] % 360:.1f}",
            "--timeofday=noon",
            "--geometry=1280x720",
            "--disable-ai-traffic",
            "--disable-random-objects",
            "--disable-random-vegetation",
            "--disable-random-buildings",
            "--disable-freeze",
        ]
        return cmd

    # ---- processo ----
    def running(self) -> bool:
        return self.proc is not None and self.proc.poll() is None

    def launch(self, flight: Optional[str] = None) -> Dict[str, Any]:
        with self.lock:
            if self.running():
                return self.status()
            result = self.check(fix=True)
            if not result["ok"]:
                raise RuntimeError("Faltam pré-requisitos para abrir o FlightGear.")
            cmd = self.build_command(result["paths"], self.flight_start(flight))
            flags = subprocess.CREATE_NEW_PROCESS_GROUP if sys.platform == "win32" else 0
            self.proc = subprocess.Popen(cmd, cwd=str(Path(cmd[0]).parent), stdout=subprocess.DEVNULL,
                                         stderr=subprocess.DEVNULL, creationflags=flags)
            self.started_at = time.monotonic()
            self.stopping = False
            self.last_error = None
            self.view_set = False
            return self.status()

    def stop(self) -> Dict[str, Any]:
        with self.lock:
            proc = self.proc
            self.stopping = True
        if proc and proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=8)
            except subprocess.TimeoutExpired:
                proc.kill()
        with self.lock:
            self.proc = None
            self.last_error = None
        return self.status()

    def _set_prop(self, path: str, value) -> bool:
        parts = path.strip("/").split("/")
        body: Dict[str, Any] = {"name": parts[-1], "value": value}
        for name in reversed(parts[:-1]):
            body = {"name": name, "children": [body]}
        try:
            return self._http.post(f"http://127.0.0.1:{HTTP_PORT}/json/", json={"children": [body]}).status_code == 200
        except httpx.HTTPError:
            return False

    def _prop(self, path: str):
        try:
            r = self._http.get(f"http://127.0.0.1:{HTTP_PORT}/json{path}")
            return r.json().get("value") if r.status_code == 200 else None
        except (httpx.HTTPError, ValueError):
            return None

    def status(self) -> Dict[str, Any]:
        proc = self.proc
        if proc is None:
            # caiu sozinho: continua "crashed" (com o motivo) até fechar ou rodar de novo
            return {"state": "crashed" if self.last_error else "stopped", "error": self.last_error}
        code = proc.poll()
        uptime = time.monotonic() - self.started_at
        if code is not None:
            if not self.stopping and self.last_error is None:
                self.last_error = {
                    "message": f"O FlightGear fechou sozinho (código {code}) depois de {uptime:.0f} s.",
                    "log": log_problems(),
                    "hint": "Se foi por falta de memória, feche programas pesados. Veja também o log em " + str(fg_log_path()),
                }
            self.proc = None
            return {"state": "crashed" if not self.stopping else "stopped", "error": self.last_error}
        loaded = self._prop("/sim/sceneryloaded")
        if loaded is None:
            if uptime > STUCK_S:
                return {"state": "stuck", "pid": proc.pid, "uptime": uptime, "error": {
                    "message": "O FlightGear está aberto mas não responde. Provavelmente mostrou uma mensagem de erro na janela dele.",
                    "log": log_problems(), "hint": "Leia a mensagem na janela do FlightGear, feche e tente de novo."}}
            return {"state": "starting", "pid": proc.pid, "uptime": uptime}
        if loaded and not self.view_set:
            # o ERJ145 volta para a cabine ao iniciar: terceira pessoa depois do carregamento
            self.view_set = self._set_prop("/sim/current-view/view-number", CHASE_VIEW)
        return {"state": "ready" if loaded else "loading", "pid": proc.pid, "uptime": uptime}

    def ready(self) -> bool:
        return self.running() and bool(self._prop("/sim/sceneryloaded"))


def create_router(manager: FlightGearManager) -> APIRouter:
    router = APIRouter(prefix="/fg", tags=["flightgear"])

    @router.get("/check")
    def fg_check():
        return manager.check(fix=False)

    @router.get("/status")
    def fg_status():
        return manager.status()

    @router.post("/launch")
    def fg_launch(req: StartRequest):
        try:
            return manager.launch(req.flight)
        except RuntimeError as exc:
            raise HTTPException(status_code=409, detail={"message": str(exc), "check": manager.check()})
        except OSError as exc:
            raise HTTPException(status_code=500, detail={"message": f"Não foi possível abrir o FlightGear: {exc}"})

    @router.post("/stop")
    def fg_stop():
        return manager.stop()

    @router.get("/stream")
    def fg_stream():
        """MJPEG do FlightGear repassado na mesma origem da página."""
        if not manager.ready():
            raise HTTPException(status_code=503, detail="FlightGear não está pronto.")
        client = httpx.Client(timeout=httpx.Timeout(10.0, read=None))
        try:
            upstream = client.send(
                client.build_request("GET", f"http://127.0.0.1:{HTTP_PORT}/screenshot", params={"type": "jpg", "stream": "y"}),
                stream=True)
        except httpx.HTTPError as exc:
            client.close()
            raise HTTPException(status_code=502, detail=f"Sem imagem do FlightGear: {exc}")

        def body():
            try:
                yield from upstream.iter_raw()
            except httpx.HTTPError:
                return
            finally:
                upstream.close()
                client.close()

        return StreamingResponse(body(), media_type=upstream.headers.get("content-type", "multipart/x-mixed-replace"),
                                 headers={"Cache-Control": "no-store"})

    return router
