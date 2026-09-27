// Laboratório do calço do cardã do tampo: simula um assento inclinado para cada cardã do
// topo (sem mexer nos limites da bancada) e gera as peças para imprimir.
//
// Hoje o cardã do tampo fica preso reto no tampo, e a perna chega inclinada: parado no
// home ele já está a ~24° dos 45°, e é ele que limita a inclinação. Um calço em cunha,
// virado para a perna, devolve esse ângulo.
import {
  checkPose,
  computeReach,
  DEFAULT_LIMIT_VALUES,
  operationalLimits,
  physicalLimits,
  REASON_TEXT,
  seatNormals,
  type LegReason,
  type LimitGeometry,
  type LimitsInfo,
  type PoseKey,
} from '@/lib/limits';
import type { PlatformGeometry, Pose, Vec3 } from '@/lib/types';

export interface WedgeParams {
  /** inclinação da cunha (°) */
  angleDeg: number;
  /** margem de segurança da simulação (0,2 = 20%) */
  margin: number;
  /** diâmetro do parafuso que prende o cardã (mm) */
  screwMm: number;
  /** diâmetro do calço (mm) */
  outerMm: number;
  /** espessura na ponta, o lado fino (mm) */
  minMm: number;
  /** espessura do tampo (mm): arruela de cima e furo alargado */
  plateMm: number;
  /** do assento (face do tampo) ao centro da cruzeta do cardã (mm) */
  jointMm: number;
}

export const DEFAULT_WEDGE: WedgeParams = { angleDeg: 12, margin: 0.2, screwMm: 8, outerMm: 32, minMm: 2.5, plateMm: 6, jointMm: 23 };

/** Ponta do calço (a "seta" que aponta para a perna) */
export const TAB_MM = 6;
const TAB_HALF = Math.PI / 6;

const D2R = Math.PI / 180;
const unit = (v: Vec3): Vec3 => {
  const n = Math.hypot(...v) || 1;
  return [v[0] / n, v[1] / n, v[2] / n];
};
const level = (z: number): Pose => ({ x: 0, y: 0, z, roll: 0, pitch: 0, yaw: 0 });

/**
 * Direção de cada perna no tampo, vista de cima: do cardã do topo para a junta de baixo
 * (no home). É para onde a ponta do calço aponta.
 */
export function legHeadings(geom: PlatformGeometry): [number, number][] {
  return geom.platform_points_local.map((p, i) => {
    const b = geom.base_points[i];
    const h: [number, number] = [b[0] - p[0], b[1] - p[1]];
    const n = Math.hypot(...h) || 1;
    return [h[0] / n, h[1] / n];
  });
}

/** Espessura no centro do calço (mm): a ponta fica com a espessura mínima. */
export function centerThickness(p: Pick<WedgeParams, 'angleDeg' | 'outerMm' | 'minMm'>, tab = TAB_MM) {
  return p.minMm + (p.outerMm / 2 + tab) * Math.tan(p.angleDeg * D2R);
}

/** Limites da bancada com outra margem (só nesta simulação). */
function withMargin(geom: PlatformGeometry, margin: number): LimitsInfo {
  const values = { ...(geom.limits?.values ?? DEFAULT_LIMIT_VALUES), margin };
  return {
    ...(geom.limits ?? ({} as LimitsInfo)),
    values,
    operational: operationalLimits(values),
    physical: physicalLimits(values),
    seat_normals: geom.limits?.seat_normals ?? seatNormals(geom.base_points),
  };
}

export type LabGeometry = LimitGeometry & { home_z: number };

/** Altura com o tampo nivelado em que as pernas ficam no meio do curso de operação. */
export function balancedHome(geom: LimitGeometry, op: { stroke_min: number; stroke_max: number }) {
  const mid = (op.stroke_min + op.stroke_max) / 2;
  let lo = 200;
  let hi = 900;
  for (let i = 0; i < 50; i++) {
    const z = (lo + hi) / 2;
    const L = checkPose(level(z), geom).lengths;
    if (L.reduce((a, b) => a + b, 0) / L.length < mid) lo = z;
    else hi = z;
  }
  return Math.round(((lo + hi) / 2) * 10) / 10;
}

/** A montagem de hoje (cardã reto no tampo), com a margem escolhida. */
export function currentGeometry(geom: PlatformGeometry, margin: number): LabGeometry {
  const limits = withMargin(geom, margin);
  const g: LimitGeometry = { base_points: geom.base_points, platform_points_local: geom.platform_points_local, limits };
  return { ...g, home_z: balancedHome(g, limits.operational) };
}

/**
 * A montagem com o calço: o assento de cada cardã do tampo inclina `angleDeg` na direção
 * da perna, e o centro da cruzeta desce (espessura do calço) e acompanha a inclinação.
 */
