/* Killua dashboard. Every value that comes from data goes through html`` (auto-escaped). */
(() => {
  'use strict';
  
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  // ------------------------------------------------------------ safe templating
  class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const val = (x) => (x instanceof Raw ? x.s : Array.isArray(x) ? x.map(val).join('') : x == null || x === false ? '' : esc(x));
  const html = (st, ...v) => new Raw(st.reduce((a, s, i) => a + s + (i < v.length ? val(v[i]) : ''), ''));
  const raw = (s) => new Raw(s);
  const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '');

  // ------------------------------------------------------------ formatting
  const tf = (o) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', ...o });
  const F = {
    dt: tf({ month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
    d: tf({ month: 'short', day: 'numeric' }),
    dw: tf({ weekday: 'short', month: 'short', day: 'numeric' }),
    t: tf({ hour: 'numeric', minute: '2-digit' }),
    ymd: tf({ year: 'numeric', month: '2-digit', day: '2-digit' }),
  };
  const when = (iso) => (iso && !Number.isNaN(Date.parse(iso)) ? F.dt.format(new Date(iso)) : '–');
  const dayOnly = (iso) => (iso && !Number.isNaN(Date.parse(iso)) ? F.d.format(new Date(iso)) : '–');
  const ymd = (iso) => { const p = F.ymd.formatToParts(new Date(iso)); const g = (t) => p.find((x) => x.type === t).value; return `${g('year')}-${g('month')}-${g('day')}`; };
  const hm = (iso) => { const p = tf({ hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(iso)); const g = (t) => p.find((x) => x.type === t).value; return `${g('hour')}:${g('minute')}`; };
  const money = (n, d) => (n == null ? '–' : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: d ?? (Math.abs(n) >= 100 ? 0 : 2), maximumFractionDigits: d ?? (Math.abs(n) >= 100 ? 0 : 2) }));
  const int = (n) => (n == null ? '–' : Math.round(n).toLocaleString('en-US'));
  const pct = (n) => (n == null ? '–' : `${Number(n).toFixed(1)}%`);
  const mins = (m) => (m == null ? '–' : m < 90 ? `${Math.round(m)} min` : m < 2880 ? `${(m / 60).toFixed(1)} hr` : `${(m / 1440).toFixed(1)} days`);
  const yn = (b) => (b ? html`<span class="pill ok">Yes</span>` : html`<span class="pill bad">No</span>`);
  const LABELS = { ghl: 'GoHighLevel', meta: 'Meta ads', google_ads: 'Google Ads', gsc: 'Search Console', nexa: 'Nexa', email_leads: 'Lead emails', sales_agent: 'Sales assistant', other_ads: 'Other ads', social: 'Social', tasks: 'Tasks', facebook_page: 'Facebook Page' };
  const upd = (u) => {
    const ent = Object.entries(u || {});
    const times = ent.map(([, v]) => v).filter(Boolean).map((v) => Date.parse(v));
    if (times.length && times.length === ent.length && Math.max(...times) - Math.min(...times) < 10 * 60000) return html`<span class="upd">Updated ${when(new Date(Math.max(...times)).toISOString())}</span>`;
    const parts = ent.map(([k, v]) => (v ? `${LABELS[k] || k} updated ${when(v)}` : `${LABELS[k] || k} not updated yet`));
    return html`<span class="upd">${parts.length ? parts.join(' · ') : 'Not updated yet'}</span>`;
  };
  const monthName = (k) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short' }).format(new Date(`${k.slice(0, 7)}-15T12:00:00Z`));
  const weekName = (k) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(new Date(`${k}T12:00:00Z`));
  const PALETTE = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)'];

  // ------------------------------------------------------------ plumbing
  let ME = null;
  const view = $('#view');
  const toast = (m) => { const t = document.createElement('div'); t.className = 'toast'; t.textContent = m; document.body.append(t); setTimeout(() => t.remove(), 3500); };
  async function api(path, body) {
    const opt = { credentials: 'same-origin', headers: { Accept: 'application/json' } };
    if (body !== undefined) { opt.method = 'POST'; opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    const res = await fetch(`/api/dash/${path}`, opt);
    if (res.status === 401) { location.href = '/dashboard/login/'; throw new Error('login'); }
    let j = {};
    try { j = await res.json(); } catch { /* not json */ }
    if (!res.ok) { const e = new Error((j.errors && j.errors.join(' ')) || j.message || j.error || `Error ${res.status}`); e.status = res.status; e.body = j; throw e; }
    return j;
  }
  const setView = (h) => { view.innerHTML = h instanceof Raw ? h.s : h; };

  const TABS = [
    ['overview', 'Overview'], ['ads', 'Ads'], ['leads', 'Every lead'], ['calls', 'Calls'], ['sales', 'Appointments & sales'],
    ['search', 'Search'], ['social', 'Social & content'], ['tasks', "Blaine's tasks"], ['connections', 'Connections'],
  ];
  const head = (title, u, note) => html`<div class="head"><h2 class="sec">${title}</h2>${u ? upd(u) : ''}${note ? html`<p class="note">${note}</p>` : ''}</div>`;
  const needsList = (needs) => (needs && needs.length ? html`<ul class="needs">${needs.map((n) => html`<li><b>${n.who}:</b> ${n.what}</li>`)}</ul>` : '');
  const banner = (title, text, needs, bad) => html`<div class="banner ${bad ? 'bad' : ''}"><b>${title}</b>${text || ''}${needsList(needs)}</div>`;
  const tile = (n, l, s, off) => html`<div class="tile ${off ? 'off' : ''}"><div class="n">${n}</div><div class="l">${l}</div>${s ? html`<div class="s">${s}</div>` : ''}</div>`;
  const statusBanner = (s) => {
    if (!s) return '';
    if (s.status === 'not_connected') return banner('Not connected yet', 'Numbers will appear here as soon as this is set up.', s.needs);
    if (s.status === 'error') return banner('Problem reading this source', ` ${s.error || ''}${s.stale ? ' Showing the last good numbers.' : ''}`, s.needs, true);
    return s.notes && s.notes.length ? html`<p class="note">${s.notes.join(' ')}</p>` : '';
  };

  // ------------------------------------------------------------ charts
  function stacked(series, sources) {
    const max = Math.max(1, ...series.map((s) => s.total));
    const cols = series.map((s) => {
      const segs = [...sources.map((k, i) => [s.parts[k] || 0, PALETTE[i]]), [s.other, PALETTE[5]]].filter(([n]) => n > 0);
      return html`<div class="col" style="height:${(s.total / max) * 100}%"><span class="tot" style="bottom:calc(100% + 2px)">${s.total || ''}</span>${segs.map(([n, c]) => html`<div class="seg" style="flex:${n};background:${raw(c)}"></div>`)}</div>`;
    });
    return html`<div class="cols" role="img" aria-label="Leads per period, stacked by source">${cols}</div><div class="months">${series.map((s) => html`<span>${s.label}</span>`)}</div>
      <div class="legend">${sources.map((k, i) => html`<span><i style="background:${raw(PALETTE[i])}"></i>${k}</span>`)}<span><i style="background:${raw(PALETTE[5])}"></i>Other</span></div>`;
  }
  function spark(rows, key, title, fmt = int, alt) {
    const max = Math.max(...rows.map((r) => r[key]), 0.0001);
    const total = rows.reduce((a, r) => a + r[key], 0);
    return html`<p class="sparkt"><span>${title}</span><span>${fmt(total)}</span></p>
      <div class="spark ${alt ? 'alt' : ''}" role="img" aria-label="${title}, last ${rows.length} days, total ${fmt(total)}">${rows.map((r) => html`<i title="${dayOnly(r.date + 'T19:00:00Z')}: ${fmt(r[key])}" style="height:${(r[key] / max) * 100}%"></i>`)}</div>
      <div class="sparkx"><span>${rows.length ? dayOnly(rows[0].date + 'T19:00:00Z') : ''}</span><span>${rows.length ? dayOnly(rows[rows.length - 1].date + 'T19:00:00Z') : ''}</span></div>`;
  }
  const barList = (items, label = 'source') => {
    const max = Math.max(1, ...items.map((i) => i.count));
    return items.length ? html`<div class="stages">${items.map((i) => html`<div class="stage"><span class="s">${i[label]}</span><span class="track"><span class="bar" style="display:block;width:${(i.count / max) * 100}%"></span></span><span class="v">${i.count}</span></div>`)}</div>` : html`<p class="empty">Nothing yet.</p>`;
  };

  // ------------------------------------------------------------ OVERVIEW
  async function vOverview() {
    const o = await api('overview');
    const L = o.leads, A = o.appointments, S = o.speed, P = o.pipeline;
    setView(html`${head('Overview', o.updated)}
      <p class="take">${o.summary}</p>
      <div class="tiles">
        ${tile(L.week.total, 'Leads this week', `${L.month.total} this month`)}
        ${tile(L.month.total, 'Leads this month')}
        ${tile(o.spend.known ? money(o.spend.month.total) : '–', 'Ad spend this month', o.spend.known ? `${money(o.spend.week.total)} this week` : 'Ads not connected', !o.spend.known)}
        ${tile(o.cpl.month != null ? money(o.cpl.month) : '–', 'Cost per lead, all sources blended', o.cpl.week != null ? `${money(o.cpl.week)} this week` : 'This month', o.cpl.month == null)}
        ${tile(A.month.booked, 'Appointments booked this month', `${A.week.booked} this week`)}
        ${tile(A.month.ran, 'Appointments that ran this month', `${A.week.ran} this week`)}
        ${tile(mins(S.month_avg), 'Average speed to first call or text', S.leads_month ? `${S.contacted_month} of ${S.leads_month} leads reached this month` : 'This month', S.month_avg == null)}
        ${tile(P.open, 'Open opportunities', P.open_value ? `${money(P.open_value)} potential` : '')}
        ${tile(P.won_total, 'Won in total', `${P.won_month} this month${P.won_value ? ` · ${money(P.won_value)}` : ''}`)}
      </div>
      ${!o.connected.ghl ? banner('GoHighLevel is not connected', 'Lead, appointment and pipeline numbers need it.', [{ who: 'Blaine', what: 'See Connections for the exact step.' }]) : ''}
      ${o.attention.count ? html`<div class="card"><h3>Leads that need a look <small>${o.attention.count} in total · full list under Every lead</small></h3>
        <div class="rows">${o.attention.recent.map((r) => html`<div class="row"><span class="t">${r.name || 'Unnamed lead'}</span><span class="pill bad">${r.flags[0]}</span><span class="d">${r.source} · arrived ${when(r.arrived_at)}${r.flags.length > 1 ? ` · also: ${r.flags.slice(1).join(', ')}` : ''}</span></div>`)}</div>
        <p style="margin:12px 0 0"><a class="btn small" href="#leads">Open every lead</a></p></div>` : ''}
      <div class="grid two">
        <div class="card"><h3>Where leads came from <small>this week · ${L.week.total}</small></h3>${barList(L.week.by_source)}</div>
        <div class="card"><h3>Where leads came from <small>this month · ${L.month.total}</small></h3>${barList(L.month.by_source)}</div>
      </div>
      <div class="grid two">
        <div class="card"><h3>New leads by week <small>last 10 weeks</small></h3>${stacked(o.series.weekly.map((x) => ({ ...x, label: weekName(x.key) })), o.series.sources)}</div>
        <div class="card"><h3>New leads by month</h3>${stacked(o.series.monthly.map((x) => ({ ...x, label: monthName(x.key) })), o.series.sources)}</div>
      </div>
      <p class="note">A lead is one person, counted once even if they show up in GoHighLevel, the lead email and Nexa. Test records are left out.</p>`);
  }

  // ------------------------------------------------------------ ADS
  let adsRange = 'since_launch';
  const RANGE_LABEL = { today: 'Today', d7: 'Last 7 days', d30: 'Last 30 days', since_launch: 'Since launch (Oct 17)' };
  const statusPill = (s) => {
    const x = String(s || '').toUpperCase();
    return x === 'ACTIVE' ? html`<span class="pill ok">Running</span>` : x === 'PAUSED' || x === 'CAMPAIGN_PAUSED' || x === 'ADSET_PAUSED' ? html`<span class="pill off">Paused</span>` : x ? html`<span class="pill warn">${x.replace(/_/g, ' ').toLowerCase()}</span>` : '';
  };
  async function vAds() {
    const a = await api('ads');
    const m = a.meta;
    const r = m.ranges ? m.ranges[adsRange] : null;
    const acc = r ? r.account : null;
    const adTable = (rows, empty) => rows.length ? html`<div class="scroll"><table class="tbl"><thead><tr><th>Name</th><th>Status</th><th class="num">Budget / day</th><th class="num">Spent</th><th class="num">Leads</th><th class="num">Cost per lead</th><th class="num">Clicks</th><th class="num">CTR</th></tr></thead><tbody>
      ${rows.map((c) => html`<tr><td data-l="Name" class="nm">${c.name}</td><td data-l="Status">${statusPill(c.status)}</td><td data-l="Budget / day" class="num">${c.daily_budget != null ? money(c.daily_budget) : '–'}</td><td data-l="Spent" class="num">${money(c.spend)}</td><td data-l="Leads" class="num">${int(c.leads)}</td><td data-l="Cost per lead" class="num">${money(c.cost_per_lead)}</td><td data-l="Clicks" class="num">${int(c.clicks)}</td><td data-l="CTR" class="num">${pct(c.ctr)}</td></tr>`)}</tbody></table></div>` : html`<p class="empty">${empty}</p>`;
    const cards = a.cards.map((c) => c.active ? html`<div class="card"><h3>${c.title} <small>${c.campaigns.join(', ')}</small></h3>
        <div class="tiles three">${tile(money(c.totals.spend), 'Spent, last 30 days')}${tile(int(c.totals.clicks), 'Clicks')}${tile(money(c.totals.cost_per_lead), 'Cost per lead / conversion')}</div>
        <div style="margin-top:14px">${spark(c.daily, 'spend', 'Spend per day', money)}</div></div>`
      : html`<div class="card dash"><h3>${c.title} <span class="pill off">Waiting for data</span></h3><p class="note">${c.wants}</p></div>`);
    const meta = html`<div class="card"><h3>Facebook and Instagram ads <small>${m.account?.name || ''} ${m.account?.status ? `· account ${m.account.status}` : ''}</small></h3>
      ${statusBanner(m)}
      ${m.status === 'not_connected' ? '' : html`
        <div class="chips" role="group" aria-label="Date range">${Object.entries(RANGE_LABEL).map(([k, v]) => html`<button class="chip" type="button" data-act="range" data-v="${k}" aria-pressed="${k === adsRange}">${v}</button>`)}</div>
        ${acc ? html`<div class="tiles" style="margin-top:14px">
          ${tile(money(acc.spend), 'Spent')}${tile(int(acc.reach), 'People reached', `${acc.frequency || 0} times each on average`)}${tile(int(acc.impressions), 'Times shown')}
          ${tile(int(acc.link_clicks || acc.clicks), 'Clicks to the form', `${int(acc.clicks)} clicks of any kind`)}${tile(int(acc.leads), 'Leads')}${tile(money(acc.cost_per_lead), 'Cost per lead')}
          ${tile(pct(acc.ctr), 'Click rate')}${tile(money(acc.cpc), 'Cost per click')}${tile(money(acc.cpm), 'Cost per 1,000 views')}</div>` : ''}
        ${m.account && (m.account.spend_cap || m.account.balance != null) ? html`<p class="note" style="margin-top:12px">${m.account.spend_cap ? `Account spending limit ${money(m.account.spend_cap)}; spent so far ${money(m.account.amount_spent)}. ` : ''}${m.account.balance != null ? `Unpaid balance ${money(m.account.balance)}.` : ''}</p>` : ''}
        ${m.daily.length ? html`<div class="grid two" style="margin-top:14px"><div>${spark(m.daily, 'spend', 'Spend per day, last 30 days', money)}</div><div>${spark(m.daily, 'leads', 'Leads per day, last 30 days', int, true)}</div></div>` : ''}`}</div>
      ${r ? html`<div class="card"><h3>Campaigns <small>${RANGE_LABEL[adsRange]}</small></h3>${adTable(r.campaigns, 'No campaign spent anything in this range.')}
        ${r.campaigns.length ? html`<div style="margin-top:14px">${r.campaigns.map((c) => {
          const sets = r.adsets.filter((s) => s.campaign_id === c.id);
          return sets.length ? html`<details><summary>${c.name}: ad sets and ads</summary><div style="padding:6px 0 12px">
            ${sets.map((s) => html`<p class="sub" style="margin:10px 0 4px"><b>Ad set:</b> ${s.name}</p>${adTable([s, ...r.ads.filter((x) => x.adset_id === s.id).map((x) => ({ ...x, name: `Ad: ${x.name}` }))], '')}`)}</div></details>` : '';
        })}</div>` : ''}
        ${m.campaigns_without_spend.length ? html`<p class="note" style="margin-top:12px">Set up but not spending in this range: ${m.campaigns_without_spend.map((c) => `${c.name} (${String(c.status).toLowerCase().replace(/_/g, ' ')})`).join(', ')}.</p>` : ''}</div>` : ''}`;
    const g = a.google;
    const google = html`<div class="card"><h3>Google Ads <small>${g.status === 'ok' ? 'from the daily reporting sheet' : ''}</small></h3>${statusBanner(g)}
      ${g.totals ? html`<div class="tiles three">${tile(money(g.totals.d30.cost), 'Spent, last 30 days', `${money(g.totals.d7.cost)} last 7 days`)}${tile(int(g.totals.d30.clicks), 'Clicks', `${pct(g.totals.d30.ctr)} click rate`)}${tile(money(g.totals.d30.cost_per_conversion), 'Cost per conversion', `${int(g.totals.d30.conversions)} conversions`)}</div>
        <div style="margin-top:14px">${spark(g.daily, 'spend', 'Spend per day, last 30 days', money)}</div>
        <div class="scroll" style="margin-top:14px"><table class="tbl"><thead><tr><th>Campaign</th><th>Type</th><th class="num">Spent (30 days)</th><th class="num">Clicks</th><th class="num">Conversions</th><th class="num">Cost per conversion</th></tr></thead><tbody>
        ${g.campaigns.map((c) => html`<tr><td data-l="Campaign" class="nm">${c.campaign}</td><td data-l="Type">${String(c.type).replace(/_/g, ' ').toLowerCase()}</td><td data-l="Spent" class="num">${money(c.cost)}</td><td data-l="Clicks" class="num">${int(c.clicks)}</td><td data-l="Conversions" class="num">${int(c.conversions)}</td><td data-l="Cost per conv." class="num">${money(c.cost_per_conversion)}</td></tr>`)}</tbody></table></div>` : ''}</div>`;
    setView(html`${head('Ads', a.updated, 'Facebook and Instagram went live Oct 17. Cards for other platforms switch on by themselves when their numbers arrive.')}${meta}${google}${cards}${a.other_ads_status.status === 'not_connected' ? '' : ''}`);
  }

  // ------------------------------------------------------------ EVERY LEAD
  let leadData = null, leadFilter = 'all', leadQ = '', leadShown = 40;
  const FILTERS = [['all', 'Everyone'], ['attention', 'Needs a look'], ['no_opportunity', 'No opportunity'], ['never_called', 'Never called'], ['not_sent_to_nexa', 'Not sent to Nexa'], ['missing_from_ghl', 'Not in GoHighLevel'], ['wrong_email', 'Email problem'], ['slow_response', 'Slow first contact']];
  const flagPill = (f) => html`<span class="pill ${f.level}">${f.label}</span>`;
  function leadRows() {
    const q = leadQ.trim().toLowerCase();
    return leadData.rows.filter((r) => {
      if (leadFilter === 'attention' && !r.needs_attention) return false;
      if (!['all', 'attention'].includes(leadFilter) && !r.flags.some((f) => f.code === leadFilter)) return false;
      if (!q) return true;
      return [r.name, r.phone, r.email, r.source, r.stage, r.pipeline, r.first_contact_by].join(' ').toLowerCase().includes(q);
    });
  }
  function leadTable() {
    const rows = leadRows();
    const L = leadData;
    return html`<p class="note">${rows.length} ${rows.length === 1 ? 'person' : 'people'} shown.</p>
      ${rows.length ? html`<div class="scroll"><table class="tbl"><thead><tr><th>Arrived</th><th>Lead</th><th>Source</th><th>In GoHighLevel?</th><th>Stage</th><th>Sent to Nexa?</th><th>Nexa calls</th><th>First contact</th><th>Flags</th></tr></thead><tbody>
      ${rows.slice(0, leadShown).map((r) => html`<tr>
        <td data-l="Arrived">${when(r.arrived_at)}${r.by_email ? html`<span class="sub">lead email ${when(r.email_received_at)}</span>` : ''}</td>
        <td data-l="Lead" class="nm">${r.name || 'Unnamed'}<span class="sub">${r.phone}${r.email ? ` · ${r.email}` : ''}</span></td>
        <td data-l="Source">${r.source}</td>
        <td data-l="In GoHighLevel?">${yn(r.in_ghl)}${r.in_ghl && !r.has_opportunity ? html`<span class="sub">no opportunity</span>` : ''}</td>
        <td data-l="Stage">${r.stage ? html`${r.stage}<span class="sub">${r.pipeline}${r.opp_status && r.opp_status !== 'open' ? ` · ${r.opp_status}` : ''}</span>` : '–'}</td>
        <td data-l="Sent to Nexa?">${r.emailed_to_nexa == null ? html`<span class="muted">Not known yet</span>` : yn(r.emailed_to_nexa)}</td>
        <td data-l="Nexa calls">${L.nexa_connected ? html`${r.nexa_attempts}${r.nexa_first_call_at ? html`<span class="sub">first ${when(r.nexa_first_call_at)}</span>` : ''}${r.nexa_last_outcome ? html`<span class="sub">${r.nexa_last_outcome}</span>` : ''}` : html`<span class="muted">Not connected</span>`}</td>
        <td data-l="First contact">${r.first_contact_at ? html`${when(r.first_contact_at)}<span class="sub">${r.first_contact_by || ''}${r.first_contact_by_robin ? '' : ''} · ${mins(r.speed_minutes)} after arriving</span>` : html`<span class="muted">None recorded</span>`}${r.appointment ? html`<span class="sub">Appointment ${r.appointment.status} ${dayOnly(r.appointment.start)}</span>` : ''}</td>
        <td data-l="Flags" class="nolabel"><div class="flags">${r.flags.map(flagPill)}</div></td></tr>`)}</tbody></table></div>
      ${rows.length > leadShown ? html`<p style="text-align:center"><button class="btn" type="button" data-act="more-leads">Show more (${rows.length - leadShown} left)</button></p>` : ''}` : html`<p class="empty">No one matches.</p>`}`;
  }
  async function vLeads() {
    leadData = await api('leads');
    const L = leadData, c = L.counts;
    setView(html`${head('Every lead', L.updated, `One row per person, across GoHighLevel, the lead email inbox and Nexa. Last ${L.days} days.`)}
      ${!L.ghl_connected ? banner('GoHighLevel is not connected yet', 'This view starts with its contacts.') : ''}
      ${!L.nexa_connected ? banner('Nexa is not connected yet', 'Call checks ("never called", "not sent to Nexa") start working as soon as Nexa call history arrives.') : ''}
      ${!L.email_connected ? html`<p class="note">Lead emails are not connected yet, so "arrived by email" and email mix-ups cannot be checked.</p>` : ''}
      <div class="tiles five">${tile(c.total, 'People')}${tile(c.needs_attention, 'Need a look', '', !c.needs_attention)}${tile(c.no_opportunity, 'No opportunity')}${tile(c.never_called, 'Never called')}${tile(c.missing_from_ghl, 'Not in GoHighLevel')}</div>
      <div class="toolbar"><div class="grow"><input type="search" id="leadq" placeholder="Search name, phone, email, source or stage" aria-label="Search leads" value="${leadQ}"></div></div>
      <div class="chips" role="group" aria-label="Filter">${FILTERS.map(([k, v]) => html`<button class="chip" type="button" data-act="lead-filter" data-v="${k}" aria-pressed="${k === leadFilter}">${v}${k === 'all' ? '' : html`<span class="ct">${k === 'attention' ? c.needs_attention : c[k] ?? ''}</span>`}</button>`)}</div>
      <div id="leadtable">${leadTable()}</div>`);
  }

  // ------------------------------------------------------------ CALLS
  async function vCalls() {
    const c = await api('calls');
    const T = c.totals;
    setView(html`${head('Calls (Nexa)', c.updated, 'Every call attempt Nexa made, checked against GoHighLevel. Times are Pacific.')}
      ${!c.connected ? banner('Nexa is not connected yet', 'A recurring agent pulls the call history a couple of times a day and sends it here.', [{ who: 'Revelation', what: 'Turn on the Nexa history agent and give it the dashboard ingest key.' }]) : html`
      <div class="tiles">${tile(T.leads, 'Leads called')}${tile(T.attempts, 'Call attempts', T.avg_attempts != null ? `${T.avg_attempts} per lead` : '')}${tile(mins(T.avg_minutes_to_first_call), 'Average time from lead to first call', '', T.avg_minutes_to_first_call == null)}${tile(T.not_in_ghl, 'Not found in GoHighLevel', '', !T.not_in_ghl)}${tile(T.with_flags, 'Flagged by Nexa', '', !T.with_flags)}</div>
      <div class="grid two"><div class="card"><h3>Outcomes</h3>${barList(c.outcomes.map((o) => ({ source: o.outcome, count: o.count })))}</div></div>
      <div class="scroll"><table class="tbl"><thead><tr><th>Lead</th><th>Arrived</th><th class="num">Attempts</th><th>First call</th><th>Latest outcome</th><th>In GHL?</th><th>Notes</th></tr></thead><tbody>
      ${c.rows.map((r) => html`<tr><td data-l="Lead" class="nm">${r.lead_name || 'Unnamed'}<span class="sub">${r.phone}</span></td><td data-l="Arrived">${when(r.arrived_at)}</td><td data-l="Attempts" class="num">${r.attempt_count}</td>
        <td data-l="First call">${when(r.first_attempt_at)}${r.minutes_to_first_call != null ? html`<span class="sub">${mins(r.minutes_to_first_call)} after arriving</span>` : ''}</td>
        <td data-l="Outcome">${r.outcome || '–'}${r.status ? html`<span class="sub">${r.status}</span>` : ''}</td><td data-l="In GHL?">${yn(r.in_ghl)}</td>
        <td data-l="Notes">${r.details || ''}${r.flags.length ? html`<div class="flags">${r.flags.map((f) => html`<span class="pill warn">${f}</span>`)}</div>` : ''}${r.events.length > 1 ? html`<details><summary>${r.events.length} attempts</summary><ul class="hist">${r.events.map((e) => html`<li><time>${when(e.at)}</time> ${e.result || ''}</li>`)}</ul></details>` : ''}</td></tr>`)}</tbody></table></div>`}`);
  }

  // ------------------------------------------------------------ SALES
  const apptPill = (s) => html`<span class="pill ${{ showed: 'ok', confirmed: 'ok', booked: 'warn', 'no-show': 'bad', cancelled: 'off' }[s] || 'off'}">${s}</span>`;
  async function vSales() {
    const s = await api('sales');
    const R = s.robin;
    const apptTable = (list) => list.length ? html`<div class="scroll"><table class="tbl"><thead><tr><th>When</th><th>Lead</th><th>Calendar</th><th>Status</th><th>Outcome</th></tr></thead><tbody>
      ${list.map((a) => html`<tr><td data-l="When">${when(a.start)}</td><td data-l="Lead" class="nm">${a.contact_name}</td><td data-l="Calendar">${a.calendar}${a.is_robin ? '' : ''}</td><td data-l="Status">${apptPill(a.status)}</td><td data-l="Outcome">${a.outcome || a.stage || '–'}</td></tr>`)}</tbody></table></div>` : html`<p class="empty">None.</p>`;
    setView(html`${head('Appointments & sales', s.updated, "Robin's appointments and everything the sales assistant records. Last 30 days unless noted.")}
      ${!s.ghl_connected ? banner('GoHighLevel is not connected yet', 'Appointments come from its calendars.') : html`
      <div class="tiles five">${tile(R.total, "Robin's appointments")}${tile(R.confirmed + R.booked, 'Booked or confirmed')}${tile(R.showed, 'Ran')}${tile(R.no_show, 'No-shows', '', !R.no_show)}${tile(R.cancelled, 'Cancelled', '', !R.cancelled)}</div>
      <div class="card"><h3>Coming up <small>${s.upcoming.length}</small></h3>${apptTable(s.upcoming)}</div>
      <div class="card"><h3>Recent appointments</h3>${apptTable(s.recent)}</div>`}
      <div class="card"><h3>Sales assistant activity <small>${s.agent_event_types.map((t) => `${t.count} ${t.type}`).join(' · ')}</small></h3>
        ${!s.agent_connected ? html`<p class="note">Not connected yet. When the AI sales assistant records an event (a text sent, a lead qualified, an appointment set), it shows up here.</p>` : html`<div class="rows">${s.agent_events.map((e) => html`<div class="row"><span class="t">${e.lead_name || 'A lead'}</span><span class="pill off">${e.event_type}</span><span class="d">${e.summary}</span><span class="w">${when(e.at)}${e.outcome ? ` · ${e.outcome}` : ''}</span></div>`)}</div>`}</div>`);
  }

  // ------------------------------------------------------------ SEARCH
  async function vSearch() {
    const s = await api('search');
    const d = s.data;
    setView(html`${head('Search (Google)', s.updated, 'How people find the website on Google. Search Console runs about two days behind.')}
      ${statusBanner(s)}
      ${d ? html`<p class="note">${d.site} · ${dayOnly(d.start + 'T19:00:00Z')} to ${dayOnly(d.end + 'T19:00:00Z')}</p>
      <div class="tiles">${tile(int(d.totals.clicks), 'Clicks from Google')}${tile(int(d.totals.impressions), 'Times shown in results')}${tile(pct(d.totals.ctr), 'Click rate')}${tile(d.totals.position, 'Average position', 'Lower is better')}</div>
      <div class="grid two"><div class="card">${spark(d.daily, 'clicks', 'Clicks per day', int)}</div><div class="card">${spark(d.daily, 'impressions', 'Times shown per day', int, true)}</div></div>
      <div class="grid two">
        <div class="card"><h3>What people searched <small>top 25</small></h3>${d.queries.length ? html`<div class="rows">${d.queries.map((q) => html`<div class="row"><span class="t">${q.query}</span><span class="pill off">#${q.position}</span><span class="w">${q.clicks} clicks · ${int(q.impressions)} views · ${pct(q.ctr)}</span></div>`)}</div>` : html`<p class="empty">Nothing yet.</p>`}</div>
        <div class="card"><h3>Pages people landed on <small>top 25</small></h3>${d.pages.length ? html`<div class="rows">${d.pages.map((q) => html`<div class="row"><span class="t">${q.page.replace(/^https?:\/\/[^/]+/, '') || '/'}</span><span class="pill off">#${q.position}</span><span class="w">${q.clicks} clicks · ${int(q.impressions)} views · ${pct(q.ctr)}</span></div>`)}</div>` : html`<p class="empty">Nothing yet.</p>`}</div>
      </div>` : ''}`);
  }

  // ------------------------------------------------------------ SOCIAL
  const PLAT = { facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', google_business: 'Google Business', linkedin: 'LinkedIn', x: 'X', other: 'Other' };
  const PSTATUS = { planned: 'Planned', waiting_approval: 'Waiting approval', scheduled: 'Scheduled', published: 'Published', failed: 'Failed' };
  let soc = null, socMonth = null, socDay = null, socPlat = 'all', socMode = 'calendar', socEdit = null;
  const todayYmd = () => ymd(new Date().toISOString());
  const postCard = (p) => {
    const link = safeUrl(p.link);
    return html`<div class="post"><div class="meta"><span class="plat ${p.platform}">${PLAT[p.platform] || p.platform}</span><span class="pill s-${p.status}">${PSTATUS[p.status] || p.status}</span><span>${when(p.scheduled_at)}</span>${p.origin === 'page' ? html`<span class="tag">From the Facebook Page</span>` : ''}</div>
      ${p.title ? html`<b>${p.title}</b>` : ''}<p>${(p.caption || '').slice(0, 180)}${(p.caption || '').length > 180 ? '…' : ''}</p>
      ${p.error ? html`<p class="err">${p.error}</p>` : ''}
      ${p.metrics ? html`<span class="sub">${p.metrics.reactions} reactions · ${p.metrics.comments} comments · ${p.metrics.shares} shares${p.metrics.reach != null ? ` · ${int(p.metrics.reach)} reached` : ''}${p.metrics.clicks != null ? ` · ${int(p.metrics.clicks)} clicks` : ''}</span>` : ''}
      <div class="meta">${link ? html`<a href="${link}" target="_blank" rel="noopener noreferrer">Open post</a>` : ''}${ME.can.social_edit && p.origin !== 'page' ? html`<button class="btn small" type="button" data-act="edit-post" data-id="${p.id}">Edit</button>` : ''}</div></div>`;
  };
  function monthGrid() {
    const [y, m] = socMonth.split('-').map(Number);
    const first = new Date(Date.UTC(y, m - 1, 1, 12));
    const lead = (first.getUTCDay() + 6) % 7;
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const posts = soc.posts.filter((p) => socPlat === 'all' || p.platform === socPlat);
    const by = {};
    for (const p of posts) (by[ymd(p.scheduled_at)] ||= []).push(p);
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push(html`<button class="day out" type="button" disabled></button>`);
    for (let d = 1; d <= days; d++) {
      const key = `${socMonth}-${String(d).padStart(2, '0')}`;
      const list = by[key] || [];
      cells.push(html`<button class="day ${key === todayYmd() ? 'today' : ''}" type="button" data-act="pick-day" data-v="${key}" aria-pressed="${key === socDay}" aria-label="${key}, ${list.length} posts"><span class="dn">${d}</span><span class="dots">${list.slice(0, 6).map((p) => html`<i class="dot-${p.status}" title="${PLAT[p.platform] || p.platform}: ${PSTATUS[p.status]}"></i>`)}</span>${list.length > 6 ? html`<span class="more">+${list.length - 6}</span>` : ''}</button>`);
    }
    return html`<div class="cal">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => html`<div class="dow">${d}</div>`)}${cells}</div>`;
  }
  function postForm() {
    const p = socEdit === 'new' ? { platform: 'facebook', status: 'planned', scheduled_at: new Date(Date.now() + 86400000).toISOString() } : soc.posts.find((x) => x.id === socEdit);
    if (!p) return '';
    return html`<form class="card form" id="postform" data-id="${socEdit === 'new' ? '' : p.id}"><h3>${socEdit === 'new' ? 'Add a post' : 'Edit post'}</h3>
      <div class="row2"><label class="f">Platform<select name="platform">${Object.entries(PLAT).map(([k, v]) => html`<option value="${k}" ${k === p.platform ? 'selected' : ''}>${v}</option>`)}</select></label>
      <label class="f">Status<select name="status">${Object.entries(PSTATUS).map(([k, v]) => html`<option value="${k}" ${k === p.status ? 'selected' : ''}>${v}</option>`)}</select></label></div>
      <div class="row2"><label class="f">Date<input type="date" name="date" required value="${ymd(p.scheduled_at)}"></label><label class="f">Time (Pacific)<input type="time" name="time" required value="${hm(p.scheduled_at)}"></label></div>
      <label class="f">Title (optional)<input type="text" name="title" maxlength="160" value="${p.title || ''}"></label>
      <label class="f">Caption<textarea name="caption" maxlength="2200">${p.caption || ''}</textarea></label>
      <label class="f">Link to the post or graphic<input type="url" name="link" placeholder="https://" value="${p.link || ''}"></label>
      <label class="f">Notes<input type="text" name="notes" maxlength="500" value="${p.notes || ''}"></label>
      <p class="msg err" id="postmsg"></p>
      <div class="toolbar"><button class="btn red" type="submit">Save post</button><button class="btn" type="button" data-act="cancel-post">Cancel</button>${socEdit !== 'new' && ME.can.task_admin ? html`<button class="btn" type="button" data-act="delete-post" data-id="${p.id}">Delete</button>` : ''}</div></form>`;
  }
  function socialBody() {
    const posts = soc.posts.filter((p) => socPlat === 'all' || p.platform === socPlat);
    const plats = [...new Set(soc.posts.map((p) => p.platform))];
    const [y, m] = socMonth.split('-').map(Number);
    const label = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(Date.UTC(y, m - 1, 1)));
    const dayPosts = socDay ? posts.filter((p) => ymd(p.scheduled_at) === socDay) : [];
    const upcoming = posts.filter((p) => ymd(p.scheduled_at) >= todayYmd()).slice(0, 40);
    const recent = posts.filter((p) => ymd(p.scheduled_at) < todayYmd()).slice(-10).reverse();
    return html`<div class="tiles five">${Object.entries(PSTATUS).map(([k, v]) => tile(soc.counts[k] || 0, v, '', !soc.counts[k]))}</div>
      <div class="toolbar"><div class="chips" role="group" aria-label="Platform"><button class="chip" type="button" data-act="soc-plat" data-v="all" aria-pressed="${socPlat === 'all'}">All platforms</button>${plats.map((k) => html`<button class="chip" type="button" data-act="soc-plat" data-v="${k}" aria-pressed="${socPlat === k}">${PLAT[k] || k}</button>`)}</div>
        <div class="chips" role="group" aria-label="View"><button class="chip" type="button" data-act="soc-mode" data-v="calendar" aria-pressed="${socMode === 'calendar'}">Calendar</button><button class="chip" type="button" data-act="soc-mode" data-v="list" aria-pressed="${socMode === 'list'}">List</button></div>
        ${ME.can.social_edit ? html`<button class="btn red small" type="button" data-act="new-post">+ Add a post</button>` : ''}</div>
      ${socEdit ? postForm() : ''}
      ${soc.page_connected ? '' : html`<p class="note">Posts typed in here and posts sent by the content agent show on this calendar. The Facebook Page's own posts join automatically once the Page is connected (see Connections).</p>`}
      ${socMode === 'calendar' ? html`<div class="card"><div class="toolbar" style="justify-content:space-between;margin-bottom:10px"><button class="btn small" type="button" data-act="soc-month" data-v="-1" aria-label="Previous month">‹ Prev</button><b>${label}</b><button class="btn small" type="button" data-act="soc-month" data-v="1" aria-label="Next month">Next ›</button></div>${monthGrid()}
        <div class="legend">${Object.entries(PSTATUS).map(([k, v]) => html`<span><i class="dot-${k}" style="border-radius:50%"></i>${v}</span>`)}</div></div>
        ${socDay ? html`<div class="head"><h2 class="sec" style="font-size:18px">${F.dw.format(new Date(`${socDay}T19:00:00Z`))}</h2></div>${dayPosts.length ? html`<div class="grid">${dayPosts.map(postCard)}</div>` : html`<p class="empty">Nothing planned for this day.</p>`}` : html`<p class="note">Tap a day to see its posts.</p>`}`
        : html`<div class="head"><h2 class="sec" style="font-size:18px">Coming up</h2></div>${upcoming.length ? html`<div class="grid">${upcoming.map(postCard)}</div>` : html`<p class="empty">Nothing scheduled yet.</p>`}
          ${recent.length ? html`<div class="head"><h2 class="sec" style="font-size:18px">Recently</h2></div><div class="grid">${recent.map(postCard)}</div>` : ''}`}`;
  }
  async function vSocial() {
    soc = await api('social');
    socMonth ||= todayYmd().slice(0, 7);
    setView(html`${head('Social & content calendar', soc.updated, 'Every post across every platform: planned, waiting for a yes, scheduled, published or failed.')}<div id="socbody">${socialBody()}</div>`);
  }
  const rerenderSocial = () => { $('#socbody').innerHTML = socialBody().s; };

  // ------------------------------------------------------------ TASKS
  let tk = null, tkFilter = 'open', tkCat = 'all', tkAdd = false;
  const PRI = { urgent: 'Urgent', high: 'High', normal: 'Normal', low: 'Low' };
  const taskCard = (t) => {
    const done = t.status === 'done_live';
    const link = safeUrl(t.link);
    const opt = (map, cur) => Object.entries(map).map(([k, v]) => html`<option value="${k}" ${k === cur ? 'selected' : ''}>${v}</option>`);
    return html`<article class="task p-${t.priority} ${done ? 'done' : ''}" id="t-${t.id}"><h4>${t.title}</h4>
      <div class="meta"><span class="tag">${t.category}</span><span class="pill ${done ? 'ok' : t.status === 'in_progress' ? 'warn' : t.status.startsWith('waiting') ? 'warn' : 'off'}">${tk.statuses[t.status]}</span>${t.priority !== 'normal' ? html`<span class="pill ${t.priority === 'low' ? 'off' : 'bad'}">${PRI[t.priority]}</span>` : ''}${t.due ? html`<span>Due ${dayOnly(`${t.due}T19:00:00Z`)}</span>` : ''}<span>${t.requested_by_name}${t.source ? ` · ${t.source}` : ''}</span></div>
      ${t.details ? html`<p style="margin:0;overflow-wrap:anywhere">${t.details}</p>` : ''}
      <div class="prog" role="img" aria-label="${t.progress}% done"><i style="width:${t.progress}%"></i></div><div class="meta"><span>${t.progress}% done</span><span>updated ${when(t.updated_at)}</span>${link ? html`<a href="${link}" target="_blank" rel="noopener noreferrer">Open the live link</a>` : ''}</div>
      ${t.notes ? html`<p class="note" style="margin:0"><b>Blaine's notes:</b> ${t.notes}</p>` : ''}
      <details><summary>History (${t.history.length})</summary><ul class="hist">${t.history.slice().reverse().map((h) => html`<li><time>${when(h.at)}</time> · <b>${h.by}</b>: ${h.text}</li>`)}</ul></details>
      <details><summary>${ME.can.task_admin ? 'Update this task' : 'Add a comment'}</summary>
        <form class="form" data-task="${t.id}" style="margin-top:8px">
          ${ME.can.task_admin ? html`<div class="row2"><label class="f">Status<select name="status">${opt(tk.statuses, t.status)}</select></label><label class="f">Progress: <output>${t.progress}</output>%<input type="range" name="progress" min="0" max="100" step="5" value="${t.progress}"></label></div>
          <label class="f">Link to the live thing (needed for Done)<input type="url" name="link" placeholder="https://" value="${t.link || ''}"></label>
          <label class="f">Notes<textarea name="notes">${t.notes || ''}</textarea></label>
          <div class="row2"><label class="f">Priority<select name="priority">${opt(PRI, t.priority)}</select></label><label class="f">Category<select name="category">${tk.categories.map((c) => html`<option ${c === t.category ? 'selected' : ''}>${c}</option>`)}</select></label><label class="f">Due<input type="date" name="due" value="${t.due || ''}"></label></div>` : ''}
          <label class="f">${ME.can.task_admin ? 'Comment (optional)' : 'Comment'}<input type="text" name="comment" maxlength="1000"></label>
          <p class="msg err"></p><button class="btn red small" type="submit">Save</button></form></details></article>`;
  };
  function tasksBody() {
    const list = tk.tasks.filter((t) => (tkFilter === 'all' || (tkFilter === 'done') === (t.status === 'done_live')) && (tkCat === 'all' || t.category === tkCat));
    return html`<div class="tiles three">${tile(tk.counts.open, 'Open')}${tile(tk.counts.done, 'Done (live)', '', !tk.counts.done)}${tile(tk.tasks.filter((t) => t.status.startsWith('waiting')).length, 'Waiting on someone', '', false)}</div>
      <div class="toolbar"><div class="chips" role="group" aria-label="Show">${[['open', 'Open'], ['done', 'Done'], ['all', 'Everything']].map(([k, v]) => html`<button class="chip" type="button" data-act="tk-filter" data-v="${k}" aria-pressed="${tkFilter === k}">${v}</button>`)}</div>
        ${ME.can.task_add ? html`<button class="btn red small" type="button" data-act="tk-add">+ Ask Blaine for something</button>` : ''}</div>
      <div class="chips" role="group" aria-label="Category"><button class="chip" type="button" data-act="tk-cat" data-v="all" aria-pressed="${tkCat === 'all'}">All</button>${tk.categories.map((c) => html`<button class="chip" type="button" data-act="tk-cat" data-v="${c}" aria-pressed="${tkCat === c}">${c}${tk.counts.by_category[c] ? html`<span class="ct">${tk.counts.by_category[c]}</span>` : ''}</button>`)}</div>
      ${tkAdd ? html`<form class="card form" id="taskform"><h3>New request</h3><label class="f">What do you need?<input type="text" name="title" required minlength="3" maxlength="160"></label><label class="f">Details<textarea name="details" maxlength="2000"></textarea></label>
        <div class="row2"><label class="f">Category<select name="category">${tk.categories.map((c) => html`<option>${c}</option>`)}</select></label><label class="f">Priority<select name="priority">${Object.entries(PRI).map(([k, v]) => html`<option value="${k}" ${k === 'normal' ? 'selected' : ''}>${v}</option>`)}</select></label><label class="f">Needed by<input type="date" name="due"></label></div>
        <p class="msg err" id="taskmsg"></p><div class="toolbar"><button class="btn red" type="submit">Send to Blaine</button><button class="btn" type="button" data-act="tk-cancel">Cancel</button></div></form>` : ''}
      <div class="grid">${list.length ? list.map(taskCard) : html`<p class="empty">Nothing here.</p>`}</div>`;
  }
  async function vTasks() {
    tk = await api('tasks');
    setView(html`${head("Blaine's task list", tk.updated, 'One list for everything being built or fixed. Ask for something and watch it move.')}<div id="tkbody">${tasksBody()}</div>`);
  }
  const rerenderTasks = () => { $('#tkbody').innerHTML = tasksBody().s; };

  // ------------------------------------------------------------ CONNECTIONS
  const STATE = (i) => i.status === 'ok' ? (i.stale || i.notes.some((n) => /No new data|stopped/i.test(n)) ? ['Needs a look', 'warn'] : ['Connected', 'ok']) : i.status === 'error' ? ['Problem', 'bad'] : ['Not connected', 'off'];
  async function vConnections() {
    const c = await api('connections');
    let activity = null;
    if (ME.role === 'admin') activity = await api('activity').catch(() => null);
    setView(html`${head('Connections', c.updated, 'Every source this dashboard tracks, and exactly who needs to do what to switch each one on. Nothing here is guessed; a source that is not connected shows no numbers.')}
      <div class="card"><div class="rows">${c.items.map((i) => { const [t, cls] = STATE(i); return html`<div class="row"><span class="t">${i.label}</span><span class="pill ${cls}">${t}</span>
        <span class="d">${i.what}</span><span class="w">${i.how} · ${i.as_of ? `data from ${when(i.as_of)}` : 'no data yet'}${i.checked_at && i.status !== 'ok' ? ` · last tried ${when(i.checked_at)}` : ''}</span>
        ${i.error ? html`<span class="d bad">${i.error}</span>` : ''}${i.notes.map((n) => html`<span class="w">${n}</span>`)}
        ${i.status !== 'ok' || i.stale ? html`<div style="grid-column:1/-1">${needsList(i.needs)}</div>` : ''}
        ${ME.can.refresh && ['ghl', 'meta', 'google_ads', 'gsc'].includes(i.id) ? html`<div style="grid-column:1/-1"><button class="btn small" type="button" data-act="refresh-one" data-v="${i.id}">Refresh ${i.label.split(' (')[0]} now</button></div>` : ''}</div>`; })}</div></div>
      ${activity ? html`<div class="card"><h3>Recent activity <small>admin only</small></h3><div class="rows">${activity.items.slice(0, 40).map((a) => html`<div class="row"><span class="t">${a.action.replace(/_/g, ' ')}</span><span class="w">${when(a.at)}</span><span class="d">${a.by}${a.detail ? ` · ${a.detail}` : ''}</span></div>`)}</div></div>` : ''}`);
  }

  // ------------------------------------------------------------ router
  const VIEWS = { overview: vOverview, ads: vAds, leads: vLeads, calls: vCalls, sales: vSales, search: vSearch, social: vSocial, tasks: vTasks, connections: vConnections };
  let current = 'overview';
  async function route() {
    const key = (location.hash || '#overview').slice(1).split('?')[0];
    current = VIEWS[key] ? key : 'overview';
    $('#tabs').innerHTML = TABS.map(([k, v]) => `<a href="#${k}" ${k === current ? 'aria-current="page"' : ''}>${esc(v)}</a>`).join('');
    setView('<div class="loading"><span class="spin"></span> Loading</div>');
    try {
      await VIEWS[current]();
      window.scrollTo(0, 0);
    } catch (e) {
      if (e.message === 'login') return;
      setView(banner('This section could not load', e.status === 503 ? ' The dashboard storage is not connected yet. Ask Blaine.' : ` ${e.message}`, [], true));
    }
  }

  // ------------------------------------------------------------ events
  const form = (f) => Object.fromEntries(new FormData(f).entries());
  view.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act, v = b.dataset.v;
    if (act === 'range') { adsRange = v; return vAds(); }
    if (act === 'lead-filter') { leadFilter = v; leadShown = 40; return vLeadsRender(); }
    if (act === 'more-leads') { leadShown += 100; return vLeadsRender(); }
    if (act === 'soc-plat') { socPlat = v; return rerenderSocial(); }
    if (act === 'soc-mode') { socMode = v; return rerenderSocial(); }
    if (act === 'soc-month') { const [y, m] = socMonth.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + Number(v), 1)); socMonth = d.toISOString().slice(0, 7); socDay = null; return rerenderSocial(); }
    if (act === 'pick-day') { socDay = socDay === v ? null : v; return rerenderSocial(); }
    if (act === 'new-post') { socEdit = 'new'; rerenderSocial(); return $('#postform')?.scrollIntoView({ block: 'nearest' }); }
    if (act === 'edit-post') { socEdit = b.dataset.id; rerenderSocial(); return $('#postform')?.scrollIntoView({ block: 'center' }); }
    if (act === 'cancel-post') { socEdit = null; return rerenderSocial(); }
    if (act === 'delete-post') {
      if (!confirm('Delete this post from the calendar?')) return;
      try { await api(`social/${b.dataset.id}/delete`, {}); socEdit = null; soc = await api('social'); rerenderSocial(); toast('Post deleted'); } catch (err) { toast(err.message); }
      return;
    }
    if (act === 'tk-filter') { tkFilter = v; return rerenderTasks(); }
    if (act === 'tk-cat') { tkCat = v; return rerenderTasks(); }
    if (act === 'tk-add') { tkAdd = true; rerenderTasks(); return $('#taskform input')?.focus(); }
    if (act === 'tk-cancel') { tkAdd = false; return rerenderTasks(); }
    if (act === 'refresh-one') return doRefresh(v, b);
  });
  const vLeadsRender = () => { const h = $('#leadtable'); if (h) h.innerHTML = leadTable().s; $$('.chip[data-act="lead-filter"]').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.v === leadFilter))); };
  view.addEventListener('input', (e) => {
    if (e.target.id === 'leadq') { leadQ = e.target.value; leadShown = 40; vLeadsRender(); }
    if (e.target.name === 'progress') { const o = e.target.closest('label').querySelector('output'); if (o) o.textContent = e.target.value; }
  });
  view.addEventListener('submit', async (e) => {
    const f = e.target;
    e.preventDefault();
    const btn = f.querySelector('[type=submit]');
    const msg = f.querySelector('.msg');
    if (btn) btn.disabled = true;
    try {
      if (f.id === 'postform') {
        const d = form(f);
        await api('social', { id: f.dataset.id || undefined, platform: d.platform, status: d.status, scheduled_at: `${d.date}T${d.time}`, title: d.title, caption: d.caption, link: d.link, notes: d.notes });
        socEdit = null; socDay = d.date; socMonth = d.date.slice(0, 7); soc = await api('social'); rerenderSocial(); toast('Post saved');
      } else if (f.id === 'taskform') {
        await api('tasks', form(f)); tkAdd = false; tk = await api('tasks'); rerenderTasks(); toast('Sent to Blaine');
      } else if (f.dataset.task) {
        const d = form(f);
        if (!ME.can.task_admin) { delete d.status; }
        await api(`tasks/${f.dataset.task}`, d);
        tk = await api('tasks'); rerenderTasks(); toast('Saved');
        const el = document.getElementById(`t-${f.dataset.task}`); el?.scrollIntoView({ block: 'nearest' });
      }
    } catch (err) {
      if (msg) msg.textContent = err.message; else toast(err.message);
    } finally { if (btn) btn.disabled = false; }
  });

  async function doRefresh(source, btn) {
    const all = $('#refresh');
    const els = [btn, all].filter(Boolean);
    els.forEach((x) => { x.disabled = true; });
    const old = all.textContent;
    all.innerHTML = '<span class="spin"></span> Refreshing';
    toast('Refreshing. This can take a minute or two.');
    try {
      const r = await api('refresh', source ? { source } : {});
      toast(r.results.map((x) => `${LABELS[x.source] || x.source}: ${x.status === 'ok' ? 'updated' : x.status === 'not_connected' ? 'not connected' : 'problem'}`).join(' · '));
      await route();
    } catch (err) { toast(err.message); } finally { els.forEach((x) => { x.disabled = false; }); all.textContent = old; }
  }

  // ------------------------------------------------------------ start
  (async () => {
    try { ME = await api('me'); } catch { return; }
    $('#who').textContent = `${ME.name} · ${ME.role === 'admin' ? 'Admin' : ME.role === 'owner' ? 'Owner' : 'Team'}`;
    if (ME.can.refresh) { const r = $('#refresh'); r.hidden = false; r.addEventListener('click', () => doRefresh(null)); }
    window.addEventListener('hashchange', route);
    route();
  })();
})();
