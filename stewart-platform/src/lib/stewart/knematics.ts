import { Pose } from './types';

export class StewartPlatform {
  h0: number;
  strokeMin: number;
  strokeMax: number;
  B: number[][];
  P0: number[][];

  constructor(h0 = 432, strokeMin = 200, strokeMax = 600) {
    this.h0 = h0;
    this.strokeMin = strokeMin;
    this.strokeMax = strokeMax;

    this.B = [
      [305.5, -17, 0],
      [305.5, 17, 0],
      [-137.7, 273.23, 0],
      [-168, 255.7, 0],
      [-167.2, -256.2, 0],
      [-136.8, -273.6, 0],
    ];

    this.P0 = [
      [191.1, -241.5, 0],
      [191.1, 241.5, 0],
      [113.6, 286.2, 0],
      [-304.7, 44.8, 0],
      [-304.7, -44.8, 0],
      [113.1, -286.4, 0],
    ];
  }

  inverseKinematics(pose: Pose) {
    const { x, y, z, roll, pitch, yaw } = pose;
    const zValue = z || this.h0;

    // Convert angles to radians
    const rollRad = (roll * Math.PI) / 180;
    const pitchRad = (pitch * Math.PI) / 180;
    const yawRad = (yaw * Math.PI) / 180;

    // Rotation matrix (ZYX Euler)
    const Rz = [
      [Math.cos(yawRad), -Math.sin(yawRad), 0],
      [Math.sin(yawRad), Math.cos(yawRad), 0],
      [0, 0, 1],
    ];

    const Ry = [
      [Math.cos(pitchRad), 0, Math.sin(pitchRad)],
      [0, 1, 0],
      [-Math.sin(pitchRad), 0, Math.cos(pitchRad)],
    ];

    const Rx = [
      [1, 0, 0],
      [0, Math.cos(rollRad), -Math.sin(rollRad)],
      [0, Math.sin(rollRad), Math.cos(rollRad)],
    ];

    // Combined rotation matrix
    const R = this.matMul(Rz, this.matMul(Ry, Rx));

    // Calculate platform points
    const P = this.P0.map((p) => {
      const rotated = this.matVecMul(R, p);
      return [rotated[0] + x, rotated[1] + y, rotated[2] + zValue];
    });

    // Calculate actuator lengths
    const L = P.map((p, i) => {
      const dx = p[0] - this.B[i][0];
      const dy = p[1] - this.B[i][1];
      const dz = p[2] - this.B[i][2];
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    });

    // Check validity
    const valid = L.every((l) => l >= this.strokeMin && l <= this.strokeMax);

    // Calculate percentages
    const range = this.strokeMax - this.strokeMin;
    const percentages = L.map((l) => Math.max(0, Math.min(100, ((l - this.strokeMin) / range) * 100)));

    return { L, P, valid, percentages };
  }

  private matMul(A: number[][], B: number[][]): number[][] {
    const result: number[][] = [];
    for (let i = 0; i < A.length; i++) {
      result[i] = [];
      for (let j = 0; j < B[0].length; j++) {
        let sum = 0;
        for (let k = 0; k < A[0].length; k++) {
          sum += A[i][k] * B[k][j];
        }
        result[i][j] = sum;
      }
    }
    return result;
  }

  private matVecMul(M: number[][], v: number[]): number[] {
    return M.map((row) => row.reduce((sum, val, i) => sum + val * v[i], 0));
  }
}
