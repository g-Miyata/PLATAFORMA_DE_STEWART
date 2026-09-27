// Cinemática inversa usada APENAS para desenhar o modelo 3D (60 fps, sem ida ao
// backend). Quem valida e aplica uma pose é sempre o backend (/calculate,
// /apply_pose). Mesma convenção de app.py:
//   R = Rz(yaw) · Ry(pitch) · Rx(roll)   (scipy 'ZYX', graus)
//   P_i = R · P0_i + [x, y, z]            L_i = ‖P_i − B_i‖
import { checkPose, resolveLimits, type LegReason, type LimitGeometry, type PoseCheck } from './limits';
import type { Pose, Vec3 } from './types';

export type Mat3 = [number, number, number, number, number, number, number, number, number];

const DEG = Math.PI / 180;

export function rotationZYX(rollDeg: number, pitchDeg: number, yawDeg: number): Mat3 {
  const [cr, sr] = [Math.cos(rollDeg * DEG), Math.sin(rollDeg * DEG)];
  const [cp, sp] = [Math.cos(pitchDeg * DEG), Math.sin(pitchDeg * DEG)];
  const [cy, sy] = [Math.cos(yawDeg * DEG), Math.sin(yawDeg * DEG)];
  // linha a linha (row-major)
  return [
    cy * cp, cy * sp * sr - sy * cr, cy * sp * cr + sy * sr,
    sy * cp, sy * sp * sr + cy * cr, sy * sp * cr - cy * sr,
    -sp, cp * sr, cp * cr,
  ];
}

export function transformPoints(pose: Pose, local: readonly Vec3[]): Vec3[] {
  const m = rotationZYX(pose.roll, pose.pitch, pose.yaw);
  return local.map(([px, py, pz]) => [
    m[0] * px + m[1] * py + m[2] * pz + pose.x,
    m[3] * px + m[4] * py + m[5] * pz + pose.y,
    m[6] * px + m[7] * py + m[8] * pz + pose.z,
  ]);
}

export function legLengths(base: readonly Vec3[], top: readonly Vec3[]): number[] {
  return base.map((b, i) => Math.hypot(top[i][0] - b[0], top[i][1] - b[1], top[i][2] - b[2]));
}

export type LegStatus = 'ok' | 'near' | 'invalid';

/** "near" quando falta menos que `marginMm` para um batente. */
export function legStatus(length: number, min: number, max: number, marginMm = 10): LegStatus {
  if (length < min || length > max) return 'invalid';
  if (length - min < marginMm || max - length < marginMm) return 'near';
  return 'ok';
}

/** Situação de uma perna só pelo curso de OPERAÇÃO (quando só o comprimento é conhecido). */
export function strokeStatus(length: number, geom: LimitGeometry): LegStatus {
  const { op } = resolveLimits(geom);
  return legStatus(length, op.stroke_min, op.stroke_max);
}

export interface PlatformState {
  top: Vec3[];
  lengths: number[];
  status: LegStatus[];
  valid: boolean;
  /** motivos de recusa de cada perna (curso, cardãs, folga entre pernas) */
  reasons: LegReason[][];
  check: PoseCheck;
}

/** "near" também perto do limite do cardã (3°) ou da folga entre pernas (5 mm). */
function statusOf(c: PoseCheck, i: number, geom: LimitGeometry): LegStatus {
  if (c.reasons[i].length) return 'invalid';
  const { op } = resolveLimits(geom);
  const nearPair = c.dist.some((d, k) => d - op.min_axis_distance_mm < 5 && (PAIR_OF[k][0] === i || PAIR_OF[k][1] === i));
  if (legStatus(c.lengths[i], op.stroke_min, op.stroke_max) === 'near' || op.cardan_base_max_deg - c.base[i] < 3 || op.cardan_top_max_deg - c.topDeg[i] < 3 || nearPair) return 'near';
  return 'ok';
}

const PAIR_OF: [number, number][] = [];
for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) PAIR_OF.push([i, j]);

/**
 * Cinemática inversa com os limites reais: curso de operação, ângulo dos cardãs e folga
 * entre pernas (lib/limits.ts, igual ao backend).
 */
export function solvePose(pose: Pose, geom: LimitGeometry): PlatformState {
  const check = checkPose(pose, geom);
  const status = check.lengths.map((_, i) => statusOf(check, i, geom));
  return { top: check.top, lengths: check.lengths, status, valid: check.valid, reasons: check.reasons, check };
}

let lastStatus: { pose: Pose; geom: LimitGeometry; status: LegStatus[] } | null = null;

/** Situação das seis pernas, com cache da última pose (o 3D pergunta uma vez por perna por quadro). */
export function poseStatus(pose: Pose, geom: LimitGeometry): LegStatus[] {
  if (lastStatus && lastStatus.pose === pose && lastStatus.geom === geom) return lastStatus.status;
  const status = solvePose(pose, geom).status;
  lastStatus = { pose, geom, status };
  return status;
}

export const zeroPose = (z: number): Pose => ({ x: 0, y: 0, z, roll: 0, pitch: 0, yaw: 0 });
