// Lista do modo quiosque: rotinas prontas com amplitude reduzida e gravações
// curtas, todas conferidas para ficarem abaixo da velocidade segura.
import { EXAMPLES, type Recording } from '@/features/recorder/library';
import { analyzeTrajectory, sampleTrajectory } from '@/features/recorder/trajectory';
import { analyzeRoutine, buildRequest, PRESETS } from '@/features/routines/routines';
import type { MotionRequest, PlatformGeometry, TrajectorySample } from '@/lib/types';

/** abaixo dos ~12 mm/s que os atuadores sustentam, com folga */
export const KIOSK_MAX_SPEED = 10;
export const KIOSK_ITEM_S = 30;
export const KIOSK_REST_S = 5;
export const KIOSK_AMPLITUDE = 0.5;
const MAX_RECORDING_S = 120;

export type KioskItem =
  | { kind: 'routine'; name: string; req: MotionRequest; peak: number }
  | { kind: 'trajectory'; name: string; samples: TrajectorySample[]; peak: number };

const AMPLITUDE_PARAMS = new Set(['amp', 'ax', 'ay', 'z_amp_mm']);

export function buildPlaylist(geom: PlatformGeometry, recordings: readonly Recording[] = []): KioskItem[] {
  const items: KioskItem[] = [];
  for (const preset of PRESETS) {
    const values: Record<string, number> = {};
    for (const p of preset.params) values[p.name] = AMPLITUDE_PARAMS.has(p.name) ? p.value * KIOSK_AMPLITUDE : p.value;
    values.duration_s = KIOSK_ITEM_S;
    let req = buildRequest(preset, values);
    let a = analyzeRoutine(req, geom);
    // a velocidade escala com a frequência: desacelera até caber no limite
    if (a.peakSpeed > KIOSK_MAX_SPEED) {
      req = { ...req, hz: Math.floor(((req.hz * KIOSK_MAX_SPEED) / a.peakSpeed) * 0.95 * 100) / 100 };
      a = analyzeRoutine(req, geom);
    }
    if (a.withinStroke && a.peakSpeed <= KIOSK_MAX_SPEED && req.hz > 0) items.push({ kind: 'routine', name: preset.title, req, peak: a.peakSpeed });
  }
  for (const rec of [...EXAMPLES, ...recordings]) {
    const samples = sampleTrajectory(rec.keys, rec.interp);
    const duration = samples[samples.length - 1].t;
    if (duration > MAX_RECORDING_S) continue;
    const a = analyzeTrajectory(samples, geom, rec.speed);
    if (a.valid && a.peakSpeed <= KIOSK_MAX_SPEED) items.push({ kind: 'trajectory', name: rec.name, samples, peak: a.peakSpeed });
  }
  return items;
}
