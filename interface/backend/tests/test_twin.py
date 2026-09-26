import json
import shutil

import numpy as np
import pytest
from fastapi.testclient import TestClient

import app as backend
import sim_fit
from simulated_device import PARAMS_FILE, SimulatedSerial, load_params
from twin import TwinShadow


@pytest.fixture
def client():
    with TestClient(backend.app) as c:
        yield c
        c.post("/serial/close")


def _run_sim(params, setpoints, dt=0.025, hold_s=3.0):
    """Roda o simulador (sem ruído) em degraus e registra t, Y, PWM com sinal, sp."""
    p = dict(params, noise_mm=0.0)
    sim = SimulatedSerial(params=p, realtime=False, clock=lambda: 0.0, seed=1)
    sim.sync_positions([20.0] * 6)
    rows = []
    t = 0.0
    for target in setpoints:
        for pz in sim.pistons:
            pz.sp = target
        for _ in range(int(hold_s / dt)):
            sim.step(dt)
            t += dt
            sim.clear_output()
            Y = [pz.measured() for pz in sim.pistons]
            sp = [pz.sp for pz in sim.pistons]
            pwm = [pz.pwm * np.sign(s - y) for pz, s, y in zip(sim.pistons, sp, Y)]
            rows.append((t, Y, pwm, sp))
    t = np.array([r[0] for r in rows])
    return t, np.array([r[1] for r in rows]), np.array([r[2] for r in rows]), np.array([r[3] for r in rows])


def test_shadow_follows_the_same_commands():
    params = load_params()
    real = SimulatedSerial(params=dict(params, noise_mm=0.0), realtime=False, clock=lambda: 0.0, seed=2)
    shadow = TwinShadow(params)
    real.sync_positions([50.0] * 6)
    shadow.on_rx(0.0, [50.0] * 6, [0] * 6)
    cmd = "spmm6x=80,80,80,80,80,80"
    real.write((cmd + "\n").encode())
    shadow.on_tx(cmd)
    t = 0.0
    for _ in range(280):
        real.step(0.025)
        t += 0.025
        Y = [pz.measured() for pz in real.pistons]
        y_sim = shadow.on_rx(t, Y, [int(pz.pwm) for pz in real.pistons])
    assert np.allclose(y_sim, Y, atol=0.2)
    assert all(abs(y - 80) < 3 for y in Y)


def test_replay_matches_direct_simulation():
    params = load_params()
    t, Y, _, sp = _run_sim(params, [60.0, 30.0], hold_s=2.0)
    Y_rep = sim_fit.replay(params, t - t[0], sp, Y[0])
    assert max(sim_fit.rms(Y_rep, Y)) < 0.5


def test_fit_recovers_known_parameters(client):
    true = load_params()
    true = {**true, "vmax_adv_mm_s": [20.0] * 6, "vmax_ret_mm_s": [9.0] * 6, "deadzone_adv_pwm": [30.0] * 6, "deadzone_ret_pwm": [45.0] * 6}
    t, Y, U, SP = _run_sim(true, [120.0, 40.0, 150.0, 30.0])
    r = client.post("/twin/fit", json={"t": t.tolist(), "Y": Y.tolist(), "PWM": U.tolist(), "sp": SP.tolist()}).json()
    for p in r["pistons"]:
        assert p["ok"]
        assert abs(p["vmax_adv_mm_s"] - 20) < 2.5
        assert abs(p["vmax_ret_mm_s"] - 9) < 1.5
        assert p["fit_after"] > p["fit_before"]
    assert max(r["rms_after"]) < max(r["rms_before"])


def test_simulate_endpoint(client):
    t = [0, 0.5, 1.0, 1.5, 2.0]
    sp = [[40.0] * 6] * 5
    r = client.post("/twin/simulate", json={"t": t, "sp": sp, "y0": [20.0] * 6})
    assert r.status_code == 200
    Y = np.array(r.json()["Y_sim"])
    assert Y.shape == (5, 6) and np.all(Y[-1] > Y[0])


def test_params_saves_with_backup(client, tmp_path, monkeypatch):
    target = tmp_path / "sim_params.json"
    shutil.copy(PARAMS_FILE, target)
    monkeypatch.setattr(backend, "SIM_PARAMS_FILE", target)
    r = client.post("/twin/params", json={"params": {"vmax_adv_mm_s": [11, 11, 11, 11, 11, 11]}})
    assert r.status_code == 200
    assert (tmp_path / "sim_params.json.bak").exists()
    assert json.loads(target.read_text(encoding="utf-8"))["vmax_adv_mm_s"] == [11.0] * 6
    bad = client.post("/twin/params", json={"params": {"vmax_adv_mm_s": [500] * 6}})
    assert bad.status_code == 400


def test_telemetry_carries_twin_positions(client):
    client.post("/serial/open", json={"port": "SIMULADOR"})
    with client.websocket_connect("/ws/telemetry") as ws:
        for _ in range(200):
            msg = ws.receive_json()
            if msg["type"] == "telemetry" and msg.get("twin"):
                break
    assert len(msg["twin"]["Y_sim"]) == 6
    assert client.get("/twin/status").json()["active"] is True


def test_fit_keeps_direction_without_data():
    params = load_params()
    t, Y, U, _ = _run_sim(params, [150.0], hold_s=12.0)  # só avança
    cur = {k: float(params[k][0]) for k in sim_fit.PARAM_KEYS}
    r = sim_fit.fit_plant(t, Y[:, 0], U[:, 0], cur)
    assert r["vmax_ret_mm_s"] == pytest.approx(cur["vmax_ret_mm_s"], abs=0.05)
    assert r["deadzone_ret_pwm"] == pytest.approx(cur["deadzone_ret_pwm"], abs=0.05)
    assert "recuo" in (r["reason"] or "")
