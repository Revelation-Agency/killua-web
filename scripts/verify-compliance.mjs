/**
 * Compliance verifier for the built site.
 *
 * Encodes the A2P 10DLC pre-push checklist as executable assertions and runs
 * them against dist/. Run `npm run build` first, then `npm run verify`.
 *
 * Every check here corresponds to a reason the original Killua Solar campaign
 * was rejected by the carrier reviewer. Keep them.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const BRANDS = ['solar', 'roofing', 'recruiting', 'maintenance'];

const EXPECTED_ROUTES = [
  '/',
  ...BRANDS.flatMap((brand) => [
    `/${brand}/`,
    `/${brand}/privacy/`,
    `/${brand}/terms/`,
    `/${brand}/sms/`,
  ]),
];

const NO_SHARING_CLAUSE =
  'No mobile information will be shared with third parties or affiliates for marketing or promotional purposes. All the above categories exclude text messaging originator opt-in data and consent; this information will not be shared with any third parties.';

const FIVE_DISCLOSURES = [
  ['message frequency', 'Message frequency varies'],
  ['cost', 'Message and data rates may apply'],
  ['opt out', 'Reply STOP'],
  ['help', 'Reply HELP'],
  ['not a condition of purchase', 'Consent is not a condition of purchase'],
];

const PLACEHOLDER_PATTERNS = [
  ['bracketed placeholder', /\[(?!data-astro-cid-)[A-Za-z][A-Za-z0-9 _.-]{1,48}\]/g],
  ['handlebars placeholder', /\{\{/g],
  ['TODO marker', /TODO/g],
  ['lorem ipsum', /lorem ipsum/gi],
  ['WordPress template leftover', /Suggested text/gi],
  ['unreplaced business name', /BUSINESS NAME/gi],
];

const BANNED_STRINGS = [
  ['em dash', '—'],
  ['en dash', '–'],
  ['localStorage', 'localStorage'],
  ['sessionStorage', 'sessionStorage'],
  ['document.cookie', 'document.cookie'],
  ['GHL lead-capture form host', 'api.leadconnectorhq.com'],
  ['iframe embed', '<iframe'],
  ['google fonts', 'fonts.googleapis'],
  ['google analytics', 'googletagmanager'],
];

const failures = [];
const notes = [];

function fail(message) {
  failures.push(message);
}

function routeToFile(route) {
  return route === '/'
    ? join(DIST, 'index.html')
    : join(DIST, ...route.split('/').filter(Boolean), 'index.html');
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

if (!existsSync(DIST)) {
  console.error('dist/ not found. Run `npm run build` first.');
  process.exit(1);
}

// ---------------------------------------------------------------- 1. routes
const htmlFiles = walk(DIST).filter((file) => file.endsWith('.html'));

for (const route of EXPECTED_ROUTES) {
  if (!existsSync(routeToFile(route))) {
    fail(`missing route: ${route}`);
  }
}
if (htmlFiles.length !== EXPECTED_ROUTES.length) {
  fail(
    `expected ${EXPECTED_ROUTES.length} html pages, found ${htmlFiles.length}`
  );
}
notes.push(`${htmlFiles.length} pages built, all ${EXPECTED_ROUTES.length} expected routes present`);

const pages = new Map();
for (const route of EXPECTED_ROUTES) {
  const file = routeToFile(route);
  if (existsSync(file)) {
    pages.set(route, readFileSync(file, 'utf8'));
  }
}

// ------------------------------------------- 2. placeholders and banned text
for (const [route, html] of pages) {
  for (const [label, pattern] of PLACEHOLDER_PATTERNS) {
    const hits = html.match(pattern);
    if (hits) {
      fail(`${route}: ${label} found: ${[...new Set(hits)].slice(0, 3).join(', ')}`);
    }
  }
  for (const [label, needle] of BANNED_STRINGS) {
    if (html.includes(needle)) {
      fail(`${route}: banned string "${label}" found`);
    }
  }
}
notes.push('no placeholder tokens, em dashes, storage APIs or third party embeds in output');

// ------------------------------------------------- 2b. rendered typography
/**
 * Strips markup so copy defects are checked against what a reader sees.
 *
 * Inline tags are removed with no substitute, because "</a>," renders as ",";
 * padding them with a space would report punctuation defects that do not exist.
 * Block level tags become a space so adjacent blocks do not run together.
 */
