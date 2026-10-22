/**
 * Checks the live-data dashboard end to end with no network and no accounts:
 * connectors run against recorded fixtures (scripts/fixtures), the login and
 * role rules are exercised through a real local HTTP server, the ingest rules
 * are tried with good and bad records, and pagination is proven to go past 100.
 *
 *   npm run verify:dashboard
 */
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ------------------------------------------------------------ frozen clock: 2026-10-21 13:00 Pacific
const NOW = Date.parse('2026-10-21T20:00:00Z');
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...a) { if (a.length === 0) super(NOW); else super(...a); }
  static now() { return NOW; }
};

import { FIXTURE_CREDS, SA, mockFetch, seen, state } from './fixtures/mock-network.mjs';
const fx = (n) => JSON.parse(readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8'));
let passed = 0;
const section = (t) => console.log(`\n${t}`);
const ok = (cond, msg) => { assert.ok(cond, `FAILED: ${msg}`); passed++; console.log(`  PASS  ${msg}`); };
const eq = (a, b, msg) => { assert.deepEqual(a, b, `FAILED: ${msg}`); passed++; console.log(`  PASS  ${msg}`); };
const near = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, `${msg} (got ${a}, expected about ${b})`);

// ------------------------------------------------------------ environment
const store = mkdtempSync(join(tmpdir(), 'dash-verify-'));
process.env.DASH_STORE_DIR = store;
process.env.DASH_SESSION_SECRET = 'verify-session-secret-0123456789abcdef';
process.env.DASH_INGEST_KEY = 'verify-ingest-key-0123456789';
process.env.CRON_SECRET = 'verify-cron-secret';
delete process.env.VERCEL;
process.env.DASH_INSECURE_COOKIES = '1';
for (const k of ['GHL_TOKEN', 'GHL_LOCATION_ID', 'META_ADS_TOKEN', 'META_AD_ACCOUNT_ID', 'META_PAGE_ID', 'GOOGLE_SA_JSON', 'GOOGLE_ADS_SHEET_ID', 'GSC_SITE_URL', 'BLOB_READ_WRITE_TOKEN']) delete process.env[k];

const { hashPassword, makeSession, loadUsers, authenticate, readSession, COOKIE } = await import('../api/_lib/auth.js');
const mk = async (email, name, role, pw) => ({ email, name, role, ...(await hashPassword(pw)) });
const PW = 'correct horse battery staple';
process.env.DASH_USERS = JSON.stringify([await mk('blaine@x.test', 'Blaine', 'admin', PW), await mk('taj@x.test', 'Taj', 'owner', PW), await mk('robin@x.test', 'Robin', 'team', PW)]);

const FIXTURE_ENV = { ...process.env, ...FIXTURE_CREDS };

// ================================================================= 1. nothing connected
section('1. Missing credentials report "not connected", never fake numbers');
const sources = await import('../api/_lib/sources/index.js');
for (const c of sources.CONNECTORS) {
  const s = await c.run({ env: { ...process.env } });
  ok(s.status === 'not_connected' && s.data === null && s.needs.length > 0 && s.needs.every((n) => n.who && n.what.length > 20), `${c.id}: not_connected, no data, plain-English "what is needed"`);
}

// ================================================================= 2. pagination
section('2. Pagination reads every page, not just the first 100');
const { paginateCursor } = await import('../api/_lib/sources/common.js');
const big = Array.from({ length: 237 }, (_, i) => ({ id: `x${i}` }));
let calls = 0;
const pg = await paginateCursor({
  fetchPage: async (cur) => { calls++; const start = cur ? big.findIndex((x) => x.id === cur) + 1 : 0; const items = big.slice(start, start + 100); return { items, last: items.at(-1)?.id }; },
  items: (b) => b.items, next: (b) => b.last || null,
});
eq([pg.items.length, calls], [237, 4], '237 records come back over 4 requests (3 full pages, then an empty one)');
const loop = await paginateCursor({ fetchPage: async () => ({ items: [{ id: 'a' }], last: 'same' }), items: (b) => b.items, next: (b) => b.last });
ok(loop.items.length === 1 && loop.pages <= 3, 'a server that repeats its cursor cannot trap the reader in a loop');
const capped = await paginateCursor({ fetchPage: async (c) => ({ items: [{ id: `p${(c || 0) + 1}` }], n: (c || 0) + 1 }), items: (b) => b.items, next: (b) => b.n, max: 5 });
ok(capped.capped && capped.items.length === 5, 'a safety cap is reported, not silent');

