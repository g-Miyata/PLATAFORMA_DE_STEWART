from fastapi.testclient import TestClient

import flightgear as fg


def make_aircraft(root):
    ac = root / "Embraer-ERJ-145"
    (ac / "Models" / "Liveries").mkdir(parents=True)
    (ac / "erj145-set.xml").write_text("<PropertyList/>", encoding="utf-8")
    return ac


def test_find_aircraft_in_custom_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(fg.Path, "home", lambda: tmp_path / "vazio")
    root = tmp_path / "meus-avioes"
    ac = make_aircraft(root)
    monkeypatch.setenv("FG_AIRCRAFT", str(root))
    assert fg.find_aircraft() == ac
    monkeypatch.setenv("FG_AIRCRAFT", str(tmp_path / "nada"))
    assert fg.find_aircraft() is None


def test_install_livery_is_idempotent(tmp_path):
    ac = make_aircraft(tmp_path)
    assert not fg.livery_installed(ac)
    assert fg.install_livery(ac) is True
    assert fg.livery_installed(ac)
    assert (ac / "Models" / "Liveries" / "2048x2048" / fg.LIVERY_PNG).is_file()
    assert fg.install_livery(ac) is False


def test_check_reports_missing_flightgear(monkeypatch):
    monkeypatch.setattr(fg, "find_fgfs", lambda: None)
    monkeypatch.setattr(fg, "find_fgroot", lambda *a: None)
    monkeypatch.setattr(fg, "find_aircraft", lambda: None)
    result = fg.FlightGearManager().check()
    items = {i["id"]: i for i in result["items"]}
    assert result["ok"] is False
    assert not items["fgfs"]["ok"] and "winget install FlightGear.FlightGear" in items["fgfs"]["fix"]
    assert not items["aircraft"]["ok"] and "ERJ" in items["aircraft"]["fix"]
    assert all(i["fix"] for i in result["items"] if not i["ok"] and i["severity"] == "error")


def test_build_command_keeps_livery_name_as_one_argument():
    paths = {"fgfs": r"C:\fg\bin\fgfs.exe", "fg_root": r"C:\fgdata", "aircraft_dir": r"C:\ac\Embraer-ERJ-145"}
    cmd = fg.FlightGearManager.build_command(paths, {"lat": -23.4, "lon": -46.5, "alt": 10.0, "heading": 400.0})
    assert "--prop:/sim/model/livery/name=Instituto Federal" in cmd
    assert "--fdm=null" in cmd and "--aircraft=erj145" in cmd
    assert f"--generic=socket,in,60,127.0.0.1,{fg.VISUAL_PORT},udp,stewart-visual" in cmd
    assert "--heading=40.0" in cmd
    assert any(c.startswith("--aircraft-dir=") for c in cmd)


def test_log_problems_skips_shutdown_noise(tmp_path):
    log = tmp_path / "fgfs.log"
    log.write_text(
        "  1.0 [INFO]:general tudo certo\n"
        "  2.0 [ALRT]:network C:\\src\\generic.cxx:754: Unable to load the protocol configuration file\n"
        "  3.0 [ALRT]:event C:\\src\\subsystem_mgr.cxx:368: Shutdown of non-init-ed group:\n",
        encoding="utf-8")
    assert fg.log_problems(log) == ["2.0 [ALRT]:network Unable to load the protocol configuration file"]


class FakeProc:
    def __init__(self, code=None):
        self.code = code
        self.pid = 1234

    def poll(self):
        return self.code

    def kill(self):
        self.code = -9


def test_status_crashed_and_stuck(monkeypatch, tmp_path):
    monkeypatch.setattr(fg, "fg_log_path", lambda: tmp_path / "sem-log.txt")
    m = fg.FlightGearManager()
    m.proc, m.started_at = FakeProc(code=3221226356), fg.time.monotonic() - 40
    st = m.status()
    assert st["state"] == "crashed" and "fechou sozinho" in st["error"]["message"]

    m.proc, m.started_at, m.stopping = FakeProc(), fg.time.monotonic() - fg.STUCK_S - 1, False
    monkeypatch.setattr(m, "_prop", lambda path: None)
    st = m.status()
    assert st["state"] == "stuck" and "mensagem de erro" in st["error"]["message"]


def test_routes():
    import app as backend
    with TestClient(backend.app) as c:
        r = c.get("/fg/check")
        assert r.status_code == 200
        assert {i["id"] for i in r.json()["items"]} >= {"fgfs", "fgdata", "aircraft", "ports"}
        assert c.get("/fg/status").json()["state"] in ("stopped", "starting", "loading", "ready", "crashed", "stuck")
        assert c.get("/fg/stream").status_code == 503


def test_crash_state_sticks_until_stop(monkeypatch, tmp_path):
    monkeypatch.setattr(fg, "fg_log_path", lambda: tmp_path / "sem-log.txt")
    m = fg.FlightGearManager()
    m.proc, m.started_at = FakeProc(code=1), fg.time.monotonic() - 5
    assert m.status()["state"] == "crashed"
    assert m.status()["state"] == "crashed"  # segunda leitura: ainda mostra o motivo
    assert m.stop()["state"] == "stopped"
