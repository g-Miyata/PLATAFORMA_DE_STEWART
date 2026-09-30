import { describe, expect, it } from 'vitest';
import { cellNumber, parseCsv, toCsv } from '@/lib/csv';
import { compare, estimateLag } from './metrics';
import { parseRoutineCsv } from './routinesCsv';

describe('csv', () => {
  it('lê o que toCsv escreve (vírgula decimal e aspas)', () => {
    const text = toCsv(['a', 'b'], [[1.5, 'x;y'], [2, 'ok']]);
    const { header, rows } = parseCsv(text);
    expect(header).toEqual(['a', 'b']);
    expect(rows[0]).toEqual(['1,5', 'x;y']);
    expect(cellNumber(rows[0][0])).toBe(1.5);
  });
});

describe('métricas do gêmeo', () => {
  const dt = 0.05;
  const t = Array.from({ length: 200 }, (_, i) => i * dt);
  const wave = (d: number) => t.map((x) => 50 + 20 * Math.sin(2 * Math.PI * 0.3 * (x - d)));

  it('estima o atraso do real em relação ao simulado', () => {
    expect(estimateLag(wave(0.3), wave(0), dt)).toBeCloseTo(0.3, 1);
    expect(estimateLag(wave(0), wave(0), dt)).toBe(0);
  });

  it('erro RMS e máximo', () => {
    const real = t.map(() => [1, 1, 1, 1, 1, 1]);
    const sim = t.map(() => [0, 0, 0, 0, 0, 3]);
    const m = compare(real, sim, dt);
    expect(m[0].rms).toBeCloseTo(1);
    expect(m[5].max).toBeCloseTo(2);
  });

  it('lê o CSV das Rotinas e converte comprimento em curso', () => {
    const header = ['t_s', 'rotina', 'x_cmd', 'y_cmd', 'z_cmd', 'roll_cmd', 'pitch_cmd', 'yaw_cmd', ...[1, 2, 3, 4, 5, 6].map((p) => `L${p}_cmd_mm`), ...[1, 2, 3, 4, 5, 6].map((p) => `L${p}_real_mm`)];
    const rows = Array.from({ length: 20 }, (_, i) => [i * 0.1, 'sine_axis', 0, 0, 530, 0, 0, 0, ...Array(6).fill(560 + i), ...Array(6).fill(555 + i)]);
    const d = parseRoutineCsv(toCsv(header, rows), 500);
    expect(d.t).toHaveLength(20);
    expect(d.sp[3][0]).toBeCloseTo(63);
    expect(d.y[3][0]).toBeCloseTo(58);
  });
});
