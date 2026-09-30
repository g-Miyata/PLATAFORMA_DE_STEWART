"""Motion cueing: transforma o movimento do avião no FlightGear em poses da plataforma.

Algoritmo de washout clássico (Reid & Nahon), com três canais:
- translação: variação da força específica (o que o piloto sente, em torno de
  1 g) escalada, filtrada passa-alta e integrada até deslocamento, que volta ao
  centro sozinho. Usar a força específica, e não a aceleração cinemática, evita
  a pista lateral falsa das curvas coordenadas (ali a aceleração centrípeta é
  compensada pela inclinação e o piloto não sente nada de lado);
- coordenação de inclinação (tilt): a parte lenta da força específica vira
  inclinação do tampo, para a gravidade "empurrar" o piloto como a aceleração
  sustentada faria. Limitada em taxa para ficar abaixo do limiar vestibular;
- rotação: as velocidades angulares filtradas passa-alta dão o início das
  manobras e depois voltam ao zero.

Os pistões desta bancada são lentos (~10 a 16 mm/s medidos), então a pose final
passa por um limitador de velocidade das pernas: a plataforma nunca recebe um
comando mais rápido do que consegue seguir. O mesmo limitador faz as transições
de engatar/soltar.

Convenções:
- entrada (FlightGear, eixos do corpo do avião): x à frente, y à direita, z para
  baixo; força específica em m/s², velocidades angulares em °/s;
- saída (pose da plataforma, igual a /calculate): x à frente, y à esquerda, z
  para cima em mm; roll/pitch/yaw em graus na convenção ZYX de StewartPlatform,
  em que pitch positivo abaixa a frente (+X). Por isso pitch e yaw trocam de sinal.
"""
from __future__ import annotations

import json
import math
import re
import socket
import threading
import time
from collections import deque
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, List, Literal, Optional

import numpy as np
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

G = 9.80665
RATE_HZ = 60.0
STALE_S = 0.5
MAX_RECORD_S = 30 * 60
KEYS = ("x", "y", "z", "roll", "pitch", "yaw")

# Colunas dos voos gravados e casas decimais de cada uma (arquivo compacto)
FLIGHT_COLUMNS = ["t", "fx", "fy", "fz", "p", "q", "r", "roll", "pitch", "heading", "ias", "agl", "alt", "wow"]
FLIGHT_DECIMALS = [3, 3, 3, 3, 2, 2, 2, 2, 2, 1, 1, 1, 1, 0]
# v2: o bastante para o FlightGear redesenhar o voo (protocolo stewart-visual)
VISUAL_COLUMNS = ["lat", "lon", "gear", "flaps", "elevator", "aileron", "rudder", "speedbrake"]
VISUAL_DECIMALS = [7, 7, 3, 3, 3, 3, 3, 3]
FLIGHT_COLUMNS_V2 = FLIGHT_COLUMNS + VISUAL_COLUMNS
# v3: câmera (vista, giro, inclinação, zoom, distância da Chase View), para o replay repetir o enquadramento
CAMERA_COLUMNS = ["cam_view", "cam_hdg", "cam_pitch", "cam_fov", "cam_dist"]
CAMERA_DECIMALS = [0, 2, 2, 2, 2]
FLIGHT_COLUMNS_V3 = FLIGHT_COLUMNS_V2 + CAMERA_COLUMNS
VISUAL_LAYOUTS = (FLIGHT_COLUMNS_V2, FLIGHT_COLUMNS_V3)
DECIMALS = {
    len(FLIGHT_COLUMNS): FLIGHT_DECIMALS,
    len(FLIGHT_COLUMNS_V2): FLIGHT_DECIMALS + VISUAL_DECIMALS,
    len(FLIGHT_COLUMNS_V3): FLIGHT_DECIMALS + VISUAL_DECIMALS + CAMERA_DECIMALS,
}
FLIGHT_FORMAT = "stewart-cueing-flight"

# Cada tela usa o motor com um perfil; só um perfil manda na plataforma por vez
PROFILES = ("washout", "attitude")
PROFILE_LABEL = {"washout": "Simulador de voo", "attitude": "Orientação do avião"}


class CueingParams(BaseModel):
    f_scale: float = Field(0.5, ge=0, le=1.5, description="Escala da força específica na inclinação (tilt)")
    trans_scale: float = Field(0.3, ge=0, le=1.5, description="Escala da força específica na translação")
    trans_omega: float = Field(4.0, ge=0.5, le=10, description="Frequência do washout de surge/sway (rad/s)")
    trans_zeta: float = Field(1.0, ge=0.3, le=2, description="Amortecimento do washout de translação")
    trans_washout: float = Field(1.0, ge=0, le=5, description="Passa-alta de 1ª ordem da translação (rad/s)")
    heave_omega: float = Field(5.0, ge=0.5, le=10, description="Frequência do washout de heave (rad/s)")
    heave_washout: float = Field(1.0, ge=0, le=5, description="Passa-alta de 1ª ordem do heave (rad/s)")
    tilt_omega: float = Field(2.0, ge=0.2, le=10, description="Passa-baixa da coordenação de inclinação (rad/s)")
    tilt_rate_max: float = Field(2.0, ge=0.5, le=10, description="Taxa máxima da inclinação (°/s)")
    tilt_max: float = Field(8.0, ge=0, le=15, description="Inclinação máxima de tilt (°)")
    rot_scale: float = Field(0.3, ge=0, le=1.5, description="Escala das velocidades de roll/pitch")
    yaw_scale: float = Field(0.2, ge=0, le=1.5, description="Escala da velocidade de yaw")
    rot_omega: float = Field(0.8, ge=0.1, le=5, description="Frequência do washout de rotação (rad/s)")
    x_max: float = Field(30, ge=0, le=60)
    y_max: float = Field(30, ge=0, le=60)
    z_max: float = Field(25, ge=0, le=60)
    roll_max: float = Field(10, ge=0, le=15)
    pitch_max: float = Field(10, ge=0, le=15)
    yaw_max: float = Field(8, ge=0, le=15)
    z0: float = Field(570, ge=450, le=700, description="Altura neutra (mm)")
    leg_speed_max: float = Field(9.0, ge=1, le=100, description="Velocidade máxima das pernas (mm/s)")
    invert_pitch: bool = Field(False, description="Inverte o pitch (se a frente física da cadeira for o lado −X)")
    att_scale: float = Field(1.0, ge=0, le=1.5, description="Orientação do avião: escala de roll/pitch")
    att_limit: float = Field(12.0, ge=0, le=15, description="Orientação do avião: limite de roll/pitch (°)")
    att_z: float = Field(570, ge=450, le=700, description="Orientação do avião: altura (mm)")


