import { Compass, Crosshair, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader, WithViewer } from '@/components/PageLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SliderField, SwitchField } from '@/components/ui/field';
import { Alert, StatusPill } from '@/components/ui/status';
import { useAutoDisable, useCanCommand } from '@/features/control/useControlGate';
import { useThrottledTelemetry } from '@/features/control/useThrottled';
import { useGeometry } from '@/features/platform3d/geometry';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fmt } from '@/lib/pistons';
import type { Orientation, Pose } from '@/lib/types';
import { useTelemetry } from '@/stores/telemetry';

const SEND_MS = 100; // 10 Hz, como no controle original
const SENSOR_TIMEOUT_S = 2;
const ZERO: Orientation = { roll: 0, pitch: 0, yaw: 0 };

function AngleBar({ label, value, range = 20 }: { label: string; value: number; range?: number }) {
  const pct = ((Math.max(-range, Math.min(range, value)) + range) / (2 * range)) * 100;
  return (
    <div className="rounded-lg bg-surface-2 p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-lg font-semibold tabular-nums">{fmt(value, 1, '°')}</span>
      </div>
      <div aria-hidden className="relative mt-2 h-2 rounded-full bg-surface-3">
        <div className="absolute inset-y-0 left-1/2 w-px bg-border-strong" />
        <div className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand" style={{ left: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function ImuPage() {
  const geometry = useGeometry();
  const canCommand = useCanCommand();
  // só conta como "transmitindo" se a última leitura for recente
  const imu = useThrottledTelemetry((s) => (s.imu && Date.now() / 1000 - s.imu.ts < SENSOR_TIMEOUT_S ? s.imu : null), 100);
  const sensorAlive = imu !== null;
  const [source, setSource] = useState<'sensor' | 'virtual'>('virtual');
  const [virtualImu, setVirtualImu] = useState<Orientation>(ZERO);
  const [follow, setFollow] = useState(false);
  const [scale, setScale] = useState(1);
  const [z, setZ] = useState(geometry.home_z);

  // com o sensor ativo, usa ele por padrão (até o usuário escolher)
  const [touched, setTouched] = useState(false);
  const effectiveSource = touched ? source : sensorAlive ? 'sensor' : 'virtual';
  const orientation = effectiveSource === 'sensor' ? (imu?.orientation ?? ZERO) : virtualImu;
  const target: Pose = { x: 0, y: 0, z, roll: orientation.roll * scale, pitch: orientation.pitch * scale, yaw: orientation.yaw * scale };

  useAutoDisable(follow, () => setFollow(false));

  // envio a 10 Hz com a leitura mais recente
  const latest = useRef({ orientation, scale, z });
  useEffect(() => {
    latest.current = { orientation, scale, z };
  });
  const inFlight = useRef(false);
  const lastInvalidToast = useRef(0);
  useEffect(() => {
    if (!follow) return;
    const id = setInterval(async () => {
      if (inFlight.current) return;
      inFlight.current = true;
      const { orientation: o, scale: k, z: zz } = latest.current;
      try {
        const r = await api.mpuControl({ ...o, x: 0, y: 0, z: zz, scale: k });
        if (!r.applied && Date.now() - lastInvalidToast.current > 3000) {
          lastInvalidToast.current = Date.now();
          toast.warning('Orientação fora do alcance da plataforma', { description: 'Reduza a escala ou a inclinação.' });
        }
      } catch (err) {
        setFollow(false);
        toast.error('Controle por IMU interrompido', { description: (err as Error).message });
      } finally {
        inFlight.current = false;
      }
    }, SEND_MS);
    return () => clearInterval(id);
  }, [follow]);

  async function recalibrate() {
    try {
      await api.sendCommand('recalibra');
      useTelemetry.getState().pushLog('tx', 'recalibra');
      toast.success('Recalibração enviada ao sensor', { description: 'Mantenha o sensor parado e nivelado por alguns segundos.' });
    } catch (err) {
      toast.error('Não foi possível recalibrar', { description: (err as Error).message });
    }
  }

  return (
    <>
      <PageHeader
        title="IMU (roll/pitch/yaw)"
        description="A plataforma copia a orientação de um sensor MPU-6050 ou BNO085 enviada por ESP-NOW. Sem sensor, use a IMU virtual para validar no modelo."
      />
      <WithViewer viewer={{ target, targetLabel: 'Orientação da IMU' }}>
        <div className="grid items-start gap-5 lg:grid-cols-2">
        <Card title="Fonte da orientação" icon={<Compass aria-hidden />} actions={sensorAlive ? <StatusPill tone="success">Sensor transmitindo ({imu?.format})</StatusPill> : <StatusPill tone="neutral">Sem dados do sensor</StatusPill>}>
          <fieldset>
            <legend className="sr-only">Fonte</legend>
            <div className="flex flex-wrap gap-2">
              {(['sensor', 'virtual'] as const).map((opt) => (
                <label key={opt} className="relative">
                  <input
                    type="radio"
                    name="fonte-imu"
                    className="peer sr-only"
                    checked={effectiveSource === opt}
                    onChange={() => {
                      setTouched(true);
                      setSource(opt);
                    }}
                  />
                  <span
                    className={cn(
                      'inline-flex h-10 cursor-pointer items-center rounded-lg border px-4 text-sm font-medium',
                      'peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus',
                      effectiveSource === opt ? 'border-transparent bg-primary text-on-primary' : 'border-border bg-surface-2 hover:bg-surface-3',
                    )}
                  >
                    {opt === 'sensor' ? 'Sensor real' : 'IMU virtual'}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {effectiveSource === 'virtual' ? (
            <div className="mt-5 space-y-4">
              <SliderField label="Roll" value={virtualImu.roll} onValueChange={(v) => setVirtualImu((o) => ({ ...o, roll: v }))} min={-20} max={20} step={0.5} unit="°" unitSpoken="graus" />
              <SliderField label="Pitch" value={virtualImu.pitch} onValueChange={(v) => setVirtualImu((o) => ({ ...o, pitch: v }))} min={-20} max={20} step={0.5} unit="°" unitSpoken="graus" />
              <SliderField label="Yaw" value={virtualImu.yaw} onValueChange={(v) => setVirtualImu((o) => ({ ...o, yaw: v }))} min={-20} max={20} step={0.5} unit="°" unitSpoken="graus" />
              <Button size="sm" variant="ghost" onClick={() => setVirtualImu(ZERO)}>
                <RotateCcw aria-hidden />
                Nivelar
              </Button>
            </div>
          ) : (
            <>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <AngleBar label="Roll" value={orientation.roll} />
                <AngleBar label="Pitch" value={orientation.pitch} />
                <AngleBar label="Yaw" value={orientation.yaw} />
              </div>
              {imu?.quaternion && (
                <p className="mt-3 font-mono text-xs text-muted">
                  Quatérnion: w {imu.quaternion.w.toFixed(4)} · x {imu.quaternion.x.toFixed(4)} · y {imu.quaternion.y.toFixed(4)} · z {imu.quaternion.z.toFixed(4)}
                </p>
              )}
              {!sensorAlive && (
                <Alert tone="info" className="mt-4">
                  Nenhuma leitura recente. Verifique se o transmissor (BNO085.ino ou mpu-6050.ino) está ligado e pareado com o ESP32 da plataforma.
                </Alert>
              )}
              <Button variant="secondary" className="mt-4" onClick={recalibrate} disabled={!canCommand}>
                <Crosshair aria-hidden />
                Recalibrar sensor
              </Button>
            </>
          )}
        </Card>

        <Card title="Seguir a orientação">
          <div className="space-y-5">
            <SliderField label="Escala dos ângulos" value={Math.round(scale * 100)} onValueChange={(v) => setScale(v / 100)} min={0} max={100} step={5} unit="%" unitSpoken="por cento" digits={0} />
            <SliderField label="Altura (Z)" value={z} onValueChange={setZ} min={480} max={580} step={1} unit="mm" unitSpoken="milímetros" digits={0} />
            <SwitchField
              label="Plataforma segue a IMU"
              description={canCommand ? 'Envia a orientação 10 vezes por segundo. Desliga sozinho na parada de emergência.' : 'Conecte o simulador ou a serial primeiro.'}
              checked={follow}
              onCheckedChange={setFollow}
              disabled={!canCommand}
              tone="danger"
            />
          </div>
        </Card>
        </div>
      </WithViewer>
    </>
  );
}
