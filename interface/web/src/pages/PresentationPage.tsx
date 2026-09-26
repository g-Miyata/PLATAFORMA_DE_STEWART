import { LogOut } from 'lucide-react';
import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { ModeBadge } from '@/components/ModeBadge';
import { useFullscreen } from '@/components/Stage';
import { useAutoDisable, useCanCommand } from '@/features/control/useControlGate';
import { useGamepad } from '@/features/joystick/gamepad';
import { useGeometry } from '@/features/platform3d/geometry';
import type { ExhibitFrame } from '@/features/presentation/ExhibitCanvas';
import { prefersReducedMotion, useIdleCursor, useWakeLock } from '@/features/presentation/hooks';
import { buildPlaylist } from '@/features/presentation/kiosk';
import { OperatorPanel } from '@/features/presentation/OperatorPanel';
import { SceneHud } from '@/features/presentation/SceneHud';
import { dofAt, SCENES, sceneAt, sceneStart, type Shot } from '@/features/presentation/scenes';
import { useKiosk } from '@/features/presentation/useKiosk';
import { stepTilt, VISITOR_IDLE_S, VISITOR_MODEL, VISITOR_REAL } from '@/features/presentation/visitor';
import { useLibrary } from '@/features/recorder/library';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { zeroPose } from '@/lib/kinematics';
import { fmt } from '@/lib/pistons';
import { useConnection } from '@/stores/connection';
import { useTelemetry } from '@/stores/telemetry';

// three + pós-processamento carregam separados: o texto aparece na hora
const ExhibitCanvas = memo(lazy(() => import('@/features/presentation/ExhibitCanvas').then((m) => ({ default: m.ExhibitCanvas }))));

const VISITOR_SHOT: Shot = { azimuth: -90, elevation: 34, distance: 3300, targetZ: 200 };
const SEND_MS = 100;
const HOLD_MS = 1800;
const KEYS: Record<string, [number, number]> = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };

/** Anel de contagem regressiva até o show recomeçar. */
function Countdown({ left }: { left: number }) {
  const r = 26;
  const k = Math.max(0, Math.min(1, left / VISITOR_IDLE_S));
  return (
    <svg viewBox="0 0 64 64" className="size-16" aria-hidden>
      <circle cx="32" cy="32" r={r} fill="none" stroke="#ffffff22" strokeWidth="5" />
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
      <text x="32" y="37" textAnchor="middle" fontSize="16" fontWeight="700" fill="#fff">
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
  const visitorDrivesReal = real && publicReal && visitor;
  const kiosk = useKiosk(real && !visitorDrivesReal, playlist, sessionMin, () => setReal(false));

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
    lastInput.current = performance.now();
    firstScene.current = 0;
    setVisitor(true);
  }, []);

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
      const live = real ? useTelemetry.getState().telemetry?.pose_live : null;
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
    [visitor, real, publicReal, home],
  );
  const getFrame = useCallback(() => frame.current, []);
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
      data-theme="dark"
      className={cn('relative h-dvh w-full touch-none select-none overflow-hidden bg-[#05080a] text-white', hideCursor && 'cursor-none')}
      onPointerDown={onPointer}
      onPointerMove={onPointer}
      onPointerUp={onPointer}
      onPointerCancel={onPointer}
    >
      <h1 className="sr-only">Apresentação da Plataforma de Stewart</h1>
      <div className="absolute inset-0" aria-hidden>
        <Suspense fallback={null}>
          <ExhibitCanvas geometry={geometry} getFrame={getFrame} onFrame={onFrame} reducedMotion={reduced} />
        </Suspense>
      </div>
      {/* leitura do texto sobre a cena */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(0,0,0,0.75),transparent_60%)]" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/60 to-transparent" />

      {/* topo: logo (segurar = painel do operador) */}
      <div className="absolute left-5 top-5 flex items-center gap-4 sm:left-8 sm:top-7" onPointerDown={startHold} onPointerUp={endHold} onPointerLeave={endHold}>
        <img src="/brand/ifsp-logo-texto-claro.svg" alt="Instituto Federal de São Paulo, Campus São José dos Campos" className="h-11 w-auto sm:h-14" draggable={false} />
      </div>
      <div className="absolute right-5 top-5 flex items-center gap-3 sm:right-8 sm:top-7">
        {real && (
          <>
            <ModeBadge />
            <span className="rounded-full bg-black/50 px-3 py-1 text-sm font-semibold">
              <kbd className="rounded border border-white/30 px-1">Esc</kbd> para parar
            </span>
          </>
        )}
        {hint && !operator && (
          <span className="scene-enter rounded-full bg-black/50 px-3 py-1 text-xs text-white/80">
            Tecla <kbd className="rounded border border-white/30 px-1">O</kbd>: painel do operador
          </span>
        )}
        <Link
          to="/"
          onPointerDown={(e) => e.stopPropagation()}
          className="grid size-9 place-items-center rounded-full text-white/40 transition-colors hover:bg-white/10 hover:text-white focus-visible:text-white"
          aria-label="Sair da apresentação"
        >
          <LogOut aria-hidden className="size-4" />
        </Link>
      </div>

      {/* texto da cena ou HUD do visitante */}
      <div className="pointer-events-none absolute inset-x-5 bottom-20 sm:inset-x-10 sm:bottom-24 lg:right-auto lg:max-w-[64rem]" aria-live="polite">
        {visitor ? (
          <section aria-labelledby="visitante-titulo" className="scene-enter flex items-end gap-5">
            <Countdown left={idleLeft} />
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#62d275]">Modo interativo</p>
              <h2 id="visitante-titulo" className="text-5xl font-extrabold tracking-tight sm:text-6xl">
                Você está no controle
              </h2>
              <p className="mt-2 text-lg text-white/80">
                Arraste para inclinar · roll {fmt(tiltShown.roll, 1)}° · pitch {fmt(tiltShown.pitch, 1)}°
                {visitorDrivesReal && ' · movendo a bancada de verdade'}
              </p>
            </div>
          </section>
        ) : (
          <SceneHud index={sceneIndex} getState={getHudState} geometry={geometry} />
        )}
      </div>

      {/* joystick virtual no ponto do toque */}
      {stick && (
        <div aria-hidden className="pointer-events-none absolute size-40 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/30 bg-white/5" style={{ left: stick.ox, top: stick.oy }}>
          <div
            className="absolute left-1/2 top-1/2 size-14 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#3fb654] shadow-[0_0_30px_#3fb654]"
            style={{ transform: `translate(calc(-50% + ${stick.x * 60}px), calc(-50% + ${-stick.y * 60}px))` }}
          />
        </div>
      )}

      {/* rodapé: progresso das cenas e convite */}
      <div className="pointer-events-none absolute inset-x-5 bottom-6 flex items-center justify-between gap-4 sm:inset-x-10 sm:bottom-8">
        <ol className="flex gap-2" aria-label="Cenas">
          {SCENES.map((s, i) => (
            <li
              key={s.id}
              aria-current={!visitor && i === sceneIndex ? 'step' : undefined}
              className={cn('h-1.5 rounded-full transition-all duration-500', !visitor && i === sceneIndex ? 'w-12 bg-[#3fb654]' : 'w-5 bg-white/25')}
            >
              <span className="sr-only">{s.title}</span>
            </li>
          ))}
        </ol>
        {!visitor && <p className="text-sm font-medium text-white/70">Toque e arraste para controlar</p>}
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
        />
      )}
    </div>
  );
}
