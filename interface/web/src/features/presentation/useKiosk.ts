import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { KIOSK_ITEM_S, KIOSK_REST_S, type KioskItem } from './kiosk';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface KioskState {
  current: string | null;
  phase: 'idle' | 'playing' | 'resting';
  startedAt: number | null;
}

/**
 * Toca a lista na plataforma enquanto `enabled`: cada item por até 30 s, pausa de
 * 5 s no home entre eles, e encerra sozinho no fim da sessão (`sessionMin`).
 * Parar pelo botão chama /motion/stop (volta ao home); a parada de emergência
 * desliga o `enabled` pelo useAutoDisable da página.
 */
export function useKiosk(enabled: boolean, playlist: KioskItem[], sessionMin: number, onEnd: () => void): KioskState {
  const [state, setState] = useState<KioskState>({ current: null, phase: 'idle', startedAt: null });

  useEffect(() => {
    if (!enabled || !playlist.length) return;
    let cancelled = false;
    const startedAt = Date.now();
    const limit = sessionMin * 60_000;

    (async () => {
      for (let i = 0; !cancelled && Date.now() - startedAt < limit; i++) {
        const item = playlist[i % playlist.length];
        setState({ current: item.name, phase: 'playing', startedAt });
        try {
          if (item.kind === 'routine') await api.motionStart(item.req);
          else await api.trajectoryStart({ samples: item.samples, name: item.name });
        } catch (err) {
          if (!cancelled) toast.error('Quiosque interrompido', { description: (err as Error).message });
          break;
        }
        const t0 = Date.now();
        while (!cancelled && Date.now() - t0 < KIOSK_ITEM_S * 1000) {
          await sleep(500);
          const s = await api.motionStatus().catch(() => null);
          if (!s?.running) break;
        }
        if (cancelled) return;
        // passou do tempo do item: para e volta ao home
        const s = await api.motionStatus().catch(() => null);
        if (s?.running) await api.motionStop().catch(() => undefined);
        if (cancelled) return;
        setState({ current: null, phase: 'resting', startedAt });
        await sleep(KIOSK_REST_S * 1000);
      }
      if (cancelled) return;
      await api.motionStop().catch(() => undefined);
      toast.info('Sessão do quiosque encerrada', { description: 'A plataforma voltou ao home.' });
      onEnd();
    })();

    return () => {
      cancelled = true;
      setState({ current: null, phase: 'idle', startedAt: null });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, playlist, sessionMin]);

  return state;
}
