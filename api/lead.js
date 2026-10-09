/**
 * POST /api/lead : the one server endpoint every Killua form posts to.
 *
 * Validates the lead, forwards it to ONE webhook (KILLUA_LEAD_WEBHOOK_URL,
 * Lane 2's n8n front door, or a test catcher until that exists), then, only if
 * the visitor allowed advertising, sends the same lead to the Meta Conversions
 * API and TikTok Events API with the browser's event_id so the platforms
 * de-duplicate it against the pixel.
 *
 * Environment (Vercel project settings, never committed):
 *   KILLUA_LEAD_WEBHOOK_URL       required; where leads go
 *   KILLUA_LEAD_WEBHOOK_SECRET    optional; HMAC-SHA256 of the body in X-Killua-Signature
 *   PUBLIC_META_PIXEL_ID + META_CAPI_TOKEN          optional; Meta server events
 *   META_TEST_EVENT_CODE, META_GRAPH_VERSION        optional
 *   PUBLIC_TIKTOK_PIXEL_ID + TIKTOK_EVENTS_TOKEN    optional; TikTok server events
 *   TIKTOK_TEST_EVENT_CODE                          optional
 *
 * Lives in /api so Vercel runs it as a function beside the static Astro build;
 * the site itself stays fully static.
 */
import { createHash, createHmac, randomUUID } from 'node:crypto';

const SERVICES = [
  'solar_installation',
  'battery_storage',
  'solar_repair',
  'roof_replacement',
  'roof_repair',
  'roof_inspection',
  'ev_charger',
];
const ENUMS = {
  service: SERVICES,
  homeowner: ['yes', 'no'],
  monthly_bill: ['', 'under_150', '150_250', '250_400', '400_plus', 'not_sure'],
  roof_age: ['', 'under_10', '10_20', '20_plus', 'not_sure'],
  panel_location: ['', 'garage', 'outside', 'other', 'not_sure'],
  best_time_to_call: ['', 'morning', 'afternoon', 'evening', 'anytime'],
  ad_consent: ['granted', 'denied'],
};

/** The webhook contract, in order. Anything else the browser sends is dropped. */
export const CONTRACT = [
  'lead_id', 'event_id', 'received_at', 'submitted_at', 'form_started_at',
  'source', 'form_id', 'environment', 'test',
  'service', 'first_name', 'last_name', 'phone', 'email',
  'street', 'city', 'state', 'zip', 'homeowner',
  'monthly_bill', 'roof_age', 'problem_description', 'ev_make', 'panel_location',
  'best_time_to_call', 'notes',
  'consent_calls_texts', 'consent_text', 'consent_privacy_url', 'consent_texting_url',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'gclid', 'fbclid', 'ttclid', 'landing_page', 'referrer', 'page_url',
  'ad_consent', 'ip', 'user_agent',
];

const LONG = { problem_description: 1200, notes: 1500, consent_text: 1000, landing_page: 600, referrer: 600, page_url: 600 };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const str = (v, max = 300) =>
  (typeof v === 'string' ? v : v == null ? '' : String(v))
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max);

function normalisePhone(v) {
  let d = str(v, 40).replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  return d.length === 10 ? `+1${d}` : '';
}

export function cleanLead(body) {
  const lead = {};
  for (const k of CONTRACT) lead[k] = str(body[k], LONG[k] ?? 300);
  lead.phone = normalisePhone(body.phone);
  lead.email = lead.email.toLowerCase();
  lead.state = lead.state.toUpperCase();
  lead.consent_calls_texts = body.consent_calls_texts === true || body.consent_calls_texts === 'yes';
  lead.ad_consent = body.ad_consent === 'granted' ? 'granted' : 'denied';
  return lead;
}

export function validateLead(lead) {
  const bad = [];
  for (const k of ['first_name', 'last_name', 'street', 'city']) if (!lead[k]) bad.push(k);
  if (!lead.phone) bad.push('phone');
  if (!EMAIL.test(lead.email)) bad.push('email');
  if (!/^[A-Z]{2}$/.test(lead.state)) bad.push('state');
  if (!/^\d{5}$/.test(lead.zip)) bad.push('zip');
  for (const [k, allowed] of Object.entries(ENUMS)) if (!allowed.includes(lead[k])) bad.push(k);
  if (!lead.consent_calls_texts) bad.push('consent_calls_texts');
  return bad;
}

/** Lane 2's test conventions: name TEST, +killuatest email, 555-01xx numbers. */
export function isTestLead(lead) {
  return (
    /^test$/i.test(lead.first_name) ||
    /\+killuatest@/i.test(lead.email) ||
    /@example\.(com|org|net)$/i.test(lead.email) ||
    /^\+1\d{3}55501\d{2}$/.test(lead.phone)
  );
}

const sha = (v) => (v ? createHash('sha256').update(v).digest('hex') : undefined);

async function withTimeout(promise, ms) {
  let t;
  try {
    return await Promise.race([promise, new Promise((_, rej) => (t = setTimeout(() => rej(new Error('timeout')), ms)))]);
  } finally {
    clearTimeout(t);
  }
}

