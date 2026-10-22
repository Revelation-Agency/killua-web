/**
 * Runs the dashboard function the way Vercel does, for local testing and for
 * verify-dashboard.mjs. Not used in production.
 *
 *   DASH_STORE_DIR=/tmp/dash DASH_SESSION_SECRET=... DASH_USERS='[...]' node scripts/dash-local.mjs [port]
 *
 * Serves /dashboard/*, /api/dash/*, and files from public/ (fonts, logo).
 * Set DASH_INSECURE_COOKIES=1 to log in over plain http locally.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const PUBLIC = resolve('public');
const TYPES = { '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.css': 'text/css', '.js': 'text/javascript' };

export async function startDashServer(port = 4340) {
  const { default: handler } = await import(`../api/dash.js?${Date.now()}`);
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://local');
    let r = null;
    let p = '';
    if (url.pathname === '/dashboard' || url.pathname.startsWith('/dashboard/')) {
      r = '_page';
      p = url.pathname.replace(/^\/dashboard\/?/, '');
    } else if (/^\/api\/dash\/.+/.test(url.pathname)) r = url.pathname.replace(/^\/api\/dash\//, '');
    if (r !== null) {
      // same shape as the vercel.json rewrites
      req.url = `/api/dash?r=${encodeURIComponent(r)}${r === '_page' ? `&p=${encodeURIComponent(p)}` : ''}`;
      res.status = (c) => ((res.statusCode = c), res);
      return handler(req, res);
    }
    try {
      const file = normalize(join(PUBLIC, decodeURIComponent(url.pathname)));
      if (!file.startsWith(PUBLIC)) throw new Error('outside');
      if (!(await stat(file)).isFile()) throw new Error('not a file');
      res.setHeader('content-type', TYPES[extname(file)] || 'application/octet-stream');
      res.end(await readFile(file));
    } catch {
      res.statusCode = 404;
      res.end('not found');
    }
  });
  await new Promise((ok) => server.listen(port, '127.0.0.1', ok));
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve('scripts/dash-local.mjs')) {
  const port = Number(process.argv[2] || 4340);
  await startDashServer(port);
  console.log(`dashboard on http://127.0.0.1:${port}/dashboard/`);
}
