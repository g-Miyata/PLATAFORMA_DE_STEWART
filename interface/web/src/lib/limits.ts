// Limites reais da mecânica, iguais aos do backend (interface/backend/limits.py):
// curso de cada perna, ângulo dos cardãs da base e do tampo e folga entre pernas,
// com a margem de operação (20%). O teste limits.test.ts confere contra o Python.
import type { Pose, Vec3 } from './types';

export type LegReason = 'curso' | 'cardan_base' | 'cardan_topo' | 'folga';
export type PoseKey = 'x' | 'y' | 'z' | 'roll' | 'pitch' | 'yaw';

export const REASON_TEXT: Record<LegReason, string> = {
  curso: 'fora do curso do atuador',
  cardan_base: 'cardã da base no limite',
  cardan_topo: 'cardã do tampo no limite',
  folga: 'pernas perto de encostar',
};

export interface JointLimitValues {
  stroke_min: number;
  stroke_max: number;
  cardan_base_max_deg: number;
  cardan_top_max_deg: number;
  leg_radius_mm: number;
  leg_clearance_mm: number;
  joint_zone_mm: number;
  margin: number;
  home_z: number | null;
  note: string;
}

export interface CheckLimits {
  stroke_min: number;
  stroke_max: number;
  cardan_base_max_deg: number;
  cardan_top_max_deg: number;
  min_axis_distance_mm: number;
}

export interface LimitsInfo {
  physical: CheckLimits;
  operational: CheckLimits;
  values: JointLimitValues;
  ranges: Record<string, [number, number]>;
  reach: Record<PoseKey, [number, number]>;
  tilt_deg: number;
  home_z: number;
  seat_normals: Vec3[];
}

export const DEFAULT_LIMIT_VALUES: JointLimitValues = {
  stroke_min: 500,
  stroke_max: 750,
  cardan_base_max_deg: 45,
  cardan_top_max_deg: 45,
  leg_radius_mm: 23,
  leg_clearance_mm: 5,
  joint_zone_mm: 60,
  margin: 0.2,
  home_z: null,
  note: '',
};

const minAxisDistance = (v: JointLimitValues) => 2 * v.leg_radius_mm + v.leg_clearance_mm;

export function physicalLimits(v: JointLimitValues): CheckLimits {
  return {
    stroke_min: v.stroke_min,
    stroke_max: v.stroke_max,
    cardan_base_max_deg: v.cardan_base_max_deg,
    cardan_top_max_deg: v.cardan_top_max_deg,
    min_axis_distance_mm: minAxisDistance(v),
  };
}

export function operationalLimits(v: JointLimitValues): CheckLimits {
  const m = v.margin;
  const rng = v.stroke_max - v.stroke_min;
  return {
    stroke_min: v.stroke_min + (rng * m) / 2,
    stroke_max: v.stroke_max - (rng * m) / 2,
    cardan_base_max_deg: v.cardan_base_max_deg * (1 - m),
    cardan_top_max_deg: v.cardan_top_max_deg * (1 - m),
    min_axis_distance_mm: minAxisDistance(v) * (1 + m),
  };
}

// assento do cardã da base (face do bloco azul): para dentro, para longe da vizinha, para cima
const SEAT = [0.45, 0.44, 0.78] as const;

export function seatNormals(base: readonly Vec3[]): Vec3[] {
  return base.map((b, i) => {
    let j = -1;
    let best = Infinity;
    base.forEach((c, k) => {
      if (k === i) return;
      const d = Math.hypot(c[0] - b[0], c[1] - b[1]);
      if (d < best) [best, j] = [d, k];
    });
    const r = Math.hypot(b[0], b[1]);
    const radial = [b[0] / r, b[1] / r];
    const ax = b[0] - base[j][0];
    const ay = b[1] - base[j][1];
    const al = Math.hypot(ax, ay);
    const v: Vec3 = [-SEAT[0] * radial[0] + (SEAT[1] * ax) / al, -SEAT[0] * radial[1] + (SEAT[1] * ay) / al, SEAT[2]];
    const n = Math.hypot(...v);
    return [v[0] / n, v[1] / n, v[2] / n];
  });
}

