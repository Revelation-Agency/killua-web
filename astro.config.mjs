import { defineConfig } from 'astro/config';

import react from '@astrojs/react';

// Static output only. Every route is emitted as <route>/index.html so that all
// URLs end in a trailing slash, which is what the A2P 10DLC submissions cite.
export default defineConfig({
  site: process.env.PUBLIC_SITE_URL || 'https://killua-web-eta.vercel.app',
  output: 'static',
  trailingSlash: 'always',

  build: {
    format: 'directory',
    inlineStylesheets: 'always',
  },

  devToolbar: {
    enabled: false,
  },

  integrations: [react()],
});