def _clip(v: float, lim: float) -> float:
    return max(-lim, min(lim, v))


class Washout:
    """Washout clássico por amostra (estado interno, sem numpy: roda a cada frame)."""

    SUBSTEP_S = 0.004

    def __init__(self, params: CueingParams):
        self.p = params
        self.reset()

    def reset(self):
        self.started = False
        self.hp = [0.0, 0.0, 0.0]    # estado do passa-alta de 1ª ordem (translação)
        self.d = [0.0, 0.0, 0.0]     # deslocamento (m), eixos do avião
        self.dv = [0.0, 0.0, 0.0]
        self.lp = [0.0, 0.0]         # força específica lenta (x, y) para o tilt
        self.lpv = [0.0, 0.0]
        self.tilt = [0.0, 0.0]       # roll, pitch de tilt (°, convenção do avião)
        self.rx = [0.0, 0.0, 0.0]    # canal de rotação: ângulo = rv
        self.rv = [0.0, 0.0, 0.0]

    @staticmethod
    def _felt(s: Dict[str, float]):
        """Força específica em torno do voo nivelado (0 = 1 g para baixo, nada de lado)."""
        return (s["fx"], s["fy"], s["fz"] + G)

    def step(self, s: Dict[str, float], dt: float) -> Dict[str, float]:
        """Avança dt segundos com a amostra s e devolve a pose da plataforma (antes do limitador)."""
        p = self.p
        k = p.f_scale
        kt = p.trans_scale
        a = self._felt(s)
        if not self.started:
            # parte do regime: sem transitório só por começar no meio do voo
            self.lp = [k * s["fx"], k * s["fy"]]
            for i in range(3):
                wb = p.trans_washout if i < 2 else p.heave_washout
                self.hp[i] = kt * a[i] / wb if wb > 0 else 0.0
            self.started = True

        n = max(1, math.ceil(dt / self.SUBSTEP_S))
        h = dt / n
        rates = ((s["p"], p.rot_scale), (s["q"], p.rot_scale), (s["r"], p.yaw_scale))
        for _ in range(n):
            for i in range(3):
                om, wb = (p.trans_omega, p.trans_washout) if i < 2 else (p.heave_omega, p.heave_washout)
                zeta = p.trans_zeta
                u = kt * a[i] - wb * self.hp[i]
                self.hp[i] += u * h
                acc = u - 2 * zeta * om * self.dv[i] - om * om * self.d[i]
                self.dv[i] += acc * h
                self.d[i] += self.dv[i] * h
            for j, val in enumerate((k * s["fx"], k * s["fy"])):
                acc = p.tilt_omega ** 2 * (val - self.lp[j]) - 2 * p.tilt_omega * self.lpv[j]
                self.lpv[j] += acc * h
                self.lp[j] += self.lpv[j] * h
            for i, (w, sc) in enumerate(rates):
                acc = sc * w - 2 * p.rot_omega * self.rv[i] - p.rot_omega ** 2 * self.rx[i]
                self.rv[i] += acc * h
                self.rx[i] += self.rv[i] * h

        pitch_des = math.degrees(math.asin(max(-1.0, min(1.0, self.lp[0] / G))))
        roll_des = math.degrees(math.asin(max(-1.0, min(1.0, -self.lp[1] / G))))
        step = p.tilt_rate_max * dt
        for j, des in enumerate((roll_des, pitch_des)):
            des = _clip(des, p.tilt_max)
            self.tilt[j] += _clip(des - self.tilt[j], step)

        roll_a = self.rv[0] + self.tilt[0]
        pitch_a = self.rv[1] + self.tilt[1]
        yaw_a = self.rv[2]
        return {
            "x": _clip(self.d[0] * 1000.0, p.x_max),
            "y": _clip(-self.d[1] * 1000.0, p.y_max),
            "z": p.z0 + _clip(-self.d[2] * 1000.0, p.z_max),
            "roll": _clip(roll_a, p.roll_max),
            "pitch": _clip(pitch_a if p.invert_pitch else -pitch_a, p.pitch_max),
            "yaw": _clip(-yaw_a, p.yaw_max),
        }


class Attitude:
    """Tela Orientação do avião: a plataforma copia roll e pitch do avião (escalados e
    limitados), em altura fixa, sem washout. Mesma interface de Washout."""

    TAU_S = 0.15

    def __init__(self, params: CueingParams):
        self.p = params
        self.reset()

    def reset(self):
        self.roll: Optional[float] = None
        self.pitch = 0.0

    def step(self, s: Dict[str, float], dt: float) -> Dict[str, float]:
        p = self.p
        roll_t = _clip(p.att_scale * s["roll"], p.att_limit)
        pitch_t = _clip(p.att_scale * s["pitch"], p.att_limit)
        if self.roll is None:
            self.roll, self.pitch = roll_t, pitch_t
        a = min(1.0, dt / self.TAU_S)
        self.roll += a * (roll_t - self.roll)
        self.pitch += a * (pitch_t - self.pitch)
        # pitch positivo da plataforma abaixa a frente: nariz para cima vira pitch negativo
        return {"x": 0.0, "y": 0.0, "z": p.att_z, "roll": self.roll,
                "pitch": self.pitch if p.invert_pitch else -self.pitch, "yaw": 0.0}


