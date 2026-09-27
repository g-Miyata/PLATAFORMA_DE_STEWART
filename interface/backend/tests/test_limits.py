"""Limites reais da mecânica: curso, cardãs, folga entre pernas e o envelope de operação."""
import json

import numpy as np
import pytest
from fastapi.testclient import TestClient

import app as backend
from limits import JointLimits, LimitChecker, balanced_home_z, load_limits, save_limits

H = backend.HOME_Z_MM


@pytest.fixture
def client():
    with TestClient(backend.app) as c:
        yield c
        c.post("/serial/close")


def reasons(**pose):
    d = backend.platform.check_pose(**pose)
    return {r for leg in d["legs"] for r in leg["reasons"]}


def test_home_fica_no_meio_do_curso_de_operacao_e_e_valido():
    assert H == balanced_home_z(backend.BASE_POINTS, backend.PLATFORM_POINTS, backend.JOINT_LIMITS)
    d = backend.platform.check_pose(z=H)
    assert d["valid"] and d["physical_ok"]
    m = d["margins"]
    assert m["stroke_mm"] > 50 and m["cardan_base_deg"] > 10 and m["cardan_top_deg"] > 5 and m["distance_mm"] > 10


def test_margem_de_20_por_cento():
    lim = JointLimits()
    op = lim.operational()
    assert op["stroke_min"] == 525 and op["stroke_max"] == 725
    assert op["cardan_top_max_deg"] == pytest.approx(36)
    assert op["min_axis_distance_mm"] == pytest.approx((2 * 23 + 5) * 1.2)


@pytest.mark.parametrize(
    "pose, motivo",
    [
        (dict(x=21.9, y=-120.7, z=573.9, roll=-15.0, pitch=-0.8, yaw=3.3), "cardan_topo"),
        (dict(x=132.3, y=62.6, z=565.1, roll=-3.7, pitch=7.2, yaw=-22.7), "cardan_base"),
        (dict(z=H + 150), "curso"),
    ],
)
def test_cada_motivo_e_detectado(pose, motivo):
    assert motivo in reasons(**pose)
    L, valid, _ = backend.platform.inverse_kinematics(**pose)
    assert not valid


def test_folga_entre_pernas_com_pernas_mais_grossas():
    # com o raio da perna real a colisão nunca é o primeiro limite; engrossando, ela aparece
    fat = JointLimits(leg_radius_mm=40)
    c = LimitChecker(backend.BASE_POINTS, backend.PLATFORM_POINTS, fat)
    P, Rm = backend.platform._arrays(z=H)
    d = c.detail(P, Rm)
    assert not d["valid"] and any("folga" in leg["reasons"] for leg in d["legs"])
    assert d["closest_pair"] == [1, 2]


def test_lote_igual_ao_escalar():
    rng = np.random.default_rng(1)
    poses = np.column_stack([rng.uniform(-150, 150, 300), rng.uniform(-150, 150, 300), rng.uniform(H - 110, H + 110, 300),
                             rng.uniform(-18, 18, 300), rng.uniform(-18, 18, 300), rng.uniform(-40, 40, 300)])
    batch = backend.platform.validate_batch(poses)
    single = [backend.platform.inverse_kinematics(*p)[1] for p in poses[:, [0, 1, 2, 3, 4, 5]]]
    assert batch.tolist() == single
    assert 0 < batch.sum() < len(poses)  # a amostra tem poses dos dois tipos


def test_envelope_dentro_do_fisico_e_simetrico_em_y_e_yaw():
    env = backend.platform.envelope()
    r = env["reach"]
    assert r["y"][0] == pytest.approx(-r["y"][1], abs=0.5)
    assert r["yaw"][0] == pytest.approx(-r["yaw"][1], abs=0.5)
    assert 0 < env["tilt_deg"] <= min(-r["roll"][0], r["roll"][1], -r["pitch"][0], r["pitch"][1]) + 1e-6
    # cada extremo do alcance é válido; um pouco além, não
    for axis, (lo, hi) in r.items():
        for v, eps in ((lo, -0.5), (hi, 0.5)):
            p = {"x": 0, "y": 0, "z": H, "roll": 0, "pitch": 0, "yaw": 0}
            p[axis] += v * 0.999
            assert backend.platform.inverse_kinematics(**p)[1], (axis, v)
            p[axis] = (H if axis == "z" else 0) + v + eps
            assert not backend.platform.inverse_kinematics(**p)[1], (axis, v)


