/**
 * Turns stored snapshots into the numbers each dashboard section shows.
 * Pure: give it the bundle from data.js and a clock, get plain objects back.
 */
import { addDays, digits10, isTestRecord, LAUNCH_DATE, monthStart, normEmail, pacificDay, round, safeDiv, weekStart } from './util.js';
import { reconcile } from './reconcile.js';
import { STATUSES, CATEGORIES } from './tasks.js';

const money = (n) => (n == null ? null : round(n, 2));
const ghlOf = (b) => b.snaps.ghl?.data || null;
const recs = (b, id) => b.push[id]?.data?.records || [];

const recCache = new WeakMap();
export function recon(b, now = Date.now(), days = 400) {
  const k = `${days}`;
  const c = recCache.get(b) || {};
  if (!c[k] || c.now !== now) {
    c[k] = reconcile({ ghl: ghlOf(b), emailLeads: recs(b, 'email_leads'), nexa: recs(b, 'nexa'), now, sinceDays: days });
    c.now = now;
    recCache.set(b, c);
  }
  return c[k];
}

export function windows(now = Date.now()) {
  const today = pacificDay(now);
  return { today, week: weekStart(today), month: monthStart(today), d30: addDays(today, -29), d7: addDays(today, -6) };
}

const inRange = (day, from, to) => day && day >= from && day <= to;

/** Ad spend per day, by platform group. */
export function dailySpend(b) {
  const m = new Map();
  const add = (date, key, v) => {
    if (!date) return;
    if (!m.has(date)) m.set(date, { meta: 0, google: 0, other: 0 });
    m.get(date)[key] += v;
  };
  for (const r of b.snaps.meta?.data?.daily || []) add(r.date, 'meta', r.spend);
  for (const r of b.snaps.google_ads?.data?.rows || []) add(r.date, 'google', r.cost);
  for (const r of recs(b, 'other_ads')) add(r.date, 'other', r.spend);
  return m;
}

export function spendBetween(b, from, to) {
  const t = { meta: 0, google: 0, other: 0 };
  for (const [d, v] of dailySpend(b)) if (inRange(d, from, to)) for (const k of Object.keys(t)) t[k] += v[k];
  return { ...t, total: round(t.meta + t.google + t.other) };
}

const metaLeadsBetween = (b, from, to) => (b.snaps.meta?.data?.daily || []).filter((r) => inRange(r.date, from, to)).reduce((s, r) => s + r.leads, 0);

const bySource = (rows) => {
  const m = new Map();
  for (const r of rows) m.set(r.source, (m.get(r.source) || 0) + 1);
  return [...m.entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count);
};

const isTestOpp = (o) => isTestRecord({ name: o.contact_name || o.name, email: o.contact_email, phone: o.contact_phone });
const mean = (xs) => (xs.length ? round(xs.reduce((a, c) => a + c, 0) / xs.length, 1) : null);
const median = (xs) => {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, c) => a - c);
  return round(s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2, 1);
};

export function updatedTimes(b) {
  const o = {};
  for (const [k, s] of Object.entries(b.snaps)) o[k] = s?.as_of || null;
  for (const [k, s] of Object.entries(b.push)) o[k] = s?.as_of || null;
  o.social = b.social?.as_of || null;
  return o;
}

