// Varreduras pesadas fora da thread principal (a página continua fluida).
import type { PlatformGeometry } from '@/lib/types';
import { gridExtent, positionField, tiltField, volumeLiters, type Orientation } from './workspace';

export type WorkerRequest =
  | { id: number; kind: 'position'; geom: PlatformGeometry; orient: Orientation; size: number }
  | { id: number; kind: 'tilt'; geom: PlatformGeometry; pos: { x: number; y: number; z: number }; yaw: number };

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  if (req.kind === 'position') {
    const grid = positionField(req.geom, req.orient, req.size);
    const msg = { id: req.id, kind: req.kind, grid, volume: volumeLiters(grid), extent: gridExtent(grid) };
    self.postMessage(msg, { transfer: [grid.data.buffer, grid.limit.buffer] });
  } else {
    self.postMessage({ id: req.id, kind: req.kind, tilt: tiltField(req.geom, req.pos, req.yaw) });
  }
};

/** Pedido sem o id (Omit distributivo: mantém os campos de cada variante). */
export type WorkerJob = WorkerRequest extends infer R ? (R extends WorkerRequest ? Omit<R, 'id'> : never) : never;
