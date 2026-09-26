import { create } from 'zustand';
import type { Pose } from '@/lib/types';

/** Estado da cena da aula: os widgets escrevem, o 3D lê (sem passar props por tudo). */
export interface LessonSceneState {
  pose: Pose;
  /** perna em destaque (0..5) */
  leg: number;
  /** fantasmas da Stewart: alvo do desafio, ordem trocada, iterações do solver */
  ghosts: { pose: Pose; color: string; label?: string }[];
  /** perna com a esfera de restrição (null = nenhuma) */
  sphereLeg: number | null;
  /** comprimentos "medidos" da direta: o raio das esferas (null = o comprimento atual) */
  measured: number[] | null;
  /** pernas acesas em sequência (widget "perna por perna"); null = todas normais */
  litLegs: number[] | null;
  /** peça em destaque na aula 1.1 */
  focus: string | null;
  /** ângulos do UR5e (rad) */
  ur: number[];
  /** outras soluções da inversa do UR5e (rad) */
  urGhosts: number[][];
  /** alvo da ferramenta do UR5e (m, no referencial da base dele) */
  urTarget: [number, number, number] | null;
  /** mostra os referenciais DH das juntas do UR5e */
  urFrames: boolean;
  set: (patch: Partial<Omit<LessonSceneState, 'set'>>) => void;
}

export const UR_HOME = [0, -100, 80, -70, -90, 0].map((d) => (d * Math.PI) / 180);

export const useLessonScene = create<LessonSceneState>((set) => ({
  pose: { x: 0, y: 0, z: 530, roll: 0, pitch: 0, yaw: 0 },
  leg: 0,
  ghosts: [],
  sphereLeg: null,
  measured: null,
  litLegs: null,
  focus: null,
  ur: UR_HOME,
  urGhosts: [],
  urTarget: null,
  urFrames: false,
  set: (patch) => set(patch),
}));
