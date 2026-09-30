# Piloto de demonstração do simulador de voo (Embraer ERJ145 ou Cessna 172P).
#
# ERJ145 (modo circuito, ~6 min, feito para a pista 27R do SBGR, que o start-flightgear-cueing.ps1
# escolhe): abre com uma apresentação do avião (a câmera gira
# em volta mostrando a pintura enquanto os motores dão partida), decola, sobe, faz um
# circuito de tráfego pela esquerda com manobras na perna do vento (puxada e picada,
# balanço de asas, curva em S) e pousa na mesma pista: final com rampa de 3°,
# arredondamento, toque, freios e parada. Foi usado para gravar a rotina de
# demonstração em interface/simulation/flights/.
# C172P (modo sequência): decola e faz uma sequência fixa de manobras, sem pouso.
#
# Rodar: python fly-demo.py (manda este código pela API HTTP do FlightGear, já que
# o Nasal não lê arquivos fora das pastas do simulador). Parar: python fly-demo.py --stop
# Progresso em /stewart-demo/phase e /stewart-demo/t

var clamp = func(v, lo, hi) { v < lo ? lo : (v > hi ? hi : v) };
var wrap180 = func(a) { while (a > 180) a -= 360; while (a < -180) a += 360; a };
var approach = func(cur, target, rate, dt) { cur + clamp(target - cur, -rate * dt, rate * dt) };
var D2R = math.pi / 180;
var M2FT = 3.28084;

