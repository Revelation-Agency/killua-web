# killua-web

The public web property for **Killua Energy Inc.** (Fresno, California): one company
one-pager plus a full set of A2P 10DLC compliance pages for each of the four brands.

Static site. Astro, no database, no environment variables, no third party scripts.

## Why this repo exists

Killua Solar's A2P 10DLC campaign was **rejected** by the carrier reviewer. The brand
passed; the campaign failed. The core problem was that the Privacy Policy and Terms
URLs on the submission pointed at GoHighLevel lead-capture forms rather than at real
policy pages, and the opt-in language was not compliant. Roofing, Recruiting and
Maintenance had not been submitted yet and would have hit the same wall.

This repo is the fix: one real, verifiable website that all four A2P submissions can
point at. It is a **compliance property**, not a marketing site. The marketing site
lives separately at killuaenergy.com (WordPress) and is not touched by this repo.

### Rules this site is built to satisfy

These are carrier and TCR requirements, not style preferences. Each one was a failure
point on the rejected submission. `npm run verify` enforces all of them against the
build output.

1. **No placeholder tokens anywhere.** The rejected form shipped a live
   `[BUSINESS NAME]` string. One unreplaced token is an automatic reject.
2. **Consent is required, never optional.** Every opt-in page has exactly **one**
   consent checkbox and it carries the `required` attribute.
3. **Privacy Policy and Terms are real standalone policy pages.** Not forms, not
   redirects, not a page whose main content is a lead-capture widget.
4. **The mandatory no-sharing clause appears verbatim** in all eight privacy and
   terms pages.
5. **Every SMS page carries all five disclosures**: message types, message
   frequency, "Message and data rates may apply", STOP to opt out, HELP for help.
   Plus "Consent is not a condition of purchase."
6. **The opt-in page is the only consent-collecting form on that page.** There is no
   newsletter box, no hero quote form, no chat widget.
7. **Audience matches the site.** The rejected submission said Killua texts
   "homeowners" while the marketing site read as entirely commercial. Killua serves
   **both residential and commercial**, and every page says so consistently.
8. **No em dashes in body copy.**

There is deliberately **no lead capture anywhere on this site** except the four
`/sms/` pages. Contact is phone and email only. That keeps every other page trivially
compliant and avoids the "only consent-collecting form on the page" trap entirely.

## Route map

17 pages. Every route ends in a trailing slash and is emitted as
`<route>/index.html`.

| Route | Page |
|---|---|
| `/` | Company one-pager, all four divisions |
| `/solar/` | Killua Solar overview |
| `/solar/privacy/` | Killua Solar Privacy Policy |
| `/solar/terms/` | Killua Solar Terms of Service |
| `/solar/sms/` | Killua Solar opt-in page (the A2P opt-in URL) |
| `/roofing/` … | same four pages |
| `/recruiting/` … | same four pages |
| `/maintenance/` … | same four pages |

## Local development

```bash
npm install
npm run dev        # http://localhost:4321
```

```bash
npm run build      # static output to dist/
npm run verify     # run the compliance checks against dist/
npm run preview    # serve the built dist/ locally
```

Always run `npm run build` before `npm run verify`; the verifier reads `dist/`, not
the source.

## Deploying

Vercel, static build, no environment variables required.

| Setting | Value |
|---|---|
| Framework preset | Astro |
| Build command | `npm run build` |
| Output directory | `dist` |
| Install command | `npm install` |
| Node version | 20 or newer |

## Where to change things

Everything a reviewer can read comes from one file: **`src/data/company.ts`**. Nothing
is hardcoded in a page template. That is deliberate, because the same facts have to
match across 17 pages and the A2P submission forms.

### Effective date

One string, at the top of `src/data/company.ts`:

```ts
effectiveDate: 'July 29, 2026',
```

Change it once and all eight Privacy Policy and Terms of Service pages re-date, along
with the footer line on every page.

### The opt-in form endpoint

Each brand has its own `optInEndpoint` in the `brands` array in
`src/data/company.ts`. It ships empty, with the TODO next to the field docs:

```ts
/**
 * POST target for this brand's opt-in form.
 *
 * TODO(blaine): GHL form endpoint. ...
 */
optInEndpoint: '',
```

**While the string is empty** the form runs in local mode: it validates every field,
requires the consent checkbox, shows the success panel, and logs the payload to the
browser console without making any network request. This is intentional so the page is
fully reviewable before the endpoints exist.

**Once you paste a URL in**, the form POSTs JSON to it on submit:

```json
{
  "program": "Killua Solar Notifications",
  "brand": "Killua Solar",
  "firstName": "...",
  "lastName": "...",
  "phone": "...",
  "email": "...",
  "consent": true,
  "consentText": "By checking this box, I give my express written consent to ...",
  "consentTimestampUtc": "2026-07-29T21:00:00.000Z",
  "consentPageUrl": "https://.../solar/sms/"
}
```

`consentText`, `consentTimestampUtc` and `consentPageUrl` are the proof-of-consent
record. Carriers and regulators can ask you to produce it, so store all three.

Do **not** replace the form with an `api.leadconnectorhq.com/widget/form/...` iframe.
That pattern is part of what got the campaign rejected. Paste an endpoint into the
config constant instead, then re-run `npm run build && npm run verify`.

## Project structure

```
src/
  data/company.ts            all company facts, brands, disclosures, consent text
  layouts/Base.astro         html shell, per-page title and description
  components/
    SiteHeader.astro         company nav plus per-brand sub-nav
    SiteFooter.astro         every brand's policy links on every page
    ContactBlock.astro       address, phone, email
    ServiceArea.astro        559 / 209 / 661
    SmsDisclosureTable.astro the eight-row program disclosure table
    NoSharingClause.astro    the mandatory clause, as a distinct callout
    OptInForm.astro          the opt-in form and its one required checkbox
  pages/
    index.astro              /
    [brand]/index.astro      /<brand>/
    [brand]/privacy.astro    /<brand>/privacy/
    [brand]/terms.astro      /<brand>/terms/
    [brand]/sms.astro        /<brand>/sms/
scripts/
  verify-compliance.mjs      the pre-push checklist, as executable assertions
```

## A2P submission URLs

Replace `<base>` with the deployed domain.

| Brand | Website URL | Privacy Policy URL | Terms URL | Opt-in URL |
|---|---|---|---|---|
| Killua Solar | `<base>/solar/` | `<base>/solar/privacy/` | `<base>/solar/terms/` | `<base>/solar/sms/` |
| Killua Roofing | `<base>/roofing/` | `<base>/roofing/privacy/` | `<base>/roofing/terms/` | `<base>/roofing/sms/` |
| Killua Recruiting | `<base>/recruiting/` | `<base>/recruiting/privacy/` | `<base>/recruiting/terms/` | `<base>/recruiting/sms/` |
| Killua Maintenance | `<base>/maintenance/` | `<base>/maintenance/privacy/` | `<base>/maintenance/terms/` | `<base>/maintenance/sms/` |

## Out of scope for this repo

The GoHighLevel A2P submissions themselves, the WordPress site at killuaenergy.com,
and the WAVV dialer setup.
