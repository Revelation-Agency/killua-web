import { defineConfig } from 'astro/config';

// Static output only. Every route is emitted as <route>/index.html so that all
// URLs end in a trailing slash, which is what the A2P 10DLC submissions cite.
export default defineConfig({
  output: 'static',
  trailingSlash: 'always',
  build: {
    format: 'directory',
    inlineStylesheets: 'always',
  },
  devToolbar: {
    enabled: false,
  },
});
