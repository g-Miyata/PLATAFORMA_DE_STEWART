import { useEffect, useRef, useState } from 'react';
import type { PlatformGeometry } from '@/lib/types';
import type { Grid, Orientation, gridExtent } from './workspace';
import type { WorkerJob } from './workspace.worker';

export interface PositionResult {
  grid: Grid;
  volume: number;
  extent: ReturnType<typeof gridExtent>;
}

type Pending = { resolve: (v: unknown) => void };

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

function run<T>(req: WorkerJob): Promise<T> {
  worker ??= (() => {
    const w = new Worker(new URL('./workspace.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<{ id: number }>) => {
      pending.get(e.data.id)?.resolve(e.data);
      pending.delete(e.data.id);
    };
    return w;
  })();
  const id = nextId++;
  return new Promise<T>((resolve) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void });
    worker!.postMessage({ ...req, id });
  });
}

/** Resultado do worker para `request`, recalculado 250 ms depois da última mudança. */
function useWorkerResult<T>(key: string, request: WorkerJob | null): { data: T | null; busy: boolean } {
  const [state, setState] = useState<{ key: string; data: T | null }>({ key: '', data: null });
  const latest = useRef(key);
  useEffect(() => {
    latest.current = key;
    if (!request) return;
    const t = setTimeout(() => {
      void run<T>(request).then((data) => {
        // descarta respostas de pedidos que já mudaram
        if (latest.current === key) setState({ key, data });
      });
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { data: state.data, busy: state.key !== key };
}

export function usePositionField(geom: PlatformGeometry, orient: Orientation, size: number) {
  const key = JSON.stringify([geom.stroke_min, geom.stroke_max, geom.home_z, orient.roll, orient.pitch, orient.yaw, size]);
  return useWorkerResult<PositionResult>(key, { kind: 'position', geom, orient, size });
}

export function useTiltField(geom: PlatformGeometry, pos: { x: number; y: number; z: number }, yaw: number, enabled: boolean) {
  const key = JSON.stringify([geom.stroke_min, geom.stroke_max, pos.x, pos.y, pos.z, yaw, enabled]);
  return useWorkerResult<{ tilt: { phi: number; max: number }[] }>(key, enabled ? { kind: 'tilt', geom, pos, yaw } : null);
}
