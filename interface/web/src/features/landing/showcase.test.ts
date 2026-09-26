import { describe, expect, it } from 'vitest';
import { DEFAULT_GEOMETRY } from '@/features/platform3d/geometry';
import { solvePose } from '@/lib/kinematics';
import { MOVE_SECONDS, MOVES, showcasePose } from './showcase';

describe('coreografia da página inicial', () => {
  it('toda pose fica dentro do curso dos atuadores', () => {
    const total = MOVES.length * MOVE_SECONDS;
    for (let t = 0; t < total; t += 0.05) {
      const { pose } = showcasePose(t, DEFAULT_GEOMETRY.home_z);
      expect(solvePose(pose, DEFAULT_GEOMETRY).valid, `t=${t.toFixed(2)} ${JSON.stringify(pose)}`).toBe(true);
    }
  });

  it('começa e termina cada movimento no home (sem saltos)', () => {
    for (let i = 0; i < MOVES.length; i++) {
      for (const t of [i * MOVE_SECONDS + 0.001, (i + 1) * MOVE_SECONDS - 0.001]) {
        const { pose } = showcasePose(t, 530);
        expect(Math.abs(pose.z - 530) + Math.abs(pose.roll) + Math.abs(pose.x)).toBeLessThan(0.05);
      }
    }
  });

  it('faz loop', () => {
    const total = MOVES.length * MOVE_SECONDS;
    expect(showcasePose(3, 530).pose).toEqual(showcasePose(3 + total, 530).pose);
  });
});
