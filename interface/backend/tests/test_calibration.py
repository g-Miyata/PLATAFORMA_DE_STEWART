import json
import time

import numpy as np
import pytest
from fastapi.testclient import TestClient

import app as backend
from calibration import PistonPlan, analyze_piston, diagnose
from simulated_device import SimulatedSerial, load_params


def _trial(kind="ok", A=30.0, home=70.0, speed=12.0, noise=0.0):
    """Série sintética de um pistão no autoteste: sobe A, desce 2A, volta."""
    dt = 0.033
    t, y = [], []
    pos = home
    windows = {}
    rng = np.random.default_rng(0)
    now = 0.0
    for name, target, secs in (("up", home + A, 5.0), ("down", home - A, 8.0), ("back", home, 5.0)):
        t0 = now
        while now - t0 < secs:
            sign = {"ok": 1, "invertido": -1, "travado": 0}[kind]
            err = target - (pos if kind != "invertido" else 2 * home - pos)
            step = np.clip(err, -speed * dt, speed * dt) * abs(sign)
            pos += step if kind != "invertido" else -step
            t.append(now)
            y.append(pos + (rng.normal(0, noise) if noise else 0.0))
            now += dt
        windows[name] = [t0, now]
    return np.array(t), np.array(y), PistonPlan(amplitude=A, home=home, windows=windows)


def test_analyze_healthy_piston():
    t, y, plan = _trial()
    r = analyze_piston(t, t, y, plan)
    assert r["tested"]
    assert r["delta_up_mm"] == pytest.approx(30, abs=1)
    assert r["speed_up_mm_s"] == pytest.approx(12, abs=1.5)
    assert r["settle_err_mm"] < 1


def test_diagnose_flags_problems():
    rows = []
    for kind, noise in (("ok", 0), ("ok", 0), ("invertido", 0), ("travado", 0), ("ok", 1.2), ("ok", 0)):
        t, y, plan = _trial(kind, noise=noise)
        rows.append(analyze_piston(t, t, y, plan))
    # um pistão lento (metade da velocidade)
    t, y, plan = _trial(speed=4.5)
    rows[5] = analyze_piston(t, t, y, plan)
    d = diagnose(rows)
    assert d[0]["status"] == "ok" and d[1]["status"] == "ok"
    assert "sensor ou motor invertido" in d[2]["issues"]
    assert "travado (não se moveu)" in d[3]["issues"]
    assert "sensor ruidoso" in d[4]["issues"]
    assert "lento" in d[5]["issues"]


@pytest.fixture
def client(tmp_path, monkeypatch):
    # simulador 3× mais rápido: a calibração espera os pistões chegarem de verdade
    fast = load_params()
    for k in ("vmax_adv_mm_s", "vmax_ret_mm_s"):
        fast[k] = [v * 3 for v in fast[k]]
    target = tmp_path / "sim_params.json"
    target.write_text(json.dumps(fast), encoding="utf-8")

    class FastSim(SimulatedSerial):
        def __init__(self, timeout=0.2):
            super().__init__(params=fast, timeout=timeout)

    monkeypatch.setattr(backend, "SimulatedSerial", FastSim)
    monkeypatch.setattr(backend, "SIM_PARAMS_FILE", target)
    monkeypatch.setattr(backend, "CALIBRATION_DIR", tmp_path / "reports")
    monkeypatch.setattr(backend.calibration_runner, "time_scale", 0.2)
    monkeypatch.setattr(backend.calibration_runner, "settle_tol", 6.0)
    with TestClient(backend.app) as c:
        yield c
        backend.calibration_runner.abort()
        c.post("/serial/close")


def test_full_calibration_on_simulator(client):
    assert client.post("/calibration/start").status_code == 409  # sem conexão
    client.post("/serial/open", json={"port": "SIMULADOR"})
    time.sleep(0.3)
    r = client.post("/calibration/start")
    assert r.status_code == 200
    # nada mais comanda a bancada enquanto calibra
    assert client.post("/apply_pose", json={"z": backend.HOME_Z_MM}).status_code == 409
    assert client.post("/motion/start", json={"routine": "sine_axis", "axis": "z"}).status_code == 409
    assert client.post("/pid/setpoint", json={"value": 10}).status_code == 409
    # o motion cueing também não engata durante a calibração
    r = client.post("/cueing/engage", json={})
    assert r.status_code == 409 and "calibração" in r.json()["detail"]

    deadline = time.time() + 150
    seen = []
    while time.time() < deadline:
        st = client.get("/calibration/status").json()
        if not st["running"]:
            break
        seen.append(st)
        time.sleep(0.5)
    assert st["phase"] == "concluido", st
    # a página sabe o que está sendo testado: pistão, alvo e descrição do passo
    testing = [s for s in seen if s["phase"] == "autoteste"]
    assert testing and all(s["piston"] in range(1, 7) and s["detail"] and len(s["target"]) == 6 for s in testing)
    assert all(1 <= s["step_index"] <= s["step_count"] for s in seen if s["step_count"])
    assert backend.serial_mgr.twin is None

    listing = client.get("/calibration/reports").json()["reports"]
    assert listing[0]["id"] == st["report_id"]
    rep = client.get(f"/calibration/reports/{st['report_id']}").json()
    assert rep["simulated"] is True
    assert len(rep["pistons"]) == 6
    for p in rep["pistons"]:
        assert p["tested"]
        assert not {"travado (não se moveu)", "sensor ou motor invertido"} & set(p["issues"])
    assert len(rep["fit"]["rms_before"]) == 6
    # depois da calibração a bancada volta a aceitar comandos
    assert client.post("/apply_pose", json={"z": backend.HOME_Z_MM}).json()["applied"] is True


def test_cancel_and_bad_report_id(client):
    client.post("/serial/open", json={"port": "SIMULADOR"})
    time.sleep(0.3)
    client.post("/calibration/start")
    time.sleep(0.5)
    st = client.post("/calibration/cancel").json()
    assert st["running"] is False and st["phase"] == "cancelado"
    assert client.get("/calibration/reports/abc").status_code == 404
    assert client.get("/calibration/reports/20990101-000000").status_code == 404
