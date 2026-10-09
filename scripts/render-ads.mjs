/**
 * Renders the staged ad creative in creative/ads/ from the base photos in
 * creative/photos/ and src/assets/photos/. Text, logo and phone number are
 * composited here, never generated into the photo.
 *
 * Nothing here is uploaded or published. Needs global Playwright, like the
 * other browser checks; CHROME_EXE may point at a Chromium build.
 *
 *   node scripts/render-ads.mjs
 */
import { createRequire } from 'node:module';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

let pw;
try {
  pw = await import('playwright');
} catch {
  pw = createRequire(`${process.env.APPDATA}/npm/node_modules/`)('playwright');
}
const url = (p) => pathToFileURL(resolve(p)).href;
const OUT = 'creative/ads';
mkdirSync(OUT, { recursive: true });

const FONT = url('public/fonts/archivo-wdth.woff2');
const LOGO = url('public/brand/killua-energy-light.svg');
const photo = (n) => (n.startsWith('ad-') ? url(`creative/photos/${n}.png`) : url(`src/assets/photos/${n}.png`));

const base = `
@font-face{font-family:A;src:url(${FONT}) format('woff2');font-weight:100 900;font-stretch:62% 125%}
*{box-sizing:border-box;margin:0}
body{font-family:A,sans-serif;color:#f4eee4;background:#131315}
.c{position:relative;overflow:hidden;background:#131315}
.c>img.p{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.top{position:absolute;inset:0 0 auto 0;height:58%;background:linear-gradient(#131315e6,#13131599 45%,#13131500)}
.bot{position:absolute;inset:auto 0 0 0;height:34%;background:linear-gradient(#13131500,#131315d9 55%,#131315)}
.lab{display:flex;align-items:center;gap:14px;font-weight:650;font-stretch:78%;letter-spacing:.16em;text-transform:uppercase;font-size:26px;color:#f4eee4cc}
.lab:before{content:'';width:16px;height:16px;border-radius:50%;background:#e1312b;box-shadow:0 0 0 6px #e1312b33}
h1{font-weight:800;font-stretch:112%;letter-spacing:-.025em;line-height:.96;margin-top:22px}
h1 em{font-style:normal;color:#f3a53a}
.foot{position:absolute;left:64px;right:64px;display:flex;align-items:flex-end;justify-content:space-between}
.foot img{width:250px}
.ph{text-align:right}
.ph b{display:block;font-size:46px;font-weight:800;font-stretch:104%}
.ph span{font-size:22px;font-weight:600;color:#f4eee4b3;letter-spacing:.04em}
.cta{display:inline-block;margin-top:26px;padding:16px 30px;border-radius:999px;background:linear-gradient(#ff3b36,#e1312b 55%,#b91f1c);font-weight:750;font-size:30px}
`;

/** Single-image ad: photo, headline top-left, logo and phone at the bottom. */
function single({ w, h, img, headline, label, safeTop, safeBot }) {
  const size = w === h ? 84 : h > 1500 ? 96 : 92;
  return `<div class="c" style="width:${w}px;height:${h}px">
    <img class="p" src="${img}"><div class="top"></div><div class="bot"></div>
    <div style="position:absolute;left:64px;right:64px;top:${safeTop}px">
      <div class="lab">${label}</div>
      <h1 style="font-size:${size}px;max-width:${w - 160}px">${headline}</h1>
    </div>
    <div class="foot" style="bottom:${safeBot}px">
      <img src="${LOGO}"><div class="ph"><b>(559) 691-4028</b><span>CSLB #1096633</span></div>
    </div></div>`;
}

/** Carousel card: photo on top, charcoal panel with the step below. */
function card({ img, n, headline, body, last }) {
  return `<div class="c" style="width:1080px;height:1080px">
    <img class="p" src="${img}" style="height:58%">
    <div style="position:absolute;left:0;right:0;bottom:0;height:46%;background:#131315;padding:46px 64px">
      <div style="display:flex;align-items:baseline;gap:26px">
        <span style="font-size:96px;font-weight:800;font-stretch:120%;color:#f3a53a;line-height:1">${n}</span>
        <h1 style="font-size:60px;margin:0">${headline}</h1>
      </div>
      <p style="font-size:32px;line-height:1.35;color:#f4eee4c7;margin-top:22px;max-width:900px">${body}</p>
      <div class="foot" style="bottom:40px"><img src="${LOGO}" style="width:200px">${
        last ? '<span class="cta" style="font-size:26px;padding:12px 24px">Call (559) 691-4028</span>' : '<span style="font-size:24px;color:#f4eee499;font-weight:600">Swipe &rarr;</span>'
      }</div>
    </div></div>`;
}

