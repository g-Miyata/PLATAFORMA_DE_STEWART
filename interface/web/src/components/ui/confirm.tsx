import { AlertTriangle, HelpCircle, Trash2 } from 'lucide-react';
import { AlertDialog } from 'radix-ui';
import type { ReactNode } from 'react';
import { create } from 'zustand';
import { Button } from './button';

export interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** danger: apagar ou mover a bancada; warning: muda algo importante; default: pergunta simples */
  tone?: 'default' | 'warning' | 'danger';
}

interface Pending extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

const useConfirmStore = create<{ pending: Pending | null }>(() => ({ pending: null }));

/**
 * Pergunta com um modal do próprio app (no lugar do window.confirm do navegador).
 * Resolve com true se a pessoa confirmar e false se cancelar ou fechar (Esc, clique fora).
 */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    // uma pergunta por vez: a anterior, se houver, conta como cancelada
    useConfirmStore.getState().pending?.resolve(false);
    useConfirmStore.setState({ pending: { ...options, resolve } });
  });
}

function finish(ok: boolean) {
  const p = useConfirmStore.getState().pending;
  useConfirmStore.setState({ pending: null });
  p?.resolve(ok);
}

const ICON = {
  default: <HelpCircle aria-hidden className="size-5 text-brand" />,
  warning: <AlertTriangle aria-hidden className="size-5 text-warning" />,
  danger: <Trash2 aria-hidden className="size-5 text-danger" />,
};

/** O modal das confirmações; fica uma vez só, junto dos provedores do app. */
export function ConfirmHost() {
  const pending = useConfirmStore((s) => s.pending);
  const tone = pending?.tone ?? 'default';
  return (
    <AlertDialog.Root open={!!pending} onOpenChange={(open) => !open && finish(false)}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-[2px]" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-[60] w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-surface p-5 shadow-2xl outline-none">
          <AlertDialog.Title className="flex items-center gap-2.5 text-lg font-semibold">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2">{ICON[tone]}</span>
            {pending?.title}
          </AlertDialog.Title>
          {pending?.description ? (
            <AlertDialog.Description asChild>
              <div className="mt-3 text-sm leading-relaxed text-muted">{pending.description}</div>
            </AlertDialog.Description>
          ) : (
            <AlertDialog.Description className="sr-only">Confirme ou cancele.</AlertDialog.Description>
          )}
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button variant="secondary" onClick={() => finish(false)}>
                {pending?.cancelLabel ?? 'Cancelar'}
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={() => finish(true)}>
                {pending?.confirmLabel ?? 'Confirmar'}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
