// Espaço de trabalho: onde o centro do tampo consegue chegar, considerando só o
// curso dos pistões. A "margem" de uma pose é a menor folga (mm) entre as seis
// pernas e os batentes: negativa = pose impossível.
import type { PlatformGeometry, Pose } from '@/lib/types';

const DEG = Math.PI / 180;

export type MarginFn = (x: number, y: number, z: number, roll: number, pitch: number, yaw: number) => number;

/** Margem sem alocações (mesma R = Rz·Ry·Rx de lib/kinematics.ts), para varreduras grandes. */
export function makeMargin(geom: PlatformGeometry): MarginFn {
  const b = geom.base_points.flat();
  const p = geom.platform_points_local.flat();
  const lo = geom.stroke_min;
  const hi = geom.stroke_max;
  return (x, y, z, roll, pitch, yaw) => {
    const cr = Math.cos(roll * DEG);
    const sr = Math.sin(roll * DEG);
    const cp = Math.cos(pitch * DEG);
    const sp = Math.sin(pitch * DEG);
    const cy = Math.cos(yaw * DEG);
    const sy = Math.sin(yaw * DEG);
    const r00 = cy * cp;
    const r01 = cy * sp * sr - sy * cr;
    const r02 = cy * sp * cr + sy * sr;
    const r10 = sy * cp;
    const r11 = sy * sp * sr + cy * cr;
    const r12 = sy * sp * cr - cy * sr;
    const r20 = -sp;
    const r21 = cp * sr;
    const r22 = cp * cr;
    let m = Infinity;
    for (let i = 0; i < 6; i++) {
      const px = p[i * 3];
      const py = p[i * 3 + 1];
      const pz = p[i * 3 + 2];
      const dx = r00 * px + r01 * py + r02 * pz + x - b[i * 3];
      const dy = r10 * px + r11 * py + r12 * pz + y - b[i * 3 + 1];
      const dz = r20 * px + r21 * py + r22 * pz + z - b[i * 3 + 2];
      const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const f = Math.min(L - lo, hi - L);
      if (f < m) m = f;
    }
    return m;
  };
}

export interface Orientation {
  roll: number;
  pitch: number;
  yaw: number;
}

/**
 * Grade com o mesmo número de nós nos três eixos (o MarchingCubes pede) e passo
 * próprio por eixo: o volume alcançável é largo em X/Y e baixo em Z.
 */
export interface Grid {
  size: number;
  steps: [number, number, number];
  /** canto (índice 0,0,0) em mm */
  origin: [number, number, number];
  /** margem em cada nó; índice = x + size·(y + size·z) */
  data: Float32Array;
}

/** Caixa varrida: cobre com folga o que o tampo alcança (nivelado: X ±270, Y ±235, Z 435–630 mm). */
export const SWEEP = { half: 320, z0: 380, z1: 700 } as const;

export function positionField(geom: PlatformGeometry, o: Orientation, size: number): Grid {
  const margin = makeMargin(geom);
  const sxy = (2 * SWEEP.half) / (size - 1);
  const sz = (SWEEP.z1 - SWEEP.z0) / (size - 1);
  const origin: [number, number, number] = [-SWEEP.half, -SWEEP.half, SWEEP.z0];
  const data = new Float32Array(size * size * size);
  let k = 0;
  for (let iz = 0; iz < size; iz++) {
    const z = origin[2] + iz * sz;
    for (let iy = 0; iy < size; iy++) {
      const y = origin[1] + iy * sxy;
      for (let ix = 0; ix < size; ix++) data[k++] = margin(origin[0] + ix * sxy, y, z, o.roll, o.pitch, o.yaw);
    }
  }
  return { size, steps: [sxy, sxy, sz], origin, data };
}

/** Volume alcançável em litros (nós com margem ≥ 0). */
export function volumeLiters(g: Grid): number {
  let n = 0;
  for (let i = 0; i < g.data.length; i++) if (g.data[i] >= 0) n++;
  return (n * g.steps[0] * g.steps[1] * g.steps[2]) / 1e6;
}

/** Faixa de Z alcançável e extensão em X/Y numa grade (para a leitura do HUD). */
export function gridExtent(g: Grid) {
  const e = { x: [Infinity, -Infinity], y: [Infinity, -Infinity], z: [Infinity, -Infinity] } as Record<'x' | 'y' | 'z', [number, number]>;
  let k = 0;
  for (let iz = 0; iz < g.size; iz++)
    for (let iy = 0; iy < g.size; iy++)
      for (let ix = 0; ix < g.size; ix++, k++) {
        if (g.data[k] < 0) continue;
        const c = [g.origin[0] + ix * g.steps[0], g.origin[1] + iy * g.steps[1], g.origin[2] + iz * g.steps[2]];
        (['x', 'y', 'z'] as const).forEach((a, i) => {
          e[a][0] = Math.min(e[a][0], c[i]);
          e[a][1] = Math.max(e[a][1], c[i]);
        });
      }
  return e;
}

/** Maior valor em [0, max] tal que ok(v) ainda vale (supõe ok(0) e região conexa). */
function bisect(ok: (v: number) => boolean, max: number, iters = 30) {
  if (ok(max)) return max;
  let a = 0;
  let b = max;
  for (let i = 0; i < iters; i++) {
    const m = (a + b) / 2;
    if (ok(m)) a = m;
    else b = m;
  }
  return a;
}

export type ReachAxis = keyof Pose;
export type Reach = Record<ReachAxis, [number, number]>;

/** Alcance de cada eixo sozinho a partir de uma pose (os outros cinco fixos). */
export function axisReach(geom: PlatformGeometry, from: Pose): Reach {
  const margin = makeMargin(geom);
  const at = (p: Pose) => margin(p.x, p.y, p.z, p.roll, p.pitch, p.yaw) >= 0;
  const out = {} as Reach;
  for (const axis of ['x', 'y', 'z', 'roll', 'pitch', 'yaw'] as const) {
    const max = axis === 'roll' || axis === 'pitch' || axis === 'yaw' ? 60 : 300;
    const dir = (s: number) => bisect((v) => at({ ...from, [axis]: from[axis] + s * v }), max);
    out[axis] = [from[axis] - dir(-1), from[axis] + dir(1)];
  }
  return out;
}

/** Inclinação máxima (°) em cada direção φ, numa posição: roll = θ·cos φ, pitch = θ·sen φ. */
export function tiltField(geom: PlatformGeometry, pos: { x: number; y: number; z: number }, yaw: number, directions = 72): { phi: number; max: number }[] {
  const margin = makeMargin(geom);
  if (margin(pos.x, pos.y, pos.z, 0, 0, yaw) < 0) return Array.from({ length: directions }, (_, i) => ({ phi: (i / directions) * 360, max: 0 }));
  return Array.from({ length: directions }, (_, i) => {
    const phi = (i / directions) * 2 * Math.PI;
    const max = bisect((t) => margin(pos.x, pos.y, pos.z, t * Math.cos(phi), t * Math.sin(phi), yaw) >= 0, 45);
    return { phi: (phi * 180) / Math.PI, max };
  });
}
