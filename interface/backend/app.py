# server_serial_steweart.py
# FastAPI + Serial + WebSocket de telemetria com reconstrução de pose (LSQ)

import os
import re
import sys
import threading
import time
import json
from datetime import datetime
import asyncio

# Os logs usam emoji; sem isto o backend cai ao iniciar quando a saída não é um
# console (pipe, arquivo de log, serviço), pois o Windows usa cp1252 nesse caso.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass
from contextlib import asynccontextmanager
from pathlib import Path
from typing import List, Optional, Dict, Any, Tuple
from math import sin, cos, tau

import numpy as np
from scipy.spatial.transform import Rotation as R
from scipy.optimize import least_squares
import serial
import serial.tools.list_ports

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import sim_fit
from simulated_device import PARAMS_FILE as SIM_PARAMS_FILE, SIM_PORT_NAME, SimulatedSerial, load_params
from twin import TwinShadow
from calibration import CalibrationRunner

# -------------------- Config API --------------------
API_TITLE = "Stewart Platform API + Serial + WS"
API_VERSION = "1.2.0"

# Origens liberadas: o próprio backend (que serve o frontend), o dev server do
# Vite e o http.server legado. "null" cobre o frontend antigo aberto via file://
# e deve sair quando interface/frontend for removido.
CORS_ORIGINS = [
    "http://localhost:8001", "http://127.0.0.1:8001",
    "http://localhost:5173", "http://127.0.0.1:5173",
    "http://localhost:8080", "http://127.0.0.1:8080",
    "null",
]

# Geometria/limites da bancada (fonte única de verdade para backend e frontend)
STROKE_MIN_MM = 500.0
STROKE_MAX_MM = 680.0
# Altura de repouso: meio da faixa válida com a plataforma nivelada (433..631 mm),
# o que deixa ~90 mm de curso para cada lado em todos os atuadores.
HOME_Z_MM = 530.0

