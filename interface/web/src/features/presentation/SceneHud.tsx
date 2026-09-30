import { Gamepad2, Hand } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Tex, texNum } from '@/components/Tex';
import { cn } from '@/lib/cn';
import { solvePose } from '@/lib/kinematics';
import { uiLimits } from '@/lib/limits';
import { fmt, PISTON_COLORS } from '@/lib/pistons';
import type { CueingTickMessage, PlatformGeometry, Pose } from '@/lib/types';
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

const panel = 'rounded-2xl border border-[var(--ex-border)] bg-[var(--ex-panel)] backdrop-blur-md shadow-2xl';

/** Números da cena de título, tirados dos limites reais (limits.json) */
function titleStats(geometry: PlatformGeometry): [string, string][] {
  return [
    ['6', 'graus de liberdade'],
    [`${fmt(geometry.stroke_max - geometry.stroke_min, 0)} mm`, 'de curso por pistão'],
    ['30 Hz', 'de telemetria'],
    [`±${fmt(uiLimits(geometry).tilt, 0)}°`, 'de inclinação'],
  ];
}

/** Instrumento de atitude (horizonte artificial) com o roll e o pitch do tampo. */
export function AttitudeIndicator({ roll, pitch, className }: { roll: number; pitch: number; className?: string }) {
  const shift = Math.max(-40, Math.min(40, pitch * 4));
  return (
    <svg viewBox="-60 -60 120 120" className={cn('size-40 drop-shadow-xl sm:size-48', className)} role="img" aria-label={`Horizonte artificial: roll ${fmt(roll, 0)} graus, pitch ${fmt(pitch, 0)} graus`}>
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
        {titleStats(geometry).map(([v, l]) => (
          <div key={l} className={cn(panel, 'px-4 py-3')}>
            <dt className="sr-only">{l}</dt>
            <dd>
              <span className="block text-2xl font-bold tabular-nums text-[var(--ex-text)] sm:text-3xl">{v}</span>
              <span aria-hidden className="text-sm text-[var(--ex-muted)]">
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
              i === cur.index ? 'scale-110 border-[#3fb654] bg-[#3fb654] text-black shadow-[0_0_30px_#3fb65499]' : 'border-[var(--ex-border)] bg-[var(--ex-panel)] text-[var(--ex-muted)]',
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
            <span className="text-2xl font-bold tabular-nums text-[var(--ex-text)]">{fmt(l, 0)}</span>
            <span className="text-sm text-[var(--ex-muted)]"> mm</span>
          </li>
        ))}
      </ul>
    );
  }
  if (id === 'voo')
    return (
      <div className="flex items-center gap-5">
        <AttitudeIndicator roll={pose.roll} pitch={pose.pitch} />
        <dl className="space-y-1 text-[var(--ex-text)]">
          <div>
            <dt className="text-xs uppercase tracking-wider text-[var(--ex-muted)]">Rolagem</dt>
            <dd className="text-3xl font-bold tabular-nums">{fmt(pose.roll, 1)}°</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-[var(--ex-muted)]">Arfagem</dt>
            <dd className="text-3xl font-bold tabular-nums">{fmt(pose.pitch, 1)}°</dd>
          </div>
        </dl>
      </div>
    );
  if (id === 'orientacao')
    return (
      <div className="flex flex-wrap items-center gap-5">
        <AttitudeIndicator roll={pose.roll} pitch={pose.pitch} />
        <p className="max-w-xs text-2xl font-bold leading-snug text-[var(--ex-text)]">
          Tampo = avião
          <span className="mt-1 block text-base font-normal text-[var(--ex-muted)] tabular-nums">
            roll {fmt(pose.roll, 1)}° · pitch {fmt(pose.pitch, 1)}°, direto do FlightGear
          </span>
        </p>
      </div>
    );
  if (id === 'cinematica') {
    const L1 = solvePose(pose, geometry).lengths[0];
    return (
      <div className={cn(panel, 'inline-block px-6 py-4 text-2xl text-[var(--ex-text)] sm:text-3xl')}>
        <Tex block label={`L1 igual à norma de p mais R vezes b1 menos a1, igual a ${fmt(L1, 1)} milímetros`}>
          {`L_1 = \\lVert \\mathbf{p} + R\\,\\mathbf{b}_1 - \\mathbf{a}_1 \\rVert = ${texNum(L1)}\\ \\text{mm}`}
        </Tex>
        <p className="mt-1 text-sm text-[var(--ex-muted)]">
          p = ({fmt(pose.x, 0)}, {fmt(pose.y, 0)}, {fmt(pose.z, 0)}) mm · o mesmo cálculo para os seis pistões, 60 vezes por segundo
        </p>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-6 text-[var(--ex-text)]" aria-hidden>
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
      <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[var(--ex-accent)]">
        {String(index + 1).padStart(2, '0')} / {String(SCENES.length).padStart(2, '0')}
      </p>
      <h2 id="cena-titulo" className="max-w-4xl text-5xl font-extrabold leading-[1.02] tracking-tight text-[var(--ex-text)] drop-shadow-[0_4px_30px_var(--ex-shadow)] sm:text-6xl xl:text-7xl">
        {scene.title}
      </h2>
      <p className="max-w-2xl text-lg text-[var(--ex-muted)] sm:text-xl">{scene.subtitle}</p>
      <SceneExtra id={scene.id} u={u} pose={pose} geometry={geometry} />
    </section>
  );
}

