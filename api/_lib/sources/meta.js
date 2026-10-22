/**
 * Meta (Facebook + Instagram) ads connector, Marketing API insights.
 *
 * Env: META_ADS_TOKEN (system-user token with ads_read), META_AD_ACCOUNT_ID
 * (digits, with or without "act_"), META_GRAPH_VERSION (default v23.0).
 * Optional: META_PAGE_ID, to also read the Facebook Page's published and
 * scheduled posts (and basic results per post) for the social calendar. This
 * needs the pages_show_list and pages_read_engagement permissions on the token
 * and the Page assigned to the system user.
 */
import { fetchJson, num, pacificDay, addDays, LAUNCH_DATE, round, str, toIso } from '../util.js';
import { errorSnapshot, missingEnv, notConnected, okSnapshot } from './common.js';

export const id = 'meta';
export const label = 'Meta ads (Facebook + Instagram)';

const FIELDS = 'campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,reach,frequency,clicks,inline_link_clicks,ctr,cpc,cpm,actions,cost_per_action_type,date_start,date_stop';

/**
 * Lead count from Meta's `actions` list. Meta's own "lead" total already
 * includes onsite (lead_grouped) and pixel leads, so adding them together would
 * double count. Use "lead" when present, else add the pieces.
 */
export function leadsFromActions(actions = []) {
  const by = Object.fromEntries((actions || []).map((a) => [a.action_type, num(a.value)]));
  if (by.lead != null && by.lead > 0) return by.lead;
  let n = by['onsite_conversion.lead_grouped'] || 0;
  for (const [k, v] of Object.entries(by)) if (/^offsite_conversion\.(fb_pixel_lead|lead)/.test(k) || k === 'offsite_conversion.fb_pixel_lead') n += v;
  return n;
}

export function metrics(row) {
  const spend = num(row.spend);
  const leads = leadsFromActions(row.actions);
  return {
    spend: round(spend),
    impressions: num(row.impressions),
    reach: num(row.reach),
    frequency: round(num(row.frequency)),
    clicks: num(row.clicks),
    link_clicks: num(row.inline_link_clicks),
    ctr: round(num(row.ctr)),
    cpc: round(num(row.cpc)),
    cpm: round(num(row.cpm)),
    leads,
    cost_per_lead: leads > 0 ? round(spend / leads) : null,
  };
}

export function metaError(e) {
  const code = e.body?.error?.code;
  const msg = e.body?.error?.message || e.message;
  if (code === 190 || e.status === 401) {
    return errorSnapshot(id, label, 'Meta says the access token expired or was revoked.', [{ who: 'Blaine', what: 'In Meta Business Settings, open the system user, generate a new token with the ads_read permission (never expires), and put it in META_ADS_TOKEN in Vercel.' }]);
  }
  if (code === 200 || code === 10 || code === 100 || e.status === 403) {
    return errorSnapshot(id, label, `Meta would not show the ad account: ${str(msg, 160)}`, [{ who: 'Blaine', what: 'In Business Settings, make sure the system user is assigned to the Killua ad account with at least "View performance", and that META_AD_ACCOUNT_ID is the right number.' }]);
  }
  return errorSnapshot(id, label, `Meta could not be read: ${str(msg, 200)}`, [{ who: 'Revelation', what: 'Try Refresh now later; if it keeps failing, check the token and ad account number.' }]);
}

