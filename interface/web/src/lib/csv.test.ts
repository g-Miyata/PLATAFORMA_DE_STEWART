import { describe, expect, it } from 'vitest';
import { toCsv } from './csv';

describe('toCsv', () => {
  it('usa ; e vírgula decimal, com dica sep= para o Excel', () => {
    const csv = toCsv(['t', 'y'], [[0.5, 12.25], [1, null]]);
    expect(csv.split('\r\n')).toEqual(['sep=;', 't;y', '0,5;12,25', '1;']);
  });

  it('escapa campos com ponto e vírgula ou aspas', () => {
    expect(toCsv(['cmd'], [['spmm6x=1;2'], ['diz "oi"']]).split('\r\n').slice(2)).toEqual(['"spmm6x=1;2"', '"diz ""oi"""']);
  });
});
