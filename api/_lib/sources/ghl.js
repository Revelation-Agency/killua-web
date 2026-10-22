/**
 * GoHighLevel connector. Reads pipelines, EVERY opportunity and contact (full
 * cursor pagination), all calendars' appointments, and the call/text history
 * of recent leads to work out speed-to-lead and attempt counts.
 *
 * Env: GHL_TOKEN (private integration token), GHL_LOCATION_ID
 * Optional: GHL_ROBIN_CALENDAR_ID (default NZdC26OLQtOAc8iLipZG, "Robin Appointments"; any
 *           calendar whose name starts with "Robin" also counts as Robin's),
 *           GHL_EXCLUDE_CALENDAR_IDS (comma list; default Blaine's personal calendar
 *           2tn3NQUMCfrluZO4jABH, which is never read and never counted as sales),
 *           GHL_TOUCH_DAYS (how far back to read conversations, default 45),
 *           GHL_TOUCH_MAX (most leads to read conversations for, default 250)
 */
import { fetchJson, isTestRecord, minutesBetween, pacificDay, addDays, pool, sleep, toIso, str } from '../util.js';
import { errorSnapshot, missingEnv, notConnected, okSnapshot, paginateCursor } from './common.js';

export const id = 'ghl';
export const label = 'GoHighLevel';
const BASE = 'https://services.leadconnectorhq.com';
const PAGE = 100;

// ------------------------------------------------------------- normalizers
export function normContact(c) {
  const att = c.attributionSource || c.lastAttributionSource || (c.attributions || []).find((a) => a.isFirst) || (c.attributions || [])[0] || {};
  const name = c.contactName || [c.firstName, c.lastName].filter(Boolean).join(' ') || c.name || '';
  return {
    id: c.id,
    name: str(name, 120),
    phone: str(c.phone, 40),
    email: str(c.email, 160).toLowerCase(),
    source: str(c.source, 120),
    tags: Array.isArray(c.tags) ? c.tags.slice(0, 20).map((t) => str(t, 40)) : [],
    created_at: toIso(c.dateAdded || c.createdAt),
    attribution: { source: str(att.sessionSource || att.source, 80), medium: str(att.medium, 80), campaign: str(att.campaign, 160), url: str(att.url, 300) },
    assigned_to: str(c.assignedTo, 60),
  };
}

export function normOpportunity(o, pipelines) {
  const p = pipelines.find((x) => x.id === o.pipelineId);
  const stage = p?.stages.find((s) => s.id === o.pipelineStageId);
  const contact = o.contact || {};
  return {
    id: o.id,
    contact_id: o.contactId || contact.id || '',
    name: str(o.name || contact.name, 120),
    pipeline_id: o.pipelineId || '',
    pipeline: p?.name || '',
    stage_id: o.pipelineStageId || '',
    stage: stage?.name || '',
    stage_pos: stage?.position ?? 0,
    status: String(o.status || 'open').toLowerCase(),
    value: Number(o.monetaryValue) || 0,
    source: str(o.source, 120),
    created_at: toIso(o.createdAt || o.dateAdded),
    updated_at: toIso(o.updatedAt || o.lastStatusChangeAt),
    assigned_to: str(o.assignedTo, 60),
    contact_name: str(contact.name, 120),
    contact_phone: str(contact.phone, 40),
    contact_email: str(contact.email, 160).toLowerCase(),
  };
}

const APPT_STATUS = { new: 'booked', booked: 'booked', confirmed: 'confirmed', showed: 'showed', noshow: 'no-show', no_show: 'no-show', cancelled: 'cancelled', canceled: 'cancelled', invalid: 'cancelled' };

