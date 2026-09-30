import { describe, expect, it } from 'vitest';
import { DEFAULT_GEOMETRY } from '@/features/platform3d/geometry';
import { forwardKinematics } from './forwardKinematics';
import { solvePose, zeroPose } from './kinematics';
import type { Pose } from './types';

const home = zeroPose(530);

// Referências geradas por StewartPlatform.estimate_pose_from_lengths (app.py)
const cases: { L: number[]; pose: Pose }[] = [
  { L: [586.8455, 586.8455, 586.7026, 586.5711, 586.938, 586.1005], pose: { x: 0, y: 0, z: 530, roll: 0, pitch: 0, yaw: 0 } },
  { L: [583.0928, 631.4969, 616.2572, 602.0734, 565.8961, 606.0139], pose: { x: 12, y: -8, z: 545, roll: 4, pitch: -3, yaw: 6 } },
  { L: [669.2441, 669.2441, 669.1188, 669.0035, 669.3252, 668.5909], pose: { x: 0, y: 0, z: 620, roll: 0, pitch: 0, yaw: 0 } },
];

describe('cinemática direta', () => {
  it.each(cases)('recupera a pose do backend (%#)', ({ L, pose }) => {
    const r = forwardKinematics(L, DEFAULT_GEOMETRY, home);
    expect(r.converged).toBe(true);
    for (const k of ['x', 'y', 'z', 'roll', 'pitch', 'yaw'] as const) expect(r.pose[k]).toBeCloseTo(pose[k], 2);
  });

  it('ida e volta com a cinemática inversa', () => {
    const pose = { x: -18, y: 22, z: 505, roll: -5, pitch: 7, yaw: -9 };
    const L = solvePose(pose, DEFAULT_GEOMETRY).lengths;
    const r = forwardKinematics(L, DEFAULT_GEOMETRY, home);
    expect(r.maxError).toBeLessThan(1e-3);
    expect(r.pose.pitch).toBeCloseTo(7, 3);
  });

  it('mudar um único pistão mantém os outros cinco', () => {
    const L = solvePose(home, DEFAULT_GEOMETRY).lengths;
    L[1] += 25;
    const r = forwardKinematics(L, DEFAULT_GEOMETRY, home);
    expect(r.converged).toBe(true);
    const back = solvePose(r.pose, DEFAULT_GEOMETRY).lengths;
    back.forEach((l, i) => expect(l).toBeCloseTo(L[i], 2));
  });

  it('é rápida o bastante para rodar a cada movimento do mouse', () => {
    const L = solvePose({ x: 5, y: 5, z: 560, roll: 3, pitch: 2, yaw: 1 }, DEFAULT_GEOMETRY).lengths;
    const t0 = performance.now();
    for (let i = 0; i < 50; i++) forwardKinematics(L, DEFAULT_GEOMETRY, home);
    expect((performance.now() - t0) / 50).toBeLessThan(5);
  });

  it('guarda o histórico das iterações para a aula (erro não cresce e termina < 0,01 mm)', () => {
    const { L } = cases[1];
    const r = forwardKinematics(L, DEFAULT_GEOMETRY, home, { history: true });
    const h = r.history!;
    expect(h.length).toBeGreaterThan(2);
    expect(h[0].pose).toEqual(home);
    for (let i = 1; i < h.length; i++) expect(h[i].rms).toBeLessThanOrEqual(h[i - 1].rms + 1e-9);
    expect(h[h.length - 1].maxError).toBeLessThan(0.01);
    // os comprimentos de cada iteração são a inversa da pose dela
    expect(h[0].lengths[0]).toBeCloseTo(solvePose(home, DEFAULT_GEOMETRY).lengths[0], 6);
  });

  it('chega na mesma pose partindo de um chute bom ou de um chute médio', () => {
    const { L, pose } = cases[1];
    const a = forwardKinematics(L, DEFAULT_GEOMETRY, pose);
    const b = forwardKinematics(L, DEFAULT_GEOMETRY, { x: -20, y: 20, z: 500, roll: -5, pitch: 5, yaw: -5 });
    for (const k of ['x', 'y', 'z', 'roll', 'pitch', 'yaw'] as const) expect(b.pose[k]).toBeCloseTo(a.pose[k], 2);
  });
});
