// Compilador dos programas em blocos: lê a serialização JSON do Blockly (sem
// depender do Blockly, então roda nos testes) e gera poses-chave para a mesma
// trajetória do "Gravar e reproduzir".
import { routinePose } from '@/features/routines/routines';
import type { Interp, Keyframe, PoseAxis } from '@/features/recorder/trajectory';
import type { MotionRequest, Pose } from '@/lib/types';

// ---------------- serialização do Blockly (subconjunto usado) ----------------
export interface BlockJson {
  type: string;
  id?: string;
  fields?: Record<string, unknown>;
  inputs?: Record<string, { block?: BlockJson }>;
  next?: { block?: BlockJson };
}

export interface WorkspaceJson {
  blocks?: { blocks?: BlockJson[] };
}

export const PROGRAM_START = 'stewart_start';

export type RoutineKind = 'senoide_z' | 'senoide_pitch' | 'senoide_roll' | 'circulo' | 'onda';

export const ROUTINE_LABEL: Record<RoutineKind, string> = {
  senoide_z: 'senoide em Z',
  senoide_pitch: 'senoide de pitch',
  senoide_roll: 'senoide de roll',
  circulo: 'círculo em XY',
  onda: 'onda (Z + pitch)',
};

const AXIS_LABEL: Record<PoseAxis, string> = { x: 'X', y: 'Y', z: 'Z', roll: 'roll', pitch: 'pitch', yaw: 'yaw' };
const unit = (a: PoseAxis) => (a === 'roll' || a === 'pitch' || a === 'yaw' ? '°' : ' mm');

export interface CompileError {
  blockId?: string;
  message: string;
}

export interface CompiledStep {
  blockId?: string;
  t0: number;
  t1: number;
  text: string;
  depth: number;
}

export interface CompileResult {
  keys: Keyframe[];
  interp: Interp;
  steps: CompiledStep[];
  errors: CompileError[];
  duration: number;
}

export const LIMITS = { maxDuration: 3600, maxKeys: 20_000, maxRepeat: 50 };

const num = (b: BlockJson, name: string, fallback = 0) => {
  const v = Number(b.fields?.[name]);
  return Number.isFinite(v) ? v : fallback;
};
const str = (b: BlockJson, name: string) => String(b.fields?.[name] ?? '');
const fmt = (v: number, d = 1) => v.toLocaleString('pt-BR', { maximumFractionDigits: d });

function chain(first: BlockJson | undefined): BlockJson[] {
  const out: BlockJson[] = [];
  for (let b = first; b; b = b.next?.block) out.push(b);
  return out;
}

function routineRequest(kind: RoutineKind, amp: number, hz: number, duration: number): MotionRequest {
  switch (kind) {
    case 'senoide_z':
      return { routine: 'sine_axis', axis: 'z', amp, hz, duration_s: duration };
    case 'senoide_pitch':
      return { routine: 'sine_axis', axis: 'pitch', amp, hz, duration_s: duration };
    case 'senoide_roll':
      return { routine: 'sine_axis', axis: 'roll', amp, hz, duration_s: duration };
    case 'circulo':
      return { routine: 'circle_xy', ax: amp, ay: amp, hz, duration_s: duration };
    case 'onda':
      return { routine: 'heave_pitch', amp, ay: 2.5, hz, duration_s: duration };
  }
}

