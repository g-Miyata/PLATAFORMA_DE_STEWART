import { cellNumber, parseCsv } from '@/lib/csv';

export interface TrialData {
  t: number[];
  /** setpoints e medidas em mm de curso (comprimento − stroke_min) */
  sp: number[][];
  y: number[][];
}

/**
 * Lê o CSV exportado em Rotinas ("Comandado × medido"): colunas t_s,
 * L1_cmd_mm…L6_cmd_mm e L1_real_mm…L6_real_mm (comprimentos absolutos).
 * Linhas sem medida são descartadas; no máximo `maxRows` (reamostra se passar).
 */
export function parseRoutineCsv(text: string, strokeMin: number, maxRows = 6000): TrialData {
  const { header, rows } = parseCsv(text);
  const col = (name: string) => header.indexOf(name);
  const it = col('t_s');
  const cmd = [1, 2, 3, 4, 5, 6].map((p) => col(`L${p}_cmd_mm`));
  const real = [1, 2, 3, 4, 5, 6].map((p) => col(`L${p}_real_mm`));
  if (it < 0 || cmd.some((c) => c < 0) || real.some((c) => c < 0)) {
    throw new Error('CSV sem as colunas t_s, L1..L6_cmd_mm e L1..L6_real_mm (exporte em Rotinas → Comandado × medido).');
  }
  const out: TrialData = { t: [], sp: [], y: [] };
  let lastT = -Infinity;
  for (const r of rows) {
    const t = cellNumber(r[it]);
    const sp = cmd.map((c) => cellNumber(r[c]) - strokeMin);
    const y = real.map((c) => cellNumber(r[c]) - strokeMin);
    // o gráfico recomeça a cada rotina: fica só com o primeiro trecho contínuo
    if (!Number.isFinite(t) || t <= lastT) {
      if (out.t.length && t < lastT) break;
      continue;
    }
    if ([...sp, ...y].some((v) => !Number.isFinite(v))) continue;
    out.t.push(t);
    out.sp.push(sp);
    out.y.push(y);
    lastT = t;
  }
  if (out.t.length < 10) throw new Error('Poucas linhas com medida no CSV.');
  if (out.t.length > maxRows) {
    const stride = Math.ceil(out.t.length / maxRows);
    const keep = (_: unknown, i: number) => i % stride === 0;
    return { t: out.t.filter(keep), sp: out.sp.filter(keep), y: out.y.filter(keep) };
  }
  return out;
}
