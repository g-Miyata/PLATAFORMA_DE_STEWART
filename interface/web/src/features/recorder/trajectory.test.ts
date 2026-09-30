import { describe, expect, it } from 'vitest';
import { DEFAULT_GEOMETRY } from '@/features/platform3d/geometry';
import type { Pose } from '@/lib/types';
import { EXAMPLES } from './library';
import { analyzeTrajectory, makeSampler, normalizeKeys, sampleTrajectory, simplify, type Keyframe } from './trajectory';

const H = DEFAULT_GEOMETRY.home_z;
const pose = (p: Partial<Pose> = {}): Pose => ({ x: 0, y: 0, z: H, roll: 0, pitch: 0, yaw: 0, ...p });
const keys: Keyframe[] = [
  { t: 0, pose: pose() },
  { t: 2, pose: pose({ x: 20 }) },
  { t: 4, pose: pose({ x: 20, roll: 3 }) },
  { t: 6, pose: pose({ x: -10 }) },
];

describe('interpolação', () => {
  for (const interp of ['linear', 'suave', 'degrau'] as const) {
    it(`${interp}: passa exatamente pelas poses-chave`, () => {
      const f = makeSampler(keys, interp);
      for (const k of keys) expect(f(k.t)).toEqual(k.pose);
    });
  }

  it('suave não passa dos extremos das poses-chave', () => {
    const f = makeSampler(keys, 'suave');
    for (let t = 0; t <= 6; t += 0.01) {
      const x = f(t).x;
      expect(x).toBeLessThanOrEqual(20 + 1e-9);
      expect(x).toBeGreaterThanOrEqual(-10 - 1e-9);
    }
    // platô entre t=2 e t=4 em x: continua exatamente em 20
    expect(f(3).x).toBeCloseTo(20, 9);
  });

  it('degrau segura a pose até a próxima', () => {
    expect(makeSampler(keys, 'degrau')(1.9).x).toBe(0);
  });

  it('segura a primeira e a última pose fora do intervalo', () => {
    const f = makeSampler(keys, 'linear');
    expect(f(-1)).toEqual(keys[0].pose);
    expect(f(99)).toEqual(keys[3].pose);
  });
});

describe('amostragem', () => {
  it('gera tempos crescentes a 20 Hz a partir de 0, incluindo o fim', () => {
    const s = sampleTrajectory(normalizeKeys(keys.map((k) => ({ ...k, t: k.t + 5 }))), 'suave');
    expect(s[0].t).toBe(0);
    expect(s[s.length - 1].t).toBeCloseTo(6);
    expect(s.length).toBe(121);
    for (let i = 1; i < s.length; i++) expect(s[i].t).toBeGreaterThan(s[i - 1].t);
  });

  it('uma pose só vira duas amostras (o backend exige no mínimo 2)', () => {
    expect(sampleTrajectory([{ t: 0, pose: pose() }], 'linear')).toHaveLength(2);
  });
});

describe('simplificação', () => {
  it('reduz uma gravação densa mantendo a forma dentro da tolerância', () => {
    const dense: Keyframe[] = Array.from({ length: 401 }, (_, i) => ({ t: i * 0.05, pose: pose({ x: 20 * Math.sin(i / 40), roll: 2 * Math.cos(i / 60) }) }));
    const simple = simplify(dense, 0.5, 0.2);
    expect(simple.length).toBeLessThan(dense.length / 5);
    const f = makeSampler(simple, 'linear');
    for (const k of dense) {
      expect(Math.abs(f(k.t).x - k.pose.x)).toBeLessThanOrEqual(0.5 + 1e-9);
      expect(Math.abs(f(k.t).roll - k.pose.roll)).toBeLessThanOrEqual(0.2 + 1e-9);
    }
  });

  it('pose parada vira só início e fim', () => {
    const still = Array.from({ length: 50 }, (_, i) => ({ t: i * 0.05, pose: pose() }));
    expect(simplify(still)).toHaveLength(2);
  });
});

describe('viabilidade', () => {
  it('acusa a primeira amostra fora do curso', () => {
    const s = sampleTrajectory([{ t: 0, pose: pose() }, { t: 4, pose: pose({ z: 900 }) }], 'linear');
    const r = analyzeTrajectory(s, DEFAULT_GEOMETRY);
    expect(r.valid).toBe(false);
    expect(r.firstInvalid!.t).toBeGreaterThan(0);
  });

  it('acusa velocidade acima da dos atuadores e considera o fator de velocidade', () => {
    const s = sampleTrajectory([{ t: 0, pose: pose() }, { t: 1, pose: pose({ z: H + 40 }) }], 'linear');
    expect(analyzeTrajectory(s, DEFAULT_GEOMETRY).tooFast).toBe(true);
    const slow = sampleTrajectory([{ t: 0, pose: pose() }, { t: 10, pose: pose({ z: H + 40 }) }], 'linear');
    const r = analyzeTrajectory(slow, DEFAULT_GEOMETRY);
    expect(r.tooFast).toBe(false);
    expect(analyzeTrajectory(slow, DEFAULT_GEOMETRY, 2).peakSpeed).toBeCloseTo(r.peakSpeed * 2, 5);
  });

  it.each(EXAMPLES.map((e) => [e.name, e] as const))('exemplo "%s" é válido e lento o bastante', (_, ex) => {
    const r = analyzeTrajectory(sampleTrajectory(ex.keys, ex.interp), DEFAULT_GEOMETRY);
    expect(r.valid).toBe(true);
    expect(r.tooFast).toBe(false);
  });
});
