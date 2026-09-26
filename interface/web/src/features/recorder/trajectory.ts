// Trajetórias: poses-chave no tempo, interpolação, amostragem para o backend,
// simplificação de gravações e análise de viabilidade (curso e velocidade).
import { ACTUATOR_SPEED_MM_S } from '@/features/routines/routines';
import { solvePose } from '@/lib/kinematics';
import type { PlatformGeometry, Pose, TrajectorySample } from '@/lib/types';

export const POSE_AXES = ['x', 'y', 'z', 'roll', 'pitch', 'yaw'] as const;
export type PoseAxis = (typeof POSE_AXES)[number];
const ANGLE_AXES = new Set<PoseAxis>(['roll', 'pitch', 'yaw']);

export interface Keyframe {
  /** instante em segundos (a primeira pose-chave é t = 0) */
  t: number;
  pose: Pose;
}

/** linear: segmentos retos · suave: Hermite monótona (não passa dos extremos) · degrau: segura até a próxima */
export type Interp = 'linear' | 'suave' | 'degrau';

export const INTERP_LABEL: Record<Interp, string> = {
  suave: 'Suave',
  linear: 'Linear',
  degrau: 'Degrau (segura a pose)',
};

export const duration = (keys: readonly Keyframe[]) => (keys.length ? keys[keys.length - 1].t - keys[0].t : 0);

/** Ordena por tempo e desloca para começar em t = 0. */
export function normalizeKeys(keys: readonly Keyframe[]): Keyframe[] {
  const sorted = [...keys].sort((a, b) => a.t - b.t);
  const t0 = sorted[0]?.t ?? 0;
  return sorted.map((k) => ({ t: k.t - t0, pose: { ...k.pose } }));
}

