// Fases do jogo, no sistema do tampo (mm). O tampo tem ~230 mm do centro às
// bordas longas; as fases ficam dentro disso (conferido em ballPhysics.test.ts).
import type { Level } from './ballPhysics';

export const LEVELS: Level[] = [
  {
    id: 'rolamento',
    name: 'Primeiro rolamento',
    hint: 'Incline o tampo e pare a bolinha no alvo verde (chegue devagar).',
    start: [-150, 0],
    goal: { x: 120, y: 0, r: 42 },
    holes: [],
    walls: [],
  },
  {
    id: 'desvio',
    name: 'Desvio',
    hint: 'Contorne a parede.',
    start: [-150, -70],
    goal: { x: 110, y: 70, r: 36 },
    holes: [],
    walls: [{ a: [-20, -130], b: [-20, 70] }],
  },
  {
    id: 'buracos',
    name: 'Cuidado com os buracos',
    hint: 'Os buracos pretos reiniciam a fase.',
    start: [-160, 0],
    goal: { x: 135, y: 0, r: 32 },
    holes: [
      { x: 0, y: 0, r: 30 },
      { x: -50, y: 95, r: 24 },
      { x: 60, y: -95, r: 24 },
    ],
    walls: [],
  },
  {
    id: 'zigue',
    name: 'Zigue-zague',
    hint: 'Passe pelas aberturas alternadas.',
    start: [-170, -90],
    goal: { x: 140, y: -40, r: 30 },
    holes: [{ x: -20, y: 105, r: 24 }],
    walls: [
      { a: [-90, -170], b: [-90, 60] },
      { a: [40, -60], b: [40, 170] },
    ],
  },
  {
    id: 'labirinto',
    name: 'Labirinto',
    hint: 'Paciência: movimentos pequenos e suaves.',
    start: [-175, 0],
    goal: { x: 150, y: 60, r: 26 },
    holes: [
      { x: -40, y: -100, r: 22 },
      { x: 70, y: 110, r: 22 },
      { x: 95, y: -30, r: 20 },
    ],
    walls: [
      { a: [-110, -60], b: [-110, 140] },
      { a: [-110, -60], b: [10, -60] },
      { a: [10, 40], b: [10, 190] },
      { a: [60, -170], b: [60, 20] },
    ],
  },
];
