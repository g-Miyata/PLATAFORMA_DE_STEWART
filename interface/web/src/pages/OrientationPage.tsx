import { useQuery } from '@tanstack/react-query';
import { Axis3d, ZoomOut } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { LiveChart, type LiveChartHandle, type SeriesDef } from '@/components/charts/LiveChart';
import { PageHeader } from '@/components/PageLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AnalysisCard } from '@/features/cueing/AnalysisCard';
import { AXIS_COLORS } from '@/features/cueing/CueCharts';
import { FlightGearPanel } from '@/features/cueing/FlightGearPanel';
import { ParamsCard } from '@/features/cueing/ParamsCard';
import { ATTITUDE_GROUPS } from '@/features/cueing/params';
import { PlatformCard, useCueingStatus } from '@/features/cueing/PlatformCard';
import { EventsCard, LiveHowToCard, useReleaseOnLeave } from '@/features/cueing/SharedCards';
import { SourcePanel } from '@/features/cueing/SourcePanel';
import { PlatformViewer } from '@/features/platform3d/PlatformViewer';
import { api } from '@/lib/api';
import { useCueing } from '@/stores/cueing';

const SERIES: SeriesDef[] = [
  { label: 'Roll avião', color: AXIS_COLORS[0], dashed: true },
  { label: 'Roll plataforma', color: AXIS_COLORS[0] },
  { label: 'Pitch avião', color: AXIS_COLORS[1], dashed: true },
  { label: 'Pitch plataforma', color: AXIS_COLORS[1] },
];

/** Roll e pitch do avião × da plataforma (nariz para cima positivo nos dois). */
function OrientationChart() {
  const chart = useRef<LiveChartHandle>(null);
  const params = useQuery({ queryKey: ['cueing-params'], queryFn: api.cueingParams, staleTime: Infinity });
  const invert = params.data?.params.invert_pitch ?? false;

  useEffect(() => {
    let t0: number | null = null;
    return useCueing.subscribe((s, prev) => {
      const m = s.tick;
      if (!m || m === prev.tick || !m.aircraft || m.profile !== 'attitude') return;
      t0 ??= m.ts;
      // pitch positivo da plataforma abaixa a frente: troca o sinal para comparar com o avião
      const platformPitch = invert ? m.pose.pitch : -m.pose.pitch;
      chart.current?.push(m.ts - t0, [m.aircraft.roll, m.pose.roll, m.aircraft.pitch, platformPitch]);
    });
  }, [invert]);

  return (
    <Card
      title="Roll e pitch"
      icon={<Axis3d aria-hidden />}
      description="Tracejado: avião. Contínuo: plataforma, limitada pelo ângulo máximo e pela velocidade dos pistões."
      actions={
        <Button size="sm" variant="ghost" onClick={() => chart.current?.resetZoom()}>
          <ZoomOut aria-hidden />
          Zoom original
        </Button>
      }
    >
      <LiveChart ref={chart} series={SERIES} yLabel="°" windowS={30} maxPoints={1800} ariaLabel="Roll e pitch do avião (tracejado) e da plataforma (contínuo)." />
    </Card>
  );
}

/** Orientação do avião: a plataforma copia roll e pitch do FlightGear (ao vivo ou voo gravado). */
export default function OrientationPage() {
  const status = useCueingStatus();
  const tick = useCueing((s) => s.tick);
  const [analysis, setAnalysis] = useState<string | null>(null);
  useReleaseOnLeave('attitude');
  const pose = tick?.profile === 'attitude' ? tick.pose : null;

  return (
    <>
      <PageHeader
        title="Orientação do avião"
        description="A plataforma copia a inclinação do avião (roll e pitch), limitada a ±12°, sem simular acelerações. Rode o FlightGear para ver o ERJ145 ao lado, engate e dê Play num voo gravado, ou voe ao vivo."
      />
      <div className="grid gap-5 2xl:grid-cols-2">
        <FlightGearPanel profile="attitude" />
        <Card>
          <PlatformViewer target={pose} targetLabel="Orientação do avião" canvasClassName="h-96 sm:h-[30rem]" expandable />
        </Card>
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <PlatformCard profile="attitude" />
        <SourcePanel status={status.data} profile="attitude" onAnalyze={setAnalysis} />
        <EventsCard />
      </div>
      <div className="mt-5 space-y-5">
        {analysis && (
          <AnalysisCard flightId={analysis} z0={status.data?.params.att_z ?? 540} profile="attitude" onClose={() => setAnalysis(null)} />
        )}
        <OrientationChart />
        <ParamsCard
          title="Ajuste da orientação"
          description="As mudanças valem na hora, inclusive com a plataforma engatada."
          groups={ATTITUDE_GROUPS}
          showPresets={false}
        />
        <LiveHowToCard />
      </div>
    </>
  );
}
