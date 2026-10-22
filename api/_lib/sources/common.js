/** Shared snapshot shapes for every connector. */

export const SNAPSHOT_VERSION = 1;

/**
 * A snapshot is what one source reports:
 *   source, label, status ('ok' | 'error' | 'not_connected'), as_of, checked_at,
 *   error (plain-English), needs ([{who, what}]), notes[], data
 */
export function okSnapshot(source, label, data, extra = {}) {
  const now = new Date().toISOString();
  return { v: SNAPSHOT_VERSION, source, label, status: 'ok', as_of: now, checked_at: now, error: null, needs: [], notes: [], data, ...extra };
}

export function errorSnapshot(source, label, error, needs = [], extra = {}) {
  return { v: SNAPSHOT_VERSION, source, label, status: 'error', as_of: null, checked_at: new Date().toISOString(), error, needs, notes: [], data: null, ...extra };
}

export function notConnected(source, label, needs, extra = {}) {
  return { v: SNAPSHOT_VERSION, source, label, status: 'not_connected', as_of: null, checked_at: new Date().toISOString(), error: null, needs, notes: [], data: null, ...extra };
}

export const missingEnv = (env, names) => names.filter((n) => !String(env[n] || '').trim());

/**
 * Cursor pagination that follows the API to the end instead of stopping at the
 * first page (an older version of this dashboard capped at 100).
 *   fetchPage(cursor|null) -> response body
 *   items(body)            -> array of records on that page
 *   next(body, batch)      -> cursor for the following page, or null when done
 * Stops when a page is empty, adds nothing new, repeats the cursor, or hits `max`.
 */
export async function paginateCursor({ fetchPage, items, next, max = 400 }) {
  const seen = new Set();
  const out = [];
  let cursor = null;
  let total = null;
  let pages = 0;
  let capped = false;
  for (;;) {
    if (pages >= max) {
      capped = true;
      break;
    }
    const body = await fetchPage(cursor);
    pages++;
    const batch = items(body) || [];
    let added = 0;
    for (const it of batch) {
      const id = it.id ?? JSON.stringify(it);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(it);
      added++;
    }
    if (body?.meta?.total != null) total = Number(body.meta.total);
    const n = next(body, batch);
    if (!batch.length || !added || !n) break;
    if (cursor && JSON.stringify(n) === JSON.stringify(cursor)) break;
    cursor = n;
  }
  return { items: out, total, pages, capped };
}
