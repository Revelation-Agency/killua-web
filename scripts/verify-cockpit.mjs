/**
 * One end-to-end walk of a real call, in a real browser.
 *
 * Fails loudly if any gate stops working: the consent gate, the capture gate
 * that unlocks booking, the outcome gate on send, or the promise that all
 * three layouts hand Killua the same fields.
 *
 * Runs against the BUILT page, so it checks what Vercel actually serves.
 * Playwright is intentionally not a dependency of this repo: adding it would
 * put a browser download inside the compliance site's Vercel build. Install it
 * globally and run:
 *
 *   npm run build && node scripts/verify-cockpit.mjs
 */

import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const url = pathToFileURL(resolve('dist/cockpit/index.html')).href;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(url);

const ok = (msg) => console.log('  PASS  ' + msg);

// ------------------------------------------------------------------ routing
await page.click('[data-svc="solar"]');
assert.equal(await page.getAttribute('[data-step="1"]', 'aria-current'), 'step');
ok('picking a service advances Guided to the script step');

// ------------------------------------------------------- consent is the gate
await page.click('[data-goto="2"]');
assert.ok(await page.isDisabled('[data-goto="3"]'), 'booking must start locked');
ok('booking is locked before consent');

// The point of this one: a caller who answers nothing can still be booked.
// Qualification is guidance, not a barrier, because the call is billed per minute.
await page.check('#consentBox');
assert.ok(
  await page.isEnabled('[data-goto="3"]'),
  'consent alone must unlock booking with every answer blank'
);
ok('consent alone unlocks booking with every answer still blank');

assert.ok(
  (await page.textContent('#blankNote')).includes('Still blank'),
  'blank answers should be named as a nudge'
);
assert.equal(await page.isVisible('#blankNote'), true);
ok('unanswered questions are named as a nudge, not a blocker');

await page.uncheck('#consentBox');
assert.ok(await page.isDisabled('[data-goto="3"]'), 'withdrawing consent must re-lock booking');
ok('taking consent back re-locks booking');

await page.click('.chip[data-field="owner"][data-val="Yes"]');
await page.fill('[data-field="bill"]', '$310');
await page.click('.chip[data-field="utility"][data-val="PG&E"]');
await page.click('.chip[data-field="roofAge"][data-val="10 to 20 yrs"]');
await page.fill('[data-lead="address"]', '1180 W Shaw Ave, Fresno');

assert.ok(
  await page.isDisabled('[data-goto="3"]'),
  'a full capture must never substitute for consent'
);
ok('a complete capture without consent still cannot book');

assert.equal(await page.isVisible('#blankNote'), false);
ok('the nudge disappears once everything is answered');

await page.check('#consentBox');
assert.ok(await page.isEnabled('[data-goto="3"]'), 'booking should unlock');
ok('consent unlocks booking');

// ------------------------------------------------------------------ booking
await page.click('[data-goto="3"]');
await page.fill('#bookWhen', 'Tue Sep 9, 10:00 AM');
await page.click('[data-goto="4"]');

// ------------------------------------------------------- outcome gates send
assert.ok(await page.isDisabled('#sendBtn'), 'send must be locked with no outcome');
ok('send is locked until an outcome is picked');

await page.click('[data-outcome="booked"]');
assert.ok(await page.isEnabled('#sendBtn'), 'send should unlock on an outcome');
ok('picking an outcome unlocks send');

// ------------------------------------------------------------------ payload
await page.click('#copyBtn');
const shown = JSON.parse(await page.textContent('#payloadPre'));
assert.equal(shown.service, 'solar');
assert.equal(shown.tag, 'killua_solar_new');
assert.equal(shown.sms_consent_given, true);
assert.equal(shown.appointment, 'Tue Sep 9, 10:00 AM');
assert.equal(shown.service_address, '1180 W Shaw Ave, Fresno');
assert.equal(shown.answers.bill, '$310');
assert.equal(shown.stop_followup, true);
assert.equal(shown.offered_by_killua, true);
ok('handoff carries the answers, the appointment and stop_followup');
await page.click('#payloadClose');

// -------------------------------------------- state survives a layout switch
for (const mode of ['console', 'prompt', 'guided']) {
  await page.click(`.mode-btn[data-mode="${mode}"]`);
  await page.click('#copyBtn');
  const p = JSON.parse(await page.textContent('#payloadPre'));
  assert.equal(p.layout, mode);
  assert.equal(p.answers.bill, '$310', `${mode} lost the capture`);
  assert.equal(p.appointment, 'Tue Sep 9, 10:00 AM', `${mode} lost the booking`);
  assert.equal(p.outcome, 'booked', `${mode} lost the outcome`);
  await page.click('#payloadClose');
}
ok('all three layouts render the same call and hand off the same fields');

// ------------------------------------------------------- urgent roof repair
await page.click('#resetBtn');
await page.click('.mode-btn[data-mode="guided"]');
await page.click('[data-svc="repair"]');
await page.click('[data-goto="2"]');
await page.click('.chip[data-field="urgency"][data-val="Active leak now"]');
await page.fill('[data-field="location"]', 'Over the garage');
await page.click('.chip[data-field="cause"][data-val="Storm"]');
await page.click('.chip[data-field="insurance"][data-val="Insurance"]');
await page.check('#consentBox');
await page.click('[data-goto="3"]');
assert.ok((await page.textContent('.warnbox')).includes('Active leak'));
await page.click('[data-goto="4"]');
await page.click('[data-outcome="booked"]');
await page.click('#copyBtn');
const urgent = JSON.parse(await page.textContent('#payloadPre'));
assert.equal(urgent.tag, 'killua_roof_repair_urgent');
assert.equal(urgent.urgent, true);
ok('an active leak retags the lead urgent on its own');
await page.click('#payloadClose');

// --------------------------------------------------- a service Killua lacks
await page.click('#resetBtn');
await page.click('[data-decline="siding"]');
await page.click('[data-goto="4"]');
await page.click('[data-outcome="not_qualified"]');
await page.click('#copyBtn');
const declined = JSON.parse(await page.textContent('#payloadPre'));
assert.equal(declined.offered_by_killua, false);
assert.equal(declined.tag, 'killua_not_offered');
assert.equal(declined.stop_followup, true);
ok('siding and gutters route to a not-offered handoff that stops follow-up');
await page.click('#payloadClose');

// ------------------------------------------------------------------- do not
await page.click('#resetBtn');
await page.click('[data-svc="roofing"]');
// Straight to Close without qualifying: this is the "take me off your list" path.
assert.ok(await page.isEnabled('[data-step="4"]'), 'Close must be reachable at once');
assert.ok(await page.isDisabled('[data-step="3"]'), 'Book must still be gated');
await page.click('[data-step="4"]');
await page.click('[data-outcome="dnc"]');
await page.click('#copyBtn');
const dnc = JSON.parse(await page.textContent('#payloadPre'));
assert.equal(dnc.do_not_contact, true);
assert.equal(dnc.stop_followup, true);
ok('do not contact sets both stop flags');

assert.deepEqual(errors, [], 'the page threw: ' + errors.join(' | '));
ok('no uncaught errors anywhere in the walk');

await browser.close();
console.log('\nAll checks passed.');