// ================================================================= 3. connectors against fixtures
section('3. GoHighLevel connector (fixtures)');
const ghl = await sources.CONNECTORS.find((c) => c.id === 'ghl').run({ env: FIXTURE_ENV, fetchImpl: mockFetch });
const G = ghl.data;
ok(ghl.status === 'ok', `status ok (${ghl.error || 'no error'})`);
const fxOpps = fx('ghl-opportunities.json').opportunities.length, fxContacts = fx('ghl-contacts.json').contacts.length;
ok(fxOpps > 200 && G.opportunities.length === fxOpps, `ALL ${fxOpps} opportunities read (an old version stopped at 100)`);
ok(G.contacts.length === fxContacts, `ALL ${fxContacts} contacts read`);
ok(seen.ghl.filter((x) => x.startsWith('/opportunities/search')).length >= 3, 'opportunities were fetched page after page');
ok(seen.pipelines429 === 2, 'a rate-limit (429) answer was retried and then succeeded');
ok(G.pipelines.length === 2 && G.pipelines[0].stages.length === 9, 'pipelines and stages read');
ok(!seen.blainesCalendarRead && !G.calendars.some((c) => c.id === '2tn3NQUMCfrluZO4jABH') && !G.appointments.some((a) => /dentist/i.test(a.title)), "Blaine's personal calendar is never read or counted");
const ev1 = G.appointments.find((a) => a.id === 'ev1');
ok(ev1.is_robin && ev1.status === 'confirmed' && ev1.calendar === 'Robin Appointments', "Robin's calendar identified; status mapped");
eq(G.appointments.filter((a) => a.is_robin).map((a) => a.status).sort(), ['confirmed', 'no-show', 'showed'], 'appointment statuses mapped (confirmed, showed, no-show)');
ok(G.appointments.find((a) => a.id === 'ev2').outcome === 'Won', 'appointment outcome taken from the opportunity (Won)');
const tj = G.touches.c_jane, ts = G.touches.c_sam;
ok(tj.calls === 1 && tj.auto_texts === 1 && tj.texts === 0, 'automatic texts are not counted as a real contact');
near(tj.speed_minutes, 12, 0.1, 'speed to lead: Jane created 16:00, Robin called 16:12');
ok(ts.speed_minutes >= 180 && ts.first_contact_by === 'Robin Martinez', 'Sam: first real contact was a text from Robin, 3 hours later');
ok(G.touches.c_carl.attempts === 0 && G.touches.c_carl.speed_minutes === null, 'a lead nobody contacted shows zero attempts and no speed');

section('3b. Meta connector (fixtures)');
const meta = await sources.CONNECTORS.find((c) => c.id === 'meta').run({ env: FIXTURE_ENV, fetchImpl: mockFetch });
ok(meta.status === 'ok', `status ok (${meta.error || ''})`);
const M = meta.data;
ok(state.metaCampaignPages === 2 && M.campaigns.length === 3, 'campaign list followed Meta paging to the last page');
const sl = M.ranges.since_launch;
near(sl.account.spend, 225, 0.01, 'spend since launch (Oct 17 to Oct 21) = 5 days x $45');
eq(sl.account.leads, 15, 'leads counted once (Meta "lead" total, not lead + onsite lead added together)');
near(sl.account.cost_per_lead, 15, 0.01, 'cost per lead = spend / leads');
near(M.ranges.today.account.spend, 45, 0.01, 'today range');
ok(sl.campaigns.find((c) => c.id === '111').status === 'ACTIVE' && sl.campaigns.find((c) => c.id === '111').daily_budget === 40, 'campaign status and daily budget (cents converted to dollars)');
ok(sl.adsets.length === 2 && sl.ads.length === 3, 'ad set and ad level numbers present');
ok(M.daily.length === 10 && M.account.spend_cap === 5000 && M.account.status === 'Active', 'daily series and account spending cap present');
ok(M.page_posts.length === 2 && seen.pageTokenUsed && M.page_posts.some((p) => p.status === 'scheduled') && M.page_posts.find((p) => p.status === 'published').metrics.reactions === 12, 'Facebook Page posts (published + scheduled) read with the page token; missing insight metrics did not break it');
const badTok = await sources.CONNECTORS.find((c) => c.id === 'meta').run({ env: { ...FIXTURE_ENV, META_ADS_TOKEN: 'nope' }, fetchImpl: mockFetch });
ok(badTok.status === 'error' && /expired|revoked/.test(badTok.error) && badTok.needs[0].who === 'Blaine', 'an expired token becomes a plain-English problem with who must fix it');