def test_limit_pose_traz_para_dentro_na_direcao_do_neutro():
    pose = {"x": 0, "y": 0, "z": H, "roll": 30, "pitch": 30, "yaw": 0}
    out, clipped = backend.platform.limit_pose(pose)
    assert clipped and backend.platform.inverse_kinematics(**out)[1]
    assert out["roll"] == pytest.approx(out["pitch"])  # mesma direção
    assert 5 < out["roll"] < 30


def test_calculate_devolve_os_motivos(client):
    r = client.post("/calculate", json={"x": 0, "y": 0, "z": H, "roll": 0, "pitch": 0, "yaw": 45}).json()
    assert r["valid"] is False and "cardã" in r["reason"]
    assert any({"cardan_base", "cardan_topo"} & set(a["reasons"]) for a in r["actuators"])
    ok = client.post("/calculate", json={"x": 0, "y": 0, "z": H, "roll": 0, "pitch": 0, "yaw": 0}).json()
    assert ok["valid"] and ok["limits"]["margins"]["cardan_top_deg"] > 0


def test_joystick_e_imu_respeitam_o_envelope(client):
    reach = backend.platform.envelope()["reach"]
    r = client.post("/joystick/pose", json={"lx": 1, "ly": 0, "rx": 0, "ry": 0}).json()
    assert r["valid"] and r["pose"]["x"] == pytest.approx(reach["x"][1], abs=0.5)
    half = client.post("/joystick/pose", json={"lx": 1, "ly": 0, "rx": 0, "ry": 0, "scale": 0.5}).json()
    assert half["pose"]["x"] == pytest.approx(reach["x"][1] / 2, abs=0.5)
    # os quatro eixos no máximo juntos: não cabe, e é trazido para dentro
    both = client.post("/joystick/pose", json={"lx": 1, "ly": 1, "rx": 1, "ry": 1}).json()
    assert both["valid"] and both["limited"]
    client.post("/serial/open", json={"port": "SIMULADOR"})
    m = client.post("/mpu/control", json={"roll": 40, "pitch": 40, "yaw": 0}).json()
    assert m["applied"] and m["limited"]
    assert backend.platform.inverse_kinematics(**m["pose"])[1]


def test_setpoint_manual_fora_da_operacao_e_recusado(client):
    client.post("/serial/open", json={"port": "SIMULADOR"})
    assert client.post("/pid/setpoint", json={"value": 10}).status_code == 400  # abaixo de 25 mm
    assert client.post("/pid/setpoint", json={"value": 240}).status_code == 400  # acima de 225 mm
    home_course = float(backend.platform.inverse_kinematics(z=H)[0][0] - backend.platform.stroke_min)
    assert client.post("/pid/setpoint", json={"value": home_course}).status_code == 200


def test_trajetoria_fora_do_limite_diz_o_motivo(client):
    client.post("/serial/open", json={"port": "SIMULADOR"})
    samples = [{"t": 0, "x": 0, "y": 0, "z": H, "roll": 0, "pitch": 0, "yaw": 0}, {"t": 1, "x": 0, "y": 0, "z": H, "roll": 0, "pitch": 0, "yaw": 40}]
    r = client.post("/motion/trajectory", json={"samples": samples})
    assert r.status_code == 400 and "cardã" in r.json()["detail"]


def test_post_limits_valida_grava_backup_e_recalcula(client, tmp_path, monkeypatch):
    path = tmp_path / "limits.json"
    path.write_text(json.dumps(JointLimits().to_dict()), encoding="utf-8")
    monkeypatch.setattr(backend, "save_limits", lambda lim: save_limits(lim, path))
    before = client.get("/limits").json()["reach"]["yaw"][1]
    try:
        assert client.post("/limits", json={"cardan_top_max_deg": 5}).status_code == 400  # fora da faixa
        r = client.post("/limits", json={"cardan_top_max_deg": 40})
        assert r.status_code == 200 and r.json()["backup"]
        assert load_limits(path).cardan_top_max_deg == 40
        assert client.get("/limits").json()["reach"]["yaw"][1] < before
    finally:
        backend.platform.set_limits(backend.JOINT_LIMITS)
