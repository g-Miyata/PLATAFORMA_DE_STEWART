import { useEffect, useState } from 'react';
import { StatusPill } from '@/components/ui/status';
import { useThrottledTelemetry } from '@/features/control/useThrottled';
import { cn } from '@/lib/cn';
import { solvePose, strokeStatus, type LegStatus } from '@/lib/kinematics';
import { uiLimits } from '@/lib/limits';
import { fmt, PISTON_COLORS } from '@/lib/pistons';
import type { PlatformGeometry, Pose } from '@/lib/types';
import { useTelemetry } from '@/stores/telemetry';
import type { ViewerSource } from './sceneState';

const STATUS_TEXT: Record<LegStatus, string> = { ok: 'no curso', near: 'perto do limite', invalid: 'fora do curso' };
const STATUS_CLASS: Record<LegStatus, string> = { ok: 'text-brand-text', near: 'text-warning', invalid: 'text-danger' };
const AXES = ['x', 'y', 'z', 'roll', 'pitch', 'yaw'] as const;
const unitOf = (k: (typeof AXES)[number]) => (k.length === 1 ? 'mm' : '°');

/** Taxa de telemetria (Hz) e idade da última amostra (s), medidas fora do render. */
function useTelemetryHealth() {
  const [health, setHealth] = useState({ rate: 0, age: null as number | null });
  useEffect(() => {
    const stamps: number[] = [];
    const unsub = useTelemetry.subscribe((s, prev) => {
      if (s.telemetry && s.telemetry !== prev.telemetry) stamps.push(performance.now());
    });
    const id = setInterval(() => {
      const now = performance.now();
      while (stamps.length && now - stamps[0] > 2000) stamps.shift();
      const t = useTelemetry.getState().telemetry;
      setHealth({ rate: stamps.length / 2, age: t ? Math.max(0, Date.now() / 1000 - t.ts) : null });
    }, 500);
    return () => {
      unsub();
      clearInterval(id);
    };
  }, []);
  return health;
}

function Section({ title, children, actions }: { title: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {actions}
      </div>
      {children}
    </section>
  );
}

interface ViewerDetailsProps {
  source: ViewerSource;
  target: Pose | null;
  /** pose calculada para comparar com a real (erro de seguimento) */
  reference?: Pose | null;
  geometry: PlatformGeometry;
}

