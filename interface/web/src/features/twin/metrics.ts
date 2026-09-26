// Comparação real × simulado de cada pistão: erro RMS, erro máximo e atraso.

export interface PistonMetrics {
  rms: number;
  max: number;
  /** atraso do real em relação ao simulado (s); positivo = o real chega depois */
  lag: number;
}

/**
 * Atraso por correlação cruzada das velocidades (derivadas), para não confundir
 * atraso com diferença de posição constante. Procura de −maxLag a +maxLag.
 */
export function estimateLag(real: readonly number[], sim: readonly number[], dt: number, maxLagS = 1.5): number {
  const n = Math.min(real.length, sim.length);
  if (n < 10 || dt <= 0) return 0;
  const dr = Array.from({ length: n - 1 }, (_, i) => real[i + 1] - real[i]);
  const ds = Array.from({ length: n - 1 }, (_, i) => sim[i + 1] - sim[i]);
  const maxK = Math.min(Math.round(maxLagS / dt), n - 2);
  let best = 0;
  let bestScore = -Infinity;
  for (let k = -maxK; k <= maxK; k++) {
    let s = 0;
    for (let i = 0; i < dr.length; i++) {
      const j = i - k;
      if (j >= 0 && j < ds.length) s += dr[i] * ds[j];
    }
    if (s > bestScore) {
      bestScore = s;
      best = k;
    }
  }
  return best * dt;
}

/** Métricas para séries alinhadas (real[i][p], sim[i][p]) amostradas a cada dt. */
export function compare(real: readonly number[][], sim: readonly number[][], dt: number): PistonMetrics[] {
  return Array.from({ length: 6 }, (_, p) => {
    const r = real.map((row) => row[p]);
    const s = sim.map((row) => row[p]);
    let sq = 0;
    let max = 0;
    let n = 0;
    for (let i = 0; i < Math.min(r.length, s.length); i++) {
      const e = r[i] - s[i];
      if (!Number.isFinite(e)) continue;
      sq += e * e;
      max = Math.max(max, Math.abs(e));
      n++;
    }
    return { rms: n ? Math.sqrt(sq / n) : NaN, max, lag: estimateLag(r, s, dt) };
  });
}
