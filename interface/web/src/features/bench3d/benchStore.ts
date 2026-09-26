import { create } from 'zustand';
import { DEFAULT_GEOMETRY } from '@/features/platform3d/geometry';
import { forwardKinematics } from '@/lib/forwardKinematics';
import { solvePose, zeroPose } from '@/lib/kinematics';
import type { PlatformGeometry, Pose } from '@/lib/types';

export type PlatformAxis = 'z' | 'roll' | 'pitch' | 'yaw';
export const PLATFORM_AXES: PlatformAxis[] = ['z', 'roll', 'pitch', 'yaw'];
export const AXIS_LABEL: Record<PlatformAxis, string> = { z: 'Altura Z', roll: 'Roll', pitch: 'Pitch', yaw: 'Yaw' };

export type Selection = { kind: 'none' } | { kind: 'piston'; index: number } | { kind: 'platform'; axis: PlatformAxis };

interface Snapshot {
  pose: Pose;
  lengths: number[];
}

interface BenchState {
  geometry: PlatformGeometry;
  pose: Pose;
  lengths: number[];
  selection: Selection;
  dragging: boolean;
  /** pistão que impediu o último movimento (pisca em vermelho) */
  limit: { piston: number | null; at: number; reason: string } | null;
  history: Snapshot[];

  init: (geometry: PlatformGeometry) => void;
  resetHome: () => void;
  select: (selection: Selection) => void;
  /** clique no ponto central: seleciona a plataforma ou passa para o próximo eixo */
  cycleAxis: () => void;
  setDragging: (dragging: boolean) => void;
  /** guarda o estado atual para desfazer (agrupa edições seguidas) */
  checkpoint: () => void;
  undo: () => void;
  /** muda um pistão; os outros 5 ficam fixos e a pose sai da cinemática direta */
  setPistonLength: (index: number, length: number) => boolean;
  /** muda a pose; os 6 pistões saem da cinemática inversa */
  setPose: (pose: Pose) => boolean;
  nudge: (amount: number) => boolean;
}

const HISTORY_LIMIT = 60;
const COALESCE_MS = 700;
let lastCheckpoint = 0;
let lastTarget = '';

const targetKey = (s: Selection) => (s.kind === 'piston' ? 'p' + s.index : s.kind === 'platform' ? 't-' + s.axis : 'none');

function homeState(geometry: PlatformGeometry): Snapshot {
  const pose = zeroPose(geometry.home_z);
  return { pose, lengths: solvePose(pose, geometry).lengths };
}

export const useBench = create<BenchState>((set, get) => ({
  geometry: DEFAULT_GEOMETRY,
  ...homeState(DEFAULT_GEOMETRY),
  selection: { kind: 'none' },
  dragging: false,
  limit: null,
  history: [],

  init: (geometry) => {
    if (get().geometry === geometry) return;
    set({ geometry, ...homeState(geometry), history: [], limit: null });
  },

  resetHome: () => {
    get().checkpoint();
    set({ ...homeState(get().geometry), limit: null });
  },

  select: (selection) => set({ selection, limit: null }),

  cycleAxis: () => {
    const s = get().selection;
    if (s.kind !== 'platform') return set({ selection: { kind: 'platform', axis: 'z' }, limit: null });
    const next = PLATFORM_AXES[(PLATFORM_AXES.indexOf(s.axis) + 1) % PLATFORM_AXES.length];
    set({ selection: { kind: 'platform', axis: next } });
  },

  setDragging: (dragging) => set({ dragging }),

  checkpoint: () => {
    const now = Date.now();
    // agrupa só edições seguidas no mesmo alvo (mesmo pistão ou mesmo eixo do tampo)
    const key = targetKey(get().selection);
    const sameTarget = key === lastTarget;
    lastTarget = key;
    if (sameTarget && now - lastCheckpoint < COALESCE_MS) {
      lastCheckpoint = now;
      return;
    }
    lastCheckpoint = now;
    const { pose, lengths, history } = get();
    set({ history: [...history.slice(-(HISTORY_LIMIT - 1)), { pose, lengths }] });
  },

  undo: () => {
    const { history } = get();
    const prev = history[history.length - 1];
    if (!prev) return;
    lastCheckpoint = 0;
    lastTarget = '';
    set({ ...prev, history: history.slice(0, -1), limit: null });
  },

  setPistonLength: (index, length) => {
    const { geometry, pose, lengths } = get();
    const L = Math.min(geometry.stroke_max, Math.max(geometry.stroke_min, length));
    const next = lengths.slice();
    next[index] = L;
    const fk = forwardKinematics(next, geometry, pose);
    if (!fk.converged) {
      set({ limit: { piston: index, at: Date.now(), reason: 'Essa combinação de comprimentos não tem pose possível.' } });
      return false;
    }
    const atLimit = L !== length;
    set({
      pose: fk.pose,
      lengths: next,
      limit: atLimit ? { piston: index, at: Date.now(), reason: `P${index + 1} chegou ao batente.` } : null,
    });
    return !atLimit;
  },

  setPose: (pose) => {
    const { geometry } = get();
    const s = solvePose(pose, geometry);
    if (!s.valid) {
      const bad = s.status.findIndex((st) => st === 'invalid');
      set({ limit: { piston: bad, at: Date.now(), reason: `P${bad + 1} sairia do curso.` } });
      return false;
    }
    set({ pose, lengths: s.lengths, limit: null });
    return true;
  },

  /** incremento do que estiver selecionado (mm para pistão/Z, graus para ângulos) */
  nudge: (amount) => {
    const { selection, lengths, pose } = get();
    if (selection.kind === 'piston') return get().setPistonLength(selection.index, lengths[selection.index] + amount);
    if (selection.kind === 'platform') return get().setPose({ ...pose, [selection.axis]: pose[selection.axis] + amount });
    return false;
  },
}));
