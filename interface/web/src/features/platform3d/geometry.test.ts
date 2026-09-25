import { describe, expect, it } from 'vitest';
import { convexHull, offsetConvex, xy, DEFAULT_GEOMETRY } from './geometry';

const area = (poly: [number, number][]) =>
  poly.reduce((s, p, i) => {
    const q = poly[(i + 1) % poly.length];
    return s + p[0] * q[1] - q[0] * p[1];
  }, 0) / 2;

describe('polígonos das placas', () => {
  it('casco dos 6 pontos da base é um hexágono anti-horário', () => {
    const hull = convexHull(xy(DEFAULT_GEOMETRY.base_points));
    expect(hull).toHaveLength(6);
    expect(area(hull)).toBeGreaterThan(0);
  });

  it('deslocar para fora aumenta a área e para dentro diminui', () => {
    const hull = convexHull(xy(DEFAULT_GEOMETRY.platform_points_local));
    expect(area(offsetConvex(hull, 40))).toBeGreaterThan(area(hull));
    expect(area(offsetConvex(hull, -40))).toBeLessThan(area(hull));
  });

  it('um quadrado deslocado 1 mm vira um quadrado 2 mm maior', () => {
    const sq = offsetConvex([[0, 0], [10, 0], [10, 10], [0, 10]], 1);
    expect(sq[0][0]).toBeCloseTo(-1);
    expect(sq[0][1]).toBeCloseTo(-1);
    expect(sq[2][0]).toBeCloseTo(11);
    expect(sq[2][1]).toBeCloseTo(11);
  });
});
