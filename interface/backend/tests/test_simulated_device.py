import pytest

from simulated_device import SimulatedSerial, load_params


class FakeClock:
    def __init__(self):
        self.t = 0.0

    def __call__(self):
        return self.t


@pytest.fixture
def dev():
    params = load_params()
    params["noise_mm"] = 0.0
    return SimulatedSerial(params=params, clock=FakeClock(), realtime=False, seed=1)


def send(dev, line):
    dev.write((line + "\n").encode())


def drain(dev):
    out = bytes(dev._tx).decode()
    dev._tx.clear()
    return out.splitlines()


def telemetry_lines(lines):
    return [ln for ln in lines if len(ln.split(";")) == 14]


def test_emits_firmware_csv_format(dev):
    drain(dev)
    dev.step(0.2)
    rows = telemetry_lines(drain(dev))
    assert len(rows) >= 5  # ~30 Hz
    fields = rows[-1].split(";")
    assert len(fields) == 14  # ms;SP;Y1..Y6;PWM1..PWM6
    float(fields[1])
    [float(v) for v in fields[2:8]]
    [int(v) for v in fields[8:14]]


def test_step_response_settles_on_setpoint(dev):
    send(dev, "spmm6x=40,40,40,40,40,40")
    dev.step(20.0)
    for pz in dev.pistons:
        assert pz.pos == pytest.approx(40.0, abs=0.5)


def test_step_is_not_instantaneous(dev):
    # Velocidade limitada (~10-16 mm/s): 40 mm não é alcançado em 1 s
    send(dev, "spmm6x=40,40,40,40,40,40")
    dev.step(1.0)
    assert all(pz.pos < 20.0 for pz in dev.pistons)


def test_mechanical_end_stop(dev):
    send(dev, "spmm=250")  # firmware aceita até Lmm=250, a mecânica para em 180
    dev.step(30.0)
    assert all(pz.pos == pytest.approx(180.0) for pz in dev.pistons)


def test_individual_setpoint_and_select_gains(dev):
    send(dev, "spmm3=25")
    send(dev, "sel=2")
    send(dev, "kpmm=7.5")
    assert dev.pistons[2].sp == 25.0
    assert dev.pistons[1].kp == 7.5
    assert dev.pistons[0].kp != 7.5


def test_manual_mode_can_be_exited_with_ok(dev):
    send(dev, "spmm6x=20,20,20,20,20,20")
    dev.step(10.0)
    send(dev, "sel=1")
    send(dev, "A")
    dev.step(1.0)
    assert dev.manual_advance
    assert dev.pistons[1].pwm == 0  # só o selecionado recebe PWM
    send(dev, "OK")
    assert not dev.manual_advance and not dev.manual_retract
    dev.step(15.0)
    # PID volta a atuar (erro residual de ~1 mm pela zona morta, como na bancada)
    assert dev.pistons[0].pos == pytest.approx(20.0, abs=1.0)


def test_invalid_values_are_rejected_not_zeroed(dev):
    send(dev, "spmm6x=30,30,30,30,30,30")
    drain(dev)
    send(dev, "spmm=abc")
    assert any("ERR" in ln for ln in drain(dev))
    assert all(pz.sp == 30.0 for pz in dev.pistons)


def test_bad_spmm6x_format(dev):
    drain(dev)
    send(dev, "spmm6x=1,2,3")
    assert any("ERR spmm6x" in ln for ln in drain(dev))


def test_offset_shifts_measurement(dev):
    send(dev, "sel=4")
    send(dev, "offset=2.5")
    assert dev.pistons[3].measured() == pytest.approx(dev.pistons[3].pos + 2.5)
