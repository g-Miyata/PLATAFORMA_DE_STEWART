// Espaço de trabalho: onde o centro do tampo consegue chegar com os limites reais
// (lib/limits.ts, iguais aos do backend): curso de operação das pernas, ângulo dos
// cardãs da base e do tampo e folga entre pernas. A "margem" de uma pose é a menor
// folga até esses limites, em mm (ângulos convertidos a MM_PER_DEG): negativa = pose
// impossível.
import { PAIRS, resolveLimits } from '@/lib/limits';
import type { PlatformGeometry, Pose } from '@/lib/types';

const DEG = Math.PI / 180;
/** peso de 1° de folga de cardã na margem (para comparar com mm de curso) */
export const MM_PER_DEG = 5;

/** Qual limite está mais perto: 0 curso, 1 cardã da base, 2 cardã do tampo, 3 folga entre pernas. */
export type LimitCode = 0 | 1 | 2 | 3;
export const LIMIT_LABELS = ['Curso do atuador', 'Cardã da base', 'Cardã do tampo', 'Folga entre pernas'] as const;

export type MarginFn = (x: number, y: number, z: number, roll: number, pitch: number, yaw: number) => number;

/**
 * Margem sem alocações (mesma R = Rz·Ry·Rx e mesmas contas de lib/limits.ts), para
 * varreduras grandes. `lastLimit()` diz qual limite deu a margem da última chamada.
 */
export function makeLimiter(geom: PlatformGeometry): { margin: MarginFn; lastLimit: () => LimitCode } {
  const b = geom.base_points.flat();
  const p = geom.platform_points_local.flat();
  const { op, normals, zone } = resolveLimits(geom);
  const n = normals.flat();
  const lo = op.stroke_min;
  const hi = op.stroke_max;
  const cb = op.cardan_base_max_deg;
  const ct = op.cardan_top_max_deg;
  const dmin = op.min_axis_distance_mm;
  const A = new Float64Array(18);
  const E = new Float64Array(18);
  let last: LimitCode = 0;

  const segDist = (i: number, j: number) => {
    const ax = A[i * 3], ay = A[i * 3 + 1], az = A[i * 3 + 2];
    const cx = A[j * 3], cy = A[j * 3 + 1], cz = A[j * 3 + 2];
    const d1x = E[i * 3] - ax, d1y = E[i * 3 + 1] - ay, d1z = E[i * 3 + 2] - az;
    const d2x = E[j * 3] - cx, d2y = E[j * 3 + 1] - cy, d2z = E[j * 3 + 2] - cz;
    const rx = ax - cx, ry = ay - cy, rz = az - cz;
    const a = d1x * d1x + d1y * d1y + d1z * d1z;
    const e = d2x * d2x + d2y * d2y + d2z * d2z;
    const f = d2x * rx + d2y * ry + d2z * rz;
    const c = d1x * rx + d1y * ry + d1z * rz;
    const bb = d1x * d2x + d1y * d2y + d1z * d2z;
    const den = a * e - bb * bb;
    let s = den > 1e-9 ? Math.min(1, Math.max(0, (bb * f - c * e) / den)) : 0;
    let t = e > 1e-9 ? (bb * s + f) / e : 0;
    if (t < 0) {
      t = 0;
      s = a > 1e-9 ? Math.min(1, Math.max(0, -c / a)) : 0;
    } else if (t > 1) {
      t = 1;
      s = a > 1e-9 ? Math.min(1, Math.max(0, (bb - c) / a)) : 0;
    }
    const x = ax + d1x * s - (cx + d2x * t);
    const y = ay + d1y * s - (cy + d2y * t);
    const z = az + d1z * s - (cz + d2z * t);
    return Math.sqrt(x * x + y * y + z * z);
  };

  const margin: MarginFn = (x, y, z, roll, pitch, yaw) => {
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
    last = 0;
    for (let i = 0; i < 6; i++) {
      const px = p[i * 3];
      const py = p[i * 3 + 1];
      const pz = p[i * 3 + 2];
      const tx = r00 * px + r01 * py + r02 * pz + x;
      const ty = r10 * px + r11 * py + r12 * pz + y;
      const tz = r20 * px + r21 * py + r22 * pz + z;
      const dx = tx - b[i * 3];
      const dy = ty - b[i * 3 + 1];
      const dz = tz - b[i * 3 + 2];
      const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const ux = dx / L;
      const uy = dy / L;
      const uz = dz / L;
      const fs = Math.min(L - lo, hi - L);
      if (fs < m) [m, last] = [fs, 0];
      const base = Math.acos(Math.max(-1, Math.min(1, ux * n[i * 3] + uy * n[i * 3 + 1] + uz * n[i * 3 + 2]))) / DEG;
      const fb = (cb - base) * MM_PER_DEG;
      if (fb < m) [m, last] = [fb, 1];
      const top = Math.acos(Math.max(-1, Math.min(1, ux * r02 + uy * r12 + uz * r22))) / DEG;
      const ft = (ct - top) * MM_PER_DEG;
      if (ft < m) [m, last] = [ft, 2];
      A[i * 3] = b[i * 3] + ux * zone;
      A[i * 3 + 1] = b[i * 3 + 1] + uy * zone;
      A[i * 3 + 2] = b[i * 3 + 2] + uz * zone;
      E[i * 3] = tx - ux * zone;
      E[i * 3 + 1] = ty - uy * zone;
      E[i * 3 + 2] = tz - uz * zone;
    }
    for (const [i, j] of PAIRS) {
      const fd = segDist(i, j) - dmin;
      if (fd < m) [m, last] = [fd, 3];
    }
    return m;
  };
  return { margin, lastLimit: () => last };
}

export function makeMargin(geom: PlatformGeometry): MarginFn {
  return makeLimiter(geom).margin;
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
  /** qual limite está mais perto em cada nó (LimitCode) */
  limit: Uint8Array;
}

/** Caixa varrida: cobre com folga o que o tampo alcança (nivelado: X ±270, Y ±235, Z 435–630 mm). */
export const SWEEP = { half: 320, z0: 380, z1: 700 } as const;

export function positionField(geom: PlatformGeometry, o: Orientation, size: number): Grid {
  const { margin, lastLimit } = makeLimiter(geom);
  const sxy = (2 * SWEEP.half) / (size - 1);
  const sz = (SWEEP.z1 - SWEEP.z0) / (size - 1);
  const origin: [number, number, number] = [-SWEEP.half, -SWEEP.half, SWEEP.z0];
  const data = new Float32Array(size * size * size);
  const limit = new Uint8Array(size * size * size);
  let k = 0;
  for (let iz = 0; iz < size; iz++) {
    const z = origin[2] + iz * sz;
    for (let iy = 0; iy < size; iy++) {
      const y = origin[1] + iy * sxy;
      for (let ix = 0; ix < size; ix++) {
        data[k] = margin(origin[0] + ix * sxy, y, z, o.roll, o.pitch, o.yaw);
        limit[k++] = lastLimit();
      }
    }
  }
  return { size, steps: [sxy, sxy, sz], origin, data, limit };
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
