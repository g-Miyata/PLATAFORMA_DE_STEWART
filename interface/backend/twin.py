"""Gêmeo digital: um simulador "sombra" que recebe os mesmos comandos enviados à
bancada e avança no mesmo ritmo da telemetria, para comparar real × simulado.

Também guarda um histórico (t, Y, PWM, setpoints) para recalibrar o simulador.
A telemetria do firmware traz só o |PWM| e o setpoint do pistão 1; os setpoints
dos seis vêm dos comandos que a sombra recebe, e o sinal do PWM vem do erro
(setpoint − posição).
"""
import threading
from collections import deque
from typing import List, Optional

import numpy as np

from simulated_device import SimulatedSerial, load_params

HISTORY_S = 300
TELEMETRY_HZ = 40


class TwinShadow:
    def __init__(self, params: Optional[dict] = None):
        p = dict(params if params is not None else load_params())
        p["noise_mm"] = 0.0
        self.params = p
        self.sim = SimulatedSerial(params=p, realtime=False, clock=lambda: 0.0, seed=0)
        self.lock = threading.Lock()
        self.last_t: Optional[float] = None
        self.synced = False
        self.history: deque = deque(maxlen=HISTORY_S * TELEMETRY_HZ)

    def on_tx(self, line: str):
        with self.lock:
            try:
                self.sim.write((line + "\n").encode("utf-8", errors="replace"))
            except Exception:
                pass
            self.sim.clear_output()

    def on_rx(self, t_host: float, t_dev: float, Y: List[float], PWM: List[int]) -> List[float]:
        """Avança a sombra até o instante da telemetria e devolve as posições simuladas.

        t_host: relógio do PC (para localizar trechos); t_dev: relógio do firmware (o
        campo ms da telemetria), que não sofre com linhas chegando em rajadas.
        """
        with self.lock:
            if not self.synced:
                self.sim.sync_positions(Y)
                self.synced = True
            elif self.last_t is not None and t_dev > self.last_t:
                # lacunas longas (porta pausada) não viram um salto de simulação
                self.sim.step(min(t_dev - self.last_t, 0.5))
            self.last_t = t_dev
            self.sim.clear_output()
            y_sim = [pz.measured() for pz in self.sim.pistons]
            sp = [pz.sp for pz in self.sim.pistons]
            self.history.append((t_host, t_dev, list(Y), list(PWM), sp, y_sim))
            return y_sim

    def resync(self, Y: List[float]):
        with self.lock:
            self.sim.sync_positions(Y)

    def arrays(self):
        """Histórico como arrays, só com tempos do firmware estritamente crescentes:
        t_host, t_dev (N), Y, PWM com sinal, sp, Y_sim (N×6)."""
        with self.lock:
            rows = list(self.history)
        if not rows:
            return None
        t_dev = np.array([r[1] for r in rows])
        keep = np.concatenate([[True], np.diff(t_dev) > 0])
        rows = [r for r, k in zip(rows, keep) if k]
        t_host = np.array([r[0] for r in rows])
        t_dev = np.array([r[1] for r in rows])
        Y = np.array([r[2] for r in rows], dtype=float)
        pwm = np.array([r[3] for r in rows], dtype=float)
        sp = np.array([r[4] for r in rows], dtype=float)
        ysim = np.array([r[5] for r in rows], dtype=float)
        signed = pwm * np.sign(sp - Y)
        return t_host, t_dev, Y, signed, sp, ysim
