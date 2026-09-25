"""Ajusta vmax e zona morta dos atuadores do simulador aos ensaios reais.

Usa os ensaios de degrau em malha fechada (controle P, Kp=5) salvos em
MATLAB/workspace1-6.mat e imprime os valores para colar em sim_params.json.

Modelo: dy/dt = c * max(0, |Kp*e| - zona_morta) * sinal(e), com batentes em 0..180 mm.
vmax = c * (255 - zona_morta), que é a forma usada em simulated_device.py.

Uso (na pasta interface/backend):
    python tools/fit_sim_params.py
"""

from pathlib import Path

import numpy as np
import scipy.io as sio
from scipy.optimize import least_squares

KP = 5.0
STEP_S = 0.005
MAT_FILE = Path(__file__).resolve().parents[3] / "MATLAB" / "workspace1-6.mat"


def simulate(params, t, sp, y0):
    c_up, c_dn, dz_up, dz_dn = params
    y, tt = y0, t[0]
    out = np.empty_like(t)
    for i, ti in enumerate(t):
        while tt < ti:
            u = KP * (np.interp(tt, t, sp) - y)
            v = c_up * max(0.0, u - dz_up) if u >= 0 else -c_dn * max(0.0, -u - dz_dn)
            y = min(180.0, max(0.0, y + v * STEP_S))
            tt += STEP_S
        out[i] = y
    return out


def main():
    data = sio.loadmat(MAT_FILE)
    rows = {"vmax_adv_mm_s": [], "vmax_ret_mm_s": [], "deadzone_adv_pwm": [], "deadzone_ret_pwm": []}
    for p in range(1, 7):
        t = data[f"tempo{p}"].ravel()[::2]
        sp = data[f"degrau{p}"].ravel()[::2]
        resp = data[f"resposta{p}"].ravel()[::2]
        sol = least_squares(
            lambda q: simulate(q, t, sp, resp[0]) - resp,
            [0.07, 0.07, 40, 40],
            bounds=([0.005, 0.005, 0, 0], [1, 1, 150, 150]),
        )
        c_up, c_dn, dz_up, dz_dn = sol.x
        fit = 100 * (1 - np.linalg.norm(sol.fun) / np.linalg.norm(resp - resp.mean()))
        print(f"Pistão {p}: fit {fit:.1f}%  vmax +{c_up * (255 - dz_up):.1f}/-{c_dn * (255 - dz_dn):.1f} mm/s  "
              f"zona morta +{dz_up:.1f}/-{dz_dn:.1f} PWM")
        rows["vmax_adv_mm_s"].append(round(c_up * (255 - dz_up), 1))
        rows["vmax_ret_mm_s"].append(round(c_dn * (255 - dz_dn), 1))
        rows["deadzone_adv_pwm"].append(round(dz_up, 1))
        rows["deadzone_ret_pwm"].append(round(dz_dn, 1))
    for k, v in rows.items():
        print(f'"{k}": {v},')


if __name__ == "__main__":
    main()