section('3c. Google Ads sheet and Search Console (fixtures, real JWT sign-in)');
const gads = await sources.CONNECTORS.find((c) => c.id === 'google_ads').run({ env: FIXTURE_ENV, fetchImpl: mockFetch });
ok(gads.status === 'ok' && seen.tokens >= 1, `signed JWT accepted by the (mock) Google token service (${gads.error || 'ok'})`);
ok(gads.data.groups.pmax.cost > 0 && gads.data.groups.youtube.cost > 0 && gads.data.groups.search.cost > 0, 'Performance Max, YouTube and Search campaigns separated');
near(gads.data.totals.d7.cost, 58 * 7, 0.01, 'seven-day cost from the daily rows');
const gsc = await sources.CONNECTORS.find((c) => c.id === 'gsc').run({ env: FIXTURE_ENV, fetchImpl: mockFetch });
ok(gsc.status === 'ok' && gsc.data.totals.clicks === 310 && gsc.data.queries[0].query === 'solar installation fresno' && gsc.data.daily.length > 20 && gsc.data.totals.ctr === 3.4, 'Search Console totals, daily series, top queries and pages');
const noShare = await sources.CONNECTORS.find((c) => c.id === 'gsc').run({ env: { ...FIXTURE_ENV, GSC_SITE_URL: 'https://wrong.example/' }, fetchImpl: mockFetch });
ok(noShare.status === 'error' && /Users and permissions/.test(noShare.needs[0].what) && noShare.needs[0].what.includes(SA.client_email), 'a site the service account cannot see says exactly which email to add');

// ================================================================= 4. ingest
section('4. Ingest: validation, append, replace');
const { ingest, validateRecord, parseLeadSubject, mergeRecords } = await import('../api/_lib/ingest.js');
const { readDoc } = await import('../api/_lib/store.js');
const bad = await ingest('email_leads', { records: [{ received_at: 'garbage', subject: 'x' }, { subject: 'no time', name: 'A' }, 'not an object', { received_at: '2026-10-21T08:00:00-07:00', name: 'Good Person', phone: '5595550999', email: 'not-an-email' }] }, process.env);
ok(bad.status === 422 && bad.body.accepted === 0 && bad.body.rejected.length === 4 && bad.body.rejected.every((r) => r.errors.length), 'every bad record is rejected with a reason (date, missing time, not an object, bad email)');
const mixed = await ingest('email_leads', { records: [{ received_at: '2026-10-21T08:00:00-07:00', name: 'Good Person', phone: '5595550999' }, { received_at: 'bad', name: 'Bad' }] }, process.env);
ok(mixed.status === 200 && mixed.body.accepted === 1 && mixed.body.rejected.length === 1 && mixed.body.rejected[0].index === 1, 'good records are kept even when a neighbour is rejected');
eq((await ingest('nope', { records: [] }, process.env)).status, 404, 'unknown source is a 404');
eq((await ingest('nexa', { records: [] }, process.env)).status, 422, 'an append with no good records stores nothing and says so');
eq((await ingest('nexa', { mode: 'replace', records: [] }, process.env)).status, 400, 'replace with zero records is refused');
eq((await ingest('nexa', { records: Array.from({ length: 2001 }, () => ({})) }, process.env)).status, 400, 'more than 2000 records per call is refused');
for (const src of ['nexa', 'email_leads', 'sales_agent', 'other_ads']) {
  const r = await ingest(src, { mode: 'replace', ...fx(`ingest-${src.replace(/_/g, '-')}.json`) }, process.env);
  ok(r.status === 200 && r.body.rejected.length === 0, `${src}: fixture records accepted (${r.body.accepted})`);
}
const before = (await readDoc('ingest/nexa', null, process.env)).records.length;
await ingest('nexa', fx('ingest-nexa.json'), process.env);
eq((await readDoc('ingest/nexa', null, process.env)).records.length, before, 'append is idempotent: sending the same Nexa messages again adds nothing');
const nx = (await readDoc('ingest/nexa', null, process.env)).records.find((r) => r.message_id === '0000338989');
ok(nx.received_at === '2026-10-20T16:04:00.000Z' && nx.phone === '+15595552111', 'Nexa times without a zone are read as Pacific; phones normalised');
const replaced = await ingest('other_ads', { mode: 'replace', records: [{ platform: 'TikTok', date: '2026-10-21', spend: 5 }] }, process.env);
eq([replaced.body.mode, (await readDoc('ingest/other_ads', null, process.env)).records.length], ['replace', 1], 'replace swaps the whole collection');
await ingest('other_ads', { mode: 'replace', ...fx('ingest-other-ads.json') }, process.env);
const lead = parseLeadSubject('New Killua lead: Jane Smith - Solar installation (Ad: Facebook / Fall Solar / Video 2)');
eq(lead, { name: 'Jane Smith', service: 'Solar installation', source: 'Facebook', campaign: 'Fall Solar', ad: 'Video 2' }, 'lead-email subject parsed into name, service, source, campaign, ad');
ok(validateRecord('email_leads', { received_at: '2026-10-21T01:00:00Z', subject: 'TEST New Killua lead: x - y', phone: '5595550123' }).value.is_test, 'TEST in a lead-email subject marks it as a test');
ok(validateRecord('social', { platform: 'myspace', status: 'planned', scheduled_at: '2026-10-25' }).errors.length > 0, 'unknown platform rejected');
eq(mergeRecords([{ id: 'a', origin: 'dashboard' }, { id: 'b', origin: 'ingest' }], [{ id: 'c', origin: 'ingest' }], 'replace', { keepNonIngest: true }).map((r) => r.id).sort(), ['a', 'c'], 'social replace removes only agent-sent posts, never dashboard posts');

