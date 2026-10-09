/**
 * Checks the marketing site and /go/ ad pages in dist/. The A2P pages are
 * verify-compliance.mjs's job; this file never looks at them.
 *
 *   npm run build && npm run verify:site
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const DIST = 'dist';
const NOT_MARKETING = ['solar', 'roofing', 'recruiting', 'maintenance', 'company', 'cockpit'];
const HIDDEN = [
  'form_id', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'gclid', 'fbclid', 'ttclid', 'landing_page', 'referrer', 'submitted_at',
];
// Claims that must never ship: the expired credit as a selling point, the old
// agency's typo and tracking number, invented superlatives, the on-hold brand.
const BANNED = [
  ['tax credit sold as available', /tax credits? (are |is )?(still )?available/i],
  ['"Bakersville" typo', /Bakersville/],
  ["RYNO's tracking number", /314-6376/],
  ['#1 claim', /#\s?1\b/],
  ['superlative', /\b(best(?! time to call)|most trusted|top[- ]rated|number one)\b/i],
  ['free solar / $0 down', /free solar|\$0 down|no[- ]cost solar/i],
  ['staff testimonial', /Robin/],
  ['on-hold brand name', /Killua Home Services/i],
  ['placeholder', /lorem ipsum|TODO|\[needs/i],
  ['em dash', /—/],
];

const failures = [];
const notes = [];
const fail = (m) => failures.push(m);

function walk(dir) {
  return readdirSync(dir).flatMap((e) => {
    const f = join(dir, e);
    return statSync(f).isDirectory() ? walk(f) : [f];
  });
}
const visible = (html) =>
  html
    .replace(/<(script|style|svg)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

if (!existsSync(DIST)) {
  console.error('dist/ not found. Run `npm run build` first.');
  process.exit(1);
}

const pages = new Map();
for (const f of walk(DIST).filter((f) => f.endsWith('index.html'))) {
  const rel = relative(DIST, f).split(sep).join('/');
  if (NOT_MARKETING.includes(rel.split('/')[0])) continue;
  pages.set('/' + rel.replace(/index\.html$/, ''), readFileSync(f, 'utf8'));
}
notes.push(`${pages.size} marketing pages found`);

const titles = new Map();
let forms = 0;
for (const [route, html] of pages) {
  const isGo = route.startsWith('/go/');
  const noindex = /<meta name="robots" content="noindex/.test(html);
  const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '';
  if (!title) fail(`${route}: missing title`);
  if (titles.has(title)) fail(`${route}: duplicate title with ${titles.get(title)}`);
  titles.set(title, route);
  if (!/<meta name="description" content="[^"]{30,}"/.test(html)) fail(`${route}: missing meta description`);

  const text = visible(html);
  for (const [label, re] of BANNED) if (re.test(text)) fail(`${route}: ${label}: "${text.match(re)[0]}"`);
  if (!text.includes('(559) 691-4028')) fail(`${route}: office number missing`);

  // Nothing third-party may load before consent: tags are injected by consent.ts.
  const ext = html.match(/<script[^>]*\ssrc="(https?:)?\/\/[^"]+"/g);
  if (ext) fail(`${route}: external script in HTML: ${ext[0]}`);
  if (/<iframe/i.test(html)) fail(`${route}: iframe`);
  if (!/id="cookie"/.test(html)) fail(`${route}: cookie banner missing`);
  if (!/class="callbar"[\s\S]*?href="tel:\+15596914028"/.test(html)) fail(`${route}: mobile call bar missing`);

  if ((isGo || route === '/thank-you/') && !noindex) fail(`${route}: ad and thank-you pages must be noindex`);
  if (isGo && /class="primary-nav"/.test(html)) fail(`${route}: ad pages must not carry the main nav`);

  for (const form of html.match(/<form\b[\s\S]*?<\/form>/g) ?? []) {
    forms += 1;
    if (!/action="\/api\/lead"/.test(form)) fail(`${route}: form does not post to /api/lead`);
    const box = form.match(/<input[^>]*name="consent_calls_texts"[^>]*>/)?.[0];
    if (!box) fail(`${route}: consent checkbox missing`);
    else {
      if (!/type="checkbox"/.test(box) || !/required/.test(box)) fail(`${route}: consent box must be a required checkbox`);
      if (/\schecked/.test(box)) fail(`${route}: consent box must start unchecked`);
    }
    const consent = form.match(/<label class="consent"[\s\S]*?<\/label>/)?.[0] ?? '';
    if (!/href="\/privacy\/"/.test(consent)) fail(`${route}: consent does not link the privacy policy`);
    if (!/href="\/(solar|roofing)\/sms\/"/.test(consent)) fail(`${route}: consent does not link the texting terms`);
    for (const need of ['Message frequency varies', 'Message and data rates may apply', 'STOP', 'HELP', 'Consent is not a condition of purchase', 'Killua Energy'])
      if (!consent.includes(need)) fail(`${route}: consent text missing "${need}"`);
    for (const h of HIDDEN)
      if (!new RegExp(`<input type="hidden" name="${h}"`).test(form)) fail(`${route}: hidden field ${h} missing`);
    for (const f of ['first_name', 'last_name', 'phone', 'email', 'street', 'city', 'state', 'zip', 'homeowner'])
      if (!new RegExp(`name="${f}"`).test(form)) fail(`${route}: field ${f} missing`);
  }

  for (const m of html.matchAll(/href="(\/[^"#?]*)/g)) {
    const p = m[1];
    const target = p.endsWith('/') ? join(DIST, p, 'index.html') : join(DIST, p);
    if (!existsSync(target)) fail(`${route}: broken link ${p}`);
  }
}
notes.push(`${forms} lead forms: consent unchecked and required, texting and privacy links, all 12 tracking fields`);
notes.push('no banned claims, no third-party script before consent, call bar and cookie banner on every page');
notes.push('ad pages and thank-you are noindex and carry no main nav');

const privacy = pages.get('/privacy/') ?? '';
if (!privacy.includes('No mobile information will be shared with third parties or affiliates for marketing or promotional purposes.'))
  fail('/privacy/: texting no-sharing clause missing');
if (!/id="do-not-sell"/.test(privacy)) fail('/privacy/: Do Not Sell or Share section missing');
notes.push('website privacy policy carries the no-sharing clause and a Do Not Sell or Share control');

console.log('');
for (const n of notes) console.log(`  PASS  ${n}`);
if (failures.length) {
  console.log('');
  for (const f of failures) console.log(`  FAIL  ${f}`);
  console.log(`\n${failures.length} site check(s) failed.\n`);
  process.exit(1);
}
console.log(`\nAll site checks passed across ${pages.size} pages.\n`);
