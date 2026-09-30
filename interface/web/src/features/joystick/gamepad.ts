import { useEffect, useRef, useState } from 'react';
import { limitPose, type LimitGeometry, type PoseKey, type UiLimits } from '@/lib/limits';
import type { Pose } from '@/lib/types';

export interface Sticks {
  lx: number;
  ly: number;
  rx: number;
  ry: number;
  /** gatilhos 0..1 */
  lt: number;
  rt: number;
}

export const NEUTRAL: Sticks = { lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0 };

/** Z pelos gatilhos: fração do alcance de Z (o resto vem do alcance real, igual ao backend). */
export const JOYSTICK_Z_FRACTION = 0.5;

export function applyDeadzone(v: number, dz = 0.1): number {
  if (Math.abs(v) < dz) return 0;
  // reescala para não dar salto ao sair da zona morta
  return Math.sign(v) * ((Math.abs(v) - dz) / (1 - dz));
}

/**
 * Mesmo mapeamento do backend (/joystick/pose): o curso total do stick é o alcance de
 * operação de cada eixo a partir do home, vezes a sensibilidade; cada lado usa o seu
 * alcance. Os eixos juntos podem passar do limite: `limitPose` traz para dentro.
 */
export function sticksToPose(s: Sticks, zBase: number, lim: UiLimits, geom: LimitGeometry, scale = 1): Pose {
  const clamp = (v: number) => Math.max(-1, Math.min(1, v));
  const span = (v: number, k: PoseKey) => clamp(v) * scale * (v >= 0 ? lim.reach[k][1] : -lim.reach[k][0]);
  const zRange = lim.reach.z;
  const z = zBase + (clamp(s.rt) - clamp(s.lt)) * JOYSTICK_Z_FRACTION * (s.rt >= s.lt ? zRange[1] : -zRange[0]);
  const pose = {
    x: span(s.lx, 'x'),
    y: span(-s.ly, 'y'),
    z: Math.min(lim.pose.z[1], Math.max(lim.pose.z[0], z)),
    roll: span(-s.ry, 'roll'),
    pitch: span(s.rx, 'pitch'),
    yaw: 0,
  };
  return limitPose(pose, geom).pose;
}

function readPad(gp: Gamepad): Sticks {
  const axis = (i: number) => applyDeadzone(gp.axes[i] ?? 0);
  const trigger = (i: number) => {
    const b = gp.buttons[i];
    return b ? Math.max(0, Math.min(1, b.value)) : 0;
  };
  return { lx: axis(0), ly: axis(1), rx: axis(2), ry: axis(3), lt: trigger(6), rt: trigger(7) };
}

/**
 * Lê o primeiro gamepad conectado a cada frame e entrega os eixos em `onFrame`.
 * Retorna o nome do controle (ou null se nenhum estiver conectado).
 */
export function useGamepad(onFrame: (s: Sticks) => void, enabled = true): string | null {
  const [pad, setPad] = useState<{ index: number; id: string } | null>(null);
  const cb = useRef(onFrame);
  useEffect(() => {
    cb.current = onFrame;
  });

  useEffect(() => {
    if (!('getGamepads' in navigator)) return;
    const find = () => {
      const gp = navigator.getGamepads().find((g): g is Gamepad => !!g && g.connected);
      setPad(gp ? { index: gp.index, id: gp.id } : null);
    };
    find();
    window.addEventListener('gamepadconnected', find);
    window.addEventListener('gamepaddisconnected', find);
    return () => {
      window.removeEventListener('gamepadconnected', find);
      window.removeEventListener('gamepaddisconnected', find);
    };
  }, []);

  useEffect(() => {
    if (!pad || !enabled) return;
    let raf = 0;
    const loop = () => {
      const gp = navigator.getGamepads()[pad.index];
      if (gp) cb.current(readPad(gp));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [pad, enabled]);

  return pad?.id ?? null;
}
