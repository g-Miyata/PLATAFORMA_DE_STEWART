// Vetores da aula: exatamente a conta de lib/kinematics.ts, só que decomposta
// para desenhar cada termo de  Lᵢ = T + R·pᵢ − bᵢ.
import { rotationZYX } from '@/lib/kinematics';
import type { PlatformGeometry, Pose, Vec3 } from '@/lib/types';

export interface LegVectors {
  /** junta da base (fixa) */
  b: Vec3;
  /** junta do tampo no sistema do tampo (constante) */
  p: Vec3;
  /** R·pᵢ: a mesma junta girada, ainda com origem no centro do tampo */
  Rp: Vec3;
  /** Pᵢ = T + R·pᵢ: junta do tampo no sistema da base */
  P: Vec3;
  /** Lᵢ = Pᵢ − bᵢ: vetor da perna */
  L: Vec3;
  length: number;
  inStroke: boolean;
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);

export function translation(pose: Pose): Vec3 {
  return [pose.x, pose.y, pose.z];
}

/** Eixos do tampo (colunas de R) — para desenhar o sistema local girado. */
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
  const T = translation(pose);
  return geom.platform_points_local.map((p, i) => {
    const Rp: Vec3 = [r[0] * p[0] + r[1] * p[1] + r[2] * p[2], r[3] * p[0] + r[4] * p[1] + r[5] * p[2], r[6] * p[0] + r[7] * p[1] + r[8] * p[2]];
    const P = add(T, Rp);
    const b = geom.base_points[i];
    const L = sub(P, b);
    const length = norm(L);
    return { b, p, Rp, P, L, length, inStroke: length >= geom.stroke_min && length <= geom.stroke_max };
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
