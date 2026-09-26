import { CheckCircle2, Home, Shuffle } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Tex, texNum } from '@/components/Tex';
import { Button } from '@/components/ui/button';
import { SliderField } from '@/components/ui/field';
import { PoseEditor, type PoseLimits } from '@/features/control/PoseEditor';
import { useGeometry } from '@/features/platform3d/geometry';
import { forwardKinematics } from '@/lib/forwardKinematics';
import { solvePose, zeroPose } from '@/lib/kinematics';
import { fmt } from '@/lib/pistons';
import type { Pose, Vec3 } from '@/lib/types';
import { legVectors } from '../lessonMath';
import { useLessonScene } from '../lessonStore';
import { PARTS } from '../Overlays';

export const WIDE: PoseLimits = { x: [-80, 80], y: [-80, 80], z: [400, 720], roll: [-25, 25], pitch: [-25, 25], yaw: [-25, 25] };
export const vec = (v: readonly number[], d = 1) => `(${v.map((c) => fmt(c, d)).join('; ')})`;
export const texVec = (v: readonly number[], d = 1) => `\\begin{bmatrix} ${v.map((c) => texNum(c, d)).join(' \\\\ ')} \\end{bmatrix}`;
export const texMat = (rows: readonly (readonly number[])[], d = 3) => `\\begin{bmatrix} ${rows.map((r) => r.map((c) => texNum(c, d)).join(' & ')).join(' \\\\ ')} \\end{bmatrix}`;

export function HomeButton() {
  const geometry = useGeometry();
  return (
    <Button size="sm" variant="ghost" onClick={() => useLessonScene.getState().set({ pose: zeroPose(geometry.home_z) })}>
      <Home aria-hidden />
      Voltar ao home
    </Button>
  );
}

/** Controles da pose da aula (os campos mudam por etapa). */
export function PoseWidget({ fields, wide }: { fields?: (keyof Pose)[]; wide?: boolean }) {
  const pose = useLessonScene((s) => s.pose);
  const set = useLessonScene((s) => s.set);
  return (
    <div className="space-y-2">
      <PoseEditor pose={pose} onChange={(p) => set({ pose: p })} fields={fields} limits={wide ? WIDE : undefined} />
      <HomeButton />
    </div>
  );
}

/** Aula 1.1: destacar cada peça no modelo. */
export function PartsWidget() {
  const focus = useLessonScene((s) => s.focus);
  const set = useLessonScene((s) => s.set);
  return (
    <ul className="grid gap-2 sm:grid-cols-2" aria-label="Peças da plataforma">
      {PARTS.map((p) => (
        <li key={p.id}>
          <button
            type="button"
            aria-pressed={focus === p.id}
            onMouseEnter={() => set({ focus: p.id })}
            onMouseLeave={() => set({ focus: null })}
            onFocus={() => set({ focus: p.id })}
            onBlur={() => set({ focus: null })}
            onClick={() => set({ focus: focus === p.id ? null : p.id })}
            className="w-full rounded-lg border border-border px-3 py-2 text-left text-sm font-medium transition-colors hover:border-brand aria-pressed:border-brand aria-pressed:bg-success-soft"
          >
            {p.label}
          </button>
        </li>
      ))}
    </ul>
  );
}

const CHALLENGE_TOL = { mm: 3, deg: 1.5 };

function randomTarget(home: number, geometry: ReturnType<typeof useGeometry>): Pose {
  for (;;) {
    const r = (a: number) => Math.round((Math.random() * 2 - 1) * a);
    const p: Pose = { x: r(25), y: r(25), z: home + r(40), roll: r(8), pitch: r(8), yaw: r(12) };
    if (solvePose(p, geometry).valid) return p;
  }
}

