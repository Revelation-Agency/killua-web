/**
 * Google Ads connector. There is no Google Ads developer token, so the ads
 * account runs a small Google Ads Script (scripts/google-ads-to-sheet.js) that
 * writes one row per campaign per day into a Google Sheet. This connector reads
 * that sheet with a service account.
 *
 * Env: GOOGLE_SA_JSON, GOOGLE_ADS_SHEET_ID, optional GOOGLE_ADS_SHEET_TAB (default "Daily")
 * Sheet columns (row 1 is headers): date, campaign, type, status, cost, impressions,
 *   clicks, conversions, conv_value
 */
import { fetchJson, num, pacificDay, addDays, round, str } from '../util.js';
import { accessToken, parseServiceAccount } from '../google.js';
import { errorSnapshot, missingEnv, notConnected, okSnapshot } from './common.js';

export const id = 'google_ads';
export const label = 'Google Ads';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';

/** Which dashboard card a campaign type belongs on. */
export function channelGroup(type) {
  const t = String(type || '').toUpperCase().replace(/[\s-]/g, '_');
  if (/PERFORMANCE_MAX|PMAX/.test(t)) return 'pmax';
  if (/VIDEO|YOUTUBE|DEMAND_GEN|DISCOVERY/.test(t)) return 'youtube';
  if (/SEARCH/.test(t)) return 'search';
  return 'other';
}

const HEADERS = { date: 'date', campaign: 'campaign', type: 'type', status: 'status', cost: 'cost', impressions: 'impressions', clicks: 'clicks', conversions: 'conversions', conv_value: 'conv_value' };

export function parseRows(values) {
  if (!Array.isArray(values) || values.length < 2) return [];
  const head = values[0].map((h) => String(h).trim().toLowerCase().replace(/[\s.]+/g, '_'));
  const idx = {};
  for (const [k, name] of Object.entries(HEADERS)) idx[k] = head.indexOf(name);
  // tolerate a few header spellings
  if (idx.conv_value < 0) idx.conv_value = head.findIndex((h) => /conv.*value|conversion_value/.test(h));
  if (idx.type < 0) idx.type = head.findIndex((h) => /channel|campaign_type/.test(h));
  if (idx.date < 0 || idx.campaign < 0 || idx.cost < 0) throw new Error('The sheet is missing the date, campaign or cost column.');
  const cell = (r, k) => (idx[k] >= 0 ? r[idx[k]] : '');
  const rows = [];
  for (const r of values.slice(1)) {
    let rawDate = cell(r, 'date');
    // a Sheets date arrives as a day count since 1899-12-30 when the cell is formatted as a date
    if (typeof rawDate === 'number' && rawDate > 30000) rawDate = new Date(Date.UTC(1899, 11, 30) + rawDate * 86400000).toISOString();
    const date = String(rawDate).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const type = str(cell(r, 'type'), 40);
    rows.push({
      date,
      campaign: str(cell(r, 'campaign'), 160),
      type,
      group: channelGroup(type),
      status: str(cell(r, 'status'), 20),
      cost: round(num(cell(r, 'cost'))),
      impressions: num(cell(r, 'impressions')),
      clicks: num(cell(r, 'clicks')),
      conversions: round(num(cell(r, 'conversions'))),
      conv_value: round(num(cell(r, 'conv_value'))),
    });
  }
  return rows;
}

