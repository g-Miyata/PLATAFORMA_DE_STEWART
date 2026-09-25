// Cinemática inversa usada APENAS para desenhar o modelo 3D (60 fps, sem ida ao
// backend). Quem valida e aplica uma pose é sempre o backend (/calculate,
// /apply_pose). Mesma convenção de app.py:
//   R = Rz(yaw) · Ry(pitch) · Rx(roll)   (scipy 'ZYX', graus)
//   P_i = R · P0_i + [x, y, z]            L_i = ‖P_i − B_i‖
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

export interface PlatformState {
  top: Vec3[];
  lengths: number[];
  status: LegStatus[];
  valid: boolean;
}

export function solvePose(
  pose: Pose,
  geom: { base_points: Vec3[]; platform_points_local: Vec3[]; stroke_min: number; stroke_max: number },
): PlatformState {
  const top = transformPoints(pose, geom.platform_points_local);
  const lengths = legLengths(geom.base_points, top);
  const status = lengths.map((l) => legStatus(l, geom.stroke_min, geom.stroke_max));
  return { top, lengths, status, valid: status.every((s) => s !== 'invalid') };
}

export const zeroPose = (z: number): Pose => ({ x: 0, y: 0, z, roll: 0, pitch: 0, yaw: 0 });
