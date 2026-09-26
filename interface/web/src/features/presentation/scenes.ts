// Laço da apresentação para o público (feiras e exposições): cenas com movimento,
// tomada de câmera e texto. Toda pose fica dentro do curso (scenes.test.ts).
import type { PoseAxis } from '@/features/recorder/trajectory';
import type { Pose } from '@/lib/types';

export type SceneId = 'titulo' | 'gdl' | 'pistoes' | 'voo' | 'cinematica' | 'toque';

/** Câmera em coordenadas esféricas em torno do centro da bancada (graus e mm). */
export interface Shot {
  azimuth: number;
  elevation: number;
  distance: number;
  /** altura do ponto olhado (mm) */
  targetZ: number;
}

export interface Scene {
  id: SceneId;
  title: string;
  subtitle: string;
  seconds: number;
  /** deslocamento em relação ao home, com u de 0 a 1 ao longo da cena */
  pose: (u: number) => Partial<Pose>;
  /** tomada no começo e no fim (interpolada com suavização) */
  shot: [Shot, Shot];
}

const TAU = Math.PI * 2;
const s = (u: number, cycles = 1, phase = 0) => Math.sin(TAU * (u * cycles + phase));
const c = (u: number, cycles = 1, phase = 0) => Math.cos(TAU * (u * cycles + phase));
export const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
/** 0 no começo e no fim de um trecho, 1 no meio (evita saltos entre cenas e eixos) */
const envelope = (u: number, ramp = 0.15) => ease(u / ramp) * ease((1 - u) / ramp);

/** Os seis eixos da cena "6 graus de liberdade", na ordem em que aparecem. */
export const DOF: { axis: PoseAxis; name: string; kind: 'translação' | 'rotação'; amp: number }[] = [
  { axis: 'x', name: 'X', kind: 'translação', amp: 26 },
  { axis: 'y', name: 'Y', kind: 'translação', amp: 26 },
  { axis: 'z', name: 'Z', kind: 'translação', amp: 30 },
  { axis: 'roll', name: 'Roll', kind: 'rotação', amp: 8 },
  { axis: 'pitch', name: 'Pitch', kind: 'rotação', amp: 8 },
  { axis: 'yaw', name: 'Yaw', kind: 'rotação', amp: 14 },
];

/** Qual eixo está em destaque na cena de graus de liberdade (u de 0 a 1). */
export function dofAt(u: number) {
  const k = Math.min(DOF.length - 1, Math.floor(u * DOF.length));
  return { index: k, u: u * DOF.length - k, ...DOF[k] };
}