export const PAIRS: [number, number][] = [];
for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) PAIRS.push([i, j]);

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Menor distância entre os segmentos p1–q1 e p2–q2 (mesma conta do backend). */
export function segmentDistance(p1: Vec3, q1: Vec3, p2: Vec3, q2: Vec3): number {
  const d1 = [q1[0] - p1[0], q1[1] - p1[1], q1[2] - p1[2]];
  const d2 = [q2[0] - p2[0], q2[1] - p2[1], q2[2] - p2[2]];
  const r = [p1[0] - p2[0], p1[1] - p2[1], p1[2] - p2[2]];
  const dot = (u: number[], w: number[]) => u[0] * w[0] + u[1] * w[1] + u[2] * w[2];
  const a = dot(d1, d1);
  const e = dot(d2, d2);
  const f = dot(d2, r);
  const c = dot(d1, r);
  const b = dot(d1, d2);
  const denom = a * e - b * b;
  let s = denom > 1e-9 ? clamp01((b * f - c * e) / denom) : 0;
  let t = e > 1e-9 ? (b * s + f) / e : 0;
  if (t < 0) {
    t = 0;
    s = a > 1e-9 ? clamp01(-c / a) : 0;
  } else if (t > 1) {
    t = 1;
    s = a > 1e-9 ? clamp01((b - c) / a) : 0;
  }
  const x = p1[0] + d1[0] * s - (p2[0] + d2[0] * t);
  const y = p1[1] + d1[1] * s - (p2[1] + d2[1] * t);
  const z = p1[2] + d1[2] * s - (p2[2] + d2[2] * t);
  return Math.hypot(x, y, z);
}

export interface LimitGeometry {
  base_points: readonly Vec3[];
  platform_points_local: readonly Vec3[];
  limits?: LimitsInfo;
  /**
   * Eixo do assento de cada cardã do tampo, no referencial do tampo (unitário, "para cima").
   * Sem ele, o cardã é medido contra a normal do tampo (montagem de hoje); o laboratório
   * do calço usa para simular um assento inclinado.
   */
  top_seat_normals_local?: readonly Vec3[];
}

interface Resolved {
  op: CheckLimits;
  phys: CheckLimits;
  normals: Vec3[];
  zone: number;
}

const cache = new WeakMap<object, Resolved>();

/** Limites de uma geometria (do /config; sem eles, os padrões de limits.json). */
export function resolveLimits(geom: LimitGeometry): Resolved {
  const hit = cache.get(geom);
  if (hit) return hit;
  const v = geom.limits?.values ?? DEFAULT_LIMIT_VALUES;
  const r: Resolved = {
    op: geom.limits?.operational ?? operationalLimits(v),
    phys: geom.limits?.physical ?? physicalLimits(v),
    normals: geom.limits?.seat_normals ?? seatNormals(geom.base_points),
    zone: v.joint_zone_mm,
  };
  cache.set(geom, r);
  return r;
}

const DEG = 180 / Math.PI;

export interface PoseMeasure {
  top: Vec3[];
  lengths: number[];
  base: number[];
  topDeg: number[];
  /** distância entre eixos para cada par de PAIRS */
  dist: number[];
}

