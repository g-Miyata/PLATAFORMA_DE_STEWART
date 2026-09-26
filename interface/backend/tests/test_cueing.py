import json
import math
import time

import numpy as np
import pytest
from fastapi.testclient import TestClient

import app as backend
from cueing import (
    FLIGHT_COLUMNS,
    FLIGHT_FORMAT,
    G,
    CueingEngine,
    CueingParams,
    Perceived,
    PoseShaper,
    Washout,
    analyze_flight,
    neutral_pose,
    parse_sample,
)

DT = 1 / 60


def level(**kw):
    s = {"t": 0.0, "fx": 0.0, "fy": 0.0, "fz": -G, "p": 0.0, "q": 0.0, "r": 0.0,
         "roll": 0.0, "pitch": 0.0, "heading": 0.0, "ias": 0.0, "agl": 0.0, "alt": 0.0, "wow": 0.0, "hold": False}
    s.update(kw)
    return s


def run(wash, sample_fn, seconds):
    pose = None
    for i in range(int(seconds / DT)):
        pose = wash.step(sample_fn(i * DT), DT)
    return pose


# ---------------- washout ----------------
def test_level_flight_stays_neutral():
    p = CueingParams()
    pose = run(Washout(p), lambda t: level(t=t), 5)
    for k, v in neutral_pose(p).items():
        assert pose[k] == pytest.approx(v, abs=1e-6)


def test_sustained_forward_accel_tilts_nose_up_and_washes_out_translation():
    p = CueingParams()
    wash = Washout(p)
    run(wash, lambda t: level(t=t), 1)
    pose = run(wash, lambda t: level(t=t, fx=2.0), 25)
    expected = math.degrees(math.asin(p.f_scale * 2.0 / G))
    # pitch da plataforma positivo abaixa a frente: nariz para cima é pitch negativo
    assert pose["pitch"] == pytest.approx(-expected, abs=0.05)
    assert abs(pose["x"]) < 0.5


def test_forward_accel_onset_moves_platform_forward():
    wash = Washout(CueingParams())
    run(wash, lambda t: level(t=t), 1)
    pose = run(wash, lambda t: level(t=t, fx=2.0), 0.4)
    assert pose["x"] > 1.0


def test_nose_up_attitude_is_reproduced_by_tilt():
    p = CueingParams()
    th = math.radians(8)
    pose = run(Washout(p), lambda t: level(t=t, pitch=8.0, fx=G * math.sin(th), fz=-G * math.cos(th)), 20)
    expected = math.degrees(math.asin(p.f_scale * math.sin(th)))
    assert pose["pitch"] == pytest.approx(-expected, abs=0.05)


def test_right_lateral_force_rolls_right_side_down():
    pose = run(Washout(CueingParams()), lambda t: level(t=t, fy=-2.0), 20)
    assert pose["roll"] > 1.0


def test_roll_rate_gives_onset_then_washes_out():
    wash = Washout(CueingParams())
    peak = max(run(wash, lambda t: level(t=t, p=15.0), s)["roll"] for s in (0.5, 0.5, 0.5))
    assert peak > 0.5
    pose = run(wash, lambda t: level(t=t, p=15.0), 30)
    assert abs(pose["roll"]) < 0.3


def test_coordinated_turn_has_no_false_lateral_cue():
    """Curva coordenada: o piloto não sente nada de lado, só um pouco mais de 1 g."""
    phi = math.radians(30)
    wash = Washout(CueingParams())
    run(wash, lambda t: level(t=t), 1)
    poses = [run(wash, lambda t: level(t=t, roll=30.0, fz=-G / math.cos(phi)), 0.5) for _ in range(20)]
    assert max(abs(p["y"]) for p in poses) < 0.5
    assert max(abs(p["roll"]) for p in poses) < 0.5


def test_yaw_right_is_negative_platform_yaw():
    pose = run(Washout(CueingParams()), lambda t: level(t=t, r=10.0), 0.8)
    assert pose["yaw"] < 0


def test_downward_accel_lowers_platform():
    wash = Washout(CueingParams())
    run(wash, lambda t: level(t=t), 1)
    # fz menos negativo = menos de 1 g = avião caindo
    pose = run(wash, lambda t: level(t=t, fz=-G + 3.0), 0.3)
    assert pose["z"] < CueingParams().z0 - 1.0


def test_negative_pitch_raises_front_of_top_plate():
    """Confere a convenção usada no mapeamento: pitch < 0 levanta o lado +X."""
    _, _, P = backend.platform.inverse_kinematics(z=530, pitch=-5)
    front = P[:, 0] > 150
    assert np.all(P[front, 2] > 530)


