/**
 * Turns every form[data-lead-form] into a stepped quiz and posts it as JSON to
 * /api/lead. The service-to-question map mirrors src/data/site.ts; it is
 * repeated here so the page does not ship all of the site copy to the browser.
 */
import { ATTR_PARAMS, captureAttribution } from './attribution';

const FOLLOW: Record<string, string> = {
  solar_installation: 'bill',
  battery_storage: 'bill',
  solar_repair: 'problem',
  roof_replacement: 'roof_age',
  roof_repair: 'problem',
  roof_inspection: 'roof_age',
  ev_charger: 'ev',
};
const TEXTING: Record<string, string> = {
  roof_replacement: 'roofing',
  roof_repair: 'roofing',
  roof_inspection: 'roofing',
};
const PHONE_TEXT = '(559) 691-4028';

const digits = (s: string) => s.replace(/\D/g, '');
function tenDigits(s: string) {
  let d = digits(s);
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  return d;
}
function formatPhone(s: string) {
  const d = tenDigits(s).slice(0, 10);
  if (d.length < 4) return d;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function cookie(name: string) {
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : '';
}

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function setError(input: HTMLElement, msg: string) {
  input.setAttribute('aria-invalid', msg ? 'true' : 'false');
  const err = input.closest('.field')?.querySelector('.err');
  if (err) err.textContent = msg;
}

function checkField(el: HTMLInputElement | HTMLTextAreaElement): string {
  const v = el.value.trim();
  if ((el.required || el.hasAttribute('data-req')) && !v) return 'Please fill this in.';
  if (!v) return '';
  if (el.name === 'phone' && tenDigits(v).length !== 10) return 'Enter a 10-digit phone number.';
  if (el.name === 'email' && !EMAIL.test(v)) return 'Check the email address.';
  if (el.name === 'zip' && !/^\d{5}$/.test(v)) return 'Enter a 5-digit ZIP.';
  if (el.name === 'state' && !/^[A-Za-z]{2}$/.test(v)) return 'Use the 2-letter state.';
  if (el instanceof HTMLTextAreaElement && el.minLength > 0 && v.length < el.minLength)
    return 'A few more words, please.';
  return '';
}

function validateStep(step: HTMLElement): boolean {
  let firstBad: HTMLElement | null = null;
  const radios = new Set<string>();
  step
    .querySelectorAll<HTMLInputElement>('input[type=radio][required], input[type=radio][data-req]')
    .forEach((r) => radios.add(r.name));
  for (const name of radios) {
    if (!step.querySelector(`input[name="${name}"]:checked`)) {
      firstBad ??= step.querySelector<HTMLElement>(`input[name="${name}"]`);
    }
  }
  step
    .querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      'input[type=text], input[type=tel], input[type=email], textarea'
    )
    .forEach((el) => {
      const msg = checkField(el);
      setError(el, msg);
      if (msg) firstBad ??= el;
    });
  const consent = step.querySelector<HTMLInputElement>('input[name=consent_calls_texts]');
  if (consent) {
    const box = step.querySelector<HTMLElement>('[data-consent]')!;
    const err = step.querySelector<HTMLElement>('[data-consent-err]')!;
    if (!consent.checked) {
      box.setAttribute('data-invalid', '');
      err.textContent = 'Please check the box so we can call or text you about your estimate.';
      firstBad ??= consent;
    } else {
      box.removeAttribute('data-invalid');
      err.textContent = '';
    }
  }
  if (firstBad) {
    firstBad.focus({ preventScroll: false });
    return false;
  }
  return true;
}