BACKEND_DIR = Path(__file__).resolve().parent
WEB_DIST_DIR = BACKEND_DIR.parent / "web" / "dist"
LEGACY_FRONTEND_DIR = BACKEND_DIR.parent / "frontend"


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Entrega o event loop ao SerialManager (a thread serial publica no WS por ele)."""
    serial_mgr.set_event_loop(asyncio.get_running_loop())
    print("✅ FastAPI startup: event loop configurado")
    yield
    serial_mgr.close()


app = FastAPI(title=API_TITLE, version=API_VERSION, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

BAUD = 115200
CSV_DELIM = ';'

FLIGHT_SIMULATION_STATE = {
    "enabled": False,
    "safe_z": 540.0,
    "started_at": None,
    "last_preview": None,
}

# -------------------- Modelos --------------------
class PoseInput(BaseModel):
    x: float = 0
    y: float = 0
    z: Optional[float] = None
    roll: float = 0
    pitch: float = 0
    yaw: float = 0

class ActuatorData(BaseModel):
    id: int
    length: float
    percentage: float
    valid: bool

class PlatformResponse(BaseModel):
    pose: PoseInput
    actuators: List[ActuatorData]
    valid: bool
    base_points: List[List[float]]
    platform_points: List[List[float]]

class PlatformConfig(BaseModel):
    h0: float = Field(..., gt=0, le=1000)
    stroke_min: float = Field(..., gt=0, le=2000)
    stroke_max: float = Field(..., gt=0, le=2000)

class PlatformGeometry(PlatformConfig):
    """Tudo o que o frontend precisa para desenhar e validar a plataforma."""
    home_z: float
    base_points: List[List[float]]
    platform_points_local: List[List[float]]

class SerialOpenRequest(BaseModel):
    port: str
    baud: Optional[int] = BAUD

class ApplyPoseRequest(PoseInput):
    pass

class PIDCommand(BaseModel):
    command: str

class PIDGains(BaseModel):
    piston: int  # 1-6
    kp: Optional[float] = None
    ki: Optional[float] = None
    kd: Optional[float] = None

class PIDSetpoint(BaseModel):
    piston: Optional[int] = None  # None = all
    value: float

class PIDFeedforward(BaseModel):
    piston: int  # 1-6
    u0_adv: Optional[float] = None
    u0_ret: Optional[float] = None

class PIDSettings(BaseModel):
    dbmm: Optional[float] = None
    minpwm: Optional[int] = None

class MotionRequest(BaseModel):
    routine: str  # "sine_axis", "circle_xy", "helix", "heave_pitch"
    duration_s: float = Field(60.0, gt=0, le=3600)
    hz: float = Field(0.2, gt=0, le=2.0)
    axis: Optional[str] = None  # Para sine_axis: x|y|z|roll|pitch|yaw
    amp: Optional[float] = None
    offset: Optional[float] = None
    ax: Optional[float] = None
    ay: Optional[float] = None
    phx: Optional[float] = None  # Fase em graus
    z_amp_mm: Optional[float] = None  # Amplitude em Z para helix (mm)
    z_cycles: Optional[float] = None  # Número de ciclos completos em Z durante uma volta no círculo XY

class TrajectorySample(BaseModel):
    t: float = Field(..., ge=0)
    x: float = 0
    y: float = 0
    z: float
    roll: float = 0
    pitch: float = 0
    yaw: float = 0

class TrajectoryRequest(BaseModel):
    """Trajetória arbitrária (gravação, linha do tempo ou programa em blocos)."""
    samples: List[TrajectorySample] = Field(..., min_length=2, max_length=72_000)
    loop: bool = False
    speed: float = Field(1.0, ge=0.25, le=2.0)
    name: str = Field("trajetória", max_length=80)

class JoystickPoseRequest(BaseModel):
    """Modelo para controle por joystick (gamepad)"""
    lx: float = Field(0.0, ge=-1.0, le=1.0)  # left stick X, -1..1
    ly: float = Field(0.0, ge=-1.0, le=1.0)  # left stick Y, -1..1
    rx: float = Field(0.0, ge=-1.0, le=1.0)  # right stick X, -1..1
    ry: float = Field(0.0, ge=-1.0, le=1.0)  # right stick Y, -1..1
    lt: Optional[float] = Field(None, ge=-1.0, le=1.0)  # left trigger
    rt: Optional[float] = Field(None, ge=-1.0, le=1.0)  # right trigger
    apply: bool = False  # Se True, envia comando serial para ESP32
    z_base: Optional[float] = None  # Z base (default = platform.h0)

# -------------------- Stewart Platform --------------------
class StewartPlatform:
    def __init__(self, h0=HOME_Z_MM, stroke_min=STROKE_MIN_MM, stroke_max=STROKE_MAX_MM):
        self.h0 = h0
        self.stroke_min = stroke_min
        self.stroke_max = stroke_max

        self.B = np.array([
            [305.5, -17, 0],
            [305.5,  17, 0],
            [-137.7, 273.23, 0],
            [-168,   255.7, 0],
            [-167.2, -256.2, 0],
            [-136.8, -273.6, 0],
        ])
        self.P0 = np.array([
            [191.1, -241.5, 0],
            [191.1,  241.5, 0],
            [113.6,  286.2, 0],
            [-304.7,  44.8, 0],
            [-304.7, -44.8, 0],
            [113.1, -286.4, 0],
        ])

    def inverse_kinematics(self, x=0, y=0, z=None, roll=0, pitch=0, yaw=0):
        # Define altura padrão se 'z' não for passado
        if z is None:
            z = self.h0
        # -------------------------------
        # ℙ (𝑝) → Vetor de posição do centro da plataforma móvel
        # Este é o termo "p" da equação:  s_i = p + R b_i - a_i
        # -------------------------------
        T = np.array([x, y, z])
        # -------------------------------
        # ℛ (R) → Matriz de rotação da plataforma (orientação)
        # Constrói a matriz R da equação usando ângulos ZYX (yaw → pitch → roll)
        # -------------------------------
        Rm = R.from_euler('ZYX', [yaw, pitch, roll], degrees=True).as_matrix()
        # -------------------------------
        # 𝑅 b_i  → Aplica rotação aos pontos da plataforma móvel
        # self.P0 são os b_i (pontos da plataforma móvel no referencial local)
        #
        # P = p + R b_i   → parte da fórmula s_i = p + R b_i - a_i
        #
        # Resultado: coordenadas dos 6 pontos móveis no referencial da base
        # -------------------------------
        P = (self.P0 @ Rm.T) + T
        # -------------------------------
        #  s_i = P_i - a_i
        #
        # self.B são os a_i (pontos de fixação na base)
        # Logo:
        #       Lvec[i] = (p + R b_i) - a_i
        #
        # Lvec é exatamente o vetor do atuador i → s_i
        # -------------------------------
        Lvec = P - self.B
        # -------------------------------
        #  ||s_i||  → comprimento do atuador
        # Norma Euclidiana do vetor s_i
        # -------------------------------
        L = np.linalg.norm(Lvec, axis=1)
        # Verifica se todos os comprimentos respeitam os limites mecânicos
        valid = np.all((L >= self.stroke_min) & (L <= self.stroke_max))
        # 🐛 DEBUG: Log detalhado da validação
        # print(f"\n🔍 VALIDAÇÃO - Pose: x={x}, y={y}, z={z}, roll={roll}, pitch={pitch}, yaw={yaw}")
        # print(f"   Limites: {self.stroke_min}mm <= L <= {self.stroke_max}mm")
        # for i in range(6):
        #     is_valid = self.stroke_min <= L[i] <= self.stroke_max
        #     status = '✅' if is_valid else '❌'
        #     print(f"   Pistão {i+1}: L={L[i]:.2f}mm {status}")
        # print(f"   RESULTADO GLOBAL: {'✅ VÁLIDO' if valid else '❌ INVÁLIDO'}")
        
        # L → comprimentos
        # valid → pose possível ou não
        # P → pontos móveis (p + R b_i)
        return L, bool(valid), P

    def leg_lengths_batch(self, poses: np.ndarray) -> np.ndarray:
        """Comprimentos das 6 pernas para N poses de uma vez. poses: (N, 6) x, y, z, roll, pitch, yaw."""
        Rm = R.from_euler('ZYX', poses[:, [5, 4, 3]], degrees=True).as_matrix()  # (N, 3, 3)
        P = np.einsum('nij,kj->nki', Rm, self.P0) + poses[:, None, :3]            # (N, 6, 3)
        return np.linalg.norm(P - self.B[None], axis=2)                           # (N, 6)

    def stroke_percentages(self, lengths: np.ndarray):
        rng = self.stroke_max - self.stroke_min
        return np.clip(((lengths - self.stroke_min) / rng) * 100.0, 0.0, 100.0)

    def lengths_to_stroke_mm(self, lengths: np.ndarray):
        rng = self.stroke_max - self.stroke_min
        return np.clip(lengths - self.stroke_min, 0.0, rng)

    # ---------- Forward "approx" (estima pose a partir de L) ----------
    def estimate_pose_from_lengths(
            self,
            lengths_abs: np.ndarray,
            x0: Optional[np.ndarray] = None
        ):
        """
        Estima a POSE da plataforma (cinemática direta numérica) a partir dos comprimentos
        ABSOLUTOS dos 6 atuadores.

        Resolve problema de mínimos quadrados:
            min ||  ||P(T,R) - B||  -  L_medidos  ||

        Onde:
        - T = [x, y, z]  → translação do centro da plataforma
        - R = R(roll, pitch, yaw) → matriz de rotação 3x3
        - P(T,R) = p + R * P0_i  → pontos da plataforma móvel no referencial da base
        - B = pontos de fixação na base
        - L = comprimentos dos atuadores = || P_i - B_i ||

        Vars de otimização:
            x = [x, y, z, roll, pitch, yaw]
        (ângulos em GRAUS para facilitar interface; internamente convertidos p/ matriz R)
        """

        # Se não for passado chute inicial, começa da pose "neutra":
        # - x = 0, y = 0
        # - z = h0 (altura nominal)
        # - roll = pitch = yaw = 0
        if x0 is None:
            x0 = np.array([0.0, 0.0, self.h0, 0.0, 0.0, 0.0], dtype=float)

        # ---------------------------
        # Função de resíduos para o least_squares
        # ---------------------------
        def residuals(x):
            # Desempacota o vetor de variáveis
            xx, yy, zz, roll, pitch, yaw = x

            # Vetor de translação T = [x, y, z]
            T = np.array([xx, yy, zz])

            # Matriz de rotação Rm a partir dos ângulos de Euler (ordem ZYX)
            # OBS: aqui os ângulos estão em graus (degrees=True)
            Rm = R.from_euler('ZYX', [yaw, pitch, roll], degrees=True).as_matrix()

            # Aplica rotação + translação nos pontos da plataforma móvel (self.P0):
            # P_i = T + Rm * P0_i
            P = (self.P0 @ Rm.T) + T

            # Vetores dos atuadores: s_i = P_i - B_i
            Lvec = P - self.B

            # Comprimentos previstos pela pose atual: Lhat_i = ||s_i||
            Lhat = np.linalg.norm(Lvec, axis=1)

            # Resíduos = (comprimento_previsto - comprimento_medido)
            # O least_squares tenta zerar esse vetor
            return Lhat - lengths_abs

        try:
            # ---------------------------
            # Chamada do solver de mínimos quadrados
            # ---------------------------
            res = least_squares(
                residuals,   # função de resíduos
                x0,          # chute inicial
                bounds=(
                    # Z precisa cobrir toda a faixa alcançável (433..631 mm nivelada);
                    # com teto em 600 a pose estimada travava acima disso.
                    [-100, -100, 300, -30, -30, -30],  # limites inferiores  [x,y,z,roll,pitch,yaw]
                    [ 100,  100, 750,  30,  30,  30]   # limites superiores
                ),
                ftol=1e-6,   # tolerância no valor da função
                xtol=1e-6,   # tolerância nas variáveis
                gtol=1e-6,   # tolerância no gradiente
                max_nfev=200 # máximo de avaliações da função
            )

            # Se o otimizador não convergir, aborta e retorna None
            if not res.success:
                print(f"   ⚠️ least_squares não convergiu: {res.message}")
                return None, None

            # Solução encontrada: x* = [x, y, z, roll, pitch, yaw]
            x = res.x

            # Monta dicionário amigável com a pose estimada
            pose = dict(
                x=float(x[0]),
                y=float(x[1]),
                z=float(x[2]),
                roll=float(x[3]),
                pitch=float(x[4]),
                yaw=float(x[5])
            )

            # ---------------------------
            # Recalcula P para a solução ótima (útil p/ mandar pro frontend)
            # ---------------------------
            T = np.array([x[0], x[1], x[2]])

            # Aqui mantém a mesma convenção: Euler ZYX (yaw, pitch, roll)
            Rm = R.from_euler('ZYX', [x[5], x[4], x[3]], degrees=True).as_matrix()

            # Pontos da plataforma móvel no referencial da base com a pose estimada
            P = (self.P0 @ Rm.T) + T

            # Retorna:
            # - pose: dicionário com x,y,z,roll,pitch,yaw
            # - P: array 6x3 com coordenadas 3D dos pontos móveis
            return pose, P

        except Exception as e:
            # Qualquer erro inesperado na otimização é tratado aqui
            print(f"   ❌ Exceção em estimate_pose_from_lengths: {e}")
            return None, None

platform = StewartPlatform()  # 180 mm de curso útil


def format_spmm6x(course_mm) -> str:
    """Comando do firmware com os 6 setpoints de curso (mm)."""
    return "spmm6x=" + ",".join(f"{float(c):.3f}" for c in course_mm)

# -------------------- WS Manager --------------------
class WSManager:
    def __init__(self):
        self.active: List[WebSocket] = []
        self.lock = asyncio.Lock()

    async def connect(self, ws: WebSocket):
        await ws.accept()
        async with self.lock:
            self.active.append(ws)

    async def disconnect(self, ws: WebSocket):
        async with self.lock:
            if ws in self.active:
                self.active.remove(ws)

    async def broadcast_json(self, obj: dict):
        # print(f"📤 Broadcast para {len(self.active)} clientes: {obj.get('type', 'unknown')}")
        rm = []
        async with self.lock:
            for ws in self.active:
                try:
                    await ws.send_json(obj)
                    # print(f"   ✅ Enviado para cliente")
                except Exception as e:
                    print(f"   ❌ Erro ao enviar: {e}")
                    rm.append(ws)
            for ws in rm:
                if ws in self.active:
                    self.active.remove(ws)

ws_mgr = WSManager()

# -------------------- Serial Manager --------------------
class SerialManager:
    def __init__(self):
        self.ser: Optional[serial.Serial] = None
        self.reader_thread: Optional[threading.Thread] = None
        self.stop_evt = threading.Event()
        self.lock = threading.Lock()
        # Serializa sequências "sel=N" + comando, para duas requisições
        # simultâneas não aplicarem um ganho/offset no pistão errado.
        self.seq_lock = threading.RLock()
        self.latest: Dict[str, Any] = {}
        self.loop = None  # Será configurado quando o servidor iniciar
        # memória para LSQ partir de último chute
        self._last_pose_guess = np.array([0, 0, platform.h0, 0, 0, 0], dtype=float)
        # gêmeo digital: simulador sombra, só enquanto a calibração roda
        self.twin: Optional[TwinShadow] = None

    def set_event_loop(self, loop):
        """Configura o event loop do FastAPI"""
        self.loop = loop
        print(f"✅ Event loop configurado no SerialManager")

    def open(self, port: str, baud: int = BAUD):
        with self.lock:
            if self.ser and self.ser.is_open:
                raise RuntimeError("Serial já aberta")
            if port == SIM_PORT_NAME:
                self.ser = SimulatedSerial(timeout=0.2)
            else:
                self.ser = serial.Serial(port, baud, timeout=0.2)
            self._last_pose_guess = np.array([0, 0, platform.h0, 0, 0, 0], dtype=float)
            self.twin = None
            self.stop_evt.clear()
            self.reader_thread = threading.Thread(target=self._reader_loop, daemon=True)
            self.reader_thread.start()
            print(f"🔌 Serial ABERTA: {port} @ {baud} baud")
            print(f"📖 Thread de leitura iniciada, aguardando dados...")

    @property
    def is_open(self) -> bool:
        return self.ser is not None and self.ser.is_open

    @property
    def simulated(self) -> bool:
        return isinstance(self.ser, SimulatedSerial) and self.ser.is_open

    def close(self):
        self.stop_evt.set()
        if self.reader_thread and self.reader_thread is not threading.current_thread():
            self.reader_thread.join(timeout=1.0)
        with self.lock:
            if self.ser:
                try: self.ser.close()
                except Exception: pass
                self.ser = None
            self.twin = None

    def list_ports(self):
        """Lista portas seriais com informações detalhadas para identificar ESP32-S3"""
        ports = []
        for p in serial.tools.list_ports.comports():
            # Identificadores comuns do ESP32
            is_esp32 = False
            confidence = 0

            # Verifica VID/PID conhecidos do ESP32
            esp32_identifiers = [
                (0x303A, None),      # Espressif VID (USB nativo S2/S3/C3)
                (0x10C4, 0xEA60),    # Silicon Labs CP210x (comum em ESP32)
                (0x1A86, 0x7523),    # CH340 (comum em clones ESP32)
                (0x0403, 0x6001),    # FTDI (alguns boards ESP32)
            ]

            # product/description para checar "S3"
            product_upper = (p.product or "").upper()
            desc_upper = (p.description or "").upper()

            for vid, pid in esp32_identifiers:
                if p.vid == vid and (pid is None or p.pid == pid):
                    is_esp32 = True

                    # Se na descrição aparecer S3, consideramos ESP32-S3 (confiança alta)
                    if "S3" in product_upper or "S3" in desc_upper or "ESP32-S3" in desc_upper:
                        confidence = 95
                    else:
                        # Outros ESP32 conhecidos
                        confidence = 70
                    break

            # Verifica descrição/manufacturer (caso ainda não tenha batido pelo VID/PID)
            desc_lower = (p.description or "").lower()
            mfr_lower = (p.manufacturer or "").lower()

            if not is_esp32:
                if any(kw in desc_lower for kw in ["esp32", "espressif"]):
                    is_esp32 = True
                    confidence = 85
                elif any(kw in mfr_lower for kw in ["espressif", "esp"]):
                    is_esp32 = True
                    confidence = 80
                elif any(kw in desc_lower for kw in ["usb-serial", "ch340", "cp210", "ftdi"]):
                    is_esp32 = True
                    confidence = 50

                # Se em qualquer uma dessas detecções aparecer S3, sobe a confiança
                if is_esp32 and ("s3" in desc_lower or "esp32-s3" in desc_lower):
                    confidence = max(confidence, 95)

            # Gera nome de exibição amigável
            display_name = p.description or "Desconhecido"
            is_s3 = False  # Flag para ESP32-S3
            
            if is_esp32:
                # Debug: mostrar informações da porta para identificação
                vid_str = f"0x{p.vid:04X}" if p.vid is not None else "N/A"
                pid_str = f"0x{p.pid:04X}" if p.pid is not None else "N/A"
                print(f"🔍 Porta {p.device}: VID={vid_str}, PID={pid_str}, desc='{p.description}', product='{p.product}'")
                
                
                # 1. USB Nativo Espressif (0x303A)
                if p.vid == 0x303A:
                    if "s3" in desc_lower or "esp32-s3" in desc_lower or "s3" in (p.product or "").lower():
                        display_name = "ESP32-S3 (USB Nativo)"
                        is_s3 = True
                        print(f"   ✅ Detectado como ESP32-S3 (USB Nativo)")
                    else:
                        display_name = "ESP32 (USB Nativo)"
                        print(f"   ℹ️  Detectado como ESP32 genérico (USB Nativo)")
                
                # 2. FTDI (0x0403) - Comum em ESP32-S3 DevKits
                elif p.vid == 0x0403:
                    # FTDI pode ser S3 ou ESP32 comum - assume S3 se for a única porta FTDI
                    # ou se houver pistas na descrição
                    if "s3" in desc_lower or "esp32-s3" in desc_lower:
                        display_name = "ESP32-S3 (FTDI)"
                        is_s3 = True
                        print(f"   ✅ Detectado como ESP32-S3 (FTDI - por descrição)")
                    else:
                        # Assume ESP32-S3 para FTDI por padrão (maioria dos DevKits modernos)
                        display_name = "ESP32-S3 (FTDI)"
                        is_s3 = True
                        confidence = 85  # Confiança média-alta
                        print(f"   🟡 Assumindo ESP32-S3 (FTDI) - confiança {confidence}%")
                
                # 3. Outros VIDs
                elif "espressif" in desc_lower or "esp32" in desc_lower:
                    if "s3" in desc_lower or "esp32-s3" in desc_lower:
                        display_name = "ESP32-S3"
                        is_s3 = True
                    else:
                        display_name = "ESP32"
                elif p.vid == 0x1A86:
                    display_name = "ESP32 (CH340)"
                elif p.vid == 0x10C4:
                    display_name = "ESP32 (CP210x)"
                
                # Ajusta confiança se detectou S3
                if is_s3:
                    confidence = max(confidence, 90)

            ports.append({
                "device": p.device,
                "description": p.description or "Desconhecido",
                "display_name": display_name,
                "hwid": p.hwid or "",
                "vid": p.vid,
                "pid": p.pid,
                "manufacturer": p.manufacturer or "",
                "is_esp32": is_esp32,
                "confidence": confidence
            })

        # Ordena: ESP32 primeiro (por confiança), depois outros
        ports.sort(key=lambda x: (-x["is_esp32"], -x["confidence"], x["device"]))

        # Dispositivo virtual sempre disponível, por último
        ports.append({
            "device": SIM_PORT_NAME,
            "description": "Plataforma virtual (sem hardware)",
            "display_name": "Simulador",
            "hwid": "",
            "vid": None,
            "pid": None,
            "manufacturer": "",
            "is_esp32": False,
            "confidence": 0,
            "simulated": True,
        })
        return ports


    def write_line(self, s: str, ending: bytes = b"\n"):
        if "\n" in s or "\r" in s:
            raise ValueError("Comando não pode conter quebra de linha")
        with self.lock:
            if not self.ser or not self.ser.is_open:
                raise RuntimeError("Serial não aberta")
            self.ser.write(s.encode("utf-8", errors="replace") + ending)
        twin = self.twin
        if twin:
            twin.on_tx(s)

    def _reader_loop(self):
        print(f"🔄 Thread de leitura iniciada")
        buf = b""
        while not self.stop_evt.is_set():
            try:
                if not self.ser:
                    break
                data = self.ser.read(1024)
            except Exception as e:
                # Cabo desconectado/porta sumiu: fecha para /serial/status refletir
                print(f"❌ Erro ao ler serial: {e}")
                with self.lock:
                    if self.ser:
                        try: self.ser.close()
                        except Exception: pass
                        self.ser = None
                break
            if not data:
                continue
            buf += data
            while b"\n" in buf:
                line, buf = buf.split(b"\n", 1)
                text = line.decode(errors="replace").rstrip("\r")
                self._on_rx_line(text)

        if buf:
            try:
                text = buf.decode(errors="replace").rstrip("\r")
                if text:
                    self._on_rx_line(text)
            except Exception:
                pass

    def _on_rx_line(self, text: str):
        now = time.time()
        
        # 🐛 DEBUG: Log de TODAS as linhas recebidas
        #print(f"📥 RX: {text}")

        if not text:
            return

        # Remove "ms;" se existir (compatibilidade)
        if text.startswith("ms;"):
            text = text[3:]  # Remove "ms;"
        
        parts = text.split(CSV_DELIM)
        
        # OTIMIZAÇÃO: Detectar formato automaticamente
        # Formato ANTIGO: 14 campos (ms;SP;Y1-Y6;PWM1-PWM6)
        # Formato MPU-6050: 17 campos (ms;SP;Y1-Y6;PWM1-PWM6;Roll;Pitch;Yaw)
        # Formato BNO085: 21 campos (ms;SP;Y1-Y6;PWM1-PWM6;Roll;Pitch;Yaw;Qw;Qx;Qy;Qz)
        
        if len(parts) < 14:
            # Não é telemetria (respostas "OK ...", header, etc.): broadcast raw mínimo
            self.latest = {"raw": text, "ts": now}
            if self.loop:
                asyncio.run_coroutine_threadsafe(ws_mgr.broadcast_json({
                    "type": "raw",
                    "ts": now,
                    "raw": text,
                }), self.loop)
            return

        try:
            # Campos comuns a todos os formatos
            ms_esp = float(parts[0].replace(",", "."))  # Tempo do ESP (ignorado)
            sp = float(parts[1].replace(",", "."))
            Y = [float(parts[2+i].replace(",", ".")) for i in range(6)]
            PWM = [int(float(parts[8+i].replace(",", "."))) for i in range(6)]
            twin = self.twin
            y_sim = twin.on_rx(time.monotonic(), ms_esp / 1000.0, Y, PWM) if twin else None

            # OTIMIZAÇÃO: Detectar formato (MPU-6050 ou BNO085)
            has_mpu = len(parts) >= 17
            has_quaternions = len(parts) >= 21
            mpu_data = None
            quaternions = None
            
            #print(f"   🔍 DEBUG: len(parts)={len(parts)}, has_mpu={has_mpu}, has_quaternions={has_quaternions}")
            
            if has_mpu:
                try:
                    roll = float(parts[14].replace(",", "."))
                    pitch = float(parts[15].replace(",", "."))
                    yaw = float(parts[16].replace(",", "."))
                    mpu_data = {"roll": roll, "pitch": pitch, "yaw": yaw}
                    
                    if has_quaternions:
                        # BNO085: inclui quaternions
                        qw = float(parts[17].replace(",", "."))
                        qx = float(parts[18].replace(",", "."))
                        qy = float(parts[19].replace(",", "."))
                        qz = float(parts[20].replace(",", "."))
                        quaternions = {"w": qw, "x": qx, "y": qy, "z": qz}
                        #print(f"   🎯 BNO085: Roll={roll:.2f}°, Pitch={pitch:.2f}°, Yaw={yaw:.2f}° | Q=[{qw:.4f}, {qx:.4f}, {qy:.4f}, {qz:.4f}]")

                        
                except Exception as e:
                    print(f"   ⚠️ Erro ao parsear orientação: {e}")
                    import traceback
                    traceback.print_exc()
                    has_mpu = False
                    has_quaternions = False

            #print(f"   ✅ Telemetria: SP={sp:.2f}mm, Y={[f'{y:.1f}' for y in Y]}, PWM={PWM}")

            # Determinar formato para identificação
            if has_quaternions:
                data_format = "bno085"
            elif has_mpu:
                data_format = "mpu6050"
            else:
                data_format = "standard"

            self.latest = {
                "ts": now, 
                "sp_mm": sp, 
                "Y": Y, 
                "PWM": PWM, 
                "mpu": mpu_data,
                "quaternions": quaternions,
                "raw": text, 
                "format": data_format
            }

            # Reconstrução de pose a partir de Y (curso -> L abs)
            L_abs = platform.stroke_min + np.array(Y, dtype=float)
            pose_live, P_live = platform.estimate_pose_from_lengths(
                L_abs, x0=self._last_pose_guess
            )
            if pose_live is not None:
                self._last_pose_guess = np.array([
                    pose_live["x"], pose_live["y"], pose_live["z"],
                    pose_live["roll"], pose_live["pitch"], pose_live["yaw"]
                ], dtype=float)

            # Determinar tipo de mensagem baseado no formato
            msg_type = "telemetry"
            if has_quaternions:
                msg_type = "telemetry_bno085"
            elif has_mpu:
                msg_type = "telemetry_mpu"

            payload = {
                "type": msg_type,
                "ts": now,
                "sp_mm": sp,
                "Y": Y,
                "PWM": PWM,
                "mpu": mpu_data,        # Dados de orientação (ou None)
                "quaternions": quaternions,  # Quaternions do BNO085 (ou None)
                "format": data_format,  # "standard", "mpu6050" ou "bno085"
                "actuator_lengths_abs": L_abs.tolist(),
                "pose_live": pose_live,  # dict ou None
                "platform_points_live": P_live.tolist() if P_live is not None else None,
                "base_points": platform.B.tolist(),
                "twin": {"Y_sim": y_sim} if y_sim is not None else None,
            }
            
            
            if self.loop:
                asyncio.run_coroutine_threadsafe(ws_mgr.broadcast_json(payload), self.loop)

        except Exception as e:
            print(f"   ❌ Erro ao parsear telemetria: {e}")
            if self.loop:
                asyncio.run_coroutine_threadsafe(ws_mgr.broadcast_json({
                    "type": "raw",
                    "ts": now,
                    "raw": text,
                    "parse_error": True
                }), self.loop)

serial_mgr = SerialManager()

# -------------------- Cache de Ganhos PID --------------------
# Cache dos últimos ganhos enviados (já que o ESP32 não tem comando para ler)
pid_gains_cache = {
    1: {"kp": 5.1478, "ki": 0.8226, "kd": 0.0},
    2: {"kp": 5.2, "ki": 0.7, "kd": 0.0},
    3: {"kp": 5.2552, "ki": 0.6391, "kd": 0.0},
    4: {"kp": 5.0969, "ki": 0.8, "kd": 0.0},
    5: {"kp": 5.4362, "ki": 1.124, "kd": 0.0},
    6: {"kp": 5.1724, "ki": 0.8593, "kd": 0.0},
}
pid_settings_cache = {
    "dbmm": 0.2,
    "minpwm": 0
}

# -------------------- Motion Runner --------------------
class MotionRunner:
    """Executa rotinas de movimento com trajetórias senoidais em thread separada"""
    
    def __init__(self, serial_manager, stewart_platform):
        self.serial_mgr = serial_manager
        self.platform = stewart_platform
        self.thread: Optional[threading.Thread] = None
        self.stop_evt = threading.Event()
        # Parada de emergência: interrompe inclusive o movimento para HOME
        self.abort_evt = threading.Event()
        self.status_dict = {
            "running": False,
            "routine": None,
            "params": {},
            "started_at": None,
            "elapsed": 0.0
        }
        self.lock = threading.Lock()

        # --- limites dinâmicos derivados da HOME ---
        self._z_limits_mm: Optional[Tuple[float, float]] = None  # (z_min, z_max)
        self._home_z_mm: float = HOME_Z_MM  # Altura Z absoluta para HOME
        self._z_safety_mm: float = 5.0    # margem de segurança contra batente
    
    def _home_pose(self) -> dict:
        """
        Pose HOME padronizada: XY e ângulos nulos, Z = altura configurada em _home_z_mm.
        """
        return {"x": 0.0, "y": 0.0, "z": self._home_z_mm,
                "roll": 0.0, "pitch": 0.0, "yaw": 0.0}

    def _calibrate_limits_from_home(self):
        """
        Recalibra limites seguros de Z a partir da HOME atual (considerando folga real de curso).
        Define self._z_limits_mm = (z_min, z_max).
        """
        pose_home = self._home_pose()
        # print(f"📏 _calibrate_limits_from_home: pose_home = {pose_home}")
        
        L0, valid, _ = self.platform.inverse_kinematics(**pose_home)
        if not valid:
            # print("⚠️ HOME inválida na calibração; usando clamps padrão de _clamp_pose.")
            self._z_limits_mm = None
            return

        L0 = np.asarray(L0, dtype=float)
        # print(f"📏 Comprimentos L0 na HOME: {L0}")
        # print(f"📏 stroke_min={self.platform.stroke_min}, stroke_max={self.platform.stroke_max}")
        
        up_margin  = float(np.min(self.platform.stroke_max - L0))   # mm até batente superior
        down_margin = float(np.min(L0 - self.platform.stroke_min))  # mm até batente inferior
        
        # print(f"📏 Margens brutas: up_margin={up_margin:.2f}mm, down_margin={down_margin:.2f}mm")

        # tira margem de segurança
        up_margin   = max(0.0, up_margin  - self._z_safety_mm)
        down_margin = max(0.0, down_margin - self._z_safety_mm)
        
        # print(f"📏 Margens com segurança ({self._z_safety_mm}mm): up={up_margin:.2f}mm, down={down_margin:.2f}mm")

        z_home = pose_home["z"]
        # Calcular limites baseados nas margens reais, SEM clamps artificiais
        z_min = z_home - down_margin
        z_max = z_home + up_margin
        
        #print(f"📏 Cálculo: z_home={z_home}, z_min={z_min:.2f}, z_max={z_max:.2f}")

        if z_min > z_max:
            #print("⚠️ Limites Z degenerados na calibração; usando clamps padrão.")
            self._z_limits_mm = None
        else:
            self._z_limits_mm = (z_min, z_max)
            #print(f"✅ Limites Z calibrados da HOME: [{z_min:.2f}, {z_max:.2f}] mm")

    def home_and_calibrate_limits(self, go_home_duration: float = 1.5):
        """Vai para HOME suavemente e recalibra limites com base nas folgas reais."""
        self._go_home_smooth(duration=go_home_duration)
        self._calibrate_limits_from_home()
    
    def start(self, req: MotionRequest):
        """Inicia uma rotina de movimento"""

        with self.lock:
            if self.status_dict["running"]:
                raise RuntimeError("Rotina já está rodando. Pare primeiro.")

            self.stop_evt.clear()
            self.abort_evt.clear()
            # Marca como rodando ainda dentro do lock: duas requisições simultâneas
            # não conseguem iniciar duas threads.
            self.status_dict = {
                "running": True,
                "routine": req.routine,
                "params": model_to_dict(req),
                "started_at": time.time(),  # HOME é feito dentro da thread
                "elapsed": 0.0
            }
            self.thread = threading.Thread(
                target=self._run_routine,
                args=(req,),
                daemon=True
            )
            self.thread.start()

    
    def stop(self, go_home: bool = True):
        """Para a rotina. Com go_home=False (emergência) não volta para HOME."""
        with self.lock:
            if not self.status_dict["running"]:
                return

            self.stop_evt.set()
            if not go_home:
                self.abort_evt.set()

        if self.thread:
            self.thread.join(timeout=2.0)

        with self.lock:
            self.status_dict["running"] = False

        if not go_home:
            return

        # Retornar suavemente para home
        try:
            self._go_home_smooth(duration=1.5)
        except Exception as e:
            print(f"⚠️ Erro ao retornar para home: {e}")
    
    def status(self) -> dict:
        """Retorna o status atual"""
        with self.lock:
            if self.status_dict["running"] and self.status_dict["started_at"] is not None:
                self.status_dict["elapsed"] = time.time() - self.status_dict["started_at"]
            return self.status_dict.copy()

    def is_running(self) -> bool:
        with self.lock:
            return bool(self.status_dict["running"])

    # ---------------- trajetória arbitrária ----------------
    def start_trajectory(self, req: TrajectoryRequest, track: np.ndarray):
        """Reproduz uma trajetória já validada. track: (N, 7) com t, x, y, z, roll, pitch, yaw."""
        with self.lock:
            if self.status_dict["running"]:
                raise RuntimeError("Rotina já está rodando. Pare primeiro.")
            self.stop_evt.clear()
            self.abort_evt.clear()
            duration = float(track[-1, 0])
            self.status_dict = {
                "running": True,
                "routine": "trajectory",
                "params": {"name": req.name, "loop": req.loop, "speed": req.speed,
                           "samples": int(track.shape[0])},
                "name": req.name,
                "duration_s": duration / req.speed,
                "started_at": time.time(),
                "elapsed": 0.0,
            }
            self.thread = threading.Thread(
                target=self._run_trajectory, args=(req, track), daemon=True
            )
            self.thread.start()

    def _send_pose(self, pose: dict, t: float, routine: str) -> bool:
        """IK + envio serial + motion_tick. Retorna False se a pose não puder ser enviada."""
        L, valid, P_cmd = self.platform.inverse_kinematics(
            x=pose["x"], y=pose["y"], z=pose["z"],
            roll=pose["roll"], pitch=pose["pitch"], yaw=pose["yaw"]
        )
        if not valid:
            print(f"❌ Pose inválida em t={t:.2f}s: {pose}")
            return False
        stroke_range = self.platform.stroke_max - self.platform.stroke_min
        course_mm = np.clip(self.platform.lengths_to_stroke_mm(L), 0.0, stroke_range)
        try:
            self.serial_mgr.write_line(format_spmm6x(course_mm))
        except Exception as e:
            print(f"❌ Erro ao enviar comando serial: {e}")
            return False
        try:
            latest_Y = (self.serial_mgr.latest or {}).get("Y")
            payload = {
                "type": "motion_tick",
                "t": float(t),
                "elapsed_ms": int(t * 1000),
                "pose_cmd": pose,
                "routine": routine,
                "actuators_cmd": np.asarray(L, dtype=float).tolist(),
                "actuators_real": (
                    [self.platform.stroke_min + float(y) for y in latest_Y] if latest_Y else None
                ),
                "platform_points_cmd": P_cmd.tolist(),
            }
            asyncio.run_coroutine_threadsafe(ws_mgr.broadcast_json(payload), self.serial_mgr.loop)
        except Exception:
            import traceback
            traceback.print_exc()
        return True

    def _run_trajectory(self, req: TrajectoryRequest, track: np.ndarray):
        """HOME → aproximação suave até a 1ª amostra → reprodução a 60 Hz (interpolação linear)."""
        keys = ("x", "y", "z", "roll", "pitch", "yaw")
        try:
            dt = 1.0 / 60.0
            self._go_home_smooth(duration=1.2)
            if self.stop_evt.is_set():
                return

            home = self._home_pose()
            first = {k: float(track[0, i + 1]) for i, k in enumerate(keys)}
            approach_s = 1.5
            t = 0.0
            while t < approach_s and not self.stop_evt.is_set():
                a = (1.0 - cos(tau * 0.5 * t / approach_s)) / 2.0
                pose = {k: home[k] + (first[k] - home[k]) * a for k in keys}
                if not self._send_pose(pose, 0.0, "trajectory"):
                    return
                t += dt
                time.sleep(dt)

            duration = float(track[-1, 0])
            times = track[:, 0]
            t = 0.0
            print(f"▶️  Trajetória '{req.name}' ({duration:.1f}s, x{req.speed}, loop={req.loop})")
            while not self.stop_evt.is_set():
                if t > duration:
                    if not req.loop:
                        break
                    t -= duration
                pose = {k: float(np.interp(t, times, track[:, i + 1])) for i, k in enumerate(keys)}
                if not self._send_pose(pose, t, "trajectory"):
                    break
                t += dt * req.speed
                time.sleep(dt)
        except Exception as e:
            print(f"❌ Erro na trajetória: {e}")
        finally:
            with self.lock:
                self.status_dict["running"] = False

    def _run_routine(self, req: MotionRequest):
        """Thread principal que executa a rotina"""
        try:
            routine_name = req.routine
            duration = req.duration_s
            hz = req.hz
            dt = 1.0 / 60.0  # 60 Hz

            try:
                self.home_and_calibrate_limits(go_home_duration=1.2)
            except Exception as e:
                print(f"❌ [Thread] ERRO ao executar HOME: {e}")
                import traceback
                traceback.print_exc()
                raise

            ramp_time = min(2.0, duration * 0.2)
            
            t = 0.0
            step = 0
            
            print(f"▶️  Iniciando rotina '{routine_name}' por {duration}s @ {hz}Hz")
            
            while t < duration and not self.stop_evt.is_set():
                
                # Calcular fator de ramp (ramp-in e ramp-out suaves com cosseno)
                if t < ramp_time:
                    # Ramp-in: 0 -> 1 usando (1 - cos(π*t/ramp_time))/2
                    ramp_factor = (1.0 - cos(tau * 0.5 * t / ramp_time)) / 2.0
                elif t > (duration - ramp_time):
                    # Ramp-out: 1 -> 0
                    remaining = duration - t
                    ramp_factor = (1.0 - cos(tau * 0.5 * remaining / ramp_time)) / 2.0
                else:
                    ramp_factor = 1.0
                
                # Gerar pose baseada na rotina
                pose = self._generate_pose(req, t, hz, ramp_factor)
                
                # DEBUG a cada segundo
                #if step % 60 == 0:
                   # print(f"🔍 t={t:.2f}s, ramp={ramp_factor:.3f}, pose: x={pose['x']:.2f}, y={pose['y']:.2f}, z={pose['z']:.2f}")
                
                # Limitar pose (com limites dinâmicos de Z, se disponíveis)
                pose = self._clamp_pose(pose)
                
                pose["z"] = pose.get("z", self.platform.h0)
                if not self._send_pose(pose, t, routine_name):
                    break

                # Aguardar próximo tick
                t += dt
                step += 1
                time.sleep(dt)
        
            
        except Exception as e:
            print(f"❌ Erro na rotina: {e}")
        finally:
            with self.lock:
                self.status_dict["running"] = False
    
    def _generate_pose(self, req: MotionRequest, t: float, hz: float, ramp: float) -> dict:
        """Gera a pose para um instante t baseado na rotina"""
        routine = req.routine
        h0 = self.platform.h0
        z_base = self._home_z_mm  # Altura base do HOME
        
        if routine == "sine_axis":
            # Movimento senoidal em um eixo
            axis = req.axis
            amp = req.amp
            offset = req.offset
            
            # Defaults de amplitude
            if amp is None:
                if axis in ["x", "y", "z"]:
                    amp = 5.0  # mm
                else:  # roll, pitch, yaw
                    amp = 2.0  # graus
            
            # Defaults de offset
            if offset is None:
                if axis == "z":
                    offset = z_base  # Usa altura base elevada
                else:
                    offset = 0.0
            
            value = offset + amp * ramp * sin(tau * hz * t)
            
            pose = {"x": 0, "y": 0, "z": z_base, "roll": 0, "pitch": 0, "yaw": 0}
            pose[axis] = value
            return pose
        
        elif routine == "circle_xy":
            # Círculo no plano XY (mantém Z na altura base elevada)
            ax = req.ax if req.ax is not None else 10.0
            ay = req.ay if req.ay is not None else 10.0
            phx = req.phx if req.phx is not None else 0.0
            
            x = ax * ramp * cos(tau * hz * t + tau * phx / 360.0)
            y = ay * ramp * sin(tau * hz * t + tau * phx / 360.0)
            
            return {"x": x, "y": y, "z": z_base, "roll": 0, "pitch": 0, "yaw": 0}
        
        elif routine == "helix":
            # Movimento helicoidal (parafuso): círculo XY contínuo + movimento linear em Z
            # Comportamento: sobe girando em um sentido, desce girando no sentido oposto
            ax = req.ax if req.ax is not None else 10.0
            ay = req.ay if req.ay is not None else 10.0
            phx = req.phx if req.phx is not None else 0.0
            z_amp_mm = req.z_amp_mm if req.z_amp_mm is not None else 8.0
            z_cycles = req.z_cycles if req.z_cycles is not None else 1.0  # número de ciclos Z (subida+descida) por volta completa do círculo
            
            # Fase do círculo (0 -> 1 a cada 1/hz segundos)
            circle_phase = (hz * t) % 1.0
            
            # Fase do ciclo Z (0 -> 1 a cada ciclo completo de subida+descida)
            z_phase = (hz * z_cycles * t) % 1.0
            
            # Dente-de-serra em Z: sobe de 0 a 0.5, desce de 0.5 a 1.0
            if z_phase < 0.5:
                # SUBINDO (primeira metade): 0 -> 0.5 mapeia para -z_amp_mm -> +z_amp_mm
                z_offset = z_amp_mm * (4.0 * z_phase - 1.0)
                # Gira no sentido positivo (horário)
                angle = tau * circle_phase + tau * phx / 360.0
            else:
                # DESCENDO (segunda metade): 0.5 -> 1.0 mapeia para +z_amp_mm -> -z_amp_mm
                z_offset = z_amp_mm * (3.0 - 4.0 * z_phase)
                # Gira no sentido negativo (anti-horário) = inverte o sinal do ângulo
                angle = -tau * circle_phase + tau * phx / 360.0
            
            # Círculo XY com oscilação em Z a partir da altura base elevada
            x = ax * ramp * cos(angle)
            y = ay * ramp * sin(angle)
            z = z_base + z_offset * ramp  # ✅ Oscila em torno da altura base elevada
            
            return {"x": x, "y": y, "z": z, "roll": 0, "pitch": 0, "yaw": 0}
        
        elif routine == "heave_pitch":
            # Movimento combinado em z e pitch a partir da altura base elevada
            amp_z = req.amp if req.amp is not None else 8.0  # mm
            amp_pitch = req.ay if req.ay is not None else 2.5  # graus
            
            z = z_base + amp_z * ramp * sin(tau * hz * t)  # ✅ Oscila em torno da altura base elevada
            pitch = amp_pitch * ramp * sin(tau * hz * t + tau * 0.25)  # +90° de fase
            
            return {"x": 0, "y": 0, "z": z, "roll": 0, "pitch": pitch, "yaw": 0}
        
        else:
            # Fallback: parado na altura base elevada
            return {"x": 0, "y": 0, "z": z_base, "roll": 0, "pitch": 0, "yaw": 0}
    
    def _clamp_pose(self, pose: dict) -> dict:
        """Limita a pose para valores seguros.
           OBS: Se _z_limits_mm foi calibrado na HOME, priorizamos esse intervalo para Z.
        """
        z_base = self._home_z_mm  # Altura base do HOME
        
        z_original = pose.get("z", z_base)
        
        pose["x"] = float(np.clip(pose["x"], -50.0, 50.0))
        pose["y"] = float(np.clip(pose["y"], -50.0, 50.0))

        # Z: usar limites dinâmicos calculados a partir da HOME quando disponíveis
        if self._z_limits_mm is not None:
            z_min, z_max = self._z_limits_mm
            pose["z"] = float(np.clip(z_original, z_min, z_max))
            if abs(pose["z"] - z_original) > 0.1:  # Se clipou mais de 0.1mm
                print(f"⚠️ Z clipado: {z_original:.2f} -> {pose['z']:.2f} (limites: [{z_min:.2f}, {z_max:.2f}])")
        else:
            # Fallback: permite oscilação razoável em torno da altura base (±30mm)
            pose["z"] = float(np.clip(z_original, z_base - 30.0, z_base + 30.0))
            if abs(pose["z"] - z_original) > 0.1:
                print(f"⚠️ Z clipado (fallback): {z_original:.2f} -> {pose['z']:.2f} (limites: [{z_base-30:.2f}, {z_base+30:.2f}])")

        pose["roll"]  = float(np.clip(pose["roll"],  -10.0, 10.0))
        pose["pitch"] = float(np.clip(pose["pitch"], -10.0, 10.0))
        pose["yaw"]   = float(np.clip(pose["yaw"],   -10.0, 10.0))
        
        return pose
    
    def _go_home_smooth(self, duration: float = 1.5):
        """Retorna suavemente para a pose home (0,0,h0+bias,0,0,0)"""
        dt = 1.0 / 60.0  # 60 Hz
        steps = int(max(1, duration / dt))
        pose = self._home_pose()

        L, valid, _ = self.platform.inverse_kinematics(**pose)
        if not valid:
            print(f"❌ ERRO: Pose HOME é INVÁLIDA pela cinemática!")
            return
        
        course_mm = self.platform.lengths_to_stroke_mm(L)
        print(f"🏠 Cursos calculados (lengths - stroke_min): {course_mm}")

        if not (self.serial_mgr.ser and self.serial_mgr.ser.is_open):
            print("⚠️ AVISO: Serial NÃO conectada - movimento HOME será simulado apenas")
            print("❌ ABORTANDO _go_home_smooth - serial não conectada!")
            return  # ✅ Retorna sem erro se serial não conectada (modo simulação)
        
        print(f"✅ Serial conectada - executando movimento HOME real")
        
        sent_commands = 0
        for i in range(steps):
            if self.abort_evt.is_set():
                print("🛑 HOME interrompido (parada de emergência)")
                return
            # curva suave apenas para marcar o ritmo de envio (HOME é fixa)
            L, valid, _ = self.platform.inverse_kinematics(**pose)
            if not valid:
                print(f"⚠️ Pose HOME inválida no step {i}/{steps}")
                time.sleep(dt)
                continue
            
            course_mm = self.platform.lengths_to_stroke_mm(L)
            stroke_range = self.platform.stroke_max - self.platform.stroke_min
            course_mm = np.clip(course_mm, 0.0, stroke_range)
            
            try:
                # Enviar comandos individuais (spmm1, spmm2, ...) como no legado
                if i == 0:  # Log detalhado apenas no primeiro step
                    print(f"📤 HOME - Enviando setpoints individuais:")
                    print(f"   Comprimentos (L): {L}")
                    print(f"   Cursos (L - stroke_min): {course_mm}")
                
                for j in range(6):
                    cmd = f"spmm{j+1}={course_mm[j]:.3f}"
                    self.serial_mgr.write_line(cmd)
                    if i == 0:  # Log primeiro step
                        print(f"   Pistão {j+1}: {cmd}")
                    time.sleep(0.0015)  # Pequeno delay entre comandos
                sent_commands += 1
            except Exception as e:
                if i == 0:  # Log apenas primeiro erro
                    print(f"❌ Erro ao enviar comando HOME: {e}")
            
            time.sleep(dt)
        
        print(f"✅ _go_home_smooth concluído: {sent_commands}/{steps} comandos enviados")

motion_runner = MotionRunner(serial_mgr, platform)

# -------------------- Calibração --------------------
CALIBRATION_DIR = BACKEND_DIR / "calibration_reports"
calibration_runner = CalibrationRunner(
    serial_mgr, platform, format_spmm6x,
    params_file=lambda: SIM_PARAMS_FILE,
    reports_dir=lambda: CALIBRATION_DIR,
)
# modo de teste (e2e): tempos 5× menores e acomodação frouxa → ~1,5 min no simulador
if os.environ.get("STEWART_CALIBRATION_FAST") == "1":
    calibration_runner.time_scale = 0.2
    calibration_runner.settle_tol = 6.0

def ensure_not_calibrating():
    """Durante a calibração nada mais pode comandar a bancada."""
    if calibration_runner.is_running():
        raise HTTPException(status_code=409, detail="Calibração em andamento. Aguarde terminar ou cancele em Ajustes → Calibração.")

# -------------------- Endpoints Serial --------------------
@app.get("/serial/ports")
def api_list_ports():
    return {"ports": serial_mgr.list_ports()}

@app.post("/serial/open")
def api_open_serial(req: SerialOpenRequest):
    try:
        serial_mgr.open(req.port, req.baud or BAUD)
        return {"message": f"OK: aberto {req.port} @ {req.baud or BAUD}"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/serial/close")
def api_close_serial():
    try:
        serial_mgr.close()
        return {"message": "OK: fechado"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/serial/status")
def api_serial_status():
    """Retorna o status da conexão serial"""
    try:
        is_open = serial_mgr.is_open
        port_name = serial_mgr.ser.port if is_open else None
        return {
            "connected": is_open,
            "port": port_name,
            "simulated": serial_mgr.simulated,
        }
    except Exception:
        return {
            "connected": False,
            "port": None,
            "simulated": False,
        }

@app.get("/telemetry")
def api_telemetry():
    return serial_mgr.latest or {}

@app.post("/serial/send")
def api_send_command(cmd: PIDCommand):
    """Envia comando livre pela serial"""
    ensure_not_calibrating()
    try:
        serial_mgr.write_line(cmd.command)
        return {"message": "OK", "sent": cmd.command}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# -------------------- Endpoints PID Control --------------------
@app.post("/pid/setpoint")
def set_pid_setpoint(sp: PIDSetpoint):
    """Define setpoint em mm (global ou individual)"""
    ensure_not_calibrating()
    try:
        if sp.piston is None:
            # Global
            serial_mgr.write_line(f"spmm={sp.value:.3f}")
            return {"message": f"Setpoint global = {sp.value:.3f} mm"}
        else:
            # Individual
            if not 1 <= sp.piston <= 6:
                raise ValueError("Pistão deve ser 1-6")
            serial_mgr.write_line(f"spmm{sp.piston}={sp.value:.3f}")
            return {"message": f"Setpoint pistão {sp.piston} = {sp.value:.3f} mm"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/pid/gains")
def set_pid_gains(gains: PIDGains):
    """Define ganhos PID para um pistão específico"""
    ensure_not_calibrating()
    try:
        if not 1 <= gains.piston <= 6:
            raise ValueError("Pistão deve ser 1-6")

        with serial_mgr.seq_lock:
            # Seleciona o pistão
            serial_mgr.write_line(f"sel={gains.piston}")
            time.sleep(0.01)

            if gains.kp is not None:
                serial_mgr.write_line(f"kpmm={gains.kp:.4f}")
                time.sleep(0.01)
                pid_gains_cache[gains.piston]["kp"] = gains.kp
            if gains.ki is not None:
                serial_mgr.write_line(f"kimm={gains.ki:.4f}")
                time.sleep(0.01)
                pid_gains_cache[gains.piston]["ki"] = gains.ki
            if gains.kd is not None:
                serial_mgr.write_line(f"kdmm={gains.kd:.4f}")
                time.sleep(0.01)
                pid_gains_cache[gains.piston]["kd"] = gains.kd
        
        return {"message": f"Ganhos atualizados para pistão {gains.piston}"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/pid/gains")
def get_all_pid_gains():
    """Retorna os ganhos PID de todos os pistões do cache"""
    return pid_gains_cache

@app.get("/pid/gains/{piston}")
def get_pid_gains(piston: int):
    """Retorna os ganhos PID de um pistão específico do cache"""
    if not 1 <= piston <= 6:
        raise HTTPException(status_code=400, detail="Pistão deve ser 1-6")
    return pid_gains_cache[piston]

@app.post("/pid/gains/all")
def set_pid_gains_all(kp: Optional[float] = None, ki: Optional[float] = None, kd: Optional[float] = None):
    """Define ganhos PID para todos os pistões"""
    ensure_not_calibrating()
    try:
        if kp is not None:
            serial_mgr.write_line(f"kpall={kp:.4f}")
            time.sleep(0.01)
            for piston in range(1, 7):
                pid_gains_cache[piston]["kp"] = kp
        if ki is not None:
            serial_mgr.write_line(f"kiall={ki:.4f}")
            time.sleep(0.01)
            for piston in range(1, 7):
                pid_gains_cache[piston]["ki"] = ki
        if kd is not None:
            serial_mgr.write_line(f"kdall={kd:.4f}")
            time.sleep(0.01)
            for piston in range(1, 7):
                pid_gains_cache[piston]["kd"] = kd
        
        return {"message": "Ganhos aplicados para todos os pistões"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/pid/feedforward")
def set_pid_feedforward(ff: PIDFeedforward):
    """Define feedforward para um pistão específico"""
    ensure_not_calibrating()
    try:
        if not 1 <= ff.piston <= 6:
            raise ValueError("Pistão deve ser 1-6")
        
        with serial_mgr.seq_lock:
            serial_mgr.write_line(f"sel={ff.piston}")
            time.sleep(0.01)

            if ff.u0_adv is not None:
                serial_mgr.write_line(f"u0a={ff.u0_adv:.2f}")
                time.sleep(0.01)
            if ff.u0_ret is not None:
                serial_mgr.write_line(f"u0r={ff.u0_ret:.2f}")
                time.sleep(0.01)
        
        return {"message": f"Feedforward atualizado para pistão {ff.piston}"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/pid/feedforward/all")
def set_pid_feedforward_all(u0_adv: Optional[float] = None, u0_ret: Optional[float] = None):
    """Define feedforward para todos os pistões"""
    ensure_not_calibrating()
    try:
        if u0_adv is not None:
            serial_mgr.write_line(f"u0aall={u0_adv:.2f}")
            time.sleep(0.01)
        if u0_ret is not None:
            serial_mgr.write_line(f"u0rall={u0_ret:.2f}")
            time.sleep(0.01)
        
        return {"message": "Feedforward aplicado para todos os pistões"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/pid/settings")
def set_pid_settings(settings: PIDSettings):
    """Ajusta configurações gerais do PID"""
    ensure_not_calibrating()
    try:
        if settings.dbmm is not None:
            serial_mgr.write_line(f"dbmm={settings.dbmm:.3f}")
            time.sleep(0.01)
            pid_settings_cache["dbmm"] = settings.dbmm
        if settings.minpwm is not None:
            serial_mgr.write_line(f"minpwm={settings.minpwm}")
            time.sleep(0.01)
            pid_settings_cache["minpwm"] = settings.minpwm
        
        return {"message": "Configurações atualizadas"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/pid/settings")
def get_pid_settings():
    """Retorna as configurações gerais do PID do cache"""
    return pid_settings_cache

@app.post("/pid/manual/{action}")
def pid_manual_control(action: str):
    """Controle manual: A (avanço), R (recuo), ok (parar)"""
    ensure_not_calibrating()
    try:
        if action.upper() not in ["A", "R", "OK"]:
            raise ValueError("Ação deve ser A, R ou ok")
        
        serial_mgr.write_line(action.upper())
        return {"message": f"Comando manual '{action.upper()}' enviado"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/pid/select/{piston}")
def pid_select_piston(piston: int):
    """Seleciona pistão para operações manuais"""
    ensure_not_calibrating()
    try:
        if not 1 <= piston <= 6:
            raise ValueError("Pistão deve ser 1-6")
        
        with serial_mgr.seq_lock:
            serial_mgr.write_line(f"sel={piston}")
        return {"message": f"Pistão {piston} selecionado"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/pid/offset")
def set_pid_offset(piston: int, offset: float):
    """Define offset de calibração para um pistão específico (compensação de erro sistemático)"""
    ensure_not_calibrating()
    try:
        if not 1 <= piston <= 6:
            raise ValueError("Pistão deve ser 1-6")
        
        with serial_mgr.seq_lock:
            serial_mgr.write_line(f"sel={piston}")
            time.sleep(0.01)
            serial_mgr.write_line(f"offset={offset:.3f}")
        
        return {"message": f"Offset do pistão {piston} = {offset:.3f} mm"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/pid/offset/all")
def set_pid_offset_all(offset: float):
    """Define offset de calibração para todos os pistões"""
    ensure_not_calibrating()
    try:
        serial_mgr.write_line(f"offsetall={offset:.3f}")
        return {"message": f"Offset aplicado para todos = {offset:.3f} mm"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# -------------------- Endpoints Motion --------------------
"""
Exemplos de uso das rotinas de movimento:

