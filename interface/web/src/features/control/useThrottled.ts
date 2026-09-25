import { useEffect, useState } from 'react';
import { useTelemetry } from '@/stores/telemetry';

type TelemetryState = ReturnType<typeof useTelemetry.getState>;

/**
 * Lê um pedaço do store de telemetria no máximo a cada `ms` (texto e tabelas não
 * precisam de 30 Hz, e o re-render ficaria caro).
 */
export function useThrottledTelemetry<T>(select: (s: TelemetryState) => T, ms = 200): T {
  const [value, setValue] = useState(() => select(useTelemetry.getState()));
  useEffect(() => {
    const id = setInterval(() => setValue(select(useTelemetry.getState())), ms);
    return () => clearInterval(id);
    // o seletor é estável por uso (função inline pura); só o intervalo importa
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms]);
  return value;
}
