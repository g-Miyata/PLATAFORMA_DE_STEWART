import { useState } from 'react';
import { PageHeader } from '@/components/PageLayout';
import { Card } from '@/components/ui/card';
import { AnalysisCard } from '@/features/cueing/AnalysisCard';
import { CueCharts } from '@/features/cueing/CueCharts';
import { FlightGearPanel } from '@/features/cueing/FlightGearPanel';
import { ParamsCard } from '@/features/cueing/ParamsCard';
import { PlatformCard, useCueingStatus } from '@/features/cueing/PlatformCard';
import { EventsCard, LiveHowToCard, useReleaseOnLeave } from '@/features/cueing/SharedCards';
import { SourcePanel } from '@/features/cueing/SourcePanel';
import { PlatformViewer } from '@/features/platform3d/PlatformViewer';
import { useCueing } from '@/stores/cueing';

/** Simulador de voo: motion cueing (washout) com o avião voando no FlightGear ao lado. */
export default function MotionCueingPage() {
  const status = useCueingStatus();
  const tick = useCueing((s) => s.tick);
  const [analysis, setAnalysis] = useState<string | null>(null);
  useReleaseOnLeave('washout');
  const pose = tick?.profile === 'washout' ? tick.pose : null;

  return (
    <>
      <PageHeader
        title="Simulador de voo"
        description="A plataforma reproduz as sensações do voo (acelerações e rotações) com um washout clássico, respeitando o curso e a velocidade dos pistões, enquanto o ERJ145 voa no FlightGear ao lado. Rode o FlightGear, engate e dê Play num voo gravado."
      />
      <div className="grid gap-5 2xl:grid-cols-2">
        <FlightGearPanel profile="washout" />
        <Card>
          <PlatformViewer target={pose} targetLabel="Simulador de voo" canvasClassName="h-96 sm:h-[30rem]" expandable />
        </Card>
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <PlatformCard profile="washout" />
        <SourcePanel status={status.data} profile="washout" onAnalyze={setAnalysis} />
        <EventsCard />
      </div>
      <div className="mt-5 space-y-5">
        {analysis && <AnalysisCard flightId={analysis} z0={status.data?.params.z0 ?? 530} onClose={() => setAnalysis(null)} />}
        <CueCharts />
        <ParamsCard />
        <LiveHowToCard />
      </div>
    </>
  );
}