function setup(form: HTMLFormElement) {
  if (form.dataset.ready) return;
  form.dataset.ready = '1';
  const preset = form.dataset.preset || '';
  const compact = !!form.dataset.compact;
  const back = form.querySelector<HTMLButtonElement>('[data-back]')!;
  const count = form.querySelector<HTMLElement>('[data-count]')!;
  const bar = form.querySelector<HTMLElement>('.lf-progress span')!;
  const errorBox = form.querySelector<HTMLElement>('[data-error]')!;
  const submitBtn = form.querySelector<HTMLButtonElement>('[data-submit]')!;
  // Browser validation stays on for the no-JavaScript fallback only.
  form.noValidate = true;
  // Tap-to-answer steps move on by themselves only after a tap or click; a
  // keyboard user arrowing through the choices moves on with Enter or Next.
  let viaPointer = false;
  let advance = 0;
  form.addEventListener('pointerdown', (e) => {
    viaPointer = !!(e.target as Element).closest('label.choice');
  });
  form.addEventListener('keydown', () => (viaPointer = false));
  let i = 0;
  let started = '';
  let sending = false;
  // Kept across retries of the same answers, cleared only after a success.
  let submissionId = '';

  const service = () =>
    preset || form.querySelector<HTMLInputElement>('input[name=service]:checked')?.value || '';
  const order = () => {
    const s = service();
    return [
      preset ? '' : 'service',
      FOLLOW[s] || (s ? '' : 'bill'),
      'homeowner',
      'address',
      compact ? '' : 'name',
      'contact',
    ].filter(Boolean);
  };
  const stepEl = (name: string) => form.querySelector<HTMLElement>(`[data-step="${name}"]`)!;

  function show(focus: boolean) {
    const names = order();
    i = Math.max(0, Math.min(i, names.length - 1));
    form.querySelectorAll<HTMLElement>('.lf-step').forEach((f) => (f.hidden = true));
    const cur = stepEl(names[i]);
    cur.hidden = false;
    bar.style.setProperty('--p', `${((i + 1) / names.length) * 100}%`);
    count.textContent = `Step ${i + 1} of ${names.length}`;
    back.hidden = i === 0;
    if (focus) {
      const legend = cur.querySelector<HTMLElement>('legend');
      const target =
        cur.querySelector<HTMLElement>('input:not([type=radio]):not([type=hidden]), textarea') || legend;
      if (target === legend && legend) legend.tabIndex = -1;
      target?.focus({ preventScroll: true });
      const top = form.getBoundingClientRect().top;
      if (top < 0 || top > window.innerHeight * 0.5) {
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }

  function next() {
    const names = order();
    if (!validateStep(stepEl(names[i]))) return;
    if (i < names.length - 1) {
      i += 1;
      show(true);
    }
  }

  form.addEventListener('focusin', () => {
    started ||= new Date().toISOString();
  });

  form.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    submissionId = ''; // changed answers after a failed send are a new submission
    if (t.type === 'radio' && t.hasAttribute('data-auto') && viaPointer) {
      viaPointer = false;
      const from = i;
      window.clearTimeout(advance);
      advance = window.setTimeout(() => {
        if (i === from) next();
      }, 220);
    }
  });

  form.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    submissionId = '';
    if (t.name === 'phone') {
      const pos = t.value.length;
      t.value = formatPhone(t.value);
      if (pos === t.value.length) t.setSelectionRange(pos, pos);
    }
    if (t.name === 'state') t.value = t.value.toUpperCase();
    if (t.getAttribute('aria-invalid') === 'true') setError(t, checkField(t));
  });

  form.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (e.key !== 'Enter' || t.tagName === 'TEXTAREA' || t.matches('[data-ac][aria-expanded=true]')) return;
    const names = order();
    if (i < names.length - 1) {
      e.preventDefault();
      next();
    }
  });

  form.querySelectorAll('[data-next]').forEach((b) =>
    b.addEventListener('click', () => {
      window.clearTimeout(advance);
      next();
    })
  );
  back.addEventListener('click', () => {
    window.clearTimeout(advance);
    i -= 1;
    show(true);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (sending) return;
    const names = order();
    // Re-check every step, in case a value was cleared after moving on.
    for (let k = 0; k < names.length; k++) {
      const st = stepEl(names[k]);
      st.hidden = false;
      const ok = validateStep(st);
      st.hidden = k !== i;
      if (!ok) {
        i = k;
        show(false);
        validateStep(stepEl(names[k]));
        return;
      }
    }
    sending = true;
    submitBtn.disabled = true;
    submitBtn.setAttribute('aria-busy', 'true');
    errorBox.hidden = true;

    const fd = new FormData(form);
    const get = (k: string) => String(fd.get(k) ?? '').trim();
    const svc = service();
    const fu = FOLLOW[svc];
    const attr = captureAttribution();
    const consentState = (window as any).killuaConsent?.get?.();
    const fbclid = attr.fbclid || '';
    submissionId ||= uuid();
    const eventId = submissionId;
    const abs = (p: string) => new URL(p, location.origin).href;
    const payload: Record<string, unknown> = {
      form_id: get('form_id'),
      event_id: eventId,
      service: svc,
      first_name: get('first_name'),
      last_name: get('last_name'),
      phone: `+1${tenDigits(get('phone'))}`,
      email: get('email').toLowerCase(),
      street: get('street'),
      city: get('city'),
      state: get('state').toUpperCase(),
      zip: get('zip'),
      homeowner: get('homeowner'),
      monthly_bill: fu === 'bill' ? get('monthly_bill') : '',
      roof_age: fu === 'roof_age' ? get('roof_age') : '',
      problem_description: fu === 'problem' ? get('problem_description') : '',
      ev_make: fu === 'ev' ? get('ev_make') : '',
      panel_location: fu === 'ev' ? get('panel_location') : '',
      best_time_to_call: get('best_time_to_call'),
      notes: get('notes'),
      consent_calls_texts: true,
      consent_text: form.querySelector('[data-consent-text]')?.textContent?.trim() ?? '',
      consent_privacy_url: abs('/privacy/'),
      consent_texting_url: abs(`/${TEXTING[svc] || 'solar'}/sms/`),
      ...Object.fromEntries(ATTR_PARAMS.map((p) => [p, attr[p] || ''])),
      landing_page: attr.landing_page || location.href,
      referrer: attr.referrer || '',
      page_url: location.href,
      form_started_at: started,
      submitted_at: new Date().toISOString(),
      ad_consent: consentState?.ads ? 'granted' : 'denied',
      fbp: cookie('_fbp'),
      fbc: cookie('_fbc') || (fbclid ? `fb.1.${Date.now()}.${fbclid}` : ''),
      ttp: cookie('_ttp'),
      company_website: get('company_website'),
    };
    // Keep the visible hidden fields in step with what was sent.
    for (const k of [...ATTR_PARAMS, 'landing_page', 'referrer', 'submitted_at'] as const) {
      const el = form.elements.namedItem(k) as HTMLInputElement | null;
      if (el) el.value = String(payload[k] ?? '');
    }

    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch('/api/lead', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) throw new Error(body.error || `status ${res.status}`);
      try {
        sessionStorage.setItem(
          'killua_last_lead',
          JSON.stringify({ event_id: eventId, service: svc, form_id: payload.form_id, fired: false })
        );
      } catch {
        /* thank-you page simply skips the browser-side conversion */
      }
      submissionId = '';
      location.assign(`/thank-you/?service=${encodeURIComponent(svc)}`);
    } catch (err) {
      errorBox.textContent = `That did not go through. Please try again, or call us at ${PHONE_TEXT}.`;
      errorBox.hidden = false;
      submitBtn.disabled = false;
      submitBtn.removeAttribute('aria-busy');
      sending = false;
    } finally {
      window.clearTimeout(timer);
    }
  });

  setupAutocomplete(form);
  captureAttribution();
  show(false);
}

