import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Eraser, Gauge, Play, Square, ZoomOut } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { LiveChart, type LiveChartHandle, type SeriesDef } from '@/components/charts/LiveChart';
import { PageHeader, WithViewer } from '@/components/PageLayout';
import { PistonToggles } from '@/components/PistonToggles';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SliderField } from '@/components/ui/field';
import { Alert, StatusPill } from '@/components/ui/status';
import { useCanCommand } from '@/features/control/useControlGate';
import { useGeometry } from '@/features/platform3d/geometry';
import { ACTUATOR_SPEED_MM_S, analyzeRoutine, buildRequest, PRESETS, type Preset } from '@/features/routines/routines';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { downloadText, timestampName, toCsv } from '@/lib/csv';
import { fmt, PISTON_COLORS, PISTONS } from '@/lib/pistons';
import { useConnection } from '@/stores/connection';
import { useTelemetry } from '@/stores/telemetry';

const SERIES: SeriesDef[] = [
  ...PISTON_COLORS.map((color, i) => ({ label: `P${i + 1} medido`, color })),
  ...PISTON_COLORS.map((color, i) => ({ label: `P${i + 1} comandado`, color, dashed: true })),
];

const ROUTINE_NAMES: Record<string, string> = Object.fromEntries(PRESETS.map((p) => [p.routine + (p.axis ?? ''), p.title]));

