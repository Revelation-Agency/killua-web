/**
 * Serves dist/ and runs api/lead.js the way Vercel does, for local testing of
 * the whole lead path without deploying. Not used in production.
 *
 *   KILLUA_LEAD_WEBHOOK_URL=https://... node scripts/serve-local.mjs [port]
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { brotliCompressSync } from 'node:zlib';
import handler from '../api/lead.js';

const DIST = resolve('dist');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
};

/** Adds the bits of Vercel's Node helpers that api/lead.js uses. */
function vercelify(req, res, raw) {
  const type = String(req.headers['content-type'] || '');
  req.body = type.includes('application/json')
    ? (() => {
        try {
          return JSON.parse(raw);
        } catch {
          return raw;
        }
      })()
    : raw;
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (obj) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(obj));
    return res;
  };
}

export function startServer(port = 4330) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://local');
    if (url.pathname === '/api/lead') {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      vercelify(req, res, raw);
      return handler(req, res);
    }
    let file = normalize(join(DIST, decodeURIComponent(url.pathname)));
    if (!file.startsWith(DIST)) {
      res.statusCode = 403;
      return res.end();
    }
    try {
      if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
      let body = await readFile(file);
      const type = TYPES[extname(file)] || 'application/octet-stream';
      res.setHeader('content-type', type);
      // Compress text like Vercel's edge does, so local speed tests are fair.
      if (/text|javascript|svg|json/.test(type) && /br/.test(req.headers['accept-encoding'] || '')) {
        body = brotliCompressSync(body);
        res.setHeader('content-encoding', 'br');
      }
      res.end(body);
    } catch {
      res.statusCode = 404;
      res.end('not found');
    }
  });
  return new Promise((ok) => server.listen(port, '127.0.0.1', () => ok(server)));
}

if (process.argv[1] && resolve(process.argv[1]) === resolve('scripts/serve-local.mjs')) {
  const port = Number(process.argv[2] || 4330);
  await startServer(port);
  console.log(`serving dist/ and /api/lead on http://127.0.0.1:${port}`);
}
