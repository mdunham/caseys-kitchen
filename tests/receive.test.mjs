import { describe, it, expect } from 'vitest';
import { normalizeReceivedQuantity, buildReceivedQuantitiesMap } from '../lib/ck-logic.mjs';

describe('Receive / receipt quantities', () => {
  it('treats null and undefined recommended as invalid for raw', () => {
    expect(normalizeReceivedQuantity(undefined, null)).toBe(0);
    expect(normalizeReceivedQuantity('2', null)).toBe(2);
  });

  it('maps every order line with sane defaults', () => {
    const lines = {
      i1: { recommended: null },
      i2: { recommended: 'bad' },
      i3: { recommended: 4 },
    };
    const m = buildReceivedQuantitiesMap(lines, () => '');
    expect(m.i1).toBe(0);
    expect(m.i2).toBe(0);
    expect(m.i3).toBe(4);
  });

  it('uses typed input when present', () => {
    const m = buildReceivedQuantitiesMap({ a: { recommended: 9 } }, (id) => (id === 'a' ? '3.5' : ''));
    expect(m.a).toBe(3.5);
  });
});