export function normAppointment(e, calendarsById, oppsByContact, usersById) {
  const raw = String(e.appointmentStatus || e.status || 'new').toLowerCase().replace(/[\s-]/g, '');
  const opp = (oppsByContact.get(e.contactId) || []).slice().sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))[0];
  let outcome = '';
  if (opp) {
    if (opp.status === 'won') outcome = 'Won';
    else if (opp.status === 'lost') outcome = 'Lost';
    else if (/closing/i.test(opp.stage)) outcome = 'Closing';
    else if (/ran|sold/i.test(opp.stage)) outcome = 'Appointment ran';
  }
  const cal = calendarsById.get(e.calendarId);
  return {
    id: e.id,
    calendar_id: e.calendarId || '',
    calendar: cal?.name || '',
    contact_id: e.contactId || '',
    title: str(e.title, 160),
    status: APPT_STATUS[raw] || raw,
    start: toIso(e.startTime),
    end: toIso(e.endTime),
    created_at: toIso(e.dateAdded),
    assigned_to: usersById[e.assignedUserId] || '',
    outcome,
    stage: opp?.stage || '',
    notes: str(e.notes, 300),
    address: str(e.address, 200),
  };
}

const kindOf = (m) => {
  const t = String(m.messageType || m.type || '').toUpperCase();
  if (/CALL|VOICE/.test(t)) return 'call';
  if (/SMS|WHATSAPP|FB|IG|GMB|LIVE_CHAT|TEXT/.test(t) || t === '1') return 'text';
  if (/EMAIL/.test(t)) return 'email';
  return 'other';
};

/**
 * Turns one lead's message history into speed-to-lead facts.
 * "Real contact" = an outbound call, or an outbound text sent by a person
 * (it has a user id) rather than an automatic workflow text.
 */
export function analyzeMessages(messages, createdAt, usersById = {}) {
  const events = messages
    .map((m) => ({
      at: toIso(m.dateAdded || m.createdAt),
      dir: String(m.direction || '').toLowerCase(),
      kind: kindOf(m),
      user: m.userId || '',
      auto: !m.userId || /workflow|bulk|campaign|api/i.test(String(m.source || '')),
      status: str(m.status || m.meta?.call?.status, 40),
      duration: Number(m.meta?.call?.duration) || 0,
    }))
    .filter((e) => e.at && (e.dir === 'outbound' || e.dir === 'inbound'))
    .sort((a, b) => a.at.localeCompare(b.at));
  const out = events.filter((e) => e.dir === 'outbound' && (e.kind === 'call' || e.kind === 'text'));
  const calls = out.filter((e) => e.kind === 'call');
  const humanTexts = out.filter((e) => e.kind === 'text' && !e.auto);
  const autoTexts = out.filter((e) => e.kind === 'text' && e.auto);
  const real = [...calls, ...humanTexts].sort((a, b) => a.at.localeCompare(b.at));
  const firstReal = real[0] || null;
  const first = (arr) => (arr[0] ? arr[0].at : null);
  return {
    attempts: calls.length + humanTexts.length,
    calls: calls.length,
    answered_calls: calls.filter((c) => c.duration > 20 || /complete|answered/i.test(c.status)).length,
    texts: humanTexts.length,
    auto_texts: autoTexts.length,
    inbound: events.filter((e) => e.dir === 'inbound').length,
    first_call_at: first(calls),
    first_touch_at: first(out),
    first_contact_at: firstReal ? firstReal.at : null,
    first_contact_by: firstReal && firstReal.user ? usersById[firstReal.user] || 'Team member' : null,
    speed_minutes: firstReal && createdAt ? Math.max(0, minutesBetween(createdAt, firstReal.at) ?? 0) : null,
    last_touch_at: out.length ? out[out.length - 1].at : null,
    recent: events.slice(-8).map(({ at, dir, kind, status, duration }) => ({ at, dir, kind, status, duration })),
  };
}

