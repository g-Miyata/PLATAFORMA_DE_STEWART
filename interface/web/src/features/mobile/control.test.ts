import { describe, expect, it } from 'vitest';
import { approachTilt, stickFromOffset, tiltFromOrientation } from './control';

describe('giroscópio do celular', () => {
  const zero = { beta: 10, gamma: -5 };

  it('mede a partir do zero e aplica a sensibilidade', () => {
    const t = tiltFromOrientation({ beta: 10, gamma: 5 }, zero, 0.5, 20);
    expect(t.roll).toBeCloseTo(5);
    expect(t.pitch).toBeCloseTo(0);
    expect(tiltFromOrientation({ beta: 16, gamma: -5 }, zero, 1, 20).pitch).toBeCloseTo(-6);
  });

  it('limita em cone (roll e pitch juntos não passam do máximo)', () => {
    const t = tiltFromOrientation({ beta: -50, gamma: 45 }, zero, 1, 10);
    expect(Math.hypot(t.roll, t.pitch)).toBeCloseTo(10);
    expect(t.roll).toBeGreaterThan(0);
    expect(t.pitch).toBeGreaterThan(0);
  });

  it('não dá salto quando o beta passa de 180 para −180', () => {
    const t = tiltFromOrientation({ beta: -178, gamma: 0 }, { beta: 178, gamma: 0 }, 1, 20);
    expect(t.pitch).toBeCloseTo(-4);
  });

  it('respeita a taxa dos atuadores', () => {
    let cur = { roll: 0, pitch: 0 };
    cur = approachTilt(cur, { roll: 10, pitch: -10 }, 0.1, 8);
    expect(cur).toEqual({ roll: 0.8, pitch: -0.8 });
  });
});

describe('joystick na tela', () => {
  it('centro é zero (zona morta) e a borda é 1', () => {
    expect(stickFromOffset(2, 2, 60)).toEqual({ x: 0, y: 0 });
    const r = stickFromOffset(60, 0, 60);
    expect(r.x).toBeCloseTo(1);
    expect(r.y).toBeCloseTo(0);
  });

  it('para cima na tela é y positivo e passa da borda satura', () => {
    const r = stickFromOffset(0, -200, 60);
    expect(r.y).toBeCloseTo(1);
    expect(Math.hypot(r.x, r.y)).toBeLessThanOrEqual(1 + 1e-9);
  });
});
