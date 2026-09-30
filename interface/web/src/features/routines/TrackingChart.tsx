import { Download, Eraser, ZoomOut } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { LiveChart, type LiveChartHandle, type SeriesDef } from '@/components/charts/LiveChart';
import { PistonToggles } from '@/components/PistonToggles';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { downloadText, timestampName, toCsv } from '@/lib/csv';
import { PISTON_COLORS, PISTONS } from '@/lib/pistons';
import { useTelemetry } from '@/stores/telemetry';

const SERIES: SeriesDef[] = [
  ...PISTON_COLORS.map((color, i) => ({ label: `P${i + 1} medido`, color })),
  ...PISTON_COLORS.map((color, i) => ({ label: `P${i + 1} comandado`, color, dashed: true })),
];


/** Comprimento comandado × medido de cada atuador durante rotinas e trajetórias (motion_tick). */
export function TrackingChart() {
  const chart = useRef<LiveChartHandle>(null);
  const rows = useRef<(string | number)[][]>([]);
  const lastT = useRef(-1);
  const [visible, setVisible] = useState<boolean[]>(() => Array(6).fill(true));

  useEffect(
    () =>
      useTelemetry.subscribe((s, prev) => {
        const m = s.motionTick;
        if (!m || m === prev.motionTick) return;
        // o tempo voltou: é uma rotina nova, recomeça o gráfico
        if (m.t < lastT.current) chart.current?.clear();
        lastT.current = m.t;
        const real = m.actuators_real ?? Array(6).fill(NaN);
        chart.current?.push(m.t, [...real, ...m.actuators_cmd]);
        const p = m.pose_cmd;
        rows.current.push([Number(m.t.toFixed(3)), m.routine, p.x, p.y, p.z, p.roll, p.pitch, p.yaw, ...m.actuators_cmd.map((v) => Number(v.toFixed(3))), ...real.map((v) => Number(v.toFixed(3)))]);
        if (rows.current.length > 60_000) rows.current.splice(0, rows.current.length - 60_000);
      }),
    [],
  );

  function exportCsv() {
    if (!rows.current.length) return toast.info('Ainda não há dados de rotina para exportar.');
    const header = ['t_s', 'rotina', 'x_cmd', 'y_cmd', 'z_cmd', 'roll_cmd', 'pitch_cmd', 'yaw_cmd', ...PISTONS.map((p) => `L${p}_cmd_mm`), ...PISTONS.map((p) => `L${p}_real_mm`)];
    downloadText(timestampName('rotina'), toCsv(header, rows.current));
  }

  return (
    <Card
      title="Comandado × medido"
      description="Comprimento de cada atuador: linha tracejada é o comando, contínua é a medida. A distância entre as duas é o erro de seguimento."
      actions={
        <>
          <Button size="sm" variant="ghost" onClick={() => chart.current?.resetZoom()}>
            <ZoomOut aria-hidden />
            Zoom original
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              chart.current?.clear();
              rows.current = [];
            }}
          >
            <Eraser aria-hidden />
            Limpar
          </Button>
          <Button size="sm" variant="ghost" onClick={exportCsv}>
            <Download aria-hidden />
            CSV
          </Button>
        </>
      }
    >
      <LiveChart
        ref={chart}
        series={SERIES}
        yLabel="Comprimento (mm)"
        windowS={20}
        maxPoints={2400}
        ariaLabel="Gráfico do comprimento comandado e medido de cada atuador durante a rotina."
      />
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

