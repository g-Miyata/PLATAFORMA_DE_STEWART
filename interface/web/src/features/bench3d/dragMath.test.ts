import { describe, expect, it } from 'vitest';
import { axisDragDelta, rotationDragDelta } from './dragMath';

describe('arraste ao longo do eixo', () => {
  // eixo vertical na tela: 100 mm do mundo = 200 px para cima
  const a: [number, number] = [400, 400];
  const b: [number, number] = [400, 200];

  it('subir o ponteiro ao longo do eixo aumenta', () => {
    expect(axisDragDelta(a, b, 100, [0, -50])).toBeCloseTo(25);
  });

  it('movimento perpendicular não conta', () => {
    expect(axisDragDelta(a, b, 100, [80, 0])).toBeCloseTo(0);
  });

  it('eixo apontando para a câmera não gera movimento', () => {
    expect(axisDragDelta(a, [401, 400], 100, [0, -50])).toBe(0);
  });
});

describe('arraste em rotação', () => {
  const c: [number, number] = [300, 300];

  it('giro anti-horário na tela é positivo com o eixo voltado para a câmera', () => {
    // de "leste" para "norte" (Y da tela cresce para baixo)
    expect(rotationDragDelta(c, [400, 300], [300 + 100 * Math.cos(0.2), 300 - 100 * Math.sin(0.2)], 1)).toBeCloseTo(11.46, 1);
  });

  it('inverte com o eixo voltado para longe', () => {
    const d = rotationDragDelta(c, [400, 300], [300 + 100 * Math.cos(0.2), 300 - 100 * Math.sin(0.2)], -1);
    expect(d).toBeCloseTo(-11.46, 1);
  });

  it('limita o passo e ignora o ponteiro sobre o centro', () => {
    expect(rotationDragDelta(c, [400, 300], [300, 200], 1)).toBe(15);
    expect(rotationDragDelta(c, [302, 300], [300, 200], 1)).toBe(0);
  });
});
