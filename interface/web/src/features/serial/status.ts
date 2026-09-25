import { api } from '@/lib/api';
import { DISCONNECTED, useConnection } from '@/stores/connection';
import { useTelemetry } from '@/stores/telemetry';

/** Consulta /serial/status: mantém "backend online" e o modo (real/simulado) atualizados. */
export async function refreshSerialStatus(signal?: AbortSignal) {
  const conn = useConnection.getState();
  try {
    const status = await api.serialStatus(signal);
    const wasConnected = conn.serial.connected;
    conn.setBackendOnline(true);
    conn.setSerial(status);
    if (wasConnected && !status.connected) useTelemetry.getState().reset();
  } catch (err) {
    if ((err as Error).name === 'AbortError') return;
    conn.setBackendOnline(false);
    conn.setSerial(DISCONNECTED);
  }
}
