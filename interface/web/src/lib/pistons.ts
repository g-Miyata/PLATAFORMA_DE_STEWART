/** Cor de cada pistão: igual nos gráficos, nos cartões e no modelo 3D. */
export const PISTON_COLORS = ['#3b82f6', '#a855f7', '#ec4899', '#f97316', '#14b8a6', '#6366f1'] as const;

export const PISTONS = [1, 2, 3, 4, 5, 6] as const;

const formatters = new Map<number, Intl.NumberFormat>();

/** Número em pt-BR (vírgula decimal) com unidade; "—" quando não há valor. */
export const fmt = (v: number | null | undefined, digits = 1, unit = '') => {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  let f = formatters.get(digits);
  if (!f) {
    f = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    formatters.set(digits, f);
  }
  // arredonda antes de formatar para não mostrar -0,0
  const n = Math.abs(v) < 0.5 * 10 ** -digits ? 0 : v;
  return `${f.format(n)}${unit ? (unit === '°' ? unit : ` ${unit}`) : ''}`;
};
