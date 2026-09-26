import { Activity, FileUp, ZoomOut } from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent, type RefObject } from 'react';
import { toast } from 'sonner';
import { LiveChart, type LiveChartHandle, type SeriesDef } from '@/components/charts/LiveChart';
import { PistonToggles } from '@/components/PistonToggles';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useGeometry } from '@/features/platform3d/geometry';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fmt, PISTON_COLORS, PISTONS } from '@/lib/pistons';
import { useTelemetry } from '@/stores/telemetry';
import { compare, type PistonMetrics } from './metrics';
import { parseRoutineCsv } from './routinesCsv';

// Peças do gêmeo digital (real × simulado), usadas na página de Calibração.

const SERIES: SeriesDef[] = [
  ...PISTON_COLORS.map((color, i) => ({ label: `P${i + 1} real`, color })),
  ...PISTON_COLORS.map((color, i) => ({ label: `P${i + 1} simulado`, color, dashed: true })),
];

export const WINDOW_S = 20;

export function MetricsTable({ metrics, caption }: { metrics: PistonMetrics[] | null; caption: string }) {
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

export function ChartCard({ chart, title, description }: { chart: RefObject<LiveChartHandle | null>; title: string; description: string }) {
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

/** Real × simulado ao vivo (só há dados enquanto a sombra existe, isto é, durante a calibração). */
export function LiveTwinChart() {
  const chart = useRef<LiveChartHandle>(null);
  const buf = useRef<{ t: number; real: number[]; sim: number[] }[]>([]);
  const [metrics, setMetrics] = useState<PistonMetrics[] | null>(null);

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
      <ChartCard chart={chart} title="Real × simulado (ao vivo)" description={`Últimos ${WINDOW_S} s. Linha contínua é o medido; tracejada é o simulador sombra recebendo os mesmos comandos.`} />
      <Card title="Diferença agora" icon={<Activity aria-hidden />}>
        <MetricsTable metrics={metrics} caption={`Janela dos últimos ${WINDOW_S} s. Atraso por correlação cruzada das velocidades.`} />
      </Card>
    </div>
  );
}

/** Compara um ensaio exportado em Rotinas com o simulador (sem precisar da bancada). */
export function TrialCompare() {
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
