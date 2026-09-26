import { CheckCircle2, ChevronLeft, ChevronRight, Circle, GraduationCap } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
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

function Toc({ current, progress }: { current: StepRef; progress: Progress }) {
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

  // ←/→ trocam de etapa (fora de campos, sliders e do braço 2R)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.defaultPrevented || t.closest('input, select, textarea, [role="slider"], [role="application"], [contenteditable="true"]')) return;
      if (e.key === 'ArrowRight') go(index + 1);
      else if (e.key === 'ArrowLeft') go(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, index]);

  const prev = index > 0 ? FLAT[index - 1] : null;
  const next = index < FLAT.length - 1 ? FLAT[index + 1] : null;
  const title = (r: StepRef) => CURRICULUM[r.module].lessons[r.lesson].steps[r.step].title;

  return (
    <div className="grid gap-5 lg:grid-cols-[15rem_minmax(0,1fr)] 2xl:grid-cols-[16rem_minmax(0,1fr)_minmax(0,1.15fr)]">
      <aside className="lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto">
        <h1 className="mb-3 flex items-center gap-2 text-xl font-semibold">
          <GraduationCap aria-hidden className="size-5 text-brand" />
          Aula de cinemática
        </h1>
        <details className="rounded-xl border border-border bg-surface p-3 lg:border-0 lg:bg-transparent lg:p-0" open>
          <summary className="cursor-pointer text-sm font-semibold lg:hidden">Sumário</summary>
          <div className="mt-3 lg:mt-0">
            <Toc current={current} progress={progress} />
          </div>
        </details>
      </aside>

      {/* 3D: fixo ao lado em telas largas, em cima do texto nas outras */}
      <div className="order-none 2xl:order-last">
        <div className="overflow-hidden rounded-xl border border-border 2xl:sticky 2xl:top-20">
          <div className="h-80 sm:h-[26rem] 2xl:h-[calc(100dvh-8.5rem)]" aria-hidden>
            <Suspense fallback={<div className="grid h-full place-items-center text-sm text-muted">Carregando o modelo…</div>}>
              <LessonScene spec={step.scene} geometry={geometry} background={background} />
            </Suspense>
          </div>
          <p className="border-t border-border bg-surface px-3 py-2 text-xs text-muted">
            <span className="font-semibold text-fg">No modelo:</span> {step.sceneSummary} Arraste para girar a câmera.
          </p>
        </div>
      </div>

      <article aria-labelledby="etapa-titulo" className="min-w-0 space-y-4 lg:col-start-2 2xl:col-start-2 2xl:row-start-1">
        <header>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-text">
            {current.module + 1}.{current.lesson + 1} {lesson.title} · etapa {current.step + 1} de {lesson.steps.length}
          </p>
          <h2 id="etapa-titulo" className="mt-1 text-2xl font-semibold tracking-tight">
            {current.step + 1}. {step.title}
          </h2>
        </header>
        <div key={key} className="space-y-3">
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
        <nav aria-label="Etapas" className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
          <Button variant="secondary" onClick={() => go(index - 1)} disabled={!prev} aria-keyshortcuts="ArrowLeft">
            <ChevronLeft aria-hidden />
            <span className="max-w-[14rem] truncate">{prev ? title(prev) : 'Anterior'}</span>
          </Button>
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
          <Button variant="primary" onClick={() => go(index + 1)} disabled={!next} aria-keyshortcuts="ArrowRight">
            <span className="max-w-[14rem] truncate">{next ? title(next) : 'Fim'}</span>
            <ChevronRight aria-hidden />
          </Button>
        </nav>
      </article>
    </div>
  );
}