// ================================================================= 5. reconcile + views
section('5. Every-lead reconciliation and the numbers on the Overview (fixtures)');
await sources.refreshAll({ env: FIXTURE_ENV, fetchImpl: mockFetch, by: 'verify' });
const { loadAll } = await import('../api/_lib/data.js');
const views = await import('../api/_lib/views.js');
const bundle = await loadAll(process.env, { fresh: true });
const L = views.leads(bundle, { now: NOW });
if (process.env.DBG) console.log(L.counts, L.rows.slice(0, 12).map((r) => [r.name, r.arrived_at, r.flags.map((f) => f.code).join('+')]));
const row = (n) => L.rows.find((r) => r.name === n);
const flagsOf = (n) => (row(n)?.flags || []).map((f) => f.code).sort();
ok(!row('TEST Lead'), 'TEST records are left out of every count');
eq(flagsOf('Jane Adams'), [], 'Jane (clean): in GoHighLevel, emailed, called in minutes, no flags');
ok(row('Jane Adams').in_ghl && row('Jane Adams').by_email && row('Jane Adams').in_nexa && row('Jane Adams').emailed_to_nexa === true && row('Jane Adams').first_contact_by === 'Nexa', 'Jane row: in GHL, lead email, in Nexa, first contact by Nexa');
eq(flagsOf('Bob Noopp'), ['no_opportunity'], 'Bob: contact exists but no opportunity');
eq(flagsOf('Carl Silent'), ['never_called', 'not_sent_to_nexa'], 'Carl: never reached Nexa, never called');
ok(flagsOf('Dana Typo').includes('wrong_email') && flagsOf('Dana Typo').includes('nexa_mismatch') === false, 'Dana: lead email differs from the email in GoHighLevel');
eq(flagsOf('Eve Elsewhere').filter((f) => f !== 'slow_response'), ['missing_from_ghl'], 'Eve: came by email and Nexa but is missing from GoHighLevel');
ok(flagsOf('Sam Slow').includes('slow_response') && row('Sam Slow').speed_minutes > 170, 'Sam: first contact 3 hours after arriving is flagged slow');
ok(row('Jane Adams').arrived_at === '2026-10-20T15:59:30.000Z', 'arrival time = earliest of GoHighLevel and the lead email');
const O = views.overview(bundle, NOW);
eq(O.leads.week.total, 6, 'leads this week = 6 people (counted once each across all three feeds)');
eq(Object.fromEntries(O.leads.week.by_source.map((s) => [s.source, s.count])), { 'Facebook / Instagram ads': 4, 'RYNO website forms': 2 }, 'leads by source this week');
near(O.spend.week.total, 135 + 174 + 38.5, 0.01, 'ad spend this week = Meta 135 + Google 174 + TikTok 38.5');
near(O.cpl.week, (135 + 174 + 38.5) / 6, 0.01, 'blended cost per lead = all spend / all leads');
eq([O.appointments.week.booked, O.appointments.week.ran], [1, 1], 'appointments this week: 1 booked, 1 ran');
near(O.speed.month_avg, 60.3, 4, 'average speed to lead');
ok(O.pipeline.open > 100 && O.pipeline.won_total > 20 && !JSON.stringify(O).includes('TEST'), 'open and won counts include every opportunity; test records excluded');
ok(/6 new leads/.test(O.summary) && /per lead/.test(O.summary), 'auto-written summary mentions the numbers');
const C = views.calls(bundle, NOW);
ok(C.totals.leads === 5 && C.rows.find((r) => r.lead_name === 'Eve Elsewhere').in_ghl === false, 'Calls view: 5 leads called, Eve not found in GoHighLevel');
const A = views.ads(bundle, NOW);
ok(A.cards.find((c) => c.id === 'tiktok').active && A.cards.find((c) => c.id === 'pmax_youtube').active && !A.cards.find((c) => c.id === 'other').active, 'placeholder cards switch on by themselves (TikTok, PMax/YouTube) and stay waiting (Other)');
const S = views.sales(bundle, NOW);
ok(S.robin.total === 3 && S.agent_events.length === 2, "Appointments view: Robin's 3 appointments, 2 sales-assistant events");
const CN = views.connections(bundle, NOW);
ok(CN.items.filter((i) => i.id !== 'social').every((i) => i.status === 'ok') && CN.items.find((i) => i.id === 'social').status === 'not_connected', 'Connections: every connected source reports ok; social waits for its first post');
const unc = views.connections({ snaps: {}, push: {}, social: { posts: [] }, tasks: { tasks: [] } }, NOW);
ok(unc.items.filter((i) => i.status === 'not_connected').length === 9 && unc.items.every((i) => i.needs.length), 'Connections: with nothing connected, every row says who needs to do what');