// ------------------------------------------------------------------ overview
export function overview(b, now = Date.now()) {
  const w = windows(now);
  const r = recon(b, now);
  const rows = r.rows;
  const g = ghlOf(b);
  const day = (x) => pacificDay(x.arrived_at);
  const weekRows = rows.filter((x) => inRange(day(x), w.week, w.today));
  const monthRows = rows.filter((x) => inRange(day(x), w.month, w.today));

  const spendWeek = spendBetween(b, w.week, w.today);
  const spendMonth = spendBetween(b, w.month, w.today);
  const adsKnown = Boolean(b.snaps.meta?.data || b.snaps.google_ads?.data || recs(b, 'other_ads').length);
  const cpl = (spend, n) => (adsKnown && spend.total > 0 ? money(safeDiv(spend.total, n)) : null);

  const appts = (g?.appointments || []).filter((a) => !isTestRecord({ name: a.title }));
  const created = (a) => pacificDay(a.created_at);
  const ranStates = (a) => a.status === 'showed' || /ran|won|closing/i.test(a.outcome || '');
  const apptsFor = (from) => ({
    booked: appts.filter((a) => inRange(created(a), from, w.today)).length,
    ran: appts.filter((a) => ranStates(a) && inRange(pacificDay(a.start), from, w.today) && Date.parse(a.start) <= now).length,
  });
  const aw = apptsFor(w.week), am = apptsFor(w.month);

  const speedFor = (list) => list.map((x) => x.speed_minutes).filter((x) => x != null);
  const sw = speedFor(weekRows), sm = speedFor(monthRows);

  const opps = (g?.opportunities || []).filter((o) => !isTestOpp(o));
  const open = opps.filter((o) => o.status === 'open');
  const won = opps.filter((o) => o.status === 'won');
  const wonMonth = won.filter((o) => inRange(pacificDay(o.updated_at), w.month, w.today));

  // weekly leads by source, last 10 weeks; monthly since July
  const weeks = Array.from({ length: 10 }, (_, i) => addDays(w.week, -7 * (9 - i)));
  const topSources = bySource(rows.filter((x) => day(x) >= weeks[0])).slice(0, 5).map((s) => s.source);
  const series = (keys, keyOf, label) => keys.map((k) => {
    const list = rows.filter((x) => keyOf(day(x)) === k);
    const parts = Object.fromEntries(topSources.map((s) => [s, 0]));
    let other = 0;
    for (const x of list) topSources.includes(x.source) ? parts[x.source]++ : other++;
    return { key: k, label: label(k), total: list.length, parts, other };
  });
  const months = [];
  for (let m = '2026-07-01'; m <= w.month; m = addDays(m.slice(0, 7) + '-28', 5).slice(0, 7) + '-01') months.push(m);

  const attention = rows.filter((x) => x.needs_attention && inRange(day(x), addDays(w.today, -14), w.today)).slice(0, 6);

  const out = {
    updated: updatedTimes(b),
    windows: w,
    leads: { week: { total: weekRows.length, by_source: bySource(weekRows) }, month: { total: monthRows.length, by_source: bySource(monthRows) } },
    spend: { week: spendWeek, month: spendMonth, known: adsKnown },
    cpl: { week: cpl(spendWeek, weekRows.length), month: cpl(spendMonth, monthRows.length) },
    appointments: { week: aw, month: am },
    speed: { week_avg: mean(sw), month_avg: mean(sm), month_median: median(sm), contacted_month: sm.length, leads_month: monthRows.length, never_contacted_month: monthRows.length - sm.length },
    pipeline: {
      open: open.length,
      open_value: round(open.reduce((s, o) => s + o.value, 0), 0),
      won_total: won.length,
      won_value: round(won.reduce((s, o) => s + o.value, 0), 0),
      won_month: wonMonth.length,
    },
    attention: { count: r.counts.needs_attention, recent: attention.map((x) => ({ name: x.name, arrived_at: x.arrived_at, source: x.source, flags: x.flags.map((f) => f.label) })) },
    series: { sources: topSources, weekly: series(weeks, (d) => weekStart(d), (k) => k.slice(5)), monthly: series(months, (d) => monthStart(d), (k) => k.slice(0, 7)) },
    connected: { ghl: Boolean(g), meta: Boolean(b.snaps.meta?.data), nexa: r.nexa_connected },
  };
  out.summary = summaryText(out);
  return out;
}

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many || `${one}s`}`;
}
const usd = (n) => `$${n >= 100 ? Math.round(n).toLocaleString('en-US') : n.toFixed(2)}`;

export function summaryText(o) {
  const parts = [];
  if (!o.connected.ghl) return 'GoHighLevel is not connected yet, so lead and sales numbers will appear here once it is. See Connections for what is needed.';
  const wk = o.leads.week;
  if (wk.total === 0) parts.push('No new leads have come in this week yet.');
  else {
    const top = wk.by_source.slice(0, 3).map((s) => `${s.count} from ${s.source}`).join(', ');
    parts.push(`This week Killua has ${plural(wk.total, 'new lead')} (${top}).`);
  }
  parts.push(`${plural(o.leads.month.total, 'lead')} so far this month.`);
  if (o.spend.known && o.spend.week.total > 0) {
    parts.push(`Ads spent ${usd(o.spend.week.total)} this week${o.cpl.week != null ? `, a blended cost of ${usd(o.cpl.week)} per lead` : ''}.`);
  } else if (!o.spend.known) parts.push('Ad spend is not connected yet, so cost per lead is not shown.');
  const a = o.appointments.week;
  parts.push(`${plural(a.booked, 'appointment')} booked and ${a.ran} ran this week.`);
  if (o.speed.month_avg != null) parts.push(`The first call or text goes out about ${o.speed.month_avg < 90 ? `${Math.round(o.speed.month_avg)} minutes` : `${round(o.speed.month_avg / 60, 1)} hours`} after a lead arrives (this month's average).`);
  if (o.attention.count > 0) parts.push(`${plural(o.attention.count, 'lead')} need a look: see Every lead.`);
  parts.push(`${o.pipeline.open} opportunities are open and ${o.pipeline.won_total} have been won in total.`);
  return parts.join(' ');
}

