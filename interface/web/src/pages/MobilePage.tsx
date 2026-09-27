import { Box, Gamepad2, Smartphone } from 'lucide-react';
import { Tabs } from 'radix-ui';
import { lazy, Suspense, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { ModeBadge } from '@/components/ModeBadge';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/status';
import { useCanCommand } from '@/features/control/useControlGate';
import { GyroPanel } from '@/features/mobile/GyroPanel';
import { LanConnectCard, PinGate, useLanStatus } from '@/features/mobile/lan';
import { StickPanel } from '@/features/mobile/StickPanel';
import { EmergencyStopButton } from '@/features/safety/EmergencyStopButton';
import { refreshSerialStatus } from '@/features/serial/status';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useConnection } from '@/stores/connection';

// three só carrega se a aba da bancada for aberta
const TouchBench = lazy(() => import('@/features/mobile/TouchBench').then((m) => ({ default: m.TouchBench })));

type Tab = 'giroscopio' | 'joystick' | 'bancada';
const TABS: { id: Tab; label: string; Icon: typeof Box }[] = [
  { id: 'giroscopio', label: 'Giroscópio', Icon: Smartphone },
  { id: 'joystick', label: 'Joystick', Icon: Gamepad2 },
  { id: 'bancada', label: 'Bancada 3D', Icon: Box },
];

/** Tela do celular: giroscópio, joystick na tela e Bancada 3D por toque, com o PARAR sempre à mão. */
export default function MobilePage() {
  const lan = useLanStatus();
  const serial = useConnection((s) => s.serial);
  const online = useConnection((s) => s.backendOnline !== false);
  const canCommand = useCanCommand();
  const [tab, setTab] = useState<Tab>('giroscopio');
  const [showControls, setShowControls] = useState(false);
  const needsPin = !!lan.data?.lan && !lan.data.local && !lan.data.authorized;
  const onPc = !!lan.data?.local;

  useEffect(() => {
    document.title = 'Celular · Plataforma de Stewart · IFSP';
  }, []);

  async function connectSim() {
    try {
      await api.openSerial('SIMULADOR');
      refreshSerialStatus();
    } catch (err) {
      toast.error('Não conectou', { description: (err as Error).message });
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-fg">
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-border bg-surface/95 px-3 py-2 backdrop-blur">
        <Link to="/" className="mr-auto text-sm font-semibold">
          Plataforma de Stewart
        </Link>
        <ModeBadge />
        <EmergencyStopButton />
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 space-y-4 px-4 py-4 pb-24">
        <h1 className="text-xl font-semibold">Controle pelo celular</h1>

        {!online && <Alert tone="danger" title="Sem conexão com o PC">Confira se o celular está no mesmo Wi-Fi e se o backend foi aberto com start.bat rede.</Alert>}

        {onPc && !showControls ? (
          <div className="space-y-3">
            <p className="text-sm text-muted">Esta é a tela para o celular. Abra-a no celular pelo QR code abaixo:</p>
            <LanConnectCard />
            <Button variant="ghost" onClick={() => setShowControls(true)}>
              Usar os controles aqui no PC mesmo
            </Button>
          </div>
        ) : needsPin ? (
          <PinGate />
        ) : (
          <>
            {online && !serial.connected && (
              <Alert tone="info" title="Bancada desconectada">
                <span className="block">A conexão com a bancada real se faz no PC. Para testar daqui, use o simulador:</span>
                <Button size="sm" variant="secondary" className="mt-2" onClick={connectSim}>
                  Conectar ao simulador
                </Button>
              </Alert>
            )}
            <Tabs.Root value={tab} onValueChange={(v) => setTab(v as Tab)}>
              <Tabs.Content value="giroscopio" className="outline-none">
                <GyroPanel canCommand={canCommand} />
              </Tabs.Content>
              <Tabs.Content value="joystick" className="outline-none">
                <StickPanel canCommand={canCommand} />
              </Tabs.Content>
              <Tabs.Content value="bancada" className="outline-none">
                <Suspense fallback={<p className="text-sm text-muted">Carregando o modelo…</p>}>
                  {tab === 'bancada' && <TouchBench canCommand={canCommand} />}
                </Suspense>
              </Tabs.Content>
              <Tabs.List aria-label="Modo de controle" className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-3 border-t border-border bg-surface/95 backdrop-blur" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
                {TABS.map(({ id, label, Icon }) => (
                  <Tabs.Trigger
                    key={id}
                    value={id}
                    className={cn('flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium text-muted data-[state=active]:text-brand-text')}
                  >
                    <Icon aria-hidden className="size-5" />
                    {label}
                  </Tabs.Trigger>
                ))}
              </Tabs.List>
            </Tabs.Root>
          </>
        )}
      </main>
    </div>
  );
}
