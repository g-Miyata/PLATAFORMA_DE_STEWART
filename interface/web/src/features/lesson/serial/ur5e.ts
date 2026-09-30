// Robôs seriais da aula: braço planar 2R e o UR5e (6R, parâmetros DH oficiais da
// Universal Robots). Direta = produto das matrizes de cada junta; inversa = fórmula
// analítica de Hawkins (2013), com até 8 soluções.

/** Matriz 4×4 em ordem de linhas (row-major). */
export type Mat4 = number[];

export const IDENTITY: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export function mul(a: Mat4, b: Mat4): Mat4 {
  const out = new Array(16).fill(0);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) out[r * 4 + c] += a[r * 4 + k] * b[k * 4 + c];
  return out;
}

/** Inversa de uma transformação rígida [R p; 0 1] = [Rᵀ −Rᵀp; 0 1]. */
export function invRigid(m: Mat4): Mat4 {
  const R = [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]];
  const p = [m[3], m[7], m[11]];
  const Rt = [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]];
  const q = [0, 1, 2].map((i) => -(Rt[i * 3] * p[0] + Rt[i * 3 + 1] * p[1] + Rt[i * 3 + 2] * p[2]));
  return [Rt[0], Rt[1], Rt[2], q[0], Rt[3], Rt[4], Rt[5], q[1], Rt[6], Rt[7], Rt[8], q[2], 0, 0, 0, 1];
}

/** Transformação de Denavit–Hartenberg (clássica): Rz(θ)·Tz(d)·Tx(a)·Rx(α). */
export function dhTransform(theta: number, d: number, a: number, alpha: number): Mat4 {
  const ct = Math.cos(theta);
  const st = Math.sin(theta);
  const ca = Math.cos(alpha);
  const sa = Math.sin(alpha);
  return [ct, -st * ca, st * sa, a * ct, st, ct * ca, -ct * sa, a * st, 0, sa, ca, d, 0, 0, 0, 1];
}

export interface DhRow {
  /** deslocamento ao longo de z (m) */
  d: number;
  /** comprimento do elo ao longo de x (m) */
  a: number;
  /** torção do elo (rad) */
  alpha: number;
}

/** Tabela DH do UR5e (Universal Robots, "DH parameters for calculations of kinematics and dynamics"). */
export const UR5E_DH: DhRow[] = [
  { d: 0.1625, a: 0, alpha: Math.PI / 2 },
  { d: 0, a: -0.425, alpha: 0 },
  { d: 0, a: -0.3922, alpha: 0 },
  { d: 0.1333, a: 0, alpha: Math.PI / 2 },
  { d: 0.0997, a: 0, alpha: -Math.PI / 2 },
  { d: 0.0996, a: 0, alpha: 0 },
];

export const UR5E_JOINTS = ['Base', 'Ombro', 'Cotovelo', 'Punho 1', 'Punho 2', 'Punho 3'] as const;

const jointT = (i: number, theta: number) => dhTransform(theta, UR5E_DH[i].d, UR5E_DH[i].a, UR5E_DH[i].alpha);

/** Direta do UR5e: as matrizes ⁰Tᵢ de cada junta (i = 0..6; a última é a ferramenta). */
export function fkChain(theta: readonly number[]): Mat4[] {
  const frames: Mat4[] = [IDENTITY];
  let T = IDENTITY;
  for (let i = 0; i < 6; i++) {
    T = mul(T, jointT(i, theta[i]));
    frames.push(T);
  }
  return frames;
}

export const fkUR5e = (theta: readonly number[]): Mat4 => fkChain(theta)[6];

export const position = (m: Mat4): [number, number, number] => [m[3], m[7], m[11]];

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Inversa analítica do UR5e (Hawkins, 2013): até 8 conjuntos de ângulos que levam
 * a ferramenta à mesma pose — ombro (2) × punho (2) × cotovelo (2). Devolve [] se a
 * pose estiver fora do alcance. Ângulos em (−π, π].
 */
export function ikUR5e(T: Mat4): number[][] {
  const [, , , d4, , d6] = UR5E_DH.map((r) => r.d);
  const a2 = UR5E_DH[1].a;
  const a3 = UR5E_DH[2].a;
  const p06 = position(T);
  const z6 = [T[2], T[6], T[10]];
  const p05 = [p06[0] - d6 * z6[0], p06[1] - d6 * z6[1], p06[2] - d6 * z6[2]];
  const r = Math.hypot(p05[0], p05[1]);
  if (r < Math.abs(d4)) return [];
  const phi = Math.atan2(p05[1], p05[0]);
  const psi = Math.acos(d4 / r);
  const sols: number[][] = [];

  for (const s1 of [1, -1]) {
    const t1 = phi + s1 * psi + Math.PI / 2;
    const c5 = (p06[0] * Math.sin(t1) - p06[1] * Math.cos(t1) - d4) / d6;
    if (Math.abs(c5) > 1 + 1e-9) continue;
    for (const s5 of [1, -1]) {
      const t5 = s5 * Math.acos(Math.max(-1, Math.min(1, c5)));
      const sin5 = Math.sin(t5);
      // T60 = inversa de T06: seus eixos X e Y dão o θ6
      const T60 = invRigid(T);
      const X60 = [T60[0], T60[4], T60[8]];
      const Y60 = [T60[1], T60[5], T60[9]];
      const t6 =
        Math.abs(sin5) < 1e-9
          ? 0 // singularidade do punho: θ6 livre
          : Math.atan2((-X60[1] * Math.sin(t1) + Y60[1] * Math.cos(t1)) / sin5, (X60[0] * Math.sin(t1) - Y60[0] * Math.cos(t1)) / sin5);
      // T14 = T01⁻¹ · T06 · T56⁻¹ · T45⁻¹
      const T14 = mul(mul(mul(invRigid(jointT(0, t1)), T), invRigid(jointT(5, t6))), invRigid(jointT(4, t5)));
      const p13 = [T14[0] * 0 + T14[1] * -d4 + T14[3], T14[4] * 0 + T14[5] * -d4 + T14[7], T14[8] * 0 + T14[9] * -d4 + T14[11]];
      const n13 = Math.hypot(p13[0], p13[1], p13[2]);
      const c3 = (n13 * n13 - a2 * a2 - a3 * a3) / (2 * a2 * a3);
      if (Math.abs(c3) > 1 + 1e-9) continue;
      for (const s3 of [1, -1]) {
        const t3 = s3 * Math.acos(Math.max(-1, Math.min(1, c3)));
        const t2 = -Math.atan2(p13[1], -p13[0]) + Math.asin((a3 * Math.sin(t3)) / n13);
        const T34 = mul(invRigid(mul(jointT(1, t2), jointT(2, t3))), T14);
        const t4 = Math.atan2(T34[4], T34[0]);
        sols.push([t1, t2, t3, t4, t5, t6].map(wrap));
      }
    }
  }
  return sols;
}

