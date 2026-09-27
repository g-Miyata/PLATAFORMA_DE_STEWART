"""Modo rede local: PIN para comandos de fora do PC e certificado autoassinado."""
import pytest
from fastapi.testclient import TestClient

import app as backend
import lan


@pytest.fixture
def phone(monkeypatch):
    """TestClient aparece como 'testclient' (fora do PC): faz o papel do celular."""
    monkeypatch.setattr(backend.lan_guard, "enabled", True)
    monkeypatch.setattr(backend.lan_guard, "tokens", set())
    monkeypatch.setattr(backend.lan_guard, "fails", {})
    with TestClient(backend.app) as c:
        yield c
        backend.lan_guard.enabled = False
        c.post("/serial/close")


def test_sem_modo_rede_nada_muda():
    with TestClient(backend.app) as c:
        assert c.get("/lan/status").json()["lan"] is False
        assert c.post("/calculate", json={"z": backend.HOME_Z_MM}).status_code == 200


def test_celular_sem_pin_so_ve(phone):
    st = phone.get("/lan/status").json()
    assert st == {"lan": True, "local": False, "authorized": False}
    assert phone.get("/config").status_code == 200  # ver pode
    r = phone.post("/apply_pose", json={"z": backend.HOME_Z_MM})
    assert r.status_code == 401 and "PIN" in r.json()["detail"]
    assert phone.get("/lan/info").status_code == 403  # o PIN só aparece no PC


def test_parada_de_emergencia_sem_pin(phone):
    assert phone.post("/emergency-stop").status_code != 401


def test_pin_certo_libera_os_comandos(phone):
    assert phone.post("/lan/auth", json={"pin": "000000" if backend.lan_guard.pin != "000000" else "111111"}).status_code == 401
    r = phone.post("/lan/auth", json={"pin": backend.lan_guard.pin})
    assert r.status_code == 200 and lan.COOKIE in r.cookies
    assert phone.get("/lan/status").json()["authorized"] is True
    assert phone.post("/calculate", json={"z": backend.HOME_Z_MM}).status_code == 200


def test_bloqueia_depois_de_varios_erros(phone):
    wrong = "000000" if backend.lan_guard.pin != "000000" else "111111"
    for _ in range(lan.MAX_FAILS):
        assert phone.post("/lan/auth", json={"pin": wrong}).status_code == 401
    assert phone.post("/lan/auth", json={"pin": backend.lan_guard.pin}).status_code == 429


def test_o_pc_nunca_pede_pin(phone, monkeypatch):
    monkeypatch.setattr(lan.LanGuard, "is_local", staticmethod(lambda request: True))
    assert phone.post("/calculate", json={"z": backend.HOME_Z_MM}).status_code == 200
    info = phone.get("/lan/info").json()
    assert info["lan"] is True and len(info["pin"]) == 6


def test_certificado_com_os_ips(tmp_path):
    from cryptography import x509

    cert, key = lan.ensure_certificate(["192.168.0.42"], tmp_path)
    c = x509.load_pem_x509_certificate(cert.read_bytes())
    san = c.extensions.get_extension_for_class(x509.SubjectAlternativeName).value
    ips = {str(ip) for ip in san.get_values_for_type(x509.IPAddress)}
    assert {"192.168.0.42", "127.0.0.1"} <= ips and "localhost" in san.get_values_for_type(x509.DNSName)
    # mesmos IPs: reaproveita; IP novo: refaz
    assert lan.ensure_certificate(["192.168.0.42"], tmp_path)[0].read_bytes() == cert.read_bytes()
    lan.ensure_certificate(["10.0.0.5"], tmp_path)
    assert cert.read_bytes() != c.public_bytes(__import__("cryptography.hazmat.primitives.serialization", fromlist=["Encoding"]).Encoding.PEM)
