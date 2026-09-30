/** Gera CSV com ";" (padrão do Excel em pt-BR, igual ao firmware) e baixa o arquivo. */
export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'number' ? (Number.isFinite(v) ? String(v).replace('.', ',') : '') : v;
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return ['sep=;', header.map(cell).join(';'), ...rows.map((r) => r.map(cell).join(';'))].join('\r\n');
}

export function downloadText(filename: string, text: string, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob(['﻿', text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function timestampName(prefix: string) {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${prefix}_${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}.csv`;
}

/** Lê um CSV gerado por toCsv (ou pelo Excel pt-BR): ";" e vírgula decimal; ignora a linha "sep=;". */
export function parseCsv(text: string): { header: string[]; rows: string[][] } {
  // tira o BOM (U+FEFF) que o downloadText põe no começo
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const lines = clean.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines[0]?.toLowerCase().startsWith('sep=')) lines.shift();
  const split = (line: string) => {
    const out: string[] = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quoted) {
        if (c === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (c === '"') quoted = false;
        else cur += c;
      } else if (c === '"') quoted = true;
      else if (c === ';') {
        out.push(cur);
        cur = '';
      } else cur += c;
    }
    out.push(cur);
    return out;
  };
  const [head, ...body] = lines.map(split);
  return { header: head ?? [], rows: body };
}

/** Número de uma célula com vírgula decimal ("12,5" → 12.5); vazio → NaN. */
export const cellNumber = (s: string | undefined) => (s === undefined || s.trim() === '' ? NaN : Number(s.replace(',', '.')));
