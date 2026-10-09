/**
 * Cookie consent for California visitors, and the only place ad or analytics
 * tags are loaded. Nothing from Meta, TikTok or Google runs until the visitor
 * says yes. A Global Privacy Control signal keeps advertising off regardless.
 *
 * IDs come from PUBLIC_* environment variables at build time; an empty ID
 * means that tag is simply never loaded.
 */
type Choice = { v: 1; analytics: boolean; ads: boolean; ts: string };
type Cfg = {
  metaPixel?: string;
  tiktokPixel?: string;
  ga4?: string;
  gads?: string;
  gadsLeadLabel?: string;
};

const KEY = 'killua_consent_v1';
const cfg: Cfg = (window as any).__killuaCfg || {};
const gpc = (navigator as any).globalPrivacyControl === true;
let loaded = { meta: false, tiktok: false, gtag: false };
let current: Choice | null = null;

function read(): Choice | null {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) || 'null');
    return c && c.v === 1 ? c : null;
  } catch {
    return null;
  }
}

function save(c: Choice) {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    /* choice still applies for this page view */
  }
}

function addScript(src: string) {
  const s = document.createElement('script');
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
}

function loadMeta(id: string) {
  if (loaded.meta) return;
  loaded.meta = true;
  const w = window as any;
  if (!w.fbq) {
    // Meta's loader replays this queue; it expects real `arguments` objects.
    const n: any = (w.fbq = function () {
      // eslint-disable-next-line prefer-rest-params
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    });
    w._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = '2.0';
    n.queue = [];
    addScript('https://connect.facebook.net/en_US/fbevents.js');
  }
  w.fbq('init', id);
  w.fbq('track', 'PageView');
}

function loadTikTok(id: string) {
  if (loaded.tiktok) return;
  loaded.tiktok = true;
  const w = window as any;
  const ttq: any = (w.ttq = w.ttq || []);
  ttq.methods = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie', 'holdConsent', 'revokeConsent', 'grantConsent'];
  ttq.setAndDefer = (t: any, e: string) => {
    t[e] = (...args: unknown[]) => t.push([e, ...args]);
  };
  ttq.methods.forEach((m: string) => ttq.setAndDefer(ttq, m));
  ttq.load = (sdkid: string) => {
    ttq._i = ttq._i || {};
    ttq._i[sdkid] = [];
    ttq._t = ttq._t || {};
    ttq._t[sdkid] = +new Date();
    addScript(`https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=${encodeURIComponent(sdkid)}&lib=ttq`);
  };
  ttq.load(id);
  ttq.page();
}

// gtag.js only honours `arguments` objects in the dataLayer, not arrays.
function gtag(..._args: unknown[]) {
  const w = window as any;
  w.dataLayer = w.dataLayer || [];
  // eslint-disable-next-line prefer-rest-params
  w.dataLayer.push(arguments);
}