/** Maior diferença entre duas matrizes (posição em m e orientação). */
export function poseError(a: Mat4, b: Mat4): number {
  let e = 0;
  for (let i = 0; i < 12; i++) e = Math.max(e, Math.abs(a[i] - b[i]));
  return e;
}

// ---------------------------------------------------------------- braço planar 2R
export interface Arm2R {
  l1: number;
  l2: number;
}

/** Direta do 2R: cotovelo e ponta a partir dos dois ângulos (rad). */
export function fk2R({ l1, l2 }: Arm2R, t1: number, t2: number) {
  const elbow: [number, number] = [l1 * Math.cos(t1), l1 * Math.sin(t1)];
  const tip: [number, number] = [elbow[0] + l2 * Math.cos(t1 + t2), elbow[1] + l2 * Math.sin(t1 + t2)];
  return { elbow, tip };
}

/** Inversa do 2R: as duas soluções (cotovelo para cima e para baixo), ou null fora do alcance. */
export function ik2R({ l1, l2 }: Arm2R, x: number, y: number): { up: [number, number]; down: [number, number] } | null {
  const c2 = (x * x + y * y - l1 * l1 - l2 * l2) / (2 * l1 * l2);
  if (c2 < -1 - 1e-12 || c2 > 1 + 1e-12) return null;
  const solve = (sign: number): [number, number] => {
    const t2 = sign * Math.acos(Math.max(-1, Math.min(1, c2)));
    const t1 = Math.atan2(y, x) - Math.atan2(l2 * Math.sin(t2), l1 + l2 * Math.cos(t2));
    return [t1, t2];
  };
  return { up: solve(1), down: solve(-1) };
}

// ---------------------------------------------------------------- modelo 3D
/**
 * Árvore de corpos do UR5e como no ur5e.xml do MuJoCo Menagerie: cada malha está no
 * referencial do seu corpo. `quat` em (w, x, y, z); a junta gira em torno de `axis`
 * (no referencial do corpo) pelo ângulo da junta — o mesmo ângulo da tabela DH.
 */
export interface UrBody {
  name: 'base' | 'shoulder' | 'upperarm' | 'forearm' | 'wrist1' | 'wrist2' | 'wrist3';
  pos: [number, number, number];
  quat: [number, number, number, number];
  /** eixo da junta; null na base (fixa) */
  axis: [number, number, number] | null;
}

const H = Math.SQRT1_2;
export const UR5E_BODIES: UrBody[] = [
  { name: 'base', pos: [0, 0, 0], quat: [0, 0, 0, -1], axis: null },
  { name: 'shoulder', pos: [0, 0, 0.163], quat: [1, 0, 0, 0], axis: [0, 0, 1] },
  { name: 'upperarm', pos: [0, 0.138, 0], quat: [H, 0, H, 0], axis: [0, 1, 0] },
  { name: 'forearm', pos: [0, -0.131, 0.425], quat: [1, 0, 0, 0], axis: [0, 1, 0] },
  { name: 'wrist1', pos: [0, 0, 0.392], quat: [H, 0, H, 0], axis: [0, 1, 0] },
  { name: 'wrist2', pos: [0, 0.127, 0], quat: [1, 0, 0, 0], axis: [0, 0, 1] },
  { name: 'wrist3', pos: [0, 0, 0.1], quat: [1, 0, 0, 0], axis: [0, 1, 0] },
];
/** ponto da flange no referencial do último corpo */
export const UR5E_FLANGE: [number, number, number] = [0, 0.1, 0];

function quatMat([w, x, y, z]: readonly number[]): Mat4 {
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y), 0,
    2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x), 0,
    2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y), 0,
    0, 0, 0, 1,
  ];
}

function axisAngle(axis: readonly number[], t: number): Mat4 {
  const s = Math.sin(t / 2);
  return quatMat([Math.cos(t / 2), axis[0] * s, axis[1] * s, axis[2] * s]);
}

/** Referencial de cada corpo no mundo para os ângulos θ (a mesma conta que a cena 3D faz). */
export function bodyChain(theta: readonly number[]): Mat4[] {
  const out: Mat4[] = [];
  let T = IDENTITY;
  UR5E_BODIES.forEach((b, i) => {
    const local = mul([1, 0, 0, b.pos[0], 0, 1, 0, b.pos[1], 0, 0, 1, b.pos[2], 0, 0, 0, 1], quatMat(b.quat));
    T = mul(T, b.axis ? mul(local, axisAngle(b.axis, theta[i - 1])) : local);
    out.push(T);
  });
  return out;
}
