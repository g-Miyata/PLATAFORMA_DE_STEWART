# server_serial_steweart.py
# FastAPI + Serial + WebSocket de telemetria com reconstrução de pose (LSQ)

import threading
import time
import json
import asyncio
from typing import List, Optional, Dict, Any

import numpy as np
from scipy.spatial.transform import Rotation as R
from scipy.optimize import least_squares
import serial
import serial.tools.list_ports

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

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

# -------------------- Stewart Platform --------------------
class StewartPlatform:
    def __init__(self, h0=432, stroke_min=200, stroke_max=600):
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
                bounds=([-100, -100, self.stroke_min, -30, -30, -30],
                        [ 100,  100, self.stroke_max,  30,  30,  30]),
                ftol=1e-6, xtol=1e-6, gtol=1e-6, max_nfev=200
            )
            if not res.success:
                return None, None
            x = res.x
            pose = dict(x=float(x[0]), y=float(x[1]), z=float(x[2]),
                        roll=float(x[3]), pitch=float(x[4]), yaw=float(x[5]))
            # recomputa P
            T = np.array([x[0], x[1], x[2]])
            Rm = R.from_euler('ZYX', [x[5], x[4], x[3]], degrees=True).as_matrix()
            P = (self.P0 @ Rm.T) + T
            return pose, P
        except Exception:
            return None, None

platform = StewartPlatform(h0=432, stroke_min=200, stroke_max=600)

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
        rm = []
        async with self.lock:
            for ws in self.active:
                try:
                    await ws.send_json(obj)
                except Exception:
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
        self.loop = asyncio.get_event_loop()
        # memória para LSQ partir de último chute
        self._last_pose_guess = np.array([0, 0, platform.h0, 0, 0, 0], dtype=float)

    def open(self, port: str, baud: int = BAUD):
        with self.lock:
            if self.ser and self.ser.is_open:
                raise RuntimeError("Serial já aberta")
            self.ser = serial.Serial(port, baud, timeout=0.2)
            self.stop_evt.clear()
            self.reader_thread = threading.Thread(target=self._reader_loop, daemon=True)
            self.reader_thread.start()

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
        return [p.device for p in serial.tools.list_ports.comports()]

    def write_line(self, s: str, ending: bytes = b"\n"):
        with self.lock:
            if not self.ser or not self.ser.is_open:
                raise RuntimeError("Serial não aberta")
            self.ser.write(s.encode("utf-8", errors="replace") + ending)

    def _reader_loop(self):
        buf = b""
        while not self.stop_evt.is_set():
            try:
                if not self.ser:
                    break
                data = self.ser.read(1024)
            except Exception:
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
        # Guarda raw
        self.latest = {"raw": text, "ts": now}

        if not text or not text.startswith("ms;"):
            # Broadcast raw mínimo
            self.loop.call_soon_threadsafe(asyncio.create_task, ws_mgr.broadcast_json({
                "type": "raw",
                "ts": now,
                "raw": text,
            }))
            return

        parts = text.split(CSV_DELIM)
        try:
            # Formato novo: ms;SP;Y1;...;Y6;PWM1;...;PWM6
            if len(parts) >= 14:
                sp = float(parts[1].replace(",", "."))
                Y = [float(parts[2+i].replace(",", ".")) for i in range(6)]
                PWM = [int(float(parts[8+i].replace(",", "."))) for i in range(6)]

                self.latest = {
                    "ts": now, "sp_mm": sp, "Y": Y, "PWM": PWM, "raw": text, "format": "new"
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

                payload = {
                    "type": "telemetry",
                    "ts": now,
                    "sp_mm": sp,
                    "Y": Y,
                    "PWM": PWM,
                    "actuator_lengths_abs": L_abs.tolist(),
                    "pose_live": pose_live,  # dict ou None
                    "platform_points_live": P_live.tolist() if P_live is not None else None,
                    "base_points": platform.B.tolist(),
                }
                self.loop.call_soon_threadsafe(asyncio.create_task, ws_mgr.broadcast_json(payload))

            # Formato antigo (um canal só)
            elif len(parts) >= 4:
                sp = float(parts[1].replace(",", "."))
                y0 = float(parts[2].replace(",", "."))
                pwm0 = int(float(parts[3].replace(",", ".")))
                self.latest = {
                    "ts": now, "sp_mm": sp, "Y": [y0], "PWM": [pwm0], "raw": text, "format": "old"
                }
                self.loop.call_soon_threadsafe(asyncio.create_task, ws_mgr.broadcast_json({
                    "type": "telemetry_legacy",
                    "ts": now, "sp_mm": sp, "Y0": y0, "PWM0": pwm0
                }))

        except Exception:
            self.loop.call_soon_threadsafe(asyncio.create_task, ws_mgr.broadcast_json({
                "type": "raw",
                "ts": now,
                "raw": text,
                "parse_error": True
            }))

serial_mgr = SerialManager()

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

@app.get("/telemetry")
def api_telemetry():
    return serial_mgr.latest or {}

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
    acts = [ActuatorData(id=i+1, length=float(L[i]),
                         percentage=float(perc[i]),
                         valid=platform.stroke_min <= L[i] <= platform.stroke_max)
            for i in range(6)]
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
    z_value = req.z if req.z is not None else platform.h0
    L, valid, _ = platform.inverse_kinematics(
        x=req.x, y=req.y, z=z_value,
        roll=req.roll, pitch=req.pitch, yaw=req.yaw
    )
    if not valid:
        return {"applied": False, "valid": False, "message": "Pose inválida."}
    course_mm = platform.lengths_to_stroke_mm(L)
    try:
        for i in range(6):
            serial_mgr.write_line(f"spmm{i+1}={course_mm[i]:.3f}")
            time.sleep(0.002)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erro TX serial: {e}")
    return {"applied": True, "valid": True, "setpoints_mm": course_mm.tolist()}

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
            "GET  /telemetry",
            "WS   /ws/telemetry",
            "POST /calculate",
            "POST /apply_pose",
            "GET  /config",
            "POST /config",
        ]
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
