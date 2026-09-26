// Definições dos blocos da plataforma, caixa de ferramentas e tema do Blockly.
import * as Blockly from 'blockly/core';
import * as ptBr from 'blockly/msg/pt-br';
import { PROGRAM_START, ROUTINE_LABEL, type RoutineKind } from './compile';

const MOVE = 150; // verde (IFSP)
const CONTROL = 210;
const ROUTINE = 30;

const num = (name: string, value: number, min: number, max: number, precision = 0.1) => ({ type: 'field_number', name, value, min, max, precision });
const secs = (name = 'T', value = 2) => num(name, value, 0.1, 600);

const AXES: [string, string][] = [
  ['X (mm)', 'x'],
  ['Y (mm)', 'y'],
  ['Z (mm, a partir do home)', 'z'],
  ['roll (°)', 'roll'],
  ['pitch (°)', 'pitch'],
  ['yaw (°)', 'yaw'],
];

const DEFINITIONS = [
  {
    type: PROGRAM_START,
    message0: 'ao iniciar',
    nextStatement: null,
    colour: CONTROL,
    tooltip: 'Todo programa começa aqui. Encaixe os movimentos embaixo.',
    hat: 'cap',
  },
  {
    type: 'stewart_pose',
    message0: 'mover para X %1 Y %2 Z %3 mm',
    args0: [num('X', 0, -80, 80), num('Y', 0, -80, 80), num('Z', 0, -100, 100)],
    message1: 'roll %1 pitch %2 yaw %3 °',
    args1: [num('ROLL', 0, -20, 20), num('PITCH', 0, -20, 20), num('YAW', 0, -20, 20)],
    message2: 'em %1 s',
    args2: [secs()],
    previousStatement: null,
    nextStatement: null,
    colour: MOVE,
    tooltip: 'Leva a plataforma até a pose completa no tempo dado. Z é medido a partir da altura de home.',
  },
  {
    type: 'stewart_axis',
    message0: 'mover %1 %2 %3 em %4 s',
    args0: [
      { type: 'field_dropdown', name: 'AXIS', options: AXES },
      {
        type: 'field_dropdown',
        name: 'MODE',
        options: [
          ['para', 'abs'],
          ['somando', 'rel'],
        ],
      },
      num('V', 10, -100, 100),
      secs(),
    ],
    previousStatement: null,
    nextStatement: null,
    colour: MOVE,
    tooltip: 'Muda só um eixo: "para" vai até o valor; "somando" anda esse tanto a partir de onde está.',
  },
  {
    type: 'stewart_home',
    message0: 'voltar ao home em %1 s',
    args0: [secs('T', 2)],
    previousStatement: null,
    nextStatement: null,
    colour: MOVE,
    tooltip: 'Volta para a posição de repouso (tampo nivelado na altura de home).',
  },
  {
    type: 'stewart_wait',
    message0: 'esperar %1 s',
    args0: [secs('T', 1)],
    previousStatement: null,
    nextStatement: null,
    colour: CONTROL,
    tooltip: 'Fica parado na pose atual.',
  },
  {
    type: 'stewart_repeat',
    message0: 'repetir %1 vezes',
    args0: [num('N', 2, 1, 50, 1)],
    message1: '%1',
    args1: [{ type: 'input_statement', name: 'DO' }],
    previousStatement: null,
    nextStatement: null,
    colour: CONTROL,
    tooltip: 'Repete os blocos de dentro.',
  },
  {
    type: 'stewart_routine',
    message0: 'rotina %1 amplitude %2 a %3 Hz por %4 s',
    args0: [
      { type: 'field_dropdown', name: 'ROUTINE', options: (Object.keys(ROUTINE_LABEL) as RoutineKind[]).map((k) => [ROUTINE_LABEL[k], k]) },
      num('AMP', 5, 0.5, 40),
      num('HZ', 0.2, 0.02, 1, 0.01),
      secs('T', 10),
    ],
    previousStatement: null,
    nextStatement: null,
    colour: ROUTINE,
    tooltip: 'Uma das rotinas prontas, somada à pose atual, com entrada e saída suaves. Amplitude em mm (Z, círculo) ou graus (pitch, roll).',
  },
  {
    type: 'stewart_interp',
    message0: 'interpolação %1',
    args0: [
      {
        type: 'field_dropdown',
        name: 'MODE',
        options: [
          ['suave', 'suave'],
          ['linear', 'linear'],
          ['degrau', 'degrau'],
        ],
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: CONTROL,
    tooltip: 'Como ir de uma pose à outra: suave (começa e termina devagar), linear ou degrau (salta e segura).',
  },
];

let registered = false;
/** Registra blocos e tradução uma vez (o módulo é carregado sob demanda). */
export function registerBlocks() {
  if (registered) return;
  registered = true;
  Blockly.setLocale(ptBr as unknown as Record<string, string>);
  Blockly.common.defineBlocksWithJsonArray(DEFINITIONS);
}

export const TOOLBOX = {
  kind: 'categoryToolbox',
  contents: [
    {
      kind: 'category',
      name: 'Movimento',
      colour: String(MOVE),
      contents: [{ kind: 'block', type: 'stewart_axis' }, { kind: 'block', type: 'stewart_pose' }, { kind: 'block', type: 'stewart_home' }],
    },
    {
      kind: 'category',
      name: 'Controle',
      colour: String(CONTROL),
      contents: [
        { kind: 'block', type: PROGRAM_START },
        { kind: 'block', type: 'stewart_wait' },
        { kind: 'block', type: 'stewart_repeat' },
        { kind: 'block', type: 'stewart_interp' },
      ],
    },
    { kind: 'category', name: 'Rotinas', colour: String(ROUTINE), contents: [{ kind: 'block', type: 'stewart_routine' }] },
  ],
};

/** Tema derivado dos tokens de cor do app (claro/escuro). */
export function makeTheme(dark: boolean) {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return Blockly.Theme.defineTheme(dark ? 'stewart-escuro' : 'stewart-claro', {
    name: dark ? 'stewart-escuro' : 'stewart-claro',
    base: Blockly.Themes.Classic,
    componentStyles: {
      workspaceBackgroundColour: v('--c-surface-2', dark ? '#1a1d1b' : '#f4f6f5'),
      toolboxBackgroundColour: v('--c-surface', dark ? '#121513' : '#ffffff'),
      toolboxForegroundColour: v('--c-text', dark ? '#e8ece9' : '#1a1d1b'),
      flyoutBackgroundColour: v('--c-surface-3', dark ? '#262a27' : '#e8ece9'),
      flyoutForegroundColour: v('--c-text', dark ? '#e8ece9' : '#1a1d1b'),
      flyoutOpacity: 0.96,
      scrollbarColour: v('--c-border-strong', '#8a918c'),
      insertionMarkerColour: v('--c-brand', '#2f9e41'),
      insertionMarkerOpacity: 0.4,
      cursorColour: v('--c-brand', '#2f9e41'),
    },
    fontStyle: { family: 'Inter Variable, Inter, system-ui, sans-serif', size: 12 },
  });
}