export function wedgeGeometry(geom: PlatformGeometry, p: WedgeParams): LabGeometry {
  const a = p.angleDeg * D2R;
  const tc = centerThickness(p);
  const heads = legHeadings(geom);
  const normals: Vec3[] = heads.map(([dx, dy]) => unit([-Math.sin(a) * dx, -Math.sin(a) * dy, Math.cos(a)]));
  const points: Vec3[] = geom.platform_points_local.map((pt, i) => {
    const n = normals[i];
    // antes: centro da cruzeta a jointMm abaixo do tampo; agora: abaixo do calço, no eixo inclinado
    return [pt[0] - p.jointMm * n[0], pt[1] - p.jointMm * n[1], pt[2] - tc + p.jointMm * (1 - n[2])];
  });
  const limits = withMargin(geom, p.margin);
  const g: LimitGeometry = { base_points: geom.base_points, platform_points_local: points, limits, top_seat_normals_local: normals };
  return { ...g, home_z: balancedHome(g, limits.operational) };
}

export interface Envelope {
  home: number;
  reach: Record<PoseKey, [number, number]>;
  /** inclinação máxima em qualquer direção (°) */
  tilt: number;
  /** o que trava a inclinação na pior direção */
  limiter: string;
  /** maior ângulo dos cardãs com o tampo parado no home (°) */
  homeTop: number;
  homeBase: number;
}

const TILT_DIRS = 24;

/** Alcance de cada eixo, inclinação máxima (cone) e o que a limita. */
export function envelope(g: LabGeometry): Envelope {
  const home = level(g.home_z);
  const at = (phi: number, t: number): Pose => ({ ...home, roll: t * Math.cos(phi), pitch: t * Math.sin(phi) });
  let tilt = Infinity;
  let worst = 0;
  for (let k = 0; k < TILT_DIRS; k++) {
    const phi = (2 * Math.PI * k) / TILT_DIRS;
    let lo = 0;
    let hi = 60;
    for (let i = 0; i < 22; i++) {
      const mid = (lo + hi) / 2;
      if (checkPose(at(phi, mid), g).valid) lo = mid;
      else hi = mid;
    }
    if (lo < tilt) {
      tilt = lo;
      worst = phi;
    }
  }
  const beyond = checkPose(at(worst, tilt + 0.3), g);
  const count = new Map<LegReason, number>();
  beyond.reasons.flat().forEach((r) => count.set(r, (count.get(r) ?? 0) + 1));
  const top = [...count.entries()].sort((x, y) => y[1] - x[1])[0]?.[0];
  const h = checkPose(home, g);
  return {
    home: g.home_z,
    reach: computeReach(g, home),
    tilt,
    limiter: top ? REASON_TEXT[top] : '—',
    homeTop: Math.max(...h.topDeg),
    homeBase: Math.max(...h.base),
  };
}

// ---------------------------------------------------------------- peças para imprimir
export interface Mesh {
  positions: number[];
  indices: number[];
}

export interface PieceSpec {
  outerMm: number;
  minMm: number;
  angleDeg: number;
  holeMm: number;
  tabMm: number;
}

const SEG = 96;

/**
 * Cunha com furo inclinado, pronta para imprimir: face plana em z = 0 (na mesa da
 * impressora), face inclinada em cima, fina no lado da ponta (+X). O furo é perpendicular
 * à face inclinada (é o eixo do cardã / do parafuso). Malha fechada (cada aresta em dois
 * triângulos), normais para fora.
 */
