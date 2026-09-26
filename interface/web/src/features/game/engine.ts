// Estado do jogo fora do React (lido e avançado a cada frame pela cena).
import { ballAt, DT, rimWalls, stepBall, type Ball, type Vec2, type Wall } from './ballPhysics';
import { LEVELS } from './levels';

export type GamePhase = 'pronto' | 'jogando' | 'pausado' | 'caiu' | 'venceu';

export interface Tilt {
  roll: number;
  pitch: number;
}

export interface EngineOptions {
  /** inclinação máxima (°) e taxa máxima de variação (°/s) */
  maxDeg: number;
  rateDegS: number;
}

export const FREE: EngineOptions = { maxDeg: 6, rateDegS: 40 };
/** espelhando na plataforma: dentro do que os atuadores acompanham */
export const MIRROR: EngineOptions = { maxDeg: 5, rateDegS: 8 };

export class GameEngine {
  levelIndex = 0;
  ball: Ball;
  phase: GamePhase = 'pronto';
  elapsed = 0;
  /** entrada do jogador, −1..1 (x: direita, y: para cima na tela) */
  input: Vec2 = [0, 0];
  tilt: Tilt = { roll: 0, pitch: 0 };
  options: EngineOptions = FREE;
  /** inclinação usada na física quando a bolinha segue a plataforma real */
  external: Tilt | null = null;
  private rim: Wall[];
  private acc = 0;
  private fellAt = 0;
  onEvent: (phase: GamePhase) => void = () => {};

  constructor(outline: Vec2[]) {
    this.rim = rimWalls(outline);
    this.ball = ballAt(LEVELS[0].start);
  }

  get level() {
    return LEVELS[this.levelIndex];
  }

  // setters (o React Compiler não deixa a página atribuir propriedades direto)
  setInput(x: number, y: number) {
    this.input = [Math.max(-1, Math.min(1, x)), Math.max(-1, Math.min(1, y))];
  }

  setOptions(o: EngineOptions) {
    this.options = o;
  }

  setExternal(t: Tilt | null) {
    this.external = t;
  }

  setListener(fn: (phase: GamePhase) => void) {
    this.onEvent = fn;
  }

  setLevel(i: number) {
    this.levelIndex = Math.max(0, Math.min(LEVELS.length - 1, i));
    this.restart();
  }

  restart() {
    this.ball = ballAt(this.level.start);
    this.elapsed = 0;
    this.acc = 0;
    this.phase = 'pronto';
    this.onEvent(this.phase);
  }

  togglePause() {
    if (this.phase === 'jogando') this.phase = 'pausado';
    else if (this.phase === 'pausado') this.phase = 'jogando';
    this.onEvent(this.phase);
  }

  /** Avança a inclinação (com limite de taxa) e a física em passos fixos. */
  frame(dt: number) {
    const { maxDeg, rateDegS } = this.options;
    const target: Tilt = { roll: this.input[0] * maxDeg, pitch: this.input[1] * maxDeg };
    const step = rateDegS * dt;
    const approach = (v: number, t: number) => v + Math.max(-step, Math.min(step, t - v));
    this.tilt = { roll: approach(this.tilt.roll, target.roll), pitch: approach(this.tilt.pitch, target.pitch) };

    if (this.phase === 'caiu') {
      if ((this.fellAt += dt) > 0.9) this.restart();
      return;
    }
    if (this.phase === 'pronto' && (this.input[0] !== 0 || this.input[1] !== 0)) {
      this.phase = 'jogando';
      this.onEvent(this.phase);
    }
    if (this.phase !== 'jogando') return;

    const t = this.external ?? this.tilt;
    this.elapsed += dt;
    this.acc += dt;
    while (this.acc >= DT) {
      this.acc -= DT;
      const r = stepBall(this.ball, t.roll, t.pitch, this.level, this.rim);
      this.ball = r.ball;
      if (r.event === 'hole') {
        this.phase = 'caiu';
        this.fellAt = 0;
        this.onEvent(this.phase);
        return;
      }
      if (r.event === 'goal') {
        this.phase = 'venceu';
        this.onEvent(this.phase);
        return;
      }
    }
  }
}
