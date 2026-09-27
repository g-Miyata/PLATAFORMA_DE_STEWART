import { Play, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Tex, texNum } from '@/components/Tex';
import { Button } from '@/components/ui/button';
import { useGeometry } from '@/features/platform3d/geometry';
import { rotationZYX } from '@/lib/kinematics';
import { cn } from '@/lib/cn';
import { fmt, PISTON_COLORS } from '@/lib/pistons';
import type { Pose } from '@/lib/types';
import { uiLimits } from '@/lib/limits';
import { legVectors, rotX, rotY, rotZ, swappedOrderPose, zyxAnimation } from '../lessonMath';
import { useLessonScene } from '../lessonStore';
import { RB_COLOR } from '../Overlays';
import { texMat, texVec } from './basic';

const rows3 = (m: readonly number[]) => [m.slice(0, 3), m.slice(3, 6), m.slice(6, 9)];

function prefersReducedMotion() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Aula 2.2: Rx, Ry, Rz e R com os números dos ângulos atuais. */
export function RotationMatrices() {
  const pose = useLessonScene((s) => s.pose);
  const R = rotationZYX(pose.roll, pose.pitch, pose.yaw);
  return (
    <div className="space-y-1 text-sm">
      <Tex block label={`R x de phi, com phi igual a ${fmt(pose.roll, 1)} graus`}>{`R_x(\\phi = ${texNum(pose.roll)}^\\circ) = \\begin{bmatrix} 1 & 0 & 0 \\\\ 0 & \\cos\\phi & -\\sin\\phi \\\\ 0 & \\sin\\phi & \\cos\\phi \\end{bmatrix} = ${texMat(rows3(rotX(pose.roll)))}`}</Tex>
      <Tex block label={`R y de theta, com theta igual a ${fmt(pose.pitch, 1)} graus`}>{`R_y(\\theta = ${texNum(pose.pitch)}^\\circ) = \\begin{bmatrix} \\cos\\theta & 0 & \\sin\\theta \\\\ 0 & 1 & 0 \\\\ -\\sin\\theta & 0 & \\cos\\theta \\end{bmatrix} = ${texMat(rows3(rotY(pose.pitch)))}`}</Tex>
      <Tex block label={`R z de psi, com psi igual a ${fmt(pose.yaw, 1)} graus`}>{`R_z(\\psi = ${texNum(pose.yaw)}^\\circ) = \\begin{bmatrix} \\cos\\psi & -\\sin\\psi & 0 \\\\ \\sin\\psi & \\cos\\psi & 0 \\\\ 0 & 0 & 1 \\end{bmatrix} = ${texMat(rows3(rotZ(pose.yaw)))}`}</Tex>
      <Tex block label="R total igual a Rz Ry Rx">{`R = R_z R_y R_x = ${texMat(rows3(R))}`}</Tex>
    </div>
  );
}

/** Aula 2.2: fantasma da ordem trocada e animação da composição ZYX. */
export function ZyxOrder() {
  const pose = useLessonScene((s) => s.pose);
  const set = useLessonScene((s) => s.set);
  const [animating, setAnimating] = useState(false);
  const raf = useRef(0);
  const final = useRef<Pose>(pose);

  useEffect(() => {
    if (animating) return;
    set({ ghosts: [{ pose: swappedOrderPose(pose), color: RB_COLOR, label: 'ordem trocada (Rx·Ry·Rz)' }] });
  }, [pose, animating, set]);
  useEffect(
    () => () => {
      cancelAnimationFrame(raf.current);
      set({ ghosts: [] });
    },
    [set],
  );

  function animate() {
    final.current = useLessonScene.getState().pose;
    if (prefersReducedMotion()) return;
    setAnimating(true);
    set({ ghosts: [] });
    const t0 = performance.now();
    const tick = () => {
      const u = Math.min(1, (performance.now() - t0) / 4500);
      set({ pose: zyxAnimation(final.current, u) });
      if (u < 1) raf.current = requestAnimationFrame(tick);
      else setAnimating(false);
    };
    raf.current = requestAnimationFrame(tick);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="sm" variant="secondary" onClick={animate} disabled={animating}>
        <Play aria-hidden />
        Animar ZYX
      </Button>
      <p className="text-sm text-muted" aria-live="polite">
        {animating ? 'Aplicando yaw, depois pitch, depois roll…' : 'Fantasma roxo: os mesmos ângulos na ordem Rx·Ry·Rz.'}
      </p>
    </div>
  );
}

/** Aula 2.2: a transformação homogênea T com os números de agora. */
export function Homogeneous() {
  const geometry = useGeometry();
  const pose = useLessonScene((s) => s.pose);
  const R = rotationZYX(pose.roll, pose.pitch, pose.yaw);
  const T = [
    [R[0], R[1], R[2], pose.x],
    [R[3], R[4], R[5], pose.y],
    [R[6], R[7], R[8], pose.z],
    [0, 0, 0, 1],
  ];
  const l = legVectors(pose, geometry)[0];
  return (
    <div className="space-y-1">
      <Tex block label="Matriz T homogênea 4 por 4 da pose atual">{`T = ${texMat(T, 3)}`}</Tex>
      <Tex block label={`Exemplo: P1 igual a T vezes b1, igual a ${l.P.map((c) => fmt(c, 1)).join(', ')} milímetros`}>
        {`\\begin{bmatrix} \\mathbf{P}_1 \\\\ 1 \\end{bmatrix} = T ${texVec([...l.b, 1])} = ${texVec([...l.P, 1])}`}
      </Tex>
    </div>
  );
}

