import { solvePose, zeroPose, type LegStatus } from '@/lib/kinematics';
import type { PlatformGeometry, Pose, Vec3 } from '@/lib/types';

export interface PoseState {
  pose: Pose;
  top: Vec3[];
  lengths: number[];
  status: LegStatus[];
}

export function poseState(pose: Pose, geom: PlatformGeometry): PoseState {
  const s = solvePose(pose, geom);
  return { pose, top: s.top, lengths: s.lengths, status: s.status };
}

const KEYS = ['x', 'y', 'z', 'roll', 'pitch', 'yaw'] as const;

/** Aproxima `current` de `target` (suaviza a telemetria de ~30 Hz para 60 fps). */
export function approachPose(current: Pose, target: Pose, alpha: number): Pose {
  const out = { ...current };
  for (const k of KEYS) {
    const d = target[k] - current[k];
    out[k] = Math.abs(d) < 1e-4 ? target[k] : current[k] + d * alpha;
  }
  return out;
}

export const LIVE_TIMEOUT_MS = 1500;

/**
 * O que o viewer desenha como plataforma sólida:
 * - auto: medida (telemetria) se houver, senão a prevista; a prevista vira fantasma quando difere
 * - target: só a pose calculada/prevista pela página
 * - live: só a pose medida (WebSocket)
 */
export type ViewerSource = 'auto' | 'target' | 'live';

/** Diferença imperceptível no modelo: < 1 mm e < 0,3° em todos os eixos. */
export function posesClose(a: Pose, b: Pose): boolean {
  return (
    Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1 && Math.abs(a.z - b.z) < 1 &&
    Math.abs(a.roll - b.roll) < 0.3 && Math.abs(a.pitch - b.pitch) < 0.3 && Math.abs(a.yaw - b.yaw) < 0.3
  );
}

/**
 * Estado mutável da cena de um viewer (fora do React: atualizado a 30-60 Hz).
 * A página escreve os alvos; `step()` roda uma vez por frame e os componentes
 * 3D leem `solid`/`ghost` em useFrame.
 */
export class SceneStore {
  geometry: PlatformGeometry;
  solid: PoseState;
  ghost: PoseState | null = null;
  private live: Pose | null = null;
  private liveAt = 0;
  private target: Pose | null = null;
  private readonly reducedMotion: boolean;
  private readonly source: ViewerSource;

  constructor(geometry: PlatformGeometry, reducedMotion: boolean, source: ViewerSource = 'auto') {
    this.geometry = geometry;
    this.solid = poseState(zeroPose(geometry.home_z), geometry);
    this.reducedMotion = reducedMotion;
    this.source = source;
  }

  setGeometry(geometry: PlatformGeometry) {
    this.geometry = geometry;
  }

  setTarget(pose: Pose | null) {
    this.target = pose;
  }

  setLive(pose: Pose, now = performance.now()) {
    this.live = pose;
    this.liveAt = now;
  }

  /** Pose medida recente (ou null se a telemetria parou). */
  freshLive(now = performance.now()): Pose | null {
    return this.live && now - this.liveAt < LIVE_TIMEOUT_MS ? this.live : null;
  }

  currentTarget(): Pose | null {
    return this.target;
  }

  step(dt: number, now = performance.now()) {
    const live = this.freshLive(now);
    const home = zeroPose(this.geometry.home_z);
    let solidTarget: Pose;
    let ghostTarget: Pose | null = null;
    if (this.source === 'target') {
      solidTarget = this.target ?? home;
    } else if (this.source === 'live') {
      solidTarget = live ?? this.solid.pose; // sem telemetria, fica parada onde estava
    } else {
      solidTarget = live ?? this.target ?? home;
      // Fantasma só quando a pose comandada difere da medida (senão sobrepõe o tampo)
      ghostTarget = live && this.target && !posesClose(live, this.target) ? this.target : null;
    }
    const alpha = this.reducedMotion ? 1 : Math.min(1, dt * 14);
    this.solid = poseState(approachPose(this.solid.pose, solidTarget, alpha), this.geometry);
    this.ghost = ghostTarget
      ? poseState(approachPose(this.ghost?.pose ?? ghostTarget, ghostTarget, alpha), this.geometry)
      : null;
  }
}