# ---------------- limitador ----------------
def test_shaper_respects_leg_speed_and_stroke():
    p = CueingParams()
    shaper = PoseShaper(backend.platform)
    neutral = neutral_pose(p)
    shaper.reset(neutral)
    far = {**neutral, "x": 60, "roll": 15, "pitch": -15, "z": 580}
    fitted, clipped = shaper.within_stroke(far, neutral)
    assert clipped and shaper.is_valid(fitted)
    prev = shaper.legs(neutral)
    for _ in range(120):
        pose, _ = shaper.step(fitted, DT, p.leg_speed_max)
        legs = shaper.legs(pose)
        assert np.max(np.abs(legs - prev)) <= p.leg_speed_max * DT * 1.05
        prev = legs


def test_perceived_at_rest_is_one_g():
    per = Perceived()
    for _ in range(40):
        per.update(neutral_pose(CueingParams()), DT)
    assert per.f == pytest.approx([0.0, 0.0, -G], abs=1e-6)


def test_parse_sample_rejects_nan():
    with pytest.raises(ValueError):
        parse_sample({"t": 1.0, "f": [float("nan"), 0, -G]})


# ---------------- motor ----------------
class FakeSerial:
    def __init__(self):
        self.open = True
        self.sent = []


@pytest.fixture
def engine(tmp_path):
    ser = FakeSerial()
    blocked = {"reason": None}
    eng = CueingEngine(
        backend.platform,
        send_course=lambda c: ser.sent.append(np.asarray(c).copy()),
        serial_open=lambda: ser.open,
        measured_pose=lambda: None,
        broadcast=lambda _obj: None,
        conflict=lambda: blocked["reason"],
        flights_dir=tmp_path / "flights",
        params_file=tmp_path / "params.json",
        autostart=False,
    )
    eng.ser = ser
    eng.blocked = blocked
    yield eng
    eng.shutdown()


def feed(eng, seconds, **kw):
    for i in range(int(seconds / DT)):
        eng.ingest(level(t=eng._t, **kw))
        eng._t += DT
        eng._step(DT)


def test_engage_release_and_estop(engine):
    engine._t = 0.0
    with pytest.raises(RuntimeError):
        engine.ser.open = False
        engine.engage()
    engine.ser.open = True
    engine.engage()
    feed(engine, 1)
    assert engine.mode == "on" and engine.ser.sent
    feed(engine, 10, fx=2.0)
    assert engine.pose["pitch"] < -1.0
    engine.release()
    feed(engine, 15)
    assert engine.mode == "off"
    assert engine.pose["pitch"] == pytest.approx(0, abs=0.06)
    engine.engage()
    engine.emergency_stop()
    n = len(engine.ser.sent)
    feed(engine, 1)
    assert len(engine.ser.sent) == n


def test_conflict_disengages(engine):
    engine._t = 0.0
    engine.engage()
    feed(engine, 0.2)
    engine.blocked["reason"] = "uma rotina está em execução"
    feed(engine, 0.1)
    assert engine.mode == "off"
    with pytest.raises(RuntimeError):
        engine.engage()


def test_record_save_list_analyze_replay(engine):
    engine._t = 0.0
    feed(engine, 0.5)
    engine.start_recording()
    feed(engine, 3, fx=1.5, p=5.0)
    meta = engine.stop_recording("Teste curto")
    assert meta["duration_s"] == pytest.approx(3, abs=0.1)
    doc = json.loads((engine.flights_dir / f"{meta['id']}.json").read_text(encoding="utf-8"))
    assert doc["format"] == FLIGHT_FORMAT and doc["columns"] == FLIGHT_COLUMNS
    assert [f["id"] for f in engine.list_flights()] == [meta["id"]]

    result = analyze_flight(backend.platform, engine.params, doc["data"])
    assert result["peak"]["pitch"] > 0.1
    assert len(result["series"]["t"]) > 10

    engine.start_replay(meta["id"], speed=4.0)
    time.sleep(0.4)
    assert engine.source == "replay"
    engine.ingest(level(t=99.0))  # amostra ao vivo é ignorada durante o replay
    assert engine.source == "replay"
    time.sleep(0.6)
    assert engine.replay is None and engine.source is None


# ---------------- rotas ----------------
def test_routes_status_params_and_ingest():
    with TestClient(backend.app) as c:
        r = c.get("/cueing/status")
        assert r.status_code == 200 and r.json()["mode"] == "off"
        assert c.post("/cueing/params", json={**CueingParams().model_dump(), "tilt_max": 99}).status_code == 422
        assert c.post("/cueing/engage").status_code == 409  # sem serial
        with c.websocket_connect("/cueing/ingest") as ws:
            for i in range(10):
                ws.send_text(json.dumps({"t": i / 60, "f": [0.5, 0, -G], "w": [0, 0, 0], "roll": 0, "pitch": 0}))
            time.sleep(0.2)
            st = c.get("/cueing/status").json()
            assert st["bridge"]["connected"] and st["source"] == "live"
        assert c.get("/cueing/flights").status_code == 200


