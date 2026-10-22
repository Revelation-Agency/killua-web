/**
 * A pretend internet for the dashboard connectors: answers like GoHighLevel,
 * Meta, Google sign-in, Google Sheets and Search Console, from the recorded
 * fixtures in this folder. Used by verify-dashboard.mjs and the browser check.
 */
import { createVerify, generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';

const fx = (n) => JSON.parse(readFileSync(new URL(`./${n}`, import.meta.url), 'utf8'));
export const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
export const SA = { client_email: 'dash@killua-test.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }), token_uri: 'https://oauth2.googleapis.com/token' };
export const FIXTURE_CREDS = {
  GHL_TOKEN: 'ghl-test-token', GHL_LOCATION_ID: 'LOC1',
  META_ADS_TOKEN: 'meta-token', META_AD_ACCOUNT_ID: '123', META_PAGE_ID: 'PAGE1',
  GOOGLE_SA_JSON: JSON.stringify(SA), GOOGLE_ADS_SHEET_ID: 'SHEET1', GSC_SITE_URL: 'https://killuahome.com/',
};
export const state = { metaCampaignPages: 0 };
// ------------------------------------------------------------ mock network
export const seen = { ghl: [], meta: [], tokens: 0, pipelines429: 0, blainesCalendarRead: false, pageTokenUsed: false };
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const ghlPages = (all, key, u, limit = 100) => {
  const id = u.searchParams.get('startAfterId');
  const start = id ? all.findIndex((x) => x.id === id) + 1 : 0;
  const items = all.slice(start, start + limit);
  const last = items[items.length - 1];
  return { [key]: items, meta: { total: all.length, startAfterId: last?.id, startAfter: last ? Date.parse(last.createdAt || last.dateAdded) : undefined, nextPageUrl: items.length === limit ? 'next' : null } };
};
const metaDaily = fx('meta-base.json');
function metaInsights(u) {
  const level = u.searchParams.get('level');
  const tr = JSON.parse(u.searchParams.get('time_range'));
  const incr = u.searchParams.get('time_increment');
  const rows = metaDaily.daily.filter((r) => r.day >= tr.since && r.day <= tr.until);
  const keyOf = { account: () => 'acct', campaign: (r) => r.campaign_id, adset: (r) => r.adset_id, ad: (r) => r.ad_id }[level];
  const groups = new Map();
  for (const r of rows) {
    const k = `${keyOf(r)}|${incr ? r.day : ''}`;
    if (!groups.has(k)) groups.set(k, { rs: [], r });
    groups.get(k).rs.push(r);
  }
  const data = [...groups.values()].map(({ rs, r }) => {
    const s = (f) => rs.reduce((a, x) => a + x[f], 0);
    const impressions = s('impressions');
    const leads = s('leads');
    return {
      campaign_id: r.campaign_id, campaign_name: metaDaily.names.campaigns[r.campaign_id], adset_id: r.adset_id, adset_name: metaDaily.names.adsets[r.adset_id], ad_id: r.ad_id, ad_name: metaDaily.names.ads[r.ad_id],
      spend: String(s('spend')), impressions: String(impressions), reach: String(Math.round(impressions * 0.8)), frequency: '1.25', clicks: String(s('clicks')), inline_link_clicks: String(s('link')),
      ctr: String(((s('clicks') / impressions) * 100).toFixed(4)), cpc: '0.5', cpm: '10',
      // Meta's own "lead" total already includes the onsite part; both are listed on purpose
      actions: [{ action_type: 'link_click', value: String(s('link')) }, ...(leads ? [{ action_type: 'lead', value: String(leads) }, { action_type: 'onsite_conversion.lead_grouped', value: String(leads) }] : [])],
      date_start: incr ? r.day : tr.since, date_stop: incr ? r.day : tr.until,
    };
  });
  return { data };
}
export async function mockFetch(input, init = {}) {
  const u = new URL(typeof input === 'string' ? input : input.url);
  const h = new Headers(init.headers || {});
  const method = (init.method || 'GET').toUpperCase();
  if (u.host === 'services.leadconnectorhq.com') {
    seen.ghl.push(u.pathname + u.search);
    if (h.get('authorization') !== 'Bearer ghl-test-token') return json({ message: 'Invalid token' }, 401);
    if (h.get('version') !== '2021-07-28') return json({ message: 'bad version' }, 400);
    const p = u.pathname;
    if (p === '/opportunities/pipelines') {
      if (!seen.pipelines429++) return json({ message: 'rate limited' }, 429, { 'retry-after': '0' });
      return json(fx('ghl-pipelines.json'));
    }
    if (p === '/opportunities/search') return json(ghlPages(fx('ghl-opportunities.json').opportunities, 'opportunities', u));
    if (p === '/contacts/') return json(ghlPages(fx('ghl-contacts.json').contacts, 'contacts', u));
    if (p === '/users/') return json(fx('ghl-users.json'));
    if (p === '/calendars/') return json(fx('ghl-calendars.json'));
    if (p === '/calendars/events') {
      const cal = u.searchParams.get('calendarId');
      if (cal === '2tn3NQUMCfrluZO4jABH') seen.blainesCalendarRead = true;
      const a = Number(u.searchParams.get('startTime')), b = Number(u.searchParams.get('endTime'));
      return json({ events: fx('ghl-events.json').events.filter((e) => e.calendarId === cal && Date.parse(e.startTime) >= a && Date.parse(e.startTime) < b) });
    }
    if (p === '/conversations/search') {
      const cid = u.searchParams.get('contactId');
      return json({ conversations: fx('ghl-messages.json')[cid] ? [{ id: `conv_${cid}` }] : [], total: 1 });
    }
    const m = /^\/conversations\/conv_(.+)\/messages$/.exec(p);
    if (m) return json({ messages: { messages: fx('ghl-messages.json')[m[1]] || [], nextPage: false, lastMessageId: 'x' } });
    return json({ message: 'not found' }, 404);
  }
  if (u.host === 'graph.facebook.com') {
    const tok = u.searchParams.get('access_token');
    if (!['meta-token', 'page-token'].includes(tok)) return json({ error: { message: 'Invalid OAuth access token.', code: 190 } }, 400);
    const p = u.pathname.replace(/^\/v23\.0/, '');
    if (p === '/act_123') return json(metaDaily.account);
    if (p === '/act_123/campaigns') {
      state.metaCampaignPages++;
      const after = u.searchParams.get('after');
      const [a, b, c] = metaDaily.campaigns;
      return after ? json({ data: [c] }) : json({ data: [a, b], paging: { next: `https://graph.facebook.com/v23.0/act_123/campaigns?after=2&access_token=${tok}` } });
    }
    if (p === '/act_123/adsets') return json({ data: metaDaily.adsets });
    if (p === '/act_123/ads') return json({ data: metaDaily.ads });
    if (p === '/act_123/insights') return json(metaInsights(u));
    if (p === '/PAGE1') return json({ access_token: 'page-token', id: 'PAGE1' });
    if (p === '/PAGE1/published_posts') { if (tok === 'page-token') seen.pageTokenUsed = true; return json(metaDaily.page.published); }
    if (p === '/PAGE1/scheduled_posts') return json(metaDaily.page.scheduled);
    if (/\/PG_\d+\/insights/.test(p)) return json({ error: { message: '(#100) metric deprecated', code: 100 } }, 400);
    return json({ error: { message: 'unknown path', code: 100 } }, 404);
  }
  if (u.host === 'oauth2.googleapis.com') {
    const jwt = new URLSearchParams(String(init.body)).get('assertion');
    const [hd, cl, sig] = jwt.split('.');
    const v = createVerify('RSA-SHA256').update(`${hd}.${cl}`);
    const claim = JSON.parse(Buffer.from(cl, 'base64url').toString());
    if (!v.verify(publicKey, Buffer.from(sig, 'base64url')) || claim.iss !== SA.client_email || !claim.scope) return json({ error: 'invalid_grant' }, 400);
    seen.tokens++;
    return json({ access_token: `tok-${claim.scope.includes('webmasters') ? 'gsc' : 'sheets'}`, expires_in: 3600 });
  }
  if (u.host === 'sheets.googleapis.com') {
    if (h.get('authorization') !== 'Bearer tok-sheets') return json({ error: { message: 'unauth' } }, 401);
    if (!u.pathname.includes('/spreadsheets/SHEET1/values/')) return json({ error: { message: 'not found' } }, 404);
    return json(fx('google-ads-sheet.json'));
  }
  if (u.host === 'www.googleapis.com') {
    if (h.get('authorization') !== 'Bearer tok-gsc') return json({ error: { message: 'unauth' } }, 401);
    if (!u.pathname.startsWith('/webmasters/v3/sites/https%3A%2F%2Fkilluahome.com%2F/searchAnalytics/query') || method !== 'POST') return json({ error: { message: 'bad site' } }, 404);
    const dims = JSON.parse(init.body).dimensions?.[0];
    const g = fx('gsc.json');
    return json(dims === 'date' ? g.daily : dims === 'query' ? g.queries : dims === 'page' ? g.pages : g.total);
  }
  return json({ error: 'unexpected host ' + u.host }, 500);
}

