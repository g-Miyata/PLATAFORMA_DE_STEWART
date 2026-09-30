import { describe, expect, it } from 'vitest';
import { DEFAULT_GEOMETRY } from '@/features/platform3d/geometry';
import { measurePose } from '@/lib/limits';
import type { Vec3 } from '@/lib/types';
import { assemblyNumbers, centerThickness, currentGeometry, DEFAULT_WEDGE, envelope, headingTable, kitPieces, legHeadings, seatFrames, tiltAt, tiltTable, toStl, wedgeGeometry, wedgeMesh } from './wedge';

const geom = DEFAULT_GEOMETRY;

describe('assento do cardã do tampo', () => {
  it('assento reto (normal +Z) mede igual à montagem de hoje', () => {
    const pose = { x: 12, y: -8, z: 575, roll: 6, pitch: -4, yaw: 10 };
    const flat: Vec3[] = geom.platform_points_local.map(() => [0, 0, 1]);
    const a = measurePose(pose, geom);
    const b = measurePose(pose, { ...geom, top_seat_normals_local: flat });
    b.topDeg.forEach((v, i) => expect(v).toBeCloseTo(a.topDeg[i], 9));
  });

  it('calço de 0° e espessura 0 reproduz a montagem de hoje', () => {
    const now = envelope(currentGeometry(geom, 0.2));
    const zero = envelope(wedgeGeometry(geom, { ...DEFAULT_WEDGE, angleDeg: 0, minMm: 0 }));
    expect(zero.home).toBeCloseTo(now.home, 1);
    expect(zero.tilt).toBeCloseTo(now.tilt, 1);
    expect(zero.homeTop).toBeCloseTo(now.homeTop, 3);
  });

  it('com o calço de 12°, o cardã do tampo começa mais folgado e a inclinação sobe', () => {
    const now = envelope(currentGeometry(geom, 0.2));
    const w = envelope(wedgeGeometry(geom, DEFAULT_WEDGE));
    expect(now.limiter).toBe('cardã do tampo no limite');
    expect(w.homeTop).toBeLessThan(now.homeTop - 9);
    expect(w.tilt).toBeGreaterThan(now.tilt + 4);
    // a montagem de hoje dá ~13° com 20% de margem (igual ao backend)
    expect(now.tilt).toBeGreaterThan(12);
    expect(now.tilt).toBeLessThan(14);
  });

  it('com o calço, a inclinação máxima é maior em todas as direções', () => {
    const now = tiltTable(currentGeometry(geom, 0.2), 36);
    const w = tiltTable(wedgeGeometry(geom, DEFAULT_WEDGE), 36);
    w.forEach((v, k) => expect(v).toBeGreaterThan(now[k]));
    // o mínimo da tabela é a inclinação em qualquer direção do envelope
    expect(Math.min(...now)).toBeCloseTo(envelope(currentGeometry(geom, 0.2)).tilt, 0);
    expect(tiltAt([1, 3], Math.PI / 2)).toBeCloseTo(2, 9);
  });

  it('o eixo do parafuso passa no centro do furo original, na metade do tampo', () => {
    const p = DEFAULT_WEDGE;
    for (const f of seatFrames(geom, p)) {
      // do cubo do cardã, subindo pelo eixo até a metade do tampo
      const s = (f.attach[2] + p.plateMm / 2 - f.hub[2]) / f.axis[2];
      const x = f.hub[0] + s * f.axis[0];
      const y = f.hub[1] + s * f.axis[1];
      expect(Math.hypot(x - f.attach[0], y - f.attach[1])).toBeLessThan(1e-9);
      // a cabeça do parafuso também está no eixo
      const s2 = (f.head[2] - f.hub[2]) / f.axis[2];
      expect(Math.hypot(f.hub[0] + s2 * f.axis[0] - f.head[0], f.hub[1] + s2 * f.axis[1] - f.head[1])).toBeLessThan(1e-9);
      // cruzeta a jointMm do cubo, no eixo
      expect(Math.hypot(f.hub[0] - f.center[0], f.hub[1] - f.center[1], f.hub[2] - f.center[2])).toBeCloseTo(p.jointMm, 9);
    }
  });

  it('a ponta de cada calço aponta para a junta de baixo da mesma perna', () => {
    legHeadings(geom).forEach(([dx, dy], i) => {
      const p = geom.platform_points_local[i];
      const b = geom.base_points[i];
      const along = (b[0] - p[0]) * dx + (b[1] - p[1]) * dy;
      expect(along).toBeGreaterThan(0);
    });
    expect(headingTable(geom)).toHaveLength(6);
  });
});

describe('peças para imprimir', () => {
  const edges = (idx: number[]) => {
    const directed = new Map<string, number>();
    for (let t = 0; t < idx.length; t += 3) {
      const tri = [idx[t], idx[t + 1], idx[t + 2]];
      for (let e = 0; e < 3; e++) {
        const k = `${tri[e]}>${tri[(e + 1) % 3]}`;
        directed.set(k, (directed.get(k) ?? 0) + 1);
      }
    }
    return directed;
  };

  it('a cunha é uma malha fechada, com as faces orientadas para fora', () => {
    const { wedge } = kitPieces(DEFAULT_WEDGE);
    const m = wedgeMesh(wedge);
    const d = edges(m.indices);
    for (const [k, n] of d) {
      const [a, b] = k.split('>');
      expect(n).toBe(1); // cada aresta orientada aparece uma vez...
      expect(d.get(`${b}>${a}`)).toBe(1); // ...e a oposta também (malha fechada e consistente)
    }
    // volume positivo (normais para fora), perto do cilindro de espessura média menos o furo
    let vol = 0;
    const P = (i: number) => [m.positions[3 * i], m.positions[3 * i + 1], m.positions[3 * i + 2]];
    for (let t = 0; t < m.indices.length; t += 3) {
      const [a, b, c] = [P(m.indices[t]), P(m.indices[t + 1]), P(m.indices[t + 2])];
      vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    }
    const tc = centerThickness(DEFAULT_WEDGE);
    const approx = Math.PI * (16 ** 2 - 4.2 ** 2) * tc;
    expect(vol).toBeGreaterThan(approx * 0.85);
    expect(vol).toBeLessThan(approx * 1.2);
  });

  it('a ponta fica com a espessura mínima e a face de baixo é plana', () => {
    const { wedge } = kitPieces(DEFAULT_WEDGE);
    const m = wedgeMesh(wedge);
    const zs: number[] = [];
    let tipTop = Infinity;
    for (let i = 0; i < m.positions.length; i += 3) {
      const [x, , z] = m.positions.slice(i, i + 3);
      if (z < 1e-9) zs.push(z);
      if (x > 16 + 6 - 1e-6) tipTop = Math.max(0, Math.min(tipTop, z || tipTop));
    }
    expect(zs.every((z) => Math.abs(z) < 1e-9)).toBe(true);
    expect(tipTop).toBeCloseTo(DEFAULT_WEDGE.minMm, 6);
  });

  it('STL binário com 50 bytes por triângulo', () => {
    const m = wedgeMesh(kitPieces(DEFAULT_WEDGE).washer);
    expect(toStl(m, 'arruela').byteLength).toBe(84 + (m.indices.length / 3) * 50);
  });

  it('números da montagem', () => {
    const n = assemblyNumbers(DEFAULT_WEDGE);
    expect(n.plateHoleMm).toBeGreaterThan(DEFAULT_WEDGE.screwMm);
    expect(n.screwExtraMm).toBeGreaterThan(n.wedgeCenterMm);
  });
});