/** Facebook Page posts for the social calendar. Never fails the ad numbers: problems become notes. */
export async function readPagePosts({ pageId, token, base, fetchImpl, notes }) {
  let tok = token;
  const get = (path, params) => fetchJson(`${base}${path}?${new URLSearchParams({ ...params, access_token: tok })}`, {}, { fetchImpl });
  try {
    const pj = await get(`/${pageId}`, { fields: 'access_token' });
    if (pj.access_token) tok = pj.access_token; // page token, when the system user manages the Page
  } catch {
    /* fall back to the token we have */
  }
  const posts = [];
  try {
    const pub = await get(`/${pageId}/published_posts`, { fields: 'id,message,created_time,permalink_url,full_picture,shares,reactions.summary(true).limit(0),comments.summary(true).limit(0)', limit: 50 });
    for (const p of pub.data || []) {
      posts.push({ id: `fb_${p.id}`, platform: 'facebook', status: 'published', scheduled_at: toIso(p.created_time), caption: str(p.message, 2200), link: p.permalink_url || '', media_url: p.full_picture || '', origin: 'page', metrics: { reactions: p.reactions?.summary?.total_count || 0, comments: p.comments?.summary?.total_count || 0, shares: p.shares?.count || 0, reach: null, clicks: null }, _raw_id: p.id });
    }
  } catch (e) {
    notes.push(`Could not read the Facebook Page's published posts (${str(e.body?.error?.message || e.message, 120)}). Check META_PAGE_ID and that the token has pages_read_engagement.`);
    return posts;
  }
  try {
    const sch = await get(`/${pageId}/scheduled_posts`, { fields: 'id,message,scheduled_publish_time,permalink_url,full_picture', limit: 50 });
    for (const p of sch.data || []) posts.push({ id: `fb_${p.id}`, platform: 'facebook', status: 'scheduled', scheduled_at: toIso(p.scheduled_publish_time), caption: str(p.message, 2200), link: p.permalink_url || '', media_url: p.full_picture || '', origin: 'page', metrics: null });
  } catch {
    notes.push('Could not read scheduled Facebook posts; published posts are still shown.');
  }
  // basic results for the newest posts; Meta retires metrics from time to time, so each one is optional
  for (const p of posts.filter((x) => x.status === 'published').slice(0, 20)) {
    for (const [metric, key] of [['post_impressions_unique', 'reach'], ['post_clicks', 'clicks']]) {
      try {
        const j = await get(`/${p._raw_id}/insights`, { metric });
        p.metrics[key] = j.data?.[0]?.values?.[0]?.value ?? null;
      } catch {
        /* metric not available for this post or token */
      }
    }
  }
  for (const p of posts) delete p._raw_id;
  return posts.filter((p) => p.scheduled_at);
}

