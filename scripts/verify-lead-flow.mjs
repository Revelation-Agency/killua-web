/**
 * Walks every lead form in a real phone-sized browser, submits it through
 * api/lead.js, and checks what arrives at the webhook, field by field.
 *
 * Fully local: a throwaway catcher stands in for Lane 2's n8n front door.
 * Playwright is not a dependency of this repo (same reason as verify-cockpit);
 * install it globally. CHROME_EXE may point at a Chromium build if Playwright's
 * own download is missing.
 *
 *   npm run build && node scripts/verify-lead-flow.mjs
 */
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

let pw;
try {
  pw = await import('playwright');
} catch {
  pw = createRequire(`${process.env.APPDATA}/npm/node_modules/`)('playwright');
}
const { chromium, devices } = pw;

// ---------------------------------------------------------------- catcher
const received = [];
const catcher = createServer(async (req, res) => {
  let raw = '';
  for await (const c of req) raw += c;
  received.push({ headers: req.headers, body: JSON.parse(raw) });
  res.setHeader('content-type', 'application/json');
  res.end('{"ok":true}');
});
await new Promise((ok) => catcher.listen(4331, '127.0.0.1', ok));
process.env.KILLUA_LEAD_WEBHOOK_URL = 'http://127.0.0.1:4331/hook';
process.env.KILLUA_LEAD_WEBHOOK_SECRET = 'local-test-secret';
const { startServer } = await import('./serve-local.mjs');
const server = await startServer(4332);
const BASE = 'http://127.0.0.1:4332';

const ok = (m) => console.log('  PASS  ' + m);
const browser = await chromium.launch(process.env.CHROME_EXE ? { executablePath: process.env.CHROME_EXE } : {});
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
await ctx.addInitScript(() =>
  localStorage.setItem('killua_consent_v1', JSON.stringify({ v: 1, analytics: false, ads: false, ts: 'test' }))
);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

const step = (name) => page.locator(`form[data-lead-form] [data-step="${name}"]:visible`);
async function pick(name, text) {
  await step(name).locator('label.choice', { hasText: text }).first().click();
}
async function address() {
  const s = step('address');
  await s.getByLabel('Street address').fill('123 Test St');
  await s.getByLabel('City').fill('Fresno');
  await s.getByLabel('ZIP').fill('93727');
  await s.getByRole('button', { name: /Next/ }).click();
}
async function name(compact) {
  if (compact) return;
  const s = step('name');
  await s.getByLabel('First name').fill('TEST');
  await s.getByLabel('Last name').fill('Lane One');
  await s.getByRole('button', { name: /Next/ }).click();
}
async function contact(compact, extra = async () => {}) {
  const s = step('contact');
  if (compact) {
    await s.getByLabel('First name').fill('TEST');
    await s.getByLabel('Last name').fill('Lane One');
  }
  await s.getByLabel('Mobile phone').fill('5595550123');
  await s.getByLabel('Email').fill('blaine+killuatest@revelationagency.com');
  await extra(s);
  await s.locator('input[name=consent_calls_texts]').check();
  await s.getByRole('button', { name: /Get my estimate/ }).click();
}
async function submitted(formId) {
  await page.waitForURL(/\/thank-you\/\?service=/, { timeout: 15000 });
  const hit = received.findLast((r) => r.body.form_id === formId);
  assert.ok(hit, `no payload reached the webhook for ${formId}`);
  return hit;
}
function common(b, service) {
  assert.equal(b.service, service);
  assert.equal(b.first_name, 'TEST');
  assert.equal(b.last_name, 'Lane One');
  assert.equal(b.phone, '+15595550123');
  assert.equal(b.email, 'blaine+killuatest@revelationagency.com');
  assert.equal(b.street, '123 Test St');
  assert.equal(b.city, 'Fresno');
  assert.equal(b.state, 'CA');
  assert.equal(b.zip, '93727');
  assert.equal(b.homeowner, 'yes');
  assert.equal(b.consent_calls_texts, true);
  assert.match(b.consent_text, /Consent is not a condition of purchase/);
  assert.equal(b.test, true);
  assert.equal(b.ad_consent, 'denied');
  assert.match(b.lead_id, /^[0-9a-f-]{36}$/);
  assert.match(b.event_id, /^[0-9a-f-]{36}$/);
  assert.ok(!('company_website' in b) && !('fbp' in b), 'internal fields must not be forwarded');
}

