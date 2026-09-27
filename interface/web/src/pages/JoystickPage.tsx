import { Gamepad2, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SliderField, SwitchField } from '@/components/ui/field';
import { Alert, StatusPill } from '@/components/ui/status';
import { useAutoDisable, useCanCommand } from '@/features/control/useControlGate';
import { NEUTRAL, sticksToPose, useGamepad, type Sticks } from '@/features/joystick/gamepad';
import { uiLimits } from '@/lib/limits';
import { useGeometry } from '@/features/platform3d/geometry';
import { PlatformViewer } from '@/features/platform3d/PlatformViewer';
import { api } from '@/lib/api';
import { fmt } from '@/lib/pistons';
import type { Pose } from '@/lib/types';
import { useConnection } from '@/stores/connection';

const SEND_MS = 50; // 20 Hz, como no controle original
const UI_MS = 100;

function AxisBar({ label, value }: { label: string; value: number }) {
  const pct = ((value + 1) / 2) * 100;
  return (
    <div className="grid grid-cols-[3rem_1fr_3.5rem] items-center gap-2 text-sm">
      <span className="font-medium">{label}</span>
      <div aria-hidden className="relative h-2 rounded-full bg-surface-3">
        <div className="absolute inset-y-0 left-1/2 w-px bg-border-strong" />
        <div className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand" style={{ left: `${pct}%` }} />
      </div>
      <span className="text-right tabular-nums text-muted">{value.toFixed(2)}</span>
    </div>
  );
}

