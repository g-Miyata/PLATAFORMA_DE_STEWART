import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { CueingProfile } from '@/lib/types';

/**
 * Modo "Simulador de voo" da apresentação: toca em loop o voo gravado de
 * demonstração pelo motion cueing (washout) do backend. Com `real`, engata a
 * plataforma no cueing; sem, só o modelo 3D segue a pose calculada. Ao sair,
 * para o voo e solta a plataforma (ela volta ao neutro sozinha).
 */
export function useExhibitFlight(active: boolean, profile: CueingProfile, real: boolean, visual: boolean, onFail: () => void) {
  const [flight, setFlight] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    (async () => {
      try {
        const flights = await api.cueingFlights();
        const pick = flights.find((f) => f.id.startsWith('demo')) ?? flights[0];
        if (!pick) throw new Error('Nenhum voo gravado em interface/simulation/flights.');
        if (cancelled) return;
        await api.cueingReplayStart({ flight: pick.id, speed: 1, loop: true, profile, visual: visual && pick.visual });
        if (!cancelled) setFlight({ id: pick.id, name: pick.name });
      } catch (err) {
        if (cancelled) return;
        toast.error('Simulador de voo indisponível', { description: (err as Error).message });
        onFail();
      }
    })();
    return () => {
      cancelled = true;
      setFlight(null);
      void api.cueingReplayStop().catch(() => undefined);
    };
    // onFail muda a cada render da página; o que importa é ligar/desligar e o FlightGear
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, profile, visual]);

  // plataforma de verdade: engata no cueing (parando antes o que o quiosque estiver tocando)
  useEffect(() => {
    if (!active || !real) return;
    let cancelled = false;
    (async () => {
      try {
        await api.motionStop().catch(() => undefined);
        if (!cancelled) await api.cueingEngage(profile);
      } catch (err) {
        if (cancelled) return;
        toast.error('A plataforma não engatou no simulador de voo', { description: (err as Error).message });
        onFail();
      }
    })();
    return () => {
      cancelled = true;
      void api.cueingRelease().catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, profile, real]);

  return flight;
}
