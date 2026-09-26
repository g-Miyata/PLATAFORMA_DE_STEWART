// Cinemática direta: dada a medida dos 6 comprimentos, acha a pose do tampo.
// Mesmo problema que StewartPlatform.estimate_pose_from_lengths (app.py), resolvido
// no navegador com Levenberg-Marquardt e Jacobiano numérico (6×6), partindo da
// pose atual. Rápido o bastante para rodar a cada movimento do mouse.
import { legLengths, transformPoints } from './kinematics';
import type { Pose, Vec3 } from './types';

const KEYS = ['x', 'y', 'z', 'roll', 'pitch', 'yaw'] as const;
// mesmos limites do backend (Z cobre toda a faixa alcançável)
const LOWER = [-100, -100, 300, -30, -30, -30];
const UPPER = [100, 100, 750, 30, 30, 30];

type Vec6 = [number, number, number, number, number, number];

const toVec = (p: Pose): Vec6 => [p.x, p.y, p.z, p.roll, p.pitch, p.yaw];
const toPose = (v: number[]): Pose => ({ x: v[0], y: v[1], z: v[2], roll: v[3], pitch: v[4], yaw: v[5] });
const clampVec = (v: number[]) => v.map((x, i) => Math.min(UPPER[i], Math.max(LOWER[i], x)));

export interface FkGeometry {
  base_points: Vec3[];
  platform_points_local: Vec3[];
}

export interface FkStep {
  iteration: number;
  pose: Pose;
  /** maior erro de comprimento (mm) nessa iteração */
  maxError: number;
  /** erro RMS dos seis comprimentos (mm) */
  rms: number;
  /** comprimentos que a pose dessa iteração daria (cinemática inversa) */
  lengths: number[];
}

export interface FkResult {
  pose: Pose;
  converged: boolean;
  /** maior erro de comprimento (mm) na solução */
  maxError: number;
  iterations: number;
  /** cada iteração, a partir do chute inicial (só com `history: true`, para a aula) */
  history?: FkStep[];
}

function residual(v: number[], geom: FkGeometry, target: readonly number[]): number[] {
  const L = legLengths(geom.base_points, transformPoints(toPose(v), geom.platform_points_local));
  return L.map((l, i) => l - target[i]);
}

/** Resolve A·x = b (6×6) por eliminação de Gauss com pivotamento parcial. */
function solve6(A: number[][], b: number[]): number[] | null {
  const n = 6;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-12) return null;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}

const sumSq = (r: number[]) => r.reduce((a, e) => a + e * e, 0);

export function forwardKinematics(
  lengths: readonly number[],
  geom: FkGeometry,
  guess: Pose,
  { tolerance = 1e-4, maxIterations = 40, history = false }: { tolerance?: number; maxIterations?: number; history?: boolean } = {},
): FkResult {
  let v = clampVec(toVec(guess));
  let r = residual(v, geom, lengths);
  let cost = sumSq(r);
  let lambda = 1e-3;
  const h = 1e-4;
  let it = 0;
  const steps: FkStep[] = [];
  const record = () =>
    history &&
    steps.push({ iteration: steps.length, pose: toPose(v), maxError: Math.max(...r.map(Math.abs)), rms: Math.sqrt(cost / 6), lengths: r.map((e, i) => e + lengths[i]) });
  record();

  for (; it < maxIterations; it++) {
    if (Math.max(...r.map(Math.abs)) < tolerance) break;
    // Jacobiano numérico por diferença central (6 comprimentos × 6 variáveis)
    const J: number[][] = Array.from({ length: 6 }, () => new Array(6).fill(0));
    for (let k = 0; k < 6; k++) {
      const vp = [...v];
      const vm = [...v];
      vp[k] += h;
      vm[k] -= h;
      const rp = residual(vp, geom, lengths);
      const rm = residual(vm, geom, lengths);
      for (let i = 0; i < 6; i++) J[i][k] = (rp[i] - rm[i]) / (2 * h);
    }
    // (JᵀJ + λ·diag(JᵀJ)) δ = −Jᵀr
    const JtJ = Array.from({ length: 6 }, (_, a) => Array.from({ length: 6 }, (_, b) => J.reduce((s, row) => s + row[a] * row[b], 0)));
    const Jtr = Array.from({ length: 6 }, (_, a) => J.reduce((s, row, i) => s + row[a] * r[i], 0));

    let improved = false;
    for (let tries = 0; tries < 8 && !improved; tries++) {
      const A = JtJ.map((row, a) => row.map((val, b) => (a === b ? val * (1 + lambda) + 1e-9 : val)));
      const delta = solve6(A, Jtr.map((x) => -x));
      if (!delta) {
        lambda *= 10;
        continue;
      }
      const vNew = clampVec(v.map((x, k) => x + delta[k]));
      const rNew = residual(vNew, geom, lengths);
      const costNew = sumSq(rNew);
      if (costNew < cost) {
        v = vNew;
        r = rNew;
        cost = costNew;
        lambda = Math.max(1e-7, lambda / 3);
        improved = true;
      } else {
        lambda *= 10;
      }
    }
    if (!improved) break;
    record();
  }

  const maxError = Math.max(...r.map(Math.abs));
  return { pose: toPose(v), converged: maxError < 0.01, maxError, iterations: it, ...(history ? { history: steps } : {}) };
}

export const POSE_KEYS = KEYS;
