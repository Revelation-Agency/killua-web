/**
 * Opens the dashboard in a real phone-sized browser against fixture data:
 * logs in, visits every section, checks nothing errors, nothing scrolls
 * sideways, a script hidden in a post caption never runs, and the main forms
 * work. Playwright is not a dependency of this repo (same as verify-cockpit);
 * install it globally. SHOTS=/some/dir saves a screenshot per section.
 *
 *   node scripts/verify-dashboard-browser.mjs
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const NOW = Date.parse('2026-10-21T20:00:00Z');
const RealDate = Date;
globalThis.Date = class extends RealDate { constructor(...a) { if (a.length === 0) super(NOW); else super(...a); } static now() { return NOW; } };

let pw;
try { pw = await import('playwright'); } catch { pw = createRequire('/opt/npm-tools/node_modules/')('playwright'); }
const { chromium, devices } = pw;

const store = mkdtempSync(join(tmpdir(), 'dash-browser-'));
Object.assign(process.env, { DASH_STORE_DIR: store, DASH_SESSION_SECRET: 'browser-session-secret-0123456789abcdef', DASH_INSECURE_COOKIES: '1' });
delete process.env.VERCEL;
const { hashPassword } = await import('../api/_lib/auth.js');
const PW = 'correct horse battery staple';
const user = async (email, name, role) => ({ email, name, role, ...(await hashPassword(PW)) });
process.env.DASH_USERS = JSON.stringify([await user('blaine@x.test', 'Blaine', 'admin'), await user('taj@x.test', 'Taj', 'owner')]);
const { FIXTURE_CREDS, mockFetch } = await import('./fixtures/mock-network.mjs');
const { readFileSync } = await import('node:fs');
const fx = (n) => JSON.parse(readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8'));
const sources = await import('../api/_lib/sources/index.js');
const { ingest } = await import('../api/_lib/ingest.js');
await sources.refreshAll({ env: { ...process.env, ...FIXTURE_CREDS }, fetchImpl: mockFetch, by: 'browser check' });
for (const s of ['nexa', 'email_leads', 'sales_agent', 'other_ads']) await ingest(s, fx(`ingest-${s.replace(/_/g, '-')}.json`));
await ingest('social', { records: [{ id: 'xss1', platform: 'facebook', status: 'planned', scheduled_at: '2026-10-21T12:00:00-07:00', title: '<img src=x onerror="window.__xss=1">', caption: '<script>window.__xss=1</script><b>bold?</b>' }, { id: 'ok1', platform: 'instagram', status: 'scheduled', scheduled_at: '2026-10-22T09:00:00-07:00', caption: 'Real post' }] });
const { startDashServer } = await import('./dash-local.mjs');
const server = await startDashServer(4352);
const BASE = 'http://127.0.0.1:4352';

const browser = await chromium.launch({ executablePath: process.env.CHROME_EXE || undefined });
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
// refusals the checks cause on purpose (wrong password, Done without a link, signed out) show up as 401/422 in the console
page.on('console', (m) => { if (m.type() === 'error' && !/status of (401|422)/.test(m.text())) problems.push(`console: ${m.text()}`); });
let n = 0;
const ok = (c, m) => { assert.ok(c, `FAILED: ${m}`); n++; console.log(`  PASS  ${m}`); };

await page.goto(`${BASE}/dashboard/`);
ok(page.url().endsWith('/dashboard/login/'), 'visiting the dashboard signed out lands on the login page');
await page.fill('input[name=email]', 'blaine@x.test');
await page.fill('input[name=password]', 'wrong wrong wrong');
await page.click('button[type=submit]');
ok(await page.locator('.err').innerText().then((t) => /do not match/.test(t)), 'wrong password shows a plain message');
await page.fill('input[name=email]', 'blaine@x.test');
await page.fill('input[name=password]', PW);
await Promise.all([page.waitForURL(`${BASE}/dashboard/`), page.click('button[type=submit]')]);
await page.waitForSelector('.tile');
ok(await page.locator('#who').innerText().then((t) => /Blaine/.test(t)), 'signed in; name shown');
ok(await page.locator('#refresh').isVisible(), 'admin sees Refresh now');

const SECTIONS = ['overview', 'ads', 'leads', 'calls', 'sales', 'search', 'social', 'tasks', 'connections'];
for (const s of SECTIONS) {
  await page.goto(`${BASE}/dashboard/#${s}`);
  await page.waitForSelector('#view h2.sec', { timeout: 8000 });
  await page.waitForTimeout(150);
  const overflow = await page.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth);
  ok(overflow <= 1, `${s}: no sideways scrolling on a phone (${overflow}px over)`);
  ok((await page.locator('#view').innerText()).length > 80, `${s}: has content`);
  if (process.env.SHOTS) await page.screenshot({ path: join(process.env.SHOTS, `${s}.png`), fullPage: true });
}

await page.goto(`${BASE}/dashboard/#overview`); await page.waitForSelector('.take');
ok(/6 new leads/.test(await page.locator('.take').innerText()), 'overview paragraph shows the week');
await page.goto(`${BASE}/dashboard/#ads`); await page.waitForSelector('.chip');
await page.click('.chip[data-v="today"]'); await page.waitForTimeout(100);
ok(/\$45/.test(await page.locator('#view').innerText()), 'ads: switching the range to Today shows today\'s $45 spend');
ok((await page.locator('#view').innerText()).includes('Waiting for data'), 'ads: placeholder card waits for data');
await page.goto(`${BASE}/dashboard/#leads`); await page.waitForSelector('.tbl');
const all = Number((await page.locator('#leadtable .note').first().innerText()).match(/(\d+)/)[1]);
ok((await page.locator('.tbl tbody tr').count()) <= 40, 'leads: shows 40 people first, with a Show more button');
await page.fill('#leadq', 'carl');
await page.waitForTimeout(100);
ok((await page.locator('.tbl tbody tr').count()) === 1 && all > 50, `leads: search narrows ${all} people to Carl`);
await page.fill('#leadq', '');
await page.click('.chip[data-v="attention"]'); await page.waitForTimeout(100);
ok((await page.locator('.tbl tbody tr').count()) >= 3, 'leads: "Needs a look" filter lists the flagged people');
ok((await page.locator('#view').innerText()).includes('Missing from GoHighLevel'), 'leads: flags are written in plain English');

// social: hostile text is shown as text, never run
await page.goto(`${BASE}/dashboard/#social`); await page.waitForSelector('.cal');
await page.click('.chip[data-act="soc-mode"][data-v="list"]'); await page.waitForTimeout(100);
const shown = await page.locator('#view').innerText();
ok(shown.includes('<script>') && shown.includes('<img src=x'), 'social: script and image tags in a caption appear as plain text');
ok((await page.evaluate(() => window.__xss)) === undefined, 'social: the hidden script never ran');
await page.click('[data-act="new-post"]');
await page.fill('#postform textarea[name=caption]', 'Browser check post');
await page.fill('#postform input[name=date]', '2026-10-28');
await page.fill('#postform input[name=time]', '10:30');
await page.click('#postform button[type=submit]'); await page.waitForTimeout(400);
ok((await page.locator('#view').innerText()).includes('Browser check post'), 'social: the new post shows on its day after saving');

// tasks: owner asks, admin updates
await page.goto(`${BASE}/dashboard/#tasks`); await page.waitForSelector('.task');
ok((await page.locator('.task').count()) >= 10, 'tasks: the starting list is shown');
await page.click('[data-act="tk-add"]');
await page.fill('#taskform input[name=title]', 'Browser check request');
await page.click('#taskform button[type=submit]'); await page.waitForTimeout(500);
await page.click('.chip[data-act="tk-filter"][data-v="all"]');
ok((await page.locator('.task', { hasText: 'Browser check request' }).count()) === 1, 'tasks: a new request appears in the list');
const card = page.locator('.task', { hasText: 'Browser check request' });
await card.locator('summary', { hasText: 'Update this task' }).click();
await card.locator('select[name=status]').selectOption('done_live');
await card.locator('button[type=submit]').click(); await page.waitForTimeout(500);
ok(/link/.test(await page.locator('.task', { hasText: 'Browser check request' }).locator('.msg').first().innerText()), 'tasks: Done without a link is refused with a reason');
await card.locator('summary', { hasText: /History/ }).click();
ok((await card.locator('.hist li').count()) >= 1, 'tasks: history is visible');

await page.goto(`${BASE}/dashboard/#connections`); await page.waitForSelector('.row');
ok((await page.locator('#view').innerText()).includes('Recent activity'), 'connections: admin sees the activity log');

// owner view has no admin controls
const owner = await browser.newContext({ ...devices['iPhone 13'] });
const op = await owner.newPage();
await op.goto(`${BASE}/dashboard/`);
await op.fill('input[name=email]', 'taj@x.test'); await op.fill('input[name=password]', PW);
await Promise.all([op.waitForURL(`${BASE}/dashboard/`), op.click('button[type=submit]')]);
await op.waitForSelector('.tile');
ok(!(await op.locator('#refresh').isVisible()), 'owner does not see Refresh now');
await op.goto(`${BASE}/dashboard/#tasks`); await op.waitForSelector('.task');
ok((await op.locator('.task select[name=status]').count()) === 0 && (await op.locator('[data-act="tk-add"]').count()) === 1, 'owner can ask for things but cannot change statuses');
// sign out
await page.goto(`${BASE}/dashboard/`);
await Promise.all([page.waitForURL(/login/), page.click('.top button[type=submit]')]);
await page.goto(`${BASE}/api/dash/overview`);
ok((await page.locator('body').innerText()).includes('login_required'), 'after signing out, data routes refuse again');

ok(problems.length === 0, `no browser errors (${problems.slice(0, 3).join(' | ') || 'none'})`);
await browser.close();
server.close();
console.log(`\n${n} browser checks passed.\n`);
process.exit(0);
