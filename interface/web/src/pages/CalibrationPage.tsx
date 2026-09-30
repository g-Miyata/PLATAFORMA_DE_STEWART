import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Circle, History, Loader2, Play, RotateCcw, Square, Stethoscope } from 'lucide-react';
import { Tabs } from 'radix-ui';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { confirmDialog } from '@/components/ui/confirm';
import { PageHeader } from '@/components/PageLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Alert, StatusPill } from '@/components/ui/status';
import { NowPanel } from '@/features/calibration/NowPanel';
import { formatDate, ReportView } from '@/features/calibration/ReportView';
import { useCalibrationStatus } from '@/features/calibration/useCalibration';
import { useCanCommand } from '@/features/control/useControlGate';
import { PlatformViewer } from '@/features/platform3d/PlatformViewer';
import { mmss } from '@/features/routines/MotionStatusCard';
import { LiveTwinChart, TrialCompare } from '@/features/twin/TwinViews';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fmt } from '@/lib/pistons';
import { useConnection } from '@/stores/connection';

const PLAN_TEXT = [
  ['Home', 'A plataforma vai para a posição de repouso.'],
  ['Autoteste de cada pistão', 'Um de cada vez sobe e desce até 30 mm em torno do home, com os outros parados. Mede velocidade, atraso, erro final e ruído e aponta pistão travado, invertido, lento ou ruidoso.'],
  ['Curso inteiro', 'Os seis juntos sobem e descem quase toda a altura, para medir os motores nos dois sentidos.'],
  ['Recalibração', 'Um simulador “sombra” recebeu os mesmos comandos. O sistema ajusta a velocidade máxima e a zona morta de cada motor e confere se o modelo novo reproduz melhor.'],
  ['Relatório', 'Fica salvo com data. Os parâmetros novos só entram se você aplicar.'],
] as const;

/** Relatório escolhido + o anterior a ele (para comparar). */
function useReportWithPrevious(id: string | null) {
  const list = useQuery({ queryKey: ['calibration-reports'], queryFn: api.calibrationReports });
  const idx = id ? (list.data?.findIndex((r) => r.id === id) ?? -1) : -1;
  const prevId = idx >= 0 ? list.data?.[idx + 1]?.id : undefined;
  const report = useQuery({ queryKey: ['calibration-report', id], queryFn: () => api.calibrationReport(id!), enabled: !!id });
  const previous = useQuery({ queryKey: ['calibration-report', prevId], queryFn: () => api.calibrationReport(prevId!), enabled: !!prevId });
  return { report: report.data ?? null, previous: previous.data ?? null, loading: report.isLoading };
}

function Progress({ value, label }: { value: number; label: string }) {
  const pct = Math.round(value * 100);
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted">{pct}%</span>
      </div>
      <div role="progressbar" aria-label="Progresso da calibração" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-3 overflow-hidden rounded-full bg-surface-3">
        <div className="h-full rounded-full bg-brand transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function RunTab({ onShowReport }: { onShowReport: (id: string) => void }) {
  const qc = useQueryClient();
  const canCommand = useCanCommand();
  const simulated = useConnection((s) => s.serial.simulated);
  const { data: st } = useCalibrationStatus();
  const running = !!st?.running;
  const [now, setNow] = useState(() => Date.now());
  const lastSeen = useRef<string | null>(null);
  const { report, previous } = useReportWithPrevious(!running && st?.phase === 'concluido' ? st.report_id : null);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  // terminou: atualiza a lista de relatórios e avisa uma vez
  useEffect(() => {
    if (st?.phase === 'concluido' && st.report_id && st.report_id !== lastSeen.current) {
      lastSeen.current = st.report_id;
      void qc.invalidateQueries({ queryKey: ['calibration-reports'] });
    }
  }, [st?.phase, st?.report_id, qc]);

  async function start() {
    const ok = await confirmDialog({
      title: 'Começar a calibração?',
      description: 'A plataforma vai se mover sozinha por 3 a 4 minutos. Rotinas, joystick, IMU e simulação de voo em andamento serão interrompidos. Deixe a área em volta livre; Esc para tudo.',
      confirmLabel: 'Começar',
      tone: 'warning',
    });
    if (!ok) return;
    try {
      await api.calibrationStart();
      await qc.invalidateQueries({ queryKey: ['calibration-status'] });
    } catch (err) {
      toast.error('Não foi possível iniciar', { description: (err as Error).message });
    }
  }

  async function cancel() {
    try {
      await api.calibrationCancel();
      toast.info('Calibração interrompida', { description: 'A plataforma voltou ao home.' });
    } finally {
      await qc.invalidateQueries({ queryKey: ['calibration-status'] });
    }
  }

  const steps = st?.steps ?? [];
  const current = st?.label ? steps.indexOf(st.label) : -1;
  const elapsed = st?.started_at ? now / 1000 - st.started_at : 0;

  return (
    <div className="space-y-5">
      <Card
        title="Calibração da bancada"
        icon={<Stethoscope aria-hidden />}
        actions={running ? <StatusPill tone="info">Em andamento</StatusPill> : undefined}
        description="Autoteste dos seis pistões e recalibração do simulador, num processo só. Bom para rodar antes de cada aula."
      >
        {running && st ? (
          <div className="space-y-4">
            <Progress value={st.progress} label={st.label ?? 'Preparando'} />
            <p className="text-sm text-muted tabular-nums">{mmss(elapsed)} decorridos · Esc ou Parar interrompem sem mover</p>
            <NowPanel st={st} />
            <ol className="grid gap-1 text-sm sm:grid-cols-2" aria-label="Etapas">
              {steps.map((label, i) => (
                <li key={label} className={cn('flex items-center gap-2', i === current ? 'font-semibold' : i < current ? 'text-muted' : 'text-muted/70')} aria-current={i === current ? 'step' : undefined}>
                  {i < current || st.phase === 'ajuste' || st.phase === 'relatorio' ? (
                    <CheckCircle2 aria-hidden className="size-4 text-brand" />
                  ) : i === current ? (
                    <Loader2 aria-hidden className="size-4 animate-spin text-brand motion-reduce:animate-none" />
                  ) : (
                    <Circle aria-hidden className="size-4" />
                  )}
                  {label}
                </li>
              ))}
              {(st.phase === 'ajuste' || st.phase === 'relatorio') && (
                <li className="flex items-center gap-2 font-semibold" aria-current="step">
                  <Loader2 aria-hidden className="size-4 animate-spin text-brand motion-reduce:animate-none" />
                  {st.label}
                </li>
              )}
            </ol>
            <Button variant="danger" onClick={cancel}>
              <Square aria-hidden />
              Cancelar e voltar ao home
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <ol className="space-y-2 text-sm">
              {PLAN_TEXT.map(([title, text], i) => (
                <li key={title} className="flex gap-3">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-success-soft text-xs font-semibold text-brand-text">{i + 1}</span>
                  <span>
                    <span className="font-semibold">{title}.</span> {text}
                  </span>
                </li>
              ))}
            </ol>
            <Alert tone="warning" title="Antes de começar">
              Deixe o tampo livre (sem carga e sem nada que possa cair). Durante a calibração todas as outras funções ficam bloqueadas. <kbd>Esc</kbd> para tudo na hora.
            </Alert>
            {st?.phase === 'cancelado' && <Alert tone="info">A última calibração foi interrompida.</Alert>}
            {st?.phase === 'erro' && <Alert tone="danger" title="A última calibração falhou">{st.error}</Alert>}
            {!canCommand && <Alert tone="info">Conecte a bancada (ou o simulador) no topo para calibrar.</Alert>}
            <Button variant="primary" size="lg" onClick={start} disabled={!canCommand}>
              {st?.phase === 'concluido' ? <RotateCcw aria-hidden /> : <Play aria-hidden />}
              {st?.phase === 'concluido' ? 'Calibrar de novo' : simulated ? 'Iniciar calibração (simulador)' : 'Iniciar calibração'}
            </Button>
          </div>
        )}
      </Card>

      {running && (
        <div className="grid gap-5 xl:grid-cols-2">
          <PlatformViewer source="live" title="Plataforma agora" showTable={false} canvasClassName="h-72 sm:h-80" />
          <LiveTwinChart />
        </div>
      )}
      {!running && report && (
        <>
          <ReportView report={report} previous={previous} />
          <Button variant="ghost" onClick={() => onShowReport(report.id)}>
            <History aria-hidden />
            Ver todos os relatórios
          </Button>
        </>
      )}
    </div>
  );
}