# ---------------- perfil "Orientação do avião" ----------------
from cueing import FLIGHT_COLUMNS_V2, Attitude, interpolate, visual_datagram  # noqa: E402


def test_attitude_copies_roll_pitch_with_limit_and_sign():
    p = CueingParams()
    att = Attitude(p)
    pose = run(att, lambda t: level(t=t, roll=20.0, pitch=5.0), 2)
    assert pose["roll"] == pytest.approx(p.att_limit, abs=0.01)   # 20° cortado em 12°
    assert pose["pitch"] == pytest.approx(-5.0, abs=0.01)         # nariz para cima = pitch negativo
    assert pose["z"] == p.att_z and pose["x"] == 0 and pose["yaw"] == 0


def test_invert_pitch_flips_both_profiles():
    p = CueingParams(invert_pitch=True)
    assert run(Attitude(p), lambda t: level(t=t, pitch=5.0), 2)["pitch"] == pytest.approx(5.0, abs=0.01)
    wash = Washout(p)
    run(wash, lambda t: level(t=t), 1)
    assert run(wash, lambda t: level(t=t, fx=2.0), 20)["pitch"] > 1.0


def test_other_page_cannot_take_engaged_platform(engine):
    engine._t = 0.0
    engine.engage("washout")
    feed(engine, 0.2)
    with pytest.raises(RuntimeError, match="Simulador de voo"):
        engine.engage("attitude")
    engine.release()
    feed(engine, 15)
    engine.engage("attitude")
    assert engine.profile == "attitude"
    feed(engine, 8, roll=8.0)  # 530 -> 540 mm rolando ao mesmo tempo, a 9 mm/s por perna
    assert engine.pose["z"] == pytest.approx(engine.params.att_z, abs=0.5)
    assert engine.pose["roll"] > 1.0


# ---------------- voos v2 e FlightGear como tela ----------------
def test_interpolate_heading_wraps_the_short_way():
    a = {"t": 0.0, "heading": 350.0, "lat": 0.0}
    b = {"t": 1.0, "heading": 10.0, "lat": 1.0}
    mid = interpolate(a, b, 0.5)
    assert min(mid["heading"], 360.0 - mid["heading"]) == pytest.approx(0.0, abs=1e-9)
    assert mid["lat"] == 0.5


def test_visual_datagram_matches_protocol():
    s = {"lat": -23.4323456, "lon": -46.4695, "alt": 2500.0, "roll": 10.0, "pitch": 3.0, "heading": 370.0,
         "gear": 1.0, "flaps": 0.25, "elevator": -0.1, "aileron": 0.2, "rudder": 0.0, "speedbrake": 0.0, "ias": 150.0}
    fields = visual_datagram(s).decode().strip().split(",")
    assert len(fields) == 16  # mesma quantidade de <chunk> de stewart-visual.xml
    assert fields[0] == "-23.4323456" and float(fields[5]) == pytest.approx(10.0)
    assert float(fields[11]) == -float(fields[12])  # ailerons opostos


def _v2(i, t):
    return {**level(t=t, roll=5.0), "lat": -23.4 + i * 1e-5, "lon": -46.4, "gear": 1.0, "flaps": 0.0,
            "elevator": 0.0, "aileron": 0.0, "rudder": 0.0, "speedbrake": 0.0, "alt": 2500.0, "heading": 90.0}


def test_v2_recording_and_visual_replay_over_udp(engine):
    import socket as _socket
    rx = _socket.socket(_socket.AF_INET, _socket.SOCK_DGRAM)
    rx.bind(("127.0.0.1", 0))
    rx.settimeout(2.0)
    engine.visual_addr = rx.getsockname()
    for i in range(10):
        engine.ingest(_v2(i, i * DT))
    engine.start_recording()
    for i in range(10, 200):
        engine.ingest(_v2(i, i * DT))
    meta = engine.stop_recording("v2")
    assert meta["visual"]
    doc = engine.load_flight(meta["id"])
    assert doc["version"] == 2 and doc["columns"] == FLIGHT_COLUMNS_V2
    assert engine.flight_start(meta["id"])["heading"] == pytest.approx(90.0)

    engine.start_replay(meta["id"], speed=2.0, visual=True)
    data, _ = rx.recvfrom(512)
    fields = data.decode().strip().split(",")
    assert len(fields) == 16 and float(fields[0]) == pytest.approx(-23.4, abs=0.01)
    engine.stop_replay()
    rx.close()


def test_v1_flight_never_turns_visual_on(engine):
    engine._t = 0.0
    feed(engine, 0.2)
    engine.start_recording()
    feed(engine, 1)
    meta = engine.stop_recording("v1")
    assert not meta["visual"]
    engine.start_replay(meta["id"], visual=True)
    assert engine.replay["visual"] is False
    engine.set_replay(visual=True)
    assert engine.replay["visual"] is False
    engine.stop_replay()
