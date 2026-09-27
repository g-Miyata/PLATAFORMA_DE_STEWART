import { useQueryClient } from '@tanstack/react-query';
import { Box, Gamepad2, LogOut, Smartphone } from 'lucide-react';
import { Tabs } from 'radix-ui';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
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
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
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
  const qc = useQueryClient();
  const needsPin = !!lan.data?.lan && !lan.data.local && !lan.data.authorized;
  // sem resposta do /lan/status (backend fora do ar ou antigo), decide pelo endereço aberto
  const onPc = lan.data ? lan.data.local : LOCAL_HOSTS.has(window.location.hostname);
  // celular com PIN (pode sair e liberar a vez para outro)
  const paired = !!lan.data?.lan && !lan.data.local && lan.data.authorized;

  useEffect(() => {
    document.title = 'Celular · Plataforma de Stewart · IFSP';
  }, []);

  // o PC desconectou este celular (ou o backend reiniciou): avisa uma vez
  const wasPaired = useRef(false);
  useEffect(() => {
    if (wasPaired.current && needsPin) toast.info('Este celular foi desconectado', { description: 'Para comandar de novo, digite o PIN que aparece no PC.' });
    wasPaired.current = paired;
  }, [paired, needsPin]);

  async function logout() {
    try {
      await api.lanLogout();
    } finally {
      wasPaired.current = false;
      await qc.invalidateQueries({ queryKey: ['lan-status'] });
      toast.success('Celular desconectado', { description: 'Outro aparelho já pode entrar.' });
    }
  }

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
        {paired && (
          <Button size="sm" variant="ghost" onClick={logout} aria-label="Desconectar este celular">
            <LogOut aria-hidden />
            <span className="hidden min-[400px]:inline">Desconectar</span>
          </Button>
        )}
        <EmergencyStopButton />
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 space-y-4 px-4 py-4 pb-24">
        <h1 className="text-xl font-semibold">Controle pelo celular</h1>

        {!online && <Alert tone="danger" title="Sem conexão com o PC">Confira se o celular está no mesmo Wi-Fi e se o backend foi aberto com start.bat rede.</Alert>}

        {online && lan.isError && !onPc && (
          <Alert tone="warning" title="O backend não respondeu sobre o modo rede">
            Ele provavelmente foi aberto antes desta atualização. Feche a janela do backend e abra de novo com <code className="rounded bg-surface-2 px-1">start.bat</code>.
          </Alert>
        )}

        {onPc && !showControls ? (
          <div className="space-y-3">
            <p className="text-sm text-muted">Esta é a tela para o celular. Abra-a no celular pelo QR code abaixo (mesmo Wi-Fi do PC):</p>
            <LanConnectCard />
            <Button variant="ghost" onClick={() => setShowControls(true)}>
              Usar os controles aqui no PC mesmo
            </Button>
          </div>
        ) : needsPin ? (
          <PinGate busy={!!lan.data?.busy} />
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
