import { Play, Square } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { SliderField } from '@/components/ui/field';
import { VirtualStick } from '@/components/VirtualStick';
import { useAutoDisable } from '@/features/control/useControlGate';
import { NEUTRAL, sticksToPose } from '@/features/joystick/gamepad';
import { useGeometry, useLimits } from '@/features/platform3d/geometry';
import { api } from '@/lib/api';
import { limitPose } from '@/lib/limits';
import { fmt } from '@/lib/pistons';
import type { Pose } from '@/lib/types';
import { LiveResponse } from './LiveResponse';

const SEND_MS = 50;

/** Dois joysticks na tela (translação e inclinação) mais Z e yaw, enviados a 20 Hz. */
export function StickPanel({ canCommand }: { canCommand: boolean }) {
  const geometry = useGeometry();
  const lim = useLimits();
  const [running, setRunning] = useState(false);
  const [sensitivity, setSensitivity] = useState(60);
  const [z, setZ] = useState(lim.home);
  const [yaw, setYaw] = useState(0);
  const sticks = useRef({ ...NEUTRAL });
  const [shown, setShown] = useState<Pose>(() => ({ x: 0, y: 0, z: lim.home, roll: 0, pitch: 0, yaw: 0 }));

  const poseNow = useCallback(() => {
    const p = sticksToPose(sticks.current, lim.home, lim, geometry, sensitivity / 100);
    return limitPose({ ...p, z, yaw }, geometry).pose;
  }, [lim, geometry, sensitivity, z, yaw]);

  useEffect(() => {
    const id = setInterval(() => {
      setShown(poseNow());
    }, 120);
    return () => clearInterval(id);
  }, [poseNow]);

  const stop = useCallback(() => setRunning(false), []);
  useAutoDisable(running, stop);
  useEffect(() => {
    if (!running) return;
    const on = () => document.visibilityState === 'hidden' && setRunning(false);
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, [running]);

  useEffect(() => {
    if (!running) return;
    let busy = false;
    const id = setInterval(async () => {
      if (busy) return;
      busy = true;
      try {
        await api.applyPose(poseNow(), 'joystick');
      } catch (err) {
        setRunning(false);
        toast.error('Joystick interrompido', { description: (err as Error).message });
      } finally {
        busy = false;
      }
    }, SEND_MS);
    return () => clearInterval(id);
  }, [running, poseNow]);

  return (
    <div className="space-y-5">
      <LiveResponse target={running ? shown : null} />
      <div className="flex flex-wrap justify-around gap-4">
        <VirtualStick
          size={148}
          label="Mover (X / Y)"
          onChange={(x, y) => {
            sticks.current = { ...sticks.current, lx: x, ly: -y };
          }}
        />
        <VirtualStick
          size={148}
          label="Inclinar (roll / pitch)"
          onChange={(x, y) => {
            sticks.current = { ...sticks.current, rx: x, ry: -y };
          }}
        />
      </div>
      <p className="text-center text-sm tabular-nums text-muted" aria-live="polite">
        X {fmt(shown.x, 0)} · Y {fmt(shown.y, 0)} mm · roll {fmt(shown.roll, 1)}° · pitch {fmt(shown.pitch, 1)}°
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <SliderField label="Altura Z" value={z} onValueChange={setZ} min={lim.pose.z[0]} max={lim.pose.z[1]} step={1} unit="mm" unitSpoken="milímetros" digits={0} />
        <SliderField label="Yaw" value={yaw} onValueChange={setYaw} min={lim.pose.yaw[0]} max={lim.pose.yaw[1]} step={0.5} unit="°" unitSpoken="graus" />
        <SliderField label="Sensibilidade dos sticks" value={sensitivity} onValueChange={setSensitivity} min={25} max={100} step={5} unit="%" unitSpoken="por cento" digits={0} />
      </div>
      {running ? (
        <Button variant="danger" size="lg" className="w-full" onClick={stop}>
          <Square aria-hidden />
          Parar joystick
        </Button>
      ) : (
        <Button variant="primary" size="lg" className="w-full" onClick={() => setRunning(true)} disabled={!canCommand}>
          <Play aria-hidden />
          Iniciar joystick
        </Button>
      )}
    </div>
  );
}