export default function JoystickPage() {
  const geometry = useGeometry();
  const canCommand = useCanCommand();
  const simulated = useConnection((s) => s.serial.simulated);
  const [apply, setApply] = useState(false);
  const [virtualSticks, setVirtualSticks] = useState<Sticks>(NEUTRAL);
  const zBase = geometry.home_z;
  const lim = uiLimits(geometry);
  const [sensitivity, setSensitivity] = useState(60);
  const scale = sensitivity / 100;

  // valores correntes (atualizados a 60 Hz sem re-render) e cópia para a UI (10 Hz)
  const live = useRef<Sticks>(NEUTRAL);
  const [shown, setShown] = useState<{ sticks: Sticks; pose: Pose }>(() => ({ sticks: NEUTRAL, pose: sticksToPose(NEUTRAL, zBase, lim, geometry, scale) }));

  const onFrame = useCallback((s: Sticks) => {
    live.current = s;
  }, []);
  const padName = useGamepad(onFrame);
  const usingPad = padName !== null;

  useAutoDisable(apply, () => setApply(false));

  useEffect(() => {
    if (!usingPad) live.current = virtualSticks;
  }, [usingPad, virtualSticks]);

  useEffect(() => {
    const id = setInterval(() => setShown({ sticks: live.current, pose: sticksToPose(live.current, zBase, lim, geometry, scale) }), UI_MS);
    return () => clearInterval(id);
  }, [zBase, lim, geometry, scale]);

  // envio a 20 Hz: com "mover a plataforma" desligado, o backend só valida
  const inFlight = useRef(false);
  useEffect(() => {
    if (!apply) return;
    const id = setInterval(async () => {
      if (inFlight.current) return;
      inFlight.current = true;
      const s = live.current;
      const pose = sticksToPose(s, zBase, lim, geometry, scale);
      try {
        await api.joystickPose({ lx: s.lx, ly: s.ly, rx: s.rx, ry: s.ry, apply: true, z_base: pose.z, scale });
      } catch (err) {
        setApply(false);
        toast.error('Controle por joystick interrompido', { description: (err as Error).message });
      } finally {
        inFlight.current = false;
      }
    }, SEND_MS);
    return () => clearInterval(id);
  }, [apply, zBase, lim, geometry, scale]);

  const setStick = (k: keyof Sticks) => (v: number) => setVirtualSticks((s) => ({ ...s, [k]: v }));
  const r = lim.reach;
  const fmtSpan = (k: 'x' | 'roll', unit: string) => `${fmt(-r[k][0] * scale, 0)} a ${fmt(r[k][1] * scale, 0)} ${unit}`;

  return (
    <>
      <PageHeader
        title="Joystick"
        description={`Controle em tempo real com gamepad Xbox/PlayStation. O curso do stick cobre o alcance real da bancada (a ${sensitivity}%: X ${fmtSpan('x', 'mm')}, roll ${fmtSpan('roll', '°')}); Z pelos gatilhos. Sem gamepad, use o joystick virtual.`}
      />
      <div className="space-y-5">
        <Card
          title="Controle"
          icon={<Gamepad2 aria-hidden />}
          actions={usingPad ? <StatusPill tone="success">Gamepad conectado</StatusPill> : <StatusPill tone="neutral">Joystick virtual</StatusPill>}
        >
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)]">
            <div className="space-y-4">
              {usingPad ? (
                <p className="truncate text-sm text-muted" title={padName}>
                  {padName}
                </p>
              ) : (
                <p className="text-sm text-muted">
                  Nenhum gamepad detectado. Conecte um e aperte qualquer botão, ou use o joystick virtual abaixo (funciona com teclado: Tab e
                  setas).
                </p>
              )}
              <SwitchField
                label="Mover a plataforma"
                description={canCommand ? 'Envia a pose 20 vezes por segundo. Desliga sozinho na parada de emergência.' : 'Conecte o simulador ou a serial primeiro.'}
                checked={apply}
                onCheckedChange={setApply}
                disabled={!canCommand}
                tone="danger"
              />
              <SliderField
                label="Sensibilidade"
                value={sensitivity}
                onValueChange={setSensitivity}
                min={25}
                max={100}
                step={5}
                unit="%"
                unitSpoken="por cento"
                digits={0}
              />
              <p className="text-xs text-muted">100% = o curso todo do stick vai até o alcance real da bancada (com a margem de segurança).</p>
            </div>

            <div>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Eixos</h3>
              <div className="space-y-2">
                <AxisBar label="LX" value={shown.sticks.lx} />
                <AxisBar label="LY" value={shown.sticks.ly} />
                <AxisBar label="RX" value={shown.sticks.rx} />
                <AxisBar label="RY" value={shown.sticks.ry} />
                <AxisBar label="RT−LT" value={shown.sticks.rt - shown.sticks.lt} />
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Pose calculada</h3>
              <dl className="grid grid-cols-3 gap-2 text-sm tabular-nums">
                {(['x', 'y', 'z', 'roll', 'pitch', 'yaw'] as const).map((k) => (
                  <div key={k} className="rounded-lg bg-surface-2 px-2 py-1.5">
                    <dt className="text-xs uppercase text-muted">{k}</dt>
                    <dd className="font-semibold">{fmt(shown.pose[k], 1, k.length === 1 ? 'mm' : '°')}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </Card>

        {!usingPad && (
          <Card
            title="Joystick virtual"
            actions={
              <Button size="sm" variant="ghost" onClick={() => setVirtualSticks(NEUTRAL)}>
                <RotateCcw aria-hidden />
                Centralizar
              </Button>
            }
          >
            <div className="grid gap-x-8 gap-y-4 md:grid-cols-2 xl:grid-cols-3">
              <SliderField label="Esquerdo, horizontal (X)" value={virtualSticks.lx} onValueChange={setStick('lx')} min={-1} max={1} step={0.05} unit="" unitSpoken="" digits={2} />
              <SliderField label="Esquerdo, vertical (Y)" value={virtualSticks.ly} onValueChange={setStick('ly')} min={-1} max={1} step={0.05} unit="" unitSpoken="" digits={2} />
              <SliderField label="Gatilho direito (sobe Z)" value={virtualSticks.rt} onValueChange={setStick('rt')} min={0} max={1} step={0.05} unit="" unitSpoken="" digits={2} />
              <SliderField label="Direito, horizontal (pitch)" value={virtualSticks.rx} onValueChange={setStick('rx')} min={-1} max={1} step={0.05} unit="" unitSpoken="" digits={2} />
              <SliderField label="Direito, vertical (roll)" value={virtualSticks.ry} onValueChange={setStick('ry')} min={-1} max={1} step={0.05} unit="" unitSpoken="" digits={2} />
              <SliderField label="Gatilho esquerdo (desce Z)" value={virtualSticks.lt} onValueChange={setStick('lt')} min={0} max={1} step={0.05} unit="" unitSpoken="" digits={2} />
            </div>
          </Card>
        )}

          {apply && usingPad && (
            <Alert tone="warning">
              Joystick movendo a plataforma. Solte os analógicos para voltar ao centro ou aperte Esc para parar.
            </Alert>
          )}

        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <PlatformViewer
              expandable
              source="target"
              target={shown.pose}
              title="Calculada (joystick)"
              targetLabel="Calculada"
              canvasClassName="h-80 sm:h-[26rem]"
            />
          </Card>
          <Card>
            <PlatformViewer expandable source="live" reference={shown.pose} title={simulated ? 'Real (modelo virtual)' : 'Real (WebSocket)'} canvasClassName="h-80 sm:h-[26rem]" />
          </Card>
        </div>
      </div>
    </>
  );
}
