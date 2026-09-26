import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useConnection } from '@/stores/connection';

/** Status da calibração: rápido enquanto roda, devagar parado, desligado sem conexão. */
export function useCalibrationStatus() {
  const connected = useConnection((s) => s.serial.connected);
  return useQuery({
    queryKey: ['calibration-status'],
    queryFn: api.calibrationStatus,
    enabled: connected,
    refetchInterval: (q) => (q.state.data?.running ? 500 : 3000),
  });
}
