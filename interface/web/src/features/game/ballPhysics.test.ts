import { describe, expect, it } from 'vitest';
import { convexHull, DEFAULT_GEOMETRY, DIM, offsetConvex, xy } from '@/features/platform3d/geometry';
import { BALL_R, ballAt, DT, insideConvex, planeAcceleration, rimWalls, stepBall, type Level } from './ballPhysics';
import { LEVELS } from './levels';

const empty: Level = { id: 't', name: 't', hint: '', start: [0, 0], goal: { x: 999, y: 999, r: 1 }, holes: [], walls: [] };
const run = (level: Level, roll: number, pitch: number, seconds: number, rim = rimWalls([[-500, -500], [500, -500], [500, 500], [-500, 500]])) => {
  let ball = ballAt(level.start);
  let event = 'none';
  for (let i = 0; i < seconds / DT && event === 'none'; i++) ({ ball, event } = stepBall(ball, roll, pitch, level, rim));
  return { ball, event };
};

describe('física da bolinha', () => {
  it('tampo nivelado: fica parada', () => {
    const { ball } = run(empty, 0, 0, 3);
    expect(Math.hypot(ball.x, ball.y)).toBeLessThan(1e-9);
  });

  it('pitch positivo leva para +X e roll positivo para −Y', () => {
    const [ax, ay] = planeAcceleration(0, 3);
    expect(ax).toBeGreaterThan(0);
    expect(ay).toBeCloseTo(0, 9);
    expect(planeAcceleration(3, 0)[1]).toBeLessThan(0);
    const { ball } = run(empty, 0, 3, 0.5);
    expect(ball.x).toBeGreaterThan(20);
  });

  it('aceleração de uma esfera rolando: 5/7 · g · sen(θ)', () => {
    expect(planeAcceleration(0, 5)[0]).toBeCloseTo((5 / 7) * 9810 * Math.sin((5 * Math.PI) / 180), 6);
  });

  it('bate na parede e não atravessa', () => {
    const level: Level = { ...empty, walls: [{ a: [100, -200], b: [100, 200] }] };
    const { ball } = run(level, 0, 6, 4);
    expect(ball.x).toBeLessThanOrEqual(100 - BALL_R);
  });

  it('cai no buraco e chega ao alvo', () => {
    expect(run({ ...empty, holes: [{ x: 120, y: 0, r: 25 }] }, 0, 5, 3).event).toBe('hole');
    // passar rápido pelo alvo não conta; chegar devagar conta
    expect(run({ ...empty, goal: { x: 150, y: 0, r: 30 } }, 0, 6, 0.6).event).toBe('none');
    expect(run({ ...empty, goal: { x: 25, y: 0, r: 40 } }, 0, 0.6, 3).event).toBe('goal');
  });

  it('as fases cabem no tampo real', () => {
    const outline = offsetConvex(convexHull(xy(DEFAULT_GEOMETRY.platform_points_local)), DIM.topMargin);
    for (const l of LEVELS) {
      expect(insideConvex(l.start, outline, BALL_R + 10), `${l.id} início`).toBe(true);
      expect(insideConvex([l.goal.x, l.goal.y], outline, l.goal.r), `${l.id} alvo`).toBe(true);
      for (const h of l.holes) expect(insideConvex([h.x, h.y], outline, h.r), `${l.id} buraco`).toBe(true);
      for (const w of l.walls) {
        expect(insideConvex(w.a, outline, 0), `${l.id} parede`).toBe(true);
        expect(insideConvex(w.b, outline, 0), `${l.id} parede`).toBe(true);
      }
    }
  });
});
