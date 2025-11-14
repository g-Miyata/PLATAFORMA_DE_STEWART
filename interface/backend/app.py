# server_serial_steweart.py
# FastAPI + Serial + WebSocket de telemetria com reconstrução de pose (LSQ)

import threading
import time
import json
import asyncio
from typing import List, Optional, Dict, Any, Tuple
from math import sin, cos, tau

import numpy as np
from scipy.spatial.transform import Rotation as R
from scipy.optimize import least_squares
import serial
import serial.tools.list_ports

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# -------------------- Config API --------------------
API_TITLE = "Stewart Platform API + Serial + WS"
API_VERSION = "1.1.0"
CORS_ORIGINS = ["*"]

app = FastAPI(title=API_TITLE, version=API_VERSION)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    """Configura o event loop no SerialManager quando o servidor inicia"""
    loop = asyncio.get_event_loop()
    serial_mgr.set_event_loop(loop)
    print("✅ FastAPI startup: event loop configurado")

BAUD = 115200
CSV_DELIM = ';'

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
    h0: float
    stroke_min: float
    stroke_max: float

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
    def __init__(self, h0=432, stroke_min=500, stroke_max=680):
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
        if z is None:
            z = self.h0
        T = np.array([x, y, z])
        Rm = R.from_euler('ZYX', [yaw, pitch, roll], degrees=True).as_matrix()
        P = (self.P0 @ Rm.T) + T
        Lvec = P - self.B
        L = np.linalg.norm(Lvec, axis=1)
        valid = np.all((L >= self.stroke_min) & (L <= self.stroke_max))
        
        # 🐛 DEBUG: Log detalhado da validação
        print(f"\n🔍 VALIDAÇÃO - Pose: x={x}, y={y}, z={z}, roll={roll}, pitch={pitch}, yaw={yaw}")
        print(f"   Limites: {self.stroke_min}mm <= L <= {self.stroke_max}mm")
        for i in range(6):
            is_valid = self.stroke_min <= L[i] <= self.stroke_max
            status = "✅" if is_valid else "❌"
            print(f"   Pistão {i+1}: L={L[i]:.2f}mm {status}")
        print(f"   RESULTADO GLOBAL: {'✅ VÁLIDO' if valid else '❌ INVÁLIDO'}")
        
        return L, bool(valid), P

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
        Resolve minimos quadrados: || ||P(T,R)-B|| - L || -> 0
        Vars: x=[x,y,z, roll,pitch,yaw] (graus para euler, internamente converte)
        Retorna (pose_dict, P_transformed) ou (None, None) se falhar.
        """
        if x0 is None:
            x0 = np.array([0.0, 0.0, self.h0, 0.0, 0.0, 0.0], dtype=float)

        def residuals(x):
            xx, yy, zz, roll, pitch, yaw = x
            T = np.array([xx, yy, zz])
            Rm = R.from_euler('ZYX', [yaw, pitch, roll], degrees=True).as_matrix()
            P = (self.P0 @ Rm.T) + T
            Lvec = P - self.B
            Lhat = np.linalg.norm(Lvec, axis=1)
            return Lhat - lengths_abs

        try:
            res = least_squares(
                residuals, x0,
                bounds=([-100, -100, 300, -30, -30, -30],
                        [ 100,  100, 600,  30,  30,  30]),
                ftol=1e-6, xtol=1e-6, gtol=1e-6, max_nfev=200
            )
            if not res.success:
                print(f"   ⚠️ least_squares não convergiu: {res.message}")
                return None, None
            x = res.x
            pose = dict(x=float(x[0]), y=float(x[1]), z=float(x[2]),
                        roll=float(x[3]), pitch=float(x[4]), yaw=float(x[5]))
            # recomputa P
            T = np.array([x[0], x[1], x[2]])
            Rm = R.from_euler('ZYX', [x[5], x[4], x[3]], degrees=True).as_matrix()
            P = (self.P0 @ Rm.T) + T
            return pose, P
        except Exception as e:
            print(f"   ❌ Exceção em estimate_pose_from_lengths: {e}")
            return None, None

platform = StewartPlatform(h0=432, stroke_min=500, stroke_max=680)  # 182mm de curso útil

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
        print(f"📤 Broadcast para {len(self.active)} clientes: {obj.get('type', 'unknown')}")
        rm = []
        async with self.lock:
            for ws in self.active:
                try:
                    await ws.send_json(obj)
                    print(f"   ✅ Enviado para cliente")
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
        self.latest: Dict[str, Any] = {}
        self.loop = None  # Será configurado quando o servidor iniciar
        # memória para LSQ partir de último chute
        self._last_pose_guess = np.array([0, 0, platform.h0, 0, 0, 0], dtype=float)

    def set_event_loop(self, loop):
        """Configura o event loop do FastAPI"""
        self.loop = loop
        print(f"✅ Event loop configurado no SerialManager")

    def open(self, port: str, baud: int = BAUD):
        with self.lock:
            if self.ser and self.ser.is_open:
                raise RuntimeError("Serial já aberta")
            self.ser = serial.Serial(port, baud, timeout=0.2)
            self.stop_evt.clear()
            self.reader_thread = threading.Thread(target=self._reader_loop, daemon=True)
            self.reader_thread.start()
            print(f"🔌 Serial ABERTA: {port} @ {baud} baud")
            print(f"📖 Thread de leitura iniciada, aguardando dados...")

    def close(self):
        self.stop_evt.set()
        if self.reader_thread:
            self.reader_thread.join(timeout=1.0)
        with self.lock:
            if self.ser:
                try: self.ser.close()
                except Exception: pass
                self.ser = None

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

            # Vamos usar também product/description para checar "S3"
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
                
                # HEURÍSTICA MELHORADA: Tenta detectar ESP32-S3 por múltiplos critérios
                
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
        return ports


    def write_line(self, s: str, ending: bytes = b"\n"):
        with self.lock:
            if not self.ser or not self.ser.is_open:
                raise RuntimeError("Serial não aberta")
            self.ser.write(s.encode("utf-8", errors="replace") + ending)

    def _reader_loop(self):
        print(f"🔄 Thread de leitura iniciada")
        buf = b""
        while not self.stop_evt.is_set():
            try:
                if not self.ser:
                    break
                data = self.ser.read(1024)
            except Exception as e:
                print(f"❌ Erro ao ler serial: {e}")
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
        print(f"📥 RX: {text}")

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
            print(f"   ⚠️ Linha NÃO é telemetria (tem {len(parts)} campos, esperado 14+)")
            # Broadcast raw mínimo
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

            # OTIMIZAÇÃO: Detectar formato (MPU-6050 ou BNO085)
            has_mpu = len(parts) >= 17
            has_quaternions = len(parts) >= 21
            mpu_data = None
            quaternions = None
            
            print(f"   🔍 DEBUG: len(parts)={len(parts)}, has_mpu={has_mpu}, has_quaternions={has_quaternions}")
            
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
                        print(f"   🎯 BNO085: Roll={roll:.2f}°, Pitch={pitch:.2f}°, Yaw={yaw:.2f}° | Q=[{qw:.4f}, {qx:.4f}, {qy:.4f}, {qz:.4f}]")
                    else:
                        print(f"   🎯 MPU-6050: Roll={roll:.2f}°, Pitch={pitch:.2f}°, Yaw={yaw:.2f}°")
                        
                except Exception as e:
                    print(f"   ⚠️ Erro ao parsear orientação: {e}")
                    import traceback
                    traceback.print_exc()
                    has_mpu = False
                    has_quaternions = False

            print(f"   ✅ Telemetria: SP={sp:.2f}mm, Y={[f'{y:.1f}' for y in Y]}, PWM={PWM}")

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
        self.status_dict = {
            "running": False,
            "routine": None,
            "params": {},
            "started_at": None,
            "elapsed": 0.0
        }
        self.lock = threading.Lock()

        # --- NOVO: limites dinâmicos derivados da HOME ---
        self._z_limits_mm: Optional[Tuple[float, float]] = None  # (z_min, z_max)
        self._home_bias_mm: float = 23.0  # altura inicial elevada (HOME e trajetórias)
        self._z_safety_mm: float = 5.0    # margem de segurança contra batente
    
    def _home_pose(self) -> dict:
        """Pose HOME padronizada: XY e ângulos nulos, Z = h0 + bias (altura inicial elevada)."""
        return {"x": 0.0, "y": 0.0, "z": self.platform.h0 + self._home_bias_mm,
                "roll": 0.0, "pitch": 0.0, "yaw": 0.0}

    def _calibrate_limits_from_home(self):
        """
        Recalibra limites seguros de Z a partir da HOME atual (considerando folga real de curso).
        Define self._z_limits_mm = (z_min, z_max).
        """
        pose_home = self._home_pose()
        L0, valid, _ = self.platform.inverse_kinematics(**pose_home)
        if not valid:
            print("⚠️ HOME inválida na calibração; usando clamps padrão de _clamp_pose.")
            self._z_limits_mm = None
            return

        L0 = np.asarray(L0, dtype=float)
        up_margin  = float(np.min(self.platform.stroke_max - L0))   # mm até batente superior
        down_margin = float(np.min(L0 - self.platform.stroke_min))  # mm até batente inferior

        # tira margem de segurança
        up_margin   = max(0.0, up_margin  - self._z_safety_mm)
        down_margin = max(0.0, down_margin - self._z_safety_mm)

        z_home = pose_home["z"]
        # z pode subir até up_margin e descer até down_margin, sempre respeitando clamps globais
        z_min = max(self.platform.h0 - 20.0, z_home - down_margin)
        z_max = min(self.platform.h0 + 64.0, z_home + up_margin)

        if z_min > z_max:
            print("⚠️ Limites Z degenerados na calibração; usando clamps padrão.")
            self._z_limits_mm = None
        else:
            self._z_limits_mm = (z_min, z_max)
            print(f"✅ Limites Z calibrados da HOME: [{z_min:.2f}, {z_max:.2f}] mm")

    def home_and_calibrate_limits(self, go_home_duration: float = 1.5):
        """Vai para HOME suavemente e recalibra limites com base nas folgas reais."""
        print("🏠 Preflight: indo para HOME e calibrando limites...")
        self._go_home_smooth(duration=go_home_duration)
        self._calibrate_limits_from_home()
        print("✅ HOME e calibração concluídos - iniciando trajetória...")
    
    def start(self, req: MotionRequest):
        """Inicia uma rotina de movimento"""
        with self.lock:
            if self.status_dict["running"]:
                raise RuntimeError("Rotina já está rodando. Pare primeiro.")
            
            self.stop_evt.clear()
            self.status_dict = {
                "running": True,
                "routine": req.routine,
                "params": req.dict(),
                "started_at": None,  # ✅ Será definido DEPOIS do HOME terminar
                "elapsed": 0.0
            }
            
            self.thread = threading.Thread(
                target=self._run_routine,
                args=(req,),
                daemon=True
            )
            self.thread.start()
            print(f"🎬 Rotina '{req.routine}' iniciada - indo para HOME...")
    
    def stop(self):
        """Para a rotina e retorna suavemente para home"""
        with self.lock:
            if not self.status_dict["running"]:
                return
            
            print(f"⏹️  Parando rotina...")
            self.stop_evt.set()
        
        if self.thread:
            self.thread.join(timeout=2.0)
        
        with self.lock:
            self.status_dict["running"] = False
        
        # Retornar suavemente para home (0,0,h0+bias,0,0,0)
        print(f"🏠 Retornando para home...")
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
    
    def _run_routine(self, req: MotionRequest):
        """Thread principal que executa a rotina"""
        try:
            routine_name = req.routine
            duration = req.duration_s
            hz = req.hz
            dt = 1.0 / 60.0  # 60 Hz

            # --- NOVO: sempre começar da HOME e calibrar limites a partir dela ---
            self.home_and_calibrate_limits(go_home_duration=1.2)
            
            # ✅ IMPORTANTE: Só começar a contar o tempo DEPOIS do HOME terminar
            with self.lock:
                self.status_dict["started_at"] = time.time()
            
            # Calcular tempo de ramp (2s ou 20% da duração, o que for menor)
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
                
                # Limitar pose (com limites dinâmicos de Z, se disponíveis)
                pose = self._clamp_pose(pose)
                
                # Validar com inverse kinematics
                z_val = pose.get("z", self.platform.h0)
                L, valid, _ = self.platform.inverse_kinematics(
                    x=pose["x"], y=pose["y"], z=z_val,
                    roll=pose["roll"], pitch=pose["pitch"], yaw=pose["yaw"]
                )
                
                if not valid:
                    print(f"❌ Pose inválida em t={t:.2f}s: {pose}")
                    break
                
                # Converter para curso (mm)
                course_mm = self.platform.lengths_to_stroke_mm(L)
                stroke_range = self.platform.stroke_max - self.platform.stroke_min
                course_mm = np.clip(course_mm, 0.0, stroke_range)
                
                # Enviar setpoints via serial (todos de uma vez)
                try:
                    cmd = f"spmm6x={course_mm[0]:.3f},{course_mm[1]:.3f},{course_mm[2]:.3f},{course_mm[3]:.3f},{course_mm[4]:.3f},{course_mm[5]:.3f}"
                    self.serial_mgr.write_line(cmd)
                except Exception as e:
                    print(f"❌ Erro ao enviar comando serial: {e}")
                    break
                
                # Broadcast via WebSocket
                try:
                    # Pegar valores reais da telemetria
                    latest_telem = self.serial_mgr.latest or {}
                    actuators_real = [
                        latest_telem.get(f"Y{i+1}", 0.0) for i in range(6)
                    ]
                    
                    # DEBUG: Log primeira vez
                    if not hasattr(self, '_motion_debug_logged'):
                        print(f"🔍 DEBUG motion_tick:")
                        print(f"   latest_telem keys: {list(latest_telem.keys())}")
                        print(f"   actuators_real: {actuators_real}")
                        self._motion_debug_logged = True
                    
                    # Converter L para lista Python
                    if hasattr(L, 'tolist'):
                        actuators_cmd = L.tolist()
                    else:
                        actuators_cmd = list(L)
                    
                    payload = {
                        "type": "motion_tick",
                        "t": float(t),
                        "elapsed_ms": int(t * 1000),
                        "pose_cmd": pose,
                        "routine": routine_name,
                        "actuators_cmd": actuators_cmd,
                        "actuators_real": actuators_real
                    }
                    
                    if step == 0:  # Log apenas no primeiro tick
                        print(f"📊 Enviando motion_tick:")
                        print(f"   actuators_cmd={actuators_cmd}")
                        print(f"   actuators_real={actuators_real}")
                        print(f"   payload keys: {list(payload.keys())}")
                    
                    asyncio.run_coroutine_threadsafe(
                        ws_mgr.broadcast_json(payload),
                        self.serial_mgr.loop
                    )
                except Exception as e:
                    print(f"⚠️ Erro ao enviar motion_tick: {e}")
                    import traceback
                    traceback.print_exc()
                
                # Aguardar próximo tick
                t += dt
                step += 1
                time.sleep(dt)
            
            print(f"✅ Rotina '{routine_name}' finalizada ({step} passos)")
            
        except Exception as e:
            print(f"❌ Erro na rotina: {e}")
        finally:
            with self.lock:
                self.status_dict["running"] = False
    
    def _generate_pose(self, req: MotionRequest, t: float, hz: float, ramp: float) -> dict:
        """Gera a pose para um instante t baseado na rotina"""
        routine = req.routine
        h0 = self.platform.h0
        z_base = h0 + self._home_bias_mm  # ✅ Altura base elevada (consistente com HOME)
        
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
                    offset = z_base  # ✅ Usa altura base elevada
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
        h0 = self.platform.h0
        z_base = h0 + self._home_bias_mm  # ✅ Altura base elevada (consistente)
        
        pose["x"] = float(np.clip(pose["x"], -50.0, 50.0))
        pose["y"] = float(np.clip(pose["y"], -50.0, 50.0))

        # Z: usar limites dinâmicos calculados a partir da HOME quando disponíveis
        if self._z_limits_mm is not None:
            z_min, z_max = self._z_limits_mm
            pose["z"] = float(np.clip(pose.get("z", z_base), z_min, z_max))
        else:
            # Fallback: permite oscilação em torno da altura base elevada
            pose["z"] = float(np.clip(pose.get("z", z_base), z_base - 20.0, z_base + 20.0))

        pose["roll"]  = float(np.clip(pose["roll"],  -10.0, 10.0))
        pose["pitch"] = float(np.clip(pose["pitch"], -10.0, 10.0))
        pose["yaw"]   = float(np.clip(pose["yaw"],   -10.0, 10.0))
        
        return pose
    
    def _go_home_smooth(self, duration: float = 1.5):
        """Retorna suavemente para a pose home (0,0,h0+bias,0,0,0)"""
        dt = 1.0 / 60.0  # 60 Hz
        steps = int(max(1, duration / dt))

        pose = self._home_pose()
        print(f"🏠 _go_home_smooth: pose HOME = {pose}")
        
        # Verificar se serial está conectada
        if not (self.serial_mgr.ser and self.serial_mgr.ser.is_open):
            print("⚠️ AVISO: Serial NÃO conectada - movimento HOME será simulado apenas")
        
        sent_commands = 0
        for i in range(steps):
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
                # Enviar todos os 6 setpoints de uma vez
                cmd = f"spmm6x={course_mm[0]:.3f},{course_mm[1]:.3f},{course_mm[2]:.3f},{course_mm[3]:.3f},{course_mm[4]:.3f},{course_mm[5]:.3f}"
                self.serial_mgr.write_line(cmd)
                sent_commands += 1
                if i == 0:  # Log apenas primeiro comando
                    print(f"📤 Enviando comando HOME: {cmd}")
            except Exception as e:
                if i == 0:  # Log apenas primeiro erro
                    print(f"❌ Erro ao enviar comando HOME: {e}")
            
            time.sleep(dt)
        
        print(f"✅ _go_home_smooth concluído: {sent_commands}/{steps} comandos enviados")

motion_runner = MotionRunner(serial_mgr, platform)

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
        is_open = serial_mgr.ser is not None and serial_mgr.ser.is_open
        port_name = serial_mgr.ser.port if is_open else None
        return {
            "connected": is_open,
            "port": port_name
        }
    except Exception as e:
        return {
            "connected": False,
            "port": None
        }

@app.get("/telemetry")
def api_telemetry():
    return serial_mgr.latest or {}

@app.post("/serial/send")
def api_send_command(cmd: PIDCommand):
    """Envia comando livre pela serial"""
    try:
        serial_mgr.write_line(cmd.command)
        return {"message": "OK", "sent": cmd.command}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# -------------------- Endpoints PID Control --------------------
@app.post("/pid/setpoint")
def set_pid_setpoint(sp: PIDSetpoint):
    """Define setpoint em mm (global ou individual)"""
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
    try:
        if not 1 <= gains.piston <= 6:
            raise ValueError("Pistão deve ser 1-6")
        
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
    try:
        if not 1 <= ff.piston <= 6:
            raise ValueError("Pistão deve ser 1-6")
        
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
    try:
        if not 1 <= piston <= 6:
            raise ValueError("Pistão deve ser 1-6")
        
        serial_mgr.write_line(f"sel={piston}")
        return {"message": f"Pistão {piston} selecionado"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/pid/offset")
def set_pid_offset(piston: int, offset: float):
    """Define offset de calibração para um pistão específico (compensação de erro sistemático)"""
    try:
        if not 1 <= piston <= 6:
            raise ValueError("Pistão deve ser 1-6")
        
        serial_mgr.write_line(f"sel={piston}")
        time.sleep(0.01)
        serial_mgr.write_line(f"offset={offset:.3f}")
        
        return {"message": f"Offset do pistão {piston} = {offset:.3f} mm"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/pid/offset/all")
def set_pid_offset_all(offset: float):
    """Define offset de calibração para todos os pistões"""
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
        
        # Iniciar rotina
        motion_runner.start(req)
        
        return {
            "message": f"Rotina '{req.routine}' iniciada",
            "routine": req.routine,
            "params": req.dict()
        }
    
    except RuntimeError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/motion/stop")
def motion_stop():
    """Para a rotina de movimento atual"""
    try:
        motion_runner.stop()
        return {"message": "Rotina parada"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/motion/status")
def motion_status():
    """Retorna o status da rotina de movimento"""
    try:
        return motion_runner.status()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# -------------------- Plataforma (REST iguais) --------------------
@app.get("/config", response_model=PlatformConfig)
def get_config():
    return PlatformConfig(
        h0=platform.h0,
        stroke_min=platform.stroke_min,
        stroke_max=platform.stroke_max
    )

@app.post("/config")
def set_config(cfg: PlatformConfig):
    global platform
    platform = StewartPlatform(cfg.h0, cfg.stroke_min, cfg.stroke_max)
    return {"message": "Configuração atualizada"}

@app.post("/calculate", response_model=PlatformResponse)
def calculate_position(pose: PoseInput):
    z_value = pose.z if pose.z is not None else platform.h0
    L, valid, P = platform.inverse_kinematics(
        x=pose.x, y=pose.y, z=z_value,
        roll=pose.roll, pitch=pose.pitch, yaw=pose.yaw
    )
    perc = platform.stroke_percentages(L)
    
    # 🐛 DEBUG: Verificar validação individual
    print(f"\n📊 ENDPOINT /calculate:")
    print(f"   valid_global = {valid}")
    
    acts = [ActuatorData(id=i+1, length=float(L[i]),
                         percentage=float(perc[i]),
                         valid=platform.stroke_min <= L[i] <= platform.stroke_max)
            for i in range(6)]
    
    # 🐛 DEBUG: Mostrar o que será retornado
    for act in acts:
        print(f"   Atuador {act.id}: L={act.length:.2f}mm, valid={act.valid}")
    
    return PlatformResponse(
        pose=PoseInput(x=pose.x, y=pose.y, z=z_value,
                       roll=pose.roll, pitch=pose.pitch, yaw=pose.yaw),
        actuators=acts,
        valid=bool(valid),
        base_points=platform.B.tolist(),
        platform_points=P.tolist()
    )

@app.post("/apply_pose")
def apply_pose(req: ApplyPoseRequest):
    print(f"🚀 apply_pose recebido: x={req.x}, y={req.y}, z={req.z}, roll={req.roll}, pitch={req.pitch}, yaw={req.yaw}")
    z_value = req.z if req.z is not None else platform.h0
    L, valid, _ = platform.inverse_kinematics(
        x=req.x, y=req.y, z=z_value,
        roll=req.roll, pitch=req.pitch, yaw=req.yaw
    )
    if not valid:
        print("❌ Pose inválida")
        return {"applied": False, "valid": False, "message": "Pose inválida."}
    course_mm = platform.lengths_to_stroke_mm(L)
    print(f"✅ Cursos calculados (mm): {course_mm}")
    try:
        # Enviar todos os 6 setpoints de uma vez
        cmd = f"spmm6x={course_mm[0]:.3f},{course_mm[1]:.3f},{course_mm[2]:.3f},{course_mm[3]:.3f},{course_mm[4]:.3f},{course_mm[5]:.3f}"
        print(f"📤 Enviando comando: {cmd}")
        serial_mgr.write_line(cmd)
        print("✅ Comando enviado com sucesso")
    except Exception as e:
        print(f"❌ Erro ao enviar comando: {e}")
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
    scale: float = Field(1.0, description="Fator de escala para os ângulos (0.0-1.0)")

@app.post("/mpu/control")
def mpu_control(req: MPUControlRequest):
    """
    OTIMIZAÇÃO: Aplica controle da plataforma baseado em dados do MPU-6050.
    Calcula cinemática inversa e envia setpoints para os atuadores.
    """
    # 🐛 DEBUG: Log do request recebido
    print(f"\n🎯 /mpu/control recebido:")
    print(f"   roll={req.roll:.2f}°, pitch={req.pitch:.2f}°, yaw={req.yaw:.2f}°")
    print(f"   x={req.x:.2f}mm, y={req.y:.2f}mm, z={req.z}mm")
    print(f"   scale={req.scale}")
    
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
        cmd = f"spmm6x={course_mm[0]:.3f},{course_mm[1]:.3f},{course_mm[2]:.3f},{course_mm[3]:.3f},{course_mm[4]:.3f},{course_mm[5]:.3f}"
        print(f"📤 Enviando comando MPU: {cmd}")
        serial_mgr.write_line(cmd)
        print(f"✅ Comando MPU enviado com sucesso")
    except Exception as e:
        print(f"❌ Erro ao enviar comando MPU: {e}")
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
        "base_points": platform.base_points.tolist(),
        "platform_points": platform_points
    }

# -------------------- Joystick Control --------------------
@app.post("/joystick/pose")
def joystick_pose(req: JoystickPoseRequest):
    """
    Endpoint para controle por joystick (gamepad).
    
    Mapeia eixos normalizados do joystick (-1..1) para pose física da plataforma.
    
    Mapeamento:
    - lx, ly: Stick esquerdo -> translação X, Y (±10mm)
    - rx, ry: Stick direito -> rotação Pitch, Roll (±10°)
    - lt, rt: Triggers -> controle de Yaw (futuro)
    
    Parâmetros:
    - apply: Se True, envia comando serial para ESP32
    - z_base: Altura Z base (default = platform.h0 + 23mm, altura elevada segura)
    
    Retorna:
    - valid: Se a pose calculada é válida
    - applied: Se o comando foi enviado (apenas se apply=True e valid=True)
    - pose: Pose calculada
    - lengths_abs: Comprimentos absolutos dos atuadores
    - course_mm: Cursos em mm
    - base_points: Pontos da base
    - platform_points: Pontos da plataforma
    """
    # 🐛 DEBUG: Log do request recebido
    print(f"\n🎮 /joystick/pose recebido:")
    print(f"   lx={req.lx:.3f}, ly={req.ly:.3f}, rx={req.rx:.3f}, ry={req.ry:.3f}")
    print(f"   apply={req.apply}, z_base={req.z_base}")
    
    # Constantes de mapeamento (limites físicos da plataforma)
    MAX_TRANS_MM = 30.0   # ±30mm em X e Y
    MAX_ANGLE_DEG = 8.0  # ±10° em roll, pitch, yaw
    HOME_BIAS_MM = 68.0   # Altura elevada segura
    
    # Mapear eixos normalizados para valores físicos
    # lx -> X (direita positivo)
    # ly -> Y (para frente negativo, por isso inverte)
    x = np.clip(req.lx * MAX_TRANS_MM, -MAX_TRANS_MM, MAX_TRANS_MM)
    y = np.clip(-req.ly * MAX_TRANS_MM, -MAX_TRANS_MM, MAX_TRANS_MM)
    
    # Z usa valor base fornecido ou h0 + 23mm (altura elevada segura)
    z = req.z_base if req.z_base is not None else (platform.h0 + HOME_BIAS_MM)
    
    # rx -> Pitch (stick direito horizontal)
    # ry -> Roll (stick direito vertical, invertido)
    roll = np.clip(-req.ry * MAX_ANGLE_DEG, -MAX_ANGLE_DEG, MAX_ANGLE_DEG)
    pitch = np.clip(req.rx * MAX_ANGLE_DEG, -MAX_ANGLE_DEG, MAX_ANGLE_DEG)
    
    # Yaw por enquanto em 0 (pode usar lt/rt no futuro)
    yaw = 0.0
    # Exemplo futuro: yaw = (rt - lt) * MAX_ANGLE_DEG se ambos forem fornecidos
    
    print(f"🎮 Joystick -> Pose: x={x:.2f}, y={y:.2f}, z={z:.2f}, roll={roll:.2f}°, pitch={pitch:.2f}°, yaw={yaw:.2f}°")
    
    # Calcular cinemática inversa
    L, valid, P = platform.inverse_kinematics(
        x=x, y=y, z=z,
        roll=roll, pitch=pitch, yaw=yaw
    )
    
    # Se inválido, retornar imediatamente
    if not valid:
        print("❌ Pose de joystick inválida")
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
        try:
            cmd = f"spmm6x={course_mm[0]:.3f},{course_mm[1]:.3f},{course_mm[2]:.3f},{course_mm[3]:.3f},{course_mm[4]:.3f},{course_mm[5]:.3f}"
            print(f"📤 Enviando comando joystick: {cmd}")
            serial_mgr.write_line(cmd)
            applied = True
            print("✅ Comando joystick enviado com sucesso")
        except Exception as e:
            print(f"❌ Erro ao enviar comando joystick: {e}")
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

# -------------------- Raiz --------------------
@app.get("/")
def root():
    return {
        "name": API_TITLE,
        "version": API_VERSION,
        "endpoints": [
            "GET  /serial/ports",
            "POST /serial/open {port, baud?}",
            "POST /serial/close",
            "GET  /serial/status",
            "POST /serial/send {command}",
            "GET  /telemetry",
            "WS   /ws/telemetry",
            "POST /calculate",
            "POST /apply_pose",
            "POST /joystick/pose",
            "POST /mpu/control",
            "GET  /config",
            "POST /config",
            "POST /pid/setpoint",
            "POST /pid/gains",
            "POST /pid/gains/all",
            "POST /pid/feedforward",
            "POST /pid/feedforward/all",
            "POST /pid/settings",
            "POST /pid/offset",
            "POST /pid/offset/all",
            "POST /pid/manual/{action}",
            "POST /pid/select/{piston}",
            "POST /motion/start",
            "POST /motion/stop",
            "GET  /motion/status",
        ]
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