// ================================================================= 6. login, roles, routes over real HTTP
section('6. Login, roles and routes over real HTTP');
const { startDashServer } = await import('./dash-local.mjs');
const server = await startDashServer(4351);
const BASE = 'http://127.0.0.1:4351';
const req = async (path, { method = 'GET', body, cookie, headers = {}, form } = {}) => {
  const h = { ...headers };
  if (cookie) h.cookie = `${COOKIE}=${cookie}`;
  let b;
  if (form) { h['content-type'] = 'application/x-www-form-urlencoded'; b = new URLSearchParams(form).toString(); }
  else if (body !== undefined) { h['content-type'] = h['content-type'] || 'application/json'; b = typeof body === 'string' ? body : JSON.stringify(body); }
  const r = await fetch(BASE + path, { method, headers: h, body: b, redirect: 'manual' });
  const text = await r.text();
  let j = null; try { j = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json: j, headers: r.headers };
};
const sess = (email, role) => makeSession({ email, role }, process.env, NOW);
const admin = sess('blaine@x.test', 'admin'), owner = sess('taj@x.test', 'owner'), team = sess('robin@x.test', 'team');

const GETS = ['me', 'overview', 'ads', 'leads', 'calls', 'sales', 'search', 'social', 'tasks', 'connections', 'activity'];
for (const r of GETS) {
  const res = await req(`/api/dash/${r}`);
  ok(res.status === 401 && JSON.stringify(res.json) === '{"error":"login_required"}', `GET /api/dash/${r} without login: 401 and no data`);
}
for (const [path, body] of [['refresh', {}], ['tasks', { title: 'abc' }], ['tasks/t_1', { comment: 'hi' }], ['social', {}], ['social/p/delete', {}]]) {
  const res = await req(`/api/dash/${path}`, { method: 'POST', body });
  ok(res.status === 401, `POST /api/dash/${path} without login: 401`);
}
const p1 = await req('/dashboard/'); ok(p1.status === 302 && p1.headers.get('location') === '/dashboard/login/', '/dashboard/ without login redirects to the login page');
const p2 = await req('/dashboard/app.js'); ok(p2.status === 401 && !p2.text.includes('Killua'), '/dashboard/app.js without login: 401');
const p3 = await req('/dashboard/anything/else'); ok(p3.status === 302, 'any other /dashboard/ path without login redirects');
const login = await req('/dashboard/login/'); ok(login.status === 200 && /<form/.test(login.text) && /noindex/.test(login.text) && !/Jane|Adams|opportunit/i.test(login.text), 'login page is served, carries noindex, contains no data');
ok(/noindex/.test(login.headers.get('x-robots-tag')) && /no-store/.test(login.headers.get('cache-control')) && /default-src 'none'/.test(login.headers.get('content-security-policy')), 'responses carry noindex, no-store and a strict content policy');
const ingestNoKey = await req('/api/dash/ingest/nexa', { method: 'POST', body: { records: [] } });
const ingestBadKey = await req('/api/dash/ingest/nexa', { method: 'POST', body: { records: [] }, headers: { authorization: 'Bearer wrong-key-wrong-key' } });
ok(ingestNoKey.status === 401 && ingestBadKey.status === 401, 'ingest without the key, or with a wrong key: 401');
const ingestOk = await req('/api/dash/ingest/sales_agent', { method: 'POST', body: { records: [{ at: '2026-10-21T10:00:00-07:00', event_type: 'Text sent', summary: 'hello', lead_name: 'Zed' }, { at: 'bad' }] }, headers: { authorization: `Bearer ${process.env.DASH_INGEST_KEY}` } });
ok(ingestOk.status === 200 && ingestOk.json.accepted === 1 && ingestOk.json.rejected[0].index === 1, 'ingest with the key: accepted, bad record reported by position');
const cron1 = await req('/api/dash/cron'); const cron2 = await req('/api/dash/cron', { headers: { authorization: 'Bearer verify-cron-secret' } });
ok(cron1.status === 401 && cron2.status === 200 && cron2.json.results.length === 4, 'cron route needs its own secret; with it, all four sources refresh');

