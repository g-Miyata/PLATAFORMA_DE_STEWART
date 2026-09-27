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
    monkeypatch.setattr(backend.lan_guard, "devices", {})
    monkeypatch.setattr(backend.lan_guard, "waiting", {})
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
    assert st == {"lan": True, "local": False, "authorized": False, "busy": False}
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


def _from_ip(ip):
    """O app visto de outro aparelho da rede (o TestClient sempre aparece como 'testclient')."""

    async def wrapped(scope, receive, send):
        if scope["type"] in ("http", "websocket"):
            scope = {**scope, "client": (ip, 50000)}
        await backend.app(scope, receive, send)

    return TestClient(wrapped)


def test_um_celular_por_vez(phone):
    pin = backend.lan_guard.pin
    a, b = _from_ip("192.168.0.21"), _from_ip("192.168.0.22")
    assert a.post("/lan/auth", json={"pin": pin}).status_code == 200
    assert a.post("/calculate", json={"z": backend.HOME_Z_MM}).status_code == 200
    # o segundo vê que está ocupado e não entra, nem com o PIN certo
    assert b.get("/lan/status").json()["busy"] is True
    r = b.post("/lan/auth", json={"pin": pin})
    assert r.status_code == 409 and "192.168.0.21" in r.json()["detail"]
    # o mesmo celular pode entrar de novo (troca o token)
    assert a.post("/lan/auth", json={"pin": pin}).status_code == 200
    assert len(backend.lan_guard.devices) == 1
    # o primeiro sai: a vez fica livre
    assert a.post("/lan/logout").status_code == 200
    assert a.post("/calculate", json={"z": backend.HOME_Z_MM}).status_code == 401
    assert b.get("/lan/status").json()["busy"] is False
    assert b.post("/lan/auth", json={"pin": pin}).status_code == 200


def test_pc_ve_e_desconecta_o_celular(phone, monkeypatch):
    cel = _from_ip("192.168.0.30")
    cel.get("/lan/status")  # abriu a página, sem PIN ainda
    real_is_local = lan.LanGuard.is_local
    monkeypatch.setattr(lan.LanGuard, "is_local", staticmethod(lambda r: r.client.host != "192.168.0.30"))
    info = phone.get("/lan/info").json()
    assert info["devices"] == [] and [w["ip"] for w in info["waiting"]] == ["192.168.0.30"]
    assert cel.post("/lan/auth", json={"pin": backend.lan_guard.pin}, headers={"user-agent": "Mozilla/5.0 (Linux; Android 14)"}).status_code == 200
    info = phone.get("/lan/info").json()
    assert info["waiting"] == [] and len(info["devices"]) == 1
    dev = info["devices"][0]
    assert dev["ip"] == "192.168.0.30" and dev["active"] and "Android" in dev["agent"]
    assert phone.delete(f"/lan/devices/{dev['id']}").status_code == 200
    assert cel.post("/calculate", json={"z": backend.HOME_Z_MM}).status_code == 401
    assert phone.delete(f"/lan/devices/{dev['id']}").status_code == 404
    # PIN novo: o antigo deixa de valer
    old = backend.lan_guard.pin
    new = phone.post("/lan/pin").json()["pin"]
    assert len(new) == 6 and backend.lan_guard.pin == new
    if new != old:
        assert cel.post("/lan/auth", json={"pin": old}).status_code == 401
    monkeypatch.setattr(lan.LanGuard, "is_local", real_is_local)


def test_celular_nao_liga_nem_desliga_o_modo_rede(phone):
    # sem PIN, o middleware já barra; com PIN, a rota continua só do PC
    assert phone.post("/lan/start").status_code == 401
    assert phone.post("/lan/auth", json={"pin": backend.lan_guard.pin}).status_code == 200
    for path in ("/lan/start", "/lan/stop", "/lan/pin"):
        assert phone.post(path).status_code == 403


def test_ligar_o_modo_rede_pelo_pc(monkeypatch, tmp_path):
    """Sem start.bat rede: o PC liga o HTTPS na rede e desliga, sem reiniciar."""
    import socket as sk

    with sk.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    monkeypatch.setattr(lan, "HTTPS_PORT", port)
    monkeypatch.setattr(lan, "CERT_DIR", tmp_path)
    monkeypatch.setattr(lan, "local_ips", lambda: ["127.0.0.2"])
    monkeypatch.setattr(lan, "ensure_certificate", lambda ips: _cert(ips, tmp_path))
    monkeypatch.setattr(lan.LanGuard, "is_local", staticmethod(lambda request: True))
    g = backend.lan_guard
    assert not g.enabled
    with TestClient(backend.app) as c:
        try:
            info = c.post("/lan/start").json()
            assert info["lan"] is True and info["mode"] == "runtime" and len(info["pin"]) == 6
            assert info["urls"][0]["https"] == f"https://127.0.0.2:{port}/celular" and info["urls"][0]["http"] is None
            # o servidor novo responde em HTTPS
            import ssl
            import urllib.request

            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            body = urllib.request.urlopen(f"https://127.0.0.1:{port}/lan/status", context=ctx, timeout=5).read()
            assert b'"lan":true' in body
            assert c.post("/lan/start").status_code == 200  # de novo: nada muda
            assert c.post("/lan/stop").json()["lan"] is False
            assert not g.enabled and g.mode is None
        finally:
            c.portal.call(g.stop_server)


_real_cert = lan.ensure_certificate


def _cert(ips, folder):
    return _real_cert(ips, folder)


def test_porta_ocupada_vira_erro_e_nao_derruba(monkeypatch, tmp_path):
    import socket as sk

    busy = sk.socket()
    busy.bind(("0.0.0.0", 0))
    busy.listen(1)
    monkeypatch.setattr(lan, "HTTPS_PORT", busy.getsockname()[1])
    monkeypatch.setattr(lan, "local_ips", lambda: ["127.0.0.2"])
    monkeypatch.setattr(lan, "ensure_certificate", lambda ips: _cert(ips, tmp_path))
    monkeypatch.setattr(lan.LanGuard, "is_local", staticmethod(lambda request: True))
    try:
        with TestClient(backend.app) as c:
            r = c.post("/lan/start")
            assert r.status_code == 409 and "em uso" in r.json()["detail"]
            assert backend.lan_guard.enabled is False
            assert c.get("/lan/status").status_code == 200
    finally:
        busy.close()