FILTERS = {"washout": Washout, "attitude": Attitude}


class PoseShaper:
    """Última etapa antes dos pistões: mantém a pose dentro do curso e limita a
    velocidade das pernas. É o "modelo" da plataforma: a pose que ele devolve é a
    que a bancada consegue seguir."""

    def __init__(self, platform):
        self.platform = platform
        self.pose: Optional[Dict[str, float]] = None

    def legs(self, pose: Dict[str, float]) -> np.ndarray:
        L, _, _ = self.platform.inverse_kinematics(**pose)
        return np.asarray(L, dtype=float)

    def is_valid(self, pose: Dict[str, float]) -> bool:
        return bool(self.platform.inverse_kinematics(**pose)[1])

    def within_stroke(self, target: Dict[str, float], neutral: Dict[str, float]):
        """Encolhe a pose na direção do neutro até caber no curso (bissecção)."""
        if self.is_valid(target):
            return target, False
        lo, hi = 0.0, 1.0
        for _ in range(10):
            mid = (lo + hi) / 2
            cand = {k: neutral[k] + mid * (target[k] - neutral[k]) for k in KEYS}
            if self.is_valid(cand):
                lo = mid
            else:
                hi = mid
        return {k: neutral[k] + lo * (target[k] - neutral[k]) for k in KEYS}, True

    def reset(self, pose: Optional[Dict[str, float]]):
        self.pose = dict(pose) if pose else None

    def step(self, target: Dict[str, float], dt: float, leg_speed_max: float):
        """Anda de self.pose até target sem passar de leg_speed_max nas pernas."""
        if self.pose is None:
            self.pose = dict(target)
            return self.pose, False
        dmax = float(np.max(np.abs(self.legs(target) - self.legs(self.pose))))
        lim = leg_speed_max * dt
        if dmax <= lim:
            self.pose = dict(target)
            return self.pose, False
        s = lim / dmax
        self.pose = {k: self.pose[k] + s * (target[k] - self.pose[k]) for k in KEYS}
        return self.pose, True


class Perceived:
    """Força específica e velocidade angular que o ocupante sente na plataforma,
    na mesma convenção do avião (para comparar nos gráficos)."""

    ALPHA = 0.2

    def __init__(self):
        self.hist: deque = deque(maxlen=3)
        self.f = [0.0, 0.0, -G]
        self.w = [0.0, 0.0, 0.0]

    def update(self, pose: Dict[str, float], dt: float):
        self.hist.append(dict(pose))
        if len(self.hist) < 3:
            return
        p0, p1, p2 = self.hist
        acc = [(p2[k] - 2 * p1[k] + p0[k]) / (dt * dt) / 1000.0 for k in ("x", "y", "z")]
        a_b = (acc[0], -acc[1], -acc[2])
        phi, th = math.radians(p2["roll"]), math.radians(-p2["pitch"])
        f = (
            a_b[0] + G * math.sin(th),
            a_b[1] - G * math.sin(phi) * math.cos(th),
            a_b[2] - G * math.cos(phi) * math.cos(th),
        )
        w = ((p2["roll"] - p1["roll"]) / dt, -(p2["pitch"] - p1["pitch"]) / dt, -(p2["yaw"] - p1["yaw"]) / dt)
        a = self.ALPHA
        self.f = [self.f[i] + a * (f[i] - self.f[i]) for i in range(3)]
        self.w = [self.w[i] + a * (w[i] - self.w[i]) for i in range(3)]


def sample_from_row(row: List[float], columns: List[str] = FLIGHT_COLUMNS) -> Dict[str, float]:
    return {k: float(v) for k, v in zip(columns, row)}


VISUAL_FIELDS = ("lat", "lon", "alt", "roll", "pitch", "heading", "gear0", "gear1", "gear2", "flaps",
                 "elevator", "laileron", "raileron", "rudder", "speedbrake", "ias")


def interpolate(a: Dict[str, float], b: Dict[str, float], frac: float) -> Dict[str, float]:
    """Amostra entre a e b; a proa dá a volta por 0/360 pelo lado curto."""
    out = {k: a[k] + frac * (b[k] - a[k]) for k in a}
    for k in ("heading", "cam_hdg"):
        if k in a:
            dh = (b[k] - a[k] + 180.0) % 360.0 - 180.0
            out[k] = (a[k] + frac * dh) % 360.0
    if "cam_view" in a:
        out["cam_view"] = a["cam_view"] if frac < 0.5 else b["cam_view"]
    return out


def visual_datagram(s: Dict[str, float]) -> bytes:
    """Linha do protocolo stewart-visual (ordem de VISUAL_FIELDS) para uma amostra v2."""
    vals = [s["lat"], s["lon"], s["alt"], s["roll"], s["pitch"], s["heading"] % 360.0,
            s["gear"], s["gear"], s["gear"], s["flaps"], s["elevator"], s["aileron"], -s["aileron"],
            s["rudder"], s["speedbrake"], s["ias"]]
    # câmera gravada (v3) liga o controle da câmera no FlightGear; sem ela, a câmera fica livre
    if "cam_view" in s:
        vals += [1, round(s["cam_view"]), s["cam_hdg"] % 360.0, s["cam_pitch"], s["cam_fov"], s["cam_dist"]]
    else:
        vals += [0, 0, 0, 0, 0, 0]
    return (",".join(f"{v:.7f}" if i < 2 else f"{v:.3f}" for i, v in enumerate(vals)) + "\n").encode("ascii")