function loadGtag(c: Choice) {
  const first = (c.analytics && cfg.ga4) || (c.ads && cfg.gads);
  if (!first) return;
  const w = window as any;
  w.gtag = w.gtag || gtag;
  if (!loaded.gtag) {
    loaded.gtag = true;
    gtag('consent', 'default', {
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'denied',
    });
    addScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(first)}`);
    gtag('js', new Date());
  }
  gtag('consent', 'update', {
    ad_storage: c.ads ? 'granted' : 'denied',
    ad_user_data: c.ads ? 'granted' : 'denied',
    ad_personalization: c.ads ? 'granted' : 'denied',
    analytics_storage: c.analytics ? 'granted' : 'denied',
  });
  if (c.analytics && cfg.ga4) gtag('config', cfg.ga4);
  if (c.ads && cfg.gads) gtag('config', cfg.gads);
}

function apply(c: Choice) {
  const before = current;
  current = c;
  // Withdrawing consent after tags loaded: the only honest way to unload them
  // is a fresh page, so reload once with the new choice saved.
  if (before && ((before.ads && !c.ads) || (before.analytics && !c.analytics)) && (loaded.meta || loaded.tiktok || loaded.gtag)) {
    location.reload();
    return;
  }
  if (c.ads) {
    if (cfg.metaPixel) loadMeta(cfg.metaPixel);
    if (cfg.tiktokPixel) loadTikTok(cfg.tiktokPixel);
  }
  loadGtag(c);
  window.dispatchEvent(new CustomEvent('killua:consent', { detail: c }));
}

/** Fires the lead conversion once, with the same event id the server used. */
function trackLead(eventId: string, service: string) {
  const c = current;
  if (!c) return false;
  const w = window as any;
  if (c.ads && cfg.metaPixel && w.fbq) w.fbq('track', 'Lead', { content_category: service }, { eventID: eventId });
  if (c.ads && cfg.tiktokPixel && w.ttq) w.ttq.track('SubmitForm', { content_type: 'product', content_id: service }, { event_id: eventId });
  if (c.ads && cfg.gads && cfg.gadsLeadLabel)
    gtag('event', 'conversion', { send_to: `${cfg.gads}/${cfg.gadsLeadLabel}`, transaction_id: eventId });
  if (c.analytics && cfg.ga4) gtag('event', 'generate_lead', { service, event_id: eventId });
  return true;
}

function banner() {
  const el = document.getElementById('cookie');
  if (!el) return;
  const prefs = el.querySelector<HTMLElement>('[data-prefs]')!;
  const a = el.querySelector<HTMLInputElement>('input[name=analytics]')!;
  const ads = el.querySelector<HTMLInputElement>('input[name=ads]')!;
  const gpcNote = el.querySelector<HTMLElement>('[data-gpc]')!;
  if (gpc) {
    ads.checked = false;
    ads.disabled = true;
    gpcNote.hidden = false;
    // "Accept all" would overstate it: advertising stays off under GPC.
    el.querySelector<HTMLElement>('[data-accept]')!.textContent = 'Allow analytics';
  }
  const choose = (analytics: boolean, adOk: boolean) => {
    const c: Choice = { v: 1, analytics, ads: adOk && !gpc, ts: new Date().toISOString() };
    save(c);
    el.hidden = true;
    apply(c);
  };
  el.querySelector('[data-accept]')!.addEventListener('click', () => choose(true, true));
  el.querySelector('[data-reject]')!.addEventListener('click', () => choose(false, false));
  el.querySelector('[data-save]')!.addEventListener('click', () => choose(a.checked, ads.checked));
  const customize = el.querySelector<HTMLButtonElement>('[data-customize]')!;
  customize.addEventListener('click', () => {
    prefs.hidden = false;
    customize.hidden = true;
    el.querySelector<HTMLElement>('[data-save]')!.hidden = false;
  });
  const open = (showPrefs: boolean) => {
    const c = current;
    a.checked = !!c?.analytics;
    ads.checked = !!c?.ads && !gpc;
    prefs.hidden = !showPrefs;
    customize.hidden = showPrefs;
    el.querySelector<HTMLElement>('[data-save]')!.hidden = !showPrefs;
    el.hidden = false;
    el.querySelector<HTMLElement>('h2')?.focus();
  };
  document.querySelectorAll('[data-cookie-prefs]').forEach((b) =>
    b.addEventListener('click', (e) => {
      e.preventDefault();
      open(true);
    })
  );
  document.querySelectorAll('[data-optout]').forEach((b) =>
    b.addEventListener('click', (e) => {
      e.preventDefault();
      const c: Choice = { v: 1, analytics: !!current?.analytics, ads: false, ts: new Date().toISOString() };
      save(c);
      apply(c);
      const msg = document.querySelector<HTMLElement>('[data-optout-done]');
      if (msg) msg.hidden = false;
    })
  );
  return open;
}

export function initConsent() {
  const open = banner();
  const stored = read();
  (window as any).killuaConsent = {
    get: () => current,
    open: () => open?.(true),
    trackLead,
  };
  if (stored) {
    if (gpc && stored.ads) stored.ads = false;
    apply(stored);
  } else {
    const el = document.getElementById('cookie');
    if (el) el.hidden = false;
  }
}
