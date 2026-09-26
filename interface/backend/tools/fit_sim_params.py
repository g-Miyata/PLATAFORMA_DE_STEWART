"""Ajusta vmax e zona morta dos atuadores do simulador aos ensaios reais.

Usa os ensaios de degrau em malha fechada (controle P, Kp=5) salvos em
MATLAB/workspace1-6.mat e imprime os valores para colar em sim_params.json.
O modelo e o ajuste ficam em sim_fit.py (os mesmos usados pelo gêmeo digital).

Uso (na pasta interface/backend):
    python tools/fit_sim_params.py
"""

import sys
from pathlib import Path

import scipy.io as sio

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sim_fit import fit_step_response  # noqa: E402

MAT_FILE = Path(__file__).resolve().parents[3] / "MATLAB" / "workspace1-6.mat"


def main():
    data = sio.loadmat(MAT_FILE)
    rows = {"vmax_adv_mm_s": [], "vmax_ret_mm_s": [], "deadzone_adv_pwm": [], "deadzone_ret_pwm": []}
    for p in range(1, 7):
        t = data[f"tempo{p}"].ravel()[::2]
        sp = data[f"degrau{p}"].ravel()[::2]
        resp = data[f"resposta{p}"].ravel()[::2]
        r = fit_step_response(t, sp, resp)
        print(f"Pistão {p}: fit {r['fit']:.1f}%  vmax +{r['vmax_adv_mm_s']}/-{r['vmax_ret_mm_s']} mm/s  "
              f"zona morta +{r['deadzone_adv_pwm']}/-{r['deadzone_ret_pwm']} PWM")
        for k in rows:
            rows[k].append(r[k])
    for k, v in rows.items():
        print(f'"{k}": {v},')


if __name__ == "__main__":
    main()