function mmss(s: number) {
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

function FeasibilityNote({ preset, values }: { preset: Preset; values: Record<string, number> }) {
  const geometry = useGeometry();
  const simulated = useConnection((s) => s.serial.simulated);
  const a = useMemo(() => analyzeRoutine(buildRequest(preset, values), geometry), [preset, values, geometry]);
  const tooFast = a.peakSpeed > ACTUATOR_SPEED_MM_S;
  return (
    <Alert
      tone={!a.withinStroke ? 'danger' : tooFast ? 'warning' : 'success'}
      title={`Velocidade de pico nos atuadores: ${fmt(a.peakSpeed, 1, 'mm/s')}`}
      className="mt-4"
    >
      {!a.withinStroke
        ? `A trajetória sai do curso (${fmt(a.minLength, 0)} a ${fmt(a.maxLength, 0)} mm; permitido ${geometry.stroke_min} a ${geometry.stroke_max} mm).`
        : tooFast
          ? `Os atuadores reais sustentam cerca de ${ACTUATOR_SPEED_MM_S} mm/s: a plataforma vai ficar atrás do comando e o movimento sai menor. ${simulated ? 'O simulador reproduz esse atraso, compare as curvas no gráfico.' : 'Teste antes no simulador.'} Reduza a amplitude ou a frequência.`
          : `Dentro do que os atuadores acompanham (~${ACTUATOR_SPEED_MM_S} mm/s). Comprimentos entre ${fmt(a.minLength, 0)} e ${fmt(a.maxLength, 0)} mm.`}
    </Alert>
  );
}

function RoutinePicker({ running }: { running: boolean }) {
  const canCommand = useCanCommand();
  const qc = useQueryClient();
  const [selectedKey, setSelectedKey] = useState(PRESETS[0].key);
  const preset = PRESETS.find((p) => p.key === selectedKey)!;
  const [valuesByPreset, setValuesByPreset] = useState<Record<string, Record<string, number>>>(() =>
    Object.fromEntries(PRESETS.map((p) => [p.key, Object.fromEntries(p.params.map((d) => [d.name, d.value]))])),
  );
  const values = valuesByPreset[preset.key];

  async function start() {
    try {
      await api.motionStart(buildRequest(preset, values));
      toast.success(`Rotina "${preset.title}" iniciada`, { description: 'A plataforma vai ao home antes de começar.' });
    } catch (err) {
      toast.error('Rotina não iniciada', { description: (err as Error).message });
    } finally {
      qc.invalidateQueries({ queryKey: ['motion-status'] });
    }
  }

  return (
    <Card title="Escolha a rotina" description="Todas partem do home, entram e saem com rampa suave, e voltam ao home no fim.">
      <div className="grid gap-6 xl:grid-cols-2">
      <fieldset disabled={running}>
        <legend className="sr-only">Rotina</legend>
        <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
          {PRESETS.map((p) => (
            <label key={p.key} className="relative block">
              <input type="radio" name="rotina" value={p.key} checked={p.key === selectedKey} onChange={() => setSelectedKey(p.key)} className="peer sr-only" />
              <span
                className={cn(
                  'block h-full cursor-pointer rounded-lg border p-3 transition-colors',
                  'peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus peer-disabled:cursor-not-allowed peer-disabled:opacity-60',
                  p.key === selectedKey ? 'border-brand bg-success-soft' : 'border-border hover:bg-surface-2',
                )}
              >
                <span className="block text-sm font-semibold">{p.title}</span>
                <span className="mt-0.5 block text-xs text-muted">{p.description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
      <fieldset className="space-y-4" disabled={running}>
        <legend className="mb-1 text-sm font-semibold">Parâmetros: {preset.title}</legend>
        {preset.params.map((d) => (
          <SliderField
            key={`${preset.key}-${d.name}`}
            label={d.label}
            value={values[d.name]}
            onValueChange={(v) => setValuesByPreset((all) => ({ ...all, [preset.key]: { ...all[preset.key], [d.name]: v } }))}
            min={d.min}
            max={d.max}
            step={d.step}
            unit={d.unit}
            unitSpoken={d.unitSpoken}
            digits={d.step < 0.1 ? 2 : 1}
          />
        ))}
      </fieldset>

      <FeasibilityNote preset={preset} values={values} />

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="primary" size="lg" onClick={start} disabled={!canCommand || running}>
          <Play aria-hidden />
          Iniciar rotina
        </Button>
      </div>
      {!canCommand && <p className="mt-2 text-sm text-muted">Conecte o simulador ou a serial para iniciar.</p>}
      </div>
      </div>
    </Card>
  );
}

function StatusCard() {
  const canCommand = useCanCommand();
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ['motion-status'], queryFn: api.motionStatus, refetchInterval: 500, enabled: canCommand });
  const s = status.data;
  const running = !!s?.running;
  const duration = s?.params?.duration_s ?? 0;
  const name = s?.routine ? (ROUTINE_NAMES[s.routine + (s.params?.axis ?? '')] ?? s.routine) : null;

  async function stop() {
    try {
      await api.motionStop();
      toast.info('Rotina parada', { description: 'A plataforma voltou ao home.' });
    } catch (err) {
      toast.error('Erro ao parar', { description: (err as Error).message });
    } finally {
      qc.invalidateQueries({ queryKey: ['motion-status'] });
    }
  }

  return (
    <Card
      title="Execução"
      icon={<Gauge aria-hidden />}
      actions={running ? <StatusPill tone="info">Rodando</StatusPill> : <StatusPill tone="neutral">Parada</StatusPill>}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm" aria-live="polite">
          {running && name ? (
            <>
              <span className="font-semibold">{name}</span> · <span className="tabular-nums">{mmss(s!.elapsed)}</span>
              {duration > 0 && <span className="text-muted tabular-nums"> de {mmss(duration)}</span>}
            </>
          ) : (
            <span className="text-muted">Nenhuma rotina em execução.</span>
          )}
        </p>
        <Button variant="danger" onClick={stop} disabled={!running}>
          <Square aria-hidden />
          Parar e voltar ao home
        </Button>
      </div>
      {running && duration > 0 && (
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-3" aria-hidden>
          <div className="h-full bg-brand transition-[width]" style={{ width: `${Math.min(100, (s!.elapsed / duration) * 100)}%` }} />
        </div>
      )}
    </Card>
  );
}

function TrackingChart() {
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

export default function RoutinesPage() {
  const canCommand = useCanCommand();
  const status = useQuery({ queryKey: ['motion-status'], queryFn: api.motionStatus, refetchInterval: 500, enabled: canCommand });
  const running = !!status.data?.running;
  return (
    <>
      <PageHeader
        title="Rotinas de movimento"
        description="Movimentos automáticos gerados pelo backend a 60 Hz. No modelo 3D, o fantasma verde é a pose comandada e a plataforma sólida é a medida."
      />
      <WithViewer viewer={{ followMotion: true, targetLabel: 'Comandada' }}>
        <StatusCard />
        <RoutinePicker running={running} />
        <TrackingChart />
      </WithViewer>
    </>
  );
}
