"""Identificação dos atuadores e reprodução no simulador (gêmeo digital).

Modelo da planta (o mesmo de simulated_device._Piston.drive):
    v = c · max(0, |u| − zona_morta) · sinal(u),   vmax = c · (255 − zona_morta)
com c e zona morta próprios para avanço (u > 0) e recuo (u < 0).

- fit_plant: ajusta c e a zona morta a partir de pares (PWM com sinal, velocidade),
  independente do controlador (PID) que gerou os dados.
- replay: reproduz setpoints no simulador completo (firmware PI + planta) e devolve
  as posições, para comparar com o medido.
- simulate_p_step / fit_step_response: modelo de ensaio de degrau com controle P,
  usado por tools/fit_sim_params.py com os ensaios do MATLAB.
"""
from typing import Dict, List, Optional

import numpy as np
from scipy.optimize import least_squares

from simulated_device import MAX_PWM, SimulatedSerial

PARAM_KEYS = ("vmax_adv_mm_s", "vmax_ret_mm_s", "deadzone_adv_pwm", "deadzone_ret_pwm")
# faixas plausíveis para os atuadores da bancada e exigências mínimas de dados
VMAX_RANGE = (2.0, 60.0)
DZ_RANGE = (0.0, 140.0)
MIN_SAMPLES = 60
MIN_PWM_SPREAD = 40.0
# melhora mínima na reprodução para trocar os parâmetros de um pistão
MIN_GAIN_MM = 0.25
MIN_GAIN_REL = 0.15


def plant_velocity(u: np.ndarray, c_up: float, c_dn: float, dz_up: float, dz_dn: float) -> np.ndarray:
    u = np.asarray(u, dtype=float)
    up = c_up * np.maximum(0.0, u - dz_up)
    dn = -c_dn * np.maximum(0.0, -u - dz_dn)
    return np.where(u >= 0, up, dn)


def fit_percent(residual: np.ndarray, target: np.ndarray) -> float:
    """Índice de ajuste (NRMSE, 100% = perfeito), como o compare do MATLAB."""
    den = np.linalg.norm(target - np.mean(target))
    return float(100.0 * (1.0 - np.linalg.norm(residual) / den)) if den > 1e-9 else 0.0


def _smooth(v: np.ndarray, n: int = 5) -> np.ndarray:
    if len(v) < n:
        return v
    k = np.ones(n) / n
    return np.convolve(v, k, mode="same")


def fit_plant(t: np.ndarray, y: np.ndarray, u: np.ndarray, current: Dict[str, float], stroke: float = 180.0) -> Dict[str, object]:
    """Ajusta vmax e zona morta de um pistão. `current` = parâmetros atuais do mesmo pistão.

    Descarta amostras perto dos batentes (a velocidade é cortada ali). Se faltar
    movimento num dos sentidos, mantém o valor atual desse sentido.
    """
    t = np.asarray(t, dtype=float)
    y = np.asarray(y, dtype=float)
    u = np.asarray(u, dtype=float)
    v = _smooth(np.gradient(y, t))
    u = _smooth(u)
    mask = (y > 1.0) & (y < stroke - 1.0) & np.isfinite(v)
    t, y, u, v = t[mask], y[mask], u[mask], v[mask]
    # cada sentido precisa de amostras suficientes e de PWM variado (senão a
    # zona morta e a inclinação da reta ficam indeterminadas)
    adv = u > current["deadzone_adv_pwm"] + 5
    ret = u < -(current["deadzone_ret_pwm"] + 5)
    def enough(m):
        return int(np.sum(m)) >= MIN_SAMPLES and np.ptp(np.abs(u[m])) >= MIN_PWM_SPREAD if np.any(m) else False
    fit_adv, fit_ret = enough(adv), enough(ret)

    def to_c(vmax, dz):
        return vmax / max(1.0, MAX_PWM - dz)

    x_cur = np.array([
        to_c(current["vmax_adv_mm_s"], current["deadzone_adv_pwm"]),
        to_c(current["vmax_ret_mm_s"], current["deadzone_ret_pwm"]),
        current["deadzone_adv_pwm"],
        current["deadzone_ret_pwm"],
    ])
    before = fit_percent(plant_velocity(u, *x_cur) - v, v) if len(v) else 0.0
    if len(v) < 60 or not (fit_adv or fit_ret):
        return {"ok": False, "reason": "pouco movimento para ajustar", "samples": int(len(v)), **current, "fit_before": before, "fit_after": before}

    sol = least_squares(lambda x: plant_velocity(u, *x) - v, x_cur, bounds=([0.005, 0.005, 0, 0], [1, 1, 150, 150]))
    x = sol.x.copy()
    notes = []
    # sem dados num sentido, ou resultado fisicamente implausível: mantém o atual
    for ok, ic, idz, label in ((fit_adv, 0, 2, "avanço"), (fit_ret, 1, 3, "recuo")):
        vmax = x[ic] * (MAX_PWM - x[idz])
        if not ok:
            notes.append(f"{label}: pouco movimento")
        elif not (VMAX_RANGE[0] <= vmax <= VMAX_RANGE[1]) or not (DZ_RANGE[0] <= x[idz] <= DZ_RANGE[1]):
            notes.append(f"{label}: resultado implausível")
            ok = False
        if not ok:
            x[ic], x[idz] = x_cur[ic], x_cur[idz]
    after = fit_percent(plant_velocity(u, *x) - v, v)
    changed = not np.allclose(x, x_cur)
    return {
        "ok": bool(changed),
        "reason": "; ".join(notes) if notes else None,
        "samples": int(len(v)),
        "vmax_adv_mm_s": round(float(x[0] * (MAX_PWM - x[2])), 2),
        "vmax_ret_mm_s": round(float(x[1] * (MAX_PWM - x[3])), 2),
        "deadzone_adv_pwm": round(float(x[2]), 1),
        "deadzone_ret_pwm": round(float(x[3]), 1),
        "fit_before": before,
        "fit_after": after,
    }


