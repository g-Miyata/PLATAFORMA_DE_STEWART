import { LogOut, Moon, Plane, Sun } from 'lucide-react';
import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { ModeBadge } from '@/components/ModeBadge';
import { useFullscreen } from '@/components/Stage';
import { useAutoDisable, useCanCommand } from '@/features/control/useControlGate';
import { useFgReady } from '@/features/cueing/FlightGearPanel';
import { useReleaseOnLeave } from '@/features/cueing/SharedCards';
import { useGamepad } from '@/features/joystick/gamepad';
import { useLanAction, useLanInfo, useLanStatus } from '@/features/mobile/lan';
import { useGeometry } from '@/features/platform3d/geometry';
import type { ExhibitFrame } from '@/features/presentation/ExhibitCanvas';
import { prefersReducedMotion, useIdleCursor, useWakeLock } from '@/features/presentation/hooks';
import { buildPlaylist } from '@/features/presentation/kiosk';
import { OperatorPanel } from '@/features/presentation/OperatorPanel';
import { PhoneHud, PhoneQrCard } from '@/features/presentation/PhoneCorner';
import { FlightHud, SceneHud } from '@/features/presentation/SceneHud';
import { dofAt, SCENES, sceneAt, sceneStart, type Shot } from '@/features/presentation/scenes';
import { exhibitPalette, FLIGHT_PROFILE, isFlightMode, type ExhibitMode } from '@/features/presentation/theme';
import { useExhibitFlight } from '@/features/presentation/useExhibitFlight';
import { useKiosk } from '@/features/presentation/useKiosk';
import { stepTilt, VISITOR_IDLE_S, VISITOR_MODEL, VISITOR_REAL } from '@/features/presentation/visitor';
import { useLibrary } from '@/features/recorder/library';
import { refreshSerialStatus } from '@/features/serial/status';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { zeroPose } from '@/lib/kinematics';
import { fmt } from '@/lib/pistons';
import { useConnection } from '@/stores/connection';
import { useCueing } from '@/stores/cueing';
import { useTelemetry } from '@/stores/telemetry';
import { useUi } from '@/stores/ui';

// three + pós-processamento carregam separados: o texto aparece na hora
const ExhibitCanvas = memo(lazy(() => import('@/features/presentation/ExhibitCanvas').then((m) => ({ default: m.ExhibitCanvas }))));

const VISITOR_SHOT: Shot = { azimuth: -90, elevation: 34, distance: 2800, targetZ: 200 };
// celular no comando: a bancada no centro, mais perto
const PHONE_SHOT: Shot = { azimuth: -90, elevation: 22, distance: 2400, targetZ: 320 };
const SEND_MS = 100;
const HOLD_MS = 1800;
// o operador pediu para a apresentação ligar o modo rede sozinha (QR code do celular)
const AUTO_LAN_KEY = 'stewart-exhibit-auto-lan';
function readAutoLan() {
  try {
    return localStorage.getItem(AUTO_LAN_KEY) === '1';
  } catch {
    return false;
  }
}
function saveAutoLan(on: boolean) {
  try {
    localStorage.setItem(AUTO_LAN_KEY, on ? '1' : '0');
  } catch {
    // sem armazenamento: vale só nesta sessão
  }
}

const KEYS: Record<string, [number, number]> = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };

/** Anel de contagem regressiva até o show recomeçar. */
function Countdown({ left }: { left: number }) {
  const r = 26;
  const k = Math.max(0, Math.min(1, left / VISITOR_IDLE_S));
  return (
    <svg viewBox="0 0 64 64" className="size-16" aria-hidden>
      <circle cx="32" cy="32" r={r} fill="none" stroke="var(--ex-track)" strokeWidth="5" />
      <circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        stroke="#3fb654"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={2 * Math.PI * r}
        strokeDashoffset={2 * Math.PI * r * (1 - k)}
        transform="rotate(-90 32 32)"
      />
      <text x="32" y="37" textAnchor="middle" fontSize="16" fontWeight="700" fill="var(--ex-text)">
        {Math.ceil(left)}
      </text>
    </svg>
  );
}

