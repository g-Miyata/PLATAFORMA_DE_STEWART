import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { PlatformGeometry, Vec3 } from '@/lib/types';

/** Mesma geometria do backend: usada enquanto /config não responde (ou offline). */
export const DEFAULT_GEOMETRY: PlatformGeometry = {
  h0: 530,
  stroke_min: 500,
  stroke_max: 680,
  home_z: 530,
  base_points: [
    [305.5, -17, 0], [305.5, 17, 0], [-137.7, 273.23, 0],
    [-168, 255.7, 0], [-167.2, -256.2, 0], [-136.8, -273.6, 0],
  ],
  platform_points_local: [
    [191.1, -241.5, 0], [191.1, 241.5, 0], [113.6, 286.2, 0],
    [-304.7, 44.8, 0], [-304.7, -44.8, 0], [113.1, -286.4, 0],
  ],
};

export function useGeometry(): PlatformGeometry {
  const { data } = useQuery({ queryKey: ['geometry'], queryFn: api.geometry, staleTime: Infinity, retry: 1 });
  return data ?? DEFAULT_GEOMETRY;
}

// ---------------- polígonos 2D (plano XY) ----------------
export type Vec2 = [number, number];

/** Casco convexo (monotone chain), anti-horário. */
export function convexHull(points: readonly Vec2[]): Vec2[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Vec2, a: Vec2, b: Vec2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Vec2[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Vec2[] = [];
  for (const p of [...pts].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/**
 * Desloca as arestas de um polígono convexo anti-horário por `d` mm
 * (positivo = para fora) e intersecta as retas vizinhas.
 */
export function offsetConvex(poly: readonly Vec2[], d: number): Vec2[] {
  const n = poly.length;
  const lines = poly.map((p, i) => {
    const q = poly[(i + 1) % n];
    const dx = q[0] - p[0];
    const dy = q[1] - p[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = dy / len; // normal externa (polígono anti-horário)
    const ny = -dx / len;
    return { p: [p[0] + nx * d, p[1] + ny * d] as Vec2, dir: [dx / len, dy / len] as Vec2 };
  });
  return lines.map((l1, i) => {
    const l0 = lines[(i - 1 + n) % n];
    const det = l0.dir[0] * l1.dir[1] - l0.dir[1] * l1.dir[0];
    if (Math.abs(det) < 1e-9) return l1.p;
    const t = ((l1.p[0] - l0.p[0]) * l1.dir[1] - (l1.p[1] - l0.p[1]) * l1.dir[0]) / det;
    return [l0.p[0] + l0.dir[0] * t, l0.p[1] + l0.dir[1] * t] as Vec2;
  });
}

export const xy = (points: readonly Vec3[]): Vec2[] => points.map(([x, y]) => [x, y]);

// ---------------- dimensões da bancada (mm), estimadas pelas fotos ----------------
export const DIM = {
  mountHeight: 40, // bloco azul impresso (kardan-joint.stl) sob cada par de juntas da base
  baseRingThickness: 12,
  baseRingWidth: 105,
  baseMargin: 70,
  postSize: 40, // perfil de alumínio 40x40
  postHeight: 240,
  bottomPlateThickness: 10,
  bottomMargin: 45,
  footHeight: 28,
  topPlateThickness: 8,
  topPlateGap: 26, // da junta ao tampo
  topMargin: 42,
  jointOffset: 22, // do centro da junta até o começo do atuador
  housingLength: 300,
  housingRadius: 22,
  motorRadius: 23,
  motorLength: 120,
  rodRadius: 10,
  rodLength: 400,
} as const;

export const FLOOR_Z = -(DIM.mountHeight + DIM.baseRingThickness + DIM.postHeight + DIM.bottomPlateThickness + DIM.footHeight);
