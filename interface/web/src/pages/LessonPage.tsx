import { CheckCircle2, ChevronLeft, ChevronRight, Circle, GraduationCap, ListTree, Maximize, Minimize, Presentation } from 'lucide-react';
import { Popover } from 'radix-ui';
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { sceneBackground } from '@/components/Stage';
import { Button } from '@/components/ui/button';
import { CURRICULUM, FLAT, findStep, flatIndex, stepKey, stepPath, type StepRef } from '@/features/lesson/curriculum';
import { UR_HOME, useLessonScene } from '@/features/lesson/lessonStore';
import { BlockView, Quiz } from '@/features/lesson/RichText';
import type { LessonStep } from '@/features/lesson/types';
import { LessonWidget } from '@/features/lesson/widgets';
import { useGeometry } from '@/features/platform3d/geometry';
import { cn } from '@/lib/cn';
import { zeroPose } from '@/lib/kinematics';
import { useUi } from '@/stores/ui';

// three + modelos carregam separados: o texto aparece na hora
const LessonScene = lazy(() => import('@/features/lesson/LessonScene').then((m) => ({ default: m.LessonScene })));

const PROGRESS_KEY = 'stewart-lesson-v2';

interface Progress {
  visited: string[];
  answers: Record<string, number>;
}

function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (raw) return { visited: [], answers: {}, ...(JSON.parse(raw) as Partial<Progress>) };
  } catch {
    /* sem storage */
  }
  return { visited: [], answers: {} };
}

const stepDone = (key: string, step: LessonStep, p: Progress) => p.visited.includes(key) && (step.quiz ?? []).every((q, i) => p.answers[`${key}:${i}`] === q.correct);

