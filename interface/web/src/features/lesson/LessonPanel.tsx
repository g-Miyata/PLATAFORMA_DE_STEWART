import { CheckCircle2, Clapperboard, XCircle } from 'lucide-react';
import { useId, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { PoseEditor, type PoseLimits } from '@/features/control/PoseEditor';
import { cn } from '@/lib/cn';
import { fmt, PISTON_COLORS } from '@/lib/pistons';
import type { PlatformGeometry, Pose, Vec3 } from '@/lib/types';
import { legVectors } from './lessonMath';
import type { LessonStep, Question } from './steps';

const WIDE: PoseLimits = { x: [-80, 80], y: [-80, 80], z: [400, 720], roll: [-25, 25], pitch: [-25, 25], yaw: [-25, 25] };

const vec = (v: Vec3) => `(${v.map((c) => fmt(c, 1)).join('; ')})`;

function Quiz({ q, answer, onAnswer }: { q: Question; answer: number | undefined; onAnswer: (i: number) => void }) {
  const id = useId();
  const [choice, setChoice] = useState<number | undefined>(answer);
  const answered = answer !== undefined;
  const right = answer === q.correct;
  return (
    <fieldset className="rounded-lg border border-border p-3">
      <legend className="px-1 text-sm font-semibold">{q.q}</legend>
      <div className="mt-1 space-y-1.5">
        {q.options.map((o, i) => (
          <label key={i} className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="radio" name={id} value={i} checked={choice === i} onChange={() => setChoice(i)} className="size-4 accent-[var(--c-brand)]" />
            {o}
          </label>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Button size="sm" variant="secondary" disabled={choice === undefined} onClick={() => choice !== undefined && onAnswer(choice)}>
          Conferir
        </Button>
        <p role="status" className={cn('text-sm', !answered && 'sr-only')}>
          {answered && (
            <span className={cn('inline-flex items-start gap-1.5 font-medium', right ? 'text-brand-text' : 'text-danger')}>
              {right ? <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0" /> : <XCircle aria-hidden className="mt-0.5 size-4 shrink-0" />}
              <span>
                {right ? 'Isso! ' : 'Ainda não. '}
                <span className="font-normal text-fg">{q.explain}</span>
              </span>
            </span>
          )}
        </p>
      </div>
    </fieldset>
  );
}

interface LessonPanelProps {
  step: LessonStep;
  pose: Pose;
  onPose: (p: Pose) => void;
  leg: number;
  onLeg: (i: number) => void;
  geometry: PlatformGeometry;
  animating: boolean;
  onAnimate: () => void;
  answers: Record<string, number>;
  onAnswer: (key: string, i: number) => void;
}

/** Texto, controles e perguntas de uma etapa da aula. */
export function LessonPanel({ step, pose, onPose, leg, onLeg, geometry, animating, onAnimate, answers, onAnswer }: LessonPanelProps) {
  const legs = legVectors(pose, geometry);
  const one = legs[leg];
  const outOfStroke = legs.filter((l) => !l.inStroke).length;
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{step.title}</h2>
      {step.paragraphs.map((p, i) => (
        <p key={i} className="text-sm leading-relaxed">
          {p}
        </p>
      ))}
      <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
        <span className="font-semibold text-fg">No modelo: </span>
        {step.sceneSummary}
      </p>

      {step.overlays.legs === 'one' && (
        <div className="space-y-2">
          <div role="group" aria-label="Perna mostrada" className="flex flex-wrap gap-1.5">
            {PISTON_COLORS.map((c, i) => (
              <Button key={i} size="sm" variant={leg === i ? 'primary' : 'secondary'} aria-pressed={leg === i} onClick={() => onLeg(i)}>
                <span aria-hidden className="size-2 rounded-full" style={{ background: c }} />P{i + 1}
              </Button>
            ))}
          </div>
          {one && step.overlays.decomposition && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg border border-border p-3 text-xs tabular-nums">
              <dt className="font-semibold">T</dt>
              <dd>{vec([pose.x, pose.y, pose.z])} mm</dd>
              <dt className="font-semibold">R·p{leg + 1}</dt>
              <dd>{vec(one.Rp)} mm</dd>
              <dt className="font-semibold">b{leg + 1}</dt>
              <dd>{vec(one.b)} mm</dd>
              <dt className="font-semibold">L{leg + 1}</dt>
              <dd>
                {vec(one.L)} mm → <span className={cn('font-semibold', !one.inStroke && 'text-danger')}>‖L{leg + 1}‖ = {fmt(one.length, 1)} mm</span>
              </dd>
            </dl>
          )}
        </div>
      )}

      {step.overlays.legs === 'all' && (
        <p role="status" className={cn('text-sm font-medium', outOfStroke ? 'text-danger' : 'text-brand-text')}>
          {outOfStroke
            ? `${outOfStroke} perna(s) fora do curso (${fmt(geometry.stroke_min, 0)}–${fmt(geometry.stroke_max, 0)} mm): pose impossível.`
            : `Todas as pernas dentro do curso (${fmt(geometry.stroke_min, 0)}–${fmt(geometry.stroke_max, 0)} mm).`}
        </p>
      )}

      <PoseEditor pose={pose} onChange={onPose} fields={step.axes} limits={step.wide ? WIDE : undefined} disabled={animating} />

      {step.animateZyx && (
        <Button variant="secondary" onClick={onAnimate} disabled={animating}>
          <Clapperboard aria-hidden />
          {animating ? 'Animando…' : 'Animar ZYX'}
        </Button>
      )}

      {step.id === 'ik-fk' && (
        <p className="text-sm">
          Experimente a direta na{' '}
          <Link to="/bancada-3d" className="font-medium text-brand-text underline">
            Bancada 3D
          </Link>
          : mude o comprimento de um pistão e veja o tampo se acomodar.
        </p>
      )}

      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">Perguntas rápidas</h3>
        {step.quiz.map((q, i) => {
          const key = `${step.id}:${i}`;
          return <Quiz key={key} q={q} answer={answers[key]} onAnswer={(a) => onAnswer(key, a)} />;
        })}
      </div>
    </div>
  );
}
