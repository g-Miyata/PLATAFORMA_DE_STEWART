import time

import numpy as np
import pytest
from fastapi.testclient import TestClient

import app as backend


@pytest.fixture
def client():
    with TestClient(backend.app) as c:
        yield c
        c.post("/serial/close")


def wait_for(cond, timeout=3.0):
    t0 = time.time()
    while time.time() - t0 < timeout:
        if cond():
            return True
        time.sleep(0.05)
    return False


# ---------------- cinemática ----------------
def test_home_pose_is_valid():
    L, valid, _ = backend.platform.inverse_kinematics(z=backend.HOME_Z_MM)
    assert valid
    assert np.all(L > backend.STROKE_MIN_MM + 60) and np.all(L < backend.STROKE_MAX_MM - 60)


def test_default_z_is_valid(client):
    r = client.post("/calculate", json={}).json()
    assert r["valid"] is True
    assert r["pose"]["z"] == backend.HOME_Z_MM


def test_forward_kinematics_roundtrip():
    pose = dict(x=12.0, y=-8.0, z=540.0, roll=3.0, pitch=-2.0, yaw=1.5)
    L, valid, _ = backend.platform.inverse_kinematics(**pose)
    assert valid
    est, _ = backend.platform.estimate_pose_from_lengths(L)
    for k, v in pose.items():
        assert est[k] == pytest.approx(v, abs=0.05)


def test_config_exposes_geometry(client):
    cfg = client.get("/config").json()
    assert cfg["home_z"] == backend.HOME_Z_MM
    assert len(cfg["base_points"]) == 6 and len(cfg["platform_points_local"]) == 6
    assert cfg["stroke_min"] == 500 and cfg["stroke_max"] == 680


def test_config_rejects_widening_the_stroke(client):
    r = client.post("/config", json={"h0": 530, "stroke_min": 450, "stroke_max": 700})
    assert r.status_code == 400


# ---------------- serial / simulador ----------------
def test_simulator_listed(client):
    ports = client.get("/serial/ports").json()["ports"]
    assert ports[-1]["device"] == "SIMULADOR"
    assert ports[-1]["simulated"] is True


def test_simulator_end_to_end(client):
    assert client.post("/serial/open", json={"port": "SIMULADOR"}).status_code == 200
    status = client.get("/serial/status").json()
    assert status == {"connected": True, "port": "SIMULADOR", "simulated": True}

    with client.websocket_connect("/ws/telemetry") as ws:
        msg = ws.receive_json()
        while msg["type"] != "telemetry":
            msg = ws.receive_json()
        assert len(msg["Y"]) == 6
        assert len(msg["actuator_lengths_abs"]) == 6
        assert len(msg["base_points"]) == 6

    r = client.post("/apply_pose", json={"z": 530}).json()
    assert r["applied"] is True
    sim = backend.serial_mgr.ser
    assert wait_for(lambda: all(abs(pz.sp - c) < 1e-3 for pz, c in zip(sim.pistons, r["setpoints_mm"])))


def test_mpu_control_returns_geometry(client):
    client.post("/serial/open", json={"port": "SIMULADOR"})
    r = client.post("/mpu/control", json={"roll": 2, "pitch": -1, "z": 530})
    assert r.status_code == 200
    body = r.json()
    assert body["applied"] is True
    assert len(body["base_points"]) == 6 and len(body["platform_points"]) == 6


def test_serial_send_rejects_embedded_newline(client):
    client.post("/serial/open", json={"port": "SIMULADOR"})
    r = client.post("/serial/send", json={"command": "sel=1\nkpmm=99"})
    assert r.status_code == 400


def test_manual_ok_reaches_device(client):
    client.post("/serial/open", json={"port": "SIMULADOR"})
    client.post("/pid/select/2")
    client.post("/pid/manual/A")
    sim = backend.serial_mgr.ser
    assert wait_for(lambda: sim.manual_advance)
    client.post("/pid/manual/ok")
    assert wait_for(lambda: not sim.manual_advance)


def test_pid_gains_target_selected_piston(client):
    client.post("/serial/open", json={"port": "SIMULADOR"})
    assert client.post("/pid/gains", json={"piston": 3, "kp": 6.25}).status_code == 200
    sim = backend.serial_mgr.ser
    assert sim.pistons[2].kp == 6.25


def test_motion_tick_has_real_lengths_and_points(client):
    client.post("/serial/open", json={"port": "SIMULADOR"})
    with client.websocket_connect("/ws/telemetry") as ws:
        r = client.post("/motion/start", json={"routine": "sine_axis", "axis": "z", "amp": 5,
                                               "hz": 0.5, "duration_s": 3})
        assert r.status_code == 200
        tick = None
        for _ in range(2000):
            msg = ws.receive_json()
            if msg["type"] == "motion_tick" and msg.get("actuators_real"):
                tick = msg
                break
        client.post("/motion/stop")
    assert tick is not None
    assert all(500 <= v <= 700 for v in tick["actuators_real"])
    assert len(tick["platform_points_cmd"]) == 6


def test_api_info_lists_routes(client):
    info = client.get("/api/info").json()
    assert any("/calculate" in e for e in info["endpoints"])


def test_emergency_stop_holds_position_and_stops_routine(client):
    client.post("/serial/open", json={"port": "SIMULADOR"})
    sim = backend.serial_mgr.ser
    assert wait_for(lambda: backend.serial_mgr.latest.get("Y"))
    client.post("/motion/start", json={"routine": "circle_xy", "ax": 10, "ay": 10,
                                       "hz": 0.2, "duration_s": 30})
    assert wait_for(lambda: backend.motion_runner.status()["running"])
    r = client.post("/emergency-stop").json()
    assert r["stopped"] is True and len(r["held_mm"]) == 6
    assert not backend.motion_runner.status()["running"]
    assert all(abs(pz.sp - h) < 1e-3 for pz, h in zip(sim.pistons, r["held_mm"]))
