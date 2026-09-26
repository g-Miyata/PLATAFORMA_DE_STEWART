import { ChevronLeft, ChevronRight, GraduationCap, Home, Maximize, Minimize, MonitorPlay } from 'lucide-react';
import { Tabs } from 'radix-ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ModeBadge } from '@/components/ModeBadge';
import { glass, sceneBackground, stageClass, useFullscreen } from '@/components/Stage';
import { Button } from '@/components/ui/button';
import { SelectField, SwitchField } from '@/components/ui/field';
import { useAutoDisable, useCanCommand } from '@/features/control/useControlGate';
import { MOVES, showcasePose } from '@/features/landing/showcase';
import { LessonPanel } from '@/features/lesson/LessonPanel';
import { zyxAnimation } from '@/features/lesson/lessonMath';
import { LessonOverlays } from '@/features/lesson/Overlays';
import { STEPS } from '@/features/lesson/steps';
import { useGeometry } from '@/features/platform3d/geometry';
import { PresentationCanvas } from '@/features/presentation/PresentationCanvas';
import { buildPlaylist } from '@/features/presentation/kiosk';
import { useKiosk } from '@/features/presentation/useKiosk';
import { useLibrary } from '@/features/recorder/library';
import { mmss } from '@/features/routines/MotionStatusCard';
import { EmergencyStopButton } from '@/features/safety/EmergencyStopButton';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { zeroPose } from '@/lib/kinematics';
import { fmt, PISTON_COLORS } from '@/lib/pistons';
import type { Pose } from '@/lib/types';
import { useConnection } from '@/stores/connection';
import { useTelemetry } from '@/stores/telemetry';
import { useUi } from '@/stores/ui';

type Tab = 'demo' | 'aula';
const LESSON_KEY = 'stewart-lesson';

function loadLesson(): { step: number; answers: Record<string, number> } {
  try {
    const raw = localStorage.getItem(LESSON_KEY);
    if (raw) return { step: 0, answers: {}, ...JSON.parse(raw) };
  } catch {
    /* sem storage */
  }
  return { step: 0, answers: {} };
}

/** Mantém a tela acesa enquanto `active` (Wake Lock API, quando disponível). */
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const request = () =>
      navigator.wakeLock
        .request('screen')
        .then((l) => (lock = l))
        .catch(() => undefined);
    void request();
    const onVisible = () => document.visibilityState === 'visible' && void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release();
    };
  }, [active]);
}

/** Esconde o cursor depois de alguns segundos parado. */
function useIdleCursor(active: boolean) {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    if (!active) return;
    let t: ReturnType<typeof setTimeout>;
    const wake = () => {
      setIdle(false);
      clearTimeout(t);
      t = setTimeout(() => setIdle(true), 3000);
    };
    wake();
    window.addEventListener('pointermove', wake);
    window.addEventListener('keydown', wake);
    return () => {
      clearTimeout(t);
      window.removeEventListener('pointermove', wake);
      window.removeEventListener('keydown', wake);
    };
  }, [active]);
  return active && idle;
}

