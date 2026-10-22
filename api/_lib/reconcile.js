/**
 * The "every lead" view: one row per person across GoHighLevel contacts,
 * leads that arrived by email, and the call history Nexa pushes in. Pure
 * functions, so the verify script can run them against fixtures.
 */
import { digits10, isTestRecord, minutesBetween, normEmail } from './util.js';

export function normalizeSource(raw) {
  const s = String(raw || '').trim();
  if (!s) return 'No source recorded';
  const l = s.toLowerCase();
  if (/facebook|instagram|\bfb\b|\big\b|\bmeta\b/.test(l)) return 'Facebook / Instagram ads';
  if (/google/.test(l) && /\b(ads?|cpc|ppc|paid)\b/.test(l)) return 'Google Ads';
  if (/tiktok/.test(l)) return 'TikTok ads';
  if (/youtube/.test(l)) return 'YouTube ads';
  return s.slice(0, 60);
}

const FLAG_TEXT = {
  no_opportunity: ['In GoHighLevel, but no opportunity', 'bad'],
  never_called: ['Never called', 'bad'],
  not_sent_to_nexa: ['Not sent to Nexa', 'bad'],
  wrong_email: ['Email looks wrong or differs', 'warn'],
  missing_from_ghl: ['Missing from GoHighLevel', 'bad'],
  slow_response: ['Slow first contact (over 30 min)', 'warn'],
  nexa_mismatch: ['Nexa reported a mismatch', 'warn'],
};

