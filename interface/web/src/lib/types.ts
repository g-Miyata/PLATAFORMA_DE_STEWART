// Contratos da API FastAPI (interface/backend/app.py) e das mensagens do WebSocket.

export type Vec3 = [number, number, number];

export interface Pose {
  x: number;
  y: number;
  z: number;
  roll: number;
  pitch: number;
  yaw: number;
}

export interface ActuatorData {
  id: number;
  /** comprimento absoluto (mm), junta a junta */
  length: number;
  percentage: number;
  valid: boolean;
}

export interface PlatformResponse {
  pose: Pose;
  actuators: ActuatorData[];
  valid: boolean;
  base_points: Vec3[];
  platform_points: Vec3[];
}

export interface PlatformGeometry {
  h0: number;
  stroke_min: number;
  stroke_max: number;
  home_z: number;
  base_points: Vec3[];
  platform_points_local: Vec3[];
}

export interface SerialPortInfo {
  device: string;
  description: string;
  display_name: string;
  is_esp32: boolean;
  confidence: number;
  simulated?: boolean;
}

export interface SerialStatus {
  connected: boolean;
  port: string | null;
  simulated: boolean;
}

export interface ApplyPoseResult {
  applied: boolean;
  valid: boolean;
  message?: string;
  setpoints_mm?: number[];
}

export interface PoseControlResult extends ApplyPoseResult {
  pose?: Pose;
  lengths_abs?: number[];
  course_mm?: number[];
  base_points?: Vec3[];
  platform_points?: Vec3[];
}

export type PidGains = Record<'1' | '2' | '3' | '4' | '5' | '6', { kp: number; ki: number; kd: number }>;

export interface PidSettings {
  dbmm: number;
  minpwm: number;
}

export type RoutineName = 'sine_axis' | 'circle_xy' | 'helix' | 'heave_pitch';
export type Axis = 'x' | 'y' | 'z' | 'roll' | 'pitch' | 'yaw';

export interface MotionRequest {
  routine: RoutineName;
  duration_s: number;
  hz: number;
  axis?: Axis;
  amp?: number;
  offset?: number;
  ax?: number;
  ay?: number;
  phx?: number;
  z_amp_mm?: number;
  z_cycles?: number;
}

export interface MotionStatus {
  running: boolean;
  /** 'trajectory' = trajetória arbitrária (gravação, linha do tempo, blocos) */
  routine: RoutineName | 'trajectory' | null;
  params: Partial<MotionRequest>;
  started_at: number | null;
  elapsed: number;
  /** só em trajetórias */
  name?: string;
  duration_s?: number;
}

/** Amostra de trajetória: pose completa no instante t (s). */
export interface TrajectorySample extends Pose {
  t: number;
}

export interface TrajectoryRequest {
  samples: TrajectorySample[];
  loop?: boolean;
  speed?: number;
  name?: string;
}

export interface TrajectoryStartResult {
  message: string;
  duration_s: number;
  peak_speed_mm_s: number;
  samples: number;
}

export interface FlightSimStatus {
  enabled: boolean;
  safe_z: number;
  started_at: number | null;
  last_preview_ts: number | null;
}

// ---------------- WebSocket /ws/telemetry ----------------
export interface Orientation {
  roll: number;
  pitch: number;
  yaw: number;
}

export interface Quaternion {
  w: number;
  x: number;
  y: number;
  z: number;
}

export interface TelemetryMessage {
  type: 'telemetry' | 'telemetry_mpu' | 'telemetry_bno085';
  ts: number;
  sp_mm: number;
  /** curso medido de cada pistão (mm, 0..180) */
  Y: number[];
  PWM: number[];
  mpu: Orientation | null;
  quaternions: Quaternion | null;
  format: 'standard' | 'mpu6050' | 'bno085';
  actuator_lengths_abs: number[];
  pose_live: Pose | null;
  platform_points_live: Vec3[] | null;
  base_points: Vec3[];
  /** posições do simulador sombra (gêmeo digital), no mesmo instante */
  twin?: { Y_sim: number[] } | null;
}

export type TwinParamKey = 'vmax_adv_mm_s' | 'vmax_ret_mm_s' | 'deadzone_adv_pwm' | 'deadzone_ret_pwm';
export type TwinParams = Record<TwinParamKey, number[]>;

export interface TwinStatus {
  active: boolean;
  simulated: boolean;
  samples: number;
  params: TwinParams;
}

export interface TwinPistonFit extends Record<TwinParamKey, number> {
  ok: boolean;
  reason?: string;
  samples: number;
  fit_before: number;
  fit_after: number;
}

export interface TwinFitResult {
  samples: number;
  pistons: TwinPistonFit[];
  proposed: TwinParams;
  rms_before: number[];
  rms_after: number[];
}

export interface RawMessage {
  type: 'raw';
  ts: number;
  raw: string;
  parse_error?: boolean;
}

