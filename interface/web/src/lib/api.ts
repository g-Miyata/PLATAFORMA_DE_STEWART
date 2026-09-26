import type {
  ApplyPoseResult,
  FlightSimStatus,
  MotionRequest,
  MotionStatus,
  PidGains,
  PidSettings,
  PlatformGeometry,
  PlatformResponse,
  Pose,
  PoseControlResult,
  SerialPortInfo,
  SerialStatus,
  TrajectoryRequest,
  TrajectoryStartResult,
  CalibrationReport,
  CalibrationReportSummary,
  CalibrationStatus,
} from './types';

/** Mesma origem: o FastAPI serve o frontend em produção e o Vite faz proxy em dev. */
export const API_BASE = '';

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(0, 'Backend inacessível. Verifique se o servidor está rodando (start.bat).');
  }
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const data = await res.json();
      if (typeof data?.detail === 'string') detail = data.detail;
      else if (Array.isArray(data?.detail)) detail = data.detail.map((d: { msg: string }) => d.msg).join('; ');
    } catch {
      /* resposta sem JSON */
    }
    throw new ApiError(res.status, detail);
  }
  return (await res.json()) as T;
}

// ---------------- poses comandadas ----------------
// Quem precisa saber o que foi enviado à plataforma (o gravador, por exemplo)
// escuta aqui em vez de cada página avisar por conta própria.
export type PoseSource = 'cinematica' | 'joystick' | 'imu' | 'bancada' | 'jogo';
type PoseListener = (pose: Pose, source: PoseSource) => void;
const poseListeners = new Set<PoseListener>();

/** Registra um ouvinte das poses aplicadas com sucesso; devolve a função de cancelar. */
export function onPoseCommanded(listener: PoseListener): () => void {
  poseListeners.add(listener);
  return () => {
    poseListeners.delete(listener);
  };
}

function emitPose(pose: Pose | undefined, source: PoseSource) {
  if (!pose) return;
  for (const l of poseListeners) l(pose, source);
}

const fullPose = (p: Partial<Pose>, zDefault: number): Pose => ({
  x: p.x ?? 0,
  y: p.y ?? 0,
  z: p.z ?? zDefault,
  roll: p.roll ?? 0,
  pitch: p.pitch ?? 0,
  yaw: p.yaw ?? 0,
});

const get = <T>(path: string, signal?: AbortSignal) => request<T>('GET', path, undefined, signal);
const post = <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {});

const query = (params: Record<string, number | undefined>) =>
  new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== undefined && Number.isFinite(v))
      .map(([k, v]) => [k, String(v)]),
  ).toString();

export const api = {
  // Serial
  listPorts: () => get<{ ports: SerialPortInfo[] }>('/serial/ports').then((r) => r.ports),
  openSerial: (port: string) => post<{ message: string }>('/serial/open', { port }),
  closeSerial: () => post<{ message: string }>('/serial/close'),
  serialStatus: (signal?: AbortSignal) => get<SerialStatus>('/serial/status', signal),
  sendCommand: (command: string) => post<{ sent: string }>('/serial/send', { command }),

  // Cinemática
  geometry: () => get<PlatformGeometry>('/config'),
  calculate: (pose: Partial<Pose>) => post<PlatformResponse>('/calculate', pose),
  /** `source` identifica quem comandou (para o gravador); padrão: cinemática. */
  applyPose: async (pose: Partial<Pose>, source: PoseSource = 'cinematica') => {
    const r = await post<ApplyPoseResult>('/apply_pose', pose);
    if (r.applied && pose.z !== undefined) emitPose(fullPose(pose, pose.z), source);
    return r;
  },
  joystickPose: async (body: { lx: number; ly: number; rx: number; ry: number; apply: boolean; z_base: number }) => {
    const r = await post<PoseControlResult>('/joystick/pose', body);
    if (r.applied) emitPose(r.pose, 'joystick');
    return r;
  },
  mpuControl: async (body: Partial<Pose> & { scale: number }) => {
    const r = await post<PoseControlResult>('/mpu/control', body);
    if (r.applied) emitPose(r.pose, 'imu');
    return r;
  },

  // PID
  setpoint: (value: number, piston?: number) => post('/pid/setpoint', { piston: piston ?? null, value }),
  selectPiston: (piston: number) => post(`/pid/select/${piston}`),
  manual: (action: 'A' | 'R' | 'ok') => post(`/pid/manual/${action}`),
  pidGains: () => get<PidGains>('/pid/gains'),
  setPidGains: (piston: number, gains: { kp?: number; ki?: number; kd?: number }) =>
    post('/pid/gains', { piston, ...gains }),
  setPidGainsAll: (gains: { kp?: number; ki?: number; kd?: number }) => post(`/pid/gains/all?${query(gains)}`),
  pidSettings: () => get<PidSettings>('/pid/settings'),
  setPidSettings: (s: Partial<PidSettings>) => post('/pid/settings', s),
  setFeedforward: (piston: number, ff: { u0_adv?: number; u0_ret?: number }) => post('/pid/feedforward', { piston, ...ff }),
  setOffset: (piston: number, offset: number) => post(`/pid/offset?${query({ piston, offset })}`),

  // Rotinas
  motionStart: (req: MotionRequest) => post<{ message: string }>('/motion/start', req),
  motionStop: () => post('/motion/stop'),
  motionStatus: () => get<MotionStatus>('/motion/status'),
  trajectoryStart: (req: TrajectoryRequest) => post<TrajectoryStartResult>('/motion/trajectory', req),

  // Simulação de voo (FlightGear)
  flightStart: () => post<FlightSimStatus>('/flight-simulation/start'),
  flightStop: () => post<FlightSimStatus>('/flight-simulation/stop'),
  flightStatus: () => get<FlightSimStatus>('/flight-simulation/status'),
  flightPreview: () => get<PlatformResponse & { timestamp: number }>('/flight-simulation/preview'),

  // Calibração (autoteste + gêmeo digital)
  calibrationStart: () => post<CalibrationStatus>('/calibration/start'),
  calibrationStatus: () => get<CalibrationStatus>('/calibration/status'),
  calibrationCancel: () => post<CalibrationStatus>('/calibration/cancel'),
  calibrationReports: () => get<{ reports: CalibrationReportSummary[] }>('/calibration/reports').then((r) => r.reports),
  calibrationReport: (id: string) => get<CalibrationReport>(`/calibration/reports/${encodeURIComponent(id)}`),
  calibrationApply: (id: string) => post<{ applied: boolean; backup: string }>(`/calibration/reports/${encodeURIComponent(id)}/apply`),
  twinSimulate: (body: { t: number[]; sp: number[][]; y0: number[] }) => post<{ Y_sim: number[][] }>('/twin/simulate', body),

  // Segurança
  emergencyStop: () => post<{ stopped: boolean; held_mm: number[] | null }>('/emergency-stop'),
};