# Sequência de manobras (modo sequência): [duração s, roll alvo °, pitch alvo °, manete, balanço de asas ±°]
var PROFILES = {
    erj145: {
        engines: 2, vr: 135, climb_pitch: 10, climb_throttle: 1.0,
        flaps_takeoff: 0.25, gear_up_agl: 100, flaps_up_agl: 800,
        kp_roll: 0.03, kd_roll: 0.02, kp_pitch: 0.06, kd_pitch: 0.04, ki_pitch: 0.015,
        rud_hdg: 0.05, rud_rate: 0.08, rud_beta: 0.02, turn_elev: 0.003,
        circuit: {
            pattern_agl: 1200,    # altura do circuito (ft)
            turn_agl: 500,        # começa a curva de saída subindo (ft)
            downwind_y: -3000,    # perna do vento, à esquerda da pista (m); a base termina perto do eixo
            base_x: -3200,        # começa a base quando passar deste ponto (m, antes da cabeceira)
            touchdown_x: 400,     # ponto de toque depois da posição de partida (m)
            glide_deg: 3.0,
            bank: 30,             # banco das curvas do circuito (°)
            v_pattern: 190, v_base: 165, v_final: 140,  # kt
            flare_agl: 60,        # ft
        },
        # apresentação antes da decolagem: [t s, giro da câmera °, inclinação °, zoom (campo de visão °),
        # distância (× a da Chase View)]; o giro segue sempre no mesmo sentido e termina atrás do avião
        intro: [
            [ 0,  155,  3, 30, 0.55],   # nariz de perto, levemente de baixo
            [ 5,  100, -2, 38, 0.65],   # lateral: faixas da pintura na fuselagem
            [10,   40, -9, 34, 0.55],   # cauda
            [15,  -40, -6, 42, 0.80],   # passa para o outro lado
            [20, -110, -4, 45, 0.90],   # frente do outro lado
            [24, -200, -5, 50, 1.00],   # frente
            [29, -360, nil, nil, 1.00], # atrás do avião, câmera padrão da Chase View
        ],
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
    timer: nil, phase: "", t: 0, last: 0, cfg: nil,
    hdg0: 0, lat0: 0, lon0: 0, elev0: 0, wheel_h: 0,
    roll_cmd: 0, pitch_cmd: 0, pitch_int: 0, seg: 0, seg_t: 0,
    phase_t: 0, pitch_ref: 0, thr_int: 0.6, y_int: 0, y_prev: nil, y_dot: 0,
    cam0: nil,
};

var set_phase = func(name) {
    state.phase = name;
    state.phase_t = 0;
    setprop("/stewart-demo/phase", name);
};

var set_throttle = func(v) {
    for (var i = 0; i < state.cfg.engines; i += 1)
        setprop("/controls/engines/engine[" ~ i ~ "]/throttle", v);
};

var set_brakes = func(v) {
    setprop("/controls/gear/brake-left", v);
    setprop("/controls/gear/brake-right", v);
};

# Posição em relação à pista de partida: x ao longo da pista, y à direita (m)
var runway_xy = func {
    var n = (getprop("/position/latitude-deg") - state.lat0) * D2R * 6371000;
    var e = (getprop("/position/longitude-deg") - state.lon0) * D2R * 6371000 * math.cos(state.lat0 * D2R);
    var h = state.hdg0 * D2R;
    return [n * math.cos(h) + e * math.sin(h), -n * math.sin(h) + e * math.cos(h)];
};

# Leis externas: proa -> roll, razão de subida -> pitch, velocidade -> manete
var roll_for_heading = func(hdg_t, hdg, bank) clamp(1.5 * wrap180(hdg_t - hdg), -bank, bank);

var pitch_for_vs = func(vs_t, vs, dt) {
    var err = vs_t - vs;  # ft/min
    state.pitch_ref = clamp(state.pitch_ref + 0.0012 * err * dt, -6, 14);
    return clamp(state.pitch_ref + 0.002 * err, -8, 15);
};

var throttle_for_speed = func(ias_t, ias, dt) {
    var err = ias_t - ias;
    state.thr_int = clamp(state.thr_int + 0.004 * err * dt, 0.05, 1.0);
    return clamp(state.thr_int + 0.03 * err, 0, 1);
};

var vs_for_alt = func(alt_t, alt) clamp(6 * (alt_t - alt), -1500, 1500);

# ---------------- apresentação (câmera tipo comercial) ----------------
var smooth = func(u) { u = clamp(u, 0, 1); u * u * (3 - 2 * u) };

var engines_running = func {
    for (var i = 0; i < state.cfg.engines; i += 1)
        if (!getprop("/engines/engine[" ~ i ~ "]/running")) return 0;
    return 1;
};

# Câmera da Chase View num instante da apresentação (interpolação suave entre quadros-chave)
var intro_camera = func(t) {
    var keys = state.cfg.intro;
    var c0 = state.cam0;
    var val = func(k, i) {
        var v = keys[k][i];
        if (v != nil) return v;
        return i == 2 ? c0.pitch : c0.fov;
    };
    var k = 0;
    while (k < size(keys) - 2 and t > keys[k + 1][0]) k += 1;
    var e = smooth((t - keys[k][0]) / (keys[k + 1][0] - keys[k][0]));
    var lerp = func(i) val(k, i) + e * (val(k + 1, i) - val(k, i));
    var hdg = lerp(1);
    setprop("/sim/current-view/heading-offset-deg", math.fmod(math.fmod(hdg, 360) + 360, 360));
    setprop("/sim/current-view/pitch-offset-deg", lerp(2));
    setprop("/sim/current-view/field-of-view", lerp(3));
    setprop("/sim/chase-distance-m", c0.dist * lerp(4));
};

# Trajetória no chão (°): com vento cruzado o nariz aponta para um lado e o avião anda para outro
var ground_track = func {
    var vn = getprop("/velocities/speed-north-fps") or 0;
    var ve = getprop("/velocities/speed-east-fps") or 0;
    return math.atan2(ve, vn) / D2R;
};

# Localizador: trajetória alvo para voltar ao eixo (y = 0), com amortecimento pela velocidade
# lateral (evita cruzar o eixo) e integral só perto dele
var localizer_track = func(y, dt, lim) {
    if (state.y_prev != nil and dt > 0) state.y_dot += 0.2 * ((y - state.y_prev) / dt - state.y_dot);
    state.y_prev = y;
    if (math.abs(y) < 60) state.y_int = clamp(state.y_int + y * dt, -1500, 1500);
    return state.hdg0 - clamp(0.08 * y + 0.6 * state.y_dot + 0.002 * state.y_int, -lim, lim);
};

# ---------------- modo circuito (ERJ145) ----------------
var circuit = func(c, s, dt) {
    var k = c.circuit;
    var xy = runway_xy();
    var x = xy[0]; var y = xy[1];
    var alt_pattern = state.elev0 + k.pattern_agl;
    var hdg_down = state.hdg0 + 180;
    var out = {roll: 0, pitch: s.pitch, throttle: 1.0, rudder: 0, brakes: 0, elevator: nil};
    state.phase_t += dt;
    if (state.phase_t <= dt + 0.0001) {
        # fase nova: as leis de altitude e velocidade partem do pitch e da manete atuais, sem tranco
        state.pitch_ref = clamp(s.pitch, -6, 14);
        state.thr_int = getprop("/controls/engines/engine[0]/throttle") or 0.6;
    }
    setprop("/stewart-demo/x", x);
    setprop("/stewart-demo/y", y);

    if (state.phase == "apresentacao") {
        # parado e freado, motores dando partida; a câmera mostra o avião
        out.throttle = 0;
        out.elevator = 0;
        out.brakes = 1;
        var last = c.intro[size(c.intro) - 1][0];
        intro_camera(state.phase_t);
        if (state.phase_t > last and engines_running()) {
            setprop("/controls/gear/brake-parking", 0);
            set_phase("rolagem");
        }
    } elsif (state.phase == "rolagem") {
        out.rudder = clamp(c.rud_hdg * wrap180(state.hdg0 - s.hdg) - c.rud_rate * s.r, -1, 1);
        out.elevator = 0;
        if (s.ias > c.vr) set_phase("rotacao");
    } elsif (state.phase == "rotacao" or state.phase == "subida") {
        out.pitch = c.climb_pitch;
        out.roll = roll_for_heading(state.hdg0, s.hdg, 10);
        out.rudder = s.agl < 30 ? clamp(c.rud_hdg * wrap180(state.hdg0 - s.hdg) - c.rud_rate * s.r, -1, 1) : c.rud_beta * s.beta;
        if (state.phase == "rotacao" and s.agl > 50) set_phase("subida");
        if (s.agl > c.gear_up_agl and s.vs > 0) setprop("/controls/gear/gear-down", 0);
        if (s.agl > c.flaps_up_agl) setprop("/controls/flight/flaps", 0);
        if (s.agl > k.turn_agl) set_phase("curva-saida");
    } elsif (state.phase == "curva-saida") {
        # curva à esquerda de 180° subindo até a altura do circuito
        if (s.agl > c.flaps_up_agl) setprop("/controls/flight/flaps", 0);
        var err = wrap180(hdg_down - s.hdg);
        out.roll = (math.abs(err) > 30) ? -k.bank : roll_for_heading(hdg_down, s.hdg, k.bank);
        out.pitch = pitch_for_vs(vs_for_alt(alt_pattern, s.alt), s.vs, dt);
        out.throttle = throttle_for_speed(k.v_pattern, s.ias, dt);
        out.rudder = c.rud_beta * s.beta;
        if (math.abs(err) < 8) set_phase("vento");
    } elsif (state.phase == "vento") {
        # perna do vento com manobras; guia pela linha y = downwind_y
        var t = state.phase_t;
        var hdg_t = hdg_down + clamp(0.02 * (y - k.downwind_y), -30, 30);
        var alt_t = alt_pattern;
        out.roll = roll_for_heading(hdg_t, s.hdg, k.bank);
        out.pitch = pitch_for_vs(vs_for_alt(alt_t, s.alt), s.vs, dt);
        out.throttle = throttle_for_speed(k.v_pattern, s.ias, dt);
        if (t > 6 and t < 10) {
            out.pitch = 12;                          # puxada
            setprop("/stewart-demo/maneuver", "puxada");
        } elsif (t >= 10 and t < 15) {
            out.pitch = -2;                          # picada
            setprop("/stewart-demo/maneuver", "picada");
        } elsif (t > 20 and t < 32) {
            out.roll = 15 * math.sin(2 * math.pi * 0.25 * (t - 20));   # balanço de asas
            setprop("/stewart-demo/maneuver", "balanço de asas");
        } elsif (t > 34 and t < 46) {
            var s_hdg = hdg_t + 25 * math.sin(2 * math.pi * (t - 34) / 12);  # curva em S
            out.roll = roll_for_heading(s_hdg, s.hdg, k.bank);
            setprop("/stewart-demo/maneuver", "curva em S");
        } else {
            setprop("/stewart-demo/maneuver", "");
        }
        if (t >= 10 and t < 15) state.pitch_ref = clamp(s.pitch, -6, 14);  # volta à altitude sem tranco
        if (x < -1500) {
            out.throttle = throttle_for_speed(k.v_base, s.ias, dt);
            setprop("/controls/flight/flaps", 0.25);
        }
        out.rudder = c.rud_beta * s.beta;
        if (t > 46 and x < k.base_x) set_phase("base");
    } elsif (state.phase == "base") {
        # curva à esquerda de 180° descendo, trem e flaps para a final
        setprop("/controls/gear/gear-down", 1);
        setprop("/controls/flight/flaps", 0.5);
        var err = wrap180(state.hdg0 - s.hdg);
        out.roll = (math.abs(err) > 30) ? -k.bank : roll_for_heading(state.hdg0 - clamp(0.02 * y, -30, 30), s.hdg, k.bank);
        out.pitch = pitch_for_vs(vs_for_alt(state.elev0 + 900, s.alt), s.vs, dt);
        out.throttle = throttle_for_speed(k.v_base, s.ias, dt);
        out.rudder = c.rud_beta * s.beta;
        if (math.abs(err) < 20) {
            state.y_int = 0;
            state.y_prev = nil;
            state.y_dot = 0;
            set_phase("final");
        }
    } elsif (state.phase == "final") {
        # localizador (y -> proa) e rampa de 3° até o ponto de toque
        var d = k.touchdown_x - x;
        var alt_gs = state.elev0 + state.wheel_h + math.tan(k.glide_deg * D2R) * d * M2FT;
        var gs_fpm = s.gs * 101.27 * math.tan(k.glide_deg * D2R);
        # guia pela trajetória no chão, não pela proa: o vento cruzado não desloca o toque
        out.roll = roll_for_heading(localizer_track(y, dt, 30), ground_track(), 20);
        out.pitch = pitch_for_vs(-gs_fpm + 5 * (alt_gs - s.alt), s.vs, dt);
        out.throttle = throttle_for_speed(k.v_final, s.ias, dt);
        out.rudder = c.rud_beta * s.beta;
        if (math.abs(y) < 300) setprop("/controls/flight/flaps", 1);
        setprop("/stewart-demo/gs-error-ft", s.alt - alt_gs);
        if (s.agl < k.flare_agl) set_phase("arredondamento");
    } elsif (state.phase == "arredondamento") {
        # manete em marcha lenta e razão de descida caindo até ~150 ft/min no toque
        out.roll = roll_for_heading(localizer_track(y, dt, 8), ground_track(), 5);
        out.pitch = clamp(pitch_for_vs(-150 - 8 * s.agl, s.vs, dt), 0, 7);
        out.throttle = 0;
        out.rudder = clamp(c.rud_hdg * wrap180(state.hdg0 - s.hdg) - c.rud_rate * s.r, -1, 1);
        if (getprop("/gear/gear[1]/wow") or getprop("/gear/gear[2]/wow")) {
            setprop("/stewart-demo/touchdown-fpm", s.vs);
            set_phase("pouso");
        }
    } elsif (state.phase == "pouso") {
        # abaixa o nariz, spoilers, freia e mantém o eixo da pista
        setprop("/controls/flight/speedbrake", 1);
        out.throttle = 0;
        out.roll = 0;
        out.elevator = clamp(0.1 * state.phase_t, 0, 0.3);
        var hdg_ground = state.hdg0 - clamp(0.12 * y, -6, 6);  # traz de volta ao eixo o que sobrou de desvio
        out.rudder = clamp(c.rud_hdg * wrap180(hdg_ground - s.hdg) - c.rud_rate * s.r, -1, 1);
        out.brakes = getprop("/gear/gear[0]/wow") ? 0.7 : 0;
        if (s.gs < 2) {
            setprop("/controls/gear/brake-parking", 1);
            set_phase("fim");
        }
    } else {  # fim: parado na pista
        out.throttle = 0;
        out.elevator = 0;
        out.brakes = 1;
    }
    return out;
};

# ---------------- modo sequência (C172P) ----------------
var sequence = func(c, s, dt) {
    var out = {roll: 0, pitch: 0, throttle: c.climb_throttle, rudder: 0, brakes: 0, elevator: nil};
    var steer = func clamp(c.rud_hdg * wrap180(state.hdg0 - s.hdg) - c.rud_rate * s.r, -1, 1);
    if (state.phase == "rolagem") {
        out.rudder = steer();
        out.elevator = 0;
        if (s.ias > c.vr) set_phase("rotacao");
    } elsif (state.phase == "rotacao" or state.phase == "subida") {
        out.pitch = c.climb_pitch;
        out.rudder = s.agl < 30 ? steer() : c.rud_beta * s.beta;
        if (state.phase == "rotacao" and s.agl > 50) set_phase("subida");
        if (c.gear_up_agl > 0 and s.agl > c.gear_up_agl and s.vs > 0) setprop("/controls/gear/gear-down", 0);
        if (s.agl > c.flaps_up_agl) setprop("/controls/flight/flaps", 0);
        if (s.agl > c.maneuvers_agl) {
            state.seg = 0; state.seg_t = 0;
            set_phase("manobras");
        }
    } elsif (state.phase == "manobras") {
        var q = c.sequence[state.seg];
        out.roll = q[1]; out.pitch = q[2]; out.throttle = q[3];
        if (q[4] > 0) out.roll = q[4] * math.sin(2 * math.pi * 0.25 * state.seg_t);
        out.rudder = c.rud_beta * s.beta;
        state.seg_t += dt;
        if (state.seg_t > q[0]) {
            state.seg += 1; state.seg_t = 0;
            if (state.seg >= size(c.sequence)) {
                state.seg = size(c.sequence) - 1;
                set_phase("fim");
            }
        }
    } else {  # fim: mantém nivelado
        out.roll = c.final[0]; out.pitch = c.final[1]; out.throttle = c.final[2]; out.rudder = c.rud_beta * s.beta;
    }
    return out;
};

var update = func {
    var c = state.cfg;
    var now = getprop("/sim/time/elapsed-sec");
    var dt = clamp(now - state.last, 0, 0.1);
    state.last = now;
    if (dt <= 0 or getprop("/sim/freeze/master")) return;
    state.t += dt;
    setprop("/stewart-demo/t", state.t);

    var s = {
        roll: getprop("/orientation/roll-deg"),
        pitch: getprop("/orientation/pitch-deg"),
        p: getprop("/orientation/roll-rate-degps"),
        q: getprop("/orientation/pitch-rate-degps"),
        r: getprop("/orientation/yaw-rate-degps"),
        ias: getprop("/velocities/airspeed-kt"),
        gs: getprop("/velocities/groundspeed-kt"),
        agl: getprop("/position/altitude-agl-ft"),
        alt: getprop("/position/altitude-ft"),
        vs: (getprop("/velocities/vertical-speed-fps") or 0) * 60,  # ft/min
        hdg: getprop("/orientation/heading-deg"),
        beta: getprop("/orientation/side-slip-deg") or 0,
    };
    var out = contains(c, "circuit") ? circuit(c, s, dt) : sequence(c, s, dt);

    state.roll_cmd = approach(state.roll_cmd, out.roll, 12, dt);
    state.pitch_cmd = approach(state.pitch_cmd, out.pitch, 4, dt);

    # aileron positivo rola à direita; profundor positivo abaixa o nariz
    var aileron = clamp(c.kp_roll * (state.roll_cmd - s.roll) - c.kd_roll * s.p, -1, 1);
    var elevator = 0;
    if (out.elevator != nil) {
        elevator = out.elevator;
        state.pitch_int = 0;
    } else {
        var err = state.pitch_cmd - s.pitch;
        state.pitch_int = clamp(state.pitch_int + err * dt, -40, 40);
        elevator = -c.kp_pitch * err - c.ki_pitch * state.pitch_int + c.kd_pitch * s.q;
        # curva: um pouco de profundor extra para não perder altura
        elevator -= c.turn_elev * math.abs(s.roll);
    }

    setprop("/controls/flight/aileron", aileron);
    setprop("/controls/flight/elevator", clamp(elevator, -1, 1));
    setprop("/controls/flight/rudder", clamp(out.rudder, -1, 1));
    set_brakes(out.brakes);
    set_throttle(out.throttle);
};

var start = func {
    stop();
    var name = getprop("/sim/aircraft");
    state.cfg = contains(PROFILES, name) ? PROFILES[name] : PROFILES["c172p"];
    state.last = getprop("/sim/time/elapsed-sec");
    state.t = 0;
    state.pitch_int = 0;
    state.pitch_ref = 0;
    state.thr_int = 0.6;
    state.y_int = 0;
    state.hdg0 = getprop("/orientation/heading-deg");
    state.lat0 = getprop("/position/latitude-deg");
    state.lon0 = getprop("/position/longitude-deg");
    state.wheel_h = getprop("/position/altitude-agl-ft");          # altura da referência com o avião no chão
    state.elev0 = getprop("/position/altitude-ft") - state.wheel_h; # elevação da pista
    state.roll_cmd = getprop("/orientation/roll-deg");
    state.pitch_cmd = getprop("/orientation/pitch-deg");
    setprop("/controls/gear/brake-parking", 0);
    setprop("/controls/flight/speedbrake", 0);
    setprop("/controls/flight/flaps", state.cfg.flaps_takeoff);
    setprop("/controls/engines/engine[0]/mixture", 1);
    # terceira pessoa: quem assiste vê a orientação do avião de fora da cabine
    var chase = view.indexof("Chase View");
    if (chase != nil) setprop("/sim/current-view/view-number", chase);
    # câmera padrão da Chase View: a apresentação parte dela e volta para ela
    state.cam0 = {
        pitch: getprop("/sim/current-view/pitch-offset-deg") or 0,
        fov: getprop("/sim/current-view/field-of-view") or 55,
        dist: getprop("/sim/chase-distance-m") or -25,
    };
    var on_ground = getprop("/gear/gear[0]/wow");
    if (on_ground and contains(state.cfg, "intro")) {
        setprop("/controls/gear/brake-parking", 1);
        set_phase("apresentacao");
    } else {
        set_phase(on_ground ? "rolagem" : (contains(state.cfg, "circuit") ? "vento" : "manobras"));
    }
    state.timer = maketimer(0, update);
    state.timer.start();
};

var stop = func {
    if (state.timer != nil) state.timer.stop();
    state.timer = nil;
    set_phase("parado");
};
