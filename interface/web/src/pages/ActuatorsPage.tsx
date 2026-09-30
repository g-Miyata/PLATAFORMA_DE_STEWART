import { ArrowDown, ArrowUp, Download, Eraser, Hand, Pause, Play, Send, Square, ZoomOut } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { LiveChart, type LiveChartHandle, type SeriesDef } from '@/components/charts/LiveChart';
import { PageHeader, WithViewer } from '@/components/PageLayout';
import { PistonToggles } from '@/components/PistonToggles';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { NumberField } from '@/components/ui/field';
import { Alert } from '@/components/ui/status';
import { SerialConsole } from '@/features/actuators/SerialConsole';
import { useAutoDisable, useCanCommand } from '@/features/control/useControlGate';
import { useThrottledTelemetry } from '@/features/control/useThrottled';
import { useGeometry } from '@/features/platform3d/geometry';
import { api } from '@/lib/api';
import { uiLimits } from '@/lib/limits';
import { cn } from '@/lib/cn';
import { downloadText, timestampName, toCsv } from '@/lib/csv';
import { fmt, PISTON_COLORS, PISTONS } from '@/lib/pistons';
import { useTelemetry } from '@/stores/telemetry';

const SERIES: SeriesDef[] = [
  ...PISTON_COLORS.map((color, i) => ({ label: `Y${i + 1}`, color })),
  { label: 'SP (P1)', color: '#94a3b8', dashed: true },
];
const MAX_ROWS = 30_000; // ~15 min a 30 Hz