export function reconcile({ ghl = null, emailLeads: emailAll = [], nexa = [], now = Date.now(), sinceDays = 90, graceMinutes = 30 } = {}) {
  const emailLeads = emailAll.filter((e) => !e.is_test);
  const contacts = ghl?.contacts || [];
  const opps = ghl?.opportunities || [];
  const touches = ghl?.touches || {};
  const appts = ghl?.appointments || [];
  const nexaConnected = nexa.length > 0;
  const nexaSince = nexa.reduce((m, r) => { const t = r.first_attempt_at || r.received_at || ''; return t && (!m || t < m) ? t : m; }, '');
  const cutoff = now - sinceDays * 86400000;

  const byId = new Map(contacts.map((c) => [c.id, c]));
  const byPhone = new Map();
  const byEmail = new Map();
  for (const c of contacts) {
    const p = digits10(c.phone);
    if (p && !byPhone.has(p)) byPhone.set(p, c);
    const e = normEmail(c.email);
    if (e && !byEmail.has(e)) byEmail.set(e, c);
  }
  const oppsBy = new Map();
  for (const o of opps) if (o.contact_id) (oppsBy.get(o.contact_id) || oppsBy.set(o.contact_id, []).get(o.contact_id)).push(o);
  const apptBy = new Map();
  for (const a of appts) if (a.contact_id) (apptBy.get(a.contact_id) || apptBy.set(a.contact_id, []).get(a.contact_id)).push(a);

  const rows = new Map(); // key -> row
  const orphanByPhone = new Map();
  const orphanByEmail = new Map();
  let excludedTests = 0;

  const ensureContactRow = (c) => {
    const key = `ghl:${c.id}`;
    if (!rows.has(key)) rows.set(key, { key, ghl_contact_id: c.id, contact: c, emails: [], nexa: [], orphan: false });
    return rows.get(key);
  };
  const findContact = (rec) => (rec.ghl_contact_id && byId.get(rec.ghl_contact_id)) || byPhone.get(digits10(rec.phone)) || byEmail.get(normEmail(rec.email)) || null;
  const findOrphan = (rec) => orphanByPhone.get(digits10(rec.phone)) || orphanByEmail.get(normEmail(rec.email)) || null;
  const newOrphan = (rec, kind) => {
    const key = `${kind}:${rec.id}`;
    const row = { key, ghl_contact_id: rec.ghl_contact_id || '', contact: null, emails: [], nexa: [], orphan: true };
    rows.set(key, row);
    return row;
  };
  const indexOrphan = (row, rec) => {
    const p = digits10(rec.phone); if (p) orphanByPhone.set(p, row);
    const e = normEmail(rec.email); if (e) orphanByEmail.set(e, row);
  };

  // GHL contacts inside the window
  for (const c of contacts) {
    if (c.created_at && Date.parse(c.created_at) >= cutoff) ensureContactRow(c);
  }
  // email leads
  for (const rec of emailLeads) {
    const c = findContact(rec);
    let row;
    if (c) row = ensureContactRow(c);
    else {
      row = findOrphan(rec) || newOrphan(rec, 'email');
      indexOrphan(row, rec);
    }
    row.emails.push(rec);
  }
  // nexa
  for (const rec of nexa) {
    const c = findContact(rec);
    let row;
    if (c) row = ensureContactRow(c);
    else {
      row = findOrphan(rec) || newOrphan(rec, 'nexa');
      indexOrphan(row, rec);
    }
    row.nexa.push(rec);
  }

  const out = [];
  for (const row of rows.values()) {
    const c = row.contact;
    const em = row.emails.slice().sort((a, b) => a.received_at.localeCompare(b.received_at));
    const nx = row.nexa;
    const name = c?.name || em[0]?.name || nx[0]?.lead_name || '';
    const phone = c?.phone || em[0]?.phone || nx[0]?.phone || '';
    const email = c?.email || em[0]?.email || nx[0]?.email || '';
    if (isTestRecord({ name, email, phone })) {
      excludedTests++;
      continue;
    }
    const myOpps = (c ? oppsBy.get(c.id) : null) || [];
    const primary = myOpps.slice().sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1) || (b.updated_at || '').localeCompare(a.updated_at || ''))[0];
    const t = (c && touches[c.id]) || null;
    const arrivedCandidates = [c?.created_at, em[0]?.received_at].filter(Boolean).sort();
    const nxFirstAt = nx.map((n) => n.first_attempt_at || n.received_at).filter(Boolean).sort()[0] || '';
    const arrived = arrivedCandidates[0] || nxFirstAt;
    const ageMin = arrived ? (now - Date.parse(arrived)) / 60000 : 0;

    const nxAttempts = nx.reduce((s, n) => s + (n.attempt_count || 0), 0);
    const nxFirst = nx.map((n) => n.first_attempt_at).filter(Boolean).sort()[0] || null;
    const nxEvents = nx.flatMap((n) => n.events || []).sort((a, b) => b.at.localeCompare(a.at));
    const nxLatest = nx.slice().sort((a, b) => (b.received_at || '').localeCompare(a.received_at || ''))[0];
    const ghlCalls = t?.calls || 0;
    const ghlContactAt = t?.first_contact_at || null;
    const firstContactAt = [ghlContactAt, nxFirst].filter(Boolean).sort()[0] || null;
    const firstBy = firstContactAt === ghlContactAt && ghlContactAt ? t.first_contact_by || 'Team member' : firstContactAt ? 'Nexa' : null;
    const speed = arrived && firstContactAt ? Math.max(0, minutesBetween(arrived, firstContactAt) ?? 0) : null;
    const myAppts = ((c && apptBy.get(c.id)) || []).slice().sort((a, b) => (b.start || '').localeCompare(a.start || ''));
    const appt = myAppts[0] || null;

    const sourceRaw = primary?.source || c?.source || c?.attribution?.source || em[0]?.source || '';
    const forwarded = em.length ? (em.some((e) => e.forwarded_to_nexa === true) || (em.every((e) => e.forwarded_to_nexa == null) ? nx.length > 0 : false)) : null;

    const flags = [];
    const flag = (code, extra = '') => flags.push({ code, label: FLAG_TEXT[code][0] + extra, level: FLAG_TEXT[code][1] });
    const inGhl = Boolean(c);
    if (inGhl && !myOpps.length && ageMin > 10) flag('no_opportunity');
    if ((em.length || nx.length) && !inGhl && ageMin > 10) flag('missing_from_ghl');
    const leadWasLive = nexaConnected && arrived && (!nexaSince || arrived >= nexaSince);
    if (leadWasLive && !nx.length && ageMin > graceMinutes && !appt) flag('not_sent_to_nexa');
    const callsKnown = nx.length > 0 || Boolean(t) || !inGhl;
    if (nexaConnected && leadWasLive && ageMin > graceMinutes && callsKnown && nxAttempts === 0 && !ghlCalls && !t?.attempts && !appt) flag('never_called');
    const emailMismatch = c && em.some((e) => e.email && (!c.email || normEmail(e.email) !== normEmail(c.email)));
    const nexaEmailFlag = nx.some((n) => (n.flags || []).some((f) => /email/i.test(f)));
    if (emailMismatch || nexaEmailFlag) flag('wrong_email');
    if (speed != null && speed > 30) flag('slow_response', ` (${Math.round(speed)} min)`);
    const otherMismatch = nx.flatMap((n) => n.flags || []).filter((f) => !/email/i.test(f));
    if (otherMismatch.length) flag('nexa_mismatch', `: ${otherMismatch.slice(0, 2).join(', ')}`);

    out.push({
      key: row.key,
      name,
      phone,
      email,
      source: normalizeSource(sourceRaw),
      source_raw: sourceRaw,
      arrived_at: arrived,
      in_ghl: inGhl,
      ghl_contact_id: c?.id || row.ghl_contact_id || '',
      pipeline: primary?.pipeline || '',
      stage: primary?.stage || '',
      opp_status: primary?.status || '',
      opp_value: primary?.value || 0,
      opp_count: myOpps.length,
      has_opportunity: myOpps.length > 0,
      by_email: em.length > 0,
      email_received_at: em[0]?.received_at || null,
      emailed_to_nexa: forwarded != null ? forwarded : nx.length ? true : nexaConnected ? false : null,
      in_nexa: nx.length > 0,
      nexa_attempts: nxAttempts,
      nexa_first_call_at: nxFirst,
      nexa_last_outcome: nxLatest?.outcome || nxEvents[0]?.result || '',
      nexa_status: nxLatest?.status || '',
      nexa_notes: nxLatest?.details || '',
      ghl_calls: ghlCalls,
      ghl_texts: t?.texts || 0,
      first_contact_at: firstContactAt,
      first_contact_by: firstBy,
      first_contact_by_robin: /robin/i.test(firstBy || ''),
      speed_minutes: speed,
      appointment: appt ? { status: appt.status, start: appt.start, calendar: appt.calendar, outcome: appt.outcome } : null,
      flags,
      needs_attention: flags.some((f) => f.level === 'bad'),
    });
  }
  out.sort((a, b) => (b.arrived_at || '').localeCompare(a.arrived_at || ''));
  const count = (code) => out.filter((r) => r.flags.some((f) => f.code === code)).length;
  return {
    rows: out,
    counts: {
      total: out.length,
      needs_attention: out.filter((r) => r.needs_attention).length,
      no_opportunity: count('no_opportunity'),
      never_called: count('never_called'),
      not_sent_to_nexa: count('not_sent_to_nexa'),
      wrong_email: count('wrong_email'),
      missing_from_ghl: count('missing_from_ghl'),
      slow_response: count('slow_response'),
      excluded_tests: excludedTests,
    },
    nexa_connected: nexaConnected,
    ghl_connected: Boolean(ghl),
  };
}
