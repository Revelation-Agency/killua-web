/**
 * Ad attribution for the lead form. Kept in sessionStorage only: it lives for
 * the visit, never leaves the browser except inside a lead the visitor submits,
 * and is not shared with any ad network.
 */
const KEY = 'killua_attr_v1';
export const ATTR_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'gclid',
  'fbclid',
  'ttclid',
] as const;

export type Attribution = Partial<Record<(typeof ATTR_PARAMS)[number] | 'landing_page' | 'referrer', string>>;

function load(): Attribution {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

export function captureAttribution(): Attribution {
  const stored = load();
  const q = new URLSearchParams(location.search);
  const fresh = ATTR_PARAMS.some((p) => q.get(p));
  const ref = document.referrer && !document.referrer.startsWith(location.origin) ? document.referrer : '';
  if (!stored.landing_page || fresh) {
    if (fresh) for (const p of ATTR_PARAMS) stored[p] = (q.get(p) || '').slice(0, 300);
    stored.landing_page = location.href.slice(0, 600);
    stored.referrer = ref || stored.referrer || '';
  }
  try {
    sessionStorage.setItem(KEY, JSON.stringify(stored));
  } catch {
    /* private mode: the values still go out with this page's form */
  }
  return stored;
}
