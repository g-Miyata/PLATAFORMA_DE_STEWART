// Conversão de movimento do ponteiro (pixels) em grandezas do modelo, sem WebGL:
// o componente 3D projeta os pontos na tela e passa só números para cá.

export type Vec2 = [number, number];

/**
 * Deslocamento ao longo de um eixo 3D a partir do movimento do ponteiro.
 * `screenA` e `screenB` são as projeções na tela de dois pontos do eixo separados
 * por `worldDistance` (mm). Retorna os mm correspondentes ao movimento `delta`
 * (só a componente paralela ao eixo projetado conta).
 */
export function axisDragDelta(screenA: Vec2, screenB: Vec2, worldDistance: number, delta: Vec2): number {
  const sx = screenB[0] - screenA[0];
  const sy = screenB[1] - screenA[1];
  const len2 = sx * sx + sy * sy;
  // eixo quase apontando para a câmera: sem direção útil na tela
  if (len2 < 4) return 0;
  return ((delta[0] * sx + delta[1] * sy) / len2) * worldDistance;
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Rotação (graus) ao arrastar em volta de um centro projetado na tela.
 * `facing` = +1 quando o eixo de rotação aponta para a câmera (giro anti-horário na
 * tela = ângulo positivo), −1 quando aponta para longe. Limita a `maxStep` graus por
 * evento para não saltar quando o ponteiro passa perto do centro.
 */
export function rotationDragDelta(center: Vec2, from: Vec2, to: Vec2, facing: 1 | -1, maxStep = 15): number {
  const r1 = Math.hypot(from[0] - center[0], from[1] - center[1]);
  const r2 = Math.hypot(to[0] - center[0], to[1] - center[1]);
  if (r1 < 6 || r2 < 6) return 0;
  // tela com Y para baixo: inverte para o sentido matemático usual
  const a1 = Math.atan2(-(from[1] - center[1]), from[0] - center[0]);
  const a2 = Math.atan2(-(to[1] - center[1]), to[0] - center[0]);
  const deg = (wrap(a2 - a1) * 180) / Math.PI;
  return Math.max(-maxStep, Math.min(maxStep, deg * facing));
}
