/**
 * Small shared helpers for the dashboard functions: HTTP plumbing, time in
 * Pacific, number handling. No dependencies.
 */
import { timingSafeEqual, createHash } from 'node:crypto';

export const TZ = 'America/Los_Angeles';
export const LAUNCH_DATE = '2026-10-17'; // Meta ads went live

// ---------------------------------------------------------------- strings
export const str = (v, max = 300) =>
  (typeof v === 'string' ? v : v == null ? '' : String(v))
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max);

export const num = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[$,%\s,]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

export const round = (n, d = 2) => (Number.isFinite(n) ? Math.round(n * 10 ** d) / 10 ** d : 0);
export const safeDiv = (a, b) => (b > 0 ? a / b : null);

export function digits10(v) {
  const d = String(v ?? '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : '';
}
export const normEmail = (v) => String(v ?? '').trim().toLowerCase();

export function sha(v) {
  return createHash('sha256').update(String(v)).digest('hex');
}

/** Constant-time string equality (length leak only). */
export function safeEqual(a, b) {
  const x = createHash('sha256').update(String(a)).digest();
  const y = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(x, y) && String(a).length === String(b).length;
}

export function isTestRecord({ name = '', email = '', phone = '' } = {}) {
  return (
    /^test\b/i.test(name.trim()) ||
    /\btest\s+(lead|contact|user)\b/i.test(name) ||
    /\+killuatest@/i.test(email) ||
    /@example\.(com|org|net)$/i.test(email) ||
    /^\+?1?\d{3}55501\d{2}$/.test(String(phone).replace(/\D/g, '').replace(/^1(?=\d{10}$)/, ''))
  );
}

// ---------------------------------------------------------------- time
const dtf = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

/** 'YYYY-MM-DD' in Pacific for a Date / ISO string / ms. '' when unparseable. */
export function pacificDay(ts) {
  const d = ts instanceof Date ? ts : new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return dtf.format(d);
}

export function addDays(day, n) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function weekStart(day) {
  const d = new Date(`${day}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  return addDays(day, -dow);
}
export const monthStart = (day) => `${day.slice(0, 7)}-01`;

/** Seconds -> ms-safe ISO, accepts epoch seconds/ms, ISO strings. */
export function toIso(v) {
  if (v == null || v === '') return '';
  let d;
  if (typeof v === 'number' || /^\d{10,13}$/.test(String(v))) {
    const n = Number(v);
    d = new Date(n < 1e12 ? n * 1000 : n);
  } else d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

export const minutesBetween = (a, b) => {
  const x = Date.parse(a), y = Date.parse(b);
  return Number.isFinite(x) && Number.isFinite(y) ? Math.round(((y - x) / 60000) * 10) / 10 : null;
};

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- http (outbound)
/**
 * fetch + JSON with timeout, 429/5xx retry (honours Retry-After). Throws an
 * Error with .status and .body on a non-2xx answer.
 */
export async function fetchJson(url, init = {}, { retries = 3, timeout = 25000, fetchImpl = fetch } = {}) {
  let attempt = 0;
  for (;;) {
    let res;
    try {
      res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeout) });
    } catch (err) {
      if (attempt++ < retries) {
        await sleep(400 * 2 ** attempt);
        continue;
      }
      const e = new Error(`network error: ${err?.message || err}`);
      e.status = 0;
      throw e;
    }
    if (res.status === 429 || res.status >= 500) {
      if (attempt++ < retries) {
        const ra = Number(res.headers.get('retry-after'));
        await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 15000) : 600 * 2 ** attempt);
        continue;
      }
    }
    const text = await res.text();
    let body;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { raw: text.slice(0, 500) };
    }
    if (!res.ok) {
      const e = new Error(body?.message || body?.error?.message || body?.error_description || `HTTP ${res.status}`);
      e.status = res.status;
      e.body = body;
      throw e;
    }
    return body;
  }
}

/** Runs async fn over items with limited concurrency. */
export async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k], k);
      }
    })
  );
  return out;
}

// ---------------------------------------------------------------- http (inbound)
export function send(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  if (typeof body === 'string' || Buffer.isBuffer(body)) {
    if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.end(body);
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.end(JSON.stringify(body));
}

/** Reads the body whether the platform pre-parsed it or not. Returns {json, form, raw}. */
export async function readBody(req, limit = 1_000_000) {
  let raw;
  if (req.body !== undefined && req.body !== null) {
    if (Buffer.isBuffer(req.body)) raw = req.body.toString('utf8');
    else if (typeof req.body === 'string') raw = req.body;
    else return { json: req.body, raw: null };
  } else {
    const chunks = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > limit) {
        const e = new Error('body too large');
        e.status = 413;
        throw e;
      }
      chunks.push(c);
    }
    raw = Buffer.concat(chunks).toString('utf8');
  }
  if (raw.length > limit) {
    const e = new Error('body too large');
    e.status = 413;
    throw e;
  }
  const type = String(req.headers['content-type'] || '');
  try {
    if (type.includes('application/x-www-form-urlencoded')) return { json: Object.fromEntries(new URLSearchParams(raw)), raw };
    return { json: raw ? JSON.parse(raw) : {}, raw };
  } catch {
    const e = new Error('invalid JSON');
    e.status = 400;
    throw e;
  }
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

export const escHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function requestHost(req) {
  return String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
}

/** Same-site check for browser POSTs: Origin (when present) must be this host. */
export function sameOrigin(req) {
  const o = req.headers.origin;
  if (!o) return true;
  try {
    return new URL(o).host === requestHost(req);
  } catch {
    return false;
  }
}