/** Aula 1.2: encaixar o tampo no fantasma. */
export function DofChallenge() {
  const geometry = useGeometry();
  const pose = useLessonScene((s) => s.pose);
  const set = useLessonScene((s) => s.set);
  const [target, setTarget] = useState<Pose>(() => randomTarget(geometry.home_z, geometry));
  useEffect(() => {
    set({ ghosts: [{ pose: target, color: '#3fb654', label: 'alvo' }] });
    return () => set({ ghosts: [] });
  }, [target, set]);
  const off = {
    x: pose.x - target.x,
    y: pose.y - target.y,
    z: pose.z - target.z,
    roll: pose.roll - target.roll,
    pitch: pose.pitch - target.pitch,
    yaw: pose.yaw - target.yaw,
  };
  const done = (['x', 'y', 'z'] as const).every((k) => Math.abs(off[k]) <= CHALLENGE_TOL.mm) && (['roll', 'pitch', 'yaw'] as const).every((k) => Math.abs(off[k]) <= CHALLENGE_TOL.deg);
  return (
    <div className="space-y-3">
      <PoseEditor pose={pose} onChange={(p) => set({ pose: p })} />
      <p role="status" className="flex items-center gap-2 text-sm">
        {done ? (
          <span className="inline-flex items-center gap-1.5 font-semibold text-brand-text">
            <CheckCircle2 aria-hidden className="size-4" />
            Encaixou! Os seis números da pose batem com o alvo.
          </span>
        ) : (
          <span className="text-muted tabular-nums">
            Falta: X {fmt(-off.x, 0)} · Y {fmt(-off.y, 0)} · Z {fmt(-off.z, 0)} mm · roll {fmt(-off.roll, 1)} · pitch {fmt(-off.pitch, 1)} · yaw {fmt(-off.yaw, 1)}°
          </span>
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => setTarget(randomTarget(geometry.home_z, geometry))}>
          <Shuffle aria-hidden />
          Novo desafio
        </Button>
        <HomeButton />
      </div>
    </div>
  );
}

/** Aula 1.3: mexer só no pistão 1 e ver o tampo inteiro se mover (prévia da direta). */
export function ActuatorWidget() {
  const geometry = useGeometry();
  const pose = useLessonScene((s) => s.pose);
  const set = useLessonScene((s) => s.set);
  const start = useRef<number[] | null>(null);
  const range = geometry.stroke_max - geometry.stroke_min;
  const legs = legVectors(pose, geometry);
  const [delta, setDelta] = useState(() => legs[0].delta);
  const [failed, setFailed] = useState(false);

  function change(d: number) {
    setDelta(d);
    const cur = useLessonScene.getState().pose;
    start.current ??= legVectors(cur, geometry).map((l) => l.length);
    const L = start.current.map((l, i) => (i === 0 ? geometry.stroke_min + d : l));
    const r = forwardKinematics(L, geometry, cur);
    setFailed(!r.converged);
    if (r.converged) set({ pose: r.pose });
  }

  return (
    <div className="space-y-3">
      <SliderField label="Curso do pistão 1 (Δ₁)" value={delta} onValueChange={change} min={0} max={range} step={1} unit="mm" unitSpoken="milímetros" digits={0} />
      <Tex block label={`L1 igual a L mínimo mais Delta 1, igual a ${fmt(geometry.stroke_min + delta, 0)} milímetros`}>
        {`L_1 = L_{\\min} + \\Delta_1 = ${texNum(geometry.stroke_min, 0)} + ${texNum(delta, 0)} = ${texNum(geometry.stroke_min + delta, 0)}\\ \\text{mm}`}
      </Tex>
      <p className="text-sm text-muted tabular-nums">
        Pose resultante: X {fmt(pose.x, 1)} · Y {fmt(pose.y, 1)} · Z {fmt(pose.z, 1)} mm · roll {fmt(pose.roll, 1)}° · pitch {fmt(pose.pitch, 1)}° · yaw {fmt(pose.yaw, 1)}°
      </p>
      {failed && <p className="text-sm text-warning">Com os outros cinco parados, esse comprimento não fecha a geometria: a bancada não chega lá.</p>}
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          start.current = null;
          set({ pose: zeroPose(geometry.home_z) });
          setDelta(legVectors(zeroPose(geometry.home_z), geometry)[0].delta);
        }}
      >
        <Home aria-hidden />
        Voltar ao home
      </Button>
    </div>
  );
}

/** Aulas 1.4: tabela dos pontos aᵢ (base) ou bᵢ e Pᵢ (tampo). */
export function PointsTable({ kind }: { kind: 'base' | 'plate' }) {
  const geometry = useGeometry();
  const pose = useLessonScene((s) => s.pose);
  const legs = useMemo(() => legVectors(pose, geometry), [pose, geometry]);
  const row = (v: Vec3) => v.map((c) => fmt(c, 1)).join('; ');
  return (
    <div className="overflow-x-auto rounded-lg border border-border" tabIndex={0} role="region" aria-label={kind === 'base' ? 'Pontos da base' : 'Pontos do tampo'}>
      <table className="w-full text-sm tabular-nums">
        <caption className="sr-only">{kind === 'base' ? 'Pontos aᵢ da base, em {B} (mm)' : 'Pontos bᵢ em {P} e Pᵢ em {B} (mm)'}</caption>
        <thead className="bg-surface-2 text-left">
          <tr>
            <th scope="col" className="px-3 py-1.5">
              Perna
            </th>
            {kind === 'base' ? (
              <th scope="col" className="px-3 py-1.5">
                aᵢ em {'{B}'} (x; y; z)
              </th>
            ) : (
              <>
                <th scope="col" className="px-3 py-1.5">
                  bᵢ em {'{P}'} (fixo)
                </th>
                <th scope="col" className="px-3 py-1.5">
                  Pᵢ em {'{B}'} (muda)
                </th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {legs.map((l, i) => (
            <tr key={i} className="border-t border-border">
              <th scope="row" className="px-3 py-1.5 text-left font-medium">
                {i + 1}
              </th>
              {kind === 'base' ? (
                <td className="px-3 py-1.5">{row(l.a)}</td>
              ) : (
                <>
                  <td className="px-3 py-1.5">{row(l.b)}</td>
                  <td className="px-3 py-1.5">{row(l.P)}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
