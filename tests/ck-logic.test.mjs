import { describe, it, expect } from 'vitest';
import {
  roundOrderAdj,
  parBasedToOrder,
  fmtManualAdj,
  computeOrderLines,
  normalizeReceivedQuantity,
  buildReceivedQuantitiesMap,
  parseRouteHash,
  buildRouteHash,
} from '../lib/ck-logic.mjs';

describe('roundOrderAdj', () => {
  it('rounds to half steps', () => {
    expect(roundOrderAdj(1.24)).toBe(1);
    expect(roundOrderAdj(1.25)).toBe(1.5);
    expect(roundOrderAdj(-0.25)).toBe(0);
  });
});

describe('parBasedToOrder', () => {
  it('ceil shortfall to whole units', () => {
    expect(parBasedToOrder({ par: 5 }, 3)).toBe(2);
    expect(parBasedToOrder({ par: 5 }, 5)).toBe(0);
    expect(parBasedToOrder({ par: 5 }, 5.5)).toBe(0);
  });

  it('supports case-pack ordering and reorder trigger', () => {
    // Example: count by box, order by case (8 boxes per case), par=1 case
    expect(parBasedToOrder({ par: 1, order_pack_qty: 8, reorder_trigger: 4 }, 3.9)).toBe(1);
    expect(parBasedToOrder({ par: 1, order_pack_qty: 8, reorder_trigger: 4 }, 4)).toBe(1);
    expect(parBasedToOrder({ par: 1, order_pack_qty: 8, reorder_trigger: 4 }, 4.1)).toBe(0);
  });
});

describe('fmtManualAdj', () => {
  it('formats sign', () => {
    expect(fmtManualAdj(0)).toBe('0');
    expect(fmtManualAdj(2)).toBe('+2');
    expect(fmtManualAdj(-1)).toBe('-1');
  });
});

describe('computeOrderLines', () => {
  const items = [
    { id: 'a', par: 4, name: 'A' },
    { id: 'b', par: 2, name: 'B' },
  ];
  const counts = { a: 3, b: 1 };

  it('orders by sort ids and applies manual bonus', () => {
    const lines = computeOrderLines(items, counts, { a: 1 }, ['b', 'a']);
    expect(lines.map((x) => x.id)).toEqual(['b', 'a']);
    const a = lines.find((x) => x.id === 'a');
    expect(a.toOrder).toBe(2);
    expect(a.orderParBase).toBe(1);
    expect(a.orderBonus).toBe(1);
  });

  it('drops zero lines', () => {
    const lines = computeOrderLines(items, { a: 4, b: 2 }, {}, ['a', 'b']);
    expect(lines.length).toBe(0);
  });

  it('returns order metadata for pack/unit-aware ordering', () => {
    const lines = computeOrderLines(
      [{ id: 'g', par: 8, name: 'Gloves', unit: 'box', order_pack_qty: 8, order_unit: 'case', reorder_trigger: 4 }],
      { g: 3 },
      {},
      ['g']
    );
    expect(lines).toHaveLength(1);
    expect(lines[0].toOrder).toBe(1);
    expect(lines[0].orderUnit).toBe('case');
    expect(lines[0].orderPackQty).toBe(8);
    expect(lines[0].onHandCountUnit).toBe(3);
    expect(lines[0].parCountUnit).toBe(8);
    expect(lines[0].reorderTriggerCountUnit).toBe(4);
  });
});

describe('normalizeReceivedQuantity', () => {
  it('uses fallback for garbage input', () => {
    expect(normalizeReceivedQuantity('abc', 3)).toBe(3);
    expect(normalizeReceivedQuantity('', 2.5)).toBe(2.5);
    expect(normalizeReceivedQuantity(null, null)).toBe(0);
  });
  it('accepts valid numbers', () => {
    expect(normalizeReceivedQuantity('4', 1)).toBe(4);
    expect(normalizeReceivedQuantity(1.5, 9)).toBe(1.5);
  });
});

describe('buildReceivedQuantitiesMap', () => {
  it('fills every line from inputs or recommended', () => {
    const lineItems = { x: { recommended: 5 }, y: { recommended: 2 } };
    const getInput = (id) => (id === 'x' ? '6' : '');
    const m = buildReceivedQuantitiesMap(lineItems, getInput);
    expect(m.x).toBe(6);
    expect(m.y).toBe(2);
  });
});

describe('routing', () => {
  it('parseRouteHash', () => {
    expect(parseRouteHash('#/order/walk').tab).toBe('order');
    expect(parseRouteHash('#/order/walk').sub).toBe('walk');
    expect(parseRouteHash('').tab).toBe('count');
  });
  it('buildRouteHash', () => {
    expect(buildRouteHash('receive', {})).toBe('#/receive');
    expect(buildRouteHash('count', { countView: 'walk', historyMode: false })).toBe('#/count/walk');
    expect(buildRouteHash('count', { historyMode: true })).toBe('#/count/history');
  });
});
