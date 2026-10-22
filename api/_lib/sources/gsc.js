/**
 * Google Search Console connector (searchAnalytics), service-account sign-in.
 *
 * Env: GOOGLE_SA_JSON, GSC_SITE_URL (e.g. "https://killuahome.com/" or
 * "sc-domain:killuahome.com"; exactly as shown in Search Console)
 */
import { fetchJson, addDays, pacificDay, round, str } from '../util.js';
import { accessToken, parseServiceAccount } from '../google.js';
import { errorSnapshot, missingEnv, notConnected, okSnapshot } from './common.js';

export const id = 'gsc';
export const label = 'Google Search Console';
const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

const stats = (r) => ({ clicks: r.clicks || 0, impressions: r.impressions || 0, ctr: round((r.ctr || 0) * 100), position: round(r.position || 0, 1) });

export async function run(ctx) {
  const { env = process.env, fetchImpl = fetch } = ctx;
  const missing = missingEnv(env, ['GOOGLE_SA_JSON', 'GSC_SITE_URL']);
  if (missing.length) {
    return notConnected(id, label, [
      { who: 'Blaine', what: `Create a Google service account, add its email as a user on the Search Console property, then add ${missing.join(' and ')} in Vercel.` },
      { who: 'Taj', what: 'If the site is not yet in Search Console, add and verify it (Revelation can do this if given access).' },
    ]);
  }
  const sa = parseServiceAccount(env);
  if (!sa) return errorSnapshot(id, label, 'GOOGLE_SA_JSON is not a valid service-account key.', [{ who: 'Blaine', what: 'Paste the full JSON key file contents into GOOGLE_SA_JSON in Vercel.' }]);
  try {
    const token = await accessToken(sa, SCOPE, fetchImpl);
    const site = env.GSC_SITE_URL.trim();
    const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`;
    const headers = { Authorization: `Bearer ${token}`, 'content-type': 'application/json' };
    const end = addDays(pacificDay(new Date()), -2); // Search Console runs about two days behind
    const start = addDays(end, -27);
    const q = (body) => fetchJson(url, { method: 'POST', headers, body: JSON.stringify({ startDate: start, endDate: end, ...body }) }, { fetchImpl });
    const [total, daily, queries, pages] = await Promise.all([
      q({}),
      q({ dimensions: ['date'], rowLimit: 60 }),
      q({ dimensions: ['query'], rowLimit: 25 }),
      q({ dimensions: ['page'], rowLimit: 25 }),
    ]);
    const t = total.rows?.[0] || { clicks: 0, impressions: 0, ctr: 0, position: 0 };
    const data = {
      site,
      start,
      end,
      totals: { clicks: t.clicks || 0, impressions: t.impressions || 0, ctr: round((t.ctr || 0) * 100), position: round(t.position || 0, 1) },
      daily: (daily.rows || []).map((r) => ({ date: r.keys[0], ...stats(r) })).sort((a, b) => a.date.localeCompare(b.date)),
      queries: (queries.rows || []).map((r) => ({ query: str(r.keys[0], 200), ...stats(r) })),
      pages: (pages.rows || []).map((r) => ({ page: str(r.keys[0], 300), ...stats(r) })),
    };
    const notes = [];
    if (!data.daily.length) notes.push('Search Console has not reported any data for this site yet. New sites take a few days.');
    return okSnapshot(id, label, data, { notes });
  } catch (e) {
    if (e.status === 403 || e.status === 404) {
      return errorSnapshot(id, label, 'Search Console will not show this site to the dashboard.', [{ who: 'Blaine', what: `In Search Console, open Settings, Users and permissions, and add ${sa.email} as a user (Restricted is enough). Check GSC_SITE_URL matches the property exactly.` }]);
    }
    if (e.status === 400 || e.status === 401) {
      return errorSnapshot(id, label, 'Google rejected the service-account sign-in or the site address.', [{ who: 'Blaine', what: 'Check GOOGLE_SA_JSON and GSC_SITE_URL.' }]);
    }
    return errorSnapshot(id, label, `Search Console could not be read: ${str(e.message, 200)}`, [{ who: 'Revelation', what: 'Try Refresh now later.' }]);
  }
}
