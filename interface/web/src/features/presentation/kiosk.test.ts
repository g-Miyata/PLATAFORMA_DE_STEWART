import { describe, expect, it } from 'vitest';
import { DEFAULT_GEOMETRY } from '@/features/platform3d/geometry';
import { analyzeRoutine } from '@/features/routines/routines';
import { buildPlaylist, KIOSK_ITEM_S, KIOSK_MAX_SPEED } from './kiosk';

describe('lista do quiosque', () => {
  const list = buildPlaylist(DEFAULT_GEOMETRY);

  it('tem rotinas e gravações de exemplo', () => {
    expect(list.filter((i) => i.kind === 'routine').length).toBeGreaterThanOrEqual(4);
    expect(list.some((i) => i.kind === 'trajectory')).toBe(true);
  });

  it('todos os itens ficam abaixo da velocidade segura e dentro do curso', () => {
    for (const item of list) {
      expect(item.peak, item.name).toBeLessThanOrEqual(KIOSK_MAX_SPEED);
      if (item.kind === 'routine') {
        expect(item.req.duration_s).toBe(KIOSK_ITEM_S);
        const a = analyzeRoutine(item.req, DEFAULT_GEOMETRY);
        expect(a.withinStroke).toBe(true);
      }
    }
  });
});
