import { Activity, Crosshair } from 'lucide-react';
import { useThrottledTelemetry } from '@/features/control/useThrottled';
import { useGeometry } from '@/features/platform3d/geometry';
import { cn } from '@/lib/cn';
import { fmt, PISTON_COLORS, PISTONS } from '@/lib/pistons';
import type { CalibrationStatus } from '@/lib/types';

/** Barra vertical de um pistão: curso medido (preenchido) e alvo (traço). */
function PistonBar({ n, y, target, stroke, active, dim }: { n: number; y: number | null; target: number | null; stroke: number; active: boolean; dim: boolean }) {
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / stroke) * 100))}%`;
  const err = y != null && target != null ? y - target : null;
  return (
    <li
      className={cn(
        'flex flex-col items-center gap-1 rounded-lg border p-2 transition-colors',
        active ? 'border-brand bg-success-soft' : 'border-border',
        dim && 'opacity-60',
      )}
      aria-label={`Pistão ${n}${active ? ', em teste' : ''}: medido ${fmt(y, 1, ' mm')}, alvo ${fmt(target, 1, ' mm')}`}
    >
      <span className={cn('text-xs font-semibold', active && 'text-brand-text')}>P{n}</span>
      <div className="relative h-28 w-5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
        {y != null && <div className="absolute inset-x-0 bottom-0 rounded-full transition-[height] duration-200 motion-reduce:transition-none" style={{ height: pct(y), background: PISTON_COLORS[n - 1] }} />}
        {target != null && <div className="absolute inset-x-[-2px] h-0.5 bg-fg" style={{ bottom: pct(target) }} />}
      </div>
      <span className="text-xs tabular-nums">{fmt(y, 0)}</span>
      <span className={cn('text-[0.7rem] tabular-nums', err != null && Math.abs(err) > 2 ? 'text-warning' : 'text-muted')}>{err == null ? '—' : `${err > 0 ? '+' : ''}${fmt(err, 1)}`}</span>
      {active && <span className="rounded bg-primary px-1.5 text-[0.65rem] font-semibold uppercase text-on-primary">em teste</span>}
    </li>
  );
}

/** "Agora": o que o passo atual faz, o que ele mede e onde cada pistão está em relação ao alvo. */
export function NowPanel({ st }: { st: CalibrationStatus }) {
  const geometry = useGeometry();
  const stroke = geometry.stroke_max - geometry.stroke_min;
  const Y = useThrottledTelemetry((s) => s.telemetry?.Y ?? null, 150);
  const moving = st.phase === 'home' || st.phase === 'autoteste' || st.phase === 'coleta';

  return (
    <section aria-labelledby="calib-now" className="rounded-xl border border-brand/40 bg-surface-2 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="calib-now" className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand-text">
          <Activity aria-hidden className="size-4" />
          Agora
        </h3>
        {st.step_count > 0 && (
          <span className="text-xs tabular-nums text-muted">
            Passo {st.step_index} de {st.step_count}
          </span>
        )}
      </div>
      <p className="mt-1 text-lg font-semibold" aria-live="polite">
        {st.detail || st.label}
      </p>
      {st.measuring && (
        <p className="mt-1 flex gap-2 text-sm text-muted">
          <Crosshair aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            <span className="font-medium text-fg">Medindo:</span> {st.measuring}
          </span>
        </p>
      )}
      {st.waiting && <p className="mt-1 text-sm tabular-nums text-muted">{st.waiting}</p>}
      {moving && (
        <>
          <ul className="mt-3 grid grid-cols-6 gap-2" aria-label="Curso de cada pistão: medido e alvo">
            {PISTONS.map((n) => (
              <PistonBar
                key={n}
                n={n}
                y={Y?.[n - 1] ?? null}
                target={st.target?.[n - 1] ?? null}
                stroke={stroke}
                active={st.piston === n}
                dim={st.piston != null && st.piston !== n}
              />
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">Barra = curso medido (mm, 0 a {fmt(stroke, 0)}); traço = alvo; número de baixo = erro até o alvo.</p>
        </>
      )}
    </section>
  );
}
