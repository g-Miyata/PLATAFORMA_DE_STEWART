import { useMemo } from 'react';
import { cn } from '@/lib/cn';
import type { Pose } from '@/lib/types';
import { makeSampler, type Interp, type Keyframe, type PoseAxis } from './trajectory';

export const AXIS_COLORS: Record<PoseAxis, string> = {
  x: '#e5484d',
  y: '#30a46c',
  z: '#3e63dd',
  roll: '#f76b15',
  pitch: '#8e4ec6',
  yaw: '#12a594',
};

const ROWS: { axes: PoseAxis[]; label: string; unit: string }[] = [
  { axes: ['x', 'y', 'z'], label: 'Translação', unit: 'mm (Z a partir do home)' },
  { axes: ['roll', 'pitch', 'yaw'], label: 'Rotação', unit: '°' },
];

const W = 1000;
const H = 120;
const N = 400;

interface TimelinePlotProps {
  keys: Keyframe[];
  interp: Interp;
  homeZ: number;
  time: number;
  selected: number | null;
  onSelect: (index: number) => void;
}

/** Curvas dos 6 eixos no tempo, com as poses-chave (botões) e o cursor do instante. */
export function TimelinePlot({ keys, interp, homeZ, time, selected, onSelect }: TimelinePlotProps) {
  const total = keys.length ? keys[keys.length - 1].t : 0;
  const rows = useMemo(() => {
    const f = makeSampler(keys, interp);
    const samples: Pose[] = Array.from({ length: N + 1 }, (_, i) => f((i / N) * total));
    const value = (p: Pose, a: PoseAxis) => (a === 'z' ? p.z - homeZ : p[a]);
    return ROWS.map((row) => {
      const all = samples.flatMap((p) => row.axes.map((a) => value(p, a)));
      const span = Math.max(1, ...all.map(Math.abs)) * 1.15;
      const y = (v: number) => H / 2 - (v / span) * (H / 2);
      return {
        ...row,
        span,
        lines: row.axes.map((a) => ({
          axis: a,
          points: samples.map((p, i) => `${((i / N) * W).toFixed(1)},${y(value(p, a)).toFixed(1)}`).join(' '),
        })),
      };
    });
  }, [keys, interp, homeZ, total]);

  const pct = (t: number) => (total > 0 ? (t / total) * 100 : 0);

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.label}>
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-xs text-muted">
            <span className="font-medium text-fg">
              {row.label} <span className="font-normal text-muted">({row.unit}, ±{row.span.toFixed(row.span < 10 ? 1 : 0)})</span>
            </span>
            <span className="flex gap-3">
              {row.axes.map((a) => (
                <span key={a} className="flex items-center gap-1">
                  <span aria-hidden className="h-0.5 w-3 rounded" style={{ background: AXIS_COLORS[a] }} />
                  {a === 'x' || a === 'y' || a === 'z' ? a.toUpperCase() : a}
                </span>
              ))}
            </span>
          </div>
          <div className="relative rounded-lg border border-border bg-surface-2">
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-28 w-full" aria-hidden>
              <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="currentColor" className="text-border-strong" strokeDasharray="4 6" vectorEffect="non-scaling-stroke" />
              {row.lines.map((l) => (
                <polyline key={l.axis} points={l.points} fill="none" stroke={AXIS_COLORS[l.axis]} strokeWidth="2" vectorEffect="non-scaling-stroke" />
              ))}
            </svg>
            {/* cursor do instante */}
            <div aria-hidden className="pointer-events-none absolute inset-y-0 w-0.5 bg-fg/70" style={{ left: `${pct(time)}%` }} />
          </div>
        </div>
      ))}
      {/* poses-chave: botões sobre a régua do tempo */}
      <div className="relative h-7" role="group" aria-label="Poses-chave na linha do tempo">
        <div aria-hidden className="absolute inset-x-0 top-1/2 h-px bg-border" />
        {keys.map((k, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onSelect(i)}
            aria-label={`Pose-chave ${i + 1}, ${k.t.toFixed(1)} segundos`}
            aria-pressed={selected === i}
            className={cn(
              'absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[3px] border-2 transition',
              selected === i ? 'border-brand bg-brand' : 'border-border-strong bg-surface hover:border-brand',
            )}
            style={{ left: `${pct(k.t)}%` }}
          />
        ))}
      </div>
    </div>
  );
}
