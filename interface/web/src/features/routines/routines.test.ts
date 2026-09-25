import { describe, expect, it } from 'vitest';
import { DEFAULT_GEOMETRY } from '@/features/platform3d/geometry';
import { analyzeRoutine, buildRequest, PRESETS, routinePose } from './routines';

describe('rotinas', () => {
  it('nenhum default ultrapassa o próprio máximo', () => {
    for (const p of PRESETS) for (const d of p.params) expect(d.value, `${p.key}.${d.name}`).toBeLessThanOrEqual(d.max);
  });

  it('senoide em Z oscila em torno do home', () => {
    const req = buildRequest(PRESETS[0], { amp: 10, hz: 0.25, duration_s: 30 });
    expect(routinePose(req, 1, 530).z).toBeCloseTo(540); // quarto de período
    expect(routinePose(req, 3, 530).z).toBeCloseTo(520);
  });

  it('respeita os limites de _clamp_pose do backend', () => {
    const req = buildRequest(PRESETS[3], { amp: 25, hz: 0.25, duration_s: 30 });
    expect(routinePose(req, 1, 530).pitch).toBe(10);
  });

  it('detecta rotina rápida demais para os atuadores', () => {
    const slow = analyzeRoutine(buildRequest(PRESETS[0], { amp: 5, hz: 0.1, duration_s: 30 }), DEFAULT_GEOMETRY);
    const fast = analyzeRoutine(buildRequest(PRESETS[0], { amp: 30, hz: 0.6, duration_s: 30 }), DEFAULT_GEOMETRY);
    expect(slow.peakSpeed).toBeLessThan(5);
    expect(fast.peakSpeed).toBeGreaterThan(60); // ~2π·0,6·30·(dL/dz≈0,9)
    expect(fast.withinStroke).toBe(true);
  });
});