export function summarize(rows, today = pacificDay(new Date())) {
  const sum = (list) => {
    const t = list.reduce((a, r) => ({ cost: a.cost + r.cost, impressions: a.impressions + r.impressions, clicks: a.clicks + r.clicks, conversions: a.conversions + r.conversions, conv_value: a.conv_value + r.conv_value }), { cost: 0, impressions: 0, clicks: 0, conversions: 0, conv_value: 0 });
    return { ...t, cost: round(t.cost), conversions: round(t.conversions), conv_value: round(t.conv_value), ctr: t.impressions ? round((t.clicks / t.impressions) * 100) : 0, cpc: t.clicks ? round(t.cost / t.clicks) : 0, cost_per_conversion: t.conversions > 0 ? round(t.cost / t.conversions) : null };
  };
  const within = (days) => rows.filter((r) => r.date >= addDays(today, -(days - 1)));
  const byCampaign = new Map();
  for (const r of within(30)) {
    const k = r.campaign;
    if (!byCampaign.has(k)) byCampaign.set(k, { campaign: k, type: r.type, group: r.group, status: r.status, rows: [] });
    byCampaign.get(k).rows.push(r);
  }
  const groups = {};
  for (const g of ['search', 'pmax', 'youtube', 'other']) groups[g] = sum(rows.filter((r) => r.group === g && r.date >= addDays(today, -29)));
  return {
    totals: { d7: sum(within(7)), d30: sum(within(30)), all: sum(rows) },
    campaigns: [...byCampaign.values()].map(({ rows: rs, ...c }) => ({ ...c, ...sum(rs) })).sort((a, b) => b.cost - a.cost),
    groups,
  };
}

export async function run(ctx) {
  const { env = process.env, fetchImpl = fetch } = ctx;
  const missing = missingEnv(env, ['GOOGLE_SA_JSON', 'GOOGLE_ADS_SHEET_ID']);
  if (missing.length) {
    return notConnected(id, label, [
      { who: 'Taj', what: 'Share Google Ads access (or let Revelation into the ads account) so the reporting script can be installed.' },
      { who: 'Blaine', what: `Paste scripts/google-ads-to-sheet.js into the Google Ads account (Tools, Scripts) and schedule it daily; share the Google Sheet with the service account; then add ${missing.join(' and ')} in Vercel.` },
    ]);
  }
  const sa = parseServiceAccount(env);
  if (!sa) return errorSnapshot(id, label, 'GOOGLE_SA_JSON is not a valid service-account key.', [{ who: 'Blaine', what: 'Paste the full JSON key file contents into GOOGLE_SA_JSON in Vercel.' }]);
  try {
    const token = await accessToken(sa, SCOPE, fetchImpl);
    const tab = env.GOOGLE_ADS_SHEET_TAB || 'Daily';
    const j = await fetchJson(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(env.GOOGLE_ADS_SHEET_ID.trim())}/values/${encodeURIComponent(`${tab}!A1:L20000`)}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`, { headers: { Authorization: `Bearer ${token}` } }, { fetchImpl });
    const rows = parseRows(j.values || []);
    const notes = [];
    const latest = rows.reduce((m, r) => (r.date > m ? r.date : m), '');
    if (!rows.length) notes.push('The sheet has no campaign rows yet. Check that the Google Ads script has run.');
    else if (latest < addDays(pacificDay(new Date()), -2)) notes.push(`Newest row in the sheet is ${latest}; the Google Ads script may have stopped running.`);
    return okSnapshot(id, label, { rows: rows.filter((r) => r.date >= addDays(pacificDay(new Date()), -120)), latest_date: latest, ...summarize(rows) }, { notes });
  } catch (e) {
    if (e.status === 403 || e.status === 404) {
      return errorSnapshot(id, label, 'Google would not let the dashboard read the sheet.', [{ who: 'Blaine', what: `Share the Google Sheet with ${sa.email} (Viewer is enough) and check GOOGLE_ADS_SHEET_ID.` }]);
    }
    if (/invalid_grant|invalid_client|unauthorized/i.test(String(e.message)) || e.status === 400 || e.status === 401) {
      return errorSnapshot(id, label, 'Google rejected the service-account sign-in.', [{ who: 'Blaine', what: 'Check GOOGLE_SA_JSON is the full key file for an active service account.' }]);
    }
    return errorSnapshot(id, label, `Google Ads sheet could not be read: ${str(e.message, 200)}`, [{ who: 'Revelation', what: 'Try Refresh now later.' }]);
  }
}