/** Compila o programa que começa no bloco "ao iniciar". */
export function compileProgram(ws: WorkspaceJson, homeZ: number): CompileResult {
  const home: Pose = { x: 0, y: 0, z: homeZ, roll: 0, pitch: 0, yaw: 0 };
  const top = ws.blocks?.blocks ?? [];
  const start = top.find((b) => b.type === PROGRAM_START);
  const errors: CompileError[] = [];
  const steps: CompiledStep[] = [];
  const keys: Keyframe[] = [{ t: 0, pose: { ...home } }];
  let interp: Interp = 'suave';
  let t = 0;
  let cur: Pose = { ...home };

  if (!start) {
    return { keys, interp, steps, duration: 0, errors: [{ message: 'Falta o bloco “ao iniciar”: todo programa começa por ele.' }] };
  }

  const push = (dt: number, pose: Pose) => {
    t += dt;
    cur = { ...pose };
    keys.push({ t, pose: { ...pose } });
  };

  const needDuration = (b: BlockJson, d: number) => {
    if (d > 0) return true;
    errors.push({ blockId: b.id, message: 'A duração precisa ser maior que zero.' });
    return false;
  };

  function run(blocks: BlockJson[], depth: number) {
    for (const b of blocks) {
      if (errors.length || t > LIMITS.maxDuration || keys.length > LIMITS.maxKeys) return;
      const t0 = t;
      const step = (text: string) => steps.push({ blockId: b.id, t0, t1: t, text, depth });
      switch (b.type) {
        case 'stewart_pose': {
          const d = num(b, 'T', 1);
          if (!needDuration(b, d)) return;
          const target: Pose = { x: num(b, 'X'), y: num(b, 'Y'), z: homeZ + num(b, 'Z'), roll: num(b, 'ROLL'), pitch: num(b, 'PITCH'), yaw: num(b, 'YAW') };
          push(d, target);
          step(`Mover para X ${fmt(target.x)} · Y ${fmt(target.y)} · Z ${fmt(target.z - homeZ)} · roll ${fmt(target.roll)}° · pitch ${fmt(target.pitch)}° · yaw ${fmt(target.yaw)}° em ${fmt(d)} s`);
          break;
        }
        case 'stewart_axis': {
          const d = num(b, 'T', 1);
          if (!needDuration(b, d)) return;
          const axis = (str(b, 'AXIS') || 'z') as PoseAxis;
          const relative = str(b, 'MODE') === 'rel';
          const v = num(b, 'V');
          const target = { ...cur };
          target[axis] = relative ? cur[axis] + v : axis === 'z' ? homeZ + v : v;
          push(d, target);
          step(relative ? `Mover ${AXIS_LABEL[axis]} de ${v >= 0 ? '+' : ''}${fmt(v)}${unit(axis)} em ${fmt(d)} s` : `Mover ${AXIS_LABEL[axis]} para ${fmt(v)}${unit(axis)} em ${fmt(d)} s`);
          break;
        }
        case 'stewart_home': {
          const d = num(b, 'T', 2);
          if (!needDuration(b, d)) return;
          push(d, home);
          step(`Voltar ao home em ${fmt(d)} s`);
          break;
        }
        case 'stewart_wait': {
          const d = num(b, 'T', 1);
          if (!needDuration(b, d)) return;
          push(d, cur);
          step(`Esperar ${fmt(d)} s`);
          break;
        }
        case 'stewart_repeat': {
          const n = Math.round(num(b, 'N', 2));
          if (n < 1 || n > LIMITS.maxRepeat) {
            errors.push({ blockId: b.id, message: `Repetir aceita de 1 a ${LIMITS.maxRepeat} vezes.` });
            return;
          }
          const body = chain(b.inputs?.DO?.block);
          steps.push({ blockId: b.id, t0, t1: t0, text: `Repetir ${n} vezes:`, depth });
          const header = steps[steps.length - 1];
          for (let i = 0; i < n; i++) run(body, depth + 1);
          header.t1 = t;
          break;
        }
        case 'stewart_routine': {
          const d = num(b, 'T', 10);
          if (!needDuration(b, d)) return;
          const kind = (str(b, 'ROUTINE') || 'senoide_z') as RoutineKind;
          const amp = num(b, 'AMP', 5);
          const hz = num(b, 'HZ', 0.2);
          if (hz <= 0) {
            errors.push({ blockId: b.id, message: 'A frequência precisa ser maior que zero.' });
            return;
          }
          const req = routineRequest(kind, amp, hz, d);
          const base = { ...cur };
          const ramp = Math.min(2, d * 0.2);
          const dt = Math.min(0.25, 1 / (hz * 16));
          const n = Math.max(1, Math.ceil(d / dt));
          const t0r = t;
          for (let i = 1; i <= n; i++) {
            const tt = Math.min(d, i * dt);
            // mesma rampa cosseno do backend: começa e termina na pose em que estava
            const r = tt < ramp ? (1 - Math.cos((Math.PI * tt) / ramp)) / 2 : tt > d - ramp ? (1 - Math.cos((Math.PI * (d - tt)) / ramp)) / 2 : 1;
            const rp = routinePose(req, tt, homeZ);
            const pose = { ...base };
            for (const a of ['x', 'y', 'z', 'roll', 'pitch', 'yaw'] as const) pose[a] = base[a] + (rp[a] - home[a]) * r;
            keys.push({ t: t0r + tt, pose });
          }
          t = t0r + d;
          cur = { ...base };
          step(`Rotina ${ROUTINE_LABEL[kind]} (amplitude ${fmt(amp)}, ${fmt(hz, 2)} Hz) por ${fmt(d)} s`);
          break;
        }
        case 'stewart_interp': {
          interp = (str(b, 'MODE') || 'suave') as Interp;
          step(`Interpolação ${interp}`);
          break;
        }
        default:
          errors.push({ blockId: b.id, message: `Bloco desconhecido: ${b.type}` });
          return;
      }
    }
  }

  run(chain(start.next?.block), 0);
  if (!errors.length && t > LIMITS.maxDuration) errors.push({ message: `O programa passa de ${LIMITS.maxDuration / 60} minutos.` });
  if (!errors.length && keys.length > LIMITS.maxKeys) errors.push({ message: 'Programa longo demais: reduza as repetições.' });
  if (!errors.length && keys.length < 2) errors.push({ blockId: start.id, message: 'Encaixe blocos de movimento embaixo de “ao iniciar”.' });
  return { keys, interp, steps, errors, duration: t };
}