// ------------------------------------------------------------- the run
export async function run(ctx) {
  const { env = process.env, fetchImpl = fetch } = ctx;
  const missing = missingEnv(env, ['GHL_TOKEN', 'GHL_LOCATION_ID']);
  if (missing.length) {
    return notConnected(id, label, [
      { who: 'Blaine', what: `In GoHighLevel, create a Private Integration for the Killua location with read access to contacts, opportunities, calendars and conversations, then add ${missing.join(' and ')} to the dashboard settings in Vercel.` },
    ]);
  }
  const loc = env.GHL_LOCATION_ID.trim();
  const headers = { Authorization: `Bearer ${env.GHL_TOKEN.trim()}`, Version: '2021-07-28', Accept: 'application/json' };
  const started = Date.now();
  let lastCall = 0;
  const get = async (path, params = {}) => {
    const wait = 90 - (Date.now() - lastCall);
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''));
    return fetchJson(`${BASE}${path}?${q}`, { headers }, { fetchImpl });
  };
  const notes = [];
  try {
    // pipelines
    const pj = await get('/opportunities/pipelines', { locationId: loc });
    const pipelines = (pj.pipelines || []).map((p) => ({
      id: p.id,
      name: p.name,
      stages: (p.stages || []).map((s, i) => ({ id: s.id, name: s.name, position: s.position ?? i })).sort((a, b) => a.position - b.position),
    }));

    // every opportunity
    const oppRes = await paginateCursor({
      fetchPage: (cur) => get('/opportunities/search', { location_id: loc, limit: PAGE, startAfter: cur?.startAfter, startAfterId: cur?.startAfterId }),
      items: (b) => b.opportunities,
      next: (b, batch) => (b.meta?.startAfterId && batch.length >= 1 ? { startAfter: b.meta.startAfter, startAfterId: b.meta.startAfterId } : null),
    });
    if (oppRes.total != null && oppRes.items.length < oppRes.total) notes.push(`Read ${oppRes.items.length} of ${oppRes.total} opportunities.`);
    if (oppRes.capped) notes.push('Stopped reading opportunities at the safety limit.');
    const opportunities = oppRes.items.map((o) => normOpportunity(o, pipelines));

    // every contact
    const conRes = await paginateCursor({
      fetchPage: (cur) => get('/contacts/', { locationId: loc, limit: PAGE, startAfter: cur?.startAfter, startAfterId: cur?.startAfterId }),
      items: (b) => b.contacts,
      next: (b, batch) => (b.meta?.startAfterId && batch.length >= 1 ? { startAfter: b.meta.startAfter, startAfterId: b.meta.startAfterId } : null),
    });
    if (conRes.total != null && conRes.items.length < conRes.total) notes.push(`Read ${conRes.items.length} of ${conRes.total} contacts.`);
    const contacts = conRes.items.map(normContact);

    // team members (optional scope)
    let usersById = {};
    try {
      const uj = await get('/users/', { locationId: loc });
      for (const u of uj.users || []) usersById[u.id] = u.name || [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || 'Team member';
    } catch {
      notes.push('Could not read team members; names of who contacted a lead show as "Team member". Add the users.readonly permission to fix this.');
    }

    // calendars and appointments
    const cj = await get('/calendars/', { locationId: loc });
    const excluded = new Set(String(env.GHL_EXCLUDE_CALENDAR_IDS || '2tn3NQUMCfrluZO4jABH').split(',').map((x) => x.trim()).filter(Boolean));
    const calendars = (cj.calendars || []).filter((c) => !excluded.has(c.id)).map((c) => ({ id: c.id, name: c.name || 'Calendar', active: c.isActive !== false }));
    const calendarsById = new Map(calendars.map((c) => [c.id, c]));
    const oppsByContact = new Map();
    for (const o of opportunities) {
      if (!o.contact_id) continue;
      if (!oppsByContact.has(o.contact_id)) oppsByContact.set(o.contact_id, []);
      oppsByContact.get(o.contact_id).push(o);
    }
    const nowMs = Date.now();
    const rawEvents = new Map();
    const windows = [];
    for (let from = nowMs - 120 * 86400000; from < nowMs + 60 * 86400000; from += 30 * 86400000) windows.push([from, Math.min(from + 30 * 86400000, nowMs + 60 * 86400000)]);
    for (const cal of calendars) {
      for (const [a, b] of windows) {
        try {
          const ej = await get('/calendars/events', { locationId: loc, calendarId: cal.id, startTime: a, endTime: b });
          for (const e of ej.events || []) rawEvents.set(e.id, e);
        } catch (e) {
          notes.push(`Calendar "${cal.name}": ${e.message}`);
          break;
        }
      }
    }
    const robinId = (env.GHL_ROBIN_CALENDAR_ID || 'NZdC26OLQtOAc8iLipZG').trim();
    const isRobinCal = (calId) => calId === robinId || /^robin\b/i.test(calendarsById.get(calId)?.name || '');
    const appointments = [...rawEvents.values()]
      .filter((e) => calendarsById.has(e.calendarId) && (e.contactId || e.title))
      .map((e) => ({ ...normAppointment(e, calendarsById, oppsByContact, usersById), is_robin: isRobinCal(e.calendarId) }))
      .sort((a, b) => (b.start || '').localeCompare(a.start || ''));

    // call/text history for recent leads (newest first, within time budget)
    const touchDays = Number(env.GHL_TOUCH_DAYS) || 45;
    const touchMax = Number(env.GHL_TOUCH_MAX) || 250;
    const cutoff = addDays(pacificDay(new Date()), -touchDays);
    const createdBy = new Map();
    for (const c of contacts) createdBy.set(c.id, c.created_at);
    for (const o of opportunities) if (o.contact_id && !createdBy.has(o.contact_id)) createdBy.set(o.contact_id, o.created_at);
    const recentIds = [...createdBy.entries()]
      .filter(([, at]) => at && pacificDay(at) >= cutoff)
      .sort((a, b) => b[1].localeCompare(a[1]))
      .slice(0, touchMax);
    const budget = Number(ctx.budgetMs) || 150000;
    const touches = {};
    let skipped = 0;
    await pool(recentIds, 4, async ([cid, createdAt]) => {
      if (Date.now() - started > budget) {
        skipped++;
        return;
      }
      try {
        const cs = await get('/conversations/search', { locationId: loc, contactId: cid, limit: 3 });
        const messages = [];
        for (const conv of (cs.conversations || []).slice(0, 2)) {
          let lastId;
          for (let page = 0; page < 5; page++) {
            const mj = await get(`/conversations/${conv.id}/messages`, { limit: 100, lastMessageId: lastId });
            const box = mj.messages || {};
            messages.push(...(box.messages || []));
            if (!box.nextPage || !box.lastMessageId) break;
            lastId = box.lastMessageId;
          }
        }
        touches[cid] = analyzeMessages(messages, createdAt, usersById);
      } catch (e) {
        if (e.status === 401 || e.status === 403) throw e;
        notes.push(`Conversation read failed for one lead: ${e.message}`);
      }
    });
    if (skipped) notes.push(`Ran out of time before reading call history for ${skipped} older leads; they fill in on the next refresh.`);

    const data = { location_id: loc, pipelines, calendars, users: usersById, contacts, opportunities, appointments, touches, counts: { opportunities: opportunities.length, contacts: contacts.length, appointments: appointments.length, touches: Object.keys(touches).length } };
    return okSnapshot(id, label, data, { notes: [...new Set(notes)].slice(0, 12) });
  } catch (e) {
    return failure(e);
  }
}

function failure(e) {
  if (e.status === 401 || e.status === 403) {
    return errorSnapshot(id, label, 'GoHighLevel refused the connection. The token is wrong, expired, or missing a permission.', [
      { who: 'Blaine', what: 'Open the Private Integration in GoHighLevel, confirm it has read access to contacts, opportunities, calendars and conversations (and users), copy the token again into GHL_TOKEN in Vercel.' },
    ]);
  }
  return errorSnapshot(id, label, `GoHighLevel could not be read: ${str(e.message, 200)}`, [{ who: 'Revelation', what: 'Try Refresh now in a few minutes; if it keeps failing, check the GoHighLevel status page.' }]);
}
