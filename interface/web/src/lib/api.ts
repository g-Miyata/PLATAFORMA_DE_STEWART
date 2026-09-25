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
  applyPose: (pose: Partial<Pose>) => post<ApplyPoseResult>('/apply_pose', pose),
  joystickPose: (body: { lx: number; ly: number; rx: number; ry: number; apply: boolean; z_base: number }) =>
    post<PoseControlResult>('/joystick/pose', body),
  mpuControl: (body: Partial<Pose> & { scale: number }) => post<PoseControlResult>('/mpu/control', body),

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

  // Simulação de voo (FlightGear)
  flightStart: () => post<FlightSimStatus>('/flight-simulation/start'),
  flightStop: () => post<FlightSimStatus>('/flight-simulation/stop'),
  flightStatus: () => get<FlightSimStatus>('/flight-simulation/status'),
  flightPreview: () => get<PlatformResponse & { timestamp: number }>('/flight-simulation/preview'),

  // Segurança
  emergencyStop: () => post<{ stopped: boolean; held_mm: number[] | null }>('/emergency-stop'),
};