/** Passo (bloco) responsável pelo instante t — para destacar o bloco que saiu do curso. */
export function stepAt(steps: readonly CompiledStep[], t: number): CompiledStep | null {
  let best: CompiledStep | null = null;
  for (const s of steps) if (s.t1 > s.t0 && t >= s.t0 && t <= s.t1 + 1e-9 && (!best || s.depth >= best.depth)) best = s;
  return best;
}

// ---------------- construção de programas (exemplos e testes) ----------------
type Fields = Record<string, string | number>;
let seq = 0;
const block = (type: string, fields: Fields = {}, extra: Partial<BlockJson> = {}): BlockJson => ({ type, id: `b${++seq}`, fields, ...extra });

/** Encadeia blocos (next) e devolve o primeiro. */
export function sequence(...blocks: BlockJson[]): BlockJson | undefined {
  for (let i = 0; i < blocks.length - 1; i++) blocks[i].next = { block: blocks[i + 1] };
  return blocks[0];
}

export const B = {
  start: (...body: BlockJson[]) => block(PROGRAM_START, {}, { next: body.length ? { block: sequence(...body) } : undefined }),
  pose: (p: Partial<Record<'X' | 'Y' | 'Z' | 'ROLL' | 'PITCH' | 'YAW', number>>, T: number) =>
    block('stewart_pose', { X: 0, Y: 0, Z: 0, ROLL: 0, PITCH: 0, YAW: 0, ...p, T }),
  axis: (AXIS: PoseAxis, V: number, T: number, MODE: 'abs' | 'rel' = 'abs') => block('stewart_axis', { AXIS, V, T, MODE }),
  home: (T = 2) => block('stewart_home', { T }),
  wait: (T: number) => block('stewart_wait', { T }),
  repeat: (N: number, ...body: BlockJson[]) => block('stewart_repeat', { N }, { inputs: { DO: { block: sequence(...body) } } }),
  routine: (ROUTINE: RoutineKind, AMP: number, T: number, HZ = 0.2) => block('stewart_routine', { ROUTINE, AMP, HZ, T }),
  interp: (MODE: Interp) => block('stewart_interp', { MODE }),
};

export const program = (start: BlockJson): WorkspaceJson => ({ blocks: { blocks: [{ ...start, ...({ x: 20, y: 20 } as object) }] } });

export const EXAMPLE_PROGRAMS: { id: string; name: string; build: () => WorkspaceJson }[] = [
  {
    id: 'sim-nao',
    name: 'Sim e não com a cabeça',
    build: () =>
      program(
        B.start(
          B.repeat(2, B.axis('pitch', 3, 4), B.axis('pitch', -3, 4)),
          B.axis('pitch', 0, 2),
          B.wait(1),
          B.repeat(2, B.axis('yaw', 4, 4), B.axis('yaw', -4, 4)),
          B.home(2),
        ),
      ),
  },
  {
    id: 'quadrado',
    name: 'Quadrado no plano XY',
    build: () =>
      program(
        B.start(
          B.interp('linear'),
          B.pose({ X: 20, Y: 20 }, 4),
          B.repeat(2, B.pose({ X: 20, Y: -20 }, 5), B.pose({ X: -20, Y: -20 }, 5), B.pose({ X: -20, Y: 20 }, 5), B.pose({ X: 20, Y: 20 }, 5)),
          B.home(4),
        ),
      ),
  },
  {
    id: 'mar',
    name: 'Ondas do mar',
    build: () => program(B.start(B.axis('z', 5, 2), B.routine('onda', 6, 30, 0.1), B.home(2))),
  },
];
