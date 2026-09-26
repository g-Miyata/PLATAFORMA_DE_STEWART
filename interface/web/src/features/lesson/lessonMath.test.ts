import { describe, expect, it } from 'vitest';
import { DEFAULT_GEOMETRY } from '@/features/platform3d/geometry';
import { legLengths, rotationZYX, transformPoints } from '@/lib/kinematics';
import type { Pose } from '@/lib/types';
import { legVectors, plateAxes, zyxAnimation } from './lessonMath';
import { STEPS } from './steps';

const pose: Pose = { x: 12, y: -7, z: 545, roll: 4, pitch: -3, yaw: 6 };

describe('matemática da aula', () => {
  it('‖Lᵢ‖ bate com legLengths e Pᵢ com transformPoints', () => {
    const v = legVectors(pose, DEFAULT_GEOMETRY);
    const L = legLengths(DEFAULT_GEOMETRY.base_points, transformPoints(pose, DEFAULT_GEOMETRY.platform_points_local));
    const P = transformPoints(pose, DEFAULT_GEOMETRY.platform_points_local);
    v.forEach((leg, i) => {
      expect(leg.length).toBeCloseTo(L[i], 9);
      leg.P.forEach((c, k) => expect(c).toBeCloseTo(P[i][k], 9));
      // Lᵢ = T + R·pᵢ − bᵢ termo a termo
      expect(leg.L[0]).toBeCloseTo(pose.x + leg.Rp[0] - leg.b[0], 9);
    });
  });

  it('eixos do tampo são as colunas de R', () => {
    const r = rotationZYX(pose.roll, pose.pitch, pose.yaw);
    const [x, , z] = plateAxes(pose);
    expect(x).toEqual([r[0], r[3], r[6]]);
    expect(z).toEqual([r[2], r[5], r[8]]);
  });

  it('animação ZYX aplica yaw, depois pitch, depois roll', () => {
    expect(zyxAnimation(pose, 1 / 3)).toMatchObject({ yaw: 6, pitch: 0, roll: 0 });
    expect(zyxAnimation(pose, 2 / 3)).toMatchObject({ yaw: 6, pitch: -3, roll: 0 });
    expect(zyxAnimation(pose, 1)).toMatchObject({ yaw: 6, pitch: -3, roll: 4 });
  });

  it('cada etapa tem perguntas com resposta válida', () => {
    expect(STEPS).toHaveLength(8);
    for (const s of STEPS) for (const q of s.quiz) expect(q.options[q.correct]).toBeDefined();
  });
});