def analyze_flight(platform, params: CueingParams, rows: List[List[float]], max_points: int = 1500,
                   profile: str = "washout", columns: List[str] = FLIGHT_COLUMNS) -> Dict[str, Any]:
    """Roda o filtro do perfil + limitador sobre um voo inteiro (sem mover nada).

    Devolve estatísticas e séries reduzidas para desenhar o voo completo."""
    wash = FILTERS[profile](params)
    shaper = PoseShaper(platform)
    neutral = neutral_pose(params, profile)
    shaper.reset(neutral)
    per = Perceived()
    dt_out = 1.0 / RATE_HZ
    t0 = rows[0][0]
    duration = rows[-1][0] - t0
    n_out = int(duration * RATE_HZ) + 1
    stride = max(1, n_out // max_points)
    series: Dict[str, List[float]] = {k: [] for k in (
        "t", "ac_fx", "ac_fy", "ac_nz", "pf_fx", "pf_fy", "pf_nz", "ac_p", "ac_q", "ac_r", "pf_p", "pf_q", "pf_r",
        *KEYS)}
    peak = {k: 0.0 for k in KEYS}
    limited_ticks = clipped_ticks = 0
    idx, last_t, target = 0, None, neutral
    sample = sample_from_row(rows[0], columns)
    for tick in range(n_out):
        clock = tick * dt_out
        while idx < len(rows) and rows[idx][0] - t0 <= clock:
            sample = sample_from_row(rows[idx], columns)
            if last_t is not None and sample["t"] > last_t:
                target = wash.step(sample, min(sample["t"] - last_t, 0.05))
            elif last_t is None:
                target = wash.step(sample, dt_out)
            last_t = sample["t"]
            idx += 1
        fitted, clipped = shaper.within_stroke(target, neutral)
        pose, limited = shaper.step(fitted, dt_out, params.leg_speed_max)
        per.update(pose, dt_out)
        limited_ticks += limited
        clipped_ticks += clipped
        for k in KEYS:
            peak[k] = max(peak[k], abs(pose[k] - neutral[k]))
        if tick % stride == 0:
            series["t"].append(round(clock, 3))
            series["ac_fx"].append(sample["fx"])
            series["ac_fy"].append(sample["fy"])
            series["ac_nz"].append(-sample["fz"] / G)
            series["pf_fx"].append(per.f[0])
            series["pf_fy"].append(per.f[1])
            series["pf_nz"].append(-per.f[2] / G)
            for a, b in (("ac_p", "p"), ("ac_q", "q"), ("ac_r", "r")):
                series[a].append(sample[b])
            for i, a in enumerate(("pf_p", "pf_q", "pf_r")):
                series[a].append(per.w[i])
            for k in KEYS:
                series[k].append(pose[k])
    for k, v in series.items():
        series[k] = [round(float(x), 4) for x in v]
    return {
        "duration_s": duration,
        "peak": peak,
        "speed_limited_pct": 100.0 * limited_ticks / max(1, n_out),
        "stroke_limited_pct": 100.0 * clipped_ticks / max(1, n_out),
        "series": series,
    }


def neutral_pose(params: CueingParams, profile: str = "washout") -> Dict[str, float]:
    z = params.att_z if profile == "attitude" else params.z0
    return {"x": 0.0, "y": 0.0, "z": z, "roll": 0.0, "pitch": 0.0, "yaw": 0.0}


def parse_sample(data: Dict[str, Any]) -> Dict[str, float]:
    """Amostra da ponte: {t, f:[fx,fy,fz] m/s², w:[p,q,r] °/s, roll, pitch, ...}."""
    f = data.get("f") or [0.0, 0.0, -G]
    w = data.get("w") or [0.0, 0.0, 0.0]
    s = {
        "t": float(data["t"]),
        "fx": float(f[0]), "fy": float(f[1]), "fz": float(f[2]),
        "p": float(w[0]), "q": float(w[1]), "r": float(w[2]),
    }
    for k in ("roll", "pitch", "heading", "ias", "agl", "alt"):
        s[k] = float(data.get(k) or 0.0)
    s["wow"] = 1.0 if data.get("wow") else 0.0
    s["hold"] = bool(data.get("paused") or data.get("replay"))
    if data.get("lat") is not None:
        for k in VISUAL_COLUMNS:
            s[k] = float(data.get(k) or 0.0)
        if data.get("cam_view") is not None:
            for k in CAMERA_COLUMNS:
                s[k] = float(data.get(k) or 0.0)
    for k, v in s.items():
        if isinstance(v, float) and not math.isfinite(v):
            raise ValueError(f"valor inválido em {k}")
    if isinstance(data.get("aircraft"), str):
        s["aircraft"] = data["aircraft"][:60]
    return s


class CueingEngine:
    """Recebe amostras (ponte ao vivo ou voo gravado), roda o washout e comanda a
    plataforma a 60 Hz quando engatada."""

    def __init__(
        self,
        platform,
        *,
        send_course: Callable[[np.ndarray], None],
        serial_open: Callable[[], bool],
        measured_pose: Callable[[], Optional[Dict[str, float]]],
        broadcast: Callable[[dict], None],
        conflict: Callable[[], Optional[str]],
        flights_dir: Path,
        params_file: Path,
        visual_addr: tuple = ("127.0.0.1", 5511),
        autostart: bool = True,
    ):
        self.platform = platform
        self.send_course = send_course
        self.serial_open = serial_open
        self.measured_pose = measured_pose
        self.broadcast = broadcast
        self.conflict = conflict
        self.flights_dir = Path(flights_dir)
        self.params_file = Path(params_file)
        self.visual_addr = visual_addr
        self._visual_sock: Optional[socket.socket] = None

        self.lock = threading.RLock()
        self.params = self._load_params()
        self.profile = "washout"
        self.filters = {name: cls(self.params) for name, cls in FILTERS.items()}
        self.shaper = PoseShaper(platform)
        self.shaper.reset(neutral_pose(self.params))
        self.perceived = Perceived()

        self.source: Optional[str] = None          # "live" | "replay" | None
        self.aircraft: Optional[Dict[str, float]] = None
        self.aircraft_name: Optional[str] = None
        self.mca_pose = neutral_pose(self.params)
        self.pose = neutral_pose(self.params)
        self.limited = False
        self.clipped = False
        self.last_sample_wall = 0.0
        self.last_sim_t: Optional[float] = None
        self.mode = "off"                           # off | engaging | on | releasing
        self.events: deque = deque(maxlen=20)
        self.bridge = {"clients": 0, "samples": 0, "rate_hz": 0.0, "last_wall": 0.0}
        self._rate_window: deque = deque(maxlen=120)
        self.recording: Optional[List[List[float]]] = None
        self.recording_columns: List[str] = FLIGHT_COLUMNS
        self.replay: Optional[Dict[str, Any]] = None
        self._replay_stop = threading.Event()
        self._replay_thread: Optional[threading.Thread] = None
        self._idle_ticks = 0
        self._tick = 0

        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None
        if autostart:
            self.start()

    # ---------------- ciclo de vida ----------------
    def start(self):
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop, name="cueing", daemon=True)
        self._thread.start()

    def shutdown(self):
        self.stop_replay()
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=1.0)

    def _event(self, text: str, tone: str = "info"):
        self.events.append({"ts": time.time(), "text": text, "tone": tone})

    # ---------------- parâmetros ----------------
    def _load_params(self) -> CueingParams:
        try:
            return CueingParams(**json.loads(self.params_file.read_text(encoding="utf-8")))
        except (OSError, ValueError):
            return CueingParams()

    def set_params(self, params: CueingParams):
        with self.lock:
            self.params = params
            for f in self.filters.values():
                f.p = params

    def neutral(self) -> Dict[str, float]:
        return neutral_pose(self.params, self.profile)

    def _use_profile(self, profile: str):
        """Troca o perfil (só com a plataforma solta ou pelo mesmo perfil)."""
        if profile not in PROFILES:
            raise RuntimeError(f"Perfil desconhecido: {profile}")
        if profile == self.profile:
            return
        if self.mode != "off":
            raise RuntimeError(
                f"A plataforma está engatada pela tela {PROFILE_LABEL[self.profile]}. Solte por lá primeiro.")
        self.profile = profile
        self.filters[profile].reset()
        self.last_sim_t = None

    def save_params(self) -> str:
        with self.lock:
            data = self.params.model_dump()
        self.params_file.write_text(json.dumps(data, indent=2), encoding="utf-8")
        return str(self.params_file)

    # ---------------- entrada de amostras ----------------
    def ingest(self, sample: Dict[str, float]):
        """Amostra da ponte (FlightGear ao vivo)."""
        now = time.monotonic()
        with self.lock:
            self.bridge["samples"] += 1
            self.bridge["last_wall"] = now
            self._rate_window.append(now)
            if self.replay is not None:
                return
            if self.source != "live":
                self._begin_source("live")
            if sample.get("aircraft"):
                self.aircraft_name = sample["aircraft"]
            self._process(sample, now)
            if self.recording is not None and not sample["hold"]:
                if not self.recording:
                    self.recording_columns = (FLIGHT_COLUMNS_V3 if "cam_view" in sample
                                              else FLIGHT_COLUMNS_V2 if "lat" in sample else FLIGHT_COLUMNS)
                self.recording.append([sample.get(k, 0.0) for k in self.recording_columns])
                if sample["t"] - self.recording[0][0] > MAX_RECORD_S:
                    self._event("Gravação chegou a 30 min e parou de acumular.", "warning")
                    self.recording.pop()

    def _begin_source(self, source: str):
        self.source = source
        self.filters[self.profile].reset()
        self.last_sim_t = None

    def _process(self, sample: Dict[str, float], now: float):
        self.aircraft = sample
        self.last_sample_wall = now
        if sample.get("hold"):
            return
        if self.last_sim_t is None:
            dt = 1.0 / RATE_HZ
        else:
            dt = min(max(sample["t"] - self.last_sim_t, 0.0), 0.05)
        self.last_sim_t = sample["t"]
        if dt > 0:
            self.mca_pose = self.filters[self.profile].step(sample, dt)

    # ---------------- plataforma ----------------
    def engage(self, profile: str = "washout"):
        with self.lock:
            self._use_profile(profile)
            if not self.serial_open():
                raise RuntimeError("Serial não conectada. Conecte a bancada ou o simulador primeiro.")
            reason = self.conflict()
            if reason:
                raise RuntimeError(reason)
            if self.mode in ("on", "engaging"):
                return
            # parte de onde a plataforma está (telemetria), não de onde achamos que está
            start = self.measured_pose() or self.pose
            self.shaper.reset({k: float(start[k]) for k in KEYS})
            self.mode = "engaging"
            self._event("Plataforma engatada: indo suavemente até a pose do cueing.", "success")

    RELEASE_REASONS = {
        "botao": "botão Soltar",
        "pagina": "a página da tela foi fechada ou recarregada",
        "pagina-cache": "o navegador tirou a página da tela (pagehide)",
    }

    def release(self, reason: str = "botao", origin: str = ""):
        with self.lock:
            if self.mode in ("off", "releasing"):
                return
            self.mode = "releasing"
            why = self.RELEASE_REASONS.get(reason, reason[:40])
            self._event(f"Soltando ({why}{', ' + origin[:40] if origin else ''}): plataforma voltando ao neutro.")

    def emergency_stop(self):
        self._replay_stop.set()
        with self.lock:
            was = self.mode != "off" or self.replay is not None
            self.mode = "off"
            self.recording = None
            if was:
                self._event("Parada de emergência: cueing desligado.", "danger")

    # ---------------- gravação ----------------
    def start_recording(self):
        with self.lock:
            if self.source != "live":
                raise RuntimeError("Sem dados ao vivo do FlightGear para gravar.")
            self.recording = []

    def stop_recording(self, name: str, description: str = "") -> Dict[str, Any]:
        with self.lock:
            rows = self.recording
            self.recording = None
            aircraft = self.aircraft_name
            columns = self.recording_columns
        if not rows or len(rows) < 2:
            raise RuntimeError("A gravação está vazia.")
        decimals = DECIMALS[len(columns)]
        t0 = rows[0][0]
        data = []
        for r in rows:
            r = [r[0] - t0, *r[1:]]
            data.append([round(v, d) if d else int(round(v)) for v, d in zip(r, decimals)])
        # tempos estritamente crescentes (amostras repetidas do FG saem)
        clean = [data[0]]
        for r in data[1:]:
            if r[0] > clean[-1][0]:
                clean.append(r)
        flight_id = self._new_flight_id(name)
        doc = {
            "format": FLIGHT_FORMAT,
            "version": 3 if columns == FLIGHT_COLUMNS_V3 else 2 if columns == FLIGHT_COLUMNS_V2 else 1,
            "name": name.strip() or flight_id,
            "description": description.strip(),
            "aircraft": aircraft,
            "recorded_at": datetime.now().isoformat(timespec="seconds"),
            "duration_s": clean[-1][0],
            "columns": columns,
            "data": clean,
        }
        self.flights_dir.mkdir(parents=True, exist_ok=True)
        (self.flights_dir / f"{flight_id}.json").write_text(
            json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        return flight_meta(flight_id, doc)

    def discard_recording(self):
        with self.lock:
            self.recording = None

    def _new_flight_id(self, name: str) -> str:
        base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:48] or "voo"
        base = f"{datetime.now():%Y%m%d-%H%M}-{base}"
        fid, n = base, 2
        while (self.flights_dir / f"{fid}.json").exists():
            fid, n = f"{base}-{n}", n + 1
        return fid

    # ---------------- voos gravados ----------------
    def flight_path(self, flight_id: str) -> Path:
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", flight_id):
            raise HTTPException(status_code=400, detail="Identificador de voo inválido.")
        path = self.flights_dir / f"{flight_id}.json"
        if not path.exists():
            raise HTTPException(status_code=404, detail="Voo não encontrado.")
        return path

    def load_flight(self, flight_id: str) -> Dict[str, Any]:
        doc = json.loads(self.flight_path(flight_id).read_text(encoding="utf-8"))
        if doc.get("format") != FLIGHT_FORMAT or doc.get("columns") not in (FLIGHT_COLUMNS, FLIGHT_COLUMNS_V2, FLIGHT_COLUMNS_V3):
            raise HTTPException(status_code=400, detail="Arquivo de voo em formato desconhecido.")
        return doc

    def flight_start(self, flight_id: Optional[str]) -> Optional[Dict[str, float]]:
        """Onde abrir o FlightGear: primeira amostra do voo (v2), ou do primeiro voo que tiver posição."""
        ids = [flight_id] if flight_id else [f["id"] for f in self.list_flights() if f["visual"]]
        for fid in ids:
            try:
                doc = self.load_flight(fid)
            except HTTPException:
                continue
            if doc["columns"] in VISUAL_LAYOUTS:
                s = sample_from_row(doc["data"][0], doc["columns"])
                return {"lat": s["lat"], "lon": s["lon"], "alt": s["alt"], "heading": s["heading"]}
        return None

    def list_flights(self) -> List[Dict[str, Any]]:
        out = []
        for path in sorted(self.flights_dir.glob("*.json")):
            try:
                doc = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                continue
            if doc.get("format") == FLIGHT_FORMAT:
                out.append(flight_meta(path.stem, doc))
        return out

    def start_replay(self, flight_id: str, speed: float = 1.0, loop: bool = False,
                     profile: str = "washout", visual: bool = False):
        doc = self.load_flight(flight_id)
        rows = doc["data"]
        columns = doc["columns"]
        if len(rows) < 2:
            raise HTTPException(status_code=400, detail="Voo sem amostras.")
        with self.lock:
            self._use_profile(profile)
        self.stop_replay()
        with self.lock:
            self.recording = None
            self._begin_source("replay")
            self.replay = {
                "id": flight_id, "name": doc.get("name", flight_id), "t": 0.0,
                "duration": float(rows[-1][0]), "speed": speed, "loop": loop, "paused": False,
                "profile": profile, "has_visual": columns in VISUAL_LAYOUTS,
                "visual": bool(visual and columns in VISUAL_LAYOUTS),
            }
            self._replay_stop.clear()
            self._replay_thread = threading.Thread(target=self._replay_loop, args=(rows, columns),
                                                   name="cueing-replay", daemon=True)
            self._replay_thread.start()

    def set_replay(self, *, paused: Optional[bool] = None, speed: Optional[float] = None, loop: Optional[bool] = None,
                   visual: Optional[bool] = None):
        with self.lock:
            if self.replay is None:
                raise RuntimeError("Nenhum voo tocando.")
            for key, val in (("paused", paused), ("speed", speed), ("loop", loop)):
                if val is not None:
                    self.replay[key] = val
            if visual is not None:
                # voo antigo (v1) não tem posição para o FlightGear desenhar
                self.replay["visual"] = bool(visual and self.replay["has_visual"])

    def stop_replay(self):
        self._replay_stop.set()
        th = self._replay_thread
        if th and th.is_alive() and th is not threading.current_thread():
            th.join(timeout=1.0)
        self._replay_thread = None

    def _send_visual(self, rows: List[List[float]], columns: List[str], idx: int, clock: float):
        """Posição do avião no instante do replay, para o FlightGear desenhar (UDP, sem resposta)."""
        a = sample_from_row(rows[max(idx - 1, 0)], columns)
        if idx < len(rows):
            b = sample_from_row(rows[idx], columns)
            span = b["t"] - a["t"]
            s = interpolate(a, b, min(max((clock - a["t"]) / span, 0.0), 1.0)) if span > 0 else a
        else:
            s = a
        if self._visual_sock is None:
            self._visual_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            self._visual_sock.sendto(visual_datagram(s), self.visual_addr)
        except OSError:
            pass  # FlightGear fechado: a plataforma segue sem a tela

    def _replay_loop(self, rows: List[List[float]], columns: List[str] = FLIGHT_COLUMNS):
        clock, idx = 0.0, 0
        last = time.monotonic()
        last_visual = 0.0
        try:
            while not self._replay_stop.is_set():
                now = time.monotonic()
                with self.lock:
                    rp = self.replay
                    if rp is None:
                        break
                    if not rp["paused"]:
                        clock += (now - last) * rp["speed"]
                    last = now
                    while idx < len(rows) and rows[idx][0] <= clock:
                        s = sample_from_row(rows[idx], columns)
                        s["hold"] = False
                        self._process(s, now)
                        idx += 1
                    if rp.get("visual") and now - last_visual >= 1.0 / RATE_HZ:
                        last_visual = now
                        self._send_visual(rows, columns, idx, clock)
                    if rp["paused"]:
                        self.last_sample_wall = now  # pausa não é falta de dados
                    rp["t"] = min(clock, rp["duration"])
                    if idx >= len(rows):
                        if not rp["loop"]:
                            self._event(f"Voo \"{rp['name']}\" terminou.")
                            break
                        clock, idx = 0.0, 0
                        self.last_sim_t = None
                time.sleep(1.0 / 240.0)
        finally:
            with self.lock:
                self.replay = None
                if self.source == "replay":
                    self.source = None

    # ---------------- laço de saída (60 Hz) ----------------
    def _loop(self):
        period = 1.0 / RATE_HZ
        next_t = time.monotonic()
        while not self._stop.is_set():
            next_t += period
            try:
                self._step(period)
            except Exception as exc:  # o laço não pode morrer (nem por um print no console cp1252)
                try:
                    print(f"cueing: {exc!r}")
                except Exception:
                    pass
            delay = next_t - time.monotonic()
            if delay > 0:
                time.sleep(delay)
            else:
                next_t = time.monotonic()

    def _step(self, dt: float):
        now = time.monotonic()
        course = None
        with self.lock:
            p = self.params
            neutral = self.neutral()
            win = self._rate_window
            while win and now - win[0] > 2.0:
                win.popleft()
            self.bridge["rate_hz"] = (len(win) - 1) / (win[-1] - win[0]) if len(win) > 2 and win[-1] > win[0] else 0.0

            if self.source == "live" and now - self.last_sample_wall > STALE_S:
                self.source = None
                self.aircraft = None
                self._event("Sem dados do FlightGear: cueing voltando ao neutro.", "warning")
                if self.mode in ("on", "engaging"):
                    self.mode = "releasing"

            if self.mode != "off":
                reason = self.conflict()
                if reason:
                    self.mode = "off"
                    self._event(f"Cueing desengatado: {reason}", "warning")
                elif not self.serial_open():
                    self.mode = "off"
                    self._event("Serial desconectada: cueing desengatado.", "warning")

            target = self.mca_pose if self.source else neutral
            if self.mode == "releasing":
                target = neutral
            target, self.clipped = self.shaper.within_stroke(target, neutral)
            self.pose, self.limited = self.shaper.step(target, dt, p.leg_speed_max)
            if self.mode == "engaging" and _close(self.pose, target):
                self.mode = "on"
            elif self.mode == "releasing" and _close(self.pose, neutral):
                self.mode = "off"
                self._event("Plataforma no neutro.")
            if self.mode != "off":
                L = self.shaper.legs(self.pose)
                rng = self.platform.stroke_max - self.platform.stroke_min
                course = np.clip(self.platform.lengths_to_stroke_mm(L), 0.0, rng)
            self.perceived.update(self.pose, dt)
            # envio dentro do lock: depois que emergency_stop() volta, nenhum comando sai
            if course is not None:
                try:
                    self.send_course(course)
                except Exception as exc:
                    self.mode = "off"
                    self._event(f"Erro na serial, cueing desengatado: {exc}", "danger")

            active = self.source is not None or self.mode != "off" or self.recording is not None
            self._idle_ticks = 0 if active else self._idle_ticks + 1
            self._tick += 1
            payload = self._tick_payload() if (self._tick % 2 == 0 and self._idle_ticks < 60) else None

        if payload is not None:
            self.broadcast(payload)

    def _tick_payload(self) -> dict:
        ac = self.aircraft
        return {
            "type": "cueing_tick",
            "ts": time.time(),
            "profile": self.profile,
            "source": self.source,
            "mode": self.mode,
            "pose": _round_pose(self.pose),
            "mca_pose": _round_pose(self.mca_pose),
            "limited": self.limited,
            "clipped": self.clipped,
            "aircraft": None if ac is None else {
                "t": ac["t"], "f": [ac["fx"], ac["fy"], ac["fz"]], "w": [ac["p"], ac["q"], ac["r"]],
                "roll": ac["roll"], "pitch": ac["pitch"], "heading": ac["heading"],
                "ias": ac["ias"], "agl": ac["agl"], "alt": ac["alt"], "wow": bool(ac["wow"]),
            },
            "platform": {"f": [round(v, 4) for v in self.perceived.f], "w": [round(v, 3) for v in self.perceived.w]},
            "replay": dict(self.replay) if self.replay else None,
            "recording": self._recording_info(),
        }

    def _recording_info(self):
        rec = self.recording
        if rec is None:
            return None
        return {"samples": len(rec), "duration": (rec[-1][0] - rec[0][0]) if len(rec) > 1 else 0.0}

    def status(self) -> dict:
        now = time.monotonic()
        with self.lock:
            b = self.bridge
            return {
                "profile": self.profile,
                "source": self.source,
                "mode": self.mode,
                "serial_open": bool(self.serial_open()),
                "conflict": self.conflict(),
                "bridge": {
                    "connected": b["clients"] > 0,
                    "receiving": b["last_wall"] > 0 and now - b["last_wall"] < STALE_S,
                    "rate_hz": round(b["rate_hz"], 1),
                    "samples": b["samples"],
                },
                "replay": dict(self.replay) if self.replay else None,
                "recording": self._recording_info(),
                "events": list(self.events),
                "params": self.params.model_dump(),
            }


