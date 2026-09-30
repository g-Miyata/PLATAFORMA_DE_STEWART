// Coreografia da página inicial: uma sequência de movimentos típicos da bancada,
// em loop, com transições suaves. Toda pose gerada fica dentro do curso dos
// atuadores (verificado em showcase.test.ts).
import type { Pose } from '@/lib/types';

export interface Move {
  name: string;
  description: string;
  /** deslocamento em relação ao home, com a fase u indo de 0 a 1 ao longo do movimento */
  pose: (u: number) => Partial<Pose>;
}

const TAU = Math.PI * 2;
const s = (u: number, cycles = 1, phase = 0) => Math.sin(TAU * (u * cycles + phase));
const c = (u: number, cycles = 1, phase = 0) => Math.cos(TAU * (u * cycles + phase));

export const MOVES: Move[] = [
  { name: 'Heave', description: 'Sobe e desce em Z', pose: (u) => ({ z: 28 * s(u, 2) }) },
  { name: 'Roll', description: 'Balanço lateral em torno de X', pose: (u) => ({ roll: 8 * s(u, 2) }) },
  { name: 'Pitch', description: 'Aceno em torno de Y', pose: (u) => ({ pitch: 8 * s(u, 2) }) },
  { name: 'Círculo XY', description: 'Translação circular no plano', pose: (u) => ({ x: 22 * c(u, 1.5), y: 22 * s(u, 1.5), roll: -2.5 * s(u, 1.5), pitch: 2.5 * c(u, 1.5) }) },
  { name: 'Yaw', description: 'Giro em torno do eixo vertical', pose: (u) => ({ yaw: 14 * s(u, 1.5) }) },
  { name: 'Onda', description: 'Heave + pitch defasados, como uma embarcação', pose: (u) => ({ z: 16 * s(u, 2), pitch: 6 * s(u, 2, 0.25), roll: 3 * s(u, 1) }) },
  { name: 'Hélice', description: 'Círculo em XY subindo e descendo em Z', pose: (u) => ({ x: 18 * c(u, 2), y: 18 * s(u, 2), z: 18 * s(u, 1), yaw: 5 * s(u, 2) }) },
];

export const MOVE_SECONDS = 7;
/** fração do movimento usada para entrar e sair (evita saltos entre movimentos) */
const RAMP = 0.16;

const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/** Pose da coreografia no instante t (s); retorna também qual movimento está tocando. */
export function showcasePose(t: number, homeZ: number): { pose: Pose; move: Move; index: number } {
  const total = MOVES.length * MOVE_SECONDS;
  const tt = ((t % total) + total) % total;
  const index = Math.floor(tt / MOVE_SECONDS);
  const u = (tt - index * MOVE_SECONDS) / MOVE_SECONDS;
  const move = MOVES[index];
  // envelope: 0 no começo e no fim de cada movimento, 1 no meio
  const env = ease(u / RAMP) * ease((1 - u) / RAMP);
  const d = move.pose(u);
  const pose: Pose = {
    x: (d.x ?? 0) * env,
    y: (d.y ?? 0) * env,
    z: homeZ + (d.z ?? 0) * env,
    roll: (d.roll ?? 0) * env,
    pitch: (d.pitch ?? 0) * env,
    yaw: (d.yaw ?? 0) * env,
  };
  return { pose, move, index };
}
