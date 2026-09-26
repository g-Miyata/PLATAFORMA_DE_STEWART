import { describe, expect, it } from 'vitest';
import { fk2R, fkUR5e, ik2R, ikUR5e, poseError, position } from './ur5e';

const rand = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};

describe('UR5e', () => {
  it('direta na posição zero bate com a tabela DH', () => {
    const [x, y, z] = position(fkUR5e([0, 0, 0, 0, 0, 0]));
    expect(x).toBeCloseTo(-0.8172, 4);
    expect(y).toBeCloseTo(-0.2329, 4);
    expect(z).toBeCloseTo(0.0628, 4);
  });

  it('toda solução da inversa leva a ferramenta à mesma pose, e a original está entre elas', () => {
    const r = rand(7);
    for (let n = 0; n < 40; n++) {
      const theta = Array.from({ length: 6 }, () => (r() * 2 - 1) * Math.PI * 0.9);
      // evita a singularidade do punho (θ5 ≈ 0)
      if (Math.abs(Math.sin(theta[4])) < 0.15) continue;
      const T = fkUR5e(theta);
      const sols = ikUR5e(T);
      expect(sols.length).toBeGreaterThanOrEqual(2);
      expect(sols.length).toBeLessThanOrEqual(8);
      for (const s of sols) expect(poseError(fkUR5e(s), T)).toBeLessThan(1e-6);
      const wrapDiff = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
      expect(sols.some((s) => s.every((v, i) => wrapDiff(v, theta[i]) < 1e-6))).toBe(true);
    }
  });

  it('pose longe demais não tem solução', () => {
    const T = fkUR5e([0, 0, 0, 0, 1, 0]);
    T[3] = 3;
    T[7] = 0;
    T[11] = 0;
    expect(ikUR5e(T)).toEqual([]);
  });
});

describe('braço 2R', () => {
  const arm = { l1: 1, l2: 0.8 };
  it('as duas soluções da inversa reproduzem o alvo', () => {
    const s = ik2R(arm, 1.1, 0.6)!;
    for (const [t1, t2] of [s.up, s.down]) {
      const { tip } = fk2R(arm, t1, t2);
      expect(tip[0]).toBeCloseTo(1.1, 9);
      expect(tip[1]).toBeCloseTo(0.6, 9);
    }
    expect(s.up[1]).toBeGreaterThan(0);
    expect(s.down[1]).toBeLessThan(0);
  });
  it('fora do alcance devolve null', () => {
    expect(ik2R(arm, 2, 0)).toBeNull();
    expect(ik2R(arm, 0.1, 0)).toBeNull();
  });
});

describe('modelo 3D do UR5e', () => {
  it('a árvore de corpos (malhas) leva a flange ao mesmo ponto que a tabela DH', async () => {
    const { bodyChain, UR5E_FLANGE, mul } = await import('./ur5e');
    const r = rand(11);
    for (let n = 0; n < 20; n++) {
      const theta = Array.from({ length: 6 }, () => (r() * 2 - 1) * Math.PI);
      const W = bodyChain(theta)[6];
      const f = mul(W, [1, 0, 0, UR5E_FLANGE[0], 0, 1, 0, UR5E_FLANGE[1], 0, 0, 1, UR5E_FLANGE[2], 0, 0, 0, 1]);
      const p = position(fkUR5e(theta));
      // as medidas do modelo 3D são arredondadas (0,163 × 0,1625 m, d6 0,1 × 0,0996 m...):
      // mesmos sentidos de junta, diferença de poucos milímetros
      expect(Math.hypot(f[3] - p[0], f[7] - p[1], f[11] - p[2])).toBeLessThan(3e-3);
    }
  });
});
