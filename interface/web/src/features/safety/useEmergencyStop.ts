import { useCallback } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useTelemetry } from '@/stores/telemetry';
import { useUi } from '@/stores/ui';

/**
 * Parada de emergência: o backend interrompe rotina/simulação de voo e congela os
 * atuadores na posição atual; as páginas desligam joystick/IMU ao vivo
 * (observando `estopCount`).
 */
export function useEmergencyStop() {
  return useCallback(async () => {
    useUi.getState().notifyEmergencyStop();
    try {
      const r = await api.emergencyStop();
      useTelemetry.getState().pushLog('info', 'PARADA DE EMERGÊNCIA acionada');
      toast.warning('Parada de emergência acionada', {
        description: r.held_mm ? 'Atuadores mantidos na posição atual.' : 'Rotinas interrompidas (serial desconectada).',
      });
    } catch (err) {
      toast.error('Falha na parada de emergência', { description: (err as Error).message });
    }
  }, []);
}
