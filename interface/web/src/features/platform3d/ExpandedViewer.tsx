import { Dialog } from 'radix-ui';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmergencyStopButton } from '@/features/safety/EmergencyStopButton';
import type { PlatformGeometry } from '@/lib/types';
import { PlatformViewer, type PlatformViewerProps } from './PlatformViewer';
import { ViewerDetails } from './ViewerDetails';

interface ExpandedViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  viewer: PlatformViewerProps;
  geometry: PlatformGeometry;
}

/** Modelo 3D em tela cheia, com painel de dados ao lado. */
export function ExpandedViewer({ open, onOpenChange, viewer, geometry }: ExpandedViewerProps) {
  const title = viewer.title ?? 'Modelo 3D da plataforma';
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content className="fixed inset-2 z-50 flex flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl sm:inset-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
            <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
            <Dialog.Description className="sr-only">
              Modelo 3D ampliado com os dados de pose e de cada atuador. A tecla Esc fecha esta janela; use o botão Parar para a parada de emergência.
            </Dialog.Description>
            <div className="flex items-center gap-2">
              <EmergencyStopButton showShortcut={false} />
              <Dialog.Close asChild>
                <Button variant="secondary">
                  <X aria-hidden />
                  Fechar
                </Button>
              </Dialog.Close>
            </div>
          </div>
          <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[minmax(0,1fr)_minmax(26rem,34rem)] lg:overflow-hidden">
            <div className="flex min-h-[60vh] min-w-0 lg:min-h-0">
              <PlatformViewer
                {...viewer}
                expandable={false}
                hideTitle
                showTable={false}
                className="min-h-0 min-w-0 flex-1"
                canvasClassName="min-h-0 min-w-0 flex-1"
              />
            </div>
            <div className="min-h-0 lg:overflow-y-auto lg:pr-1">
              <ViewerDetails
                source={viewer.source ?? 'auto'}
                target={viewer.target ?? null}
                reference={viewer.reference ?? null}
                geometry={geometry}
              />
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
