import { describe, expect, it } from 'vitest';
import { DEFAULT_GEOMETRY } from '@/features/platform3d/geometry';
import { solvePose, zeroPose } from '@/lib/kinematics';
import { axisReach, gridExtent, makeMargin, positionField, SWEEP, tiltField, volumeLiters } from './workspace';

const g = DEFAULT_GEOMETRY;
const margin = makeMargin(g);

// pseudoaleatório determinístico
let seed = 7;
const rnd = (a: number, b: number) => {
  seed = (seed * 16807) % 2147483647;
  return a + ((seed - 1) / 2147483646) * (b - a);
};

describe('espaço de trabalho', () => {
  it('o sinal da margem bate com solvePose().valid', () => {
    for (let i = 0; i < 1000; i++) {
      const p = { x: rnd(-90, 90), y: rnd(-90, 90), z: rnd(420, 660), roll: rnd(-20, 20), pitch: rnd(-20, 20), yaw: rnd(-25, 25) };
      const m = margin(p.x, p.y, p.z, p.roll, p.pitch, p.yaw);
      // longe da fronteira (a margem de 10 mm do legStatus não conta como inválido)
      if (Math.abs(m) < 1e-6) continue;
      const lengths = solvePose(p, g).lengths;
      expect(m >= 0).toBe(lengths.every((l) => l >= g.stroke_min && l <= g.stroke_max));
    }
  });

  it('o home está dentro, com folga', () => {
    expect(margin(0, 0, g.home_z, 0, 0, 0)).toBeGreaterThan(20);
  });

  it('alcance por eixo: logo dentro é válido e logo fora não', () => {
    const home = zeroPose(g.home_z);
    const r = axisReach(g, home);
    for (const axis of ['x', 'y', 'z', 'roll', 'pitch', 'yaw'] as const) {
      const [lo, hi] = r[axis];
      expect(lo).toBeLessThan(home[axis]);
      expect(hi).toBeGreaterThan(home[axis]);
      const eps = axis === 'x' || axis === 'y' || axis === 'z' ? 0.5 : 0.05;
      const m = (v: number) => {
        const p = { ...home, [axis]: v };
        return margin(p.x, p.y, p.z, p.roll, p.pitch, p.yaw);
      };
      expect(m(hi - eps)).toBeGreaterThanOrEqual(0);
      expect(m(hi + eps)).toBeLessThan(0);
      expect(m(lo + eps)).toBeGreaterThanOrEqual(0);
      expect(m(lo - eps)).toBeLessThan(0);
    }
  });

  it('a grade cobre o volume com folga e inclinar encolhe o volume', () => {
    const flat = positionField(g, { roll: 0, pitch: 0, yaw: 0 }, 41);
    const e = gridExtent(flat);
    expect(e.z[0]).toBeGreaterThan(SWEEP.z0);
    expect(e.z[1]).toBeLessThan(SWEEP.z1);
    expect(e.x[1]).toBeLessThan(SWEEP.half);
    expect(e.y[1]).toBeLessThan(SWEEP.half);
    const tilted = positionField(g, { roll: 8, pitch: 0, yaw: 0 }, 41);
    expect(volumeLiters(tilted)).toBeLessThan(volumeLiters(flat));
    expect(volumeLiters(flat)).toBeGreaterThan(0.1);
  });

  it('inclinação máxima é positiva no home e zero fora do alcance', () => {
    const t = tiltField(g, { x: 0, y: 0, z: g.home_z }, 0, 24);
    expect(Math.min(...t.map((d) => d.max))).toBeGreaterThan(3);
    expect(tiltField(g, { x: 0, y: 0, z: 900 }, 0, 8).every((d) => d.max === 0)).toBe(true);
  });
});
