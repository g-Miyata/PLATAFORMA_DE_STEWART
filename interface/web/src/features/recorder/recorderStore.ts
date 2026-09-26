// Gravador global: enquanto liga, amostra a 20 Hz a última pose comandada (qualquer
// página que aplique poses) ou a medida pela telemetria. Ao parar, a gravação é
// simplificada em poses-chave e vai para a biblioteca.
import { create } from 'zustand';
import { onPoseCommanded } from '@/lib/api';
import type { Pose } from '@/lib/types';
import { useTelemetry } from '@/stores/telemetry';
import { useLibrary, type Recording } from './library';
import { simplify, type Keyframe } from './trajectory';

export const SAMPLE_MS = 50;
/** 30 min a 20 Hz */
export const MAX_SAMPLES = 36_000;

export type RecordSource = 'comandos' | 'medido';

interface RecorderState {
  status: 'idle' | 'recording';
  source: RecordSource;
  startedAt: number | null;
  samples: number;
  /** a gravação parou sozinha ao atingir o limite */
  truncated: boolean;
  start: (source?: RecordSource) => void;
  stop: (name?: string) => Recording | null;
  /** entrada de uma pose (usada pelos ouvintes; exposta para os testes) */
  capture: (pose: Pose) => void;
}

let buffer: Keyframe[] = [];
let latest: Pose | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let unsubs: (() => void)[] = [];

function teardown() {
  if (timer) clearInterval(timer);
  timer = null;
  unsubs.forEach((u) => u());
  unsubs = [];
}

export const useRecorder = create<RecorderState>((set, get) => ({
  status: 'idle',
  source: 'comandos',
  startedAt: null,
  samples: 0,
  truncated: false,
  capture: (pose) => {
    latest = { ...pose };
  },
  start: (source = 'comandos') => {
    if (get().status === 'recording') return;
    buffer = [];
    latest = null;
    const startedAt = Date.now();
    if (source === 'comandos') {
      unsubs.push(onPoseCommanded((pose) => get().capture(pose)));
    } else {
      unsubs.push(
        useTelemetry.subscribe((s) => {
          const p = s.telemetry?.pose_live;
          if (p) get().capture(p);
        }),
      );
    }
    // amostra a pose mais recente em ritmo fixo: pausas também ficam gravadas
    timer = setInterval(() => {
      if (!latest) return;
      buffer.push({ t: (Date.now() - startedAt) / 1000, pose: latest });
      set({ samples: buffer.length });
      if (buffer.length >= MAX_SAMPLES) {
        set({ truncated: true });
        get().stop();
      }
    }, SAMPLE_MS);
    set({ status: 'recording', source, startedAt, samples: 0, truncated: false });
  },
  stop: (name) => {
    if (get().status !== 'recording') return null;
    teardown();
    const raw = buffer;
    buffer = [];
    set({ status: 'idle', startedAt: null });
    if (raw.length < 2) return null;
    const t0 = raw[0].t;
    const keys = simplify(raw.map((k) => ({ t: k.t - t0, pose: k.pose })));
    const when = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    return useLibrary.getState().create({
      name: name ?? `Gravação ${when}`,
      interp: 'linear',
      keys,
    });
  },
}));
