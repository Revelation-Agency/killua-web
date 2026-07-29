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
2. **Consent is collected by the registered widget, or not at all.** The consent a
   reviewer sees must be the consent the carrier holds on file, so the opt-in surface
   is the GHL A2P compliance widget bound to that sub-account's registration. This repo
   ships no consent UI of its own, and a brand with no widget yet shows a provisioning
   notice rather than a substitute form.
3. **Privacy Policy and Terms are real standalone policy pages.** Not forms, not
   redirects, not a page whose main content is a lead-capture widget.
4. **The mandatory no-sharing clause appears verbatim** in all eight privacy and
   terms pages.
5. **Every SMS page carries all five disclosures**: message types, message
   frequency, "Message and data rates may apply", STOP to opt out, HELP for help.
   Plus "Consent is not a condition of purchase."
6. **The widget is the only consent-collecting surface on the page.** There is no
   newsletter box, no hero quote form, no second widget.
7. **Audience matches the site.** The rejected submission said Killua texts
   "homeowners" while the marketing site read as entirely commercial. Killua serves
   **both residential and commercial**, and every page says so consistently.
8. **No em dashes in body copy.**

There is deliberately **no lead capture anywhere on this site**, including the four
`/sms/` pages, where the only consent surface is the registered widget. Contact is phone
and email only. That keeps every other page trivially compliant and avoids the "only
consent-collecting form on the page" trap entirely.

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

### The opt-in surface

There is no form in this repo and no endpoint to configure. The opt-in surface is
GoHighLevel's A2P compliance chat widget, because its consent language is bound to the
sub-account's carrier registration record, and that binding is what the `MESSAGE_FLOW`
rejection code grades. A hand-built form cannot make that claim.

Each brand carries a `chatWidgetId` in the `brands` array in `src/data/company.ts`:

```ts
chatWidgetId: '6a57c430c6e06ac8e8e87c37',   // Solar, live
chatWidgetId: null,                          // pending registration
```

The id is generated by GoHighLevel during that sub-account's A2P 10DLC registration. A
widget hand-created in Sites > Chat Widget will **not** do: it carries a generic consent
line with no brand identification, no message frequency, no "consent is not a condition
of purchase" and no STOP/HELP.

**`null` renders a provisioning notice and no consent surface at all.** That is
deliberate. A reviewer must never see a consent surface the carrier registration does
not describe. Do not substitute a hand-built form to fill the gap; the verifier fails
the build if any `/sms/` page ships its own `<form>`, `tel` input or checkbox.

The widget mounts as a launcher in the lower right, so `OptInWidget.astro` also
reproduces its consent wording on the page as quoted text, for a reviewer who never
opens the panel. **If you change the consent text in GoHighLevel, update that
blockquote to match.** A gap between the two is the defect this whole repo exists to
close.

Do **not** replace the widget with an `api.leadconnectorhq.com/widget/form/...` iframe.
That is a GHL lead-capture form and embedding one is part of what got the original
campaign rejected. The verifier now hard-fails on the literal string
`api.leadconnectorhq.com` and on `<iframe` anywhere in the build.

### Runtime note

The widget is third-party JavaScript. On `/sms/` pages with a live widget it loads from
`widgets.leadconnectorhq.com`, `services.leadconnectorhq.com` and
`stcdn.leadconnectorhq.com`, pulls a web font from `fonts.bunny.net`, writes session
keys to `localStorage`, and opens a session against
`services.msgsndr.com/attribution_service`. Pages without a live widget make zero
external requests and set no storage.

The verifier inspects static HTML, so it cannot see any of that runtime behavior. Keep
it in mind when reading the "zero external asset references" check, and when reviewing
the Privacy Policy language about third party trackers.

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
    OptInWidget.astro        the GHL A2P compliance widget, or a pending notice
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