function LiveTelemetry() {
  const geometry = useGeometry();
  const telemetry = useTelemetry((s) => s.telemetry);
  const range = geometry.stroke_max - geometry.stroke_min;
  if (!telemetry) return <p className="text-sm text-muted">Sem telemetria: conecte o simulador ou a bancada para ver os valores ao vivo.</p>;
  const p = telemetry.pose_live;
  return (
    <div className="space-y-3">
      {p && (
        <dl className="grid grid-cols-3 gap-2 text-center">
          {(
            [
              ['X', p.x, 'mm'],
              ['Y', p.y, 'mm'],
              ['Z', p.z, 'mm'],
              ['Roll', p.roll, '°'],
              ['Pitch', p.pitch, '°'],
              ['Yaw', p.yaw, '°'],
            ] as const
          ).map(([k, v, u]) => (
            <div key={k} className="rounded-lg bg-surface-2/80 px-2 py-1.5">
              <dt className="text-xs uppercase text-muted">{k}</dt>
              <dd className="text-xl font-semibold tabular-nums">
                {fmt(v, u === '°' ? 1 : 0)}
                <span className="text-sm font-normal text-muted"> {u}</span>
              </dd>
            </div>
          ))}
        </dl>
      )}
      <ul className="space-y-1.5" aria-label="Curso de cada pistão">
        {telemetry.Y.map((y, i) => (
          <li key={i} className="flex items-center gap-2 text-sm">
            <span className="w-7 font-semibold">P{i + 1}</span>
            <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-3" aria-hidden>
              <span className="block h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, (y / range) * 100))}%`, background: PISTON_COLORS[i] }} />
            </span>
            <span className="w-16 text-right tabular-nums">{fmt(y, 1)} mm</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function PresentationPage() {
  const geometry = useGeometry();
  const theme = useUi((s) => s.theme);
  const canCommand = useCanCommand();
  const simulated = useConnection((s) => s.serial.simulated);
  const recordings = useLibrary((s) => s.items);
  const stage = useRef<HTMLDivElement>(null);
  const [fullscreen, toggleFullscreen] = useFullscreen(stage);
  const [tab, setTab] = useState<Tab>('demo');

  useEffect(() => {
    document.title = 'Apresentação · Plataforma de Stewart · IFSP';
  }, []);

  const background = useMemo(() => {
    void theme;
    return sceneBackground();
  }, [theme]);

  // ---------------- demonstração ----------------
  const [real, setReal] = useState(false);
  const [sessionMin, setSessionMin] = useState(10);
  const [moveIndex, setMoveIndex] = useState(0);
  const playlist = useMemo(() => buildPlaylist(geometry, recordings), [geometry, recordings]);
  useAutoDisable(real, () => setReal(false));
  const kiosk = useKiosk(real && tab === 'demo', playlist, sessionMin, () => setReal(false));
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!kiosk.startedAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [kiosk.startedAt]);

  function toggleReal(on: boolean) {
    setReal(on);
    if (!on) void api.motionStop().catch(() => undefined);
  }

  // ---------------- aula ----------------
  const [lesson, setLesson] = useState(loadLesson);
  const step = STEPS[Math.min(lesson.step, STEPS.length - 1)];
  const [lessonPose, setLessonPose] = useState<Pose>(() => zeroPose(geometry.home_z));
  const [leg, setLeg] = useState(0);
  const [animStart, setAnimStart] = useState<number | null>(null);
  const [animU, setAnimU] = useState(1);
  const animating = animStart !== null;
  useEffect(() => {
    try {
      localStorage.setItem(LESSON_KEY, JSON.stringify(lesson));
    } catch {
      /* sem storage */
    }
  }, [lesson]);

  const goStep = useCallback((i: number) => {
    setLesson((l) => ({ ...l, step: Math.max(0, Math.min(STEPS.length - 1, i)) }));
    setAnimStart(null);
  }, []);

  // ←/→ trocam de etapa (fora de campos e sliders)
  useEffect(() => {
    if (tab !== 'aula') return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, select, textarea, [role="slider"], [contenteditable="true"]')) return;
      if (e.key === 'ArrowRight') goStep(lesson.step + 1);
      else if (e.key === 'ArrowLeft') goStep(lesson.step - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tab, lesson.step, goStep]);

  // ---------------- pose desenhada ----------------
  const demoT = useRef(0);
  const shownPose = useRef<Pose>(zeroPose(geometry.home_z));
  const lessonShown = animating ? zyxAnimation(lessonPose, animU) : lessonPose;
  const onFrame = useCallback(
    (dt: number) => {
      if (tab === 'demo') {
        if (real) {
          shownPose.current = useTelemetry.getState().telemetry?.pose_live ?? zeroPose(geometry.home_z);
        } else {
          demoT.current += dt;
          const r = showcasePose(demoT.current, geometry.home_z);
          shownPose.current = r.pose;
          if (r.index !== moveIndex) setMoveIndex(r.index);
        }
      } else {
        shownPose.current = lessonShown;
        if (animStart !== null) {
          const u = (performance.now() - animStart) / 4500;
          if (u >= 1) {
            setAnimStart(null);
            setAnimU(1);
          } else setAnimU(u);
        }
      }
    },
    [tab, real, geometry.home_z, moveIndex, lessonShown, animStart],
  );
  const getPose = useCallback(() => shownPose.current, []);

  const hideCursor = useIdleCursor(tab === 'demo');
  useWakeLock(tab === 'demo');

  const move = MOVES[moveIndex];
  const remaining = kiosk.startedAt ? Math.max(0, sessionMin * 60 - (now - kiosk.startedAt) / 1000) : null;

  return (
    <div ref={stage} className={cn(stageClass, hideCursor && 'cursor-none')}>
      <div className="absolute inset-0" aria-hidden>
        <PresentationCanvas geometry={geometry} getPose={getPose} background={background} onFrame={onFrame} autoRotate={tab === 'demo'} effects={tab === 'demo'}>
          {tab === 'aula' && <LessonOverlays pose={lessonShown} geometry={geometry} flags={step.overlays} leg={leg} />}
        </PresentationCanvas>
      </div>

      <Tabs.Root value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <div className={cn(glass, 'absolute left-3 top-3 space-y-3 p-3 sm:left-4 sm:top-4')}>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">Apresentação</h1>
            {fullscreen && <ModeBadge />}
          </div>
          <Tabs.List aria-label="Modo" className="flex gap-1 rounded-lg bg-surface-2 p-1">
            <Tabs.Trigger value="demo" className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-on-primary">
              <MonitorPlay aria-hidden className="size-4" />
              Demonstração
            </Tabs.Trigger>
            <Tabs.Trigger value="aula" className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-on-primary">
              <GraduationCap aria-hidden className="size-4" />
              Aula
            </Tabs.Trigger>
          </Tabs.List>
          <Button size="sm" variant="secondary" onClick={toggleFullscreen} aria-pressed={fullscreen}>
            {fullscreen ? <Minimize aria-hidden /> : <Maximize aria-hidden />}
            {fullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
          </Button>
        </div>

        <Tabs.Content value="demo" className="outline-none">
          <div className={cn(glass, 'absolute right-3 top-3 max-h-[calc(100%-7rem)] w-[min(24rem,calc(100%-1.5rem))] space-y-4 overflow-y-auto p-4 sm:right-4 sm:top-4')}>
            {real ? (
              <div role="status" aria-live="polite">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">{simulated ? 'No simulador' : 'Na plataforma'}</p>
                <p className="text-2xl font-semibold">{kiosk.phase === 'resting' ? 'Pausa no home' : (kiosk.current ?? 'Preparando…')}</p>
                {remaining !== null && <p className="text-sm text-muted tabular-nums">Sessão termina em {mmss(remaining)}</p>}
              </div>
            ) : (
              <div role="status" aria-live="polite">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Demonstração no modelo</p>
                <p className="text-2xl font-semibold">{move.name}</p>
                <p className="text-sm text-muted">{move.description}</p>
              </div>
            )}
            <LiveTelemetry />
            <div className="space-y-3 border-t border-border pt-3">
              <SwitchField
                label="Mover a plataforma de verdade"
                description={`Toca ${playlist.length} movimentos com amplitude reduzida (até ~10 mm/s), 30 s cada, com pausa no home entre eles.`}
                checked={real}
                onCheckedChange={toggleReal}
                disabled={!canCommand}
                tone="danger"
              />
              <SelectField label="Duração da sessão" value={String(sessionMin)} onChange={(e) => setSessionMin(Number(e.target.value))} disabled={real}>
                {[5, 10, 15, 20, 30].map((m) => (
                  <option key={m} value={m}>
                    {m} minutos
                  </option>
                ))}
              </SelectField>
              {!canCommand && <p className="text-xs text-muted">Conecte o simulador ou a bancada no topo para mover de verdade.</p>}
            </div>
          </div>
          <div className={cn(glass, 'absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-3 px-4 py-2 sm:bottom-4')}>
            <p className="text-sm font-semibold">
              Pressione <kbd className="rounded border border-border-strong bg-surface-2 px-1.5 py-0.5">Esc</kbd> para parar
            </p>
            <EmergencyStopButton />
          </div>
        </Tabs.Content>

        <Tabs.Content value="aula" className="outline-none">
          <div className={cn(glass, 'absolute right-3 top-3 max-h-[calc(100%-6.5rem)] w-[min(28rem,calc(100%-1.5rem))] overflow-y-auto p-4 sm:right-4 sm:top-4')}>
            <LessonPanel
              step={step}
              pose={lessonPose}
              onPose={setLessonPose}
              leg={leg}
              onLeg={setLeg}
              geometry={geometry}
              animating={animating}
              onAnimate={() => {
                setAnimU(0);
                setAnimStart(performance.now());
              }}
              answers={lesson.answers}
              onAnswer={(key, i) => setLesson((l) => ({ ...l, answers: { ...l.answers, [key]: i } }))}
            />
          </div>
          <nav aria-label="Etapas da aula" className={cn(glass, 'absolute inset-x-3 bottom-3 flex flex-wrap items-center gap-2 p-2 sm:inset-x-4 sm:bottom-4')}>
            <Button size="sm" variant="secondary" onClick={() => goStep(lesson.step - 1)} disabled={lesson.step === 0} aria-keyshortcuts="ArrowLeft">
              <ChevronLeft aria-hidden />
              Anterior
            </Button>
            <ol className="flex flex-1 flex-wrap justify-center gap-1.5">
              {STEPS.map((s, i) => {
                const done = s.quiz.every((q, k) => lesson.answers[`${s.id}:${k}`] === q.correct);
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => goStep(i)}
                      aria-current={i === lesson.step ? 'step' : undefined}
                      aria-label={`${s.title}${done ? ' (concluída)' : ''}`}
                      className={cn(
                        'grid size-8 place-items-center rounded-full border text-sm font-semibold transition',
                        i === lesson.step ? 'border-primary bg-primary text-on-primary' : done ? 'border-brand bg-success-soft text-brand-text' : 'border-border bg-surface hover:border-brand',
                      )}
                    >
                      {i + 1}
                    </button>
                  </li>
                );
              })}
            </ol>
            <Button size="sm" variant="ghost" onClick={() => setLessonPose(zeroPose(geometry.home_z))}>
              <Home aria-hidden />
              Home
            </Button>
            <Button size="sm" variant="primary" onClick={() => goStep(lesson.step + 1)} disabled={lesson.step === STEPS.length - 1} aria-keyshortcuts="ArrowRight">
              Próxima
              <ChevronRight aria-hidden />
            </Button>
          </nav>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
