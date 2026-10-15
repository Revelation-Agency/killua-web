# Killua cinematic website launch

Prepared October 14, 2026. Continues the existing Claude-built marketing site at e13a70bb3831baf683f477dd7d84fd2be3406c70.

## Experience

New photographic homepage, six service destinations, Day/Evening/Night energy explorer, responsive service photography, scroll reveals, restrained desktop parallax, reduced-motion support, keyboard-accessible mobile navigation, and a mobile call bar that clears the quote form. Adds a custom 404, sitemap, robots file, and share image. Existing compliance pages and lead contract remain intact.

## Imagery

The homepage hero was generated with OpenAI ImageGen for this project. Final brief: a photorealistic premium California ranch home at blue hour, warm windows, black rooftop solar panels, natural stucco and drought-tolerant landscaping; 35mm architectural editorial photography, house concentrated on the right with negative space for text on the left; no text, logos, people or futuristic elements. Source: src/assets/photos/hero-twilight.png. Other service photographs are the existing repository assets. Images illustrate services and are not represented as completed installations; the footer and hero alt text identify the concept imagery.

## Verification

- Production build: 36 pages.
- Compliance checks: all 17 pages pass.
- Marketing checks: 18 pages and 15 quote forms pass.
- Copy checks: all 23 checked files pass.
- Local lead delivery suite: 12 leads delivered to an isolated local catcher; consent, validation, HMAC, attribution, JavaScript-disabled submissions, and failure handling checked. No external leads sent by this suite.
- Browser checks: widths 360, 390, 768, 1024, 1440; no horizontal overflow or script errors. Interactive energy selector, mobile menu, and eight service/contact/ad routes checked.
- Independent Claude Code review and follow-up review: no blockers. Image sizes, initial motion, growing hero height and small labels improved in response.

## Release configuration

PUBLIC_SITE_URL controls canonical URLs, sitemap and social images. Set it to the verified custom domain when attaching that domain. Existing encrypted intake URL and signing secret were extended from branch-only preview to preview and production; their values were unchanged. Production intake receipt must be distinguished from the passing isolated local delivery suite.

Rollback: previous production deployment killua-hprbyhllx-connect-9983s-projects.vercel.app. Previous website source e13a70bb3831baf683f477dd7d84fd2be3406c70. Previous intake environment targets: preview only, branch lane1-killua-energy-site. Domain/DNS rollback requires preserving the records before changes.