export async function run(ctx) {
  const { env = process.env, fetchImpl = fetch } = ctx;
  const missing = missingEnv(env, ['META_ADS_TOKEN', 'META_AD_ACCOUNT_ID']);
  if (missing.length) {
    return notConnected(id, label, [
      { who: 'Blaine', what: `Create a Meta system-user token with ads_read on the Killua ad account and add ${missing.join(' and ')} in Vercel. Steps are in docs/dashboard-setup.md.` },
    ]);
  }
  const ver = env.META_GRAPH_VERSION || 'v23.0';
  const acct = `act_${String(env.META_AD_ACCOUNT_ID).replace(/^act_/, '').trim()}`;
  const token = env.META_ADS_TOKEN.trim();
  const base = `https://graph.facebook.com/${ver}`;
  const call = (path, params) => {
    const q = new URLSearchParams({ ...params, access_token: token });
    return fetchJson(`${base}${path}?${q}`, {}, { fetchImpl });
  };
  const all = async (path, params, max = 20) => {
    const out = [];
    let body = await call(path, { ...params, limit: 200 });
    for (let i = 0; i < max; i++) {
      out.push(...(body.data || []));
      const next = body.paging?.next;
      if (!next) break;
      body = await fetchJson(next, {}, { fetchImpl });
    }
    return out;
  };
  try {
    const today = pacificDay(new Date());
    const ranges = {
      today: [today, today],
      d7: [addDays(today, -6), today],
      d30: [addDays(today, -29), today],
      since_launch: [LAUNCH_DATE, today],
    };
    const notes = [];

    // account details (some fields may be hidden from a view-only token)
    let account = {};
    try {
      const a = await call(`/${acct}`, { fields: 'name,currency,account_status,disable_reason,spend_cap,amount_spent,balance,timezone_name,min_daily_budget' });
      account = {
        name: a.name || '',
        currency: a.currency || 'USD',
        status: { 1: 'Active', 2: 'Disabled', 3: 'Payment problem', 7: 'In review', 9: 'In grace period', 101: 'Closed' }[a.account_status] || String(a.account_status ?? ''),
        spend_cap: a.spend_cap ? num(a.spend_cap) / 100 : null,
        amount_spent: a.amount_spent ? num(a.amount_spent) / 100 : null,
        balance: a.balance ? num(a.balance) / 100 : null,
        timezone: a.timezone_name || '',
      };
    } catch (e) {
      if (e.status === 401 || e.body?.error?.code === 190) throw e;
      notes.push('Could not read account limits (spending cap, balance).');
    }

    // status and budgets
    const sel = 'id,name,status,effective_status,daily_budget,lifetime_budget,objective,campaign_id,adset_id';
    const [campaigns, adsets, ads] = await Promise.all([
      all(`/${acct}/campaigns`, { fields: sel }),
      all(`/${acct}/adsets`, { fields: sel }),
      all(`/${acct}/ads`, { fields: 'id,name,status,effective_status,campaign_id,adset_id' }),
    ]);
    const meta = (x) => ({ id: x.id, name: x.name, status: x.status, effective_status: x.effective_status, daily_budget: x.daily_budget ? num(x.daily_budget) / 100 : null, lifetime_budget: x.lifetime_budget ? num(x.lifetime_budget) / 100 : null, objective: x.objective || '', campaign_id: x.campaign_id || '', adset_id: x.adset_id || '' });

    // insights per range and level
    const out = {};
    for (const [key, [since, until]] of Object.entries(ranges)) {
      out[key] = { since, until };
      const params = (level, extra = {}) => ({ level, fields: FIELDS, time_range: JSON.stringify({ since, until }), ...extra });
      const [acc, camp, adset, ad] = await Promise.all(['account', 'campaign', 'adset', 'ad'].map((lv) => all(`/${acct}/insights`, params(lv))));
      out[key].account = acc[0] ? metrics(acc[0]) : metrics({});
      out[key].campaigns = camp.map((r) => ({ id: r.campaign_id, name: r.campaign_name, ...metrics(r) }));
      out[key].adsets = adset.map((r) => ({ id: r.adset_id, name: r.adset_name, campaign_id: r.campaign_id, ...metrics(r) }));
      out[key].ads = ad.map((r) => ({ id: r.ad_id, name: r.ad_name, adset_id: r.adset_id, campaign_id: r.campaign_id, ...metrics(r) }));
    }

    // daily series (campaign level) for charts and week/month sums
    const dailyFrom = addDays(today, -60);
    const dailyRows = await all(`/${acct}/insights`, { level: 'campaign', fields: FIELDS, time_increment: 1, time_range: JSON.stringify({ since: dailyFrom, until: today }) }, 40);
    const daily = dailyRows.map((r) => ({ date: r.date_start, campaign_id: r.campaign_id, campaign: r.campaign_name, ...metrics(r) }));

    const data = {
      account,
      ranges: out,
      daily,
      campaigns: campaigns.map(meta),
      adsets: adsets.map(meta),
      ads: ads.map(meta),
      graph_version: ver,
      page_posts: [],
    };
    if (String(env.META_PAGE_ID || '').trim()) data.page_posts = await readPagePosts({ pageId: env.META_PAGE_ID.trim(), token, base, fetchImpl, notes });
    // join status onto insight rows
    const byId = (list) => new Map(list.map((x) => [x.id, x]));
    const cm = byId(data.campaigns), am = byId(data.adsets), dm = byId(data.ads);
    for (const r of Object.values(out)) {
      for (const c of r.campaigns || []) Object.assign(c, { status: cm.get(c.id)?.effective_status || '', daily_budget: cm.get(c.id)?.daily_budget ?? null });
      for (const c of r.adsets || []) Object.assign(c, { status: am.get(c.id)?.effective_status || '', daily_budget: am.get(c.id)?.daily_budget ?? null });
      for (const c of r.ads || []) Object.assign(c, { status: dm.get(c.id)?.effective_status || '' });
    }
    const spent = out.since_launch.account.spend;
    if (spent === 0 && !out.since_launch.campaigns.length) notes.push('No spend recorded since launch yet.');
    return okSnapshot(id, label, data, { notes });
  } catch (e) {
    return metaError(e);
  }
}