// ------------------------------------------------------------------ ads
function dailyRollup(rows, dateKey, fields, from, to) {
  const m = new Map();
  for (let d = from; d <= to; d = addDays(d, 1)) m.set(d, { date: d, ...Object.fromEntries(Object.keys(fields).map((k) => [k, 0])) });
  for (const r of rows) {
    const t = m.get(r[dateKey]);
    if (!t) continue;
    for (const [k, src] of Object.entries(fields)) t[k] += Number(r[src]) || 0;
  }
  return [...m.values()].map((x) => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, typeof v === 'number' ? round(v) : v])));
}

export function ads(b, now = Date.now()) {
  const w = windows(now);
  const snapInfo = (s) => (s ? { status: s.status, as_of: s.as_of, error: s.error, needs: s.needs, notes: s.notes, stale: !!s.stale } : { status: 'not_connected', as_of: null, error: null, needs: [], notes: [] });
  const metaS = b.snaps.meta;
  const md = metaS?.data;
  const other = recs(b, 'other_ads');
  const gad = b.snaps.google_ads?.data;
  const mkCard = (id, title, wants, rows, spendKey, leadKey) => {
    const active = rows.length > 0;
    const tot = rows.reduce((a, r) => ({ spend: a.spend + (r[spendKey] || 0), impressions: a.impressions + (r.impressions || 0), clicks: a.clicks + (r.clicks || 0), leads: a.leads + (r[leadKey] || 0) }), { spend: 0, impressions: 0, clicks: 0, leads: 0 });
    return {
      id, title, active, wants,
      totals: active ? { ...tot, spend: round(tot.spend), cost_per_lead: tot.leads > 0 ? round(tot.spend / tot.leads) : null } : null,
      campaigns: active ? [...new Set(rows.map((r) => r.campaign).filter(Boolean))].slice(0, 8) : [],
      daily: active ? dailyRollup(rows, 'date', { spend: spendKey, leads: leadKey, clicks: 'clicks' }, w.d30, w.today) : [],
    };
  };
  const gRows = gad?.rows || [];
  const norm = (r) => ({ date: r.date, campaign: r.campaign, spend: r.cost ?? r.spend ?? 0, impressions: r.impressions || 0, clicks: r.clicks || 0, leads: r.conversions ?? r.leads ?? 0 });
  const ytRows = [...gRows.filter((r) => r.group === 'pmax' || r.group === 'youtube'), ...other.filter((r) => /youtube|performance_max|pmax/.test(r.platform))].map(norm);
  const cards = [
    mkCard('pmax_youtube', 'Google Performance Max and YouTube', 'Shows up automatically once the Google Ads reporting sheet includes Performance Max or video campaigns, or an agent posts YouTube numbers.', ytRows, 'spend', 'leads'),
    mkCard('tiktok', 'TikTok ads', 'Shows up automatically once TikTok numbers are posted to the dashboard (platform "tiktok").', other.filter((r) => r.platform === 'tiktok').map(norm), 'spend', 'leads'),
    mkCard('other', 'Other ads', 'Anything else (Nextdoor, Bing, Yelp, radio, mailers) shows up here once numbers are posted with that platform name.', other.filter((r) => !/tiktok|youtube|performance_max|pmax/.test(r.platform)).map(norm), 'spend', 'leads'),
  ];

  const metaDaily = md ? dailyRollup(md.daily, 'date', { spend: 'spend', leads: 'leads', clicks: 'clicks', impressions: 'impressions' }, w.d30, w.today) : [];
  return {
    updated: { meta: metaS?.as_of || null, google_ads: b.snaps.google_ads?.as_of || null, other_ads: b.push.other_ads?.as_of || null },
    launch_date: LAUNCH_DATE,
    meta: {
      ...snapInfo(metaS),
      account: md?.account || null,
      ranges: md ? Object.fromEntries(Object.entries(md.ranges).map(([k, v]) => [k, { since: v.since, until: v.until, ...v.account }])) : null,
      campaigns: md ? md.ranges.since_launch.campaigns.map((c) => ({ ...c, d7: pick(md.ranges.d7.campaigns, c.id), today: pick(md.ranges.today.campaigns, c.id) })) : [],
      campaigns_without_spend: md ? md.campaigns.filter((c) => !md.ranges.since_launch.campaigns.some((x) => x.id === c.id)).map((c) => ({ id: c.id, name: c.name, status: c.effective_status, daily_budget: c.daily_budget })) : [],
      adsets: md ? md.ranges.since_launch.adsets : [],
      ads: md ? md.ranges.since_launch.ads : [],
      daily: metaDaily,
    },
    google: {
      ...snapInfo(b.snaps.google_ads),
      totals: gad?.totals || null,
      campaigns: gad?.campaigns || [],
      daily: gad ? dailyRollup(gRows, 'date', { spend: 'cost', conversions: 'conversions', clicks: 'clicks' }, w.d30, w.today) : [],
    },
    cards,
    other_ads_status: snapInfo(b.push.other_ads),
  };
}
const pick = (list, id) => {
  const x = list.find((c) => c.id === id);
  return x ? { spend: x.spend, leads: x.leads, clicks: x.clicks, impressions: x.impressions, cost_per_lead: x.cost_per_lead } : null;
};

