import { create } from 'zustand';
import type { SerialStatus } from '@/lib/types';

interface ConnectionState {
  /** null = ainda não verificado */
  backendOnline: boolean | null;
  wsConnected: boolean;
  serial: SerialStatus;
  setBackendOnline: (online: boolean) => void;
  setWsConnected: (connected: boolean) => void;
  setSerial: (status: SerialStatus) => void;
}

export const DISCONNECTED: SerialStatus = { connected: false, port: null, simulated: false };

export const useConnection = create<ConnectionState>((set) => ({
  backendOnline: null,
  wsConnected: false,
  serial: DISCONNECTED,
  setBackendOnline: (backendOnline) => set({ backendOnline }),
  setWsConnected: (wsConnected) => set({ wsConnected }),
  setSerial: (serial) => set({ serial }),
}));

export type ConnectionMode = 'offline' | 'disconnected' | 'simulated' | 'hardware';

export function connectionMode(s: Pick<ConnectionState, 'backendOnline' | 'serial'>): ConnectionMode {
  if (s.backendOnline === false) return 'offline';
  if (!s.serial.connected) return 'disconnected';
  return s.serial.simulated ? 'simulated' : 'hardware';
}

export const useConnectionMode = () => useConnection(connectionMode);