// ------------------------------------------------- 1. Meta quiz, with UTMs
await page.goto(`${BASE}/go/solar-savings/?utm_source=facebook&utm_medium=paid_social&utm_campaign=fall_solar&utm_content=bill_a&utm_term=fresno&fbclid=FBCLID123`);
await pick('bill', '$150 to $250');
await pick('homeowner', 'Yes');
await address();
await contact(true);
let hit = await submitted('go-solar-savings');
common(hit.body, 'solar_installation');
assert.equal(hit.body.monthly_bill, '150_250');
assert.equal(hit.body.utm_source, 'facebook');
assert.equal(hit.body.utm_medium, 'paid_social');
assert.equal(hit.body.utm_campaign, 'fall_solar');
assert.equal(hit.body.utm_content, 'bill_a');
assert.equal(hit.body.utm_term, 'fresno');
assert.equal(hit.body.fbclid, 'FBCLID123');
assert.equal(hit.body.source, 'website_ad_page');
assert.match(hit.body.landing_page, /\/go\/solar-savings\/\?utm_source=facebook/);
assert.match(hit.body.consent_texting_url, /\/solar\/sms\/$/);
assert.match(hit.headers['x-killua-signature'], /^[0-9a-f]{64}$/);
ok('/go/solar-savings: 4 steps, every field and all five UTMs plus fbclid reach the webhook, signed');

// ------------------------------------------- 2. roofing picker -> problem
await page.goto(`${BASE}/go/roofing/?gclid=GCLID999`);
await pick('service', 'Roof repair');
await step('problem').getByLabel('Describe the problem').fill('Two cracked tiles over the garage, leaks when it rains.');
await step('problem').getByRole('button', { name: /Next/ }).click();
await pick('homeowner', 'Yes');
await address();
await contact(true);
hit = await submitted('go-roofing');
common(hit.body, 'roof_repair');
assert.match(hit.body.problem_description, /cracked tiles/);
assert.equal(hit.body.gclid, 'GCLID999');
assert.match(hit.body.consent_texting_url, /\/roofing\/sms\/$/);
ok('/go/roofing: roofing-only picker, problem step, gclid, roofing texting terms linked');

// ------------------------------------------------- 3. EV make + panel
await page.goto(`${BASE}/go/ev-charger/?ttclid=TTCLID7`);
await step('ev').getByLabel(/Car make/).fill('Ford Mach-E');
await pick('ev', 'In the garage');
await step('ev').getByRole('button', { name: /Next/ }).click();
await pick('homeowner', 'Yes');
await address();
await contact(true);
hit = await submitted('go-ev-charger');
common(hit.body, 'ev_charger');
assert.equal(hit.body.ev_make, 'Ford Mach-E');
assert.equal(hit.body.panel_location, 'garage');
assert.equal(hit.body.ttclid, 'TTCLID7');
ok('/go/ev-charger: EV make and panel location, ttclid');

// ------------------------- 4. home page: full picker, name step, extras
await page.goto(`${BASE}/`);
await page.locator('#quote').scrollIntoViewIfNeeded();
await pick('service', 'Battery storage');
await pick('bill', 'Over $400');
await pick('homeowner', 'Yes');
await address();
await name(false);
await contact(false, async (s) => {
  await s.locator('label.chip', { hasText: 'Evening' }).click();
  await s.locator('summary', { hasText: 'Add a note' }).click();
  await s.locator('textarea[name=notes]').fill('Gate code 1234.');
});
hit = await submitted('quote-home');
common(hit.body, 'battery_storage');
assert.equal(hit.body.monthly_bill, '400_plus');
assert.equal(hit.body.best_time_to_call, 'evening');
assert.equal(hit.body.notes, 'Gate code 1234.');
assert.equal(hit.body.source, 'website');
ok('home page: 6 steps, one question each, best time and notes carried');

// ---------------------------------- 5. remaining ad pages and one service page
for (const [path, formId, service, follow] of [
  ['/go/solar-battery/', 'go-solar-battery', 'battery_storage', ['bill', 'Under $150']],
  ['/go/solar-tt/', 'go-solar-tt', 'solar_installation', ['bill', 'Not sure']],
  ['/go/solar-repair/', 'go-solar-repair', 'solar_repair', null],
  ['/roof-inspection/', 'quote-roof_inspection', 'roof_inspection', ['roof_age', 'Over 20 years']],
]) {
  await page.goto(BASE + path);
  const compact = path.startsWith('/go/');
  if (follow) await pick(...follow);
  else {
    await step('problem').getByLabel('Describe the problem').fill('Inverter shows an error light.');
    await step('problem').getByRole('button', { name: /Next/ }).click();
  }
  await pick('homeowner', 'Yes');
  await address();
  await name(compact);
  await contact(compact);
  hit = await submitted(formId);
  common(hit.body, service);
  ok(`${path}: submits ${service}`);
}

