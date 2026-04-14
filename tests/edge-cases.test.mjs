import { describe, it, expect } from 'vitest';
import {
  LOAD_CAP_SESSIONS,
  LOAD_CAP_ORDERS,
  roundOrderAdj,
  computeOrderLines,
  normalizeReceivedQuantity,
  buildReceivedQuantitiesMap,
  parseRouteHash,
  denormalizeSessions,
  denormalizeOrders,
} from '../lib/ck-logic.mjs';

describe('load caps (documented stability contract)', () => {
  it('keeps session and order windows in a sensible range', () => {
    expect(LOAD_CAP_SESSIONS).toBeGreaterThanOrEqual(100);
    expect(LOAD_CAP_SESSIONS).toBeLessThanOrEqual(2000);
    expect(LOAD_CAP_ORDERS).toBeGreaterThanOrEqual(50);
    expect(LOAD_CAP_ORDERS).toBeLessThanOrEqual(1000);
  });
});

describe('denormalizeSessions (orphan rows + ordering)', () => {
  it('ignores count rows for unknown sessions (stale export or partial load)', () => {
    const sessions = [
      { id: 's1', counted_at: '2026-01-02T12:00:00Z' },
      { id: 's2', counted_at: '2026-01-01T12:00:00Z' },
    ];
    const counts = [
      { session_id: 's1', item_id: 'a', count: 3 },
      { session_id: 'ghost', item_id: 'a', count: 99 },
    ];
    const out = denormalizeSessions(sessions, counts);
    expect(out.map((x) => x.id)).toEqual(['s1', 's2']);
    expect(out[0].counts.a).toBe(3);
    expect(out[1].counts).toEqual({});
  });

  it('sorts by counted_at descending even if input order is wrong', () => {
    const sessions = [
      { id: 'old', counted_at: '2025-06-01T00:00:00Z' },
      { id: 'new', counted_at: '2026-03-01T00:00:00Z' },
    ];
    const out = denormalizeSessions(sessions, []);
    expect(out[0].id).toBe('new');
    expect(out[1].id).toBe('old');
  });

  it('handles null/undefined inputs without throwing', () => {
    expect(denormalizeSessions(null, null)).toEqual([]);
    expect(denormalizeSessions([], undefined)).toEqual([]);
  });
});

describe('denormalizeOrders (line items + NaN coercions)', () => {
  it('skips order_items whose order was not in the batch', () => {
    const orders = [{ id: 'o1', ordered_at: '2026-01-01T00:00:00Z', status: 'pending' }];
    const items = [
      { order_id: 'o1', item_id: 'i1', recommended: 2, received: null },
      { order_id: 'missing', item_id: 'x', recommended: 1, received: null },
    ];
    const out = denormalizeOrders(orders, items);
    expect(out).toHaveLength(1);
    expect(Object.keys(out[0].items)).toEqual(['i1']);
    expect(out[0].items.i1).toEqual({ recommended: 2, received: null });
  });

  it('treats non-finite recommended as 0 and leaves received null when empty', () => {
    const orders = [{ id: 'o1', ordered_at: '2026-01-01T00:00:00Z' }];
    const items = [
      { order_id: 'o1', item_id: 'a', recommended: 'nope', received: '' },
      { order_id: 'o1', item_id: 'b', recommended: 5, received: '2.5' },
    ];
    const out = denormalizeOrders(orders, items);
    expect(out[0].items.a).toEqual({ recommended: 0, received: null });
    expect(out[0].items.b).toEqual({ recommended: 5, received: 2.5 });
  });
});

describe('computeOrderLines — predicted bad data from DB or local edits', () => {
  const items = [{ id: 'x', par: 10, name: 'X' }];

  it('treats NaN and Infinity manual adjustments as zero bonus', () => {
    const base = computeOrderLines(items, { x: 0 }, {}, ['x'])[0];
    expect(base.toOrder).toBe(10);
    const nanB = computeOrderLines(items, { x: 0 }, { x: NaN }, ['x'])[0];
    expect(nanB.orderBonus).toBe(0);
    expect(nanB.toOrder).toBe(10);
    const infB = computeOrderLines(items, { x: 0 }, { x: Infinity }, ['x'])[0];
    expect(infB.orderBonus).toBe(0);
  });

  it('clamps to zero when large negative bonus would flip sign', () => {
    const lines = computeOrderLines(items, { x: 5 }, { x: -20 }, ['x']);
    expect(lines.length).toBe(0);
  });

  it('treats non-numeric last counts as zero on-hand', () => {
    const lines = computeOrderLines(items, { x: 'garbage' }, {}, ['x']);
    expect(lines[0].onHand).toBe(0);
    expect(lines[0].toOrder).toBe(10);
  });
});

describe('normalizeReceivedQuantity — hostile or mistaken input', () => {
  it('rejects negative raw values and falls back', () => {
    expect(normalizeReceivedQuantity('-3', 4)).toBe(4);
    expect(normalizeReceivedQuantity(-1, null)).toBe(0);
  });

  it('rejects negative fallback', () => {
    expect(normalizeReceivedQuantity('x', -2)).toBe(0);
  });
});

describe('buildReceivedQuantitiesMap — partial DOM / sparse maps', () => {
  it('still emits keys when getInputValue returns undefined (uses recommended)', () => {
    const m = buildReceivedQuantitiesMap({ a: { recommended: 7 } }, () => undefined);
    expect(m.a).toBe(7);
  });
});

describe('parseRouteHash — extra path segments', () => {
  it('preserves extra parts for forward compatibility', () => {
    const r = parseRouteHash('#/count/walk/extra/segment');
    expect(r.tab).toBe('count');
    expect(r.sub).toBe('walk');
    expect(r.parts).toEqual(['count', 'walk', 'extra', 'segment']);
  });
});

describe('denormalizeSessions at scale (memory-safe shape)', () => {
  it('merges many count rows; newest session is first after sort', () => {
    const n = 300;
    const sessions = Array.from({ length: n }, (_, i) => ({
      id: `s${i}`,
      counted_at: new Date(2020 + i, 5, 15).toISOString(),
    }));
    const counts = [];
    for (let i = 0; i < n; i++) {
      counts.push({ session_id: `s${i}`, item_id: 'sku', count: i % 7 });
    }
    const out = denormalizeSessions(sessions, counts);
    expect(out).toHaveLength(n);
    expect(out[0].id).toBe(`s${n - 1}`);
    expect(out[0].counts.sku).toBe((n - 1) % 7);
  });
});