// login flow
const t0 = Date.now(); const realNow = RealDate.now();
const badLogin = await req('/api/dash/login', { method: 'POST', form: { email: 'blaine@x.test', password: 'wrong password here' } });
const slow = RealDate.now() - realNow;
ok(badLogin.status === 401 && !badLogin.headers.get('set-cookie') && /do not match/.test(badLogin.text) && slow >= 600, `wrong password: 401, no cookie, deliberately slow (${slow} ms)`);
const noUser = await req('/api/dash/login', { method: 'POST', form: { email: 'nobody@x.test', password: PW } });
ok(noUser.status === 401 && /do not match/.test(noUser.text), 'unknown email gives the same answer as a wrong password');
const good = await req('/api/dash/login', { method: 'POST', form: { email: 'Taj@X.test', password: PW } });
const sc = good.headers.get('set-cookie') || '';
ok(good.status === 303 && /HttpOnly/.test(sc) && /SameSite=Lax/.test(sc) && /Max-Age=2592000/.test(sc), 'good login: 303 to the dashboard with an HttpOnly, SameSite=Lax, 30-day cookie');
delete process.env.DASH_INSECURE_COOKIES;
const goodSecure = await req('/api/dash/login', { method: 'POST', form: { email: 'taj@x.test', password: PW } });
ok(/; Secure/.test(goodSecure.headers.get('set-cookie')), 'the cookie is Secure in normal (production) mode');
process.env.DASH_INSECURE_COOKIES = '1';
const cookieVal = /kdash=([^;]+)/.exec(sc)[1];
const cross = await req('/api/dash/login', { method: 'POST', form: { email: 'taj@x.test', password: PW }, headers: { origin: 'https://evil.example' } });
ok(cross.status === 403, 'a login posted from another website is refused');