1. Seno em Z, 8 mm, 0.3 Hz, 45 s:
   POST /motion/start
   {
     "routine": "sine_axis",
     "axis": "z",
     "amp": 8,
     "hz": 0.3,
     "duration_s": 45
   }

2. Círculo XY 12x8 mm, 0.25 Hz, 60 s:
   POST /motion/start
   {
     "routine": "circle_xy",
     "ax": 12,
     "ay": 8,
     "hz": 0.25,
     "duration_s": 60
   }

3. Helix (parafuso) XY 10x10 mm, Z±8mm (sobe/desce linear), 1 ciclo completo por volta, 0.2 Hz, 60 s:
   POST /motion/start
   {
     "routine": "helix",
     "ax": 10,
     "ay": 10,
     "z_amp_mm": 8,
     "z_cycles": 1.0,
     "hz": 0.2,
     "duration_s": 60
   }

4. Heave-pitch z±8mm, pitch±2.5°, 0.2 Hz, 40 s:
   POST /motion/start
   {
     "routine": "heave_pitch",
     "amp": 8,
     "ay": 2.5,
     "hz": 0.2,
     "duration_s": 40
   }

5. Parar rotina:
   POST /motion/stop

6. Consultar status:
   GET /motion/status
"""

@app.post("/motion/start")
def motion_start(req: MotionRequest):
    """Inicia uma rotina de movimento"""
    ensure_not_calibrating()
    try:
        # Validar routine
        valid_routines = ["sine_axis", "circle_xy", "helix", "heave_pitch"]
        if req.routine not in valid_routines:
            raise ValueError(f"Rotina inválida. Use: {', '.join(valid_routines)}")
        
        # Validar axis para sine_axis
        if req.routine == "sine_axis":
            if req.axis is None:
                raise ValueError("Campo 'axis' obrigatório para routine='sine_axis'")
            valid_axes = ["x", "y", "z", "roll", "pitch", "yaw"]
            if req.axis not in valid_axes:
                raise ValueError(f"Eixo inválido. Use: {', '.join(valid_axes)}")
            
            # Aplicar defaults de amplitude
            if req.amp is None:
                if req.axis in ["x", "y", "z"]:
                    req.amp = 5.0  # mm
                else:
                    req.amp = 2.0  # graus
        
        # Verificar se serial está conectada ANTES de qualquer operação
        if not (serial_mgr.ser and serial_mgr.ser.is_open):
            raise RuntimeError("Serial não conectada. Conecte primeiro.")

        motion_runner.start(req)
        
        return {
            "message": f"Rotina '{req.routine}' iniciada",
            "routine": req.routine,
            "params": model_to_dict(req)
        }
    
    except RuntimeError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"❌ ERRO INESPERADO em /motion/start: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

MAX_TRAJECTORY_S = 3600.0

@app.post("/motion/trajectory")
def motion_trajectory(req: TrajectoryRequest):
    """Reproduz uma trajetória arbitrária (lista de poses com tempo).

    Valida tudo antes de mover: tempos crescentes a partir de 0, duração máxima
    e cinemática inversa de cada amostra. Entre amostras a pose é interpolada
    linearmente a 60 Hz; Parar, Esc e /emergency-stop valem como nas rotinas.
    """
    ensure_not_calibrating()
    track = np.array(
        [[s.t, s.x, s.y, s.z, s.roll, s.pitch, s.yaw] for s in req.samples], dtype=float
    )
    times = track[:, 0]
    if times[0] != 0:
        raise HTTPException(status_code=400, detail="A primeira amostra precisa ter t = 0.")
    bad = np.nonzero(np.diff(times) <= 0)[0]
    if bad.size:
        i = int(bad[0]) + 1
        raise HTTPException(status_code=400, detail=f"Tempos precisam ser crescentes (amostra {i}, t={times[i]:.3f} s).")
    if times[-1] > MAX_TRAJECTORY_S:
        raise HTTPException(status_code=400, detail=f"Duração máxima: {MAX_TRAJECTORY_S:.0f} s.")

    L = platform.leg_lengths_batch(track[:, 1:])
    out = ~np.all((L >= platform.stroke_min) & (L <= platform.stroke_max), axis=1)
    if out.any():
        i = int(np.nonzero(out)[0][0])
        raise HTTPException(
            status_code=400,
            detail=f"Amostra {i} (t={times[i]:.2f} s) fora do curso dos pistões.",
        )
    # velocidade de pico das pernas (mm/s), já considerando o fator de velocidade
    peak = float(np.max(np.abs(np.diff(L, axis=0)) / np.diff(times)[:, None])) * req.speed

    if not (serial_mgr.ser and serial_mgr.ser.is_open):
        raise HTTPException(status_code=409, detail="Serial não conectada. Conecte primeiro.")
    try:
        motion_runner.start_trajectory(req, track)
    except RuntimeError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return {
        "message": f"Trajetória '{req.name}' iniciada",
        "duration_s": float(times[-1]) / req.speed,
        "peak_speed_mm_s": peak,
        "samples": int(track.shape[0]),
    }

# -------------------- Gêmeo digital --------------------
class TwinSimulateRequest(BaseModel):
    t: List[float] = Field(..., min_length=2, max_length=72_000)
    sp: List[List[float]] = Field(..., min_length=2, max_length=72_000)
    y0: List[float] = Field(..., min_length=6, max_length=6)

class TwinFitRequest(BaseModel):
    """Sem dados: usa o histórico ao vivo do gêmeo. Com dados: t (N), Y/PWM com sinal/sp (N×6)."""
    t: Optional[List[float]] = None
    Y: Optional[List[List[float]]] = None
    PWM: Optional[List[List[float]]] = None
    sp: Optional[List[List[float]]] = None

class TwinParamsRequest(BaseModel):
    params: Dict[str, List[float]]

PARAM_RANGES = {
    "vmax_adv_mm_s": (1.0, 80.0),
    "vmax_ret_mm_s": (1.0, 80.0),
    "deadzone_adv_pwm": (0.0, 200.0),
    "deadzone_ret_pwm": (0.0, 200.0),
}

def _check_rows(name: str, rows: List[List[float]], n: int):
    if len(rows) != n or any(len(r) != 6 for r in rows):
        raise HTTPException(status_code=400, detail=f"'{name}' precisa ter {n} linhas de 6 valores.")

@app.post("/twin/simulate")
def twin_simulate(req: TwinSimulateRequest):
    """Reproduz setpoints (mm de curso) no simulador, a partir de y0; devolve as posições."""
    _check_rows("sp", req.sp, len(req.t))
    t = np.asarray(req.t, dtype=float)
    if np.any(np.diff(t) < 0):
        raise HTTPException(status_code=400, detail="Tempos precisam ser crescentes.")
    Y = sim_fit.replay(load_params(SIM_PARAMS_FILE), t, np.asarray(req.sp), req.y0)
    return {"Y_sim": np.round(Y, 3).tolist()}

@app.post("/twin/fit")
def twin_fit(req: TwinFitRequest):
    """Identifica vmax e zona morta de cada pistão a partir de dados (t, Y, PWM com sinal, sp)."""
    if req.t is None:
        raise HTTPException(status_code=400, detail="Envie os dados (t, Y, PWM, sp) ou use a Calibração.")
    n = len(req.t)
    for name in ("Y", "PWM", "sp"):
        if getattr(req, name) is None:
            raise HTTPException(status_code=400, detail=f"Faltou '{name}'.")
        _check_rows(name, getattr(req, name), n)
    t, Y, U, SP = (np.asarray(v, dtype=float) for v in (req.t, req.Y, req.PWM, req.sp))
    return sim_fit.fit_all(t, Y, U, SP, load_params(SIM_PARAMS_FILE))

def save_sim_params(params: Dict[str, List[float]]) -> str:
    """Valida e salva vmax/zona morta no sim_params.json (cópia .bak). Devolve o nome da cópia."""
    for k, v in params.items():
        if k not in PARAM_RANGES:
            raise HTTPException(status_code=400, detail=f"Parâmetro desconhecido: {k}")
        lo, hi = PARAM_RANGES[k]
        if len(v) != 6 or not all(lo <= float(x) <= hi for x in v):
            raise HTTPException(status_code=400, detail=f"'{k}' precisa de 6 valores entre {lo} e {hi}.")
    path = Path(SIM_PARAMS_FILE)
    data = json.loads(path.read_text(encoding="utf-8"))
    backup = path.with_suffix(".json.bak")
    backup.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    for k, v in params.items():
        data[k] = [round(float(x), 2) for x in v]
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return backup.name

@app.post("/twin/params")
def twin_params(req: TwinParamsRequest):
    """Salva vmax/zona morta no sim_params.json (com cópia .bak). Vale para as próximas conexões."""
    return {"saved": True, "backup": save_sim_params(req.params)}

@app.post("/calibration/start")
def calibration_start():
    """Interrompe o que estiver rodando e inicia autoteste + recalibração (3 a 4 min)."""
    if not serial_mgr.is_open:
        raise HTTPException(status_code=409, detail="Conecte a bancada (ou o simulador) primeiro.")
    if calibration_runner.is_running():
        raise HTTPException(status_code=409, detail="A calibração já está em andamento.")
    motion_runner.stop(go_home=False)
    FLIGHT_SIMULATION_STATE["enabled"] = False
    try:
        serial_mgr.write_line("OK")  # tira o firmware do modo manual
    except Exception:
        pass
    calibration_runner.start()
    return calibration_runner.status()

@app.get("/calibration/status")
def calibration_status():
    return calibration_runner.status()

@app.post("/calibration/cancel")
def calibration_cancel():
    calibration_runner.cancel()
    return calibration_runner.status()

def _report_path(report_id: str) -> Path:
    if not re.fullmatch(r"\d{8}-\d{6}", report_id):
        raise HTTPException(status_code=404, detail="Relatório não encontrado.")
    path = CALIBRATION_DIR / f"{report_id}.json"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Relatório não encontrado.")
    return path

@app.get("/calibration/reports")
def calibration_reports():
    """Relatórios salvos, do mais novo para o mais antigo (resumo)."""
    items = []
    if CALIBRATION_DIR.is_dir():
        for f in sorted(CALIBRATION_DIR.glob("*.json"), reverse=True):
            try:
                r = json.loads(f.read_text(encoding="utf-8"))
            except Exception:
                continue
            items.append({k: r.get(k) for k in ("id", "created_at", "duration_s", "simulated", "alerts", "improvement_pct", "has_changes", "applied", "applied_at")})
    return {"reports": items}

@app.get("/calibration/reports/{report_id}")
def calibration_report(report_id: str):
    return json.loads(_report_path(report_id).read_text(encoding="utf-8"))

@app.post("/calibration/reports/{report_id}/apply")
def calibration_apply(report_id: str):
    """Grava no simulador os parâmetros propostos pelo relatório (cópia .bak do anterior)."""
    ensure_not_calibrating()
    path = _report_path(report_id)
    report = json.loads(path.read_text(encoding="utf-8"))
    if not report.get("has_changes"):
        raise HTTPException(status_code=400, detail="Este relatório não propõe mudanças.")
    backup = save_sim_params(report["fit"]["proposed"])
    report["applied"] = True
    report["applied_at"] = datetime.now().isoformat(timespec="seconds")
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"applied": True, "backup": backup}

def ensure_manual_allowed():
    """Comandos manuais não podem brigar com uma rotina/trajetória em execução."""
    ensure_not_calibrating()
    if motion_runner.is_running():
        raise HTTPException(
            status_code=409,
            detail="Uma rotina está em execução. Pare-a antes de comandar manualmente.",
        )

@app.post("/motion/stop")
def motion_stop():
    """Para a rotina de movimento atual"""
    try:
        motion_runner.stop()
        return {"message": "Rotina parada"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/emergency-stop")
def emergency_stop():
    """Parada de emergência.

    Interrompe rotina e simulação de voo (sem voltar para HOME), tira o firmware
    do modo manual e congela os atuadores na posição medida mais recente.
    """
    calibration_runner.abort()
    motion_runner.stop(go_home=False)
    FLIGHT_SIMULATION_STATE["enabled"] = False
    held = None
    if serial_mgr.is_open:
        try:
            serial_mgr.write_line("OK")
            Y = (serial_mgr.latest or {}).get("Y")
            if Y:
                rng = platform.stroke_max - platform.stroke_min
                held = np.clip(np.array(Y, dtype=float), 0.0, rng)
                serial_mgr.write_line(format_spmm6x(held))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Erro TX serial: {e}")
    return {"stopped": True, "held_mm": held.tolist() if held is not None else None}

@app.get("/motion/status")
def motion_status():
    """Retorna o status da rotina de movimento"""
    try:
        return motion_runner.status()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# -------------------- Plataforma (REST iguais) --------------------
@app.get("/config", response_model=PlatformGeometry)
def get_config():
    return PlatformGeometry(
        h0=platform.h0,
        stroke_min=platform.stroke_min,
        stroke_max=platform.stroke_max,
        home_z=motion_runner._home_z_mm,
        base_points=platform.B.tolist(),
        platform_points_local=platform.P0.tolist(),
    )

@app.post("/config")
def set_config(cfg: PlatformConfig):
    if cfg.stroke_max <= cfg.stroke_min:
        raise HTTPException(status_code=400, detail="stroke_max deve ser maior que stroke_min")
    # Não permite ampliar o curso além do limite mecânico da bancada
    if cfg.stroke_min < STROKE_MIN_MM or cfg.stroke_max > STROKE_MAX_MM:
        raise HTTPException(
            status_code=400,
            detail=f"Curso deve ficar dentro de {STROKE_MIN_MM:.0f}..{STROKE_MAX_MM:.0f} mm",
        )
    # Atualiza no lugar: motion_runner e serial_mgr guardam a mesma instância
    platform.h0 = cfg.h0
    platform.stroke_min = cfg.stroke_min
    platform.stroke_max = cfg.stroke_max
    return {"message": "Configuração atualizada"}


def model_to_dict(model):
    """Compat helper for Pydantic v1/v2."""
    if hasattr(model, "model_dump"):
        return model.model_dump()
    return model.dict()


def build_platform_response(pose: PoseInput) -> PlatformResponse:
    """Calcula cinemática inversa e empacota a resposta padrão."""
    z_value = pose.z if pose.z is not None else platform.h0
    L, valid, P = platform.inverse_kinematics(
        x=pose.x, y=pose.y, z=z_value,
        roll=pose.roll, pitch=pose.pitch, yaw=pose.yaw,
    )
    perc = platform.stroke_percentages(L)
    actuators = [
        ActuatorData(
            id=i + 1,
            length=float(L[i]),
            percentage=float(perc[i]),
            valid=platform.stroke_min <= L[i] <= platform.stroke_max,
        )
        for i in range(6)
    ]
    return PlatformResponse(
        pose=PoseInput(
            x=pose.x,
            y=pose.y,
            z=z_value,
            roll=pose.roll,
            pitch=pose.pitch,
            yaw=pose.yaw,
        ),
        actuators=actuators,
        valid=bool(valid),
        base_points=platform.B.tolist(),
        platform_points=P.tolist(),
    )


@app.post("/calculate", response_model=PlatformResponse)
def calculate_position(pose: PoseInput):
    return build_platform_response(pose)

@app.post("/apply_pose")
def apply_pose(req: ApplyPoseRequest):
    ensure_manual_allowed()
   # print(f"🚀 apply_pose recebido: x={req.x}, y={req.y}, z={req.z}, roll={req.roll}, pitch={req.pitch}, yaw={req.yaw}")
    z_value = req.z if req.z is not None else platform.h0
    L, valid, _ = platform.inverse_kinematics(
        x=req.x, y=req.y, z=z_value,
        roll=req.roll, pitch=req.pitch, yaw=req.yaw
    )
    if not valid:
        print("❌ Pose inválida")
        return {"applied": False, "valid": False, "message": "Pose inválida."}
    course_mm = platform.lengths_to_stroke_mm(L)
    #print(f"✅ Cursos calculados (mm): {course_mm}")
    try:
        # Enviar todos os 6 setpoints de uma vez
        serial_mgr.write_line(format_spmm6x(course_mm))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erro TX serial: {e}")
    return {"applied": True, "valid": True, "setpoints_mm": course_mm.tolist()}

# OTIMIZAÇÃO: Endpoint para controle via MPU-6050 (acelerômetro)
class MPUControlRequest(BaseModel):
    roll: float = Field(0, description="Roll em graus do acelerômetro")
    pitch: float = Field(0, description="Pitch em graus do acelerômetro")
    yaw: float = Field(0, description="Yaw em graus do acelerômetro")
    x: float = Field(0, description="Translação X (mm)")
    y: float = Field(0, description="Translação Y (mm)")
    z: Optional[float] = Field(None, description="Altura Z (mm), default=h0")
    scale: float = Field(1.0, ge=0.0, le=1.0, description="Fator de escala para os ângulos (0.0-1.0)")

@app.post("/mpu/control")
def mpu_control(req: MPUControlRequest):
    ensure_manual_allowed()
    """
    OTIMIZAÇÃO: Aplica controle da plataforma baseado em dados do MPU-6050.
    Calcula cinemática inversa e envia setpoints para os atuadores.
    """
    # 🐛 DEBUG: Log do request recebido
    #print(f"\n🎯 /mpu/control recebido:")
   # print(f"   roll={req.roll:.2f}°, pitch={req.pitch:.2f}°, yaw={req.yaw:.2f}°")
    #print(f"   x={req.x:.2f}mm, y={req.y:.2f}mm, z={req.z}mm")
    #print(f"   scale={req.scale}")
    
    # Aplica escala aos ângulos (para suavizar movimento se necessário)
    roll_scaled = req.roll * req.scale
    pitch_scaled = req.pitch * req.scale
    yaw_scaled = req.yaw * req.scale
    
    z_value = req.z if req.z is not None else platform.h0
    
    # Calcula cinemática inversa
    L, valid, P = platform.inverse_kinematics(
        x=req.x, y=req.y, z=z_value,
        roll=roll_scaled, pitch=pitch_scaled, yaw=yaw_scaled
    )
    
    if not valid:
        return {
            "applied": False, 
            "valid": False, 
            "message": "Pose inválida (fora dos limites da plataforma)"
        }
    
    course_mm = platform.lengths_to_stroke_mm(L)
    
    # Platform_points já vem do inverse_kinematics (terceiro retorno)
    platform_points = P.tolist() if P is not None else []
    
    # OTIMIZAÇÃO: Envia todos os setpoints de uma vez (batch)
    try:
        #print(f"📤 Enviando comando MPU: {cmd}")
        serial_mgr.write_line(format_spmm6x(course_mm))
        #print(f"✅ Comando MPU enviado com sucesso")
    except Exception as e:
        #print(f"❌ Erro ao enviar comando MPU: {e}")
        raise HTTPException(status_code=400, detail=f"Erro TX serial: {e}")
    
    return {
        "applied": True, 
        "valid": True,
        "setpoints_mm": course_mm.tolist(),
        "pose": {
            "x": req.x, "y": req.y, "z": z_value,
            "roll": roll_scaled, "pitch": pitch_scaled, "yaw": yaw_scaled
        },
        "lengths_abs": L.tolist(),
        "base_points": platform.B.tolist(),
        "platform_points": platform_points
    }

@app.post("/flight-simulation/start")
def flight_simulation_start():
    ensure_not_calibrating()
    FLIGHT_SIMULATION_STATE["enabled"] = True
    FLIGHT_SIMULATION_STATE["started_at"] = time.time()
    return {
        "enabled": True,
        "safe_z": FLIGHT_SIMULATION_STATE["safe_z"],
        "started_at": FLIGHT_SIMULATION_STATE["started_at"],
    }

@app.post("/flight-simulation/stop")
def flight_simulation_stop():
    FLIGHT_SIMULATION_STATE["enabled"] = False
    return {
        "enabled": False,
        "safe_z": FLIGHT_SIMULATION_STATE["safe_z"],
        "started_at": FLIGHT_SIMULATION_STATE["started_at"],
    }

@app.post("/flight-simulation/preview")
def flight_simulation_preview_store(data: PlatformResponse):
    payload = model_to_dict(data)
    payload["timestamp"] = time.time()
    FLIGHT_SIMULATION_STATE["last_preview"] = payload
    return {"stored": True, "timestamp": payload["timestamp"]}

@app.get("/flight-simulation/preview")
def flight_simulation_preview_get():
    preview = FLIGHT_SIMULATION_STATE.get("last_preview")
    if preview is None:
        raise HTTPException(status_code=404, detail="No preview pose available")
    return preview

@app.get("/flight-simulation/status")
def flight_simulation_status():
    return {
        "enabled": FLIGHT_SIMULATION_STATE["enabled"],
        "safe_z": FLIGHT_SIMULATION_STATE["safe_z"],
        "started_at": FLIGHT_SIMULATION_STATE["started_at"],
        "last_preview_ts": (
            FLIGHT_SIMULATION_STATE["last_preview"]["timestamp"]
            if FLIGHT_SIMULATION_STATE["last_preview"]
            else None
        ),
    }

# -------------------- Joystick Control --------------------
@app.post("/joystick/pose")
def joystick_pose(req: JoystickPoseRequest):
    """
    Endpoint para controle por joystick (gamepad).
    
    Mapeia eixos normalizados do joystick (-1..1) para pose física da plataforma.
    
    Mapeamento:
    - lx, ly: Stick esquerdo -> translação X, Y (±30mm)
    - rx, ry: Stick direito -> rotação Pitch, Roll (±8°)
    - lt, rt: Triggers -> controle de Yaw (futuro)
    
    Parâmetros:
    - apply: Se True, envia comando serial para ESP32
    - z_base: Altura Z base (default = HOME_Z_MM)
    
    Retorna:
    - valid: Se a pose calculada é válida
    - applied: Se o comando foi enviado (apenas se apply=True e valid=True)
    - pose: Pose calculada
    - lengths_abs: Comprimentos absolutos dos atuadores
    - course_mm: Cursos em mm
    - base_points: Pontos da base
    - platform_points: Pontos da plataforma
    """

    
    # Constantes de mapeamento (limites físicos da plataforma)
    MAX_TRANS_MM = 30.0   # ±30mm em X e Y
    MAX_ANGLE_DEG = 8.0  # ±8° em roll, pitch
    
    # Mapear eixos normalizados para valores físicos
    # lx -> X (direita positivo)
    # ly -> Y (para frente negativo, por isso inverte)
    x = np.clip(req.lx * MAX_TRANS_MM, -MAX_TRANS_MM, MAX_TRANS_MM)
    y = np.clip(-req.ly * MAX_TRANS_MM, -MAX_TRANS_MM, MAX_TRANS_MM)
    
    # Z usa valor base fornecido ou a altura de repouso
    z = req.z_base if req.z_base is not None else HOME_Z_MM
    
    # rx -> Pitch (stick direito horizontal)
    # ry -> Roll (stick direito vertical, invertido)
    roll = np.clip(-req.ry * MAX_ANGLE_DEG, -MAX_ANGLE_DEG, MAX_ANGLE_DEG)
    pitch = np.clip(req.rx * MAX_ANGLE_DEG, -MAX_ANGLE_DEG, MAX_ANGLE_DEG)
    
    # Yaw por enquanto em 0 (pode usar lt/rt no futuro)
    yaw = 0.0
    # Exemplo futuro: yaw = (rt - lt) * MAX_ANGLE_DEG se ambos forem fornecidos
    
    #print(f"🎮 Joystick -> Pose: x={x:.2f}, y={y:.2f}, z={z:.2f}, roll={roll:.2f}°, pitch={pitch:.2f}°, yaw={yaw:.2f}°")
    
    # Calcular cinemática inversa
    L, valid, P = platform.inverse_kinematics(
        x=x, y=y, z=z,
        roll=roll, pitch=pitch, yaw=yaw
    )
    
    # Se inválido, retornar imediatamente
    if not valid:
        #print("❌ Pose de joystick inválida")
        return {
            "valid": False,
            "applied": False,
            "message": "Pose fora dos limites da plataforma",
            "pose": {"x": x, "y": y, "z": z, "roll": roll, "pitch": pitch, "yaw": yaw}
        }
    
    # Calcular cursos
    course_mm = platform.lengths_to_stroke_mm(L)
    
    # Se apply=True e válido, enviar comando serial
    applied = False
    if req.apply:
        ensure_manual_allowed()
        try:
            #print(f"📤 Enviando comando joystick: {cmd}")
            serial_mgr.write_line(format_spmm6x(course_mm))
            applied = True
            #print("✅ Comando joystick enviado com sucesso")
        except Exception as e:
            #print(f"❌ Erro ao enviar comando joystick: {e}")
            raise HTTPException(status_code=400, detail=f"Erro TX serial: {e}")
    
    # Retornar resposta completa
    return {
        "valid": True,
        "applied": applied,
        "pose": {
            "x": float(x),
            "y": float(y),
            "z": float(z),
            "roll": float(roll),
            "pitch": float(pitch),
            "yaw": float(yaw)
        },
        "lengths_abs": L.tolist(),
        "course_mm": course_mm.tolist(),
        "base_points": platform.B.tolist(),
        "platform_points": P.tolist()
    }

# -------------------- WebSocket --------------------
@app.websocket("/ws/telemetry")
async def ws_telemetry(ws: WebSocket):
    await ws_mgr.connect(ws)
    try:
        while True:
            # Mantemos o canal half-duplex simples: ignoramos mensagens do cliente,
            # mas lemos para detectar fechamento limpo.
            await ws.receive_text()
    except WebSocketDisconnect:
        await ws_mgr.disconnect(ws)
    except Exception:
        await ws_mgr.disconnect(ws)

# -------------------- Raiz / Frontend --------------------
@app.get("/api/info")
def api_info():
    """Nome, versão e rotas da API (a documentação completa está em /docs)."""
    endpoints = []
    for route in app.routes:
        methods = getattr(route, "methods", None)
        path = getattr(route, "path", "")
        if methods and not path.startswith(("/docs", "/redoc", "/openapi", "/{")):
            for method in sorted(methods - {"HEAD", "OPTIONS"}):
                endpoints.append(f"{method:5} {path}")
    endpoints.append("WS    /ws/telemetry")
    return {"name": API_TITLE, "version": API_VERSION, "endpoints": endpoints}


# Frontend antigo (vanilla) servido em /antigo/ enquanto a migração não termina
if LEGACY_FRONTEND_DIR.is_dir():
    app.mount("/antigo", StaticFiles(directory=LEGACY_FRONTEND_DIR, html=True), name="legacy-frontend")


@app.get("/{full_path:path}", include_in_schema=False)
def spa(full_path: str):
    """Serve o build do frontend React (interface/web/dist) com fallback de SPA.

    Registrada por último para nunca encobrir as rotas da API.
    """
    index = WEB_DIST_DIR / "index.html"
    if not index.is_file():
        if LEGACY_FRONTEND_DIR.is_dir() and full_path == "":
            return FileResponse(LEGACY_FRONTEND_DIR / "index.html")
        raise HTTPException(
            status_code=404,
            detail="Frontend não compilado. Rode 'npm run build' em interface/web.",
        )
    candidate = (WEB_DIST_DIR / full_path).resolve()
    if full_path and candidate.is_file() and WEB_DIST_DIR.resolve() in candidate.parents:
        # assets/ tem hash no nome: pode ficar no cache para sempre
        immutable = candidate.parent.name == "assets"
        return FileResponse(candidate, headers={"Cache-Control": "public, max-age=31536000, immutable" if immutable else "no-cache"})
    # o index.html sempre é revalidado, senão o navegador pode continuar com um build antigo
    return FileResponse(index, headers={"Cache-Control": "no-cache"})


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8001)
