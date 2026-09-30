import { useEffect, useMemo, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Tex, texNum } from '@/components/Tex';
import { Button } from '@/components/ui/button';
import { SliderField } from '@/components/ui/field';
import { cn } from '@/lib/cn';
import { fmt } from '@/lib/pistons';
import { UR_HOME, useLessonScene } from '../lessonStore';
import { fk2R, fkChain, ik2R, ikUR5e, position, UR5E_DH, UR5E_JOINTS, type Mat4 } from '../serial/ur5e';
import { texMat } from './basic';

const DEG = 180 / Math.PI;

/** Aula 2.1: direta do UR5e — ângulos das juntas → ⁰T₆, com a tabela DH. */
export function UrFkWidget() {
  const ur = useLessonScene((s) => s.ur);
  const set = useLessonScene((s) => s.set);
  useEffect(() => {
    set({ urFrames: true });
    return () => set({ urFrames: false });
  }, [set]);
  const T = useMemo(() => fkChain(ur)[6], [ur]);
  const rows = [0, 1, 2, 3].map((r) => [0, 1, 2, 3].map((c) => T[r * 4 + c] * (c === 3 && r < 3 ? 1000 : 1)));
  return (
    <div className="space-y-4">
      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {UR5E_JOINTS.map((name, i) => (
          <SliderField
            key={name}
            label={`θ${i + 1} · ${name}`}
            value={Math.round(ur[i] * DEG)}
            onValueChange={(v) => set({ ur: ur.map((t, k) => (k === i ? v / DEG : t)) })}
            min={-180}
            max={180}
            step={1}
            unit="°"
            unitSpoken="graus"
            digits={0}
          />
        ))}
      </div>
      <Button size="sm" variant="ghost" onClick={() => set({ ur: UR_HOME })}>
        Voltar à pose inicial
      </Button>
      <div className="overflow-x-auto rounded-lg border border-border" tabIndex={0} role="region" aria-label="Tabela de Denavit-Hartenberg do UR5e">
        <table className="w-full text-sm tabular-nums">
          <caption className="sr-only">Parâmetros de Denavit–Hartenberg do UR5e (Universal Robots)</caption>
          <thead className="bg-surface-2 text-left">
            <tr>
              {['Junta', 'θᵢ (agora)', 'dᵢ (mm)', 'aᵢ (mm)', 'αᵢ'].map((h) => (
                <th key={h} scope="col" className="px-3 py-1.5">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {UR5E_DH.map((r, i) => (
              <tr key={i} className="border-t border-border">
                <th scope="row" className="px-3 py-1.5 text-left font-medium">
                  {i + 1} · {UR5E_JOINTS[i]}
                </th>
                <td className="px-3 py-1.5">{fmt(ur[i] * DEG, 0)}°</td>
                <td className="px-3 py-1.5">{fmt(r.d * 1000, 1)}</td>
                <td className="px-3 py-1.5">{fmt(r.a * 1000, 1)}</td>
                <td className="px-3 py-1.5">{fmt(r.alpha * DEG, 0)}°</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Tex block label="Matriz T zero seis da ferramenta, com a posição em milímetros">
        {`{}^{0}T_6 = ${texMat(rows, 3)}`}
      </Tex>
      <p className="text-sm text-muted">A última coluna é a posição da ferramenta (mm); o bloco 3×3 é a orientação dela.</p>
    </div>
  );
}

// ---------------------------------------------------------------- braço 2R (SVG)
const ARM = { l1: 1, l2: 0.75 };
const VIEW = 2.1;

/** Aula 2.1: inversa de um braço planar de duas juntas — duas soluções ou nenhuma. */
export function Arm2RWidget() {
  const [target, setTarget] = useState<[number, number]>([1.05, 0.7]);
  const [drag, setDrag] = useState(false);
  const sol = ik2R(ARM, target[0], target[1]);

  function fromEvent(e: PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 2 * VIEW - VIEW;
    const y = -(((e.clientY - r.top) / r.height) * 2 * VIEW - VIEW);
    setTarget([Math.round(x * 100) / 100, Math.round(y * 100) / 100]);
  }
  function onKey(e: KeyboardEvent<SVGSVGElement>) {
    const d: Record<string, [number, number]> = { ArrowLeft: [-0.05, 0], ArrowRight: [0.05, 0], ArrowUp: [0, 0.05], ArrowDown: [0, -0.05] };
    const m = d[e.key];
    if (!m) return;
    e.preventDefault();
    e.stopPropagation();
    setTarget(([x, y]) => [Math.round((x + m[0]) * 100) / 100, Math.round((y + m[1]) * 100) / 100]);
  }

  const arm = (t: [number, number] | undefined, cls: string, dash?: string) => {
    if (!t) return null;
    const { elbow, tip } = fk2R(ARM, t[0], t[1]);
    return (
      <g className={cls} strokeWidth={0.07}>
        <polyline points={`0,0 ${elbow[0]},${-elbow[1]} ${tip[0]},${-tip[1]}`} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dash} />
        <circle cx={elbow[0]} cy={-elbow[1]} r={0.06} stroke="none" />
      </g>
    );
  };

  const summary = sol
    ? `Alvo em x ${fmt(target[0], 2)}, y ${fmt(target[1], 2)}: duas soluções. Cotovelo para cima: θ1 ${fmt(sol.up[0] * DEG, 0)}°, θ2 ${fmt(sol.up[1] * DEG, 0)}°. Cotovelo para baixo: θ1 ${fmt(sol.down[0] * DEG, 0)}°, θ2 ${fmt(sol.down[1] * DEG, 0)}°.`
    : `Alvo em x ${fmt(target[0], 2)}, y ${fmt(target[1], 2)}: fora do alcance, nenhuma solução.`;

  return (
    <div className="space-y-2">
      <svg
        viewBox={`${-VIEW} ${-VIEW} ${VIEW * 2} ${VIEW * 2}`}
        className="mx-auto aspect-square w-full max-w-sm touch-none rounded-xl border border-border bg-surface-2 outline-none focus-visible:ring-2 focus-visible:ring-focus"
        role="application"
        tabIndex={0}
        aria-label={`Braço de duas juntas. Arraste ou use as setas para mover o alvo. ${summary}`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setDrag(true);
          fromEvent(e);
        }}
        onPointerMove={(e) => drag && fromEvent(e)}
        onPointerUp={() => setDrag(false)}
        onKeyDown={onKey}
      >
        {/* região alcançável: anel entre |l1 − l2| e l1 + l2 */}
        <circle r={ARM.l1 + ARM.l2} className="fill-[var(--c-success-soft)]" />
        <circle r={Math.abs(ARM.l1 - ARM.l2)} className="fill-[var(--c-surface-2)]" />
        <line x1={-VIEW} x2={VIEW} y1={0} y2={0} className="stroke-[var(--c-border)]" strokeWidth={0.01} />
        {arm(sol?.down, 'fill-[#b55cf2] stroke-[#b55cf2] opacity-70', '0.12 0.08')}
        {arm(sol?.up, 'fill-[var(--c-brand)] stroke-[var(--c-brand)]')}
        <rect x={-0.12} y={-0.06} width={0.24} height={0.12} className="fill-[var(--c-text)]" />
        <circle cx={target[0]} cy={-target[1]} r={0.09} className={cn(sol ? 'fill-[#f5b400]' : 'fill-[#e5484d]')} />
      </svg>
      <p role="status" className="text-center text-sm">
        {sol ? (
          <>
            <span className="font-semibold text-brand-text">Cotovelo para cima</span> θ₁ {fmt(sol.up[0] * DEG, 0)}°, θ₂ {fmt(sol.up[1] * DEG, 0)}° ·{' '}
            <span className="font-semibold text-[#9444d6] dark:text-[#c89af0]">para baixo</span> θ₁ {fmt(sol.down[0] * DEG, 0)}°, θ₂ {fmt(sol.down[1] * DEG, 0)}°
          </>
        ) : (
          <span className="font-semibold text-danger">Fora do alcance: nenhuma solução.</span>
        )}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- UR5e: inversa
/** Ferramenta apontando para baixo (eixo z da ferramenta = −Z), girada de ψ em torno de Z. */
function toolDown(x: number, y: number, z: number, psi: number): Mat4 {
  const c = Math.cos(psi);
  const s = Math.sin(psi);
  return [c, s, 0, x, s, -c, 0, y, 0, 0, -1, z, 0, 0, 0, 1];
}

const SHOULDER = (s: number[], ref: number[]) => (Math.abs(Math.atan2(Math.sin(s[0] - ref[0]), Math.cos(s[0] - ref[0]))) < Math.PI / 2 ? 'ombro A' : 'ombro B');

/** Aula 2.1: inversa do UR5e — até 8 soluções para o mesmo alvo da ferramenta. */
export function UrIkWidget() {
  const set = useLessonScene((s) => s.set);
  const [target, setTarget] = useState({ x: -0.45, y: -0.25, z: 0.3, psi: 0 });
  const [pick, setPick] = useState(0);
  const sols = useMemo(() => ikUR5e(toolDown(target.x, target.y, target.z, (target.psi * Math.PI) / 180)), [target]);
  const chosen = Math.min(pick, Math.max(0, sols.length - 1));

  useEffect(() => {
    set({
      urTarget: [target.x, target.y, target.z],
      ur: sols[chosen] ?? useLessonScene.getState().ur,
      urGhosts: sols.filter((_, i) => i !== chosen),
    });
  }, [sols, chosen, target, set]);
  useEffect(() => () => set({ urTarget: null, urGhosts: [] }), [set]);

  const field = (k: 'x' | 'y' | 'z', label: string) => (
    <SliderField label={label} value={Math.round(target[k] * 1000)} onValueChange={(v) => setTarget((t) => ({ ...t, [k]: v / 1000 }))} min={k === 'z' ? -100 : -800} max={k === 'z' ? 800 : 800} step={10} unit="mm" unitSpoken="milímetros" digits={0} />
  );
  const tip = sols[chosen] ? position(fkChain(sols[chosen])[6]) : null;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Alvo da ferramenta (apontando para baixo), no referencial da base do robô:</p>
      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {field('x', 'Alvo X')}
        {field('y', 'Alvo Y')}
        {field('z', 'Alvo Z')}
        <SliderField label="Giro da ferramenta" value={target.psi} onValueChange={(v) => setTarget((t) => ({ ...t, psi: v }))} min={-180} max={180} step={5} unit="°" unitSpoken="graus" digits={0} />
      </div>
      <p role="status" className="text-sm font-semibold">
        {sols.length ? `${sols.length} soluções para o mesmo alvo` : 'Fora do alcance: nenhuma solução'}
      </p>
      {sols.length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Escolha a solução mostrada">
          {sols.map((s, i) => (
            <Button key={i} size="sm" variant={i === chosen ? 'primary' : 'secondary'} aria-pressed={i === chosen} onClick={() => setPick(i)}>
              {i + 1}
              <span className="sr-only">
                : {SHOULDER(s, sols[0])}, cotovelo {s[2] > 0 ? 'para cima' : 'para baixo'}
              </span>
            </Button>
          ))}
        </div>
      )}
      {sols[chosen] && (
        <p className="text-sm text-muted tabular-nums">
          Solução {chosen + 1}: {sols[chosen].map((t, i) => `θ${i + 1} ${fmt(t * DEG, 0)}°`).join(' · ')}
          {tip && (
            <>
              {' '}
              → ferramenta em <Tex>{`(${texNum(tip[0] * 1000, 0)},\\ ${texNum(tip[1] * 1000, 0)},\\ ${texNum(tip[2] * 1000, 0)})\\ \\text{mm}`}</Tex>
            </>
          )}
        </p>
      )}
      <p className="text-xs text-muted">Os braços roxos translúcidos no modelo são as outras soluções. Todas levam a ferramenta ao mesmo ponto, na mesma orientação.</p>
    </div>
  );
}