// --------------------------------------------- 6. consent is required
const before = received.length;
await page.goto(`${BASE}/go/solar-tt/`);
await pick('bill', '$250 to $400');
await pick('homeowner', 'No, I rent');
await address();
const s = step('contact');
await s.getByLabel('First name').fill('TEST');
await s.getByLabel('Last name').fill('Lane One');
await s.getByLabel('Mobile phone').fill('123');
await s.getByLabel('Email').fill('not-an-email');
await s.getByRole('button', { name: /Get my estimate/ }).click();
await page.waitForTimeout(600);
assert.match(await s.locator('[data-consent-err]').textContent(), /check the box/);
assert.equal(await s.getByLabel('Mobile phone').getAttribute('aria-invalid'), 'true');
assert.equal(await s.getByLabel('Email').getAttribute('aria-invalid'), 'true');
assert.equal(await s.locator('input[name=consent_calls_texts]').isChecked(), false, 'consent must start unchecked');
assert.equal(received.length, before, 'nothing may be sent without consent');
assert.ok(page.url().includes('/go/solar-tt/'));
ok('unchecked consent, bad phone and bad email all block the send; the box starts unchecked');

// ------------------------------------------------ 7. endpoint guards
const post = (body) =>
  fetch(`${BASE}/api/lead`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const good = { ...hit.body, consent_calls_texts: true };
let r = await post({ ...good, consent_calls_texts: false });
assert.equal(r.status, 422);
r = await post({ ...good, service: 'free_money' });
assert.equal(r.status, 422);
const n = received.length;
r = await post({ ...good, company_website: 'spam.example' });
assert.equal(r.status, 200);
assert.equal(received.length, n, 'honeypot hits must not be forwarded');
r = await fetch(`${BASE}/api/lead`);
assert.equal(r.status, 405);
ok('endpoint rejects missing consent and unknown services, swallows honeypot bots, refuses GET');

// ------------------------------------- 8. server-side guards from review r1
const id = '3f6c2a1e-5b7d-4c8e-9a0b-1c2d3e4f5a6b';
r = await fetch(`${BASE}/api/lead`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'sec-gpc': '1' },
  body: JSON.stringify({ ...good, event_id: id, ad_consent: 'granted', consent_text: '', consent_privacy_url: '' }),
});
assert.equal(r.status, 200);
let last = received.at(-1).body;
assert.equal(last.ad_consent, 'denied', 'GPC must force advertising off server-side');
assert.equal(last.lead_id, id, 'lead_id must equal the submission id');
assert.match(last.consent_text, /^I agree to receive calls and text messages from Killua Energy/);
assert.match(last.consent_privacy_url, /\/privacy\/$/);
await post({ ...good, event_id: id });
assert.equal(received.at(-1).body.lead_id, id, 'a retry must reuse the same lead_id');
ok('GPC header forces ads off; consent wording and links recorded by the server; retries keep one lead_id');
r = await fetch(`${BASE}/api/lead`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
  body: JSON.stringify(good),
});
assert.equal(r.status, 403);
r = await fetch(`${BASE}/api/lead`, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: 'first_name=TEST',
});
assert.equal(r.status, 422);
assert.match(await r.text(), /A few details are missing/);
ok('cross-site posts refused; a bad no-JavaScript post gets a readable page, not JSON');
r = await post({ ...good, service: 'ev_charger', panel_location: '' });
assert.equal(r.status, 422, 'an EV lead without a panel location must be refused');
r = await post({ ...good, ad_consent: 'granted' });
assert.equal(received.at(-1).body.ad_consent, 'denied', 'no cookie and no same-origin: the webhook must not see granted');
ok('server requires each service\'s follow-up answer; the webhook never sees ad consent the server did not verify');

// ------------------------------------------------ 9. no JavaScript at all
const nojs = await browser.newContext({ ...devices['iPhone 13'], javaScriptEnabled: false });
const p2 = await nojs.newPage();
await p2.goto(`${BASE}/go/solar-savings/`);
const f = p2.locator('form[data-lead-form]');
await f.locator('label.choice', { hasText: '$150 to $250' }).click();
await f.locator('label.choice', { hasText: 'Yes' }).first().click();
for (const [n, v] of [['street', '123 Test St'], ['city', 'Fresno'], ['zip', '93727'], ['first_name', 'TEST'], ['last_name', 'NoJS'], ['phone', '5595550123'], ['email', 'blaine+killuatest@revelationagency.com']])
  await f.locator(`[name="${n}"]`).fill(v);
await f.locator('input[name=consent_calls_texts]').check();
await f.getByRole('button', { name: /Get my estimate/ }).click();
await p2.waitForURL(/\/thank-you\//, { timeout: 15000 });
last = received.at(-1).body;
assert.equal(last.last_name, 'NoJS');
assert.equal(last.monthly_bill, '150_250');
assert.equal(last.phone, '+15595550123');
assert.equal(last.consent_calls_texts, true);
await nojs.close();
ok('with JavaScript off the form shows every step, posts as plain HTML and lands on the thank-you page');

assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
ok(`no script errors; ${received.length} leads reached the catcher`);

await browser.close();
server.close();
catcher.close();
