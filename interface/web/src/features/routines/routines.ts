// Rotinas de movimento: presets da interface e uma cópia do gerador de trajetória
// do backend (MotionRunner._generate_pose / _clamp_pose em app.py), usada só para
// ESTIMAR antes de iniciar se os atuadores conseguem acompanhar a rotina.
import { legLengths, transformPoints } from '@/lib/kinematics';
import type { Axis, MotionRequest, PlatformGeometry, Pose, RoutineName } from '@/lib/types';

export interface ParamDef {
  name: keyof MotionRequest;
  label: string;
  unit: string;
  unitSpoken: string;
  min: number;
  max: number;
  step: number;
  value: number;
}

export interface Preset {
  key: string;
  title: string;
  description: string;
  routine: RoutineName;
  axis?: Axis;
  params: ParamDef[];
}

const hz = (value = 0.2, max = 1.5): ParamDef => ({ name: 'hz', label: 'Frequência', unit: 'Hz', unitSpoken: 'hertz', min: 0.05, max, step: 0.05, value });
const duration = (value = 30): ParamDef => ({ name: 'duration_s', label: 'Duração', unit: 's', unitSpoken: 'segundos', min: 5, max: 300, step: 5, value });
const mm = (name: keyof MotionRequest, label: string, value: number, min: number, max: number, step = 0.5): ParamDef => ({
  name, label, unit: 'mm', unitSpoken: 'milímetros', min, max, step, value,
});
const deg = (name: keyof MotionRequest, label: string, value: number, min: number, max: number): ParamDef => ({
  name, label, unit: '°', unitSpoken: 'graus', min, max, step: 0.5, value,
});

export const PRESETS: Preset[] = [
  { key: 'sine_z', title: 'Senoide vertical (Z)', description: 'Sobe e desce em torno do home.', routine: 'sine_axis', axis: 'z', params: [mm('amp', 'Amplitude', 10, 2, 40), hz(), duration()] },
  { key: 'circle_xy', title: 'Círculo XY', description: 'Percorre um círculo (ou elipse) no plano horizontal.', routine: 'circle_xy', params: [mm('ax', 'Raio em X', 15, 2, 40), mm('ay', 'Raio em Y', 15, 2, 40), hz(), duration()] },
  { key: 'heave_pitch', title: 'Onda (heave + pitch)', description: 'Z e pitch defasados de 90°, como uma embarcação.', routine: 'heave_pitch', params: [mm('amp', 'Amplitude em Z', 8, 2, 25), deg('ay', 'Amplitude de pitch', 2.5, 0.5, 8), hz(0.2, 0.8), duration(40)] },
  { key: 'sine_pitch', title: 'Senoide de pitch', description: 'Inclina para frente e para trás.', routine: 'sine_axis', axis: 'pitch', params: [deg('amp', 'Amplitude', 3, 0.5, 10), hz(0.2, 0.8), duration()] },
  { key: 'sine_roll', title: 'Senoide de roll', description: 'Inclina para os lados.', routine: 'sine_axis', axis: 'roll', params: [deg('amp', 'Amplitude', 3, 0.5, 10), hz(0.2, 0.8), duration()] },
  {
    key: 'helix', title: 'Hélice', description: 'Círculo em XY subindo e descendo em Z.', routine: 'helix',
    params: [mm('ax', 'Raio em X', 15, 2, 40), mm('ay', 'Raio em Y', 15, 2, 40), mm('z_amp_mm', 'Amplitude em Z', 8, 2, 30), { name: 'z_cycles', label: 'Ciclos em Z por volta', unit: '', unitSpoken: 'ciclos', min: 0.5, max: 4, step: 0.5, value: 1 }, hz(), duration()],
  },
];

export function buildRequest(preset: Preset, values: Record<string, number>): MotionRequest {
  const req: MotionRequest = { routine: preset.routine, duration_s: values.duration_s ?? 30, hz: values.hz ?? 0.2 };
  if (preset.axis) req.axis = preset.axis;
  for (const p of preset.params) (req as unknown as Record<string, number>)[p.name] = values[p.name] ?? p.value;
  return req;
}

const TAU = Math.PI * 2;

