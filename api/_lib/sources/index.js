/**
 * Registry of the pull connectors and the refresh that runs them all. Each
 * connector returns one snapshot; a failing connector keeps the last good data
 * (marked stale) so one bad morning does not blank the dashboard.
 */
import * as ghl from './ghl.js';
import * as meta from './meta.js';
import * as googleAds from './googleAds.js';
import * as gsc from './gsc.js';
import { readDoc, writeDoc, logActivity } from '../store.js';

export const CONNECTORS = [ghl, meta, googleAds, gsc];
export const PULL_IDS = CONNECTORS.map((c) => c.id);

export async function refreshOne(id, ctx = {}) {
  const env = ctx.env || process.env;
  const mod = CONNECTORS.find((c) => c.id === id);
  if (!mod) throw new Error(`unknown source ${id}`);
  let snap;
  try {
    snap = await mod.run({ ...ctx, env });
  } catch (e) {
    snap = { v: 1, source: mod.id, label: mod.label, status: 'error', as_of: null, checked_at: new Date().toISOString(), error: `Unexpected problem: ${String(e?.message || e).slice(0, 200)}`, needs: [{ who: 'Revelation', what: 'Tell Blaine; this one needs a look.' }], notes: [], data: null };
  }
  const prev = await readDoc(`snapshots/${mod.id}`, null, env).catch(() => null);
  if (snap.status === 'error' && prev?.data) {
    snap = { ...snap, data: prev.data, as_of: prev.as_of, stale: true, notes: [...(snap.notes || []), 'Showing the last good numbers.'] };
  }
  await writeDoc(`snapshots/${mod.id}`, snap, env);
  return snap;
}

export async function refreshAll(ctx = {}) {
  const started = Date.now();
  const results = await Promise.all(PULL_IDS.map(async (id) => {
    const t0 = Date.now();
    const s = await refreshOne(id, ctx);
    return { source: id, status: s.status, error: s.error, ms: Date.now() - t0 };
  }));
  await logActivity({ by: ctx.by || 'schedule', action: 'refresh', detail: results.map((r) => `${r.source}: ${r.status}`).join(', ') }, ctx.env || process.env);
  return { results, ms: Date.now() - started };
}

export async function loadSnapshots(env = process.env) {
  const out = {};
  await Promise.all(PULL_IDS.map(async (id) => {
    out[id] = await readDoc(`snapshots/${id}`, null, env).catch(() => null);
  }));
  return out;
}
