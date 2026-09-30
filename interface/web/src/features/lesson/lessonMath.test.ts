import { describe, expect, it } from 'vitest';
import { DEFAULT_GEOMETRY } from '@/features/platform3d/geometry';
import { legLengths, rotationZYX, transformPoints } from '@/lib/kinematics';
import type { Pose } from '@/lib/types';
import { CURRICULUM, FLAT, findStep, stepKey } from './curriculum';
import { eulerZYX, legVectors, mulMat3, plateAxes, poseAfterLengthChange, rotX, rotY, rotZ, swappedOrderPose, zyxAnimation } from './lessonMath';

const pose: Pose = { x: 12, y: -7, z: 545, roll: 4, pitch: -3, yaw: 6 };

describe('matemática da aula (notação do TCC)', () => {
  it('Lᵢ = ‖p + R·bᵢ − aᵢ‖ bate com legLengths e Pᵢ com transformPoints', () => {
    const v = legVectors(pose, DEFAULT_GEOMETRY);
    const P = transformPoints(pose, DEFAULT_GEOMETRY.platform_points_local);
    const L = legLengths(DEFAULT_GEOMETRY.base_points, P);
    v.forEach((leg, i) => {
      expect(leg.length).toBeCloseTo(L[i], 9);
      leg.P.forEach((c, k) => expect(c).toBeCloseTo(P[i][k], 9));
      // sᵢ = p + R·bᵢ − aᵢ termo a termo
      expect(leg.s[0]).toBeCloseTo(pose.x + leg.Rb[0] - leg.a[0], 9);
      expect(leg.delta).toBeCloseTo(leg.length - DEFAULT_GEOMETRY.stroke_min, 9);
    });
  });

  it('eixos do tampo são as colunas de R e R = Rz·Ry·Rx', () => {
    const r = rotationZYX(pose.roll, pose.pitch, pose.yaw);
    const [x, , z] = plateAxes(pose);
    expect(x).toEqual([r[0], r[3], r[6]]);
    expect(z).toEqual([r[2], r[5], r[8]]);
    const composed = mulMat3(mulMat3(rotZ(pose.yaw), rotY(pose.pitch)), rotX(pose.roll));
    composed.forEach((c, i) => expect(c).toBeCloseTo(r[i], 12));
    const e = eulerZYX(r);
    expect(e.roll).toBeCloseTo(pose.roll, 9);
    expect(e.pitch).toBeCloseTo(pose.pitch, 9);
    expect(e.yaw).toBeCloseTo(pose.yaw, 9);
  });

  it('a ordem trocada dá outra orientação', () => {
    const p: Pose = { ...pose, roll: 12, pitch: -10, yaw: 25 };
    const s = swappedOrderPose(p);
    expect(Math.abs(s.roll - p.roll) + Math.abs(s.pitch - p.pitch) + Math.abs(s.yaw - p.yaw)).toBeGreaterThan(1);
  });

  it('animação ZYX aplica yaw, depois pitch, depois roll', () => {
    expect(zyxAnimation(pose, 1 / 3)).toMatchObject({ yaw: 6, pitch: 0, roll: 0 });
    expect(zyxAnimation(pose, 2 / 3)).toMatchObject({ yaw: 6, pitch: -3, roll: 0 });
    expect(zyxAnimation(pose, 1)).toMatchObject({ yaw: 6, pitch: -3, roll: 4 });
  });

  it('experimento: +Δ igual nos seis só sobe o tampo; só nos pistões 1 e 2 também gira', () => {
    const home: Pose = { x: 0, y: 0, z: DEFAULT_GEOMETRY.home_z, roll: 0, pitch: 0, yaw: 0 };
    const all = poseAfterLengthChange(home, DEFAULT_GEOMETRY, [0, 1, 2, 3, 4, 5], 20).pose;
    expect(all.z).toBeGreaterThan(home.z + 15);
    expect(Math.max(Math.abs(all.roll), Math.abs(all.pitch), Math.abs(all.yaw))).toBeLessThan(0.5);
    const two = poseAfterLengthChange(home, DEFAULT_GEOMETRY, [0, 1], 20).pose;
    expect(Math.max(Math.abs(two.roll), Math.abs(two.pitch))).toBeGreaterThan(1);
  });
});

describe('currículo', () => {
  it('ids únicos, etapas com título e descrição do 3D, perguntas com resposta válida', () => {
    const keys = FLAT.map(stepKey);
    expect(new Set(keys).size).toBe(keys.length);
    for (const m of CURRICULUM)
      for (const l of m.lessons)
        for (const s of l.steps) {
          expect(s.title.length).toBeGreaterThan(3);
          expect(s.sceneSummary.length).toBeGreaterThan(10);
          for (const q of s.quiz ?? []) expect(q.options[q.correct]).toBeDefined();
        }
  });

  it('a URL leva à etapa certa e valores inválidos caem no começo', () => {
    expect(findStep('cinematica', 'direta', '5')).toEqual({ module: 1, lesson: 3, step: 4 });
    expect(findStep('nada')).toEqual(FLAT[0]);
    expect(findStep('cinematica', 'direta', '99').step).toBe(CURRICULUM[1].lessons[3].steps.length - 1);
  });
});