function TelemetryChart() {
  const chart = useRef<LiveChartHandle>(null);
  const rows = useRef<number[][]>([]);
  const t0 = useRef<number | null>(null);
  const [running, setRunning] = useState(true);
  const [visible, setVisible] = useState<boolean[]>(() => Array(6).fill(true));

  useEffect(() => {
    if (!running) return;
    return useTelemetry.subscribe((s, prev) => {
      const m = s.telemetry;
      if (!m || m === prev.telemetry) return;
      t0.current ??= m.ts;
      const t = m.ts - t0.current;
      chart.current?.push(t, [...m.Y, m.sp_mm]);
      rows.current.push([t, m.sp_mm, ...m.Y, ...m.PWM]);
      if (rows.current.length > MAX_ROWS) rows.current.splice(0, rows.current.length - MAX_ROWS);
    });
  }, [running]);

  function exportCsv() {
    if (!rows.current.length) {
      toast.info('Ainda não há dados para exportar.');
      return;
    }
    const header = ['t_s', 'SP_mm', ...PISTONS.map((p) => `Y${p}_mm`), ...PISTONS.map((p) => `PWM${p}`)];
    downloadText(timestampName('telemetria'), toCsv(header, rows.current.map((r) => r.map((v) => Number(v.toFixed(3))))));
  }

  return (
    <Card
      title="Posição dos atuadores"
      description="Curso medido de cada pistão (mm). A linha tracejada é o setpoint do pistão 1, único enviado na telemetria. Arraste para navegar e use Ctrl + roda do mouse para zoom."
      actions={
        <>
          <Button size="sm" variant={running ? 'secondary' : 'primary'} onClick={() => setRunning((r) => !r)}>
            {running ? <Pause aria-hidden /> : <Play aria-hidden />}
            {running ? 'Pausar' : 'Retomar'}
          </Button>
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
              t0.current = null;
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
        yLabel="Curso (mm)"
        ariaLabel="Gráfico do curso dos seis pistões ao longo do tempo. Os valores atuais estão na tabela de telemetria."
      />
      <div className="mt-3">
        <PistonToggles
          visible={visible}
          onChange={(i, v) => {
            setVisible((prev) => prev.map((x, k) => (k === i ? v : x)));
            chart.current?.setHidden(i, !v);
          }}
        />
      </div>
    </Card>
  );
}

function TelemetryTable() {
  const geometry = useGeometry();
  const m = useThrottledTelemetry((s) => s.telemetry, 200);
  return (
    <Card title="Telemetria" description={m ? `Setpoint P1: ${fmt(m.sp_mm, 1, 'mm')}` : 'Sem dados: conecte a serial ou o simulador.'}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[26rem] text-sm tabular-nums">
          <caption className="sr-only">Curso e PWM de cada pistão</caption>
          <thead>
            <tr className="text-left text-xs text-muted">
              <th scope="col" className="py-1 font-medium">Pistão</th>
              <th scope="col" className="py-1 font-medium">Curso</th>
              <th scope="col" className="w-2/5 py-1 font-medium">
                <span className="sr-only">Proporção do curso</span>
              </th>
              <th scope="col" className="py-1 font-medium">PWM</th>
            </tr>
          </thead>
          <tbody>
            {PISTONS.map((p, i) => {
              const y = m?.Y[i];
              const pct = y === undefined ? 0 : Math.max(0, Math.min(100, (y / (geometry.stroke_max - geometry.stroke_min)) * 100));
              return (
                <tr key={p} className="border-t border-border">
                  <th scope="row" className="py-1.5 text-left font-medium">
                    <span className="inline-flex items-center gap-2">
                      <span aria-hidden className="size-2.5 rounded-full" style={{ background: PISTON_COLORS[i] }} />P{p}
                    </span>
                  </th>
                  <td className="py-1.5">{fmt(y, 1, 'mm')}</td>
                  <td className="py-1.5 pr-3">
                    <div aria-hidden className="h-2 overflow-hidden rounded-full bg-surface-3">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: PISTON_COLORS[i] }} />
                    </div>
                  </td>
                  <td className="py-1.5">{m ? m.PWM[i] : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function SetpointsCard() {
  const canCommand = useCanCommand();
  const [global, setGlobal] = useState(90);
  const [individual, setIndividual] = useState<number[]>(() => Array(6).fill(90));
  const pushLog = useTelemetry((s) => s.pushLog);
  const geometry = useGeometry();
  // curso de operação: 10% de margem em cada ponta do curso do atuador
  const [lo, hi] = uiLimits(geometry).course;
  const clamp = (v: number) => Math.max(lo, Math.min(hi, v));

  async function send(value: number, piston?: number) {
    try {
      await api.setpoint(clamp(value), piston);
      pushLog('tx', piston ? `spmm${piston}=${clamp(value).toFixed(3)}` : `spmm=${clamp(value).toFixed(3)}`);
    } catch (err) {
      toast.error('Setpoint não enviado', { description: (err as Error).message });
    }
  }

  return (
    <Card
      title="Setpoints"
      description={`Curso desejado de ${lo} a ${hi} mm (o atuador vai de 0 a ${geometry.stroke_max - geometry.stroke_min} mm; as pontas ficam de margem). O backend também confere se a pose resultante respeita os cardãs e a folga entre pernas.`}
    >
      <div className="flex flex-wrap items-end gap-2">
        <NumberField label="Todos os pistões" value={global} onValueChange={setGlobal} min={lo} max={hi} step={1} unit="mm" className="w-40" />
        <Button variant="primary" onClick={() => send(global)} disabled={!canCommand}>
          <Send aria-hidden />
          Aplicar em todos
        </Button>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {PISTONS.map((p, i) => (
          <div key={p} className="flex items-end gap-1.5">
            <NumberField
              label={`Pistão ${p}`}
              value={individual[i]}
              onValueChange={(v) => setIndividual((prev) => prev.map((x, k) => (k === i ? v : x)))}
              min={lo}
              max={hi}
              unit="mm"
              className="min-w-0 flex-1"
            />
            <Button size="icon" variant="secondary" aria-label={`Aplicar setpoint no pistão ${p}`} onClick={() => send(individual[i], p)} disabled={!canCommand}>
              <Send aria-hidden />
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ManualCard() {
  const canCommand = useCanCommand();
  const [piston, setPiston] = useState(1);
  const [active, setActive] = useState<'A' | 'R' | null>(null);
  const pushLog = useTelemetry((s) => s.pushLog);
  // a parada de emergência já manda "OK" ao firmware
  useAutoDisable(active !== null, () => setActive(null));

  async function run(action: 'A' | 'R' | 'ok') {
    try {
      if (action !== 'ok') await api.selectPiston(piston);
      await api.manual(action);
      pushLog('tx', action === 'ok' ? 'OK' : `sel=${piston} · ${action}`);
      setActive(action === 'ok' ? null : action);
    } catch (err) {
      toast.error('Comando manual falhou', { description: (err as Error).message });
    }
  }

  return (
    <Card
      title="Comando manual"
      icon={<Hand aria-hidden />}
      description="Move um pistão em malha aberta (sem PID), para testes de bancada. Os outros ficam sem PWM até você clicar em Parar."
    >
      <fieldset disabled={active !== null}>
        <legend className="mb-2 text-sm font-medium">Pistão</legend>
        <div className="flex flex-wrap gap-2">
          {PISTONS.map((p, i) => (
            <label key={p} className="relative">
              <input
                type="radio"
                name="pistao-manual"
                value={p}
                checked={piston === p}
                onChange={() => setPiston(p)}
                className="peer sr-only"
              />
              <span
                className={cn(
                  'inline-flex h-10 min-w-12 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 text-sm font-semibold',
                  'peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
                  piston === p ? 'border-transparent bg-primary text-on-primary' : 'border-border bg-surface-2 hover:bg-surface-3',
                )}
              >
                <span aria-hidden className="size-2 rounded-full" style={{ background: PISTON_COLORS[i] }} />P{p}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant={active === 'A' ? 'primary' : 'secondary'} onClick={() => run('A')} disabled={!canCommand} aria-pressed={active === 'A'}>
          <ArrowUp aria-hidden />
          Avançar
        </Button>
        <Button variant={active === 'R' ? 'primary' : 'secondary'} onClick={() => run('R')} disabled={!canCommand} aria-pressed={active === 'R'}>
          <ArrowDown aria-hidden />
          Recuar
        </Button>
        <Button variant="danger" onClick={() => run('ok')} disabled={!canCommand}>
          <Square aria-hidden />
          Parar (voltar ao PID)
        </Button>
      </div>
      {active && (
        <Alert tone="warning" className="mt-4">
          Pistão {piston} em modo manual ({active === 'A' ? 'avançando' : 'recuando'}). Clique em Parar para voltar ao controle PID.
        </Alert>
      )}
    </Card>
  );
}

export default function ActuatorsPage() {
  const canCommand = useCanCommand();
  return (
    <>
      <PageHeader title="Atuadores e PID" description="Acompanhe o curso e o PWM de cada pistão e envie setpoints ou comandos manuais." />
      <WithViewer>
        {!canCommand && <Alert tone="info">Conecte o simulador ou a porta serial no topo da página para ver a telemetria e enviar comandos.</Alert>}
        <TelemetryChart />
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <TelemetryTable />
          <SetpointsCard />
        </div>
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <ManualCard />
          <SerialConsole />
        </div>
      </WithViewer>
    </>
  );
}
