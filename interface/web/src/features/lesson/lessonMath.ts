// Contas da aula, na notação do TCC: aᵢ ∈ {B} (base), bᵢ ∈ {P} (tampo), pose (p, R),
// Pᵢ = p + R·bᵢ, sᵢ = Pᵢ − aᵢ, Lᵢ = ‖sᵢ‖ e Δᵢ = Lᵢ − Lmin. É exatamente a conta de
// lib/kinematics.ts, só que decomposta para desenhar e mostrar cada termo.
import { forwardKinematics } from '@/lib/forwardKinematics';
import { rotationZYX, type Mat3 } from '@/lib/kinematics';
import { uiLimits } from '@/lib/limits';
import type { PlatformGeometry, Pose, Vec3 } from '@/lib/types';

export interface LegVectors {
  /** junta da base, em {B} (fixa) */
  a: Vec3;
  /** junta do tampo, em {P} (constante) */
  b: Vec3;
  /** R·bᵢ: a mesma junta girada, ainda com origem no centro do tampo */
  Rb: Vec3;
  /** Pᵢ = p + R·bᵢ: junta do tampo em {B} */
  P: Vec3;
  /** sᵢ = Pᵢ − aᵢ: vetor do atuador */
  s: Vec3;
  /** Lᵢ = ‖sᵢ‖ */
  length: number;
  /** Δᵢ = Lᵢ − Lmin: o curso que o atuador precisa ter */
  delta: number;
  inStroke: boolean;
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
export const mulMat3Vec = (r: Mat3, p: Vec3): Vec3 => [r[0] * p[0] + r[1] * p[1] + r[2] * p[2], r[3] * p[0] + r[4] * p[1] + r[5] * p[2], r[6] * p[0] + r[7] * p[1] + r[8] * p[2]];

export function translation(pose: Pose): Vec3 {
  return [pose.x, pose.y, pose.z];
}

/** Eixos do tampo (colunas de R) — para desenhar o sistema {P} girado. */
export function plateAxes(pose: Pose): [Vec3, Vec3, Vec3] {
  const r = rotationZYX(pose.roll, pose.pitch, pose.yaw);
  return [
    [r[0], r[3], r[6]],
    [r[1], r[4], r[7]],
    [r[2], r[5], r[8]],
  ];
}

export function legVectors(pose: Pose, geom: PlatformGeometry): LegVectors[] {
  const r = rotationZYX(pose.roll, pose.pitch, pose.yaw);
  const p = translation(pose);
  return geom.platform_points_local.map((b, i) => {
    const Rb = mulMat3Vec(r, b);
    const P = add(p, Rb);
    const a = geom.base_points[i];
    const s = sub(P, a);
    const length = norm(s);
    const [lo, hi] = uiLimits(geom).stroke;
    return { a, b, Rb, P, s, length, delta: length - geom.stroke_min, inStroke: length >= lo && length <= hi };
  });
}

/**
 * Animação da ordem ZYX: de 0 a 1 aplica primeiro o yaw, depois o pitch, depois
 * o roll (cada um num terço), mostrando que R = Rz·Ry·Rx.
 */
export function zyxAnimation(pose: Pose, u: number): Pose {
  const part = (k: number) => Math.min(1, Math.max(0, u * 3 - k));
  const ease = (x: number) => x * x * (3 - 2 * x);
  // "+ 0" evita -0 (ângulo negativo vezes zero)
  return { ...pose, yaw: pose.yaw * ease(part(0)) + 0, pitch: pose.pitch * ease(part(1)) + 0, roll: pose.roll * ease(part(2)) + 0 };
}

const RAD = Math.PI / 180;

/** Matrizes elementares (graus → matriz 3×3, em linhas). */
export function rotX(deg: number): Mat3 {
  const c = Math.cos(deg * RAD);
  const s = Math.sin(deg * RAD);
  return [1, 0, 0, 0, c, -s, 0, s, c];
}
export function rotY(deg: number): Mat3 {
  const c = Math.cos(deg * RAD);
  const s = Math.sin(deg * RAD);
  return [c, 0, s, 0, 1, 0, -s, 0, c];
}
export function rotZ(deg: number): Mat3 {
  const c = Math.cos(deg * RAD);
  const s = Math.sin(deg * RAD);
  return [c, -s, 0, s, c, 0, 0, 0, 1];
}
export function mulMat3(a: Mat3, b: Mat3): Mat3 {
  const o = new Array(9).fill(0) as number[];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) o[r * 3 + c] += a[r * 3 + k] * b[k * 3 + c];
  return o as Mat3;
}

/** Ângulos ZYX (roll, pitch, yaw em graus) de uma matriz de rotação. */
export function eulerZYX(r: Mat3): { roll: number; pitch: number; yaw: number } {
  const pitch = Math.asin(Math.max(-1, Math.min(1, -r[6])));
  return { roll: Math.atan2(r[7], r[8]) / RAD, pitch: pitch / RAD, yaw: Math.atan2(r[3], r[0]) / RAD };
}

/**
 * "A ordem importa": a pose que se teria girando na ordem trocada (R' = Rx·Ry·Rz),
 * expressa de volta em ângulos ZYX para poder desenhar como fantasma.
 */
export function swappedOrderPose(pose: Pose): Pose {
  const R = mulMat3(mulMat3(rotX(pose.roll), rotY(pose.pitch)), rotZ(pose.yaw));
  return { ...pose, ...eulerZYX(R) };
}

/**
 * Experimento da direta: parte da pose `from`, soma `deltaMm` nos atuadores
 * escolhidos e devolve a pose resultante (cinemática direta).
 */
export function poseAfterLengthChange(from: Pose, geom: PlatformGeometry, legs: number[], deltaMm: number): { pose: Pose; lengths: number[] } {
  const L = legVectors(from, geom).map((l, i) => l.length + (legs.includes(i) ? deltaMm : 0));
  return { pose: forwardKinematics(L, geom, from).pose, lengths: L };
}
