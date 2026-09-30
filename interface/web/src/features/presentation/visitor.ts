// Controle do visitante na apresentação: a entrada (arrastar, setas, gamepad)
// vira inclinação do tampo, com limite de ângulo e de taxa.
import type { Tilt } from '@/features/game/engine';

export interface TiltLimits {
  maxDeg: number;
  rateDegS: number;
}

/** só o modelo 3D: mais solto */
export const VISITOR_MODEL: TiltLimits = { maxDeg: 8, rateDegS: 30 };
/** com a bancada de verdade: o que os atuadores acompanham (igual ao "espelhar" do Jogo) */
export const VISITOR_REAL: TiltLimits = { maxDeg: 5, rateDegS: 8 };
/** sem entrada por esse tempo, volta ao laço automático */
export const VISITOR_IDLE_S = 30;

/** Aproxima a inclinação do alvo pedido pela entrada (−1..1), sem passar dos limites. */
export function stepTilt(current: Tilt, input: [number, number], dt: number, limits: TiltLimits): Tilt {
  const clamp = (v: number) => Math.max(-1, Math.min(1, v));
  const target = { roll: clamp(input[0]) * limits.maxDeg, pitch: clamp(input[1]) * limits.maxDeg };
  const step = limits.rateDegS * dt;
  const approach = (v: number, t: number) => {
    const next = v + Math.max(-step, Math.min(step, t - v));
    return Math.max(-limits.maxDeg, Math.min(limits.maxDeg, next));
  };
  return { roll: approach(current.roll, target.roll), pitch: approach(current.pitch, target.pitch) };
}