const ads = [
  { id: 'a-solar-bill', photo: 'ad-solar-bill', headline: 'Dreading the next <em>PG&amp;E bill?</em>', label: 'Fresno solar' },
  { id: 'b-solar-battery', photo: 'ad-battery', headline: 'When PG&amp;E <em>shuts power off</em>', label: 'Solar + battery' },
  { id: 'c-solar-roof', photo: 'ad-solar-family', headline: 'Your roof sits idle <em>all afternoon</em>', label: 'Fresno solar' },
  { id: 'd-solar-repair', photo: 'ad-repair', headline: 'Installer gone? <em>We fix solar.</em>', label: 'Solar repair' },
  { id: 'e-roofing', photo: 'ad-roof', headline: 'Check your roof <em>before it rains</em>', label: 'Roofing' },
  { id: 'f-ev-charger', photo: 'ad-ev', headline: 'A real charger <em>in your garage</em>', label: 'EV chargers' },
];
const processCards = [
  ['fresno-street', 'Call or fill out the form', 'Start with (559) 691-4028 or the short form. We set up the next step.'],
  ['roof-inspection', 'We check your roof and bill', 'We look at the roof and a recent PG&amp;E bill before we talk about a system.'],
  ['solar-home', 'We design your system', 'A panel layout for your roof, with a battery if you want one.'],
  ['solar-repair', 'Permit, then install', 'We get the permit, then our crew installs the system.'],
  ['ad-solar-family-4x5', 'PG&amp;E gives permission to operate', 'Your system stays off until PG&amp;E approves it. Then it can be switched on.'],
];
const repair = [
  ['ad-repair-4x5', 'The installer is gone', 'The company that put your panels up went out of business.'],
  ['ad-solar-bill-4x5', 'Output looks low', 'The system is still on the roof, but it may be making less power.'],
  ['solar-repair', 'What we check', 'The panels, the wiring, the inverter, and how much power it is making.'],
  ['battery-garage', 'What we fix', 'Bad connections, failed parts and other problems we find.'],
  ['solar-home', 'Then we keep it maintained', 'We can continue maintaining the system after the repair.'],
];
const covers = [
  ['tt-1-bill-shock', 'ad-solar-bill-9x16', 'Look up at <em>your roof</em>'],
  ['tt-2-nem3', 'ad-battery-9x16', 'NEM 3.0, <em>plain English</em>'],
  ['tt-3-installer-gone', 'ad-repair-9x16', 'Solar installer <em>went under?</em>'],
  ['tt-4-roof-rain', 'ad-roof-9x16', 'Check your roof <em>before rain</em>'],
  ['tt-5-ev-garage', 'ad-ev-9x16', 'Garage ready for an <em>EV charger?</em>'],
];

const jobs = [];
for (const a of ads) {
  const p4 = photo(`${a.photo}-4x5`);
  const p9 = photo(`${a.photo}-9x16`);
  jobs.push([`meta-${a.id}-1x1`, single({ w: 1080, h: 1080, img: p4, headline: a.headline, label: a.label, safeTop: 70, safeBot: 60 })]);
  jobs.push([`meta-${a.id}-4x5`, single({ w: 1080, h: 1350, img: p4, headline: a.headline, label: a.label, safeTop: 80, safeBot: 70 })]);
  // Stories and Reels cover the top ~14% and bottom ~20% with UI.
  jobs.push([`meta-${a.id}-9x16`, single({ w: 1080, h: 1920, img: p9, headline: a.headline, label: a.label, safeTop: 290, safeBot: 400 })]);
}
processCards.forEach(([img, h, b], i) =>
  jobs.push([`carousel-process-0${i + 1}-1x1`, card({ img: photo(img), n: `0${i + 1}`, headline: h, body: b, last: i === 4 })])
);
repair.forEach(([img, h, b], i) =>
  jobs.push([`carousel-repair-0${i + 1}-1x1`, card({ img: photo(img), n: `0${i + 1}`, headline: h, body: b, last: i === 4 })])
);
for (const [id, img, text] of covers)
  jobs.push([`tiktok-cover-${id}`, single({ w: 1080, h: 1920, img: photo(img), headline: text, label: 'Killua Energy', safeTop: 330, safeBot: 470 })]);

const browser = await pw.chromium.launch(process.env.CHROME_EXE ? { executablePath: process.env.CHROME_EXE } : {});
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
// A file:// page, so the local photos, font and logo are allowed to load.
const tmp = resolve(OUT, '_render.html');
for (const [name, html] of jobs) {
  writeFileSync(tmp, `<!doctype html><meta charset="utf-8"><style>${base}</style>${html}`);
  await page.goto(pathToFileURL(tmp).href, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.locator('.c').first().screenshot({ path: `${OUT}/${name}.png` });
  console.log('rendered', name);
}
await browser.close();
rmSync(tmp, { force: true });
