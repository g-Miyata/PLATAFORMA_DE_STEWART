import { create } from 'zustand';
import type { MotionTickMessage, Orientation, Quaternion, TelemetryMessage } from '@/lib/types';

export interface LogEntry {
  id: number;
  ts: number;
  dir: 'rx' | 'tx' | 'info' | 'error';
  text: string;
}

export interface ImuReading {
  orientation: Orientation;
  quaternion: Quaternion | null;
  format: TelemetryMessage['format'];
  ts: number;
}

interface TelemetryState {
  telemetry: TelemetryMessage | null;
  motionTick: MotionTickMessage | null;
  imu: ImuReading | null;
  log: LogEntry[];
  onTelemetry: (msg: TelemetryMessage) => void;
  onMotionTick: (msg: MotionTickMessage) => void;
  pushLog: (dir: LogEntry['dir'], text: string) => void;
  clearLog: () => void;
  reset: () => void;
}

const LOG_LIMIT = 400;
let logId = 0;

export const useTelemetry = create<TelemetryState>((set) => ({
  telemetry: null,
  motionTick: null,
  imu: null,
  log: [],
  onTelemetry: (msg) =>
    set({
      telemetry: msg,
      ...(msg.mpu
        ? { imu: { orientation: msg.mpu, quaternion: msg.quaternions, format: msg.format, ts: msg.ts } }
        : {}),
    }),
  onMotionTick: (msg) => set({ motionTick: msg }),
  pushLog: (dir, text) =>
    set((s) => {
      const log = s.log.length >= LOG_LIMIT ? s.log.slice(s.log.length - LOG_LIMIT + 1) : s.log.slice();
      log.push({ id: ++logId, ts: Date.now(), dir, text });
      return { log };
    }),
  clearLog: () => set({ log: [] }),
  reset: () => set({ telemetry: null, motionTick: null, imu: null }),
}));
