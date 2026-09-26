"""Calibração da bancada: autoteste de cada pistão + recalibração do simulador.

Enquanto roda, um simulador "sombra" (twin.py) recebe os mesmos comandos e
avança com a telemetria. O processo:

1. vai ao home;
2. autoteste: cada pistão sozinho sobe e desce ±A mm em torno do home (os outros
   parados; A é conferido pela cinemática direta para não levar o tampo a uma pose
   inviável);
3. coleta: os seis juntos percorrem quase toda a altura (degraus e uma senoide),
   o que dá dados de PWM × velocidade nos dois sentidos;
4. ajusta vmax e zona morta de cada motor (sim_fit.fit_all) e compara a reprodução
   com os parâmetros atuais e os novos;
5. volta ao home e salva o relatório (JSON, com data) em calibration_reports/.
"""
import json
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Callable, Dict, List, Optional

import numpy as np

import sim_fit
from simulated_device import load_params
from twin import TwinShadow

AMPLITUDES_MM = (30.0, 20.0, 10.0)
Z_MARGIN_MM = 8.0
# passos "settle": esperam todos a menos de SETTLE_TOL_MM do alvo (no máximo SETTLE_TIMEOUT_S)
SETTLE_TOL_MM = 2.0
SETTLE_HOLD_S = 1.5
SETTLE_TIMEOUT_S = 25.0

# limites para apontar problemas
STUCK_FRACTION = 0.2
SLOW_FRACTION = 0.6
SLOW_MIN_MM_S = 4.0
SETTLE_MAX_MM = 3.0
NOISE_MAX_MM = 0.5


@dataclass
class Step:
    label: str
    phase: str
    seconds: float
    #: cursos (6, mm) no início do passo, ou função do tempo relativo → cursos
    target: object
    piston: Optional[int] = None
    kind: str = ""
    #: pistões que precisam chegar ao alvo antes de seguir (None = só o tempo mínimo)
    settle: Optional[List[int]] = None
    #: tempo máximo esperando a acomodação
    max_s: float = 0.0


@dataclass
class PistonPlan:
    amplitude: float
    home: float
    windows: Dict[str, List[float]] = field(default_factory=dict)


# ---------------------------------------------------------------- análise (pura)
def _mask(t: np.ndarray, w) -> np.ndarray:
    return (t >= w[0]) & (t <= w[1])


def _smooth(v: np.ndarray, n: int = 5) -> np.ndarray:
    return np.convolve(v, np.ones(n) / n, mode="same") if len(v) >= n else v


def analyze_piston(t_host: np.ndarray, t: np.ndarray, y: np.ndarray, plan: PistonPlan) -> dict:
    """Métricas de um pistão no autoteste: deslocamentos, velocidades, atraso, erro final e ruído.

    Os trechos (plan.windows) estão no relógio do PC (t_host); derivadas e tempos usam o
    relógio do firmware (t).
    """
    A = plan.amplitude
    out = {"amplitude_mm": A}
    up, down, back = (plan.windows.get(k) for k in ("up", "down", "back"))
    if not up or not down or not back:
        return {**out, "tested": False}

    def seg(w):
        m = _mask(t_host, w)
        return t[m], y[m]

    tu, yu = seg(up)
    td, yd = seg(down)
    tb, yb = seg(back)
    if min(len(yu), len(yd), len(yb)) < 8:
        return {**out, "tested": False}

    start = float(np.mean(yu[:3]))
    delta_up = float(np.mean(yu[-5:]) - start)
    delta_down = float(np.mean(yd[-5:]) - np.mean(yd[:3]))
    vu = _smooth(np.gradient(yu, tu))
    vd = _smooth(np.gradient(yd, td))
    moved = np.nonzero(np.abs(yu - start) > 1.0)[0]
    delay = float(tu[moved[0]] - tu[0]) if moved.size else None
    tail = tb >= tb[-1] - 0.5
    settle = max(abs(float(np.mean(yu[-5:])) - (plan.home + A)), abs(float(np.mean(yb[tail])) - plan.home))
    quiet = tb >= tb[-1] - 1.5
    tq, yq = tb[quiet], yb[quiet]
    noise = float(np.std(yq - np.polyval(np.polyfit(tq, yq, 1), tq))) if len(yq) > 5 else 0.0
    return {
        **out,
        "tested": True,
        "delta_up_mm": delta_up,
        "delta_down_mm": delta_down,
        "speed_up_mm_s": float(max(0.0, np.max(vu))),
        "speed_down_mm_s": float(max(0.0, -np.min(vd))),
        "delay_ms": None if delay is None else delay * 1000,
        "settle_err_mm": settle,
        "noise_mm": noise,
    }


