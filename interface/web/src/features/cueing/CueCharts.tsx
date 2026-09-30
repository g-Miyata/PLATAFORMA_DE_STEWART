import { Activity, RotateCw, ZoomOut } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { LiveChart, type LiveChartHandle, type SeriesDef } from '@/components/charts/LiveChart';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { CueingTickMessage } from '@/lib/types';
import { useCueing } from '@/stores/cueing';

export const G = 9.80665;
export const AXIS_COLORS = ['#3b82f6', '#f97316', '#14b8a6'] as const;

const pair = (names: string[]): SeriesDef[] =>
  names.flatMap((n, i) => [
    { label: `${n} avião`, color: AXIS_COLORS[i], dashed: true },
    { label: `${n} plataforma`, color: AXIS_COLORS[i] },
  ]);

export const FORCE_SERIES = pair(['Surge', 'Sway', 'Vertical']);
export const RATE_SERIES = pair(['Roll', 'Pitch', 'Yaw']);

/** Força específica em m/s², com o vertical sem o 1 g (0 = voo nivelado). */
export function forces(f: number[]): number[] {
  return [f[0], f[1], -f[2] - G];
}

function ChartCard({
  title,
  description,
  icon,
  chart,
  series,
  yLabel,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  chart: React.RefObject<LiveChartHandle | null>;
  series: SeriesDef[];
  yLabel: string;
}) {
  return (
    <Card
      title={title}
      icon={icon}
      description={description}
      actions={
        <Button size="sm" variant="ghost" onClick={() => chart.current?.resetZoom()}>
          <ZoomOut aria-hidden />
          Zoom original
        </Button>
      }
    >
      <LiveChart ref={chart} series={series} yLabel={yLabel} windowS={30} maxPoints={1800} ariaLabel={`${title}: avião (tracejado) e plataforma (contínuo).`} />
    </Card>
  );
}

/** O que o avião sente × o que a plataforma entrega, ao vivo (cueing_tick). */
export function CueCharts() {
  const forceChart = useRef<LiveChartHandle>(null);
  const rateChart = useRef<LiveChartHandle>(null);

  useEffect(() => {
    let t0: number | null = null;
    const push = (m: CueingTickMessage) => {
      if (!m.aircraft) return;
      t0 ??= m.ts;
      const t = m.ts - t0;
      const a = forces(m.aircraft.f);
      const p = forces(m.platform.f);
      forceChart.current?.push(t, [a[0], p[0], a[1], p[1], a[2], p[2]]);
      const w = m.aircraft.w;
      const pw = m.platform.w;
      rateChart.current?.push(t, [w[0], pw[0], w[1], pw[1], w[2], pw[2]]);
    };
    return useCueing.subscribe((s, prev) => {
      if (s.tick && s.tick !== prev.tick) push(s.tick);
    });
  }, []);

  return (
    <div className="grid gap-5 2xl:grid-cols-2">
      <ChartCard
        title="Forças específicas"
        icon={<Activity aria-hidden />}
        description="Tracejado: no piloto do avião. Contínuo: o que o ocupante sente na plataforma (aceleração do tampo + gravidade pela inclinação). Vertical sem o 1 g."
        chart={forceChart}
        series={FORCE_SERIES}
        yLabel="m/s²"
      />
      <ChartCard
        title="Velocidades angulares"
        icon={<RotateCw aria-hidden />}
        description="Tracejado: avião. Contínuo: plataforma. A plataforma só reproduz o início das rotações e depois volta devagar ao centro."
        chart={rateChart}
        series={RATE_SERIES}
        yLabel="°/s"
      />
    </div>
  );
}
