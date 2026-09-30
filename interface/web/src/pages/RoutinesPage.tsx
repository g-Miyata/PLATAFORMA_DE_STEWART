import { useQueryClient } from '@tanstack/react-query';
import { Play } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader, WithViewer } from '@/components/PageLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SliderField } from '@/components/ui/field';
import { Alert } from '@/components/ui/status';
import { useCanCommand } from '@/features/control/useControlGate';
import { useGeometry } from '@/features/platform3d/geometry';
import { MotionStatusCard, useMotionStatus } from '@/features/routines/MotionStatusCard';
import { ACTUATOR_SPEED_MM_S, analyzeRoutine, buildRequest, PRESETS, type Preset } from '@/features/routines/routines';
import { TrackingChart } from '@/features/routines/TrackingChart';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fmt } from '@/lib/pistons';
import { useConnection } from '@/stores/connection';


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
        ? `A trajetória passa dos limites da bancada (${a.reason}). Reduza a amplitude.`
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

export default function RoutinesPage() {
  const status = useMotionStatus();
  const running = !!status.data?.running;
  return (
    <>
      <PageHeader
        title="Rotinas de movimento"
        description="Movimentos automáticos gerados pelo backend a 60 Hz. No modelo 3D, o fantasma verde é a pose comandada e a plataforma sólida é a medida."
      />
      <WithViewer viewer={{ followMotion: true, targetLabel: 'Comandada' }}>
        <MotionStatusCard />
        <RoutinePicker running={running} />
        <TrackingChart />
      </WithViewer>
    </>
  );
}