def _close(a: Dict[str, float], b: Dict[str, float]) -> bool:
    return all(abs(a[k] - b[k]) < (0.3 if k in ("x", "y", "z") else 0.05) for k in KEYS)


def _round_pose(p: Dict[str, float]) -> Dict[str, float]:
    return {k: round(float(p[k]), 3) for k in KEYS}


def flight_meta(flight_id: str, doc: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": flight_id,
        "name": doc.get("name", flight_id),
        "description": doc.get("description", ""),
        "aircraft": doc.get("aircraft"),
        "recorded_at": doc.get("recorded_at"),
        "duration_s": doc.get("duration_s") or (doc["data"][-1][0] if doc.get("data") else 0.0),
        "samples": len(doc.get("data") or []),
        # com posição e superfícies gravadas: o FlightGear consegue redesenhar o voo
        "visual": doc.get("columns") in VISUAL_LAYOUTS,
    }


# -------------------- rotas --------------------
class RecordStopRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    description: str = Field("", max_length=400)


class ProfileRequest(BaseModel):
    profile: Literal["washout", "attitude"] = "washout"


class ReplayStartRequest(ProfileRequest):
    flight: str
    speed: float = Field(1.0, ge=0.25, le=4.0)
    loop: bool = False
    visual: bool = False


class ReplayUpdateRequest(BaseModel):
    paused: Optional[bool] = None
    speed: Optional[float] = Field(None, ge=0.25, le=4.0)
    loop: Optional[bool] = None
    visual: Optional[bool] = None


