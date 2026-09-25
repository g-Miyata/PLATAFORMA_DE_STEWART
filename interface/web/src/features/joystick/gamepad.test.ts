import { describe, expect, it } from 'vitest';
import { applyDeadzone, NEUTRAL, sticksToPose } from './gamepad';

describe('mapeamento do joystick', () => {
  it('zona morta zera ruído e não dá salto', () => {
    expect(applyDeadzone(0.05)).toBe(0);
    expect(applyDeadzone(0.1)).toBeCloseTo(0);
    expect(applyDeadzone(1)).toBe(1);
    expect(applyDeadzone(-1)).toBe(-1);
  });

  it('segue o mesmo mapeamento de /joystick/pose', () => {
    const p = sticksToPose({ ...NEUTRAL, lx: 1, ly: -0.5, rx: 0.5, ry: -1, rt: 1 }, 530);
    expect(p).toEqual({ x: 30, y: 15, z: 550, roll: 8, pitch: 4, yaw: 0 });
  });

  it('satura em ±1', () => {
    expect(sticksToPose({ ...NEUTRAL, lx: 3 }, 500).x).toBe(30);
  });
});
