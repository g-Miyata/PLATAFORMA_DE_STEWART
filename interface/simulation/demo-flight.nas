# Piloto de demonstração do simulador de voo (Embraer ERJ145 ou Cessna 172P).
#
# Decola da cabeceira em que o avião estiver e faz uma sequência de manobras
# boas para sentir na plataforma: rolagem de decolagem, rotação, subida, curvas
# para os dois lados, puxada e picada, balanço de asas, curva fechada e descida.
# Foi usado para gravar interface/simulation/flights/ (rotina de demonstração).
#
# Rodar: python fly-demo.py (manda este código pela API HTTP do FlightGear, já que
# o Nasal não lê arquivos fora das pastas do simulador). Parar: python fly-demo.py --stop
# Progresso em /stewart-demo/phase e /stewart-demo/t

var clamp = func(v, lo, hi) { v < lo ? lo : (v > hi ? hi : v) };
var wrap180 = func(a) { while (a > 180) a -= 360; while (a < -180) a += 360; a };
var approach = func(cur, target, rate, dt) { cur + clamp(target - cur, -rate * dt, rate * dt) };

# Sequência de manobras: [duração s, roll alvo °, pitch alvo °, manete, balanço de asas ±° (0 = não)]
var PROFILES = {
    erj145: {
        engines: 2, vr: 135, climb_pitch: 10, climb_throttle: 1.0,
        flaps_takeoff: 0.25, gear_up_agl: 100, flaps_up_agl: 1000, maneuvers_agl: 1500,
        kp_roll: 0.03, kd_roll: 0.02, kp_pitch: 0.06, kd_pitch: 0.04, ki_pitch: 0.015,
        rud_hdg: 0.05, rud_rate: 0.08, rud_beta: 0.02, turn_elev: 0.003,
        sequence: [
            [10,   0,  4, 0.62,  0],   # nivelando
            [16,  30,  5, 0.68,  0],   # curva à direita
            [ 5,   0,  4, 0.62,  0],
            [16, -30,  5, 0.68,  0],   # curva à esquerda
            [ 6,   0,  4, 0.62,  0],
            [ 5,   0, 12, 0.95,  0],   # puxada
            [ 6,   0, -3, 0.40,  0],   # picada
            [ 8,   0,  4, 0.62,  0],
            [12,   0,  4, 0.62, 15],   # balanço de asas
            [ 6,   0,  4, 0.62,  0],
            [14,  45,  7, 0.80,  0],   # curva fechada à direita
            [ 8,   0,  4, 0.62,  0],
            [14,   0, -3, 0.25,  0],   # descida
            [ 8,   0,  3, 0.60,  0],   # nivelado
        ],
        final: [0, 3, 0.6],
    },
    c172p: {
        engines: 1, vr: 55, climb_pitch: 8, climb_throttle: 1.0,
        flaps_takeoff: 0.33, gear_up_agl: -1, flaps_up_agl: 600, maneuvers_agl: 600,
        kp_roll: 0.04, kd_roll: 0.02, kp_pitch: 0.08, kd_pitch: 0.03, ki_pitch: 0.0,
        rud_hdg: 0.08, rud_rate: 0.05, rud_beta: 0.03, turn_elev: 0.004,
        sequence: [
            [ 8,   0,  3, 0.80,  0],
            [14,  30,  4, 0.85,  0],
            [ 5,   0,  3, 0.80,  0],
            [14, -30,  4, 0.85,  0],
            [ 6,   0,  3, 0.80,  0],
            [ 4,   0, 12, 1.00,  0],
            [ 5,   0, -5, 0.60,  0],
            [ 6,   0,  3, 0.80,  0],
            [12,   0,  3, 0.80, 15],
            [ 6,   0,  3, 0.80,  0],
            [12,  45,  6, 1.00,  0],
            [ 6,   0,  3, 0.80,  0],
            [12,   0, -4, 0.30,  0],
            [ 8,   0,  2, 0.70,  0],
        ],
        final: [0, 2, 0.7],
    },
};

var state = {
    timer: nil, phase: "", t: 0, last: 0, hdg0: 0, cfg: nil,
    roll_cmd: 0, pitch_cmd: 0, pitch_int: 0, seg: 0, seg_t: 0,
};

var set_phase = func(name) {
    state.phase = name;
    setprop("/stewart-demo/phase", name);
};

var set_throttle = func(v) {
    for (var i = 0; i < state.cfg.engines; i += 1)
        setprop("/controls/engines/engine[" ~ i ~ "]/throttle", v);
};