export interface MotionTickMessage {
  type: 'motion_tick';
  t: number;
  elapsed_ms: number;
  pose_cmd: Pose;
  routine: RoutineName;
  actuators_cmd: number[];
  actuators_real: number[] | null;
  platform_points_cmd: Vec3[];
}

// ---------------- motion cueing (/cueing, telas Simulador de voo e Orientação do avião) ----------------
/** washout = Simulador de voo; attitude = Orientação do avião (só roll/pitch) */
export type CueingProfile = 'washout' | 'attitude';
export type CueingSource = 'live' | 'replay' | null;
export type CueingMode = 'off' | 'engaging' | 'on' | 'releasing';

export interface CueingAircraft {
  t: number;
  /** força específica no piloto (m/s²), eixos do avião: x frente, y direita, z baixo */
  f: Vec3;
  /** velocidades angulares p, q, r (°/s) */
  w: Vec3;
  roll: number;
  pitch: number;
  heading: number;
  ias: number;
  agl: number;
  alt: number;
  wow: boolean;
}

export interface CueingReplay {
  id: string;
  name: string;
  t: number;
  duration: number;
  speed: number;
  loop: boolean;
  paused: boolean;
  profile: CueingProfile;
  /** mandando a posição para o FlightGear desenhar */
  visual: boolean;
  /** voo gravado com posição (v2) */
  has_visual: boolean;
}

export interface CueingRecording {
  samples: number;
  duration: number;
}

export interface CueingTickMessage {
  type: 'cueing_tick';
  ts: number;
  profile: CueingProfile;
  source: CueingSource;
  mode: CueingMode;
  /** pose que a plataforma recebe (depois do limitador de velocidade) */
  pose: Pose;
  /** saída do washout antes do limitador */
  mca_pose: Pose;
  limited: boolean;
  clipped: boolean;
  aircraft: CueingAircraft | null;
  /** o que o ocupante sente na plataforma, na convenção do avião */
  platform: { f: Vec3; w: Vec3 };
  replay: CueingReplay | null;
  recording: CueingRecording | null;
}

export interface CueingParams {
  f_scale: number;
  trans_scale: number;
  trans_omega: number;
  trans_zeta: number;
  trans_washout: number;
  heave_omega: number;
  heave_washout: number;
  tilt_omega: number;
  tilt_rate_max: number;
  tilt_max: number;
  rot_scale: number;
  yaw_scale: number;
  rot_omega: number;
  x_max: number;
  y_max: number;
  z_max: number;
  roll_max: number;
  pitch_max: number;
  yaw_max: number;
  z0: number;
  leg_speed_max: number;
  invert_pitch: boolean;
  att_scale: number;
  att_limit: number;
  att_z: number;
}

export interface CueingEvent {
  ts: number;
  text: string;
  tone: 'info' | 'success' | 'warning' | 'danger';
}

export interface CueingStatus {
  profile: CueingProfile;
  source: CueingSource;
  mode: CueingMode;
  serial_open: boolean;
  conflict: string | null;
  bridge: { connected: boolean; receiving: boolean; rate_hz: number; samples: number };
  replay: CueingReplay | null;
  recording: CueingRecording | null;
  events: CueingEvent[];
  params: CueingParams;
}

export interface CueingFlight {
  id: string;
  name: string;
  description: string;
  aircraft: string | null;
  recorded_at: string | null;
  duration_s: number;
  samples: number;
  /** gravado com posição e superfícies: dá para ver no FlightGear */
  visual: boolean;
}

export type CueingSeriesKey =
  | 't' | 'ac_fx' | 'ac_fy' | 'ac_nz' | 'pf_fx' | 'pf_fy' | 'pf_nz'
  | 'ac_p' | 'ac_q' | 'ac_r' | 'pf_p' | 'pf_q' | 'pf_r' | keyof Pose;

export interface CueingAnalysis {
  flight: CueingFlight;
  duration_s: number;
  peak: Pose;
  speed_limited_pct: number;
  stroke_limited_pct: number;
  series: Record<CueingSeriesKey, number[]>;
}

// ---------------- FlightGear (/fg) ----------------
export interface FgCheckItem {
  id: 'fgfs' | 'fgdata' | 'aircraft' | 'livery' | 'protocols' | 'ports' | 'memory';
  label: string;
  ok: boolean;
  detail: string;
  fix: string;
  severity: 'error' | 'warning';
}

export interface FgCheck {
  ok: boolean;
  items: FgCheckItem[];
  paths: Record<string, string | null>;
}

export interface FgError {
  message: string;
  log?: string[];
  hint?: string;
}

export interface FgStatus {
  state: 'stopped' | 'starting' | 'loading' | 'ready' | 'crashed' | 'stuck';
  pid?: number;
  uptime?: number;
  error?: FgError | null;
}

export type WsMessage = TelemetryMessage | RawMessage | MotionTickMessage | CueingTickMessage;