async function metaCapi(lead, extra) {
  const pixel = process.env.PUBLIC_META_PIXEL_ID;
  const token = process.env.META_CAPI_TOKEN;
  if (!pixel || !token || lead.ad_consent !== 'granted') return 'skipped';
  const v = process.env.META_GRAPH_VERSION || 'v23.0';
  const body = {
    data: [
      {
        event_name: 'Lead',
        event_time: Math.floor(Date.now() / 1000),
        event_id: lead.event_id,
        action_source: 'website',
        event_source_url: lead.page_url,
        user_data: {
          // No phone, hashed or not: the texting programs promise that mobile
          // numbers are never shared with third parties for marketing.
          em: [sha(lead.email)],
          fn: [sha(lead.first_name.toLowerCase())],
          ln: [sha(lead.last_name.toLowerCase())],
          ct: [sha(lead.city.toLowerCase().replace(/\s+/g, ''))],
          st: [sha(lead.state.toLowerCase())],
          zp: [sha(lead.zip)],
          country: [sha('us')],
          client_ip_address: lead.ip || undefined,
          client_user_agent: lead.user_agent || undefined,
          fbc: extra.fbc || undefined,
          fbp: extra.fbp || undefined,
        },
        custom_data: { content_category: lead.service },
      },
    ],
  };
  if (process.env.META_TEST_EVENT_CODE) body.test_event_code = process.env.META_TEST_EVENT_CODE;
  const r = await fetch(`https://graph.facebook.com/${v}/${pixel}/events?access_token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.ok ? 'sent' : `error ${r.status}`;
}

async function tiktokEvents(lead, extra) {
  const pixel = process.env.PUBLIC_TIKTOK_PIXEL_ID;
  const token = process.env.TIKTOK_EVENTS_TOKEN;
  if (!pixel || !token || lead.ad_consent !== 'granted') return 'skipped';
  const body = {
    event_source: 'web',
    event_source_id: pixel,
    data: [
      {
        event: 'SubmitForm',
        event_time: Math.floor(Date.now() / 1000),
        event_id: lead.event_id,
        user: {
          email: sha(lead.email),
          ip: lead.ip || undefined,
          user_agent: lead.user_agent || undefined,
          ttclid: lead.ttclid || undefined,
          ttp: extra.ttp || undefined,
        },
        page: { url: lead.page_url, referrer: lead.referrer || undefined },
        properties: { content_type: 'product', content_id: lead.service },
      },
    ],
  };
  if (process.env.TIKTOK_TEST_EVENT_CODE) body.test_event_code = process.env.TIKTOK_TEST_EVENT_CODE;
  const r = await fetch('https://business-api.tiktok.com/open_api/v1.3/event/track/', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Access-Token': token },
    body: JSON.stringify(body),
  });
  return r.ok ? 'sent' : `error ${r.status}`;
}

function parseBody(req) {
  let body = req.body;
  if (typeof body === 'string' || Buffer.isBuffer(body)) {
    const text = body.toString();
    if (text.length > 20000) return null;
    const form = String(req.headers['content-type'] || '').includes('application/x-www-form-urlencoded');
    try {
      body = form ? Object.fromEntries(new URLSearchParams(text)) : JSON.parse(text);
    } catch {
      return null;
    }
  }
  return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }
  const isForm = String(req.headers['content-type'] || '').includes('application/x-www-form-urlencoded');
  const body = parseBody(req);
  if (!body) return res.status(400).json({ ok: false, error: 'bad request' });

  // Honeypot: bots fill the hidden field. Tell them it worked and keep nothing.
  if (str(body.company_website)) return res.status(200).json({ ok: true, lead_id: randomUUID() });

  const lead = cleanLead(body);
  const bad = validateLead(lead);
  if (bad.length) return res.status(422).json({ ok: false, error: 'invalid', fields: bad });

  const url = process.env.KILLUA_LEAD_WEBHOOK_URL;
  if (!url) return res.status(503).json({ ok: false, error: 'lead webhook not configured' });

  lead.lead_id = randomUUID();
  lead.event_id ||= lead.lead_id;
  lead.received_at = new Date().toISOString();
  lead.ip = str(String(req.headers['x-forwarded-for'] || '').split(',')[0], 64);
  lead.user_agent = str(req.headers['user-agent'], 400);
  lead.source = lead.form_id.startsWith('go-') ? 'website_ad_page' : 'website';
  lead.environment = process.env.VERCEL_ENV || 'local';
  lead.test = isTestLead(lead);

  const payload = JSON.stringify(Object.fromEntries(CONTRACT.map((k) => [k, lead[k]])));
  const headers = { 'content-type': 'application/json', 'user-agent': 'killua-web/lead' };
  if (process.env.KILLUA_LEAD_WEBHOOK_SECRET) {
    headers['x-killua-signature'] = createHmac('sha256', process.env.KILLUA_LEAD_WEBHOOK_SECRET).update(payload).digest('hex');
  }

  try {
    const r = await withTimeout(fetch(url, { method: 'POST', headers, body: payload }), 9000);
    if (!r.ok) throw new Error(`webhook ${r.status}`);
  } catch (err) {
    console.error('lead forward failed', lead.lead_id, String(err));
    return res.status(502).json({ ok: false, error: 'could not deliver lead' });
  }

  const extra = { fbp: str(body.fbp, 200), fbc: str(body.fbc, 400), ttp: str(body.ttp, 200) };
  const [meta, tiktok] = await Promise.allSettled([
    withTimeout(metaCapi(lead, extra), 2500),
    withTimeout(tiktokEvents(lead, extra), 2500),
  ]);
  const status = (s) => (s.status === 'fulfilled' ? s.value : `error ${s.reason?.message || ''}`.trim());
  console.log('lead delivered', lead.lead_id, lead.service, lead.test ? 'test' : 'real', 'meta', status(meta), 'tiktok', status(tiktok));

  if (isForm) {
    res.setHeader('Location', `/thank-you/?service=${encodeURIComponent(lead.service)}`);
    return res.status(303).end();
  }
  return res.status(200).json({ ok: true, lead_id: lead.lead_id });
}
