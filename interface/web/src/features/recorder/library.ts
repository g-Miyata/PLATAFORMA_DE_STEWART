// Biblioteca de gravações (linhas do tempo). Fica no localStorage deste navegador;
// para levar a outro computador, use Exportar/Importar (.json).
import { create } from 'zustand';
import { DEFAULT_GEOMETRY } from '@/features/platform3d/geometry';
import type { Pose } from '@/lib/types';
import { normalizeKeys, type Interp, type Keyframe } from './trajectory';

export interface Recording {
  id: string;
  name: string;
  interp: Interp;
  keys: Keyframe[];
  loop: boolean;
  speed: number;
  updated: number;
  /** exemplos embutidos: só leitura (editar cria uma cópia) */
  example?: boolean;
}

const STORAGE_KEY = 'stewart-recordings';
const FILE_VERSION = 1;

const HOME_Z = DEFAULT_GEOMETRY.home_z;

const newId = () => `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

const home = (z = HOME_Z): Pose => ({ x: 0, y: 0, z, roll: 0, pitch: 0, yaw: 0 });
const at = (t: number, p: Partial<Pose>): Keyframe => ({ t, pose: { ...home(), ...p } });

/** Exemplos lentos o bastante para os atuadores reais (~12 mm/s); conferidos nos testes. */
export const EXAMPLES: Recording[] = [
  {
    id: 'ex-aceno',
    name: 'Aceno (roll)',
    interp: 'suave',
    loop: false,
    speed: 1,
    updated: 0,
    example: true,
    keys: [at(0, {}), at(3, { roll: 3 }), at(8, { roll: -3 }), at(13, { roll: 3 }), at(18, { roll: -3 }), at(21, {})],
  },
  {
    id: 'ex-oito',
    name: '“8” no plano XY',
    interp: 'suave',
    loop: false,
    speed: 1,
    updated: 0,
    example: true,
    keys: Array.from({ length: 25 }, (_, i) => {
      const a = (i / 24) * 2 * Math.PI;
      return at(i, { x: 25 * Math.sin(a), y: 15 * Math.sin(2 * a) });
    }),
  },
  {
    id: 'ex-onda',
    name: 'Onda (altura + pitch)',
    interp: 'suave',
    loop: false,
    speed: 1,
    updated: 0,
    example: true,
    keys: [
      at(0, {}),
      at(5, { z: HOME_Z + 12, pitch: 2 }),
      at(12, { z: HOME_Z - 8, pitch: -2 }),
      at(19, { z: HOME_Z + 12, pitch: 2 }),
      at(26, { z: HOME_Z - 8, pitch: -2 }),
      at(31, {}),
    ],
  },
];

function load(): { items: Recording[]; activeId: string | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { items: [], activeId: null };
    const data = JSON.parse(raw) as { items?: Recording[]; activeId?: string | null };
    return { items: (data.items ?? []).filter(isRecording), activeId: data.activeId ?? null };
  } catch {
    return { items: [], activeId: null };
  }
}

function isPose(p: unknown): p is Pose {
  const o = p as Record<string, unknown>;
  return !!o && ['x', 'y', 'z', 'roll', 'pitch', 'yaw'].every((k) => typeof o[k] === 'number' && Number.isFinite(o[k]));
}

function isRecording(r: unknown): r is Recording {
  const o = r as Recording;
  return !!o && typeof o.name === 'string' && Array.isArray(o.keys) && o.keys.length > 0 && o.keys.every((k) => typeof k.t === 'number' && isPose(k.pose));
}

interface LibraryState {
  items: Recording[];
  activeId: string | null;
  create: (partial?: Partial<Omit<Recording, 'id'>>) => Recording;
  update: (id: string, patch: Partial<Omit<Recording, 'id'>>) => void;
  remove: (id: string) => void;
  duplicate: (id: string) => Recording | null;
  setActive: (id: string | null) => void;
  /** acrescenta uma pose-chave ao fim da gravação aberta (cria um rascunho se não houver) */
  appendKey: (pose: Pose, gapS?: number) => Recording;
  /** lê um arquivo exportado; devolve quantas gravações entraram */
  importJson: (text: string) => number;
}

export const findRecording = (id: string | null): Recording | null =>
  id ? (useLibrary.getState().items.find((r) => r.id === id) ?? EXAMPLES.find((r) => r.id === id) ?? null) : null;

export const useLibrary = create<LibraryState>((set, get) => ({
  ...load(),
  create: (partial = {}) => {
    const rec: Recording = {
      name: 'Nova gravação',
      interp: 'suave',
      keys: [at(0, {})],
      loop: false,
      speed: 1,
      ...partial,
      id: newId(),
      updated: Date.now(),
      example: false,
    };
    set((s) => ({ items: [rec, ...s.items], activeId: rec.id }));
    return rec;
  },
  update: (id, patch) =>
    set((s) => ({ items: s.items.map((r) => (r.id === id ? { ...r, ...patch, updated: Date.now() } : r)) })),
  remove: (id) => set((s) => ({ items: s.items.filter((r) => r.id !== id), activeId: s.activeId === id ? null : s.activeId })),
  duplicate: (id) => {
    const src = findRecording(id);
    if (!src) return null;
    return get().create({ ...src, name: src.example ? src.name : `${src.name} (cópia)`, keys: src.keys.map((k) => ({ t: k.t, pose: { ...k.pose } })) });
  },
  setActive: (activeId) => set({ activeId }),
  appendKey: (pose, gapS = 2) => {
    const active = findRecording(get().activeId);
    if (!active || active.example) {
      return get().create({ name: 'Rascunho', keys: [at(0, pose)] });
    }
    const lastT = active.keys[active.keys.length - 1]?.t ?? 0;
    const keys = [...active.keys, { t: lastT + gapS, pose: { ...pose } }];
    get().update(active.id, { keys });
    return { ...active, keys };
  },
  importJson: (text) => {
    const data = JSON.parse(text) as { recordings?: unknown[] } | unknown[];
    const list = Array.isArray(data) ? data : (data.recordings ?? []);
    const valid = list.filter(isRecording);
    for (const r of valid) get().create({ ...r, keys: normalizeKeys(r.keys) });
    return valid.length;
  },
}));

/** Conteúdo do arquivo .json para exportar gravações. */
export function exportJson(recs: Recording[]) {
  return JSON.stringify(
    { app: 'plataforma-de-stewart', version: FILE_VERSION, recordings: recs.map(({ name, interp, keys, loop, speed }) => ({ name, interp, keys, loop, speed })) },
    null,
    2,
  );
}

// salva a cada mudança (a biblioteca é pequena: poses-chave, não amostras)
useLibrary.subscribe((s) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ items: s.items, activeId: s.activeId }));
  } catch {
    /* modo privado / cota cheia: segue só em memória */
  }
});