/** Modo "Simulador de voo": instrumentos do avião e o que a plataforma faz (motion cueing). */
export function FlightHud({ getTick, flightName, attitude = false }: { getTick: () => CueingTickMessage | null; flightName: string | null; attitude?: boolean }) {
  const tick = usePolled(getTick, 100);
  const ac = tick?.aircraft ?? null;
  const rp = tick?.replay ?? null;
  const pose = tick?.pose ?? null;
  return (
    <section aria-labelledby="voo-titulo" className="scene-enter space-y-5">
      <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[var(--ex-accent)]">{attitude ? 'Orientação do avião' : 'Simulador de voo · motion cueing'}</p>
      <h2 id="voo-titulo" className="max-w-4xl text-5xl font-extrabold leading-[1.02] tracking-tight text-[var(--ex-text)] drop-shadow-[0_4px_30px_var(--ex-shadow)] sm:text-6xl xl:text-7xl">
        {attitude ? 'O tampo copia o avião' : 'Sinta o voo'}
      </h2>
      <p className="max-w-2xl text-lg text-[var(--ex-muted)] sm:text-xl">
        {attitude
          ? 'A rolagem e a arfagem do ERJ145 do IFSP no FlightGear vão direto para o tampo, dentro do limite de inclinação da bancada.'
          : 'A plataforma reproduz as acelerações e as curvas do ERJ145 do IFSP no FlightGear. Para simular uma aceleração longa, ela inclina devagar e depois volta ao centro sem você perceber (washout).'}
      </p>
      <div className="flex flex-wrap items-center gap-5">
        <AttitudeIndicator roll={ac?.roll ?? 0} pitch={ac?.pitch ?? 0} />
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-[var(--ex-text)]">
          {(
            [
              ['Velocidade', ac ? `${fmt(ac.ias, 0)} kt` : '—'],
              ['Altitude', ac ? `${fmt(ac.alt, 0)} ft` : '—'],
              ['Rumo', ac ? `${fmt(((ac.heading % 360) + 360) % 360, 0)}°` : '—'],
              attitude
                ? ['Avião', ac ? `roll ${fmt(ac.roll, 1)}° · pitch ${fmt(ac.pitch, 1)}°` : '—']
                : ['Plataforma', pose ? `roll ${fmt(pose.roll, 1)}° · pitch ${fmt(pose.pitch, 1)}°` : '—'],
              ...(attitude ? [['Tampo', pose ? `roll ${fmt(pose.roll, 1)}° · pitch ${fmt(pose.pitch, 1)}°` : '—'] as const] : []),
            ] as const
          ).map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs uppercase tracking-wider text-[var(--ex-muted)]">{k}</dt>
              <dd className="text-2xl font-bold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      {rp && (
        <div className="max-w-xl">
          <div className="mb-1 flex justify-between gap-3 text-sm text-[var(--ex-muted)]">
            <span className="truncate">{flightName ?? rp.name}</span>
            <span className="tabular-nums">
              {Math.floor(rp.t / 60)}:{String(Math.floor(rp.t % 60)).padStart(2, '0')} / {Math.floor(rp.duration / 60)}:{String(Math.floor(rp.duration % 60)).padStart(2, '0')}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--ex-track)]" aria-hidden>
            <div className="h-full rounded-full bg-[#3fb654]" style={{ width: `${Math.min(100, (rp.t / Math.max(1, rp.duration)) * 100)}%` }} />
          </div>
        </div>
      )}
      {!tick && <p className="text-sm text-[var(--ex-muted)]">Aguardando o voo gravado começar…</p>}
    </section>
  );
}
