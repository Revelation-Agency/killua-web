/**
 * Push-style sources: agents POST records to /api/dash/ingest/<source>.
 *
 * Body: { "mode": "append" | "replace", "records": [ ... ] }  (a bare array also works)
 *   append  (default): each record is added, or, if a record with the same key
 *           already exists, updated. Sending the same record twice is safe.
 *   replace: the stored collection for that source is swapped for exactly the
 *           records sent. (For `social`, only posts that came in through ingest
 *           are replaced; posts typed in on the dashboard are never touched.)
 * Every record is checked field by field; bad records are rejected one by one
 * and reported back, good ones are still stored.
 */
import { digits10, normEmail, sha, str, num, toIso } from './util.js';
import { readModifyWrite } from './store.js';

export const SOURCES = ['nexa', 'email_leads', 'sales_agent', 'social', 'other_ads'];
export const MAX_RECORDS_PER_CALL = 2000;
export const MAX_RECORDS_STORED = 20000;
export const POST_STATUSES = ['planned', 'waiting_approval', 'scheduled', 'published', 'failed'];
export const PLATFORMS = ['facebook', 'instagram', 'tiktok', 'youtube', 'google_business', 'linkedin', 'x', 'other'];

const FIELD = {
  str: (spec, v, errs, k) => {
    if (v == null || v === '') return '';
    if (typeof v !== 'string' && typeof v !== 'number') return errs.push(`${k} must be text`), '';
    return str(v, spec.max || 300);
  },
  email: (spec, v, errs, k) => {
    const e = normEmail(v);
    if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) errs.push(`${k} is not an email address`);
    return e.slice(0, 160);
  },
  phone: (spec, v, errs, k) => {
    const d = String(v ?? '').replace(/\D/g, '');
    if (!d) return '';
    if (d.length < 10 || d.length > 15) errs.push(`${k} is not a phone number`);
    return d.length === 10 ? `+1${d}` : d.length === 11 && d.startsWith('1') ? `+${d}` : `+${d}`;
  },
  iso: (spec, v, errs, k) => {
    if (v == null || v === '') return '';
    // A bare date means "that day, Pacific": 19:00 UTC is midday there in both summer and winter.
    const iso = toIso(/^\d{4}-\d{2}-\d{2}$/.test(String(v).trim()) ? `${String(v).trim()}T19:00:00Z` : v);
    if (!iso) errs.push(`${k} is not a date and time (use ISO 8601, like 2026-10-21T15:04:00-07:00)`);
    return iso;
  },
  day: (spec, v, errs, k) => {
    const s = String(v ?? '').slice(0, 10);
    if (s && !/^\d{4}-\d{2}-\d{2}$/.test(s)) errs.push(`${k} must be a date like 2026-10-21`);
    return s;
  },
  num: (spec, v, errs, k) => {
    if (v == null || v === '') return 0;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) errs.push(`${k} must be a number, zero or more`);
    return Number.isFinite(n) ? n : 0;
  },
  bool: (spec, v) => (v === true || v === 'true' || v === 'yes' ? true : v === false || v === 'false' || v === 'no' ? false : null),
  enum: (spec, v, errs, k) => {
    const s = String(v ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (s && !spec.values.includes(s)) errs.push(`${k} must be one of: ${spec.values.join(', ')}`);
    return s;
  },
  url: (spec, v, errs, k) => {
    const s = str(v, 500);
    if (s && !/^https?:\/\//i.test(s)) errs.push(`${k} must start with http:// or https://`);
    return s;
  },
  strs: (spec, v, errs, k) => {
    if (v == null) return [];
    if (!Array.isArray(v)) return errs.push(`${k} must be a list`), [];
    return v.slice(0, spec.max || 10).map((x) => str(x, 80));
  },
  attempts: (spec, v, errs, k) => {
    if (v == null) return [];
    if (!Array.isArray(v)) return errs.push(`${k} must be a list`), [];
    return v.slice(0, 50).map((a, i) => {
      const e2 = [];
      const out = { at: FIELD.iso({}, a?.at, e2, `${k}[${i}].at`), result: str(a?.result ?? a?.outcome, 120) };
      if (!out.at) e2.push(`${k}[${i}].at is required`);
      errs.push(...e2);
      return out;
    });
  },
};

export const NEXA_KINDS = ['lead_outcome', 'followup_dispatch', 'other'];

/**
 * Pulls name, service and ad details out of a lead-email subject like
 * "New Killua lead: Jane Smith - Solar installation (Ad: Facebook / Fall Solar / Video 2)".
 */
export function parseLeadSubject(subject) {
  const m = /lead:\s*(.+?)\s+-\s+(.+?)\s*(?:\(\s*Ad:\s*(.*?)\s*\))?\s*$/i.exec(String(subject || ''));
  if (!m) return {};
  const [source = '', campaign = '', ad = ''] = (m[3] || '').split('/').map((x) => x.trim());
  return { name: m[1].trim(), service: m[2].trim(), source, campaign, ad };
}

const SCHEMAS = {
  nexa: {
    message_id: { t: 'str', max: 80 },
    received_at: { t: 'iso', req: true },
    kind: { t: 'enum', values: NEXA_KINDS },
    lead_name: { t: 'str', max: 120 },
    phone: { t: 'phone' },
    email: { t: 'email' },
    outcome: { t: 'str', max: 160 },
    details: { t: 'str', max: 1500 },
    status: { t: 'str', max: 120 },
    attempts: { t: 'attempts' },
    ghl_contact_id: { t: 'str', max: 60 },
    flags: { t: 'strs', max: 10 },
    need: ['message_id|phone|email|lead_name'],
    key: (r) => r.message_id ? `${r.message_id}|${r.kind}|${r.received_at}` : sha(`${r.received_at}|${r.kind}|${digits10(r.phone)}|${r.outcome}`).slice(0, 24),
  },
  email_leads: {
    id: { t: 'str', max: 120 },
    received_at: { t: 'iso', req: true },
    source: { t: 'str', max: 160 },
    campaign: { t: 'str', max: 160 },
    ad: { t: 'str', max: 160 },
    name: { t: 'str', max: 120 },
    phone: { t: 'phone' },
    email: { t: 'email' },
    address: { t: 'str', max: 300 },
    service: { t: 'str', max: 80 },
    subject: { t: 'str', max: 300 },
    ghl_contact_id: { t: 'str', max: 60 },
    forwarded_to_nexa: { t: 'bool' },
    need: ['name|phone|email'],
    key: (r) => r.id || sha(`${r.received_at}|${digits10(r.phone)}|${r.email}|${r.subject}`).slice(0, 24),
  },
  sales_agent: {
    id: { t: 'str', max: 120 },
    lead_name: { t: 'str', max: 120 },
    ghl_contact_id: { t: 'str', max: 60 },
    phone: { t: 'phone' },
    event_type: { t: 'str', max: 60, req: true },
    summary: { t: 'str', max: 1000, req: true },
    at: { t: 'iso', req: true },
    outcome: { t: 'str', max: 120 },
    need: [],
    key: (r) => r.id || sha(`${r.at}|${r.event_type}|${r.ghl_contact_id}|${r.lead_name}|${r.summary.slice(0, 40)}`).slice(0, 24),
  },
  social: {
    id: { t: 'str', max: 80 },
    platform: { t: 'enum', values: PLATFORMS, req: true },
    status: { t: 'enum', values: POST_STATUSES, req: true },
    scheduled_at: { t: 'iso', req: true },
    title: { t: 'str', max: 160 },
    caption: { t: 'str', max: 2200 },
    link: { t: 'url' },
    media_url: { t: 'url' },
    error: { t: 'str', max: 300 },
    notes: { t: 'str', max: 500 },
    need: [],
    key: (r) => r.id || sha(`${r.platform}|${r.scheduled_at}|${r.caption.slice(0, 60)}`).slice(0, 20),
  },
  other_ads: {
    platform: { t: 'str', max: 40, req: true },
    date: { t: 'day', req: true },
    campaign: { t: 'str', max: 160 },
    spend: { t: 'num' },
    impressions: { t: 'num' },
    clicks: { t: 'num' },
    leads: { t: 'num' },
    need: [],
    key: (r) => `${r.platform}|${r.date}|${r.campaign}`,
  },
};

/** Checks one record. Returns { value, errors }. Unknown fields are dropped. */
export function validateRecord(source, rec) {
  const schema = SCHEMAS[source];
  const errors = [];
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return { value: null, errors: ['record must be an object'] };
  const out = {};
  for (const [k, spec] of Object.entries(schema)) {
    if (!spec || typeof spec !== 'object' || !spec.t) continue;
    const before = errors.length;
    out[k] = FIELD[spec.t](spec, rec[k], errors, k);
    if (spec.req && (out[k] === '' || out[k] == null) && errors.length === before) errors.push(`${k} is required`);
  }
  for (const need of schema.need) {
    if (!need.split('|').some((f) => out[f])) errors.push(`one of ${need.split('|').join(', ')} is required`);
  }
  if (source === 'other_ads') out.platform = out.platform.toLowerCase().replace(/[\s-]+/g, '_');
  if (source === 'nexa') {
    out.kind = out.kind || 'lead_outcome';
    // One event per call attempt. Nexa's own messages (a lead outcome, a follow-up dispatch) each count as one.
    out.events = out.attempts.length
      ? out.attempts.slice().sort((a, b) => a.at.localeCompare(b.at)).map((a) => ({ at: a.at, result: a.result || out.outcome || out.status, kind: out.kind }))
      : out.kind === 'other' ? [] : [{ at: out.received_at, result: out.outcome || out.status, kind: out.kind }];
    out.attempt_count = out.events.length;
    out.first_attempt_at = out.events[0]?.at || null;
  }
  if (source === 'email_leads') {
    const p = parseLeadSubject(out.subject);
    out.name = out.name || p.name || '';
    out.service = out.service || p.service || '';
    out.source = out.source || p.source || '';
    out.campaign = out.campaign || p.campaign || '';
    out.ad = out.ad || p.ad || '';
    // anything with TEST in the subject is a test and is left out of every count
    out.is_test = /\btest\b/i.test(out.subject);
  }
  if (errors.length) return { value: null, errors };
  out.id = schema.key(out);
  return { value: out, errors: [] };
}

export function parseIngestBody(body) {
  const records = Array.isArray(body) ? body : body?.records;
  const mode = Array.isArray(body) ? 'append' : String(body?.mode || 'append').toLowerCase();
  if (!Array.isArray(records)) return { error: 'Body must be {"records":[...]} or an array of records.' };
  if (!['append', 'replace'].includes(mode)) return { error: 'mode must be "append" or "replace".' };
  if (records.length > MAX_RECORDS_PER_CALL) return { error: `Send at most ${MAX_RECORDS_PER_CALL} records per call.` };
  if (mode === 'replace' && records.length === 0) return { error: 'replace with zero records would empty the list; send at least one record.' };
  return { records, mode };
}

/** Pure merge used by the store writer and the verify script. */
export function mergeRecords(existing, incoming, mode, { keepNonIngest = false } = {}) {
  const now = new Date().toISOString();
  const kept = mode === 'replace' ? (keepNonIngest ? existing.filter((r) => r.origin && r.origin !== 'ingest') : []) : existing.slice();
  const index = new Map(kept.map((r, i) => [r.id, i]));
  for (const r of incoming) {
    const rec = { ...r, updated_at: now };
    if (index.has(r.id)) {
      const old = kept[index.get(r.id)];
      kept[index.get(r.id)] = { ...old, ...rec, origin: old.origin ?? rec.origin, first_seen_at: old.first_seen_at || old.updated_at || now };
    } else {
      index.set(r.id, kept.length);
      kept.push({ ...rec, first_seen_at: now });
    }
  }
  return kept.slice(-MAX_RECORDS_STORED);
}

/**
 * Validates and stores a push. Returns { status, body } for the HTTP layer.
 */
export async function ingest(source, rawBody, env = process.env) {
  if (!SOURCES.includes(source)) return { status: 404, body: { ok: false, error: `Unknown source. Use one of: ${SOURCES.join(', ')}.` } };
  const parsed = parseIngestBody(rawBody);
  if (parsed.error) return { status: 400, body: { ok: false, error: parsed.error } };
  const good = [];
  const rejected = [];
  parsed.records.forEach((rec, index) => {
    const r = validateRecord(source, rec);
    if (r.value) good.push(r.value);
    else rejected.push({ index, errors: r.errors });
  });
  if (!good.length) return { status: 422, body: { ok: false, accepted: 0, rejected } };
  const docName = source === 'social' ? 'social' : `ingest/${source}`;
  let total = 0;
  await readModifyWrite(docName, source === 'social' ? { posts: [] } : { records: [], log: [] }, (doc) => {
    const now = new Date().toISOString();
    if (source === 'social') {
      const incoming = good.map((g) => ({ ...g, origin: 'ingest' }));
      // posts typed in on the dashboard keep their origin; ingest only touches its own, or updates by id
      doc.posts = mergeRecords(doc.posts || [], incoming, parsed.mode, { keepNonIngest: true });
      doc.as_of = now;
      total = doc.posts.length;
    } else {
      doc.records = mergeRecords(doc.records || [], good, parsed.mode);
      doc.as_of = now;
      doc.log = [{ at: now, mode: parsed.mode, accepted: good.length, rejected: rejected.length }, ...(doc.log || [])].slice(0, 20);
      total = doc.records.length;
    }
    return doc;
  }, env);
  return { status: 200, body: { ok: true, mode: parsed.mode, accepted: good.length, rejected, stored_total: total } };
}

/** Health snapshot for a push source, in the same shape as the connectors. */
export function ingestSnapshot(source, label, doc, { staleHours = 36, needs } = {}) {
  const base = { v: 1, source, label, checked_at: new Date().toISOString(), notes: [] };
  if (!doc || !doc.records?.length) {
    return { ...base, status: 'not_connected', as_of: null, error: null, needs: needs || [], data: null };
  }
  const ageH = (Date.now() - Date.parse(doc.as_of)) / 3600000;
  const notes = ageH > staleHours ? [`No new data for ${Math.round(ageH)} hours.`] : [];
  return { ...base, status: 'ok', as_of: doc.as_of, error: null, needs: ageH > staleHours ? (needs || []) : [], notes, data: { records: doc.records, last: doc.log?.[0] || null } };
}