function Toc({ current, progress, onPick }: { current: StepRef; progress: Progress; onPick?: () => void }) {
  return (
    <nav aria-label="Sumário da aula" className="space-y-4 text-sm">
      {CURRICULUM.map((m, mi) => (
        <div key={m.id}>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
            Módulo {mi + 1} · {m.title}
          </p>
          <ol className="space-y-0.5">
            {m.lessons.map((l, li) => {
              const active = current.module === mi && current.lesson === li;
              const done = l.steps.every((s, si) => stepDone(stepKey({ module: mi, lesson: li, step: si }), s, progress));
              return (
                <li key={l.id}>
                  <Link
                    to={stepPath({ module: mi, lesson: li, step: 0 })}
                    onClick={onPick}
                    aria-current={active ? 'page' : undefined}
                    className={cn('flex items-start gap-2 rounded-lg px-2 py-1.5 transition-colors', active ? 'bg-primary text-on-primary' : 'hover:bg-surface-2')}
                  >
                    {done ? <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0" /> : <Circle aria-hidden className="mt-0.5 size-4 shrink-0 opacity-50" />}
                    <span>
                      {mi + 1}.{li + 1} {l.title}
                      {done && <span className="sr-only"> (concluída)</span>}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </nav>
  );
}

/** Progresso do curso inteiro: um trecho por aula, preenchido pelas etapas concluídas. */
function CourseProgress({ current, progress }: { current: StepRef; progress: Progress }) {
  return (
    <ol className="flex h-2 min-w-0 flex-1 gap-1" aria-label="Progresso do curso">
      {CURRICULUM.flatMap((m, mi) =>
        m.lessons.map((l, li) => {
          const done = l.steps.filter((s, si) => stepDone(stepKey({ module: mi, lesson: li, step: si }), s, progress)).length;
          const here = current.module === mi && current.lesson === li;
          return (
            <li key={l.id} className="h-full" style={{ flex: l.steps.length }}>
              <Link
                to={stepPath({ module: mi, lesson: li, step: 0 })}
                title={`${mi + 1}.${li + 1} ${l.title}`}
                aria-label={`${mi + 1}.${li + 1} ${l.title}: ${done} de ${l.steps.length} etapas concluídas`}
                aria-current={here ? 'page' : undefined}
                className={cn('relative block h-full overflow-hidden rounded-full bg-surface-3 outline-offset-2', here && 'ring-2 ring-brand ring-offset-1 ring-offset-surface')}
              >
                <span className="absolute inset-y-0 left-0 rounded-full bg-brand transition-[width]" style={{ width: `${(done / l.steps.length) * 100}%` }} />
              </Link>
            </li>
          );
        }),
      )}
    </ol>
  );
}

export default function LessonPage() {
  const params = useParams();
  const navigate = useNavigate();
  const geometry = useGeometry();
  const theme = useUi((s) => s.theme);
  const current = findStep(params.module, params.lesson, params.step);
  const key = stepKey(current);
  const lesson = CURRICULUM[current.module].lessons[current.lesson];
  const step = lesson.steps[current.step];
  const index = flatIndex(current);
  const [progress, setProgress] = useState(loadProgress);
  // Modo aula: tela cheia para projetar (sem o menu do app), texto e modelo maiores
  const stage = useRef<HTMLDivElement>(null);
  const [teach, setTeach] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const toggleTeach = useCallback(() => {
    setTeach((on) => {
      if (!on) void stage.current?.requestFullscreen?.().catch(() => undefined);
      else if (document.fullscreenElement) void document.exitFullscreen();
      return !on;
    });
  }, []);
  useEffect(() => {
    const on = () => {
      if (!document.fullscreenElement) setTeach(false);
    };
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);

  const background = useMemo(() => {
    void theme;
    return sceneBackground();
  }, [theme]);

  useEffect(() => {
    document.title = `${step.title} · Aula · Plataforma de Stewart · IFSP`;
  }, [step.title]);

  // cena de cada etapa começa limpa (antes dos efeitos dos widgets, que são passivos)
  useLayoutEffect(() => {
    const home = zeroPose(geometry.home_z);
    const d = step.scene.pose ?? {};
    useLessonScene.getState().set({
      pose: { x: d.x ?? 0, y: d.y ?? 0, z: home.z + (d.z ?? 0), roll: d.roll ?? 0, pitch: d.pitch ?? 0, yaw: d.yaw ?? 0 },
      leg: 0,
      ghosts: [],
      sphereLeg: null,
      measured: null,
      litLegs: null,
      focus: null,
      ur: step.scene.ur ? step.scene.ur.map((v) => (v * Math.PI) / 180) : UR_HOME,
      urGhosts: [],
      urTarget: null,
      urFrames: false,
    });
  }, [key, step.scene, geometry.home_z]);

  // marca como vista (ajuste de estado no render, sem efeito em cascata) e guarda o progresso
  if (!progress.visited.includes(key)) setProgress({ ...progress, visited: [...progress.visited, key] });
  useEffect(() => {
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
    } catch {
      /* sem storage */
    }
  }, [progress]);

  const go = useCallback((i: number) => {
    const target = FLAT[Math.max(0, Math.min(FLAT.length - 1, i))];
    navigate(stepPath(target));
  }, [navigate]);

  // ←/→ trocam de etapa e F liga o modo aula (fora de campos, sliders e do braço 2R)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || t.closest('input, select, textarea, [role="slider"], [role="application"], [contenteditable="true"]')) return;
      if (e.key === 'ArrowRight') go(index + 1);
      else if (e.key === 'ArrowLeft') go(index - 1);
      else if (e.key === 'f' || e.key === 'F') toggleTeach();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, index, toggleTeach]);

  const prev = index > 0 ? FLAT[index - 1] : null;
  const next = index < FLAT.length - 1 ? FLAT[index + 1] : null;
  const title = (r: StepRef) => CURRICULUM[r.module].lessons[r.lesson].steps[r.step].title;

  const stepDots = (
    <ol className="flex flex-wrap gap-1.5" aria-label={`Etapas de ${lesson.title}`}>
      {lesson.steps.map((s, si) => {
        const r = { ...current, step: si };
        const done = stepDone(stepKey(r), s, progress);
        return (
          <li key={s.id}>
            <Link
              to={stepPath(r)}
              aria-current={si === current.step ? 'step' : undefined}
              aria-label={`${si + 1}. ${s.title}${done ? ' (concluída)' : ''}`}
              title={s.title}
              className={cn(
                'grid size-8 place-items-center rounded-full border text-sm font-semibold transition',
                si === current.step ? 'border-primary bg-primary text-on-primary' : done ? 'border-brand bg-success-soft text-brand-text' : 'border-border bg-surface hover:border-brand',
              )}
            >
              {si + 1}
            </Link>
          </li>
        );
      })}
    </ol>
  );

  return (
    <div ref={stage} className={cn(teach ? 'fixed inset-0 z-50 flex flex-col overflow-hidden bg-bg' : 'space-y-4')}>
      {/* barra da aula: sumário, progresso do curso e navegação */}
      <div className={cn('z-20 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-bg/95 py-2.5 backdrop-blur', teach ? 'px-6' : 'sticky top-[57px] -mx-4 -mt-5 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8')}>
        <h1 className={cn('flex items-center gap-2 font-semibold', teach ? 'text-lg' : 'text-base')}>
          <GraduationCap aria-hidden className="size-5 text-brand" />
          Aula de cinemática
        </h1>
        <Popover.Root open={tocOpen} onOpenChange={setTocOpen}>
          <Popover.Trigger asChild>
            <Button size="sm" variant="secondary" aria-label="Sumário da aula">
              <ListTree aria-hidden />
              <span className="max-w-[16rem] truncate">
                {current.module + 1}.{current.lesson + 1} {lesson.title}
              </span>
            </Button>
          </Popover.Trigger>
          {/* sem portal: fica dentro da página, então também aparece no modo aula (tela cheia) */}
          <Popover.Content align="start" sideOffset={6} className="z-50 max-h-[70dvh] w-80 overflow-y-auto rounded-xl border border-border bg-surface p-3 shadow-2xl">
            <Toc current={current} progress={progress} onPick={() => setTocOpen(false)} />
          </Popover.Content>
        </Popover.Root>
        <div className="flex min-w-[10rem] flex-1 items-center gap-3">
          <CourseProgress current={current} progress={progress} />
          <span className="shrink-0 text-xs tabular-nums text-muted">
            {index + 1}/{FLAT.length}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="icon" variant="ghost" onClick={() => go(index - 1)} disabled={!prev} aria-label="Etapa anterior" title="Etapa anterior (←)">
            <ChevronLeft aria-hidden />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => go(index + 1)} disabled={!next} aria-label="Próxima etapa" title="Próxima etapa (→)">
            <ChevronRight aria-hidden />
          </Button>
          <Button size="sm" variant={teach ? 'primary' : 'outline'} onClick={toggleTeach} aria-pressed={teach} title="Modo aula (F): tela cheia para projetar">
            {teach ? <Minimize aria-hidden /> : <Presentation aria-hidden />}
            {teach ? 'Sair do modo aula' : 'Modo aula'}
          </Button>
        </div>
      </div>

      <div className={cn('grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]', teach && 'min-h-0 flex-1 px-6 py-4 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]')}>
        {/* 3D: fixo à direita (em cima do texto no celular) */}
        <div className={cn('md:order-last', teach && 'min-h-0')}>
          <div className={cn('overflow-hidden rounded-2xl border border-border bg-surface shadow-card', teach ? 'flex h-full flex-col' : 'md:sticky md:top-[7.5rem]')}>
            <div className={cn(teach ? 'min-h-0 flex-1' : 'h-80 sm:h-[26rem] md:h-[calc(100dvh-14.5rem)]')} aria-hidden>
              <Suspense fallback={<div className="grid h-full place-items-center text-sm text-muted">Carregando o modelo…</div>}>
                <LessonScene spec={step.scene} geometry={geometry} background={background} />
              </Suspense>
            </div>
            <p className={cn('border-t border-border px-4 py-2.5 text-muted', teach ? 'text-base' : 'text-xs')}>
              <span className="font-semibold text-fg">No modelo:</span> {step.sceneSummary} Arraste para girar a câmera.
            </p>
          </div>
        </div>

        <article aria-labelledby="etapa-titulo" className={cn('min-w-0 space-y-5', teach ? 'overflow-y-auto pr-3 text-lg [&_.text-sm]:text-base' : 'text-[15px]')}>
          <header className="space-y-2">
            <p className="inline-flex items-center gap-2 rounded-full bg-success-soft px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-text">
              Módulo {current.module + 1} · {current.module + 1}.{current.lesson + 1} {lesson.title}
            </p>
            <h2 id="etapa-titulo" className={cn('font-bold tracking-tight', teach ? 'text-4xl' : 'text-3xl')}>
              {current.step + 1}. {step.title}
            </h2>
            <p className="text-sm text-muted">
              Etapa {current.step + 1} de {lesson.steps.length}
            </p>
          </header>
          <div key={key} className="space-y-4 leading-relaxed">
            {step.body.map((b, i) => (
              <BlockView key={i} block={b} />
            ))}
            {step.widgets?.map((w) => <LessonWidget key={w} id={w} />)}
            {step.quiz && (
              <section aria-label="Perguntas" className="space-y-2">
                {step.quiz.map((q, i) => (
                  <Quiz key={i} q={q} answer={progress.answers[`${key}:${i}`]} onAnswer={(a) => setProgress((p) => ({ ...p, answers: { ...p.answers, [`${key}:${i}`]: a } }))} />
                ))}
              </section>
            )}
          </div>
          <nav aria-label="Etapas" className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <Button variant="secondary" onClick={() => go(index - 1)} disabled={!prev} aria-keyshortcuts="ArrowLeft">
              <ChevronLeft aria-hidden />
              <span className="max-w-[14rem] truncate">{prev ? title(prev) : 'Anterior'}</span>
            </Button>
            {stepDots}
            <Button variant="primary" onClick={() => go(index + 1)} disabled={!next} aria-keyshortcuts="ArrowRight">
              <span className="max-w-[14rem] truncate">{next ? title(next) : 'Fim'}</span>
              <ChevronRight aria-hidden />
            </Button>
          </nav>
          {!teach && (
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <Maximize aria-hidden className="size-3.5" />
              Para dar aula: <kbd className="rounded border border-border-strong bg-surface-2 px-1">F</kbd> liga o modo aula (tela cheia), e <kbd className="rounded border border-border-strong bg-surface-2 px-1">←</kbd>/<kbd className="rounded border border-border-strong bg-surface-2 px-1">→</kbd> passam as etapas.
            </p>
          )}
        </article>
      </div>
    </div>
  );
}
