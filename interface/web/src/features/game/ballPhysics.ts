// Física da bolinha no tampo (sistema do tampo, mm e s). A gravidade é levada
// para o sistema do tampo (Rᵀ·g); uma esfera maciça rolando sem deslizar acelera
// 5/7 do que deslizaria. Passo fixo de 120 Hz.
import { rotationZYX } from '@/lib/kinematics';

export type Vec2 = [number, number];

export interface Circle {
  x: number;
  y: number;
  r: number;
}

export interface Wall {
  a: Vec2;
  b: Vec2;
}

export interface Level {
  id: string;
  name: string;
  hint: string;
  start: Vec2;
  goal: Circle;
  holes: Circle[];
  walls: Wall[];
}

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export type BallEvent = 'none' | 'hole' | 'goal';

export const BALL_R = 14;
export const WALL_HALF = 5;
export const G = 9810;
const ROLLING = 5 / 7;
/** resistência ao rolamento (mm/s²) e amortecimento do ar (1/s) */
const ROLL_RESISTANCE = 120;
const DAMPING = 0.25;
const RESTITUTION = 0.45;
/** para contar, a bolinha precisa chegar ao alvo devagar (mm/s) */
export const GOAL_MAX_SPEED = 200;
export const DT = 1 / 120;

/** Aceleração no plano do tampo para uma inclinação (graus). */
export function planeAcceleration(roll: number, pitch: number): Vec2 {
  const r = rotationZYX(roll, pitch, 0);
  // Rᵀ·(0, 0, −g): terceira linha de R vezes −g
  return [-G * r[6] * ROLLING, -G * r[7] * ROLLING];
}

function closestOnSegment(px: number, py: number, w: Wall): Vec2 {
  const [ax, ay] = w.a;
  const [bx, by] = w.b;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return [ax + dx * t, ay + dy * t];
}

/** Paredes do contorno do tampo (a borda funciona como um aro baixo). */
export function rimWalls(outline: readonly Vec2[]): Wall[] {
  return outline.map((a, i) => ({ a, b: outline[(i + 1) % outline.length] }));
}

/** Avança um passo fixo. Devolve a nova bola e o que aconteceu. */
export function stepBall(ball: Ball, roll: number, pitch: number, level: Level, rim: readonly Wall[], dt = DT): { ball: Ball; event: BallEvent } {
  const [ax, ay] = planeAcceleration(roll, pitch);
  let { x, y, vx, vy } = ball;
  vx += ax * dt;
  vy += ay * dt;
  // resistência ao rolamento: freia sem inverter o sentido
  const speed = Math.hypot(vx, vy);
  if (speed > 0) {
    const k = Math.max(0, speed - ROLL_RESISTANCE * dt) / speed;
    vx *= k;
    vy *= k;
  }
  const damp = Math.exp(-DAMPING * dt);
  vx *= damp;
  vy *= damp;
  x += vx * dt;
  y += vy * dt;

  for (const w of [...level.walls, ...rim]) {
    const [cx, cy] = closestOnSegment(x, y, w);
    let nx = x - cx;
    let ny = y - cy;
    const d = Math.hypot(nx, ny);
    const min = BALL_R + WALL_HALF;
    if (d >= min) continue;
    if (d < 1e-9) {
      // centro exatamente sobre a parede: empurra pela normal do segmento
      nx = -(w.b[1] - w.a[1]);
      ny = w.b[0] - w.a[0];
    }
    const n = Math.hypot(nx, ny) || 1;
    nx /= n;
    ny /= n;
    x = cx + nx * min;
    y = cy + ny * min;
    const vn = vx * nx + vy * ny;
    if (vn < 0) {
      vx -= (1 + RESTITUTION) * vn * nx;
      vy -= (1 + RESTITUTION) * vn * ny;
    }
  }

  const next = { x, y, vx, vy };
  for (const h of level.holes) if (Math.hypot(x - h.x, y - h.y) < h.r) return { ball: next, event: 'hole' };
  if (Math.hypot(x - level.goal.x, y - level.goal.y) < level.goal.r - BALL_R * 0.5 && Math.hypot(vx, vy) < GOAL_MAX_SPEED) return { ball: next, event: 'goal' };
  return { ball: next, event: 'none' };
}

export const ballAt = ([x, y]: Vec2): Ball => ({ x, y, vx: 0, vy: 0 });

/** Ponto dentro de um polígono convexo, com folga `margin` das bordas. */
export function insideConvex(p: Vec2, poly: readonly Vec2[], margin = 0): boolean {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const cross = ex * (p[1] - a[1]) - ey * (p[0] - a[0]);
    const dist = cross / Math.hypot(ex, ey);
    if (!sign) sign = Math.sign(cross) || 1;
    if (dist * sign < margin) return false;
  }
  return true;
}