/** Pose da rotina no instante t, em regime (sem rampa), como no backend. */
export function routinePose(req: MotionRequest, t: number, zBase: number): Pose {
  const pose: Pose = { x: 0, y: 0, z: zBase, roll: 0, pitch: 0, yaw: 0 };
  const f = req.hz;
  switch (req.routine) {
    case 'sine_axis': {
      const axis = req.axis ?? 'z';
      const amp = req.amp ?? (['x', 'y', 'z'].includes(axis) ? 5 : 2);
      const offset = req.offset ?? (axis === 'z' ? zBase : 0);
      pose[axis] = offset + amp * Math.sin(TAU * f * t);
      break;
    }
    case 'circle_xy': {
      const ph = TAU * (req.phx ?? 0) / 360;
      pose.x = (req.ax ?? 10) * Math.cos(TAU * f * t + ph);
      pose.y = (req.ay ?? 10) * Math.sin(TAU * f * t + ph);
      break;
    }
    case 'helix': {
      const zAmp = req.z_amp_mm ?? 8;
      const circlePhase = (f * t) % 1;
      const zPhase = (f * (req.z_cycles ?? 1) * t) % 1;
      const ph = TAU * (req.phx ?? 0) / 360;
      const up = zPhase < 0.5;
      const zOff = up ? zAmp * (4 * zPhase - 1) : zAmp * (3 - 4 * zPhase);
      const angle = (up ? 1 : -1) * TAU * circlePhase + ph;
      pose.x = (req.ax ?? 10) * Math.cos(angle);
      pose.y = (req.ay ?? 10) * Math.sin(angle);
      pose.z = zBase + zOff;
      break;
    }
    case 'heave_pitch':
      pose.z = zBase + (req.amp ?? 8) * Math.sin(TAU * f * t);
      pose.pitch = (req.ay ?? 2.5) * Math.sin(TAU * f * t + TAU * 0.25);
      break;
  }
  // mesmos limites de _clamp_pose (Z usa a margem de fallback de ±30 mm)
  const c = (v: number, lim: number) => Math.max(-lim, Math.min(lim, v));
  pose.x = c(pose.x, 50);
  pose.y = c(pose.y, 50);
  pose.z = Math.max(zBase - 30, Math.min(zBase + 30, pose.z));
  pose.roll = c(pose.roll, 10);
  pose.pitch = c(pose.pitch, 10);
  pose.yaw = c(pose.yaw, 10);
  return pose;
}

export interface Feasibility {
  /** maior |dL/dt| entre os seis atuadores (mm/s) */
  peakSpeed: number;
  /** comprimento mínimo e máximo percorridos (mm) */
  minLength: number;
  maxLength: number;
  withinStroke: boolean;
}

/** Amostra um período (ou até 10 s) da rotina e mede o pior caso nos atuadores. */
export function analyzeRoutine(req: MotionRequest, geom: PlatformGeometry): Feasibility {
  const period = Math.min(10, 1 / Math.max(req.hz, 1e-3) * Math.max(1, req.routine === 'helix' ? 1 / Math.min(1, req.z_cycles ?? 1) : 1));
  const dt = Math.min(0.01, period / 400);
  let prev: number[] | null = null;
  let peak = 0;
  let lo = Infinity;
  let hi = -Infinity;
  for (let t = 0; t <= period + 1e-9; t += dt) {
    const L = legLengths(geom.base_points, transformPoints(routinePose(req, t, geom.home_z), geom.platform_points_local));
    for (let i = 0; i < 6; i++) {
      lo = Math.min(lo, L[i]);
      hi = Math.max(hi, L[i]);
      // o dente-de-serra da hélice inverte o sentido instantaneamente: ignora o salto
      if (prev && Math.abs(L[i] - prev[i]) < 5) peak = Math.max(peak, Math.abs(L[i] - prev[i]) / dt);
    }
    prev = L;
  }
  return { peakSpeed: peak, minLength: lo, maxLength: hi, withinStroke: lo >= geom.stroke_min && hi <= geom.stroke_max };
}

/** Velocidade que os atuadores reais sustentam (ensaios de degrau do TCC: ~10–16 mm/s). */
export const ACTUATOR_SPEED_MM_S = 12;