/** Medidas brutas de uma pose (juntas do tampo, comprimentos, ângulos dos cardãs, distâncias). */
export function measurePose(pose: Pose, geom: LimitGeometry): PoseMeasure {
  const { normals, zone } = resolveLimits(geom);
  const d = Math.PI / 180;
  const [cr, sr, cp, sp, cy, sy] = [Math.cos(pose.roll * d), Math.sin(pose.roll * d), Math.cos(pose.pitch * d), Math.sin(pose.pitch * d), Math.cos(pose.yaw * d), Math.sin(pose.yaw * d)];
  // R = Rz·Ry·Rx (linhas); a normal do tampo é a 3ª coluna
  const m = [cy * cp, cy * sp * sr - sy * cr, cy * sp * cr + sy * sr, sy * cp, sy * sp * sr + cy * cr, sy * sp * cr - cy * sr, -sp, cp * sr, cp * cr];
  const nz: Vec3 = [m[2], m[5], m[8]];
  const top: Vec3[] = geom.platform_points_local.map(([px, py, pz]) => [
    m[0] * px + m[1] * py + m[2] * pz + pose.x,
    m[3] * px + m[4] * py + m[5] * pz + pose.y,
    m[6] * px + m[7] * py + m[8] * pz + pose.z,
  ]);
  const lengths: number[] = [];
  const base: number[] = [];
  const topDeg: number[] = [];
  const a: Vec3[] = [];
  const b: Vec3[] = [];
  geom.base_points.forEach((B, i) => {
    const s: Vec3 = [top[i][0] - B[0], top[i][1] - B[1], top[i][2] - B[2]];
    const L = Math.hypot(...s);
    const u: Vec3 = [s[0] / L, s[1] / L, s[2] / L];
    lengths.push(L);
    const n = normals[i];
    base.push(Math.acos(Math.max(-1, Math.min(1, u[0] * n[0] + u[1] * n[1] + u[2] * n[2]))) * DEG);
    const sl = geom.top_seat_normals_local?.[i];
    const t: Vec3 = sl ? [m[0] * sl[0] + m[1] * sl[1] + m[2] * sl[2], m[3] * sl[0] + m[4] * sl[1] + m[5] * sl[2], m[6] * sl[0] + m[7] * sl[1] + m[8] * sl[2]] : nz;
    topDeg.push(Math.acos(Math.max(-1, Math.min(1, u[0] * t[0] + u[1] * t[1] + u[2] * t[2]))) * DEG);
    a.push([B[0] + u[0] * zone, B[1] + u[1] * zone, B[2] + u[2] * zone]);
    b.push([top[i][0] - u[0] * zone, top[i][1] - u[1] * zone, top[i][2] - u[2] * zone]);
  });
  const dist = PAIRS.map(([i, j]) => segmentDistance(a[i], b[i], a[j], b[j]));
  return { top, lengths, base, topDeg, dist };
}

export interface PoseCheck extends PoseMeasure {
  /** motivos de recusa de cada perna (limites de operação) */
  reasons: LegReason[][];
  valid: boolean;
  physicalOk: boolean;
  closestPair: [number, number];
  closestDistance: number;
  /** folga até cada limite de operação (negativo = passou) */
  margins: { stroke_mm: number; cardan_base_deg: number; cardan_top_deg: number; distance_mm: number };
}

function flags(m: PoseMeasure, lim: CheckLimits): LegReason[][] {
  const out: LegReason[][] = m.lengths.map((L, i) => {
    const r: LegReason[] = [];
    if (L < lim.stroke_min || L > lim.stroke_max) r.push('curso');
    if (m.base[i] > lim.cardan_base_max_deg) r.push('cardan_base');
    if (m.topDeg[i] > lim.cardan_top_max_deg) r.push('cardan_topo');
    return r;
  });
  PAIRS.forEach(([i, j], k) => {
    if (m.dist[k] < lim.min_axis_distance_mm) {
      if (!out[i].includes('folga')) out[i].push('folga');
      if (!out[j].includes('folga')) out[j].push('folga');
    }
  });
  return out;
}

export function checkPose(pose: Pose, geom: LimitGeometry): PoseCheck {
  const { op, phys } = resolveLimits(geom);
  const m = measurePose(pose, geom);
  const reasons = flags(m, op);
  const physicalOk = flags(m, phys).every((r) => r.length === 0);
  let k = 0;
  m.dist.forEach((d, i) => d < m.dist[k] && (k = i));
  return {
    ...m,
    reasons,
    valid: reasons.every((r) => r.length === 0),
    physicalOk,
    closestPair: [PAIRS[k][0] + 1, PAIRS[k][1] + 1],
    closestDistance: m.dist[k],
    margins: {
      stroke_mm: Math.min(...m.lengths.map((L) => Math.min(L - op.stroke_min, op.stroke_max - L))),
      cardan_base_deg: op.cardan_base_max_deg - Math.max(...m.base),
      cardan_top_deg: op.cardan_top_max_deg - Math.max(...m.topDeg),
      distance_mm: Math.min(...m.dist) - op.min_axis_distance_mm,
    },
  };
}

/** Frase com o primeiro motivo de recusa (null = pose aceita). */
export function reasonText(c: PoseCheck): string | null {
  for (let i = 0; i < 6; i++) {
    const r = c.reasons[i][0];
    if (!r) continue;
    if (r === 'folga') return `pernas ${c.closestPair[0]} e ${c.closestPair[1]} perto de encostar`;
    return `pistão ${i + 1}: ${REASON_TEXT[r]}`;
  }
  return null;
}

