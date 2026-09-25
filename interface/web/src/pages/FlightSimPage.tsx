import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Home, Plane, Play, Square, Terminal } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Alert, StatusPill } from '@/components/ui/status';
import { useCanCommand } from '@/features/control/useControlGate';
import { PlatformViewer } from '@/features/platform3d/PlatformViewer';
import { api } from '@/lib/api';
import { fmt } from '@/lib/pistons';

const PREVIEW_MS = 250;

/** Relógio que avança a cada `ms` (para "há X s" sem chamar Date.now no render). */
function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

function Code({ children }: { children: string }) {
  return <pre className="overflow-x-auto rounded-lg border border-border bg-surface-2 p-3 font-mono text-xs">{children}</pre>;
}

export default function FlightSimPage() {
  const canCommand = useCanCommand();
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ['flight-status'], queryFn: api.flightStatus, refetchInterval: 2000 });
  const enabled = !!status.data?.enabled;
  const preview = useQuery({
    queryKey: ['flight-preview'],
    queryFn: api.flightPreview,
    refetchInterval: enabled ? PREVIEW_MS : false,
    retry: false,
  });
  const now = useNow(500);
  const ageS = preview.data ? Math.max(0, now / 1000 - preview.data.timestamp) : null;
  const bridgeActive = enabled && ageS !== null && ageS < 2;

  // Fechar a aba não pode deixar o FlightGear mandando na plataforma
  useEffect(() => {
    const stop = () => navigator.sendBeacon?.('/flight-simulation/stop');
    window.addEventListener('pagehide', stop);
    return () => window.removeEventListener('pagehide', stop);
  }, []);

  async function run(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn();
      toast.success(ok);
    } catch (err) {
      toast.error('Falhou', { description: (err as Error).message });
    } finally {
      qc.invalidateQueries({ queryKey: ['flight-status'] });
    }
  }

  const safeZ = status.data?.safe_z ?? 540;
  const pose = preview.data?.pose;

  return (
    <>
      <PageHeader
        title="Simulação de voo"
        description="A ponte fg-bridge.py lê roll e pitch do FlightGear (Telnet), limita a ±12°, valida no backend e envia a pose para a plataforma."
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card
            title="Controle"
            icon={<Plane aria-hidden />}
            actions={
              enabled ? (
                bridgeActive ? <StatusPill tone="success">Recebendo do FlightGear</StatusPill> : <StatusPill tone="warning">Aguardando a ponte</StatusPill>
              ) : (
                <StatusPill tone="neutral">Desligada</StatusPill>
              )
            }
          >
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => run(api.flightStart, 'Simulação de voo liberada')} disabled={enabled}>
                <Play aria-hidden />
                Liberar controle
              </Button>
              <Button variant="danger" onClick={() => run(api.flightStop, 'Simulação de voo parada')} disabled={!enabled}>
                <Square aria-hidden />
                Parar
              </Button>
              <Button
                variant="secondary"
                disabled={!canCommand || enabled}
                onClick={() => run(() => api.applyPose({ x: 0, y: 0, z: safeZ, roll: 0, pitch: 0, yaw: 0 }), 'Plataforma na pose segura')}
              >
                <Home aria-hidden />
                Pose segura (Z {safeZ} mm)
              </Button>
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-2 text-sm tabular-nums">
              {(['roll', 'pitch', 'z'] as const).map((k) => (
                <div key={k} className="rounded-lg bg-surface-2 px-2 py-1.5">
                  <dt className="text-xs uppercase text-muted">{k}</dt>
                  <dd className="font-semibold">{pose ? fmt(pose[k], 1, k === 'z' ? 'mm' : '°') : '—'}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-xs text-muted" aria-live="polite">
              {ageS === null ? 'Nenhuma pose recebida ainda.' : `Última pose há ${fmt(ageS, 1)} s.`}
            </p>
            {enabled && !canCommand && (
              <Alert tone="warning" className="mt-4">
                A ponte está liberada, mas a serial não está conectada: as poses são validadas e mostradas aqui, sem mover nada.
              </Alert>
            )}
          </Card>

          <Card title="Como rodar" icon={<Terminal aria-hidden />}>
            <ol className="list-decimal space-y-3 pl-5 text-sm">
              <li>
                Abra o FlightGear com o servidor Telnet:
                <Code>{'fgfs --telnet=socket,bi,60,localhost,5050,tcp'}</Code>
              </li>
              <li>
                Em outro terminal, com o backend rodando:
                <Code>{'cd interface\\simulation\npython fg-bridge.py'}</Code>
              </li>
              <li>Conecte o simulador (ou o hardware) no topo e clique em Liberar controle.</li>
            </ol>
            <p className="mt-3 text-xs text-muted">
              Variáveis opcionais: FG_TELNET_HOST, FG_TELNET_PORT, FG_ANGLE_LIMIT (12°), FG_SAFE_Z (540 mm), FG_POLL_INTERVAL (0,033 s).
            </p>
          </Card>
        </div>

        <Card>
          <PlatformViewer target={pose ?? null} targetLabel="FlightGear" canvasClassName="h-96 sm:h-[34rem]" />
        </Card>
      </div>
    </>
  );
}
