import { Smartphone, X } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { Button } from '@/components/ui/button';
import { LanConnectCard, useLanInfo, useLanStatus } from '@/features/mobile/lan';

/** Botão "Celular" no cabeçalho do PC: liga o modo rede, QR code e PIN; o ponto verde indica celular conectado. */
export function LanChip() {
  const status = useLanStatus();
  const info = useLanInfo(!!status.data?.local && !!status.data.lan);
  if (!status.data?.local) return null;
  const connected = info.data?.lan ? info.data.devices.some((d) => d.active) : false;
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <Button size="sm" variant="secondary">
          <Smartphone aria-hidden />
          Celular
          {connected && <span aria-label="celular conectado" role="img" className="size-2 rounded-full bg-brand" />}
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(34rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 space-y-4 rounded-xl border border-border bg-surface p-5 shadow-2xl">
          <div className="flex items-start justify-between gap-3">
            <Dialog.Title className="text-lg font-semibold">Controlar pelo celular</Dialog.Title>
            <Dialog.Close asChild>
              <Button size="icon" variant="ghost" aria-label="Fechar">
                <X aria-hidden />
              </Button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="text-sm text-muted">Mesmo Wi-Fi do PC. O celular só comanda depois do PIN; o PARAR funciona sempre.</Dialog.Description>
          <LanConnectCard />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