var update = func {
    var c = state.cfg;
    var now = getprop("/sim/time/elapsed-sec");
    var dt = clamp(now - state.last, 0, 0.1);
    state.last = now;
    if (dt <= 0 or getprop("/sim/freeze/master")) return;
    state.t += dt;
    setprop("/stewart-demo/t", state.t);

    var roll = getprop("/orientation/roll-deg");
    var pitch = getprop("/orientation/pitch-deg");
    var p = getprop("/orientation/roll-rate-degps");
    var q = getprop("/orientation/pitch-rate-degps");
    var r = getprop("/orientation/yaw-rate-degps");
    var ias = getprop("/velocities/airspeed-kt");
    var agl = getprop("/position/altitude-agl-ft");
    var vs = getprop("/velocities/vertical-speed-fps") or 0;
    var hdg = getprop("/orientation/heading-deg");
    var beta = getprop("/orientation/side-slip-deg") or 0;
    var steer = func clamp(c.rud_hdg * wrap180(state.hdg0 - hdg) - c.rud_rate * r, -1, 1);

    var roll_t = 0; var pitch_t = 0; var throttle = c.climb_throttle; var rudder = 0;

    if (state.phase == "rolagem") {
        rudder = steer();
        pitch_t = pitch;  # sem comando de profundor no chão
        if (ias > c.vr) set_phase("rotacao");
    } elsif (state.phase == "rotacao" or state.phase == "subida") {
        pitch_t = c.climb_pitch;
        rudder = agl < 30 ? steer() : c.rud_beta * beta;
        if (state.phase == "rotacao" and agl > 50) set_phase("subida");
        if (c.gear_up_agl > 0 and agl > c.gear_up_agl and vs > 0) setprop("/controls/gear/gear-down", 0);
        if (agl > c.flaps_up_agl) setprop("/controls/flight/flaps", 0);
        if (agl > c.maneuvers_agl) {
            state.seg = 0; state.seg_t = 0;
            set_phase("manobras");
        }
    } elsif (state.phase == "manobras") {
        var s = c.sequence[state.seg];
        roll_t = s[1]; pitch_t = s[2]; throttle = s[3];
        if (s[4] > 0) roll_t = s[4] * math.sin(2 * math.pi * 0.25 * state.seg_t);
        rudder = c.rud_beta * beta;
        state.seg_t += dt;
        if (state.seg_t > s[0]) {
            state.seg += 1; state.seg_t = 0;
            if (state.seg >= size(c.sequence)) {
                state.seg = size(c.sequence) - 1;
                set_phase("fim");
            }
        }
    } else {  # fim: mantém nivelado
        roll_t = c.final[0]; pitch_t = c.final[1]; throttle = c.final[2]; rudder = c.rud_beta * beta;
    }

    state.roll_cmd = approach(state.roll_cmd, roll_t, 12, dt);
    state.pitch_cmd = approach(state.pitch_cmd, pitch_t, 4, dt);

    # aileron positivo rola à direita; profundor positivo abaixa o nariz
    var aileron = clamp(c.kp_roll * (state.roll_cmd - roll) - c.kd_roll * p, -1, 1);
    var elevator = 0;
    if (state.phase != "rolagem") {
        var err = state.pitch_cmd - pitch;
        state.pitch_int = clamp(state.pitch_int + err * dt, -40, 40);
        elevator = -c.kp_pitch * err - c.ki_pitch * state.pitch_int + c.kd_pitch * q;
        # curva: um pouco de profundor extra para não perder altura
        elevator -= c.turn_elev * math.abs(roll);
    }

    setprop("/controls/flight/aileron", aileron);
    setprop("/controls/flight/elevator", clamp(elevator, -1, 1));
    setprop("/controls/flight/rudder", clamp(rudder, -1, 1));
    set_throttle(throttle);
};

var start = func {
    stop();
    var name = getprop("/sim/aircraft");
    state.cfg = contains(PROFILES, name) ? PROFILES[name] : PROFILES["c172p"];
    state.last = getprop("/sim/time/elapsed-sec");
    state.t = 0;
    state.pitch_int = 0;
    state.hdg0 = getprop("/orientation/heading-deg");
    state.roll_cmd = getprop("/orientation/roll-deg");
    state.pitch_cmd = getprop("/orientation/pitch-deg");
    setprop("/controls/gear/brake-parking", 0);
    setprop("/controls/flight/flaps", state.cfg.flaps_takeoff);
    setprop("/controls/engines/engine[0]/mixture", 1);
    set_phase(getprop("/gear/gear[0]/wow") ? "rolagem" : "manobras");
    # terceira pessoa: quem assiste vê a orientação do avião de fora da cabine
    var chase = view.indexof("Chase View");
    if (chase != nil) setprop("/sim/current-view/view-number", chase);
    state.timer = maketimer(0, update);
    state.timer.start();
};

var stop = func {
    if (state.timer != nil) state.timer.stop();
    state.timer = nil;
    set_phase("parado");
};
