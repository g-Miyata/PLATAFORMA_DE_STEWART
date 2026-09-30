import {
  Chart,
  Decimation,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
  type ChartDataset,
} from 'chart.js';
import zoomPlugin from 'chartjs-plugin-zoom';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { useUi } from '@/stores/ui';

Chart.register(LineController, LineElement, PointElement, LinearScale, Tooltip, Legend, Decimation, zoomPlugin);

export interface SeriesDef {
  label: string;
  color: string;
  dashed?: boolean;
  hidden?: boolean;
}

export interface LiveChartHandle {
  /** acrescenta um ponto em cada série (NaN = sem valor) */
  push: (t: number, values: number[]) => void;
  clear: () => void;
  resetZoom: () => void;
  setHidden: (index: number, hidden: boolean) => void;
}

interface LiveChartProps {
  series: SeriesDef[];
  /** janela visível em segundos (o eixo X acompanha o último ponto) */
  windowS?: number;
  maxPoints?: number;
  yLabel: string;
  xLabel?: string;
  /** descrição para leitores de tela (o gráfico em si é decorativo; os números estão em tabela) */
  ariaLabel: string;
  className?: string;
}

function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Gráfico de linhas em tempo real: atualizado de forma imperativa (sem re-render do React). */
export const LiveChart = forwardRef<LiveChartHandle, LiveChartProps>(function LiveChart(
  { series, windowS = 30, maxPoints = 1200, yLabel, xLabel = 'Tempo (s)', ariaLabel, className },
  ref,
) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const chart = useRef<Chart<'line', { x: number; y: number }[]> | null>(null);
  const pending = useRef(false);
  const theme = useUi((s) => s.theme);

  useEffect(() => {
    if (!canvas.current) return;
    const datasets: ChartDataset<'line', { x: number; y: number }[]>[] = series.map((s) => ({
      label: s.label,
      data: [],
      borderColor: s.color,
      backgroundColor: s.color,
      borderWidth: s.dashed ? 1.5 : 2,
      borderDash: s.dashed ? [6, 4] : undefined,
      pointRadius: 0,
      tension: 0,
      hidden: s.hidden,
      spanGaps: true,
    }));
    chart.current = new Chart<'line', { x: number; y: number }[]>(canvas.current, {
      type: 'line',
      data: { datasets },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        parsing: false,
        normalized: true,
        interaction: { mode: 'nearest', intersect: false, axis: 'x' },
        scales: {
          x: { type: 'linear', title: { display: true, text: xLabel }, ticks: { maxTicksLimit: 8 } },
          y: { type: 'linear', title: { display: true, text: yLabel } },
        },
        plugins: {
          legend: { display: false },
          decimation: { enabled: true, algorithm: 'lttb', samples: 400 },
          tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${Number(c.parsed.y).toFixed(2)}` } },
          zoom: {
            zoom: { wheel: { enabled: true, modifierKey: 'ctrl' }, pinch: { enabled: true }, drag: { enabled: false }, mode: 'x' },
            pan: { enabled: true, mode: 'x' },
          },
        },
      },
    });
    return () => {
      chart.current?.destroy();
      chart.current = null;
    };
    // as séries são fixas por gráfico; mudar a lista exige remontar (key)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // cores do eixo/grade seguem o tema
  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    const text = cssVar('--c-text-muted');
    const grid = cssVar('--c-border');
    for (const axis of Object.values(c.options.scales ?? {})) {
      if (!axis) continue;
      axis.ticks = { ...axis.ticks, color: text };
      axis.grid = { ...axis.grid, color: grid };
      if ('title' in axis && axis.title) axis.title.color = text;
    }
    c.update('none');
  }, [theme]);

  useImperativeHandle(ref, () => ({
    push(t, values) {
      const c = chart.current;
      if (!c) return;
      c.data.datasets.forEach((ds, i) => {
        const v = values[i];
        if (v === undefined || Number.isNaN(v)) return;
        ds.data.push({ x: t, y: v });
        if (ds.data.length > maxPoints) ds.data.splice(0, ds.data.length - maxPoints);
      });
      // agrupa várias amostras num único redesenho por frame
      if (!pending.current) {
        pending.current = true;
        requestAnimationFrame(() => {
          pending.current = false;
          const ch = chart.current;
          if (!ch) return;
          if (!ch.isZoomedOrPanned()) {
            ch.options.scales!.x!.min = Math.max(0, t - windowS);
            ch.options.scales!.x!.max = Math.max(windowS, t);
          }
          ch.update('none');
        });
      }
    },
    clear() {
      const c = chart.current;
      if (!c) return;
      c.data.datasets.forEach((ds) => (ds.data = []));
      c.resetZoom();
      c.update('none');
    },
    resetZoom() {
      chart.current?.resetZoom();
    },
    setHidden(index, hidden) {
      const c = chart.current;
      if (!c) return;
      c.setDatasetVisibility(index, !hidden);
      c.update('none');
    },
  }));

  return (
    <div className={className ?? 'relative h-72'}>
      <canvas ref={canvas} role="img" aria-label={ariaLabel} />
    </div>
  );
});
