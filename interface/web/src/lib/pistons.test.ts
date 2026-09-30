import { describe, expect, it } from 'vitest';
import { fmt } from './pistons';

describe('fmt', () => {
  it('usa vírgula decimal e unidade', () => {
    expect(fmt(11.44, 1, 'mm/s')).toBe('11,4 mm/s');
    expect(fmt(-3, 1, '°')).toBe('-3,0°');
    expect(fmt(1234.5, 1)).toBe('1.234,5');
    expect(fmt(null)).toBe('—');
    expect(fmt(-0.01, 1)).toBe('0,0');
  });
});