/** Dados extras do modelo em tela cheia: pose, atuadores, telemetria e erro contra a calculada. */
export function ViewerDetails({ source, target, reference, geometry }: ViewerDetailsProps) {
  const telemetry = useThrottledTelemetry((s) => s.telemetry, 250);
  const health = useTelemetryHealth();
  const isLive = source === 'live' || (source === 'auto' && !!telemetry?.pose_live && health.age !== null && health.age < 1.5);

  const pose: Pose | null = isLive ? (telemetry?.pose_live ?? null) : target;
  const solved = pose ? solvePose(pose, geometry) : null;
  // na real, os comprimentos vêm da medida (telemetria); a pose é a estimativa por cinemática direta
  const lengths = isLive && telemetry ? telemetry.actuator_lengths_abs : (solved?.lengths ?? null);
  // na real só há os comprimentos medidos: curso de operação; na prevista, a checagem completa
  const status = isLive ? lengths?.map((l) => strokeStatus(l, geometry)) : solved?.status;
  const refLengths = isLive && reference ? solvePose(reference, geometry).lengths : null;
  const range = geometry.stroke_max - geometry.stroke_min;
  const legErrors = lengths && refLengths ? lengths.map((l, i) => l - refLengths[i]) : null;
  const rmsError = legErrors ? Math.sqrt(legErrors.reduce((a, e) => a + e * e, 0) / legErrors.length) : null;

  if (!pose || !lengths || !status) {
    return <p className="text-sm text-muted">Sem dados: conecte o simulador ou a porta serial para ver a telemetria.</p>;
  }

  const allValid = status.every((s) => s !== 'invalid');

  return (
    <div className="space-y-4 text-sm">
      <Section title={isLive ? 'Pose estimada (cinemática direta)' : 'Pose calculada'} actions={allValid ? <StatusPill tone="success">Válida</StatusPill> : <StatusPill tone="danger">Fora do curso</StatusPill>}>
        <dl className="grid grid-cols-3 gap-2 tabular-nums">
          {AXES.map((k) => (
            <div key={k} className="rounded-lg bg-surface-2 px-2 py-1.5">
              <dt className="text-xs uppercase text-muted">{k}</dt>
              <dd className="font-semibold">{fmt(pose[k], k.length === 1 ? 1 : 2, unitOf(k))}</dd>
              {isLive && reference && (
                <dd className="text-xs text-muted">Δ {fmt(pose[k] - reference[k], k.length === 1 ? 1 : 2, unitOf(k))}</dd>
              )}
            </div>
          ))}
        </dl>
        {isLive && reference && <p className="mt-2 text-xs text-muted">Δ = real − calculada.</p>}
      </Section>

      {isLive && telemetry && (
        <Section title="Telemetria">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            <dt className="text-muted">Taxa</dt>
            <dd className="font-semibold tabular-nums">{fmt(health.rate, 0, 'Hz')}</dd>
            <dt className="text-muted">Última amostra</dt>
            <dd className="font-semibold tabular-nums">{health.age === null ? '—' : `há ${fmt(health.age, 2, 's')}`}</dd>
            <dt className="text-muted">Formato</dt>
            <dd className="font-semibold">{telemetry.format === 'standard' ? 'padrão (sem IMU)' : telemetry.format.toUpperCase()}</dd>
            <dt className="text-muted">Setpoint P1</dt>
            <dd className="font-semibold tabular-nums">{fmt(telemetry.sp_mm, 1, 'mm')}</dd>
            {rmsError !== null && (
              <>
                <dt className="text-muted">Erro RMS das pernas</dt>
                <dd className="font-semibold tabular-nums">{fmt(rmsError, 2, 'mm')}</dd>
              </>
            )}
          </dl>
        </Section>
      )}

      <Section title="Atuadores">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[26rem] whitespace-nowrap tabular-nums">
            <caption className="sr-only">Dados de cada atuador</caption>
            <thead>
              <tr className="text-left text-xs text-muted">
                <th scope="col" className="pb-1 pr-2 font-medium">Pistão</th>
                <th scope="col" className="pb-1 pr-2 font-medium">Comprimento</th>
                <th scope="col" className="pb-1 pr-2 font-medium">Curso</th>
                <th scope="col" className="pb-1 pr-2 font-medium">Folga</th>
                {isLive && <th scope="col" className="pb-1 pr-2 font-medium">PWM</th>}
                {legErrors && <th scope="col" className="pb-1 pr-2 font-medium">Erro</th>}
                <th scope="col" className="pb-1 font-medium">Situação</th>
              </tr>
            </thead>
            <tbody>
              {lengths.map((l, i) => {
                const stroke = l - geometry.stroke_min;
                const [opLo, opHi] = uiLimits(geometry).stroke;
                const margin = Math.min(l - opLo, opHi - l);
                return (
                  <tr key={i} className="border-t border-border">
                    <th scope="row" className="py-1.5 pr-2 text-left font-medium">
                      <span className="inline-flex items-center gap-2">
                        <span aria-hidden className="size-2.5 rounded-full" style={{ background: PISTON_COLORS[i] }} />P{i + 1}
                      </span>
                    </th>
                    <td className="py-1.5 pr-2">{fmt(l, 1, 'mm')}</td>
                    <td className="py-1.5 pr-2">
                      {fmt(stroke, 1, 'mm')} <span className="text-xs text-muted">({fmt((stroke / range) * 100, 0, '%')})</span>
                    </td>
                    <td className="py-1.5 pr-2">{fmt(margin, 1, 'mm')}</td>
                    {isLive && <td className="py-1.5 pr-2">{telemetry?.PWM[i] ?? '—'}</td>}
                    {legErrors && <td className="py-1.5 pr-2">{fmt(legErrors[i], 1, 'mm')}</td>}
                    <td className={cn('py-1.5 font-medium', STATUS_CLASS[status[i]])}>{STATUS_TEXT[status[i]]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">
          Curso do atuador de {geometry.stroke_min} a {geometry.stroke_max} mm; com a margem de segurança, a operação usa de {uiLimits(geometry).stroke[0]} a {uiLimits(geometry).stroke[1]} mm. Folga é a distância até esse limite; a situação também considera o ângulo dos cardãs e a distância entre as pernas.
          {legErrors && ' Erro = comprimento real − calculado.'}
        </p>
      </Section>
    </div>
  );
}
