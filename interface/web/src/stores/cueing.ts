import { create } from 'zustand';
import type { CueingTickMessage } from '@/lib/types';

interface CueingState {
  tick: CueingTickMessage | null;
  onTick: (msg: CueingTickMessage) => void;
}

/** Último cueing_tick do backend (30 Hz enquanto há fonte ativa ou plataforma engatada). */
export const useCueing = create<CueingState>((set) => ({
  tick: null,
  onTick: (tick) => set({ tick }),
}));