def diagnose(results: List[dict]) -> List[dict]:
    """Aponta travado, invertido, lento, impreciso e ruidoso (comparando com os outros pistões)."""
    speeds = [min(r["speed_up_mm_s"], r["speed_down_mm_s"]) for r in results if r.get("tested")]
    median = float(np.median(speeds)) if speeds else 0.0
    out = []
    for i, r in enumerate(results):
        issues: List[str] = []
        if not r.get("tested"):
            issues.append("não testado")
        else:
            A = r["amplitude_mm"]
            if r["delta_up_mm"] < -STUCK_FRACTION * A and r["delta_down_mm"] > 2 * STUCK_FRACTION * A:
                issues.append("sensor ou motor invertido")
            elif abs(r["delta_up_mm"]) < STUCK_FRACTION * A and abs(r["delta_down_mm"]) < 2 * STUCK_FRACTION * A:
                issues.append("travado (não se moveu)")
            else:
                slowest = min(r["speed_up_mm_s"], r["speed_down_mm_s"])
                if slowest < max(SLOW_MIN_MM_S, SLOW_FRACTION * median):
                    issues.append("lento")
                if r["settle_err_mm"] > SETTLE_MAX_MM:
                    issues.append("não chega ao alvo")
            if r["noise_mm"] > NOISE_MAX_MM:
                issues.append("sensor ruidoso")
        out.append({"piston": i + 1, **r, "issues": issues, "status": "ok" if not issues else "alerta"})
    return out


