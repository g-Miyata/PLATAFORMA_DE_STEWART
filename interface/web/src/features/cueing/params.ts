import type { CueingParams } from '@/lib/types';

/** parâmetros numéricos (invert_pitch é um interruptor à parte) */
export type NumericParam = Exclude<keyof CueingParams, 'invert_pitch'>;

export interface ParamField {
  key: NumericParam;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  unitSpoken: string;
  digits: number;
}

export interface ParamGroup {
  title: string;
  description: string;
  fields: ParamField[];
}

const f = (key: NumericParam, label: string, min: number, max: number, step: number, unit: string, unitSpoken: string, digits = 1): ParamField => ({
  key, label, min, max, step, unit, unitSpoken, digits,
});

// Faixas iguais às de CueingParams no backend (cueing.py)
export const PARAM_GROUPS: ParamGroup[] = [
  {
    title: 'Geral',
    description: 'Quanto das acelerações do avião vira inclinação e translação, e o limite físico dos pistões.',
    fields: [
      f('f_scale', 'Escala da inclinação (tilt)', 0, 1.5, 0.05, '×', 'vezes', 2),
      f('trans_scale', 'Escala da translação', 0, 1.5, 0.05, '×', 'vezes', 2),
      f('leg_speed_max', 'Velocidade máxima das pernas', 1, 60, 0.5, 'mm/s', 'milímetros por segundo'),
      f('z0', 'Altura neutra', 480, 580, 1, 'mm', 'milímetros', 0),
    ],
  },
  {
    title: 'Inclinação sustentada (tilt)',
    description: 'A gravidade faz o papel da aceleração longa: o tampo inclina devagar, abaixo do que o ouvido interno percebe como rotação.',
    fields: [
      f('tilt_omega', 'Passa-baixa', 0.2, 10, 0.1, 'rad/s', 'radianos por segundo'),
      f('tilt_rate_max', 'Taxa máxima', 0.5, 10, 0.1, '°/s', 'graus por segundo'),
      f('tilt_max', 'Inclinação máxima', 0, 15, 0.5, '°', 'graus'),
    ],
  },
  {
    title: 'Rotação',
    description: 'Início das rolagens, arfagens e guinadas; depois volta ao centro.',
    fields: [
      f('rot_scale', 'Escala de roll e pitch', 0, 1.5, 0.05, '×', 'vezes', 2),
      f('yaw_scale', 'Escala de yaw', 0, 1.5, 0.05, '×', 'vezes', 2),
      f('rot_omega', 'Washout', 0.1, 5, 0.1, 'rad/s', 'radianos por segundo'),
    ],
  },
  {
    title: 'Translação',
    description: 'Solavancos de surge, sway e heave; o tampo volta ao centro sozinho.',
    fields: [
      f('trans_omega', 'Washout surge/sway', 0.5, 10, 0.1, 'rad/s', 'radianos por segundo'),
      f('trans_zeta', 'Amortecimento', 0.3, 2, 0.05, '', '', 2),
      f('trans_washout', 'Passa-alta surge/sway', 0, 5, 0.1, 'rad/s', 'radianos por segundo'),
      f('heave_omega', 'Washout heave', 0.5, 10, 0.1, 'rad/s', 'radianos por segundo'),
      f('heave_washout', 'Passa-alta heave', 0, 5, 0.1, 'rad/s', 'radianos por segundo'),
    ],
  },
  {
    title: 'Limites da pose',
    description: 'Excursão máxima em torno da pose neutra. Poses fora do curso são encolhidas até caber.',
    fields: [
      f('x_max', 'X', 0, 60, 1, 'mm', 'milímetros', 0),
      f('y_max', 'Y', 0, 60, 1, 'mm', 'milímetros', 0),
      f('z_max', 'Z', 0, 60, 1, 'mm', 'milímetros', 0),
      f('roll_max', 'Roll', 0, 15, 0.5, '°', 'graus'),
      f('pitch_max', 'Pitch', 0, 15, 0.5, '°', 'graus'),
      f('yaw_max', 'Yaw', 0, 15, 0.5, '°', 'graus'),
    ],
  },
];

// Tela Orientação do avião: só o perfil de atitude e o limite físico
export const ATTITUDE_GROUPS: ParamGroup[] = [
  {
    title: 'Orientação',
    description: 'A plataforma copia roll e pitch do avião, multiplicados pela escala e cortados no limite.',
    fields: [
      f('att_scale', 'Escala de roll e pitch', 0, 1.5, 0.05, '×', 'vezes', 2),
      f('att_limit', 'Limite de roll e pitch', 0, 15, 0.5, '°', 'graus'),
      f('att_z', 'Altura', 480, 580, 1, 'mm', 'milímetros', 0),
      f('leg_speed_max', 'Velocidade máxima das pernas', 1, 60, 0.5, 'mm/s', 'milímetros por segundo'),
    ],
  },
];

export const PRESETS: { id: string; label: string; apply: (d: CueingParams) => CueingParams }[] = [
  { id: 'suave', label: 'Suave', apply: (d) => ({ ...d, f_scale: 0.35, trans_scale: 0.2, rot_scale: 0.2, yaw_scale: 0.1, tilt_rate_max: 1.5, tilt_max: 6 }) },
  { id: 'padrao', label: 'Padrão', apply: (d) => ({ ...d }) },
  { id: 'intenso', label: 'Intenso', apply: (d) => ({ ...d, f_scale: 0.8, trans_scale: 0.5, rot_scale: 0.5, yaw_scale: 0.3, tilt_rate_max: 3, tilt_max: 10 }) },
];
