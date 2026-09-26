import { Activity, FileUp, Gauge, Save, Sparkles, ZoomOut } from 'lucide-react';
import { Tabs } from 'radix-ui';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { toast } from 'sonner';
import { LiveChart, type LiveChartHandle, type SeriesDef } from '@/components/charts/LiveChart';
import { PageHeader } from '@/components/PageLayout';
import { PistonToggles } from '@/components/PistonToggles';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Alert, StatusPill } from '@/components/ui/status';
import { useGeometry } from '@/features/platform3d/geometry';
import { compare, type PistonMetrics } from '@/features/twin/metrics';
import { parseRoutineCsv } from '@/features/twin/routinesCsv';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fmt, PISTON_COLORS, PISTONS } from '@/lib/pistons';
import type { TwinFitResult, TwinParamKey } from '@/lib/types';
import { useConnection } from '@/stores/connection';
import { useTelemetry } from '@/stores/telemetry';

const SERIES: SeriesDef[] = [
  ...PISTON_COLORS.map((color, i) => ({ label: `P${i + 1} real`, color })),
  ...PISTON_COLORS.map((color, i) => ({ label: `P${i + 1} simulado`, color, dashed: true })),
];

const WINDOW_S = 20;

function MetricsTable({ metrics, caption }: { metrics: PistonMetrics[] | null; caption: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[28rem] text-sm tabular-nums">
        <caption className="mb-2 text-left text-xs text-muted">{caption}</caption>
        <thead>
          <tr className="text-left text-xs text-muted">
            <th className="py-1 font-medium">Pistão</th>
            <th className="font-medium">Erro RMS</th>
            <th className="font-medium">Erro máximo</th>
            <th className="font-medium">Atraso do real</th>
          </tr>
        </thead>
        <tbody>
          {PISTONS.map((p, i) => {
            const m = metrics?.[i];
            return (
              <tr key={p} className="border-t border-border">
                <td className="py-1.5 font-medium">
                  <span aria-hidden className="mr-1.5 inline-block size-2 rounded-full" style={{ background: PISTON_COLORS[i] }} />P{p}
                </td>
                <td className={cn(m && m.rms > 3 && 'text-warning')}>{m ? `${fmt(m.rms, 2)} mm` : '—'}</td>
                <td>{m ? `${fmt(m.max, 1)} mm` : '—'}</td>
                <td>{m ? `${fmt(m.lag * 1000, 0)} ms` : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ChartCard({ chart, title, description }: { chart: React.RefObject<LiveChartHandle | null>; title: string; description: string }) {
  const [visible, setVisible] = useState<boolean[]>(() => Array(6).fill(true));
  return (
    <Card
      title={title}
      description={description}
      actions={
        <Button size="sm" variant="ghost" onClick={() => chart.current?.resetZoom()}>
          <ZoomOut aria-hidden />
          Zoom original
        </Button>
      }
    >
      <LiveChart ref={chart} series={SERIES} yLabel="Curso (mm)" windowS={WINDOW_S} maxPoints={2400} ariaLabel="Gráfico do curso de cada pistão: real (linha contínua) e simulado (tracejada)." />
      <div className="mt-3">
        <PistonToggles
          visible={visible}
          onChange={(i, v) => {
            setVisible((prev) => prev.map((x, k) => (k === i ? v : x)));
            chart.current?.setHidden(i, !v);
            chart.current?.setHidden(i + 6, !v);
          }}
        />
      </div>
    </Card>
  );
}

// ---------------- ao vivo ----------------
function LiveTab() {
  const chart = useRef<LiveChartHandle>(null);
  const buf = useRef<{ t: number; real: number[]; sim: number[] }[]>([]);
  const [metrics, setMetrics] = useState<PistonMetrics[] | null>(null);
  const [hasTwin, setHasTwin] = useState(false);
  const serial = useConnection((s) => s.serial);

  useEffect(() => {
    let t0: number | null = null;
    const unsub = useTelemetry.subscribe((s, prev) => {
      const m = s.telemetry;
      if (!m || m === prev.telemetry || !m.twin) return;
      t0 ??= m.ts;
      const t = m.ts - t0;
      chart.current?.push(t, [...m.Y, ...m.twin.Y_sim]);
      buf.current.push({ t, real: m.Y, sim: m.twin.Y_sim });
      while (buf.current.length && buf.current[0].t < t - WINDOW_S) buf.current.shift();
    });
    const id = setInterval(() => {
      const b = buf.current;
      setHasTwin(b.length > 0);
      if (b.length < 20) return;
      const dt = (b[b.length - 1].t - b[0].t) / (b.length - 1);
      setMetrics(compare(b.map((r) => r.real), b.map((r) => r.sim), dt));
    }, 1000);
    return () => {
      unsub();
      clearInterval(id);
    };
  }, []);

  return (
    <div className="space-y-5">
      {!serial.connected ? (
        <Alert tone="info" title="Sem conexão">
          Conecte a bancada (ou o simulador) no topo. Com a bancada real, o gêmeo recebe os mesmos comandos e roda em paralelo; mova a plataforma em qualquer página e volte aqui.
        </Alert>
      ) : serial.simulated ? (
        <Alert tone="info" title="Conectado ao simulador">
          A comparação fica simulador × simulador (quase idênticos): serve para conhecer a ferramenta. Com a bancada real, a diferença mostra o que o modelo ainda não captura.
        </Alert>
      ) : null}
      <ChartCard chart={chart} title="Real × simulado" description={`Últimos ${WINDOW_S} s. Linha contínua é o medido; tracejada é o simulador sombra com os mesmos comandos.`} />
      <Card title="Diferença" icon={<Activity aria-hidden />} actions={hasTwin ? <StatusPill tone="success">Recebendo</StatusPill> : <StatusPill tone="neutral">Sem dados</StatusPill>}>
        <MetricsTable metrics={metrics} caption={`Janela dos últimos ${WINDOW_S} s. Atraso por correlação cruzada das velocidades.`} />
      </Card>
      <RecalibrateCard />
    </div>
  );
}

const PARAM_LABEL: Record<TwinParamKey, string> = {
  vmax_adv_mm_s: 'vmax avanço (mm/s)',
  vmax_ret_mm_s: 'vmax recuo (mm/s)',
  deadzone_adv_pwm: 'zona morta avanço (PWM)',
  deadzone_ret_pwm: 'zona morta recuo (PWM)',
};

function RecalibrateCard() {
  const [result, setResult] = useState<TwinFitResult | null>(null);
  const [current, setCurrent] = useState<Record<TwinParamKey, number[]> | null>(null);
  const [busy, setBusy] = useState(false);

  async function fit() {
    setBusy(true);
    try {
      const [status, r] = await Promise.all([api.twinStatus(), api.twinFit()]);
      setCurrent(status.params);
      setResult(r);
    } catch (err) {
      toast.error('Não foi possível recalibrar', { description: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!result || !window.confirm('Salvar os novos parâmetros do simulador? O arquivo atual fica guardado como sim_params.json.bak.')) return;
    try {
      const r = await api.twinSaveParams(result.proposed);
      toast.success('Parâmetros salvos', { description: `Cópia anterior: ${r.backup}. O simulador usa os novos valores na próxima conexão.` });
      setResult(null);
    } catch (err) {
      toast.error('Não foi possível salvar', { description: (err as Error).message });
    }
  }

  return (
    <Card
      title="Recalibrar o simulador"
      icon={<Sparkles aria-hidden />}
      description="Identifica a velocidade máxima e a zona morta de cada motor a partir do PWM e da velocidade medidos (últimos 5 min), e confere reproduzindo os mesmos comandos no simulador."
      actions={
        <Button variant="primary" onClick={fit} disabled={busy}>
          <Gauge aria-hidden />
          {busy ? 'Calculando…' : 'Recalibrar com os dados ao vivo'}
        </Button>
      }
    >
      {result && current ? (
        <div className="space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm tabular-nums">
              <caption className="mb-2 text-left text-xs text-muted">
                {result.samples} amostras. Antes → depois; “ajuste” é o quanto o modelo explica a velocidade medida (100% = perfeito).
              </caption>
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="py-1 font-medium">Pistão</th>
                  {(Object.keys(PARAM_LABEL) as TwinParamKey[]).map((k) => (
                    <th key={k} className="font-medium">
                      {PARAM_LABEL[k]}
                    </th>
                  ))}
                  <th className="font-medium">Ajuste</th>
                  <th className="font-medium">Erro RMS</th>
                </tr>
              </thead>
              <tbody>
                {result.pistons.map((p, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="py-1.5 font-medium">P{i + 1}</td>
                    {(Object.keys(PARAM_LABEL) as TwinParamKey[]).map((k) => (
                      <td key={k}>
                        {fmt(current[k][i], 1)} → <span className={cn(p.ok && 'font-semibold')}>{fmt(result.proposed[k][i], 1)}</span>
                      </td>
                    ))}
                    <td>{p.ok ? `${fmt(p.fit_before, 0)}% → ${fmt(p.fit_after, 0)}%` : <span className="text-muted">{p.reason}</span>}</td>
                    <td>
                      {fmt(result.rms_before[i], 2)} → {fmt(result.rms_after[i], 2)} mm
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button variant="secondary" onClick={apply} disabled={!result.pistons.some((p) => p.ok)}>
            <Save aria-hidden />
            Aplicar parâmetros
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted">Mova a plataforma por alguns segundos (Rotinas, Joystick…) para ter dados nos dois sentidos de cada pistão.</p>
      )}
    </Card>
  );
}

// ---------------- ensaio (CSV) ----------------
function TrialTab() {
  const geometry = useGeometry();
  const chart = useRef<LiveChartHandle>(null);
  const file = useRef<HTMLInputElement>(null);
  const [metrics, setMetrics] = useState<PistonMetrics[] | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setBusy(true);
    try {
      const d = parseRoutineCsv(await f.text(), geometry.stroke_min);
      const t0 = d.t[0];
      const t = d.t.map((x) => x - t0);
      const { Y_sim } = await api.twinSimulate({ t, sp: d.sp, y0: d.y[0] });
      chart.current?.clear();
      t.forEach((x, i) => chart.current?.push(x, [...d.y[i], ...Y_sim[i]]));
      chart.current?.resetZoom();
      const dt = t[t.length - 1] / (t.length - 1);
      setMetrics(compare(d.y, Y_sim, dt));
      setInfo(`${f.name}: ${t.length} amostras, ${fmt(t[t.length - 1], 1)} s`);
    } catch (err) {
      toast.error('Não foi possível comparar', { description: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card
        title="Comparar um ensaio gravado"
        icon={<FileUp aria-hidden />}
        description="Importe o CSV exportado em Rotinas → “Comandado × medido”. O simulador reproduz os mesmos comandos a partir da posição inicial medida."
        actions={
          <>
            <Button variant="primary" onClick={() => file.current?.click()} disabled={busy}>
              <FileUp aria-hidden />
              {busy ? 'Simulando…' : 'Importar CSV'}
            </Button>
            <input ref={file} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} aria-label="Importar CSV de ensaio" />
          </>
        }
      >
        <p className="text-sm text-muted" role="status">
          {info ?? 'Funciona sem a bancada: basta o arquivo de um ensaio anterior.'}
        </p>
      </Card>
      <ChartCard chart={chart} title="Ensaio × simulado" description="Linha contínua é o medido no ensaio; tracejada é o simulador com os parâmetros atuais." />
      <Card title="Diferença" icon={<Activity aria-hidden />}>
        <MetricsTable metrics={metrics} caption="Ensaio inteiro." />
      </Card>
    </div>
  );
}

export default function TwinPage() {
  const [tab, setTab] = useState('vivo');
  return (
    <>
      <PageHeader
        title="Gêmeo digital"
        description="Compara a bancada com o simulador: o mesmo comando vai para os dois e as curvas mostram onde o modelo acerta e onde erra. Dá também para recalibrar o simulador com os dados medidos."
      />
      <Tabs.Root value={tab} onValueChange={setTab} className="space-y-5">
        <Tabs.List aria-label="Fonte dos dados" className="inline-flex gap-1 rounded-lg border border-border bg-surface p-1">
          <Tabs.Trigger value="vivo" className="rounded-md px-4 py-1.5 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-on-primary">
            Ao vivo
          </Tabs.Trigger>
          <Tabs.Trigger value="csv" className="rounded-md px-4 py-1.5 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-on-primary">
            Ensaio (CSV)
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="vivo" className="outline-none">
          <LiveTab />
        </Tabs.Content>
        <Tabs.Content value="csv" className="outline-none">
          <TrialTab />
        </Tabs.Content>
      </Tabs.Root>
    </>
  );
}
