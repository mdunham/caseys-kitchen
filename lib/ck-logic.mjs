/**
 * Pure helpers shared by the app (index.html) and Vitest.
 * Keep browser code in sync with these exports.
 */

export function roundOrderAdj(n) {
  const x = Math.round(Number(n) * 2) / 2;
  return x === 0 ? 0 : x;
}

export function parBasedToOrder(item, onHand) {
  const par = parseFloat(item.par) || 0;
  const oh = onHand != null && Number.isFinite(onHand) ? onHand : 0;
  return Math.ceil(Math.max(0, par - oh));
}

export function fmtManualAdj(adj) {
  const x = roundOrderAdj(parseFloat(adj) || 0);
  if (x === 0) return '0';
  if (x > 0) return '+' + (Number.isInteger(x) ? String(x) : String(x));
  return String(x);
}

/**
 * @param {Array<{id:string,par?:number|string}>} items
 * @param {Record<string, number|string>} lastSessionCounts item_id -> count
 * @param {Record<string, number|string>} manualAdj item_id -> delta
 * @param {string[]} sortOrderIds display order
 */
export function computeOrderLines(items, lastSessionCountsById, manualAdj, sortOrderIds) {
  const adjMap = manualAdj || {};
  const rank = {};
  (sortOrderIds || []).forEach((id, ix) => {
    rank[id] = ix;
  });
  const ord = items
    .map((item) => {
      const onHand = parseFloat(lastSessionCountsById[item.id]) || 0;
      const base = Math.ceil(Math.max(0, (parseFloat(item.par) || 0) - onHand));
      const rawBonus = parseFloat(adjMap[item.id]);
      const orderBonus = Number.isFinite(rawBonus) ? rawBonus : 0;
      const toOrder = Math.max(0, roundOrderAdj(base + orderBonus));
      return { ...item, onHand, toOrder, orderParBase: base, orderBonus };
    })
    .filter((i) => i.toOrder > 0);
  return ord.sort((a, b) => (rank[a.id] ?? 1e9) - (rank[b.id] ?? 1e9));
}

/**
 * Coerce a received quantity for DB (numeric, non-NaN, >= 0).
 * @param {unknown} raw — from input or server
 * @param {unknown} recommendedFallback — when raw is empty/invalid
 */
export function normalizeReceivedQuantity(raw, recommendedFallback) {
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw ?? '').trim());
  if (Number.isFinite(n) && n >= 0) return roundOrderAdj(n);
  const f = parseFloat(String(recommendedFallback ?? '').trim());
  if (Number.isFinite(f) && f >= 0) return roundOrderAdj(f);
  return 0;
}

/**
 * Build map item_id -> received qty for confirm receipt.
 * @param {Record<string, {recommended?: unknown}>} lineItems
 * @param {(itemId: string) => string | null | undefined} getInputValue — trimmed value or empty
 */
export function buildReceivedQuantitiesMap(lineItems, getInputValue) {
  const out = {};
  if (!lineItems || typeof lineItems !== 'object') return out;
  for (const [itemId, data] of Object.entries(lineItems)) {
    const inp = getInputValue(itemId);
    const raw = inp !== undefined && inp !== null && String(inp).trim() !== '' ? inp : data?.recommended;
    out[itemId] = normalizeReceivedQuantity(raw, data?.recommended);
  }
  return out;
}

/** Parse '#/count/walk' style paths */
export function parseRouteHash(hash) {
  const raw = String(hash || '')
    .replace(/^#/, '')
    .replace(/^\//, '');
  const parts = raw.split('/').filter(Boolean);
  const tab = parts[0] || 'count';
  const sub = parts[1] || '';
  return { tab, sub, parts };
}

export function buildRouteHash(tab, opts = {}) {
  const { countView, orderView, historyMode } = opts;
  if (tab === 'count' && historyMode) return '#/count/history';
  if (tab === 'count' && countView === 'walk') return '#/count/walk';
  if (tab === 'order' && orderView === 'walk') return '#/order/walk';
  return '#/' + tab;
}