function LegPicker() {
  const leg = useLessonScene((s) => s.leg);
  const set = useLessonScene((s) => s.set);
  return (
    <div role="group" aria-label="Perna" className="flex flex-wrap gap-1.5">
      {PISTON_COLORS.map((c, i) => (
        <button
          key={i}
          type="button"
          aria-pressed={leg === i}
          onClick={() => set({ leg: i })}
          className={cn('h-8 rounded-lg border px-3 text-sm font-semibold transition', leg === i ? 'text-black' : 'border-border hover:border-brand')}
          style={leg === i ? { background: c, borderColor: c } : undefined}
        >
          P{i + 1}
        </button>
      ))}
    </div>
  );
}

/** Aula 2.3: os cinco passos da inversa com os números da perna escolhida. */
export function IkSteps() {
  const geometry = useGeometry();
  const pose = useLessonScene((s) => s.pose);
  const leg = useLessonScene((s) => s.leg);
  const R = rotationZYX(pose.roll, pose.pitch, pose.yaw);
  const l = legVectors(pose, geometry)[leg];
  const i = leg + 1;
  const ok = l.inStroke;
  return (
    <div className="space-y-3">
      <LegPicker />
      <ol className="space-y-1 text-sm">
        <li>
          <span className="font-semibold">1.</span>
          <Tex block label="R igual a Rz Ry Rx">{`R = R_z(${texNum(pose.yaw)}^\\circ)\\,R_y(${texNum(pose.pitch)}^\\circ)\\,R_x(${texNum(pose.roll)}^\\circ) = ${texMat(rows3(R))}`}</Tex>
        </li>
        <li>
          <span className="font-semibold">2.</span>
          <Tex block label={`R vezes b${i}`}>{`R\\,\\mathbf{b}_${i} = R ${texVec(l.b)} = ${texVec(l.Rb)}`}</Tex>
        </li>
        <li>
          <span className="font-semibold">3.</span>
          <Tex block label={`P${i} igual a p mais R b${i}`}>{`\\mathbf{P}_${i} = \\mathbf{p} + R\\,\\mathbf{b}_${i} = ${texVec([pose.x, pose.y, pose.z])} + ${texVec(l.Rb)} = ${texVec(l.P)}`}</Tex>
        </li>
        <li>
          <span className="font-semibold">4.</span>
          <Tex block label={`s${i} igual a P${i} menos a${i}`}>{`\\mathbf{s}_${i} = \\mathbf{P}_${i} - \\mathbf{a}_${i} = ${texVec(l.P)} - ${texVec(l.a)} = ${texVec(l.s)}`}</Tex>
        </li>
        <li>
          <span className="font-semibold">5.</span>
          <Tex block label={`L${i} igual a ${fmt(l.length, 1)} milímetros e Delta ${i} igual a ${fmt(l.delta, 1)} milímetros`}>
            {`L_${i} = \\lVert \\mathbf{s}_${i} \\rVert = ${texNum(l.length)}\\ \\text{mm},\\qquad \\Delta_${i} = L_${i} - L_{\\min} = ${texNum(l.delta)}\\ \\text{mm}`}
          </Tex>
          <p className={cn('mt-1 font-medium', ok ? 'text-brand-text' : 'text-danger')}>
            {ok
              ? `Dentro do curso de operação (${fmt(uiLimits(geometry).course[0], 0)} a ${fmt(uiLimits(geometry).course[1], 0)} mm, com a margem de segurança).`
              : 'Fora do curso de operação: essa pose seria recusada.'}
          </p>
        </li>
      </ol>
    </div>
  );
}

/** Aulas 2.1 e 2.3: calcula perna por perna, acendendo cada uma no modelo. */
export function IkLegs() {
  const geometry = useGeometry();
  const pose = useLessonScene((s) => s.pose);
  const lit = useLessonScene((s) => s.litLegs);
  const set = useLessonScene((s) => s.set);
  const legs = useMemo(() => legVectors(pose, geometry), [pose, geometry]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
      set({ litLegs: null });
    },
    [set],
  );

  function run() {
    if (timer.current) clearInterval(timer.current);
    if (prefersReducedMotion()) {
      set({ litLegs: [0, 1, 2, 3, 4, 5] });
      return;
    }
    let k = 0;
    set({ litLegs: [] });
    timer.current = setInterval(() => {
      k++;
      set({ litLegs: Array.from({ length: k }, (_, i) => i) });
      if (k >= 6 && timer.current) clearInterval(timer.current);
    }, 700);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={run}>
          <Play aria-hidden />
          Calcular perna por perna
        </Button>
        {lit && (
          <Button size="sm" variant="ghost" onClick={() => set({ litLegs: null })}>
            <RotateCcw aria-hidden />
            Mostrar todas
          </Button>
        )}
      </div>
      <ol className="grid grid-cols-2 gap-1.5 text-sm tabular-nums sm:grid-cols-3" aria-live="polite">
        {legs.map((l, i) => {
          const shown = !lit || lit.includes(i);
          return (
            <li key={i} className={cn('rounded-lg border px-2 py-1 transition-opacity', shown ? 'opacity-100' : 'opacity-40')} style={{ borderColor: PISTON_COLORS[i] }}>
              <span className="font-semibold">L{i + 1}</span> = {shown ? `${fmt(l.length, 1)} mm` : '…'}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export { LegPicker };