def replay(params: dict, t: np.ndarray, sp: np.ndarray, y0: List[float]) -> np.ndarray:
    """Reproduz os setpoints (N×6, mm de curso) no simulador e devolve as posições (N×6)."""
    p = dict(params)
    p["noise_mm"] = 0.0
    sim = SimulatedSerial(params=p, realtime=False, clock=lambda: 0.0, seed=0)
    sim.sync_positions(list(y0))
    t = np.asarray(t, dtype=float)
    sp = np.asarray(sp, dtype=float)
    out = np.empty((len(t), 6))
    for k in range(len(t)):
        for pz, s in zip(sim.pistons, sp[k]):
            pz.sp = float(s)
        if k:
            sim.step(max(0.0, t[k] - t[k - 1]))
        sim.clear_output()
        out[k] = [pz.measured() for pz in sim.pistons]
    return out


def rms(a: np.ndarray, b: np.ndarray) -> List[float]:
    return np.sqrt(np.mean((np.asarray(a) - np.asarray(b)) ** 2, axis=0)).tolist()


# ---------------- ensaio de degrau com controle P (MATLAB) ----------------
KP_STEP = 5.0
STEP_S = 0.005


def simulate_p_step(params, t, sp, y0, stroke: float = 180.0):
    c_up, c_dn, dz_up, dz_dn = params
    y, tt = y0, t[0]
    out = np.empty_like(t)
    for i, ti in enumerate(t):
        while tt < ti:
            u = KP_STEP * (np.interp(tt, t, sp) - y)
            v = c_up * max(0.0, u - dz_up) if u >= 0 else -c_dn * max(0.0, -u - dz_dn)
            y = min(stroke, max(0.0, y + v * STEP_S))
            tt += STEP_S
        out[i] = y
    return out


def fit_step_response(t, sp, resp) -> Optional[dict]:
    sol = least_squares(
        lambda q: simulate_p_step(q, t, sp, resp[0]) - resp,
        [0.07, 0.07, 40, 40],
        bounds=([0.005, 0.005, 0, 0], [1, 1, 150, 150]),
    )
    c_up, c_dn, dz_up, dz_dn = sol.x
    return {
        "fit": fit_percent(sol.fun, resp),
        "vmax_adv_mm_s": round(c_up * (MAX_PWM - dz_up), 1),
        "vmax_ret_mm_s": round(c_dn * (MAX_PWM - dz_dn), 1),
        "deadzone_adv_pwm": round(dz_up, 1),
        "deadzone_ret_pwm": round(dz_dn, 1),
    }


def fit_all(t: np.ndarray, Y: np.ndarray, U: np.ndarray, SP: np.ndarray, current: dict) -> dict:
    """Ajusta os seis pistões e valida reproduzindo os mesmos setpoints no simulador.

    Um pistão só recebe parâmetros novos se a reprodução dele melhorar; senão fica
    com os atuais (e o motivo aparece em `reason`).
    """
    t = np.asarray(t, dtype=float)
    Y = np.asarray(Y, dtype=float)
    U = np.asarray(U, dtype=float)
    SP = np.asarray(SP, dtype=float)
    stroke = float(current["stroke_mm"])
    pistons = []
    proposed = {k: list(current[k]) for k in PARAM_KEYS}
    for i in range(6):
        cur = {k: float(current[k][i]) for k in PARAM_KEYS}
        r = fit_plant(t, Y[:, i], U[:, i], cur, stroke)
        pistons.append(r)
        if r["ok"]:
            for k in PARAM_KEYS:
                proposed[k][i] = r[k]
    t_rel = t - t[0]
    rms_before = rms(replay(current, t_rel, SP, Y[0]), Y)
    rms_after = rms(replay({**current, **proposed}, t_rel, SP, Y[0]), Y)
    for i, r in enumerate(pistons):
        if not r["ok"]:
            continue
        gain = rms_before[i] - rms_after[i]
        # mudança só vale se melhorar de verdade (ruído e jitter de tempo dão ~décimos de mm)
        if gain < MIN_GAIN_MM or rms_after[i] > rms_before[i] * (1 - MIN_GAIN_REL):
            for k in PARAM_KEYS:
                proposed[k][i] = current[k][i]
            r["ok"] = False
            r["reason"] = "não melhorou a reprodução" if gain <= 0 else "melhora pequena demais para mudar"
            rms_after[i] = rms_before[i]
    return {
        "samples": int(len(t)),
        "pistons": pistons,
        "current": {k: list(current[k]) for k in PARAM_KEYS},
        "proposed": proposed,
        "rms_before": rms_before,
        "rms_after": rms_after,
    }