/**
 * Street autocomplete through Google Places (New), only when a key is set in
 * PUBLIC_GOOGLE_MAPS_KEY. Without a key the fields fall back to the browser's
 * own address autofill, which the autocomplete attributes already enable.
 */
function setupAutocomplete(form: HTMLFormElement) {
  const cfg = (window as any).__killuaCfg || {};
  const key: string = cfg.mapsKey || '';
  const input = form.querySelector<HTMLInputElement>('[data-ac]');
  const list = input && document.getElementById(input.getAttribute('aria-controls') || '');
  if (!key || !input || !list) return;
  // Google sees what is typed, so lookups wait until the visitor allows
  // third-party services (the analytics choice in the cookie banner).
  const allowed = () => !!(window as any).killuaConsent?.get?.()?.analytics;
  let token = uuid();
  let timer = 0;
  let items: { id: string; text: string }[] = [];
  let active = -1;
  let seq = 0;
  const close = () => {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    active = -1;
  };
  const render = () => {
    list.innerHTML = '';
    items.forEach((it, n) => {
      const li = document.createElement('li');
      li.id = `${list.id}-${n}`;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(n === active));
      li.textContent = it.text;
      li.addEventListener('mousedown', (e) => {
        e.preventDefault();
        pick(n);
      });
      list.appendChild(li);
    });
    list.hidden = items.length === 0;
    input.setAttribute('aria-expanded', String(items.length > 0));
  };
  const pick = async (n: number) => {
    const it = items[n];
    close();
    if (!it || !allowed()) return;
    input.value = it.text.split(',')[0];
    const chosen = input.value;
    const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement | null;
    const before = Object.fromEntries(['city', 'state', 'zip'].map((n) => [n, field(n)?.value ?? '']));
    try {
      const r = await fetch(
        `https://places.googleapis.com/v1/places/${encodeURIComponent(it.id)}?sessionToken=${token}`,
        { headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'addressComponents' } }
      );
      const d = await r.json();
      const comp = (t: string, short = false) => {
        const c = (d.addressComponents || []).find((x: any) => x.types?.includes(t));
        return c ? (short ? c.shortText : c.longText) : '';
      };
      // The visitor kept typing while details loaded: their edit wins.
      if (input.value !== chosen) return;
      const set = (name: string, v: string) => {
        const el = field(name);
        if (name in before && el && el.value !== before[name]) return; // edited meanwhile
        if (el && v) {
          el.value = v;
          setError(el, '');
        }
      };
      set('street', [comp('street_number'), comp('route', true)].filter(Boolean).join(' '));
      set('city', comp('locality') || comp('postal_town') || comp('sublocality'));
      set('state', comp('administrative_area_level_1', true));
      set('zip', comp('postal_code'));
    } catch {
      /* the visitor can still type the rest by hand */
    }
    token = uuid();
  };
  input.addEventListener('input', () => {
    window.clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 4 || !allowed()) return close();
    input.setAttribute('autocomplete', 'off');
    const mine = ++seq;
    timer = window.setTimeout(async () => {
      if (mine !== seq) return;
      try {
        const r = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': key },
          body: JSON.stringify({
            input: q,
            sessionToken: token,
            includedRegionCodes: ['us'],
            locationBias: { circle: { center: { latitude: 36.7378, longitude: -119.7871 }, radius: 50000 } },
          }),
        });
        const d = await r.json();
        if (mine !== seq || input.value.trim() !== q) return; // a newer keystroke won
        items = (d.suggestions || [])
          .map((s: any) => s.placePrediction)
          .filter(Boolean)
          .slice(0, 5)
          .map((p: any) => ({ id: p.placeId, text: p.text?.text || '' }));
        active = -1;
        render();
      } catch {
        close();
      }
    }, 220);
  });
  input.addEventListener('keydown', (e) => {
    if (list.hidden) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      render();
      input.setAttribute('aria-activedescendant', `${list.id}-${active}`);
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      pick(active);
    } else if (e.key === 'Escape') {
      close();
    }
  });
  input.addEventListener('blur', () => window.setTimeout(close, 150));
}

export function initLeadForms() {
  document.querySelectorAll<HTMLFormElement>('form[data-lead-form]').forEach(setup);
}
