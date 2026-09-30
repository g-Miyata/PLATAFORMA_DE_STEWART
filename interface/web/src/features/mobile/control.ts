// Controles do celular (tela /celular): giroscópio e joystick na tela. Contas puras,
// testadas em control.test.ts; as páginas só ligam os eventos e enviam.

export interface Orientation {
  /** DeviceOrientationEvent.beta: frente/trás (−180..180°) */
  beta: number;
  /** DeviceOrientationEvent.gamma: esquerda/direita (−90..90°) */
  gamma: number;
}

export interface Tilt {
  roll: number;
  pitch: number;
}

const clamp = (v: number, lim: number) => Math.max(-lim, Math.min(lim, v));
const wrap180 = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;

/**
 * Inclinação pedida pelo celular: quanto ele girou desde o "Zerar", vezes a
 * sensibilidade, presa na inclinação máxima da bancada. Celular deitado com a tela
 * para cima: inclinar para a direita = roll positivo; inclinar a ponta para baixo =
 * pitch positivo (o tampo acompanha como uma bandeja na mão).
 */
export function tiltFromOrientation(o: Orientation, zero: Orientation, sensitivity: number, maxDeg: number): Tilt {
  const roll = wrap180(o.gamma - zero.gamma) * sensitivity;
  const pitch = -wrap180(o.beta - zero.beta) * sensitivity;
  // limite em cone: a inclinação total (roll e pitch juntos) não passa de maxDeg
  const mag = Math.hypot(roll, pitch);
  const k = mag > maxDeg ? maxDeg / mag : 1;
  return { roll: clamp(roll * k, maxDeg), pitch: clamp(pitch * k, maxDeg) };
}

/** Aproxima a inclinação do alvo sem passar da taxa (°/s) que os atuadores acompanham. */
export function approachTilt(current: Tilt, target: Tilt, dt: number, rateDegS: number): Tilt {
  const step = rateDegS * dt;
  const go = (v: number, t: number) => v + Math.max(-step, Math.min(step, t - v));
  return { roll: go(current.roll, target.roll), pitch: go(current.pitch, target.pitch) };
}

/** Posição do dedo no joystick da tela → eixos −1..1 (y para cima positivo), com zona morta. */
export function stickFromOffset(dx: number, dy: number, radius: number, deadzone = 0.08): { x: number; y: number } {
  let x = dx / radius;
  let y = -dy / radius;
  const mag = Math.hypot(x, y);
  if (mag > 1) {
    x /= mag;
    y /= mag;
  }
  const m = Math.min(1, mag);
  if (m < deadzone) return { x: 0, y: 0 };
  // reescala para não dar salto ao sair da zona morta
  const k = (m - deadzone) / (1 - deadzone) / (m || 1);
  return { x: x * m * k, y: y * m * k };
}

/** Velocidade que a bancada acompanha em inclinação (°/s): a mesma do "espelhar" do Jogo. */
export const PHONE_TILT_RATE = 8;
