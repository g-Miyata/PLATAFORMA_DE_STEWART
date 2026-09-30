import { useQuery } from '@tanstack/react-query';
import { BarChart3, RefreshCw, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { LiveChart, type LiveChartHandle, type SeriesDef } from '@/components/charts/LiveChart';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Alert } from '@/components/ui/status';
import { api } from '@/lib/api';
import { fmt } from '@/lib/pistons';
import type { CueingAnalysis, CueingProfile } from '@/lib/types';
import { AXIS_COLORS, FORCE_SERIES, G } from './CueCharts';
import { clock } from './SourcePanel';

const POSE_SERIES: SeriesDef[] = [
  { label: 'Roll (°)', color: AXIS_COLORS[0] },
  { label: 'Pitch (°)', color: AXIS_COLORS[1] },
  { label: 'Yaw (°)', color: AXIS_COLORS[2] },
  { label: 'X (mm)', color: AXIS_COLORS[0], dashed: true },
  { label: 'Y (mm)', color: AXIS_COLORS[1], dashed: true },
  { label: 'Z − neutro (mm)', color: AXIS_COLORS[2], dashed: true },
];

function fill(chart: LiveChartHandle | null, t: number[], rows: number[][]) {
  if (!chart) return;
  chart.clear();
  t.forEach((x, i) => chart.push(x, rows.map((r) => r[i])));
  chart.resetZoom();
}

function draw(a: CueingAnalysis, force: LiveChartHandle | null, pose: LiveChartHandle | null, z0: number) {
  const s = a.series;
  const vert = (nz: number[]) => nz.map((n) => (n - 1) * G);
  fill(force, s.t, [s.ac_fx, s.pf_fx, s.ac_fy, s.pf_fy, vert(s.ac_nz), vert(s.pf_nz)]);
  fill(pose, s.t, [s.roll, s.pitch, s.yaw, s.x, s.y, s.z.map((z) => z - z0)]);
}

/** Voo inteiro passado pelo washout com os parâmetros atuais, sem mover a plataforma. */
export function AnalysisCard({ flightId, z0, profile = 'washout', onClose }: { flightId: string; z0: number; profile?: CueingProfile; onClose: () => void }) {
  const force = useRef<LiveChartHandle>(null);
  const pose = useRef<LiveChartHandle>(null);
  const q = useQuery({ queryKey: ['cueing-analysis', flightId, profile], queryFn: () => api.cueingAnalysis(flightId, profile), staleTime: 0 });

  useEffect(() => {
    if (q.data) draw(q.data, force.current, pose.current, z0);
  }, [q.data, z0]);

  const a = q.data;
  const windowS = (a?.duration_s ?? 60) + 1;
  return (
    <Card
      title={a ? `Análise: ${a.flight.name}` : 'Análise do voo'}
      icon={<BarChart3 aria-hidden />}
      description="Simula o voo inteiro com os parâmetros atuais do washout, incluindo o limite de velocidade dos pistões. Mude os parâmetros e clique em Recalcular."
      actions={
        <>
          <Button size="sm" variant="secondary" onClick={() => q.refetch()} disabled={q.isFetching}>
            <RefreshCw aria-hidden />
            {q.isFetching ? 'Calculando…' : 'Recalcular'}
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose} aria-label="Fechar análise">
            <X aria-hidden />
          </Button>
        </>
      }
    >
      {q.error && <Alert tone="danger">{(q.error as Error).message}</Alert>}
      {a && (
        <dl className="mb-4 grid grid-cols-2 gap-2 text-sm tabular-nums sm:grid-cols-4 xl:grid-cols-8">
          {[
            ['Duração', clock(a.duration_s)],
            ['Roll máx.', fmt(a.peak.roll, 1, '°')],
            ['Pitch máx.', fmt(a.peak.pitch, 1, '°')],
            ['Yaw máx.', fmt(a.peak.yaw, 1, '°')],
            ['X/Y máx.', `${fmt(a.peak.x, 0)} / ${fmt(a.peak.y, 0)} mm`],
            ['Z máx.', fmt(a.peak.z, 0, ' mm')],
            ['No limite de velocidade', fmt(a.speed_limited_pct, 0, '%')],
            ['Encolhida p/ caber', fmt(a.stroke_limited_pct, 0, '%')],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg bg-surface-2 px-2 py-1.5">
              <dt className="text-xs text-muted">{k}</dt>
              <dd className="font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="grid gap-5 2xl:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold">Forças específicas: avião × plataforma</h3>
          <LiveChart ref={force} series={FORCE_SERIES} yLabel="m/s²" windowS={windowS} maxPoints={20000} ariaLabel="Forças específicas do voo inteiro: avião tracejado, plataforma contínuo." />
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold">Pose da plataforma</h3>
          <LiveChart ref={pose} series={POSE_SERIES} yLabel="° / mm" windowS={windowS} maxPoints={20000} ariaLabel="Pose comandada ao longo do voo: ângulos contínuos, translações tracejadas." />
        </div>
      </div>
    </Card>
  );
}