export default function PresentationPage() {
  const geometry = useGeometry();
  const home = geometry.home_z;
  const canCommand = useCanCommand();
  const simulated = useConnection((s) => s.serial.simulated);
  const recordings = useLibrary((s) => s.items);
  const stage = useRef<HTMLDivElement>(null);
  const [fullscreen, toggleFullscreen] = useFullscreen(stage);
  const [reduced] = useState(prefersReducedMotion);
  const [params] = useSearchParams();
  const firstScene = useRef(sceneStart(params.get('cena')));
  const theme = useUi((s) => s.theme);
  const toggleTheme = useUi((s) => s.toggleTheme);
  const pal = exhibitPalette(theme);
  // show automático ou simulador de voo (motion cueing); ?modo=voo abre direto no voo
  const [mode, setMode] = useState<ExhibitMode>(() => {
    const m = params.get('modo');
    return m === 'voo' || m === 'orientacao' ? m : 'show';
  });
  const flightMode = isFlightMode(mode);
  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const [sceneIndex, setSceneIndex] = useState(0);
  const [visitor, setVisitor] = useState(false);
  const [operator, setOperator] = useState(false);
  const [hint, setHint] = useState(true);
  const [stick, setStick] = useState<{ ox: number; oy: number; x: number; y: number } | null>(null);
  const [idleLeft, setIdleLeft] = useState(VISITOR_IDLE_S);
  const [tiltShown, setTiltShown] = useState({ roll: 0, pitch: 0 });

  // bancada (só pelo painel do operador)
  const [real, setReal] = useState(false);
  const [publicReal, setPublicReal] = useState(false);
  const [sessionMin, setSessionMin] = useState(10);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const playlist = useMemo(() => buildPlaylist(geometry, recordings), [geometry, recordings]);
  // celular do público (modo rede): QR code na tela e, com um celular conectado, foco na bancada
  const lanStatus = useLanStatus();
  const lanInfo = useLanInfo(!!lanStatus.data?.local && !!lanStatus.data.lan);
  const lan = lanInfo.data?.lan ? lanInfo.data : null;
  const phone = lan?.devices.find((d) => d.active) ?? null;
  const phoneActive = !!phone && mode === 'show';
  const [showQr, setShowQr] = useState(true);
  // PIN dentro do QR: quem escanear entra direto; desligado, o visitante pede o PIN ao apresentador
  const [qrWithPin, setQrWithPin] = useState(false);
  const qrShown = mode === 'show' && !!lan && !phone && showQr && !visitor;
  const lanStart = useLanAction(() => api.lanStart(), 'Modo rede ligado');
  const [autoLan, setAutoLanState] = useState(readAutoLan);
  const setAutoLan = (on: boolean) => {
    setAutoLanState(on);
    saveAutoLan(on);
  };
  // ao abrir (ou se o backend reiniciou), religa o modo rede se o operador pediu
  const lanOff = lanStatus.data?.local === true && !lanStatus.data.lan;
  const autoTried = useRef(false);
  const startLan = lanStart.mutate;
  useEffect(() => {
    if (!lanOff) {
      autoTried.current = false;
      return;
    }
    if (!autoLan || autoTried.current) return;
    autoTried.current = true;
    startLan(undefined);
  }, [autoLan, lanOff, startLan]);
  const kick = useLanAction((id: string) => api.lanKick(id), 'Celular desconectado: o show recomeça');
  // celular no comando sem nada conectado no PC: conecta o simulador (os comandos precisam de um destino)
  const serialConnected = useConnection((s) => s.serial.connected);
  const backendOnline = useConnection((s) => s.backendOnline !== false);
  const simTried = useRef(false);
  useEffect(() => {
    if (!phoneActive) {
      simTried.current = false;
      return;
    }
    if (serialConnected || !backendOnline || simTried.current) return;
    simTried.current = true;
    api
      .openSerial('SIMULADOR')
      .then(() => {
        refreshSerialStatus();
        toast.info('Simulador conectado', { description: 'Nada estava conectado: os comandos do celular vão para a plataforma virtual.' });
      })
      .catch((err: Error) => toast.error('O celular está sem destino', { description: `Conecte o simulador ou a bancada. ${err.message}` }));
  }, [phoneActive, serialConnected, backendOnline]);
  const phoneRef = useRef(false);
  useEffect(() => {
    phoneRef.current = phoneActive;
    // o celular manda na plataforma: para o que o quiosque estiver tocando
    if (phoneActive) void api.motionStop().catch(() => undefined);
  }, [phoneActive]);

  const visitorDrivesReal = real && publicReal && visitor && !phoneActive;
  const kiosk = useKiosk(real && mode === 'show' && !visitorDrivesReal && !phoneActive, playlist, sessionMin, () => setReal(false));
  const fgReady = useFgReady();
  const flight = useExhibitFlight(flightMode, isFlightMode(mode) ? FLIGHT_PROFILE[mode] : 'washout', real, fgReady, () => setReal(false));
  useReleaseOnLeave('washout');
  useReleaseOnLeave('attitude');

  useEffect(() => {
    document.title = 'Apresentação · Plataforma de Stewart · IFSP';
    const t = setTimeout(() => setHint(false), 9000);
    return () => clearTimeout(t);
  }, []);

  function toggleReal(on: boolean) {
    setReal(on);
    setDeadline(on ? Date.now() + sessionMin * 60_000 : null);
    if (!on) {
      setPublicReal(false);
      void api.motionStop().catch(() => undefined);
    }
  }
  useAutoDisable(real, () => {
    setReal(false);
    setPublicReal(false);
    setDeadline(null);
  });

  // fim da sessão (vale também para o tempo em que o público controlou)
  useEffect(() => {
    if (!deadline) return;
    const id = setInterval(() => {
      setNow(Date.now());
      if (Date.now() > deadline) {
        setReal(false);
        setPublicReal(false);
        setDeadline(null);
        void api.motionStop().catch(() => undefined);
        toast.info('Sessão encerrada', { description: 'A plataforma voltou ao home.' });
      }
    }, 1000);
    return () => clearInterval(id);
  }, [deadline]);

  // ---------------- entrada do visitante ----------------
  const input = useRef<[number, number]>([0, 0]);
  const keys = useRef(new Set<string>());
  const pad = useRef<[number, number]>([0, 0]);
  const drag = useRef<{ ox: number; oy: number; x: number; y: number } | null>(null);
  const lastInput = useRef(0);
  const tilt = useRef({ roll: 0, pitch: 0 });

  const touch = useCallback(() => {
    // no simulador de voo quem pilota é o voo gravado; com o celular conectado, é o celular
    if (modeRef.current !== 'show' || phoneRef.current) return;
    lastInput.current = performance.now();
    firstScene.current = 0;
    setVisitor(true);
  }, [setVisitor]);

  const updateInput = useCallback(() => {
    let x = 0;
    let y = 0;
    for (const k of keys.current) {
      x += KEYS[k][0];
      y += KEYS[k][1];
    }
    if (drag.current) [x, y] = [drag.current.x, drag.current.y];
    if (pad.current[0] || pad.current[1]) [x, y] = pad.current;
    input.current = [Math.max(-1, Math.min(1, x)), Math.max(-1, Math.min(1, y))];
    if (x || y) touch();
  }, [touch]);

  useGamepad((s) => {
    pad.current = [s.lx, -s.ly];
    updateInput();
  });

  function onPointer(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.type === 'pointerdown') {
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      drag.current = { ox: e.clientX, oy: e.clientY, x: 0, y: 0 };
      touch();
    } else if (e.type === 'pointermove' && drag.current) {
      const d = drag.current;
      d.x = Math.max(-1, Math.min(1, (e.clientX - d.ox) / 180));
      d.y = Math.max(-1, Math.min(1, -(e.clientY - d.oy) / 180));
    } else if (e.type !== 'pointermove') {
      drag.current = null;
    }
    setStick(drag.current ? { ...drag.current } : null);
    updateInput();
  }

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, select, textarea, aside')) return;
      if (e.code === 'KeyO') {
        setOperator((o) => !o);
        return;
      }
      if (KEYS[e.code]) {
        e.preventDefault();
        keys.current.add(e.code);
        updateInput();
      }
    };
    const up = (e: KeyboardEvent) => {
      keys.current.delete(e.code);
      updateInput();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [updateInput]);

  // contagem para voltar ao show (segurar o dedo na tela conta como mexer)
  useEffect(() => {
    if (!visitor) return;
    const id = setInterval(() => {
      if (drag.current || input.current[0] || input.current[1]) lastInput.current = performance.now();
      const left = VISITOR_IDLE_S - (performance.now() - lastInput.current) / 1000;
      setIdleLeft(Math.max(0, left));
      setTiltShown({ ...tilt.current });
      if (left <= 0) setVisitor(false);
    }, 200);
    return () => clearInterval(id);
  }, [visitor]);

  // público controlando a bancada: para o quiosque e manda a inclinação a 10 Hz
  useEffect(() => {
    if (!visitorDrivesReal) return;
    let busy = false;
    void api.motionStop().catch(() => undefined);
    const id = setInterval(async () => {
      if (busy) return;
      busy = true;
      try {
        await api.applyPose({ x: 0, y: 0, z: home, roll: tilt.current.roll, pitch: tilt.current.pitch, yaw: 0 }, 'apresentacao');
      } catch {
        // uma rotina do quiosque ainda terminando: para e tenta no próximo envio
        await api.motionStop().catch(() => undefined);
      } finally {
        busy = false;
      }
    }, SEND_MS);
    return () => clearInterval(id);
  }, [visitorDrivesReal, home]);

  // ---------------- quadro a quadro ----------------
  const loopT = useRef(0);
  const loopStart = useRef(0);
  const frame = useRef<ExhibitFrame>({ pose: zeroPose(home), shot: SCENES[0].shot[0], legs: null, axis: null });
  const onFrame = useCallback(
    (dt: number) => {
      if (phoneActive) {
        // o que o celular fez na plataforma (simulador ou bancada), com a câmera parada nela
        const t = useTelemetry.getState().telemetry;
        const fresh = t?.pose_live && Date.now() / 1000 - t.ts < 1.5 ? t.pose_live : null;
        const s = performance.now() / 1000;
        frame.current = {
          pose: fresh ?? zeroPose(home),
          shot: { ...PHONE_SHOT, azimuth: PHONE_SHOT.azimuth + 12 * Math.sin(s * 0.08) },
          legs: 'all',
          axis: null,
        };
        return;
      }
      const live = real ? useTelemetry.getState().telemetry?.pose_live : null;
      if (isFlightMode(mode)) {
        // pose calculada pelo washout (a mesma que vai para a bancada quando engatada)
        const tick = useCueing.getState().tick;
        const t = performance.now() / 1000;
        frame.current = {
          pose: live ?? tick?.pose ?? zeroPose(home),
          shot: { azimuth: -55 + 35 * Math.sin(t * 0.04), elevation: 16 + 5 * Math.sin(t * 0.07), distance: 3000, targetZ: 220 },
          legs: null,
          axis: null,
        };
        return;
      }
      if (visitor) {
        tilt.current = stepTilt(tilt.current, input.current, dt, real && publicReal ? VISITOR_REAL : VISITOR_MODEL);
        const cmd = { x: 0, y: 0, z: home, roll: tilt.current.roll, pitch: tilt.current.pitch, yaw: 0 };
        frame.current = { pose: real && publicReal && live ? live : cmd, shot: VISITOR_SHOT, legs: 'all', axis: null };
        return;
      }
      // volta ao show a partir do começo de uma cena (que começa no home: sem salto)
      tilt.current = { roll: 0, pitch: 0 };
      // relógio de parede: o show segue no tempo certo mesmo se o FPS cair
      loopT.current = (performance.now() - loopStart.current) / 1000;
      const st = sceneAt(loopT.current, home);
      const id = st.scene.id;
      frame.current = {
        pose: live ?? st.pose,
        shot: st.shot,
        legs: id === 'pistoes' ? Math.min(5, Math.floor(st.u * 6)) : id === 'cinematica' ? 0 : null,
        axis: id === 'gdl' && !live ? dofAt(st.u).axis : null,
      };
    },
    [mode, visitor, real, publicReal, home, phoneActive],
  );
  const getPhonePose = useCallback(() => frame.current.pose, []);
  const getFrame = useCallback(() => frame.current, []);
  const getTick = useCallback(() => useCueing.getState().tick, []);
  const getHudState = useCallback(() => {
    const st = sceneAt((performance.now() - loopStart.current) / 1000, home);
    return { u: st.u, pose: frame.current.pose };
  }, [home]);

  // ao sair do modo visitante, recomeça o show na cena de título
  useEffect(() => {
    if (visitor) return;
    // a primeira vez pode abrir numa cena (?cena=…); ao voltar do modo visitante, recomeça no título
    loopStart.current = performance.now() - firstScene.current * 1000;
    loopT.current = 0;
    setSceneIndex(sceneAt((performance.now() - loopStart.current) / 1000, home).index);
    // a cena do texto segue o relógio (também com a aba em segundo plano, sem quadros)
    const id = setInterval(() => setSceneIndex(sceneAt((performance.now() - loopStart.current) / 1000, home).index), 250);
    return () => clearInterval(id);
  }, [visitor, home]);

  // segurar o logo abre o painel do operador (o público não descobre por acaso)
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startHold = (e: ReactPointerEvent) => {
    e.stopPropagation();
    hold.current = setTimeout(() => setOperator(true), HOLD_MS);
  };
  const endHold = () => {
    if (hold.current) clearTimeout(hold.current);
  };

  const hideCursor = useIdleCursor(!operator);
  useWakeLock(true);
  const remaining = deadline ? Math.max(0, (deadline - now) / 1000) : null;

  return (
    <div
      ref={stage}
      data-theme={theme}
      style={{ ...pal.vars, background: pal.bg }}
      className={cn('relative h-dvh w-full touch-none select-none overflow-hidden text-[var(--ex-text)]', hideCursor && 'cursor-none')}
      onPointerDown={onPointer}
      onPointerMove={onPointer}
      onPointerUp={onPointer}
      onPointerCancel={onPointer}
    >
      <h1 className="sr-only">Apresentação da Plataforma de Stewart</h1>
      <div className="absolute inset-0" aria-hidden>
        <Suspense fallback={null}>
          <ExhibitCanvas geometry={geometry} getFrame={getFrame} onFrame={onFrame} reducedMotion={reduced} bg={pal.bg} floor={pal.floor} dark={pal.dark} />
        </Suspense>
      </div>
      {/* leitura do texto sobre a cena */}
      <div aria-hidden className={cn('pointer-events-none absolute inset-0', pal.scrim)} />
      <div aria-hidden className={cn('pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b to-transparent', pal.scrimTop)} />

      {/* topo: logo (segurar = painel do operador) */}
      <div className="absolute left-5 top-5 flex items-center gap-4 sm:left-8 sm:top-7" onPointerDown={startHold} onPointerUp={endHold} onPointerLeave={endHold}>
        <img src={pal.logo} alt="Instituto Federal de São Paulo, Campus São José dos Campos" className="h-11 w-auto sm:h-14" draggable={false} />
      </div>
      <div className="absolute right-5 top-5 flex items-center gap-3 sm:right-8 sm:top-7">
        {real && (
          <>
            <ModeBadge />
            <span className="rounded-full bg-[var(--ex-panel)] px-3 py-1 text-sm font-semibold">
              <kbd className="rounded border border-[var(--ex-border)] px-1">Esc</kbd> para parar
            </span>
          </>
        )}
        {hint && !operator && (
          <span className="scene-enter rounded-full bg-[var(--ex-panel)] px-3 py-1 text-xs text-[var(--ex-muted)]">
            Letra <kbd className="rounded border border-[var(--ex-border)] px-1 font-sans font-semibold">O</kbd> do teclado: painel do operador
            {lanOff && ' (liga o QR code do celular)'}
          </span>
        )}
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={toggleTheme}
          className="grid size-9 place-items-center rounded-full text-[var(--ex-muted)] transition-colors hover:bg-[var(--ex-panel)] hover:text-[var(--ex-text)]"
          aria-label={pal.dark ? 'Usar o tema claro' : 'Usar o tema escuro'}
        >
          {pal.dark ? <Sun aria-hidden className="size-4" /> : <Moon aria-hidden className="size-4" />}
        </button>
        <Link
          to="/"
          onPointerDown={(e) => e.stopPropagation()}
          className="grid size-9 place-items-center rounded-full text-[var(--ex-muted)] transition-colors hover:bg-[var(--ex-panel)] hover:text-[var(--ex-text)]"
          aria-label="Sair da apresentação"
        >
          <LogOut aria-hidden className="size-4" />
        </Link>
      </div>

      {/* texto da cena ou HUD do visitante */}
      <div className="pointer-events-none absolute inset-x-5 bottom-20 sm:inset-x-10 sm:bottom-24 lg:right-auto lg:max-w-[64rem]" aria-live="polite">
        {phoneActive && phone ? (
          <PhoneHud device={phone} getPose={getPhonePose} onDisconnect={() => kick.mutate(phone.id)} />
        ) : flightMode ? (
          <FlightHud key={mode} getTick={getTick} flightName={flight?.name ?? null} attitude={mode === 'orientacao'} />
        ) : visitor ? (
          <section aria-labelledby="visitante-titulo" className="scene-enter flex items-end gap-5">
            <Countdown left={idleLeft} />
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[var(--ex-accent)]">Modo interativo</p>
              <h2 id="visitante-titulo" className="text-5xl font-extrabold tracking-tight sm:text-6xl">
                Você está no controle
              </h2>
              <p className="mt-2 text-lg text-[var(--ex-muted)]">
                Arraste para inclinar · roll {fmt(tiltShown.roll, 1)}° · pitch {fmt(tiltShown.pitch, 1)}°
                {visitorDrivesReal && ' · movendo a bancada de verdade'}
              </p>
            </div>
          </section>
        ) : (
          <SceneHud index={sceneIndex} getState={getHudState} geometry={geometry} />
        )}
      </div>

      {flightMode && fgReady && (
        <figure className="pointer-events-none absolute right-5 top-20 w-[min(34rem,42vw)] overflow-hidden rounded-xl border border-[var(--ex-border)] bg-black shadow-2xl sm:right-8">
          <img src="/fg/stream?k=apresentacao" alt="FlightGear: o avião do voo que está tocando" className="aspect-video w-full object-cover" />
          <figcaption className="flex items-center gap-1.5 bg-[var(--ex-panel)] px-3 py-1.5 text-xs text-[var(--ex-muted)]">
            <Plane aria-hidden className="size-3.5" />
            FlightGear ao vivo · ERJ145 do IFSP
          </figcaption>
        </figure>
      )}

      {/* convite para o celular (modo rede ligado, nenhum celular conectado): embaixo do logo, acima dos títulos */}
      {qrShown && lan && (
        <div className="absolute left-5 top-24 hidden sm:left-8 sm:top-28 lg:block [@media(max-height:760px)]:hidden">
          <PhoneQrCard info={lan} withPin={qrWithPin} />
        </div>
      )}

      {/* joystick virtual no ponto do toque */}
      {stick && (
        <div aria-hidden className="pointer-events-none absolute size-40 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--ex-border)] bg-[var(--ex-panel)]" style={{ left: stick.ox, top: stick.oy }}>
          <div
            className="absolute left-1/2 top-1/2 size-14 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#3fb654] shadow-[0_0_30px_#3fb654]"
            style={{ transform: `translate(calc(-50% + ${stick.x * 60}px), calc(-50% + ${-stick.y * 60}px))` }}
          />
        </div>
      )}

      {/* rodapé: progresso das cenas e convite */}
      <div className="pointer-events-none absolute inset-x-5 bottom-6 flex items-center justify-between gap-4 sm:inset-x-10 sm:bottom-8">
        <ol className={cn('flex gap-2', (flightMode || phoneActive) && 'invisible')} aria-label="Cenas" aria-hidden={flightMode || phoneActive || undefined}>
          {SCENES.map((s, i) => (
            <li
              key={s.id}
              aria-current={!visitor && i === sceneIndex ? 'step' : undefined}
              className={cn('h-1.5 rounded-full transition-all duration-500', !visitor && i === sceneIndex ? 'w-12 bg-[#3fb654]' : 'w-5 bg-[var(--ex-track)]')}
            >
              <span className="sr-only">{s.title}</span>
            </li>
          ))}
        </ol>
        {!visitor && !phoneActive && mode === 'show' && <p className="text-sm font-medium text-[var(--ex-muted)]">Toque e arraste para controlar</p>}
      </div>

      {operator && (
        <OperatorPanel
          onClose={() => setOperator(false)}
          canCommand={canCommand}
          simulated={simulated}
          real={real}
          onReal={toggleReal}
          publicReal={publicReal}
          onPublicReal={setPublicReal}
          sessionMin={sessionMin}
          onSessionMin={setSessionMin}
          remaining={remaining}
          kiosk={kiosk}
          playlistLength={playlist.length}
          fullscreen={fullscreen}
          onFullscreen={toggleFullscreen}
          mode={mode}
          onMode={(m) => {
            setMode(m);
            setVisitor(false);
          }}
          flightName={flight?.name ?? null}
          fgReady={fgReady}
          lan={!!lan}
          onLanStart={() => {
            // quem liga aqui quer o QR na exposição: fica ligado nas próximas vezes (dá para desligar no painel)
            setAutoLan(true);
            lanStart.mutate(undefined);
          }}
          autoLan={autoLan}
          onAutoLan={setAutoLan}
          lanStarting={lanStart.isPending}
          showQr={showQr}
          onShowQr={setShowQr}
          qrWithPin={qrWithPin}
          onQrWithPin={setQrWithPin}
          pin={lan?.pin ?? null}
          phone={phone}
          onKick={(id) => kick.mutate(id)}
        />
      )}
    </div>
  );
}
