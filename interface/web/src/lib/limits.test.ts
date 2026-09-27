import { describe, expect, it } from 'vitest';
import { DEFAULT_GEOMETRY } from '@/features/platform3d/geometry';
import fixture from './limits.fixture.json';
import { checkPose, computeReach, limitPose, operationalLimits, DEFAULT_LIMIT_VALUES, type LimitsInfo } from './limits';
import { solvePose } from './kinematics';
import type { Pose } from './types';

const limits = fixture.limits as unknown as LimitsInfo;
const geom = { ...DEFAULT_GEOMETRY, limits };

describe('limites reais: igual ao backend (limits.py)', () => {
  it.each(fixture.cases.map((c, i) => [i, c] as const))('pose %i: mesma validade, motivos e ângulos', (_, c) => {
    const r = checkPose(c.pose as Pose, geom);
    expect(r.valid).toBe(c.valid);
    expect(r.reasons).toEqual(c.reasons);
    r.base.forEach((v, i) => expect(v).toBeCloseTo(c.base_deg[i], 3));
    r.topDeg.forEach((v, i) => expect(v).toBeCloseTo(c.top_deg[i], 3));
    expect(r.closestDistance).toBeCloseTo(c.closest_distance_mm, 3);
  });

  it('a amostra tem poses válidas e recusadas por cada motivo de ângulo e curso', () => {
    const all = new Set(fixture.cases.flatMap((c) => c.reasons.flat()));
    expect(fixture.cases.some((c) => c.valid)).toBe(true);
    for (const k of ['curso', 'cardan_base', 'cardan_topo']) expect(all.has(k)).toBe(true);
  });

  it('sem /config, os padrões dão os mesmos limites de operação', () => {
    expect(operationalLimits(DEFAULT_LIMIT_VALUES)).toEqual(limits.operational);
    // e o mesmo veredito (normais do assento calculadas aqui)
    for (const c of fixture.cases.slice(0, 60)) expect(checkPose(c.pose as Pose, DEFAULT_GEOMETRY).valid).toBe(c.valid);
  });

  it('o alcance calculado aqui bate com o do backend', () => {
    const home = { x: 0, y: 0, z: limits.home_z, roll: 0, pitch: 0, yaw: 0 };
    const reach = computeReach(geom, home);
    for (const k of Object.keys(limits.reach) as (keyof typeof reach)[]) {
      expect(reach[k][0]).toBeCloseTo(limits.reach[k][0], 1);
      expect(reach[k][1]).toBeCloseTo(limits.reach[k][1], 1);
    }
  });

  it('limitPose traz para dentro na direção do neutro', () => {
    const pose = { x: 0, y: 0, z: limits.home_z, roll: 30, pitch: 30, yaw: 0 };
    const r = limitPose(pose, geom);
    expect(r.limited).toBe(true);
    expect(solvePose(r.pose, geom).valid).toBe(true);
    expect(r.pose.roll).toBeCloseTo(r.pose.pitch, 6);
  });
});
