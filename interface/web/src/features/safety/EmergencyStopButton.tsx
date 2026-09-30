import { OctagonX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConnection } from '@/stores/connection';
import { useEmergencyStop } from './useEmergencyStop';

/** `showShortcut` = false onde o Esc tem outro uso (ex.: dentro de um diálogo, onde ele fecha). */
export function EmergencyStopButton({ showShortcut = true }: { showShortcut?: boolean }) {
  const estop = useEmergencyStop();
  const online = useConnection((s) => s.backendOnline !== false);
  return (
    <Button
      variant="danger"
      onClick={estop}
      disabled={!online}
      aria-keyshortcuts={showShortcut ? 'Escape' : undefined}
      title={`Parada de emergência${showShortcut ? ' (Esc)' : ''}: interrompe rotinas e congela os atuadores`}
      className="font-bold uppercase tracking-wide"
    >
      <OctagonX aria-hidden />
      <span>Parar</span>
      {showShortcut && <kbd className="hidden rounded border border-current/40 px-1 text-[10px] font-semibold sm:inline">Esc</kbd>}
    </Button>
  );
}
