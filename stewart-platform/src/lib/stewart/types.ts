export interface Pose {
  x: number;
  y: number;
  z: number;
  roll: number;
  pitch: number;
  yaw: number;
}

export interface Actuator {
  id: number;
  length: number;
  percentage: number;
  valid: boolean;
}

export interface PlatformData {
  pose: Pose;
  actuators: Actuator[];
  valid: boolean;
  base_points: number[][];
  platform_points: number[][];
}
