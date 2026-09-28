import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { Toaster } from 'sonner';
import { useEmergencyStop } from '@/features/safety/useEmergencyStop';
import { refreshSerialStatus } from '@/features/serial/status';
import { TelemetrySocket, telemetryUrl } from '@/lib/ws';
import { useUi } from '@/stores/ui';

export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

const STATUS_POLL_MS = 2000;

function useBackendSync() {
  useEffect(() => {
    const socket = new TelemetrySocket(telemetryUrl());
    socket.start();
    const ctrl = new AbortController();
    refreshSerialStatus(ctrl.signal);
    const id = setInterval(() => refreshSerialStatus(ctrl.signal), STATUS_POLL_MS);
    return () => {
      ctrl.abort();
      clearInterval(id);
      socket.stop();
    };
  }, []);
}

// Esc fecha diálogos e menus abertos: com um deles na tela, o Esc é deles
const ESC_OWNERS = '[role="dialog"], [role="alertdialog"], [role="menu"], [data-radix-popper-content-wrapper]';

/**
 * Esc = parada de emergência. Escuta na captura, antes de qualquer outro componente:
 * editores que usam o Esc (o Blockly, por exemplo) não podem engolir a parada.
 */
function useEmergencyHotkey() {
  const estop = useEmergencyStop();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.repeat) return;
      if (document.querySelector(ESC_OWNERS)) return;
      estop();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [estop]);
}

function Background() {
  useBackendSync();
  useEmergencyHotkey();
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const theme = useUi((s) => s.theme);
  return (
    <QueryClientProvider client={queryClient}>
      <Background />
      {children}
      <Toaster
        theme={theme}
        position="bottom-right"
        // acima do botão flutuante "Mostrar modelo 3D"
        offset={{ bottom: '5.5rem', right: '1rem' }}
        mobileOffset={{ bottom: '5rem' }}
        richColors
        closeButton
        containerAriaLabel="Notificações"
        toastOptions={{ closeButtonAriaLabel: 'Fechar notificação' }}
      />
    </QueryClientProvider>
  );
}