const INLINE_TAGS = 'a|strong|em|b|i|span|code|small|abbr|sup|sub';

function renderedText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(new RegExp(`</?(?:${INLINE_TAGS})(?:\\s[^>]*)?>`, 'gi'), '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&middot;/g, '·')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

for (const [route, html] of pages) {
  const text = renderedText(html);
  const doubled = (text.match(/[^.]\.\.(?!\.)/g) ?? []).filter(
    (hit) => !hit.includes('...')
  );
  if (doubled.length > 0) {
    fail(`${route}: doubled period in copy near "${doubled[0]}"`);
  }
  const spaced = [...text.matchAll(/(.{0,30}?)\s[.,;](?:\s|$)/g)];
  if (spaced.length > 0) {
    fail(
      `${route}: whitespace before punctuation after "${spaced[0][1].trim()}" (${spaced.length} total)`
    );
  }
}
notes.push('rendered copy has no doubled periods and no whitespace before punctuation');

// --------------------------------------------------- 3. no-sharing clause x8
for (const brand of BRANDS) {
  for (const page of ['privacy', 'terms']) {
    const route = `/${brand}/${page}/`;
    const html = pages.get(route) ?? '';
    const count = html.split(NO_SHARING_CLAUSE).length - 1;
    if (count < 1) {
      fail(`${route}: mandatory no-sharing clause missing or not verbatim`);
    }
  }
}
notes.push('mandatory no-sharing clause present verbatim on all 8 privacy/terms pages');

// ---------------------------------- 4. GHL compliance chat widget, or nothing
//
// The opt-in surface is GoHighLevel's A2P compliance chat widget, not a form we
// build. Its consent language is bound to the carrier registration record, which
// is what MESSAGE_FLOW grades. Assertions:
//   - we ship none of our own consent UI (no form, no tel input, no checkbox)
//   - either exactly one widget script with a real id, or zero and a notice
//   - the widget host is widgets.leadconnectorhq.com, never api.leadconnectorhq.com
const WIDGET_SRC = 'https://widgets.leadconnectorhq.com/loader.js';
let widgetPages = 0;
let pendingPages = 0;
for (const brand of BRANDS) {
  const route = `/${brand}/sms/`;
  const html = pages.get(route) ?? '';

  for (const [label, re] of [
    ['form', /<form\b/g],
    ['tel input', /<input[^>]*type="tel"/g],
    ['checkbox', /<input[^>]*type="checkbox"/g],
  ]) {
    const hits = html.match(re) ?? [];
    if (hits.length > 0) {
      fail(`${route}: ships its own ${label} (${hits.length}); the widget must be the only consent surface`);
    }
  }

  const widgetTags =
    html.match(/<script[^>]*widgets\.leadconnectorhq\.com\/loader\.js[^>]*><\/script>/g) ?? [];

  if (widgetTags.length > 1) {
    fail(`${route}: ${widgetTags.length} widget scripts; exactly one consent surface is allowed`);
  } else if (widgetTags.length === 1) {
    widgetPages += 1;
    const id = /data-widget-id="([^"]+)"/.exec(widgetTags[0]);
    if (!id || id[1].length < 12) {
      fail(`${route}: widget script has a missing or implausible data-widget-id`);
    }
    if (!widgetTags[0].includes(WIDGET_SRC)) {
      fail(`${route}: widget script is not loaded from ${WIDGET_SRC}`);
    }
  } else {
    pendingPages += 1;
    if (!/being provisioned/i.test(html)) {
      fail(`${route}: no widget and no provisioning notice; the page offers no explanation`);
    }
  }

  if (!/Consent is not a condition of purchase/.test(html)) {
    fail(`${route}: missing "Consent is not a condition of purchase"`);
  }
}
notes.push(
  `opt-in surface is the GHL compliance widget only (${widgetPages} live, ${pendingPages} pending registration), no hand-built consent UI`
);

// ----------------------------------------------------- 5. five disclosures
for (const brand of BRANDS) {
  const route = `/${brand}/sms/`;
  const html = pages.get(route) ?? '';
  for (const [label, needle] of FIVE_DISCLOSURES) {
    if (!html.includes(needle)) {
      fail(`${route}: missing ${label} disclosure ("${needle}")`);
    }
  }
  if (!/message types/i.test(html)) {
    fail(`${route}: missing message types disclosure`);
  }
}
notes.push('all five SMS disclosures plus consent-not-a-condition present on every /sms/ page');