// ------------------------------------------------------------------ every lead
export function leads(b, { days = 120, now = Date.now() } = {}) {
  const r = recon(b, now);
  const cutoff = addDays(pacificDay(now), -days);
  return {
    updated: { ghl: b.snaps.ghl?.as_of || null, email_leads: b.push.email_leads?.as_of || null, nexa: b.push.nexa?.as_of || null },
    days,
    counts: r.counts,
    ghl_connected: r.ghl_connected,
    nexa_connected: r.nexa_connected,
    email_connected: recs(b, 'email_leads').length > 0,
    rows: r.rows.filter((x) => !x.arrived_at || pacificDay(x.arrived_at) >= cutoff),
  };
}

// ------------------------------------------------------------------ calls
export function calls(b, now = Date.now()) {
  const r = recon(b, now);
  const byKey = new Map(); // one entry per lead; Nexa sends one message per call result or follow-up
  for (const n of recs(b, 'nexa')) {
    const k = n.ghl_contact_id || digits10(n.phone) || normEmail(n.email) || n.lead_name || n.id;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(n);
  }
  const rowFor = (list) => r.rows.find((x) => (list.some((n) => n.ghl_contact_id && n.ghl_contact_id === x.ghl_contact_id)) || list.some((n) => digits10(n.phone) && digits10(n.phone) === digits10(x.phone)) || list.some((n) => normEmail(n.email) && normEmail(n.email) === normEmail(x.email)));
  const leadsOut = [];
  for (const list of byKey.values()) {
    const msgs = list.slice().sort((a, c) => (c.received_at || '').localeCompare(a.received_at || ''));
    const real = msgs.filter((m) => !isTestRecord({ name: m.lead_name, email: m.email, phone: m.phone }));
    if (!real.length) continue;
    const events = real.flatMap((m) => m.events || []).sort((a, c) => a.at.localeCompare(c.at));
    const row = rowFor(real);
    const outcomeMsg = real.find((m) => m.kind === 'lead_outcome' && m.outcome) || real[0];
    const first = events[0]?.at || null;
    leadsOut.push({
      lead_name: real.find((m) => m.lead_name)?.lead_name || row?.name || '',
      phone: real.find((m) => m.phone)?.phone || row?.phone || '',
      arrived_at: row?.arrived_at || null,
      attempt_count: events.length,
      first_attempt_at: first,
      last_attempt_at: events[events.length - 1]?.at || null,
      minutes_to_first_call: row?.arrived_at && first ? Math.max(0, round((Date.parse(first) - Date.parse(row.arrived_at)) / 60000, 1)) : null,
      outcome: outcomeMsg.outcome || '',
      status: real.find((m) => m.status)?.status || '',
      details: outcomeMsg.details || '',
      events: events.slice(-12),
      flags: [...new Set(real.flatMap((m) => m.flags || []))],
      in_ghl: Boolean(row?.in_ghl),
      ghl_calls: row?.ghl_calls || 0,
    });
  }
  leadsOut.sort((a, c) => (c.last_attempt_at || '').localeCompare(a.last_attempt_at || ''));
  const delays = leadsOut.map((l) => l.minutes_to_first_call).filter((x) => x != null);
  const outcomes = {};
  for (const l of leadsOut) outcomes[l.outcome || 'No outcome recorded'] = (outcomes[l.outcome || 'No outcome recorded'] || 0) + 1;
  return {
    updated: { nexa: b.push.nexa?.as_of || null, ghl: b.snaps.ghl?.as_of || null },
    connected: leadsOut.length > 0 || recs(b, 'nexa').length > 0,
    totals: {
      leads: leadsOut.length,
      attempts: leadsOut.reduce((s, l) => s + l.attempt_count, 0),
      avg_attempts: leadsOut.length ? round(leadsOut.reduce((s, l) => s + l.attempt_count, 0) / leadsOut.length, 1) : null,
      avg_minutes_to_first_call: mean(delays),
      not_in_ghl: leadsOut.filter((l) => !l.in_ghl).length,
      with_flags: leadsOut.filter((l) => l.flags.length).length,
    },
    outcomes: Object.entries(outcomes).map(([outcome, count]) => ({ outcome, count })).sort((a, c) => c.count - a.count),
    rows: leadsOut.slice(0, 400),
  };
}