function ReportsTab({ selected, onSelect }: { selected: string | null; onSelect: (id: string) => void }) {
  const list = useQuery({ queryKey: ['calibration-reports'], queryFn: api.calibrationReports });
  const id = selected ?? list.data?.[0]?.id ?? null;
  const { report, previous } = useReportWithPrevious(id);
  return (
    <div className="grid gap-5 xl:grid-cols-[18rem_minmax(0,1fr)]">
      <Card title="Relatórios">
        {list.data?.length ? (
          <ul className="space-y-1">
            {list.data.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onSelect(r.id)}
                  aria-current={r.id === id ? 'true' : undefined}
                  className={cn('w-full rounded-lg px-3 py-2 text-left text-sm transition-colors', r.id === id ? 'bg-primary text-on-primary' : 'hover:bg-surface-2')}
                >
                  <span className="block font-medium">{formatDate(r.created_at)}</span>
                  <span className={cn('text-xs', r.id === id ? 'opacity-90' : 'text-muted')}>
                    {r.simulated ? 'Simulador' : 'Bancada'} · {r.alerts ? `${r.alerts} alerta(s)` : 'sem alertas'}
                    {r.has_changes && ` · ${fmt(r.improvement_pct, 0)}% melhor`}
                    {r.applied && ' · aplicado'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Nenhuma calibração ainda.</p>
        )}
      </Card>
      <div className="min-w-0">{report ? <ReportView report={report} previous={previous} /> : <p className="text-sm text-muted">Escolha um relatório.</p>}</div>
    </div>
  );
}

export default function CalibrationPage() {
  const [tab, setTab] = useState('calibrar');
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <>
      <PageHeader
        title="Calibração"
        description="Autoteste dos pistões e recalibração do simulador (gêmeo digital) num processo só, com relatório datado para comparar com as calibrações anteriores."
      />
      <Tabs.Root value={tab} onValueChange={setTab} className="space-y-5">
        <Tabs.List aria-label="Seções" className="inline-flex flex-wrap gap-1 rounded-lg border border-border bg-surface p-1">
          {(
            [
              ['calibrar', 'Calibrar'],
              ['relatorios', 'Relatórios'],
              ['csv', 'Comparar ensaio (CSV)'],
            ] as const
          ).map(([v, label]) => (
            <Tabs.Trigger key={v} value={v} className="rounded-md px-4 py-1.5 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-on-primary">
              {label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <Tabs.Content value="calibrar" className="outline-none">
          <RunTab
            onShowReport={(id) => {
              setSelected(id);
              setTab('relatorios');
            }}
          />
        </Tabs.Content>
        <Tabs.Content value="relatorios" className="outline-none">
          <ReportsTab selected={selected} onSelect={setSelected} />
        </Tabs.Content>
        <Tabs.Content value="csv" className="outline-none">
          <TrialCompare />
        </Tabs.Content>
      </Tabs.Root>
    </>
  );
}
