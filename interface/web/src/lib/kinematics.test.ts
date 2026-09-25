import { describe, expect, it } from 'vitest';
import { legStatus, solvePose } from './kinematics';
import type { Vec3 } from './types';

// Valores de referência gerados por interface/backend/app.py (StewartPlatform.inverse_kinematics)
const B: Vec3[] = [[305.5, -17, 0], [305.5, 17, 0], [-137.7, 273.23, 0], [-168, 255.7, 0], [-167.2, -256.2, 0], [-136.8, -273.6, 0]];
const P0: Vec3[] = [[191.1, -241.5, 0], [191.1, 241.5, 0], [113.6, 286.2, 0], [-304.7, 44.8, 0], [-304.7, -44.8, 0], [113.1, -286.4, 0]];
const geom = { base_points: B, platform_points_local: P0, stroke_min: 500, stroke_max: 680 };

const cases = [
  { pose: { x: 0, y: 0, z: 530, roll: 0, pitch: 0, yaw: 0 }, lengths: [586.8455, 586.8455, 586.7026, 586.5711, 586.938, 586.1005], valid: true },
  {
    pose: { x: 12, y: -8, z: 545, roll: 4, pitch: -3, yaw: 6 },
    lengths: [583.0928, 631.4969, 616.2572, 602.0734, 565.8961, 606.0139],
    valid: true,
    points: [[227.8516, -227.5518, 538.1783], [175.7337, 251.4478, 571.8245], [93.9406, 287.6878, 570.8823], [-295.4497, 4.6228, 532.174], [-285.7814, -84.2351, 525.9324], [155.2302, -280.222, 530.9683]],
  },
  { pose: { x: -20, y: 15, z: 500, roll: -6, pitch: 5, yaw: -10 }, lengths: [588.8296, 510.2814, 536.7133, 560.1232, 621.1888, 550.6536], valid: true },
  { pose: { x: 0, y: 0, z: 432, roll: 0, pitch: 0, yaw: 0 }, lengths: [500.1116, 500.1116, 499.9439, 499.7897, 500.2202, 499.2373], valid: false },
];

describe('cinemática inversa (igual ao backend)', () => {
  it.each(cases)('pose %#', ({ pose, lengths, valid, points }) => {
    const s = solvePose(pose, geom);
    s.lengths.forEach((l, i) => expect(l).toBeCloseTo(lengths[i], 3));
    expect(s.valid).toBe(valid);
    points?.forEach((p, i) => p.forEach((c, k) => expect(s.top[i][k]).toBeCloseTo(c, 3)));
  });

  it('classifica perto do limite', () => {
    expect(legStatus(505, 500, 680)).toBe('near');
    expect(legStatus(590, 500, 680)).toBe('ok');
    expect(legStatus(681, 500, 680)).toBe('invalid');
  });
});
