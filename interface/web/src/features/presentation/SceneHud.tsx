import { Gamepad2, Hand } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Tex, texNum } from '@/components/Tex';
import { cn } from '@/lib/cn';
import { solvePose } from '@/lib/kinematics';
import { fmt, PISTON_COLORS } from '@/lib/pistons';
import type { PlatformGeometry, Pose } from '@/lib/types';
import { dofAt, SCENES, type SceneId } from './scenes';

/** Relê um valor a cada `ms` (os números da cena mudam a 60 Hz; o texto não precisa). */
export function usePolled<T>(read: () => T, ms = 100): T {
  const [v, setV] = useState(read);
  useEffect(() => {
    const id = setInterval(() => setV(read()), ms);
    return () => clearInterval(id);
    // o leitor é estável (lê refs)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms]);
  return v;
}

const panel = 'rounded-2xl border border-white/10 bg-black/45 backdrop-blur-md shadow-2xl';

const STATS = [
  ['6', 'graus de liberdade'],
  ['180 mm', 'de curso por pistão'],
  ['30 Hz', 'de telemetria'],
  ['±15°', 'de inclinação'],
] as const;

/** Instrumento de atitude (horizonte artificial) com o roll e o pitch do tampo. */
function AttitudeIndicator({ roll, pitch }: { roll: number; pitch: number }) {
  const shift = Math.max(-40, Math.min(40, pitch * 4));
  return (
    <svg viewBox="-60 -60 120 120" className="size-40 drop-shadow-xl sm:size-48" role="img" aria-label={`Horizonte artificial: roll ${fmt(roll, 0)} graus, pitch ${fmt(pitch, 0)} graus`}>
      <defs>
        <clipPath id="ai-clip">
          <circle r="54" />
        </clipPath>
      </defs>
      <g clipPath="url(#ai-clip)">
        <g transform={`rotate(${-roll}) translate(0 ${shift})`}>
          <rect x="-150" y="-150" width="300" height="150" fill="#2c7fd6" />
          <rect x="-150" y="0" width="300" height="150" fill="#7a4e24" />
          <line x1="-150" x2="150" y1="0" y2="0" stroke="#fff" strokeWidth="1.5" />
          {[-20, -10, 10, 20].map((d) => (
            <line key={d} x1={-10 - Math.abs(d) / 2} x2={10 + Math.abs(d) / 2} y1={-d * 4} y2={-d * 4} stroke="#fff" strokeWidth="1" opacity="0.8" />
          ))}
        </g>
      </g>
      <circle r="54" fill="none" stroke="#fff" strokeOpacity="0.5" strokeWidth="2" />
      {/* avião fixo */}
      <path d="M -32 0 L -10 0 L -4 6 L 4 6 L 10 0 L 32 0" fill="none" stroke="#ffd23f" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle r="2.5" fill="#ffd23f" />
    </svg>
  );
}

function SceneExtra({ id, u, pose, geometry }: { id: SceneId; u: number; pose: Pose; geometry: PlatformGeometry }) {
  if (id === 'titulo')
    return (
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {STATS.map(([v, l]) => (
          <div key={l} className={cn(panel, 'px-4 py-3')}>
            <dt className="sr-only">{l}</dt>
            <dd>
              <span className="block text-2xl font-bold tabular-nums text-white sm:text-3xl">{v}</span>
              <span aria-hidden className="text-sm text-white/70">
                {l}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    );
  if (id === 'gdl') {
    const cur = dofAt(u);
    return (
      <ol className="flex flex-wrap gap-2" aria-label="Graus de liberdade">
        {['X', 'Y', 'Z', 'Roll', 'Pitch', 'Yaw'].map((name, i) => (
          <li
            key={name}
            aria-current={i === cur.index ? 'true' : undefined}
            className={cn(
              'rounded-xl border px-4 py-2 text-lg font-semibold transition-all duration-300',
              i === cur.index ? 'scale-110 border-[#3fb654] bg-[#3fb654] text-black shadow-[0_0_30px_#3fb65499]' : 'border-white/15 bg-black/40 text-white/70',
            )}
          >
            {name}
            <span className="ml-1.5 text-xs font-normal opacity-80">{i < 3 ? 'translação' : 'rotação'}</span>
          </li>
        ))}
      </ol>
    );
  }
  if (id === 'pistoes') {
    const L = solvePose(pose, geometry).lengths;
    const lit = Math.min(5, Math.floor(u * 6));
    return (
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6" aria-label="Comprimento de cada pistão">
        {L.map((l, i) => (
          <li
            key={i}
            className={cn(panel, 'px-3 py-2 text-center transition-all duration-300', i === lit && 'scale-105')}
            style={i === lit ? { borderColor: PISTON_COLORS[i], boxShadow: `0 0 28px ${PISTON_COLORS[i]}88` } : undefined}
          >
            <span className="block text-xs font-semibold uppercase tracking-wider" style={{ color: PISTON_COLORS[i] }}>
              Pistão {i + 1}
            </span>
            <span className="text-2xl font-bold tabular-nums text-white">{fmt(l, 0)}</span>
            <span className="text-sm text-white/60"> mm</span>
          </li>
        ))}
      </ul>
    );
  }
  if (id === 'voo')
    return (
      <div className="flex items-center gap-5">
        <AttitudeIndicator roll={pose.roll} pitch={pose.pitch} />
        <dl className="space-y-1 text-white">
          <div>
            <dt className="text-xs uppercase tracking-wider text-white/60">Rolagem</dt>
            <dd className="text-3xl font-bold tabular-nums">{fmt(pose.roll, 1)}°</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-white/60">Arfagem</dt>
            <dd className="text-3xl font-bold tabular-nums">{fmt(pose.pitch, 1)}°</dd>
          </div>
        </dl>
      </div>
    );
  if (id === 'cinematica') {
    const L1 = solvePose(pose, geometry).lengths[0];
    return (
      <div className={cn(panel, 'inline-block px-6 py-4 text-2xl text-white sm:text-3xl')}>
        <Tex block label={`L1 igual à norma de p mais R vezes b1 menos a1, igual a ${fmt(L1, 1)} milímetros`}>
          {`L_1 = \\lVert \\mathbf{p} + R\\,\\mathbf{b}_1 - \\mathbf{a}_1 \\rVert = ${texNum(L1)}\\ \\text{mm}`}
        </Tex>
        <p className="mt-1 text-sm text-white/70">
          p = ({fmt(pose.x, 0)}, {fmt(pose.y, 0)}, {fmt(pose.z, 0)}) mm · o mesmo cálculo para os seis pistões, 60 vezes por segundo
        </p>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-6 text-white" aria-hidden>
      <Hand className="size-16 animate-bounce text-[#3fb654] motion-reduce:animate-none" />
      <Gamepad2 className="size-16 animate-pulse text-[#6aa8ff] motion-reduce:animate-none" />
    </div>
  );
}

/** Título, subtítulo e o painel da cena atual, com entrada suave a cada troca. */
export function SceneHud({ index, getState, geometry }: { index: number; getState: () => { u: number; pose: Pose }; geometry: PlatformGeometry }) {
  const scene = SCENES[index];
  const { u, pose } = usePolled(getState, 100);
  return (
    <section key={scene.id} aria-labelledby="cena-titulo" className="scene-enter space-y-5">
      <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#62d275]">
        {String(index + 1).padStart(2, '0')} / {String(SCENES.length).padStart(2, '0')}
      </p>
      <h2 id="cena-titulo" className="max-w-4xl text-5xl font-extrabold leading-[1.02] tracking-tight text-white drop-shadow-[0_4px_30px_rgba(0,0,0,0.8)] sm:text-6xl xl:text-7xl">
        {scene.title}
      </h2>
      <p className="max-w-2xl text-lg text-white/80 sm:text-xl">{scene.subtitle}</p>
      <SceneExtra id={scene.id} u={u} pose={pose} geometry={geometry} />
    </section>
  );
}