// with a session
for (const r of GETS.filter((x) => x !== 'activity')) {
  const res = await req(`/api/dash/${r}`, { cookie: owner });
  ok(res.status === 200 && res.json, `owner can read /api/dash/${r}`);
}
ok((await req('/api/dash/activity', { cookie: owner })).status === 403 && (await req('/api/dash/activity', { cookie: admin })).status === 200, 'activity log is admin only');
const shell = await req('/dashboard/', { cookie: team });
ok(shell.status === 200 && /\/dashboard\/app\.js/.test(shell.text) && !/Jane Adams|Carl Silent|killuahome\.com\//.test(shell.text), 'the app page itself contains no lead data');
eq(await (async () => (await req('/dashboard/login/', { cookie: team })).status)(), 302, 'a signed-in person visiting the login page goes straight to the dashboard');
const appjs = await req('/dashboard/app.js', { cookie: team }); ok(appjs.status === 200 && /javascript/.test(appjs.headers.get('content-type')), 'app script served to a signed-in person');
// tampering
const tamper = cookieVal.slice(0, -2) + (cookieVal.endsWith('AA') ? 'BB' : 'AA');
ok((await req('/api/dash/overview', { cookie: tamper })).status === 401, 'a tampered cookie is rejected');
const [pl] = cookieVal.split('.'); const forged = JSON.parse(Buffer.from(pl, 'base64url')); forged.r = 'admin';
ok((await req('/api/dash/overview', { cookie: `${Buffer.from(JSON.stringify(forged)).toString('base64url')}.${cookieVal.split('.')[1]}` })).status === 401, 'editing the role inside a cookie breaks its signature');
ok((await req('/api/dash/overview', { cookie: makeSession({ email: 'taj@x.test', role: 'owner' }, process.env, NOW - 31 * 86400000) })).status === 401, 'a cookie older than 30 days is rejected');
ok((await req('/api/dash/overview', { cookie: createHmac('sha256', 'wrong').update('x').digest('hex') })).status === 401, 'garbage cookie rejected');
const savedUsers = process.env.DASH_USERS;
process.env.DASH_USERS = JSON.stringify(loadUsers().filter((u) => u.email !== 'taj@x.test'));
ok((await req('/api/dash/overview', { cookie: owner })).status === 401, 'removing a person from DASH_USERS signs them out everywhere');
process.env.DASH_USERS = savedUsers;

// roles
const jsonPost = (path, who, body, extra = {}) => req(`/api/dash/${path}`, { method: 'POST', cookie: who, body, ...extra });
ok((await jsonPost('refresh', team, {})).status === 403 && (await jsonPost('refresh', owner, {})).status === 403, 'only admin can press Refresh now');
const ref = await jsonPost('refresh', admin, { source: 'gsc' });
ok(ref.status === 200 && ref.json.results[0].source === 'gsc', 'admin Refresh now works for one source');
ok((await jsonPost('refresh', admin, { source: 'nope' })).status === 400, 'unknown refresh source refused');
const tasks0 = (await req('/api/dash/tasks', { cookie: team })).json;
ok(tasks0.tasks.length === 16 && tasks0.tasks.every((t) => t.history.length >= 1) && tasks0.tasks.some((t) => t.status === 'waiting_killua') && tasks0.tasks.some((t) => t.priority === 'normal'), "Blaine's list starts with the 16 items from scripts/seed-tasks.json (statuses and priorities mapped)");
ok((await req('/api/dash/tasks', { cookie: team })).json.tasks.length === 16, 'seed items are added once, not on every read');
const add = await jsonPost('tasks', team, { title: 'Add a TikTok card', details: 'Please', category: 'Ads', priority: 'high', due: '2026-11-05' });
ok(add.status === 200 && add.json.task.status === 'not_started' && add.json.task.requested_by_name === 'Robin', 'team member can add a request');
ok((await jsonPost('tasks', owner, { title: 'x' })).status === 422, 'a request needs a real title');
const tid = add.json.task.id;
ok((await jsonPost(`tasks/${tid}`, owner, { status: 'done_live', progress: 100 })).status === 403, 'owner cannot change status');
const cm = await jsonPost(`tasks/${tid}`, owner, { comment: 'Needed before the weekend' });
ok(cm.status === 200 && cm.json.task.history.at(-1).text.includes('Needed before the weekend') && cm.json.task.status === 'not_started', 'owner can comment; history records it');
const noLink = await jsonPost(`tasks/${tid}`, admin, { status: 'done_live' });
ok(noLink.status === 422 && /link/.test(noLink.json.errors[0]), 'Done (live) needs a link someone can check');
const part = await jsonPost(`tasks/${tid}`, admin, { status: 'in_progress', progress: 40, notes: 'Started' });
ok(part.status === 200 && part.json.task.progress === 40 && part.json.task.history.length >= 4, 'admin sets status, progress and notes; each change is in the history');
const done = await jsonPost(`tasks/${tid}`, admin, { status: 'done_live', link: 'https://app.killuahome.com/dashboard/#ads' });
ok(done.status === 200 && done.json.task.progress === 100 && done.json.task.completed_at, 'Done (live) with a link sets 100% and a finish time');
ok((await jsonPost('tasks/t_missing', admin, { notes: 'x' })).status === 404, 'unknown task is a 404');
// social
const evil = '<img src=x onerror=alert(1)> Fall sale';
ok((await jsonPost('social', team, { platform: 'facebook', status: 'planned', scheduled_at: '2026-10-30T10:00', caption: 'x' })).status === 403, 'team cannot add social posts');
const post = await jsonPost('social', owner, { platform: 'facebook', status: 'waiting_approval', scheduled_at: '2026-10-30T10:00', caption: evil, link: 'https://example.com/x' });
ok(post.status === 200 && post.json.post.scheduled_at === '2026-10-30T17:00:00.000Z' && post.json.post.origin === 'dashboard', 'owner adds a post; a Pacific time is stored correctly');
ok((await jsonPost('social', owner, { platform: 'facebook', status: 'planned', scheduled_at: '2026-10-30T10:00', link: 'javascript:alert(1)' })).status === 422, 'a javascript: link is refused');
ok((await jsonPost('social', owner, { platform: 'facebook', status: 'planned', scheduled_at: 'soon' })).status === 422, 'a bad date is refused');
const edited = await jsonPost('social', owner, { id: post.json.post.id, platform: 'facebook', status: 'scheduled', scheduled_at: '2026-10-30T10:00', caption: 'Updated' });
ok(edited.status === 200 && edited.json.post.status === 'scheduled', 'owner edits a post');
await ingest('social', fx('ingest-social.json'), process.env);
await ingest('social', { mode: 'replace', records: [{ id: 'ingest_post_2', platform: 'tiktok', status: 'planned', scheduled_at: '2026-10-31', caption: 'b' }] }, process.env);
const { bustCache } = await import('../api/_lib/data.js');
await sources.refreshAll({ env: FIXTURE_ENV, fetchImpl: mockFetch, by: 'verify' });
bustCache();
const soc = (await req('/api/dash/social', { cookie: owner })).json;
ok(soc.posts.some((p) => p.id === post.json.post.id) && soc.posts.some((p) => p.id === 'ingest_post_2') && !soc.posts.some((p) => p.id === 'ingest_post_1') && soc.posts.some((p) => p.origin === 'page'), 'ingest replace kept the dashboard post, swapped the agent posts; Facebook Page posts appear too');
ok((await jsonPost(`social/${post.json.post.id}/delete`, owner, {})).status === 403 && (await jsonPost(`social/${post.json.post.id}/delete`, admin, {})).status === 200, 'only admin can delete a post');
// CSRF / content type
ok((await jsonPost('tasks', admin, { title: 'abc def' }, { headers: { origin: 'https://evil.example' } })).status === 403, 'a post from another website is refused even with a valid cookie');
ok((await req('/api/dash/tasks', { method: 'POST', cookie: admin, body: 'title=abc', headers: { 'content-type': 'text/plain' } })).status === 415, 'a non-JSON post is refused');
ok((await req('/api/dash/overview', { method: 'DELETE', cookie: admin })).status === 405, 'unexpected methods are refused');
const act = (await req('/api/dash/activity', { cookie: admin })).json.items;
ok(act.some((a) => a.action === 'login') && act.some((a) => a.action === 'task_add') && act.some((a) => a.action === 'ingest') && !JSON.stringify(act).includes(PW), 'the activity log records who did what, never passwords');

// ================================================================= 7. no secrets / safe rendering
section('7. Source checks: no secrets in the repo, no lead data in static files, safe rendering');
const appSrc = readFileSync(new URL('../dashboard-app/app.js', import.meta.url), 'utf8');
const bad2 = appSrc.split('\n').filter((l) => /innerHTML\s*=/.test(l) && !/(\.s\b|<div class="loading">|<a href=|'<span class="spin"><\/span> Refreshing')/.test(l) && !/\$\('#tabs'\)\.innerHTML = TABS/.test(l));
ok(bad2.length === 0, 'every innerHTML assignment is fed by the auto-escaping template (or fixed text)');
ok(!/eval\(|new Function|document\.write/.test(appSrc), 'no eval, new Function or document.write');
ok(/const esc = /.test(appSrc) && /safeUrl/.test(appSrc), 'escape helper and link check present');
const staticFiles = [];
const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else staticFiles.push(p); } };
walk(new URL('../dashboard-app/', import.meta.url).pathname);
const leaky = staticFiles.filter((f) => /Jane Adams|Carl Silent|"opportunities"|const DATA\s*=/.test(readFileSync(f, 'utf8')));
ok(leaky.length === 0, 'no lead data in any dashboard page or script file');
const secretish = staticFiles.concat(['../api/dash.js', '../vercel.json', '../.env.example'].map((p) => new URL(p, import.meta.url).pathname)).filter((f) => /EAA[A-Za-z0-9]{20,}|pit-[0-9a-f-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY|vercel_blob_rw_/.test(readFileSync(f, 'utf8')));
ok(secretish.length === 0, 'no tokens or keys in dashboard files, vercel.json or .env.example');
const vj = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
ok(vj.crons.length === 1 && vj.crons[0].path === '/api/dash/cron' && vj.crons[0].schedule === '0 14 * * *', 'Vercel refreshes once a day at 7:00 Pacific (Hobby plan limit); the 1:00 PM run is a call to the same cron address');
ok(vj.rewrites.some((r) => r.has?.[0]?.value === 'app.killuahome.com') && vj.functions['api/dash.js'].includeFiles === 'dashboard-app/**', 'app.killuahome.com is served the dashboard; page files ship with the function');

server.close();
console.log(`\n${passed} checks passed.\n`);
process.exit(0);