// ------------------------------------------------------------------ appointments and sales
export function sales(b, now = Date.now()) {
  const g = ghlOf(b);
  const w = windows(now);
  const contactsById = new Map((g?.contacts || []).map((c) => [c.id, c]));
  const appts = (g?.appointments || [])
    .map((a) => ({ ...a, contact_name: contactsById.get(a.contact_id)?.name || a.title }))
    .filter((a) => !isTestRecord({ name: a.contact_name }));
  const recent = appts.filter((a) => pacificDay(a.start) >= w.d30 || Date.parse(a.start) > now);
  const count = (list, st) => list.filter((a) => a.status === st).length;
  const robin = recent.filter((a) => a.is_robin);
  const sum = (list) => ({ total: list.length, booked: count(list, 'booked'), confirmed: count(list, 'confirmed'), showed: count(list, 'showed'), no_show: count(list, 'no-show'), cancelled: count(list, 'cancelled') });
  const upcoming = appts.filter((a) => Date.parse(a.start) > now && a.status !== 'cancelled').sort((x, y) => x.start.localeCompare(y.start)).slice(0, 25);
  const events = recs(b, 'sales_agent').slice().sort((a, c) => (c.at || '').localeCompare(a.at || ''));
  const evTypes = {};
  for (const e of events.filter((x) => pacificDay(x.at) >= w.d30)) evTypes[e.event_type] = (evTypes[e.event_type] || 0) + 1;
  return {
    updated: { ghl: b.snaps.ghl?.as_of || null, sales_agent: b.push.sales_agent?.as_of || null },
    ghl_connected: Boolean(g),
    agent_connected: events.length > 0,
    robin: sum(robin),
    all: sum(recent),
    calendars: (g?.calendars || []).map((c) => ({ id: c.id, name: c.name, count: appts.filter((a) => a.calendar_id === c.id).length })),
    upcoming,
    recent: recent.filter((a) => Date.parse(a.start) <= now).slice(0, 60),
    agent_events: events.slice(0, 80),
    agent_event_types: Object.entries(evTypes).map(([type, count]) => ({ type, count })).sort((a, c) => c.count - a.count),
  };
}

