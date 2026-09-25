# simulated_device.py
# Dispositivo virtual que imita o firmware pid-control-filter-spike-bno.ino.
#
# Expõe a mesma interface usada do `serial.Serial` (read/write/is_open/port/close),
# então o SerialManager, o MotionRunner e todos os endpoints funcionam sem
# hardware. Ele interpreta os mesmos comandos do firmware, roda o mesmo PID
# (P + I com anti-windup por tracking + feedforward de zona morta) sobre um
# modelo de atuador e emite telemetria no mesmo CSV de 14 campos:
#   ms;SP_mm;Y1..Y6;PWM1..PWM6
#
# Modelo do atuador (por pistão):
#   - velocidade proporcional ao PWM efetivo: v_alvo = vmax * (|u| - zona_morta) / (255 - zona_morta)
#   - dinâmica de 1ª ordem do motor: dv/dt = (v_alvo - v) / tau_motor
#   - batentes mecânicos em 0 e stroke_mm
# Parâmetros em sim_params.json, ajustados para reproduzir os ensaios de degrau
# do TCC (figuras 37-48: ~5 s para um degrau de 30 mm com os ganhos padrão).

import json
import random
import threading
import time
from pathlib import Path
from typing import Callable, List, Optional

SIM_PORT_NAME = "SIMULADOR"
MAX_PWM = 255.0
PARAMS_FILE = Path(__file__).with_name("sim_params.json")

# Mesmos padrões do firmware
DEFAULT_KP = [5.1478, 5.2, 5.2552, 5.0969, 5.4362, 5.1724]
DEFAULT_KI = [0.8226, 0.7, 0.6391, 0.8, 1.124, 0.8593]
DEFAULT_U0_ADV = [11, 17, 10.5, 14, 14.5, 12.5]
DEFAULT_U0_RET = [8, 12, 9.4, 14.5, 11.4, 11.4]
TT_TRACKING = 0.30
I_LIM = 1000.0
T_LEAK = 0.5
RETRACT_PWM = 80
ADV_PWM = 70


def load_params(path: Path = PARAMS_FILE) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


class _Piston:
    def __init__(self, i: int, p: dict):
        self.vmax_adv = float(p["vmax_adv_mm_s"][i])
        self.vmax_ret = float(p["vmax_ret_mm_s"][i])
        self.deadzone_adv = float(p["deadzone_adv_pwm"][i])
        self.deadzone_ret = float(p["deadzone_ret_pwm"][i])
        self.tau_motor = float(p["tau_motor_s"])
        self.stroke = float(p["stroke_mm"])
        self.pos = float(p["initial_pos_mm"])  # posição real (mm)
        self.vel = 0.0

        # Estado do "firmware"
        self.sp = 10.0
        self.lmm = 250.0
        self.kp = DEFAULT_KP[i]
        self.ki = DEFAULT_KI[i]
        self.kd = 0.0
        self.u0_adv = float(DEFAULT_U0_ADV[i])
        self.u0_ret = float(DEFAULT_U0_RET[i])
        self.offset = 0.0
        self.integ = 0.0
        self.last_y = self.pos
        self.pwm = 0.0  # |PWM| aplicado (0..255), como no CSV do firmware

    def measured(self) -> float:
        return self.pos + self.offset

    def drive(self, u: float, dt: float):
        """Aplica o comando com sinal (+ avança, - recua) no modelo físico."""
        mag = abs(u)
        if u >= 0:
            dz, vmax = self.deadzone_adv, self.vmax_adv
        else:
            dz, vmax = self.deadzone_ret, self.vmax_ret
        eff = max(0.0, mag - dz) / max(1.0, MAX_PWM - dz)
        v_target = (1.0 if u >= 0 else -1.0) * vmax * eff
        self.vel += (v_target - self.vel) * min(1.0, dt / self.tau_motor)
        self.pos += self.vel * dt
        if self.pos <= 0.0:
            self.pos, self.vel = 0.0, max(0.0, self.vel)
        elif self.pos >= self.stroke:
            self.pos, self.vel = self.stroke, min(0.0, self.vel)


