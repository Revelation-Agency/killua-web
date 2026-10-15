# Motion and phone-menu update

Continues the cinematic website release at c95c225. Requested by Blaine after a screenshot showed navigation links covered by the menu's action buttons in an iPhone browser.

## Menu fix

The menu now has a fixed header and one native scrolling content area. Links and action buttons share normal flow; no action row overlaps the navigation. The drawer follows the current viewport height and respects safe areas. Opening locks the underlying page and contains keyboard focus; closing restores focus and scroll position. The cookie banner is hidden only while the menu is open, and remains available afterward. Phone scrolling uses the browser's native behavior.

## Motion and detail

- New detailed home-energy illustration with solar, storage, roof and EV controls; animated energy paths, sun orbit and battery levels.
- Slow photographic motion, immediate hero entrance, moving editorial band, scroll-driven image depth, process progress and footer movement.
- Desktop pointer lighting on service cards.
- Header pause/play control and operating-system reduced-motion support. Ambient graphics sleep offscreen, in background tabs and behind an open menu. The existing solar-page WebGL effect also honors pause and reduced motion.

## Verification

`scripts/verify-motion-menu.mjs` runs against local or live sites with no lead submissions. It covers first-visit cookie interaction, menu scrolling from user input, viewport resizing, unobscured hit targets for all nine navigation links, separate action-button layout, closing scroll/focus restoration, all energy controls, actual moving energy paths, motion pause, offscreen suspension and reduced motion. Viewports: 320×568, 390×620, 390×844, 844×390, 768×600 and 1440×900. Both Chromium and WebKit are used; this is browser-engine testing, not a physical iPhone test.

Production build, compliance, marketing and copy checks also run. Independent Claude Code review required before release. No lead integration or DNS changes are part of this update. Prior GoDaddy sign-in and actual production intake receipt follow-ups remain open.
