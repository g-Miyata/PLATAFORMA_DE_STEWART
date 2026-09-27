import { Crosshair, Play, Square } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { SliderField } from '@/components/ui/field';
import { Alert } from '@/components/ui/status';
import { useAutoDisable } from '@/features/control/useControlGate';
import { useGeometry, useLimits } from '@/features/platform3d/geometry';
import { AttitudeIndicator } from '@/features/presentation/SceneHud';
import { api } from '@/lib/api';
import { fmt } from '@/lib/pistons';
import { LiveResponse } from './LiveResponse';
import { noteError, noteResult, SendStatusBar } from './sendStatus';
import { approachTilt, PHONE_TILT_RATE, tiltFromOrientation, type Orientation, type Tilt } from './control';

const SEND_MS = 100;
const STALE_MS = 1000;

type Permission = 'idle' | 'granted' | 'denied' | 'unsupported';

interface IOSOrientation {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}

/** Giroscópio do celular: incline o aparelho e o tampo acompanha (roll e pitch). */
export function GyroPanel({ canCommand }: { canCommand: boolean }) {
  const geometry = useGeometry();
  const lim = useLimits();
  const [permission, setPermission] = useState<Permission>(() => (typeof window !== 'undefined' && 'DeviceOrientationEvent' in window ? 'idle' : 'unsupported'));
  const [running, setRunning] = useState(false);
  const [sensitivity, setSensitivity] = useState(60);
  const [shown, setShown] = useState<{ phone: Tilt; sent: Tilt }>({ phone: { roll: 0, pitch: 0 }, sent: { roll: 0, pitch: 0 } });
  const last = useRef<{ o: Orientation; at: number } | null>(null);
  const zero = useRef<Orientation | null>(null);
  const tilt = useRef<Tilt>({ roll: 0, pitch: 0 });
  const secure = typeof window === 'undefined' || window.isSecureContext;
  const maxDeg = lim.tilt;

  // leitura do sensor
  useEffect(() => {
    if (permission !== 'granted') return;
    const on = (e: DeviceOrientationEvent) => {
      if (e.beta === null || e.gamma === null) return;
      const o = { beta: e.beta, gamma: e.gamma };
      last.current = { o, at: performance.now() };
      zero.current ??= o;
    };
    window.addEventListener('deviceorientation', on);
    return () => window.removeEventListener('deviceorientation', on);
  }, [permission]);

  // mostrador a 10 Hz (mesmo parado)
  useEffect(() => {
    const id = setInterval(() => {
      const l = last.current;
      const phone = l && zero.current ? tiltFromOrientation(l.o, zero.current, sensitivity / 100, maxDeg) : { roll: 0, pitch: 0 };
      setShown({ phone, sent: { ...tilt.current } });
    }, 100);
    return () => clearInterval(id);
  }, [sensitivity, maxDeg]);

  const stop = useCallback((why?: string) => {
    setRunning(false);
    tilt.current = { roll: 0, pitch: 0 };
    if (why) toast.info('Controle por giroscópio parado', { description: why });
    // volta ao nível devagar (o firmware limita a velocidade)
    void api.applyPose({ x: 0, y: 0, z: geometry.home_z, roll: 0, pitch: 0, yaw: 0 }, 'imu').catch(() => undefined);
  }, [geometry.home_z]);
  useAutoDisable(running, () => setRunning(false));

  // sair da tela para o controle (bloqueou o celular, trocou de app)
  useEffect(() => {
    if (!running) return;
    const on = () => document.visibilityState === 'hidden' && stop('A página saiu da tela.');
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, [running, stop]);

  // envio a 10 Hz, suavizado na velocidade que os atuadores acompanham
  useEffect(() => {
    if (!running) return;
    let busy = false;
    const id = setInterval(async () => {
      const l = last.current;
      if (!l || performance.now() - l.at > STALE_MS) {
        stop('O sensor parou de mandar dados.');
        return;
      }
      const target = tiltFromOrientation(l.o, zero.current ?? l.o, sensitivity / 100, maxDeg);
      tilt.current = approachTilt(tilt.current, target, SEND_MS / 1000, PHONE_TILT_RATE);
      if (busy) return;
      busy = true;
      try {
        noteResult(await api.mpuControl({ roll: tilt.current.roll, pitch: tilt.current.pitch, yaw: 0, x: 0, y: 0, z: geometry.home_z, scale: 1 }));
      } catch (err) {
        noteError(err);
        stop((err as Error).message);
      } finally {
        busy = false;
      }
    }, SEND_MS);
    return () => clearInterval(id);
  }, [running, sensitivity, maxDeg, geometry.home_z, stop]);

  async function enable() {
    const Ctor = window.DeviceOrientationEvent as unknown as IOSOrientation | undefined;
    try {
      if (Ctor?.requestPermission) setPermission((await Ctor.requestPermission()) === 'granted' ? 'granted' : 'denied');
      else setPermission('granted');
    } catch {
      setPermission('denied');
    }
  }

  const commanded = running ? { x: 0, y: 0, z: geometry.home_z, roll: shown.sent.roll, pitch: shown.sent.pitch, yaw: 0 } : null;

  if (!secure)
    return (
      <Alert tone="warning" title="O giroscópio precisa de HTTPS">
        Abra pelo endereço com <strong>https://</strong> e a porta 8443 (o QR code do PC já leva para ele):{' '}
        <a className="font-mono underline" href={`https://${location.hostname}:8443/celular`}>
          https://{location.hostname}:8443/celular
        </a>
      </Alert>
    );
  if (permission === 'unsupported') return <Alert tone="info">Este aparelho não tem sensor de orientação. Use o joystick na tela.</Alert>;

  return (
    <div className="space-y-3">
      <LiveResponse target={commanded} />
      {permission !== 'granted' ? (
        <div className="space-y-2">
          <p className="text-sm text-muted">Deite o celular com a tela para cima e incline: o tampo acompanha, até {fmt(maxDeg, 0)}° (o limite real da bancada, com margem).</p>
          <Button variant="primary" size="lg" className="w-full" onClick={enable}>
            Ativar o giroscópio
          </Button>
          {permission === 'denied' && <p className="text-sm text-danger">Permissão negada. Nas configurações do navegador, libere os sensores de movimento para este site.</p>}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-around gap-4">
            <div className="text-center">
              <AttitudeIndicator roll={shown.phone.roll} pitch={shown.phone.pitch} className="size-28 sm:size-40" />
              <p className="mt-1 text-xs text-muted">celular</p>
            </div>
            <dl className="space-y-1 text-sm tabular-nums">
              <div>
                <dt className="text-xs text-muted">Enviado</dt>
                <dd className="text-lg font-semibold">
                  roll {fmt(shown.sent.roll, 1)}° · pitch {fmt(shown.sent.pitch, 1)}°
                </dd>
              </div>
            </dl>
          </div>
          <SendStatusBar idleText="Nada enviado ainda: toque em Iniciar controle." />
          <SliderField label="Sensibilidade" value={sensitivity} onValueChange={setSensitivity} min={20} max={100} step={5} unit="%" unitSpoken="por cento" digits={0} />
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" size="lg" onClick={() => (zero.current = last.current?.o ?? null)}>
              <Crosshair aria-hidden />
              Zerar
            </Button>
            {running ? (
              <Button variant="danger" size="lg" onClick={() => stop()}>
                <Square aria-hidden />
                Parar controle
              </Button>
            ) : (
              <Button variant="primary" size="lg" onClick={() => setRunning(true)} disabled={!canCommand}>
                <Play aria-hidden />
                Iniciar controle
              </Button>
            )}
          </div>
          <p className="text-xs text-muted">“Zerar” guarda a posição atual do celular como nível. O controle para sozinho se a tela apagar ou o sensor parar.</p>
        </>
      )}
    </div>
  );
}
