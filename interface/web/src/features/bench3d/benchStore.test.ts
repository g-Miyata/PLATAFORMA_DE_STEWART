import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_GEOMETRY } from '@/features/platform3d/geometry';
import { solvePose } from '@/lib/kinematics';
import { useBench } from './benchStore';

const s = () => useBench.getState();

beforeEach(() => {
  useBench.setState({ geometry: { ...DEFAULT_GEOMETRY } }); // força o init
  s().init(DEFAULT_GEOMETRY);
  s().select({ kind: 'none' });
});

describe('bancada: pistão individual (cinemática direta)', () => {
  it('muda só o pistão escolhido e move o tampo', () => {
    const before = s().lengths.slice();
    const z0 = s().pose.z;
    expect(s().setPistonLength(1, before[1] + 20)).toBe(true);
    s().lengths.forEach((l, i) => expect(l).toBeCloseTo(i === 1 ? before[1] + 20 : before[i], 6));
    // a pose resultante reproduz os 6 comprimentos
    solvePose(s().pose, DEFAULT_GEOMETRY).lengths.forEach((l, i) => expect(l).toBeCloseTo(s().lengths[i], 2));
    expect(s().pose.z).not.toBeCloseTo(z0, 1);
  });

  it('para no batente e avisa', () => {
    expect(s().setPistonLength(0, 900)).toBe(false);
    expect(s().lengths[0]).toBe(DEFAULT_GEOMETRY.stroke_max);
    expect(s().limit?.piston).toBe(0);
  });
});

describe('bancada: plataforma (cinemática inversa)', () => {
  it('o ponto central alterna Z → roll → pitch → yaw', () => {
    s().cycleAxis();
    expect(s().selection).toEqual({ kind: 'platform', axis: 'z' });
    s().cycleAxis();
    s().cycleAxis();
    s().cycleAxis();
    expect(s().selection).toEqual({ kind: 'platform', axis: 'yaw' });
    s().cycleAxis();
    expect(s().selection).toEqual({ kind: 'platform', axis: 'z' });
  });

  it('girar em roll muda os seis pistões', () => {
    const before = s().lengths.slice();
    s().select({ kind: 'platform', axis: 'roll' });
    expect(s().nudge(5)).toBe(true);
    expect(s().pose.roll).toBeCloseTo(5);
    expect(s().lengths.filter((l, i) => Math.abs(l - before[i]) > 0.5).length).toBeGreaterThanOrEqual(4);
  });

  it('rejeita pose fora do curso e mantém a última válida', () => {
    s().select({ kind: 'platform', axis: 'z' });
    const pose = s().pose;
    expect(s().setPose({ ...pose, z: 700 })).toBe(false);
    expect(s().pose).toEqual(pose);
    expect(s().limit?.piston).toBeGreaterThanOrEqual(0);
  });
});

it('desfaz para o estado anterior', () => {
  const before = s().lengths.slice();
  s().checkpoint();
  s().setPistonLength(2, before[2] - 30);
  s().undo();
  expect(s().lengths).toEqual(before);
});

it('desfazer separa edições seguidas em alvos diferentes', () => {
  const l0 = s().lengths.slice();
  s().select({ kind: 'piston', index: 1 });
  s().checkpoint();
  s().nudge(10);
  s().select({ kind: 'platform', axis: 'roll' });
  const afterPiston = s().lengths.slice();
  s().checkpoint();
  s().nudge(3);
  s().undo();
  expect(s().lengths).toEqual(afterPiston);
  s().undo();
  expect(s().lengths).toEqual(l0);
});
