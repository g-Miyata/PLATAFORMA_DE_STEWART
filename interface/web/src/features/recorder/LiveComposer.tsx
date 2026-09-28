import { Circle, Gamepad2, Power, Square } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { SliderField, SwitchField } from '@/components/ui/field';
import { Alert } from '@/components/ui/status';
import { VirtualStick } from '@/components/VirtualStick';
import { useAutoDisable } from '@/features/control/useControlGate';
import { NEUTRAL, sticksToPose, useGamepad, type Sticks } from '@/features/joystick/gamepad';
import { useGeometry, useLimits } from '@/features/platform3d/geometry';
import { PlatformViewer } from '@/features/platform3d/PlatformViewer';
import { mmss } from '@/features/routines/MotionStatusCard';
import { api } from '@/lib/api';
import { limitPose } from '@/lib/limits';
import { fmt } from '@/lib/pistons';
import type { Pose } from '@/lib/types';
import type { Recording } from './library';
import { useRecorder } from './recorderStore';

const TICK_MS = 50;

/**
 * Ao vivo: dirija a plataforma com os joysticks da tela (ou um gamepad) e grave o
 * movimento. Ao parar, a gravação vira poses-chave e abre para ajustar e reproduzir.
 */
export function LiveComposer({ canCommand, onSaved }: { canCommand: boolean; onSaved: (rec: Recording) => void }) {
  const geometry = useGeometry();
  const lim = useLimits();
  const status = useRecorder((s) => s.status);
  const startedAt = useRecorder((s) => s.startedAt);
  const samples = useRecorder((s) => s.samples);
  const recording = status === 'recording';
  const [control, setControl] = useState(false);
  const [moveReal, setMoveReal] = useState(false);
  const [sensitivity, setSensitivity] = useState(60);
  const [z, setZ] = useState(lim.home);
  const [yaw, setYaw] = useState(0);
  const [shown, setShown] = useState<Pose>(() => ({ x: 0, y: 0, z: lim.home, roll: 0, pitch: 0, yaw: 0 }));
  const [now, setNow] = useState(() => Date.now());
  const screen = useRef<Sticks>({ ...NEUTRAL });
  const pad = useRef<Sticks | null>(null);

  const pad_id = useGamepad((s) => {
    pad.current = s;
  }, control);

  const poseNow = useCallback(() => {
    const p = pad.current;
    const sticks = p && (Math.abs(p.lx) + Math.abs(p.ly) + Math.abs(p.rx) + Math.abs(p.ry) > 0.05 || p.lt || p.rt) ? p : screen.current;
    const base = sticksToPose(sticks, z, lim, geometry, sensitivity / 100);
    return limitPose({ ...base, yaw: yaw + base.yaw }, geometry).pose;
  }, [z, yaw, lim, geometry, sensitivity]);

  // laço do controle: grava a pose da tela e, se pedido, move a plataforma
  useEffect(() => {
    if (!control) return;
    let busy = false;
    let n = 0;
    const id = setInterval(async () => {
      const pose = poseNow();
      if (useRecorder.getState().status === 'recording') useRecorder.getState().capture(pose);
      if (n++ % 2 === 0) setShown(pose);
      if (!moveReal || busy) return;
      busy = true;
      try {
        await api.applyPose(pose, 'joystick');
      } catch (err) {
        setMoveReal(false);
        toast.error('A plataforma parou de acompanhar', { description: (err as Error).message });
      } finally {
        busy = false;
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, [control, moveReal, poseNow]);

  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [recording]);

  useAutoDisable(moveReal, () => setMoveReal(false));

  const stop = useCallback(() => {
    const rec = useRecorder.getState().stop();
    if (rec) {
      toast.success('Gravação salva', { description: `${rec.keys.length} poses-chave em “${rec.name}”.` });
      onSaved(rec);
    } else toast.info('Nada gravado', { description: 'Mexa os joysticks enquanto grava.' });
  }, [onSaved]);

  // saiu da página gravando: salva o que tiver
  const stopRef = useRef(stop);
  useEffect(() => {
    stopRef.current = stop;
  });
  useEffect(() => () => void (useRecorder.getState().status === 'recording' && stopRef.current()), []);

  function startRecording() {
    setControl(true);
    useRecorder.getState().start('manual');
    setNow(Date.now());
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <div className="space-y-2">
        <PlatformViewer target={shown} source={moveReal ? 'auto' : 'target'} targetLabel="Controle" title="Controle ao vivo" hideTitle showTable={false} canvasClassName="h-80 sm:h-96" />
        <p className="text-center text-sm tabular-nums text-muted">
          X {fmt(shown.x, 0)} · Y {fmt(shown.y, 0)} · Z {fmt(shown.z, 0)} mm · roll {fmt(shown.roll, 1)}° · pitch {fmt(shown.pitch, 1)}° · yaw {fmt(shown.yaw, 1)}°
        </p>
      </div>

      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap justify-around gap-4">
          <VirtualStick
            size={148}
            label="Mover (X / Y)"
            onChange={(x, y) => {
              screen.current = { ...screen.current, lx: x, ly: -y };
            }}
          />
          <VirtualStick
            size={148}
            label="Inclinar (roll / pitch)"
            onChange={(x, y) => {
              screen.current = { ...screen.current, rx: x, ry: -y };
            }}
          />
        </div>
        {pad_id && (
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <Gamepad2 aria-hidden className="size-4" />
            Gamepad conectado: {pad_id}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <SliderField label="Altura Z" value={z} onValueChange={setZ} min={lim.pose.z[0]} max={lim.pose.z[1]} step={1} unit="mm" unitSpoken="milímetros" digits={0} />
          <SliderField label="Yaw" value={yaw} onValueChange={setYaw} min={lim.pose.yaw[0]} max={lim.pose.yaw[1]} step={0.5} unit="°" unitSpoken="graus" />
          <SliderField label="Sensibilidade" value={sensitivity} onValueChange={setSensitivity} min={25} max={100} step={5} unit="%" unitSpoken="por cento" digits={0} />
          <div className="flex items-end">
            <SwitchField label="Mover a plataforma junto" checked={moveReal} onCheckedChange={(v) => (setMoveReal(v), v && setControl(true))} disabled={!canCommand} tone="danger" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant={control ? 'secondary' : 'ghost'} onClick={() => setControl((c) => !c)} aria-pressed={control} disabled={recording}>
            <Power aria-hidden />
            {control ? 'Controle ligado' : 'Ligar controle'}
          </Button>
          {recording ? (
            <Button variant="danger" size="lg" onClick={stop}>
              <Square aria-hidden />
              Parar e salvar
            </Button>
          ) : (
            <Button variant="primary" size="lg" onClick={startRecording}>
              <Circle aria-hidden />
              Começar a gravar
            </Button>
          )}
          {recording && (
            <span role="status" className="ml-auto flex items-center gap-2 text-sm font-semibold tabular-nums text-danger">
              <span className="size-2.5 animate-pulse rounded-full bg-danger motion-reduce:animate-none" aria-hidden />
              REC {mmss(startedAt ? (now - startedAt) / 1000 : 0)} · {samples} amostras
            </span>
          )}
        </div>
        {!canCommand && <Alert tone="info">A gravação funciona só no modelo. Para a plataforma acompanhar, conecte o simulador ou a bancada no topo.</Alert>}
      </div>
    </div>
  );
}