export const SCENES: Scene[] = [
  {
    id: 'titulo',
    title: 'Plataforma de Stewart',
    subtitle: 'Um robô paralelo de seis graus de liberdade, feito no IFSP São José dos Campos',
    seconds: 12,
    pose: (u) => ({ z: 22 * s(u, 1.5), yaw: 6 * s(u, 1, 0.25) }),
    shot: [
      { azimuth: -70, elevation: 8, distance: 2800, targetZ: 260 },
      { azimuth: -35, elevation: 22, distance: 3300, targetZ: 170 },
    ],
  },
  {
    id: 'gdl',
    title: '6 graus de liberdade',
    subtitle: 'Três translações e três rotações: qualquer posição e inclinação dentro do alcance',
    seconds: 18,
    pose: (u) => {
      const d = dofAt(u);
      return { [d.axis]: d.amp * envelope(d.u, 0.2) * s(d.u, 1) };
    },
    shot: [
      { azimuth: -40, elevation: 24, distance: 3050, targetZ: 200 },
      { azimuth: 20, elevation: 28, distance: 3050, targetZ: 200 },
    ],
  },
  {
    id: 'pistoes',
    title: 'Seis pistões, uma pose',
    subtitle: 'Cada pistão muda de comprimento; juntos, eles posicionam o tampo',
    seconds: 12,
    pose: (u) => ({ z: 16 * s(u, 2), pitch: 6 * s(u, 2, 0.25), roll: 4 * s(u, 1) }),
    shot: [
      { azimuth: 60, elevation: 14, distance: 2700, targetZ: 230 },
      { azimuth: 110, elevation: 18, distance: 2800, targetZ: 210 },
    ],
  },
  {
    id: 'voo',
    title: 'Do simulador de voo para a bancada',
    subtitle: 'Integrada ao FlightGear, com motion cueing: a plataforma reproduz as acelerações e as curvas do avião',
    seconds: 12,
    pose: (u) => ({ roll: 9 * s(u, 1), pitch: 4 * s(u, 2, 0.1), yaw: 5 * s(u, 1, 0.25), z: 8 * s(u, 2) }),
    shot: [
      { azimuth: 180, elevation: 10, distance: 2950, targetZ: 240 },
      { azimuth: 150, elevation: 16, distance: 2950, targetZ: 220 },
    ],
  },
  {
    id: 'cinematica',
    title: 'Cinemática em tempo real',
    subtitle: 'A cada instante o computador calcula o comprimento de cada pistão a partir da pose',
    seconds: 12,
    pose: (u) => ({ x: 20 * c(u, 1.5), y: 20 * s(u, 1.5), roll: -2.5 * s(u, 1.5), pitch: 2.5 * c(u, 1.5) }),
    shot: [
      { azimuth: -120, elevation: 30, distance: 3200, targetZ: 180 },
      { azimuth: -80, elevation: 26, distance: 3050, targetZ: 180 },
    ],
  },
  {
    id: 'toque',
    title: 'Toque para controlar',
    subtitle: 'Arraste na tela ou use o controle para inclinar a plataforma',
    seconds: 9,
    pose: (u) => ({ roll: 4 * s(u, 1.5), pitch: 4 * c(u, 1.5) }),
    shot: [
      { azimuth: -55, elevation: 24, distance: 3200, targetZ: 170 },
      { azimuth: -40, elevation: 26, distance: 3200, targetZ: 170 },
    ],
  },
];

export const LOOP_SECONDS = SCENES.reduce((a, sc) => a + sc.seconds, 0);

export interface SceneState {
  scene: Scene;
  index: number;
  /** fase dentro da cena, 0..1 */
  u: number;
  pose: Pose;
  shot: Shot;
}

function lerpShot(a: Shot, b: Shot, k: number): Shot {
  return {
    azimuth: a.azimuth + (b.azimuth - a.azimuth) * k,
    elevation: a.elevation + (b.elevation - a.elevation) * k,
    distance: a.distance + (b.distance - a.distance) * k,
    targetZ: a.targetZ + (b.targetZ - a.targetZ) * k,
  };
}

/** Estado do laço no instante t (s): cena, pose (com entrada e saída suaves) e câmera. */
export function sceneAt(t: number, homeZ: number): SceneState {
  let tt = ((t % LOOP_SECONDS) + LOOP_SECONDS) % LOOP_SECONDS;
  let index = 0;
  while (tt >= SCENES[index].seconds) {
    tt -= SCENES[index].seconds;
    index++;
  }
  const scene = SCENES[index];
  const u = tt / scene.seconds;
  const env = scene.id === 'gdl' ? 1 : envelope(u);
  const d = scene.pose(u);
  const pose: Pose = {
    x: (d.x ?? 0) * env,
    y: (d.y ?? 0) * env,
    z: homeZ + (d.z ?? 0) * env,
    roll: (d.roll ?? 0) * env,
    pitch: (d.pitch ?? 0) * env,
    yaw: (d.yaw ?? 0) * env,
  };
  return { scene, index, u, pose, shot: lerpShot(scene.shot[0], scene.shot[1], ease(u)) };
}

/** Posição da câmera (mm, Z para cima) para uma tomada. */
export function shotPosition(shot: Shot): [number, number, number] {
  const az = (shot.azimuth * Math.PI) / 180;
  const el = (shot.elevation * Math.PI) / 180;
  return [shot.distance * Math.cos(el) * Math.cos(az), shot.distance * Math.cos(el) * Math.sin(az), shot.targetZ + shot.distance * Math.sin(el)];
}

/** Instante (s) em que a cena começa no laço (para abrir direto nela: /apresentacao?cena=voo). */
export function sceneStart(id: string | null): number {
  let t = 0;
  for (const sc of SCENES) {
    if (sc.id === id) return t;
    t += sc.seconds;
  }
  return 0;
}
