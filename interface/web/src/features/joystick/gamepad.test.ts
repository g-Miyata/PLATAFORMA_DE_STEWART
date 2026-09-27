import { describe, expect, it } from 'vitest';
import { DEFAULT_GEOMETRY } from '@/features/platform3d/geometry';
import { solvePose } from '@/lib/kinematics';
import { uiLimits } from '@/lib/limits';
import { applyDeadzone, NEUTRAL, sticksToPose } from './gamepad';

describe('mapeamento do joystick', () => {
  it('zona morta zera ruído e não dá salto', () => {
    expect(applyDeadzone(0.05)).toBe(0);
    expect(applyDeadzone(0.1)).toBeCloseTo(0);
    expect(applyDeadzone(1)).toBe(1);
    expect(applyDeadzone(-1)).toBe(-1);
  });

  const g = DEFAULT_GEOMETRY;
  const lim = uiLimits(g);
  const home = lim.home;

  it('um eixo sozinho vai até o alcance real (cada lado com o seu) vezes a sensibilidade', () => {
    expect(sticksToPose({ ...NEUTRAL, lx: 1 }, home, lim, g).x).toBeCloseTo(lim.reach.x[1], 6);
    expect(sticksToPose({ ...NEUTRAL, lx: -1 }, home, lim, g).x).toBeCloseTo(lim.reach.x[0], 6);
    expect(sticksToPose({ ...NEUTRAL, ry: -0.5 }, home, lim, g, 0.5).roll).toBeCloseTo(lim.reach.roll[1] * 0.25, 6);
  });

  it('satura em ±1 e, com os eixos juntos, fica dentro dos limites', () => {
    expect(sticksToPose({ ...NEUTRAL, lx: 3 }, home, lim, g).x).toBeCloseTo(lim.reach.x[1], 6);
    const all = sticksToPose({ ...NEUTRAL, lx: 1, ly: 1, rx: 1, ry: 1, rt: 1 }, home, lim, g);
    expect(solvePose(all, g).valid).toBe(true);
  });
});