export function wedgeMesh(s: PieceSpec): Mesh {
  const a = s.angleDeg * D2R;
  const ta = Math.tan(a);
  const R = s.outerMm / 2;
  const tc = s.minMm + (R + s.tabMm) * ta;
  const r = s.holeMm / 2;
  const topZ = (x: number) => tc - x * ta;
  // base do plano inclinado e seu eixo (normal)
  const axis: Vec3 = [Math.sin(a), 0, Math.cos(a)];
  const e1: Vec3 = [Math.cos(a), 0, -Math.sin(a)];
  const positions: number[] = [];
  const push = (v: Vec3) => positions.push(...v) / 3 - 1;
  const OB: number[] = [];
  const OT: number[] = [];
  const IT: number[] = [];
  const IB: number[] = [];
  const outline = (th: number) => {
    const w = ((th + Math.PI) % (2 * Math.PI)) - Math.PI;
    return R + s.tabMm * Math.max(0, 1 - Math.abs(w) / TAB_HALF);
  };
  for (let k = 0; k < SEG; k++) {
    const th = (2 * Math.PI * k) / SEG;
    const ro = outline(th);
    const x = ro * Math.cos(th);
    const y = ro * Math.sin(th);
    OB.push(push([x, y, 0]));
    OT.push(push([x, y, topZ(x)]));
    // furo: círculo no plano inclinado, centrado em (0, 0, tc), e sua descida até z = 0
    const c = Math.cos(th);
    const sn = Math.sin(th);
    const top: Vec3 = [r * c * e1[0], r * sn, tc + r * c * e1[2]];
    IT.push(push(top));
    const sDown = -top[2] / axis[2];
    IB.push(push([top[0] + sDown * axis[0], top[1], 0]));
  }
  const indices: number[] = [];
  const P = (i: number): Vec3 => [positions[3 * i], positions[3 * i + 1], positions[3 * i + 2]];
  const tri = (i: number, j: number, k: number, out: Vec3) => {
    const [A, B, C] = [P(i), P(j), P(k)];
    const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
    const v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] >= 0) indices.push(i, j, k);
    else indices.push(i, k, j);
  };
  for (let k = 0; k < SEG; k++) {
    const q = (k + 1) % SEG;
    const th = (2 * Math.PI * (k + 0.5)) / SEG;
    const radial: Vec3 = [Math.cos(th), Math.sin(th), 0];
    const inward: Vec3 = [-Math.cos(th) * e1[0], -Math.sin(th), -Math.cos(th) * e1[2]];
    // face inclinada (anel entre a borda e o furo)
    tri(OT[k], OT[q], IT[q], axis);
    tri(OT[k], IT[q], IT[k], axis);
    // face plana de baixo
    tri(OB[k], IB[q], OB[q], [0, 0, -1]);
    tri(OB[k], IB[k], IB[q], [0, 0, -1]);
    // parede de fora
    tri(OB[k], OB[q], OT[q], radial);
    tri(OB[k], OT[q], OT[k], radial);
    // parede do furo
    tri(IB[k], IT[q], IB[q], inward);
    tri(IB[k], IT[k], IT[q], inward);
  }
  return { positions, indices };
}

/** STL binário (mm). */
export function toStl(mesh: Mesh, name: string): ArrayBuffer {
  const n = mesh.indices.length / 3;
  const buf = new ArrayBuffer(84 + n * 50);
  const dv = new DataView(buf);
  const header = `Plataforma de Stewart - ${name}`.slice(0, 80);
  for (let i = 0; i < header.length; i++) dv.setUint8(i, header.charCodeAt(i) & 0x7f);
  dv.setUint32(80, n, true);
  const P = (i: number) => [mesh.positions[3 * i], mesh.positions[3 * i + 1], mesh.positions[3 * i + 2]];
  let o = 84;
  for (let t = 0; t < n; t++) {
    const [A, B, C] = [P(mesh.indices[3 * t]), P(mesh.indices[3 * t + 1]), P(mesh.indices[3 * t + 2])];
    const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
    const v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const nn = unit([u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]);
    for (const x of [...nn, ...A, ...B, ...C]) {
      dv.setFloat32(o, x, true);
      o += 4;
    }
    dv.setUint16(o, 0, true);
    o += 2;
  }
  return buf;
}

/** Peças do kit para um conjunto de parâmetros. */
export function kitPieces(p: WedgeParams): { wedge: PieceSpec; washer: PieceSpec } {
  return {
    // entre o tampo e o cardã: furo com folga para o parafuso passar até a rosca do cardã
    wedge: { outerMm: p.outerMm, minMm: p.minMm, angleDeg: p.angleDeg, holeMm: p.screwMm + 0.4, tabMm: TAB_MM },
    // em cima do tampo, embaixo da cabeça do parafuso (a cabeça assenta reta no eixo inclinado)
    washer: { outerMm: Math.max(p.screwMm * 2.2, p.screwMm + 8), minMm: 1.5, angleDeg: p.angleDeg, holeMm: p.screwMm + 0.5, tabMm: 3 },
  };
}

/** Furo do tampo alargado para o parafuso passar inclinado, e quanto o parafuso cresce. */
export function assemblyNumbers(p: WedgeParams) {
  const a = p.angleDeg * D2R;
  const { wedge, washer } = kitPieces(p);
  const along = (s: PieceSpec) => (s.minMm + (s.outerMm / 2 + s.tabMm) * Math.tan(a)) / Math.cos(a);
  return {
    plateHoleMm: p.screwMm + p.plateMm * Math.tan(a) + 0.5,
    screwExtraMm: along(wedge) + along(washer) + p.plateMm * (1 / Math.cos(a) - 1),
    wedgeCenterMm: centerThickness(p),
    wedgeMaxMm: p.minMm + (p.outerMm + TAB_MM) * Math.tan(a),
  };
}

/** Ângulo (°) da ponta do calço em relação à direção "para fora do tampo" de cada junta, visto de cima. */
export function headingTable(geom: PlatformGeometry) {
  return legHeadings(geom).map(([dx, dy], i) => {
    const p = geom.platform_points_local[i];
    const out = Math.atan2(p[1], p[0]);
    let rel = (Math.atan2(dy, dx) - out) / D2R;
    rel = ((rel + 540) % 360) - 180;
    return { leg: i + 1, relDeg: rel, absDeg: (Math.atan2(dy, dx) / D2R + 360) % 360 };
  });
}