/** Índice do segmento [i, i+1] que contém t (busca binária). */
function segment(times: readonly number[], t: number) {
  let lo = 0;
  let hi = times.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (times[mid] <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * Derivadas da Hermite monótona (Fritsch–Butland): zero nos extremos locais e nas
 * pontas (a trajetória parte e chega com velocidade nula), então a curva nunca
 * passa do valor de uma pose-chave.
 */
function monotoneTangents(times: readonly number[], values: readonly number[]) {
  const n = times.length;
  const m = new Array<number>(n).fill(0);
  for (let k = 1; k < n - 1; k++) {
    const h0 = times[k] - times[k - 1];
    const h1 = times[k + 1] - times[k];
    const d0 = (values[k] - values[k - 1]) / h0;
    const d1 = (values[k + 1] - values[k]) / h1;
    if (d0 * d1 <= 0) continue;
    m[k] = (3 * (h0 + h1)) / ((2 * h1 + h0) / d0 + (h1 + 2 * h0) / d1);
  }
  return m;
}

/** Função pose(t) para as poses-chave dadas. Fora do intervalo, segura a primeira/última pose. */
export function makeSampler(keys: readonly Keyframe[], interp: Interp): (t: number) => Pose {
  if (!keys.length) throw new Error('Trajetória sem poses-chave.');
  const times = keys.map((k) => k.t);
  const values = POSE_AXES.map((a) => keys.map((k) => k.pose[a]));
  const tangents = interp === 'suave' ? values.map((v) => monotoneTangents(times, v)) : null;
  const last = keys.length - 1;

  return (t: number) => {
    if (last === 0 || t <= times[0]) return { ...keys[0].pose };
    if (t >= times[last]) return { ...keys[last].pose };
    const i = segment(times, t);
    if (interp === 'degrau') return { ...keys[i].pose };
    const h = times[i + 1] - times[i];
    const s = (t - times[i]) / h;
    const pose = {} as Pose;
    POSE_AXES.forEach((axis, a) => {
      const y0 = values[a][i];
      const y1 = values[a][i + 1];
      if (!tangents) {
        pose[axis] = y0 + (y1 - y0) * s;
        return;
      }
      const s2 = s * s;
      const s3 = s2 * s;
      pose[axis] =
        (2 * s3 - 3 * s2 + 1) * y0 + (s3 - 2 * s2 + s) * h * tangents[a][i] + (-2 * s3 + 3 * s2) * y1 + (s3 - s2) * h * tangents[a][i + 1];
    });
    return pose;
  };
}

export const poseAt = (keys: readonly Keyframe[], interp: Interp, t: number) => makeSampler(keys, interp)(t);

/** Amostras a cada dt (padrão 20 Hz), sempre incluindo o fim, prontas para /motion/trajectory. */
export function sampleTrajectory(keys: readonly Keyframe[], interp: Interp, dt = 0.05): TrajectorySample[] {
  const norm = normalizeKeys(keys);
  const sample = makeSampler(norm, interp);
  const total = duration(norm);
  const out: TrajectorySample[] = [];
  const n = Math.max(1, Math.ceil(total / dt - 1e-9));
  for (let i = 0; i <= n; i++) {
    const t = Math.min(total, i * dt);
    out.push({ t, ...sample(t) });
  }
  // o backend exige tempos estritamente crescentes (trajetória de uma pose só)
  if (out.length === 1) out.push({ ...out[0], t: dt });
  return out;
}

/**
 * Ramer–Douglas–Peucker no tempo: mantém só as amostras necessárias para que a
 * interpolação linear entre elas fique a menos de tolMm / tolDeg da gravação.
 */
export function simplify(samples: readonly Keyframe[], tolMm = 0.5, tolDeg = 0.2): Keyframe[] {
  if (samples.length <= 2) return samples.map((s) => ({ t: s.t, pose: { ...s.pose } }));
  const keep = new Uint8Array(samples.length);
  keep[0] = keep[samples.length - 1] = 1;
  const stack: [number, number][] = [[0, samples.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const A = samples[a];
    const B = samples[b];
    let worst = 0;
    let at = -1;
    for (let i = a + 1; i < b; i++) {
      const s = (samples[i].t - A.t) / (B.t - A.t || 1);
      for (const axis of POSE_AXES) {
        const tol = ANGLE_AXES.has(axis) ? tolDeg : tolMm;
        const err = Math.abs(samples[i].pose[axis] - (A.pose[axis] + (B.pose[axis] - A.pose[axis]) * s)) / tol;
        if (err > worst) {
          worst = err;
          at = i;
        }
      }
    }
    if (worst > 1 && at > 0) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  return samples.filter((_, i) => keep[i]).map((s) => ({ t: s.t, pose: { ...s.pose } }));
}

export interface TrajectoryCheck {
  valid: boolean;
  /** primeira amostra fora do curso (índice e tempo) */
  firstInvalid: { index: number; t: number } | null;
  /** maior |dL/dt| entre os seis atuadores (mm/s) */
  peakSpeed: number;
  minLength: number;
  maxLength: number;
  tooFast: boolean;
}

/** Confere curso e velocidade das pernas ao longo das amostras (mesmo critério das Rotinas). */
export function analyzeTrajectory(samples: readonly TrajectorySample[], geom: PlatformGeometry, speed = 1): TrajectoryCheck {
  let prev: { t: number; L: number[] } | null = null;
  let peak = 0;
  let lo = Infinity;
  let hi = -Infinity;
  let firstInvalid: TrajectoryCheck['firstInvalid'] = null;
  samples.forEach((s, index) => {
    const { lengths } = solvePose(s, geom);
    for (const l of lengths) {
      lo = Math.min(lo, l);
      hi = Math.max(hi, l);
    }
    if (!firstInvalid && lengths.some((l) => l < geom.stroke_min || l > geom.stroke_max)) firstInvalid = { index, t: s.t };
    if (prev && s.t > prev.t) {
      const dt = (s.t - prev.t) / speed;
      for (let i = 0; i < 6; i++) peak = Math.max(peak, Math.abs(lengths[i] - prev.L[i]) / dt);
    }
    prev = { t: s.t, L: lengths };
  });
  return {
    valid: !firstInvalid,
    firstInvalid,
    peakSpeed: peak,
    minLength: lo,
    maxLength: hi,
    tooFast: peak > ACTUATOR_SPEED_MM_S,
  };
}
