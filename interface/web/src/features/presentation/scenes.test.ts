import { describe, expect, it } from 'vitest';
import { DEFAULT_GEOMETRY } from '@/features/platform3d/geometry';
import { solvePose } from '@/lib/kinematics';
import { LOOP_SECONDS, SCENES, sceneAt } from './scenes';
import { stepTilt, VISITOR_REAL } from './visitor';

describe('laço da apresentação', () => {
  const home = DEFAULT_GEOMETRY.home_z;

  it('toda pose fica dentro do curso dos atuadores', () => {
    for (let t = 0; t < LOOP_SECONDS; t += 0.05) {
      const { pose } = sceneAt(t, home);
      expect(solvePose(pose, DEFAULT_GEOMETRY).valid, `t=${t.toFixed(2)} ${JSON.stringify(pose)}`).toBe(true);
    }
  });

  it('começa e termina cada cena no home (sem saltos)', () => {
    let t0 = 0;
    for (const sc of SCENES) {
      for (const t of [t0 + 0.001, t0 + sc.seconds - 0.001]) {
        const { pose } = sceneAt(t, home);
        const off = Math.abs(pose.x) + Math.abs(pose.y) + Math.abs(pose.z - home) + Math.abs(pose.roll) + Math.abs(pose.pitch) + Math.abs(pose.yaw);
        expect(off, sc.id).toBeLessThan(0.1);
      }
      t0 += sc.seconds;
    }
  });

  it('passa por todas as cenas e faz loop', () => {
    const seen = new Set<string>();
    for (let t = 0; t < LOOP_SECONDS; t += 0.5) seen.add(sceneAt(t, home).scene.id);
    expect(seen.size).toBe(SCENES.length);
    expect(sceneAt(3, home).pose).toEqual(sceneAt(3 + LOOP_SECONDS, home).pose);
  });
});

describe('controle do visitante', () => {
  it('não passa do ângulo nem da taxa da bancada', () => {
    let tilt = { roll: 0, pitch: 0 };
    let prev = tilt;
    for (let i = 0; i < 200; i++) {
      tilt = stepTilt(tilt, [1, -1], 0.05, VISITOR_REAL);
      expect(Math.abs(tilt.roll - prev.roll)).toBeLessThanOrEqual(VISITOR_REAL.rateDegS * 0.05 + 1e-9);
      expect(Math.abs(tilt.roll)).toBeLessThanOrEqual(VISITOR_REAL.maxDeg);
      prev = tilt;
    }
    expect(tilt.roll).toBeCloseTo(5);
    expect(tilt.pitch).toBeCloseTo(-5);
  });
});