def create_router(engine: CueingEngine) -> APIRouter:
    router = APIRouter(prefix="/cueing", tags=["motion cueing"])

    def guard(fn: Callable, *args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except RuntimeError as exc:
            raise HTTPException(status_code=409, detail=str(exc))

    @router.get("/status")
    def cueing_status():
        return engine.status()

    @router.get("/params")
    def cueing_params():
        return {"params": engine.params.model_dump(), "defaults": CueingParams().model_dump()}

    @router.post("/params")
    def cueing_set_params(params: CueingParams):
        engine.set_params(params)
        return {"params": params.model_dump()}

    @router.post("/params/save")
    def cueing_save_params():
        return {"saved": engine.save_params()}

    @router.post("/engage")
    def cueing_engage(req: Optional[ProfileRequest] = None):
        guard(engine.engage, (req or ProfileRequest()).profile)
        return {"mode": engine.mode, "profile": engine.profile}

    @router.post("/release")
    def cueing_release(reason: str = "botao", origin: str = ""):
        """reason/origin só identificam quem soltou (aparecem nos eventos)."""
        engine.release(reason, origin)
        return {"mode": engine.mode}

    @router.post("/record/start")
    def cueing_record_start():
        guard(engine.start_recording)
        return {"recording": True}

    @router.post("/record/stop")
    def cueing_record_stop(req: RecordStopRequest):
        return guard(engine.stop_recording, req.name, req.description)

    @router.post("/record/discard")
    def cueing_record_discard():
        engine.discard_recording()
        return {"recording": False}

    @router.get("/flights")
    def cueing_flights():
        return {"flights": engine.list_flights()}

    @router.get("/flights/{flight_id}/analysis")
    def cueing_flight_analysis(flight_id: str, profile: Literal["washout", "attitude"] = "washout"):
        doc = engine.load_flight(flight_id)
        with engine.lock:
            params = engine.params.model_copy()
        return {"flight": flight_meta(flight_id, doc),
                **analyze_flight(engine.platform, params, doc["data"], profile=profile, columns=doc["columns"])}

    @router.post("/flights/{flight_id}/delete")
    def cueing_flight_delete(flight_id: str):
        path = engine.flight_path(flight_id)
        if engine.replay and engine.replay.get("id") == flight_id:
            raise HTTPException(status_code=409, detail="Pare o voo antes de apagar.")
        path.unlink()
        return {"deleted": flight_id}

    @router.post("/replay/start")
    def cueing_replay_start(req: ReplayStartRequest):
        guard(engine.start_replay, req.flight, req.speed, req.loop, req.profile, req.visual)
        return {"replay": engine.replay}

    @router.post("/replay/update")
    def cueing_replay_update(req: ReplayUpdateRequest):
        guard(engine.set_replay, paused=req.paused, speed=req.speed, loop=req.loop, visual=req.visual)
        return {"replay": engine.replay}

    @router.post("/replay/stop")
    def cueing_replay_stop():
        engine.stop_replay()
        return {"replay": None}

    @router.websocket("/ingest")
    async def cueing_ingest(ws: WebSocket):
        """Canal da ponte fg-bridge.py --cueing: uma amostra JSON por mensagem."""
        await ws.accept()
        with engine.lock:
            engine.bridge["clients"] += 1
        try:
            while True:
                text = await ws.receive_text()
                try:
                    sample = parse_sample(json.loads(text))
                except (ValueError, KeyError, TypeError, IndexError):
                    continue
                engine.ingest(sample)
        except WebSocketDisconnect:
            pass
        finally:
            with engine.lock:
                engine.bridge["clients"] -= 1

    return router