# ---------------------------------------------------------------- execução
class CalibrationRunner:
    def __init__(self, serial_mgr, platform, format_cmd: Callable, params_file: Callable[[], Path], reports_dir: Callable[[], Path]):
        self.serial_mgr = serial_mgr
        self.platform = platform
        self.format_cmd = format_cmd
        self.params_file = params_file
        self.reports_dir = reports_dir
        #: encolhe os tempos e afrouxa a acomodação (só nos testes)
        self.time_scale = 1.0
        self.settle_tol = SETTLE_TOL_MM
        self.lock = threading.Lock()
        self.cancel_evt = threading.Event()
        self.abort_evt = threading.Event()
        self.thread: Optional[threading.Thread] = None
        self.state = {"running": False, "phase": None, "label": None, "progress": 0.0, "started_at": None, "error": None, "report_id": None, "steps": []}

    # ---------- estado ----------
    def is_running(self) -> bool:
        with self.lock:
            return bool(self.state["running"])

    def status(self) -> dict:
        with self.lock:
            return json.loads(json.dumps(self.state))

    def _set(self, **kw):
        with self.lock:
            self.state.update(kw)

    # ---------- comandos ----------
    def start(self):
        with self.lock:
            if self.state["running"]:
                raise RuntimeError("A calibração já está em andamento.")
            self.cancel_evt.clear()
            self.abort_evt.clear()
            self.state = {"running": True, "phase": "preparo", "label": "Preparando", "progress": 0.0, "started_at": time.time(), "error": None, "report_id": None, "steps": []}
        self.thread = threading.Thread(target=self._run, daemon=True)
        self.thread.start()

    def cancel(self):
        """Interrompe e volta ao home."""
        self.cancel_evt.set()
        if self.thread:
            self.thread.join(timeout=5)

    def abort(self):
        """Parada de emergência: interrompe sem se mover."""
        self.abort_evt.set()
        self.cancel_evt.set()
        if self.thread:
            self.thread.join(timeout=5)

    # ---------- plano ----------
    def _courses(self, L: np.ndarray) -> np.ndarray:
        rng = self.platform.stroke_max - self.platform.stroke_min
        return np.clip(np.asarray(L, dtype=float) - self.platform.stroke_min, 0.0, rng)

    def _feasible(self, L: np.ndarray) -> bool:
        """Os comprimentos existem de fato? (cinemática direta converge e reproduz L)."""
        if np.any(L < self.platform.stroke_min + 3) or np.any(L > self.platform.stroke_max - 3):
            return False
        pose, _ = self.platform.estimate_pose_from_lengths(L)
        if pose is None:
            return False
        L2, valid, _ = self.platform.inverse_kinematics(**pose)
        return bool(valid) and float(np.max(np.abs(np.asarray(L2) - L))) < 0.5

    def build_plan(self, home_z: float):
        s = self.time_scale
        L_home, valid, _ = self.platform.inverse_kinematics(x=0, y=0, z=home_z)
        if not valid:
            raise RuntimeError("Pose de home inválida.")
        L_home = np.asarray(L_home, dtype=float)
        home = self._courses(L_home)
        # o home espera os seis se acomodarem (partindo de longe, leva vários segundos)
        steps: List[Step] = [Step("Indo para o home", "home", 3 * s, home, settle=list(range(6)), max_s=SETTLE_TIMEOUT_S)]
        pistons: List[Optional[PistonPlan]] = []
        for i in range(6):
            amp = next((a for a in AMPLITUDES_MM if all(self._feasible(np.where(np.arange(6) == i, L_home + d, L_home)) for d in (a, -a))), None)
            if amp is None:
                pistons.append(None)
                continue
            pistons.append(PistonPlan(amplitude=amp, home=float(home[i])))
            up = home.copy()
            up[i] += amp
            down = home.copy()
            down[i] -= amp
            label = f"Autoteste do pistão {i + 1}"
            # espera o pistão chegar ao alvo (e ficar parado um pouco, para medir erro e ruído)
            steps += [
                Step(label, "autoteste", 4 * s, up, i, "up", settle=[i], max_s=12),
                Step(label, "autoteste", 6 * s, down, i, "down", settle=[i], max_s=16),
                Step(label, "autoteste", 4 * s, home.copy(), i, "back", settle=[i], max_s=12),
            ]
        # coleta: altura quase inteira, sem sair do curso
        def z_limit(direction: int) -> float:
            z = home_z
            while True:
                L, ok, _ = self.platform.inverse_kinematics(x=0, y=0, z=z + direction)
                L = np.asarray(L)
                if not ok or np.min(L - self.platform.stroke_min) < Z_MARGIN_MM or np.min(self.platform.stroke_max - L) < Z_MARGIN_MM:
                    return z
                z += direction

        z_hi, z_lo = z_limit(1), z_limit(-1)

        def at_z(z):
            L, _, _ = self.platform.inverse_kinematics(x=0, y=0, z=z)
            return self._courses(L)

        amp = 0.6 * min(z_hi - home_z, home_z - z_lo)
        steps += [
            Step("Subindo até perto do topo", "coleta", 8 * s, at_z(z_hi)),
            Step("Descendo até perto da base", "coleta", 12 * s, at_z(z_lo)),
            Step("Voltando ao meio", "coleta", 7 * s, home.copy()),
            Step("Onda lenta", "coleta", 25 * s, lambda tt: at_z(home_z + amp * np.sin(2 * np.pi * 0.08 * tt / s))),
            Step("Voltando ao home", "coleta", 3 * s, home.copy(), settle=list(range(6)), max_s=SETTLE_TIMEOUT_S),
        ]
        return steps, pistons, home

    # ---------- laço ----------
    def _settled(self, target, idx: List[int], since: float) -> bool:
        """Os pistões `idx` estão no alvo há pelo menos SETTLE_HOLD_S?"""
        Y = (self.serial_mgr.latest or {}).get("Y")
        now = time.monotonic()
        ok = bool(Y) and all(abs(float(Y[i]) - float(target[i])) < self.settle_tol for i in idx)
        if not ok:
            self._settled_at = None
            return False
        if getattr(self, "_settled_at", None) is None or self._settled_at < since:
            self._settled_at = now
        return now - self._settled_at >= SETTLE_HOLD_S * self.time_scale

    def _send(self, courses):
        self.serial_mgr.write_line(self.format_cmd(courses))

    def _run(self):
        twin: Optional[TwinShadow] = None
        home = None
        try:
            params = load_params(self.params_file())
            steps, pistons, home = self.build_plan(self.platform.h0)
            total = sum(st.seconds for st in steps)
            # etapas únicas, na ordem, para a lista de progresso da página
            labels: List[str] = []
            for st in steps:
                if st.label not in labels:
                    labels.append(st.label)
            self._set(steps=labels)
            twin = TwinShadow(params)
            self.serial_mgr.twin = twin
            # espera a primeira telemetria para a sombra partir da posição medida
            t0 = time.monotonic()
            while not twin.synced and time.monotonic() - t0 < 3:
                if self.cancel_evt.is_set():
                    raise InterruptedError
                time.sleep(0.05)
            if not twin.synced:
                raise RuntimeError("Sem telemetria da bancada.")

            done = 0.0
            for st in steps:
                self._set(phase=st.phase, label=st.label, progress=0.9 * done / total)
                start = time.monotonic()
                if not callable(st.target):
                    self._send(st.target)
                while True:
                    now = time.monotonic()
                    el = now - start
                    if el >= st.seconds and (st.settle is None or el >= max(st.max_s, st.seconds) or self._settled(st.target, st.settle, start)):
                        break
                    if self.cancel_evt.is_set():
                        raise InterruptedError
                    if callable(st.target):
                        self._send(st.target(el))
                    self._set(progress=0.9 * (done + min(el, st.seconds)) / total)
                    time.sleep(0.05)
                if st.piston is not None and pistons[st.piston] is not None:
                    pistons[st.piston].windows[st.kind] = [start, time.monotonic()]
                done += st.seconds

            self._set(phase="ajuste", label="Recalibrando o simulador", progress=0.92)
            data = twin.arrays()
            self.serial_mgr.twin = None
            if data is None or len(data[0]) < 100:
                raise RuntimeError("Poucos dados de telemetria durante a calibração.")
            t_host, t, Y, U, SP, ysim = data
            fit = sim_fit.fit_all(t, Y, U, SP, params)
            self._set(phase="relatorio", label="Montando o relatório", progress=0.97)
            results = [analyze_piston(t_host, t, Y[:, i], p) if p else {"tested": False, "amplitude_mm": 0.0} for i, p in enumerate(pistons)]
            report = self._report(diagnose(results), fit, sim_fit.rms(ysim, Y), float(time.time() - self.status()["started_at"]))
            self._set(running=False, phase="concluido", label="Concluída", progress=1.0, report_id=report["id"])
        except InterruptedError:
            self._set(running=False, phase="cancelado", label="Interrompida", error="Calibração interrompida.")
        except Exception as e:
            self._set(running=False, phase="erro", label="Erro", error=str(e))
        finally:
            self.serial_mgr.twin = None
            if home is not None and not self.abort_evt.is_set():
                try:
                    self._send(home)
                except Exception:
                    pass

    def _report(self, pistons: List[dict], fit: dict, rms_live: List[float], duration: float) -> dict:
        now = datetime.now()
        before, after = fit["rms_before"], fit["rms_after"]
        mean_b, mean_a = float(np.mean(before)), float(np.mean(after))
        report = {
            "id": now.strftime("%Y%m%d-%H%M%S"),
            "created_at": now.isoformat(timespec="seconds"),
            "duration_s": round(duration, 1),
            "simulated": bool(self.serial_mgr.simulated),
            "pistons": pistons,
            "alerts": sum(1 for p in pistons if p["status"] != "ok"),
            "fit": fit,
            "rms_live_mm": rms_live,
            "improvement_pct": round(100 * (1 - mean_a / mean_b), 1) if mean_b > 1e-9 else 0.0,
            "has_changes": any(p["ok"] for p in fit["pistons"]),
            "applied": False,
            "applied_at": None,
        }
        folder = self.reports_dir()
        folder.mkdir(parents=True, exist_ok=True)
        (folder / f"{report['id']}.json").write_text(json.dumps(report, ensure_ascii=False, indent=2, default=float), encoding="utf-8")
        return report
