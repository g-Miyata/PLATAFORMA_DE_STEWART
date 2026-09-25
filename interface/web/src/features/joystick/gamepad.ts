import { useEffect, useRef, useState } from 'react';
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

/** Mesmo mapeamento do backend (/joystick/pose), para o preview local bater com o aplicado. */
export const JOYSTICK_LIMITS = { transMm: 30, angleDeg: 8, zRangeMm: 20 } as const;

export function applyDeadzone(v: number, dz = 0.1): number {
  if (Math.abs(v) < dz) return 0;
  // reescala para não dar salto ao sair da zona morta
  return Math.sign(v) * ((Math.abs(v) - dz) / (1 - dz));
}

export function sticksToPose(s: Sticks, zBase: number): Pose {
  const { transMm, angleDeg, zRangeMm } = JOYSTICK_LIMITS;
  const clamp = (v: number) => Math.max(-1, Math.min(1, v));
  return {
    x: clamp(s.lx) * transMm,
    y: -clamp(s.ly) * transMm,
    z: zBase + (clamp(s.rt) - clamp(s.lt)) * zRangeMm,
    roll: -clamp(s.ry) * angleDeg,
    pitch: clamp(s.rx) * angleDeg,
    yaw: 0,
  };
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