const KEYS: PoseKey[] = ['x', 'y', 'z', 'roll', 'pitch', 'yaw'];

/**
 * Traz a pose para dentro dos limites ao longo da reta até o neutro (controles ao vivo:
 * joystick, giroscópio, jogo). Devolve a pose e se precisou limitar.
 */
export function limitPose(pose: Pose, geom: LimitGeometry, neutral?: Pose): { pose: Pose; limited: boolean } {
  if (checkPose(pose, geom).valid) return { pose, limited: false };
  const n = neutral ?? { x: 0, y: 0, z: pose.z, roll: 0, pitch: 0, yaw: 0 };
  if (!checkPose(n, geom).valid) return { pose: n, limited: true };
  let lo = 0;
  let hi = 1;
  const at = (k: number) => Object.fromEntries(KEYS.map((key) => [key, n[key] + (pose[key] - n[key]) * k])) as unknown as Pose;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (checkPose(at(mid), geom).valid) lo = mid;
    else hi = mid;
  }
  return { pose: at(lo), limited: true };
}

/** Alcance de operação de cada eixo a partir do home (sem /config, calculado aqui). */
export function computeReach(geom: LimitGeometry, home: Pose): Record<PoseKey, [number, number]> {
  const reach = {} as Record<PoseKey, [number, number]>;
  for (const k of KEYS) {
    const side = (sign: number) => {
      let lo = 0;
      let hi = k === 'x' || k === 'y' || k === 'z' ? 400 : 60;
      for (let i = 0; i < 32; i++) {
        const mid = (lo + hi) / 2;
        if (checkPose({ ...home, [k]: home[k] + sign * mid }, geom).valid) lo = mid;
        else hi = mid;
      }
      return lo;
    };
    reach[k] = [-side(-1), side(1)];
  }
  return reach;
}

// ---------------------------------------------------------------- limites para a interface
export interface UiLimits {
  /** comprimentos de operação das pernas (mm) */
  stroke: [number, number];
  /** curso de operação do atuador (mm, 0 = recolhido) */
  course: [number, number];
  /** alcance de cada eixo a partir do home (deslocamento) */
  reach: Record<PoseKey, [number, number]>;
  /** faixa absoluta de cada eixo para sliders (z já somado ao home) */
  pose: Record<PoseKey, [number, number]>;
  /** inclinação máxima em qualquer direção (°) */
  tilt: number;
  home: number;
}

const uiCache = new WeakMap<object, UiLimits>();
// arredonda para dentro (nunca passa do alcance)
const inward = ([lo, hi]: [number, number], step: number): [number, number] => [Math.ceil(lo / step) * step, Math.floor(hi / step) * step];

/** Limites prontos para sliders e controles, a partir do /config (ou calculados aqui). */
export function uiLimits(geom: LimitGeometry & { stroke_min: number; home_z: number }): UiLimits {
  const hit = uiCache.get(geom);
  if (hit) return hit;
  const { op } = resolveLimits(geom);
  const home = geom.limits?.home_z ?? geom.home_z;
  const reach = geom.limits?.reach ?? computeReach(geom, { x: 0, y: 0, z: home, roll: 0, pitch: 0, yaw: 0 });
  const pose = {} as Record<PoseKey, [number, number]>;
  for (const k of KEYS) {
    const trans = k === 'x' || k === 'y' || k === 'z';
    const r = inward(reach[k], trans ? 1 : 0.5);
    pose[k] = k === 'z' ? [home + r[0], home + r[1]] : r;
  }
  const tilt = geom.limits?.tilt_deg ?? Math.min(-reach.roll[0], reach.roll[1], -reach.pitch[0], reach.pitch[1]);
  const out: UiLimits = {
    stroke: [op.stroke_min, op.stroke_max],
    course: [op.stroke_min - geom.stroke_min, op.stroke_max - geom.stroke_min],
    reach,
    pose,
    tilt,
    home,
  };
  uiCache.set(geom, out);
  return out;
}

/** Prende cada eixo no alcance de operação (sem combinar eixos: para isso, limitPose). */
export function clampToReach(pose: Pose, lim: UiLimits): Pose {
  const out = { ...pose };
  for (const k of KEYS) out[k] = Math.min(lim.pose[k][1], Math.max(lim.pose[k][0], pose[k]));
  return out;
}