// ------------------------------------------------------------------ search console
export function search(b) {
  const s = b.snaps.gsc;
  return { updated: { gsc: s?.as_of || null }, status: s?.status || 'not_connected', error: s?.error || null, needs: s?.needs || [], notes: s?.notes || [], stale: !!s?.stale, data: s?.data || null };
}

// ------------------------------------------------------------------ social
export function social(b) {
  const pagePosts = b.snaps.meta?.data?.page_posts || [];
  const posts = [...(b.social.posts || []), ...pagePosts].slice().sort((a, c) => a.scheduled_at.localeCompare(c.scheduled_at));
  const counts = {};
  for (const p of posts) counts[p.status] = (counts[p.status] || 0) + 1;
  return { updated: { social: b.social.as_of || null, facebook_page: b.snaps.meta?.as_of || null }, posts, counts, page_connected: pagePosts.length > 0 };
}

// ------------------------------------------------------------------ tasks
export function tasks(b) {
  const list = b.tasks.tasks || [];
  const open = list.filter((t) => t.status !== 'done_live');
  return {
    updated: { tasks: list.reduce((m, t) => (t.updated_at > m ? t.updated_at : m), '') || null },
    statuses: STATUSES,
    categories: CATEGORIES,
    tasks: list.slice().sort((a, c) => (a.status === 'done_live') - (c.status === 'done_live') || (c.updated_at || '').localeCompare(a.updated_at || '')),
    counts: { open: open.length, done: list.length - open.length, by_category: Object.fromEntries(CATEGORIES.map((k) => [k, open.filter((t) => t.category === k).length])) },
  };
}

// ------------------------------------------------------------------ connections
const WHAT = {
  ghl: 'Leads, opportunities, appointments, who contacted each lead and how fast',
  meta: 'Facebook and Instagram ad spend, reach, clicks, leads, cost per lead, by campaign, ad set and ad',
  google_ads: 'Google Ads spend and conversions by campaign, including Performance Max and YouTube',
  gsc: 'How people find the website on Google: clicks, views, average position, top searches and pages',
  nexa: 'Every call attempt Nexa made to a new lead, checked against GoHighLevel',
  email_leads: 'Leads that arrive by email, matched to GoHighLevel',
  sales_agent: 'What the AI sales assistant did for each lead',
  other_ads: 'TikTok and any other ad platform numbers',
};
const KIND = { ghl: 'Pulled twice a day', meta: 'Pulled twice a day', google_ads: 'Pulled twice a day', gsc: 'Pulled twice a day', nexa: 'Pushed by an agent', email_leads: 'Pushed by an agent', sales_agent: 'Pushed by an agent', other_ads: 'Pushed by an agent' };

export function connections(b, now = Date.now()) {
  const items = [];
  const add = (id, s) => {
    const status = s?.status || 'not_connected';
    items.push({
      id, label: s?.label || id, what: WHAT[id], how: KIND[id], status, stale: !!s?.stale,
      as_of: s?.as_of || null, checked_at: s?.checked_at || null, error: s?.error || null, notes: s?.notes || [], needs: s?.needs || [],
    });
  };
  add('ghl', b.snaps.ghl || { label: 'GoHighLevel' });
  add('meta', b.snaps.meta || { label: 'Meta ads (Facebook + Instagram)' });
  add('google_ads', b.snaps.google_ads || { label: 'Google Ads' });
  add('gsc', b.snaps.gsc || { label: 'Google Search Console' });
  for (const id of ['nexa', 'email_leads', 'sales_agent', 'other_ads']) add(id, b.push[id]);
  items.push({
    id: 'social', label: 'Social posts', what: 'Content calendar: planned, waiting approval, scheduled, published and failed posts', how: 'Typed in on the dashboard or pushed by an agent',
    status: (b.social.posts || []).length ? 'ok' : 'not_connected', stale: false, as_of: b.social.as_of || null, checked_at: null, error: null, notes: [],
    needs: (b.social.posts || []).length ? [] : [{ who: 'Taj', what: 'Add the first planned posts on the Social tab, or have the content agent post them.' }],
  });
  const todo = items.filter((i) => i.status !== 'ok' || i.stale || i.notes.length);
  return { updated: updatedTimes(b), items, todo_count: items.filter((i) => i.status !== 'ok').length };
}
