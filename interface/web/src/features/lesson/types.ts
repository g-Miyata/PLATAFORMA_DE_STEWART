import type { Pose } from '@/lib/types';

export interface Question {
  q: string;
  options: string[];
  correct: number;
  explain: string;
}

/** O que desenhar sobre a Stewart (setas, pontos, referenciais). */
export interface Overlays {
  /** juntas da base aᵢ */
  base?: boolean;
  /** juntas do tampo: 'P' = Pᵢ em {B}; 'b' = rótulo bᵢ */
  plate?: 'P' | 'b';
  /** referencial {B} na origem */
  baseFrame?: boolean;
  /** referencial {P} no centro do tampo */
  plateFrame?: boolean;
  /** seta p (de {B} até {P}) */
  translation?: boolean;
  /** vetores sᵢ: todos ou só o escolhido */
  legs?: 'all' | 'one';
  /** decomposição da perna escolhida: p, R·bᵢ e aᵢ */
  decomposition?: boolean;
  /** esfera de raio Lᵢ em torno de aᵢ (restrição da direta) */
  sphere?: boolean;
  /** fantasmas: alvo do desafio, ordem trocada, iterações do solver */
  ghosts?: boolean;
  /** rótulos das peças (base, tampo, atuador, cardã) */
  parts?: boolean;
}

export type SceneShow = 'stewart' | 'ur5e' | 'both';
export type CameraPreset = 'iso' | 'joint' | 'actuator' | 'top' | 'front' | 'ur' | 'both';

export interface SceneSpec {
  show: SceneShow;
  overlays?: Overlays;
  camera?: CameraPreset;
  /** pose aplicada ao abrir a etapa (em relação ao home) */
  pose?: Partial<Pose>;
  /** ângulos do UR5e (graus) aplicados ao abrir a etapa */
  ur?: number[];
  /** a bancada faz a coreografia da página inicial (etapas sem interação) */
  showcase?: boolean;
}

/** Bloco de texto de uma etapa. Nos textos, $…$ é LaTeX e **…** é negrito. */
export type Block =
  | string
  | { eq: string; label: string }
  | { list: string[] }
  | { note: string }
  | { table: { head: string[]; rows: string[][]; caption: string } };

export type WidgetId =
  | 'parts'
  | 'pose-xyz'
  | 'pose-rpy'
  | 'pose-all'
  | 'pose-wide'
  | 'dof-challenge'
  | 'actuator'
  | 'points-base'
  | 'points-plate'
  | 'ur-fk'
  | 'arm-2r'
  | 'ur-ik'
  | 'ik-legs'
  | 'rotation-matrices'
  | 'zyx-order'
  | 'homogeneous'
  | 'ik-steps'
  | 'fk-experiment'
  | 'fk-constraints'
  | 'fk-solver';

export interface LessonStep {
  id: string;
  title: string;
  body: Block[];
  widgets?: WidgetId[];
  scene: SceneSpec;
  /** o que o 3D mostra, em texto (alternativa para quem não vê o canvas) */
  sceneSummary: string;
  quiz?: Question[];
}

export interface Lesson {
  id: string;
  title: string;
  summary: string;
  steps: LessonStep[];
}

export interface Module {
  id: string;
  title: string;
  lessons: Lesson[];
}
