import { ArrowRight, CheckCircle2, FlaskConical, Pause, Play, RotateCcw, StepForward, XCircle } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Tex, texNum } from '@/components/Tex';
import { Button } from '@/components/ui/button';
import { PoseEditor } from '@/features/control/PoseEditor';
import { useGeometry } from '@/features/platform3d/geometry';
import { cn } from '@/lib/cn';
import { forwardKinematics, type FkStep } from '@/lib/forwardKinematics';
import { zeroPose } from '@/lib/kinematics';
import { fmt, PISTON_COLORS } from '@/lib/pistons';
import type { Pose } from '@/lib/types';
import { legVectors } from '../lessonMath';
import { useLessonScene } from '../lessonStore';
import { LegPicker } from './math';
import { texVec } from './basic';

const ease = (x: number) => x * x * (3 - 2 * x);
const reduced = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const POSE_ROWS: [keyof Pose, string, string][] = [
  ['x', 'X', 'mm'],
  ['y', 'Y', 'mm'],
  ['z', 'Z', 'mm'],
  ['roll', 'Roll', '°'],
  ['pitch', 'Pitch', '°'],
  ['yaw', 'Yaw', '°'],
];

function PoseDelta({ from, to, caption }: { from: Pose; to: Pose; caption: string }) {
  return (
    <dl className="grid grid-cols-3 gap-1.5 text-sm tabular-nums sm:grid-cols-6" aria-label={caption}>
      {POSE_ROWS.map(([k, name, unit]) => {
        const d = to[k] - from[k];
        return (
          <div key={k} className={cn('rounded-lg border px-2 py-1', Math.abs(d) > (unit === '°' ? 0.3 : 0.5) ? 'border-brand bg-success-soft' : 'border-border')}>
            <dt className="text-xs font-medium text-muted">Δ{name}</dt>
            <dd className="font-semibold">
              {d >= 0 ? '+' : ''}
              {fmt(d, 1)} {unit}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

const CASES = [
  {
    title: 'Caso 1: os seis juntos',
    question: 'O que acontece se aumentarmos igualmente, em 20 mm, os seis atuadores?',
    legs: [0, 1, 2, 3, 4, 5],
    options: ['O tampo sobe, praticamente sem girar', 'O tampo gira em torno de Z', 'Nada: os atuadores travam um no outro'],
    correct: 0,
    explain: 'Com as seis pernas iguais, a geometria continua simétrica: o tampo só sobe (um pouco menos de 20 mm, porque as pernas são inclinadas).',
  },
  {
    title: 'Caso 2: só os pistões 1 e 2',
    question: 'E se só os pistões 1 e 2 aumentarem 20 mm?',
    legs: [0, 1],
    options: ['Só sobe, igual ao caso 1', 'Sobe e inclina ao mesmo tempo', 'Só anda para o lado'],
    correct: 1,
    explain: 'Um lado sobe mais que o outro: aparecem translação e rotação juntas. Cada comprimento mexe em várias coordenadas da pose ao mesmo tempo.',
  },
];
const EXP_DELTA = 20;

/** Aula 2.4: palpite → Testar → a direta mostra o que acontece. */
export function FkExperiment() {
  const geometry = useGeometry();
  const set = useLessonScene((s) => s.set);
  const home = useMemo(() => zeroPose(geometry.home_z), [geometry.home_z]);
  const L0 = useMemo(() => legVectors(home, geometry).map((l) => l.length), [home, geometry]);
  const [caseIdx, setCaseIdx] = useState(0);
  const [guess, setGuess] = useState<number | null>(null);
  const [phase, setPhase] = useState<'palpite' | 'testando' | 'resultado'>('palpite');
  const [result, setResult] = useState<Pose | null>(null);
  const raf = useRef(0);
  const name = useId();
  const c = CASES[caseIdx];

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  function reset(nextCase = caseIdx) {
    cancelAnimationFrame(raf.current);
    setCaseIdx(nextCase);
    setGuess(null);
    setPhase('palpite');
    setResult(null);
    set({ pose: home });
  }

  function test() {
    setPhase('testando');
    const L1 = L0.map((l, i) => l + (c.legs.includes(i) ? EXP_DELTA : 0));
    let pose = home;
    const finish = () => {
      set({ pose });
      setResult(pose);
      setPhase('resultado');
    };
    if (reduced()) {
      pose = forwardKinematics(L1, geometry, pose).pose;
      finish();
      return;
    }
    const t0 = performance.now();
    const tick = () => {
      const u = Math.min(1, (performance.now() - t0) / 2000);
      const L = L0.map((l, i) => l + (L1[i] - l) * ease(u));
      pose = forwardKinematics(L, geometry, pose).pose;
      set({ pose });
      if (u < 1) raf.current = requestAnimationFrame(tick);
      else finish();
    };
    raf.current = requestAnimationFrame(tick);
  }

  const right = guess === c.correct;
  return (
    <div className="space-y-3">
      <div role="group" aria-label="Casos do experimento" className="flex flex-wrap gap-1.5">
        {CASES.map((k, i) => (
          <Button key={k.title} size="sm" variant={i === caseIdx ? 'primary' : 'secondary'} aria-pressed={i === caseIdx} onClick={() => reset(i)}>
            {k.title}
          </Button>
        ))}
      </div>
      <p className="text-sm text-muted">
        No home, os seis atuadores medem cerca de <Tex>{`L = ${texNum(L0[0], 0)}\\ \\text{mm}`}</Tex>.
      </p>
      <fieldset className="rounded-lg border border-border p-3" disabled={phase !== 'palpite'}>
        <legend className="px-1 text-sm font-semibold">{c.question}</legend>
        <div className="mt-1 space-y-1.5">
          {c.options.map((o, i) => (
            <label key={o} className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="radio" name={name} checked={guess === i} onChange={() => setGuess(i)} className="size-4 accent-[var(--c-brand)]" />
              {o}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={test} disabled={guess === null || phase !== 'palpite'}>
          <FlaskConical aria-hidden />
          Testar
        </Button>
        <Button variant="ghost" onClick={() => reset()} disabled={phase === 'palpite' && guess === null}>
          <RotateCcw aria-hidden />
          Recomeçar
        </Button>
      </div>
      <div role="status" aria-live="polite" className="space-y-2">
        {phase === 'testando' && <p className="text-sm text-muted">Mudando os comprimentos e resolvendo a direta a cada quadro…</p>}
        {phase === 'resultado' && result && (
          <>
            <p className={cn('flex items-start gap-1.5 text-sm font-medium', right ? 'text-brand-text' : 'text-danger')}>
              {right ? <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0" /> : <XCircle aria-hidden className="mt-0.5 size-4 shrink-0" />}
              <span>
                {right ? 'Acertou! ' : 'Não foi isso. '}
                <span className="font-normal text-fg">{c.explain}</span>
              </span>
            </p>
            <PoseDelta from={home} to={result} caption="Quanto a pose mudou" />
            {caseIdx === 0 && (
              <Button size="sm" variant="secondary" onClick={() => reset(1)}>
                Próximo caso
                <ArrowRight aria-hidden />
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Pose "real" escondida das aulas de restrição e do solver (o aluno só vê os comprimentos). */
const REAL: Omit<Pose, 'z'> & { dz: number } = { x: 14, y: -9, dz: 18, roll: 4, pitch: -3, yaw: 6 };
const realPose = (homeZ: number): Pose => ({ x: REAL.x, y: REAL.y, z: homeZ + REAL.dz, roll: REAL.roll, pitch: REAL.pitch, yaw: REAL.yaw });

/** Aula 2.4: a esfera de cada perna e a tentativa de acertar a pose à mão. */
export function FkConstraints() {
  const geometry = useGeometry();
  const pose = useLessonScene((s) => s.pose);
  const leg = useLessonScene((s) => s.leg);
  const set = useLessonScene((s) => s.set);
  const measured = useMemo(() => legVectors(realPose(geometry.home_z), geometry).map((l) => l.length), [geometry]);
  useEffect(() => {
    set({ measured, sphereLeg: useLessonScene.getState().leg });
    return () => set({ measured: null, sphereLeg: null });
  }, [measured, set]);
  useEffect(() => set({ sphereLeg: leg }), [leg, set]);

  const legs = legVectors(pose, geometry);
  const res = legs.map((l, i) => l.length - measured[i]);
  const worst = Math.max(...res.map(Math.abs));
  const l = legs[leg];
  const i = leg + 1;
  return (
    <div className="space-y-3">
      <LegPicker />
      <Tex block label={`Restrição da perna ${i}: norma de p mais R b${i} menos a${i} igual a ${fmt(measured[leg], 1)} milímetros`}>
        {`\\lVert \\mathbf{p} + R\\,${texVec(l.b, 0)} - ${texVec(l.a, 0)} \\rVert = L_${i} = ${texNum(measured[leg])}\\ \\text{mm}`}
      </Tex>
      <p className="text-sm">
        Os sensores mediram os seis comprimentos abaixo. Tente achar a pose <strong>à mão</strong>: mexa nos controles até zerar os seis erros. Repare que cada
        controle mexe em vários erros ao mesmo tempo.
      </p>
      <ul className="grid grid-cols-2 gap-1.5 text-sm tabular-nums sm:grid-cols-3" aria-label="Erro de cada perna (comprimento atual menos o medido)">
        {res.map((r, k) => (
          <li key={k} className={cn('rounded-lg border px-2 py-1', k === leg && 'ring-2 ring-focus')} style={{ borderColor: PISTON_COLORS[k] }}>
            <span className="font-semibold">L{k + 1}</span> medido {fmt(measured[k], 1)} · erro{' '}
            <span className={Math.abs(r) < 1 ? 'text-brand-text' : 'text-warning'}>
              {r >= 0 ? '+' : ''}
              {fmt(r, 1)} mm
            </span>
          </li>
        ))}
      </ul>
      <p role="status" className={cn('text-sm font-medium', worst < 1 ? 'text-brand-text' : 'text-muted')}>
        {worst < 1 ? 'Você resolveu a direta à mão! Os seis comprimentos batem.' : `Maior erro agora: ${fmt(worst, 1)} mm.`}
      </p>
      <PoseEditor pose={pose} onChange={(p) => set({ pose: p })} />
    </div>
  );
}

type Guess = 'home' | 'anterior' | 'ruim';
const GUESSES: { id: Guess; label: string; description: string }[] = [
  { id: 'home', label: 'Home', description: 'o tampo centrado, sem inclinação' },
  { id: 'anterior', label: 'Pose anterior', description: 'o que o backend usa: a última pose calculada, muito perto da atual' },
  { id: 'ruim', label: 'Chute ruim', description: 'longe da resposta, inclinado para o outro lado' },
];
const FLOW = ['Comprimentos medidos', 'Chute da pose', 'Cinemática inversa', 'Comprimentos estimados', 'Erro', 'Mínimos quadrados', 'Nova pose'];
const GHOST_COLORS = ['#f5b400', '#f59e0b', '#fb923c', '#f97316', '#ef4444'];

/** Aula 2.4: o solver iteração por iteração, com os fantasmas convergindo. */
export function FkSolver() {
  const geometry = useGeometry();
  const set = useLessonScene((s) => s.set);
  const real = useMemo(() => realPose(geometry.home_z), [geometry.home_z]);
  const measured = useMemo(() => legVectors(real, geometry).map((l) => l.length), [real, geometry]);
  const [guessId, setGuessId] = useState<Guess>('home');
  const [k, setK] = useState(0);
  const [playing, setPlaying] = useState(false);
  const name = useId();

  const guess = useMemo((): Pose => {
    if (guessId === 'anterior') return { ...real, x: real.x + 1.5, y: real.y - 1, z: real.z + 0.8, roll: real.roll + 0.3, pitch: real.pitch - 0.2, yaw: real.yaw + 0.4 };
    if (guessId === 'ruim') return { x: -60, y: 55, z: geometry.home_z - 100, roll: -18, pitch: 16, yaw: -25 };
    return zeroPose(geometry.home_z);
  }, [guessId, real, geometry.home_z]);
  const history: FkStep[] = useMemo(() => forwardKinematics(measured, geometry, guess, { history: true, maxIterations: 40 }).history ?? [], [measured, geometry, guess]);
  const last = history.length - 1;
  const cur = history[Math.min(k, last)];

  useEffect(() => {
    const ghosts = history
      .slice(Math.max(0, k - 4), k)
      .map((h, i, arr) => ({ pose: h.pose, color: GHOST_COLORS[Math.min(GHOST_COLORS.length - 1, arr.length - 1 - i)], label: i === arr.length - 1 ? `iteração ${h.iteration}` : undefined }));
    set({ pose: cur.pose, ghosts });
  }, [history, k, cur, set]);
  useEffect(() => () => set({ ghosts: [] }), [set]);

  const done = k >= last;
  const running = playing && !done;
  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => setK((x) => x + 1), reduced() ? 50 : 700);
    return () => clearTimeout(t);
  }, [running, k]);

  const found = history[last];
  const offReal = found ? Math.max(Math.abs(found.pose.x - real.x), Math.abs(found.pose.y - real.y), Math.abs(found.pose.z - real.z)) : 0;
  const offAng = found ? Math.max(Math.abs(found.pose.roll - real.roll), Math.abs(found.pose.pitch - real.pitch), Math.abs(found.pose.yaw - real.yaw)) : 0;

  return (
    <div className="space-y-4">
      <ol className="flex flex-wrap items-center gap-1 text-xs" aria-label="Ciclo do solver">
        {FLOW.map((f, i) => (
          <li key={f} className="flex items-center gap-1">
            <span className="rounded-md border border-border bg-surface-2 px-2 py-1 font-medium">{f}</span>
            {i < FLOW.length - 1 ? <ArrowRight aria-hidden className="size-3.5 text-muted" /> : <RotateCcw aria-hidden className="size-3.5 text-muted" />}
          </li>
        ))}
      </ol>
      <fieldset className="rounded-lg border border-border p-3">
        <legend className="px-1 text-sm font-semibold">Chute inicial</legend>
        <div className="mt-1 space-y-1.5">
          {GUESSES.map((g) => (
            <label key={g.id} className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="radio"
                name={name}
                checked={guessId === g.id}
                onChange={() => {
                  setGuessId(g.id);
                  setK(0);
                  setPlaying(false);
                }}
                className="mt-0.5 size-4 accent-[var(--c-brand)]"
              />
              <span>
                <span className="font-medium">{g.label}</span> <span className="text-muted">— {g.description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setK((x) => Math.min(last, x + 1))} disabled={done}>
          <StepForward aria-hidden />
          Passo
        </Button>
        <Button variant="primary" onClick={() => setPlaying(!running)} disabled={done}>
          {running ? <Pause aria-hidden /> : <Play aria-hidden />}
          {running ? 'Pausar' : 'Rodar'}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setK(0);
            setPlaying(false);
          }}
          disabled={k === 0}
        >
          <RotateCcw aria-hidden />
          Recomeçar
        </Button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border" tabIndex={0} role="region" aria-label="Iterações do solver">
        <table className="w-full text-sm tabular-nums">
          <caption className="sr-only">Erro de comprimento a cada iteração</caption>
          <thead className="bg-surface-2 text-left">
            <tr>
              <th scope="col" className="px-3 py-1.5">
                Iteração
              </th>
              <th scope="col" className="px-3 py-1.5">
                Maior erro
              </th>
              <th scope="col" className="px-3 py-1.5">
                Erro RMS
              </th>
            </tr>
          </thead>
          <tbody>
            {history.slice(0, k + 1).map((h) => (
              <tr key={h.iteration} className={cn('border-t border-border', h.iteration === k && 'bg-success-soft font-semibold')}>
                <th scope="row" className="px-3 py-1 text-left font-medium">
                  {h.iteration}
                </th>
                <td className="px-3 py-1">{h.maxError < 0.01 ? '< 0,01' : fmt(h.maxError, h.maxError < 1 ? 2 : 1)} mm</td>
                <td className="px-3 py-1">{h.rms < 0.01 ? '< 0,01' : fmt(h.rms, h.rms < 1 ? 2 : 1)} mm</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div role="status" aria-live="polite" className="text-sm">
        {done && found && (
          <>
            {found.maxError < 0.01 ? (
              offReal < 0.5 && offAng < 0.2 ? (
                <p className="font-medium text-brand-text">
                  Convergiu em {last} iterações para a pose real: X {fmt(found.pose.x, 1)} · Y {fmt(found.pose.y, 1)} · Z {fmt(found.pose.z, 1)} mm · roll {fmt(found.pose.roll, 1)}° · pitch{' '}
                  {fmt(found.pose.pitch, 1)}° · yaw {fmt(found.pose.yaw, 1)}°.
                </p>
              ) : (
                <p className="font-medium text-warning">Os seis comprimentos batem, mas a pose é outra: o solver caiu em outra solução da direta.</p>
              )
            ) : (
              <p className="font-medium text-danger">Não convergiu (o erro parou em {fmt(found.maxError, 1)} mm): o chute estava longe demais.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
