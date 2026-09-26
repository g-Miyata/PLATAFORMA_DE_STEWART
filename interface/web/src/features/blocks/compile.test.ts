import { describe, expect, it } from 'vitest';
import { DEFAULT_GEOMETRY } from '@/features/platform3d/geometry';
import { analyzeTrajectory, makeSampler, sampleTrajectory } from '@/features/recorder/trajectory';
import { B, compileProgram, EXAMPLE_PROGRAMS, program, stepAt } from './compile';

const H = DEFAULT_GEOMETRY.home_z;

describe('compilador de blocos', () => {
  it('sem "ao iniciar" dá erro', () => {
    const r = compileProgram({ blocks: { blocks: [B.home()] } }, H);
    expect(r.errors[0].message).toMatch(/ao iniciar/);
  });

  it('programa vazio pede blocos', () => {
    const start = B.start();
    const r = compileProgram(program(start), H);
    expect(r.errors[0].blockId).toBe(start.id);
  });

  it('mover eixo (absoluto e relativo), esperar e voltar ao home geram as poses-chave esperadas', () => {
    const r = compileProgram(program(B.start(B.axis('z', 10, 2), B.axis('z', 5, 1, 'rel'), B.wait(1.5), B.axis('roll', 3, 2), B.home(2))), H);
    expect(r.errors).toEqual([]);
    expect(r.keys.map((k) => k.t)).toEqual([0, 2, 3, 4.5, 6.5, 8.5]);
    expect(r.keys[1].pose.z).toBe(H + 10);
    expect(r.keys[2].pose.z).toBe(H + 15);
    expect(r.keys[3].pose).toEqual(r.keys[2].pose); // esperar segura a pose
    expect(r.keys[4].pose).toMatchObject({ z: H + 15, roll: 3 });
    expect(r.keys[5].pose).toEqual({ x: 0, y: 0, z: H, roll: 0, pitch: 0, yaw: 0 });
    expect(r.steps.map((s) => s.text)[1]).toBe('Mover Z de +5 mm em 1 s');
  });

  it('repetir multiplica o corpo e aparece no texto com recuo', () => {
    const r = compileProgram(program(B.start(B.repeat(3, B.axis('x', 10, 1), B.axis('x', -10, 1)))), H);
    expect(r.keys).toHaveLength(7);
    expect(r.duration).toBe(6);
    expect(r.steps[0]).toMatchObject({ text: 'Repetir 3 vezes:', depth: 0, t1: 6 });
    expect(r.steps[1].depth).toBe(1);
  });

  it('duração zero aponta o bloco culpado', () => {
    const bad = B.axis('x', 10, 0);
    const r = compileProgram(program(B.start(B.axis('x', 5, 1), bad)), H);
    expect(r.errors).toEqual([{ blockId: bad.id, message: expect.stringMatching(/duração/) }]);
  });

  it('rotina começa e termina na pose em que estava (rampa)', () => {
    const r = compileProgram(program(B.start(B.axis('x', 10, 2), B.routine('circulo', 15, 12, 0.2))), H);
    expect(r.errors).toEqual([]);
    const f = makeSampler(r.keys, r.interp);
    expect(f(2).x).toBeCloseTo(10, 6);
    expect(f(14).x).toBeCloseTo(10, 6);
    let dev = 0;
    for (let s = 2; s <= 14; s += 0.1) dev = Math.max(dev, Math.abs(f(s).x - 10));
    expect(dev).toBeGreaterThan(10);
  });

  it('interpolação vem do bloco', () => {
    expect(compileProgram(program(B.start(B.interp('linear'), B.home(1))), H).interp).toBe('linear');
  });

  it('stepAt encontra o bloco mais interno do instante', () => {
    const inner = B.axis('x', 10, 1);
    const r = compileProgram(program(B.start(B.wait(1), B.repeat(2, inner))), H);
    expect(stepAt(r.steps, 1.5)?.blockId).toBe(inner.id);
  });

  it.each(EXAMPLE_PROGRAMS.map((e) => [e.name, e] as const))('exemplo "%s" compila, é viável e lento o bastante', (_, ex) => {
    const r = compileProgram(ex.build(), H);
    expect(r.errors).toEqual([]);
    const a = analyzeTrajectory(sampleTrajectory(r.keys, r.interp), DEFAULT_GEOMETRY);
    expect(a.valid).toBe(true);
    expect(a.tooFast, `pico ${a.peakSpeed.toFixed(1)} mm/s`).toBe(false);
  });
});