class SimulatedSerial:
    """Substituto do serial.Serial que simula o ESP32-S3 e os 6 atuadores."""

    def __init__(
        self,
        params: Optional[dict] = None,
        timeout: float = 0.2,
        clock: Callable[[], float] = time.monotonic,
        realtime: bool = True,
        seed: Optional[int] = None,
    ):
        p = params if params is not None else load_params()
        self.port = SIM_PORT_NAME
        self.timeout = timeout
        self.is_open = True
        self._clock = clock
        self._realtime = realtime
        self._rng = random.Random(seed)
        self._noise_mm = float(p["noise_mm"])
        self._telem_period = float(p["telemetry_period_s"])
        self._substep = float(p["substep_s"])

        self.pistons: List[_Piston] = [_Piston(i, p) for i in range(6)]
        self.sel = 0
        self.deadband = 0.2
        self.min_pwm = 0
        self.manual_advance = False
        self.manual_retract = False

        self._lock = threading.Lock()
        self._rx = bytearray()  # bytes vindos do "PC"
        self._tx = bytearray()  # bytes para o "PC"
        self._t0 = clock()
        self._t_sim = self._t0
        self._next_telem = self._t0
        self._tx += b"sep=;\n"

    # ---------------- interface serial.Serial ----------------
    def write(self, data: bytes) -> int:
        if not self.is_open:
            raise OSError("Porta simulada fechada")
        with self._lock:
            self._rx += data
            while b"\n" in self._rx:
                line, _, rest = bytes(self._rx).partition(b"\n")
                self._rx = bytearray(rest)
                self._handle_command(line.decode("utf-8", errors="replace").strip())
        return len(data)

    def read(self, size: int = 1) -> bytes:
        """Avança a simulação até a próxima telemetria (ou até o timeout) e devolve bytes."""
        if not self.is_open:
            return b""
        deadline = self._clock() + self.timeout
        while True:
            with self._lock:
                self._advance_to(self._clock())
                if self._tx:
                    out = bytes(self._tx[:size])
                    del self._tx[:size]
                    return out
                wait = self._next_telem - self._clock()
            if not self._realtime:
                # Modo de teste: o relógio é externo, não dorme
                return b""
            if self._clock() >= deadline:
                return b""
            time.sleep(max(0.001, min(wait, deadline - self._clock())))

    def close(self):
        self.is_open = False

    # ---------------- simulação ----------------
    def step(self, seconds: float):
        """Avança a simulação por `seconds` (usado nos testes, com relógio fixo)."""
        with self._lock:
            self._advance_to(self._t_sim + seconds)

    def _advance_to(self, t: float):
        while self._t_sim < t:
            dt = min(self._substep, t - self._t_sim)
            self._control_step(dt)
            self._t_sim += dt
            if self._t_sim >= self._next_telem:
                self._emit_telemetry()
                self._next_telem += self._telem_period
                if self._next_telem < self._t_sim:
                    self._next_telem = self._t_sim + self._telem_period

    def _control_step(self, dt: float):
        manual = self.manual_advance or self.manual_retract
        for i, pz in enumerate(self.pistons):
            if manual:
                if i == self.sel:
                    u = ADV_PWM if self.manual_advance else -RETRACT_PWM
                else:
                    u = 0.0
                pz.pwm = abs(u)
                pz.drive(u, dt)
                continue

            y = pz.measured()
            e = pz.sp - y
            ydot = (y - pz.last_y) / dt
            pz.last_y = y

            if abs(e) <= self.deadband:
                pz.pwm = 0.0
                if pz.ki != 0.0:
                    pz.integ += (-pz.integ / T_LEAK) * dt
                pz.drive(0.0, dt)
                continue

            pid = pz.kp * e + pz.ki * pz.integ - pz.kd * ydot
            u_unsat = pid + (pz.u0_adv if pid >= 0 else -pz.u0_ret)
            u_sat = max(-MAX_PWM, min(MAX_PWM, u_unsat))
            if pz.ki != 0.0:
                pz.integ += (e + (u_sat - u_unsat) / TT_TRACKING) * dt
                pz.integ = max(-I_LIM, min(I_LIM, pz.integ))

            mag = min(MAX_PWM, abs(u_sat))
            if 0.0 < mag < self.min_pwm:
                mag = float(self.min_pwm)
            mag = float(round(mag))
            pz.pwm = mag
            pz.drive(mag if u_sat >= 0 else -mag, dt)

    def _emit_telemetry(self):
        ms = int((self._t_sim - self._t0) * 1000)
        ys = [pz.measured() + self._rng.gauss(0.0, self._noise_mm) for pz in self.pistons]
        fields = [str(ms), f"{self.pistons[0].sp:.3f}"]
        fields += [f"{y:.3f}" for y in ys]
        fields += [f"{pz.pwm:.0f}" for pz in self.pistons]
        self._tx += (";".join(fields) + "\n").encode()

    def _reply(self, text: str):
        self._tx += (text + "\n").encode()

    # ---------------- parser (espelha o firmware) ----------------
    def _handle_command(self, cmd: str):
        if not cmd:
            return
        sel = self.pistons[self.sel]
        low = cmd.lower()
        try:
            if cmd.startswith("sel="):
                self.sel = min(6, max(1, int(float(cmd[4:])))) - 1
            elif cmd.startswith("spmm6x="):
                vals = cmd[7:].split(",")
                if len(vals) != 6:
                    self._reply("ERR spmm6x formato: spmm6x=v1,v2,v3,v4,v5,v6")
                    return
                for pz, v in zip(self.pistons, vals):
                    pz.sp = min(pz.lmm, max(0.0, float(v)))
                self._reply("OK spmm6x aplicado")
            elif len(cmd) > 5 and cmd.startswith("spmm") and cmd[4] in "123456" and cmd[5] == "=":
                pz = self.pistons[int(cmd[4]) - 1]
                pz.sp = min(pz.lmm, max(0.0, float(cmd[6:])))
            elif cmd.startswith("spmm="):
                v = float(cmd[5:])
                for pz in self.pistons:
                    pz.sp = min(pz.lmm, max(0.0, v))
            elif cmd.startswith("kpmm="):
                sel.kp = float(cmd[5:])
            elif cmd.startswith("kimm="):
                sel.ki = float(cmd[5:])
            elif cmd.startswith("kdmm="):
                sel.kd = float(cmd[5:])
            elif cmd.startswith(("kpall=", "kiall=", "kdall=")):
                attr = {"kp": "kp", "ki": "ki", "kd": "kd"}[cmd[:2]]
                for pz in self.pistons:
                    setattr(pz, attr, float(cmd[6:]))
            elif cmd.startswith("dbmm="):
                self.deadband = abs(float(cmd[5:]))
            elif cmd.startswith("minpwm="):
                self.min_pwm = int(min(255, max(0, int(float(cmd[7:])))))
            elif cmd.startswith("lmm="):
                v = abs(float(cmd[4:]))
                if v > 1e-3:
                    sel.lmm = v
            elif cmd.startswith("u0aall="):
                for pz in self.pistons:
                    pz.u0_adv = abs(float(cmd[7:]))
                self._reply("OK U0_adv para todos")
            elif cmd.startswith("u0rall="):
                for pz in self.pistons:
                    pz.u0_ret = abs(float(cmd[7:]))
                self._reply("OK U0_ret para todos")
            elif cmd.startswith("u0a="):
                sel.u0_adv = abs(float(cmd[4:]))
                self._reply(f"OK U0_adv[{self.sel + 1}]={sel.u0_adv:.1f}")
            elif cmd.startswith("u0r="):
                sel.u0_ret = abs(float(cmd[4:]))
                self._reply(f"OK U0_ret[{self.sel + 1}]={sel.u0_ret:.1f}")
            elif cmd.startswith("offsetall="):
                v = float(cmd[10:])
                for pz in self.pistons:
                    pz.offset = v
                self._reply(f"OK offset para todos = {v:.3f} mm")
            elif cmd.startswith("offset="):
                sel.offset = float(cmd[7:])
                self._reply(f"OK offset[{self.sel + 1}]={sel.offset:.3f} mm")
            elif low == "a":
                self.manual_advance, self.manual_retract = True, False
            elif low == "r":
                self.manual_retract, self.manual_advance = True, False
            elif low == "ok":
                self._leave_manual()
                self._reply("OK modo manual desligado")
            elif low == "v?":
                self._reply(f"V[{self.sel + 1}]=0.0000 V | Y={sel.measured():.3f} mm")
            elif low == "recalibra":
                self._reply("OK: Comando de recalibragem enviado via ESP-NOW. (simulado)")
            elif low in ("zero", "mark100") or cmd.startswith(("cal=", "fc=", "vmaxmmps=")):
                self._reply(f"INFO: '{cmd}' ignorado no simulador")
            else:
                self._reply(f"ERR comando desconhecido: {cmd}")
        except ValueError:
            self._reply(f"ERR valor invalido: {cmd}")

    def _leave_manual(self):
        """Sai do modo manual mantendo a posição atual (sem tranco)."""
        self.manual_advance = self.manual_retract = False
        for pz in self.pistons:
            pz.integ = 0.0
            pz.last_y = pz.measured()