// ------------------------------------------- 6. forms only on /sms/ pages
for (const [route, html] of pages) {
  const isOptIn = /^\/[a-z]+\/sms\/$/.test(route);
  const forms = html.match(/<form\b/g) ?? [];
  const inputs = html.match(/<input\b/g) ?? [];
  if (isOptIn) {
    if (forms.length > 0 || inputs.length > 0) {
      fail(
        `${route}: opt-in pages must ship no form of our own (found ${forms.length} forms, ${inputs.length} inputs)`
      );
    }
  } else if (forms.length > 0 || inputs.length > 0) {
    fail(
      `${route}: must not contain a form or input (found ${forms.length} forms, ${inputs.length} inputs)`
    );
  }
}
notes.push('no hand-built lead capture anywhere, including the four /sms/ pages');

// ---------------------------------------------- 7. residential + commercial
for (const brand of ['solar', 'roofing']) {
  for (const page of ['', 'privacy/', 'terms/', 'sms/']) {
    const route = `/${brand}/${page}`;
    const html = pages.get(route) ?? '';
    const hasBoth =
      /homeowners and commercial property owners/i.test(html) ||
      /residential and commercial/i.test(html);
    if (!hasBoth) {
      fail(`${route}: audience does not state both residential and commercial`);
    }
    if (/\bhomeowners\b/i.test(html) && !/commercial/i.test(html)) {
      fail(`${route}: mentions homeowners without commercial property owners`);
    }
  }
}
notes.push('solar and roofing pages state both residential and commercial audiences');

// -------------------------------------------------- 8. external requests
for (const [route, html] of pages) {
  const external = [
    ...(html.match(/(?:src|href)="https?:\/\/[^"]+"/g) ?? []),
    ...(html.match(/(?:src|href)="\/\/[^"]+"/g) ?? []),
  ];
  const isOptInRoute = /^\/[a-z]+\/sms\/$/.test(route);
  const disallowed = external.filter((ref) => {
    if (isOptInRoute && ref.includes('widgets.leadconnectorhq.com')) return false;
    return true;
  });
  if (disallowed.length > 0) {
    fail(`${route}: external asset reference: ${disallowed.slice(0, 2).join(', ')}`);
  }
}
notes.push(
  'zero external asset references at runtime, except the GHL compliance widget on /sms/ pages'
);

// -------------------------------------------------- 9. internal links resolve
const linkRe = /href="([^"]+)"/g;
for (const [route, html] of pages) {
  for (const match of html.matchAll(linkRe)) {
    const href = match[1];
    if (
      href.startsWith('#') ||
      href.startsWith('tel:') ||
      href.startsWith('mailto:')
    ) {
      continue;
    }
    if (!href.startsWith('/')) {
      fail(`${route}: non absolute internal link: ${href}`);
      continue;
    }
    const clean = href.split('#')[0].split('?')[0];
    const target = clean.endsWith('/')
      ? routeToFile(clean)
      : join(DIST, ...clean.split('/').filter(Boolean));
    if (!existsSync(target)) {
      fail(`${route}: broken internal link: ${href}`);
    }
  }
}
notes.push('every internal link resolves to a built file');

// ----------------------------------------------------- 10. metadata is unique
const titles = new Map();
for (const [route, html] of pages) {
  const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '';
  const desc = html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '';
  if (!title) fail(`${route}: missing title`);
  if (!desc) fail(`${route}: missing meta description`);
  if (titles.has(title)) {
    fail(`${route}: duplicate title, also used by ${titles.get(title)}`);
  }
  titles.set(title, route);
}
notes.push('all 17 pages have a distinct title and a meta description');

// ------------------------------------------------------------------ report
console.log('');
for (const note of notes) {
  console.log(`  PASS  ${note}`);
}
if (failures.length > 0) {
  console.log('');
  for (const failure of failures) {
    console.log(`  FAIL  ${failure}`);
  }
  console.log(`\n${failures.length} compliance check(s) failed.\n`);
  process.exit(1);
}
console.log(`\nAll compliance checks passed across ${pages.size} pages.\n`);
