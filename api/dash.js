/**
 * The dashboard's one server function. Vercel rewrites send everything here:
 *
 *   /dashboard/...        -> pages (login, app shell, app script)   ?r=_page&p=...
 *   /api/dash/<route>     -> JSON routes                            ?r=<route>
 *
 * Nothing is served without a login except the login page itself, the login
 * POST, the ingest route (own bearer key) and the cron route (own secret).
 * Files under api/_lib are not routes. See docs/dashboard-setup.md.
 */
import { readFile } from 'node:fs/promises';
import { authConfigured, authenticate, can, clearFailures, cookieHeader, currentUser, loginBlocked, makeSession, recordFailure } from './_lib/auth.js';
import { bustCache, loadAll } from './_lib/data.js';
import { ingest } from './_lib/ingest.js';
import { logActivity, readDoc, storeConfigured } from './_lib/store.js';
import { refreshAll, refreshOne, PULL_IDS } from './_lib/sources/index.js';
import { addTask, updateTask } from './_lib/tasks.js';
import { deletePost, savePost } from './_lib/social.js';
import * as views from './_lib/views.js';
import { escHtml, readBody, safeEqual, sameOrigin, send, str } from './_lib/util.js';

const PAGE_CSP = "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";
const files = new Map();
async function asset(name) {
  if (!files.has(name)) files.set(name, await readFile(new URL(`../dashboard-app/${name}`, import.meta.url), 'utf8'));
  return files.get(name);
}

const clientIp = (req) => str(String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0], 64);
const bearer = (req) => /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || ''))?.[1]?.trim() || '';

async function page(res, name, status = 200, replace = {}) {
  let html = (await asset(name)).replace('/*CSS*/', await asset('app.css'));
  for (const [k, v] of Object.entries(replace)) html = html.replace(k, v);
  return send(res, status, html, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': PAGE_CSP });
}

const loginPage = (res, msg = '', status = 200) => {
  const ready = authConfigured();
  const text = !ready ? 'Dashboard sign-in is not set up yet. Ask Blaine.' : msg;
  return page(res, 'login.html', status, { '<!--MSG-->': text ? `<p class="err" role="alert">${escHtml(text)}</p>` : '' });
};

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, 'http://local');
    const route = (url.searchParams.get('r') ?? url.pathname.replace(/^\/api\/dash\/?/, '')).replace(/^\/+|\/+$/g, '');
    const [head, ...rest] = route.split('/');

    // ------------------------------------------------------------ pages
    if (head === '_page') {
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
      const p = (url.searchParams.get('p') || '').replace(/^\/+|\/+$/g, '');
      const user = currentUser(req);
      if (p === 'login') {
        if (user) return send(res, 302, '', { Location: '/dashboard/' });
        return loginPage(res);
      }
      if (p === '' || p === 'app.js') {
        if (!user) return p ? send(res, 401, 'Sign in required') : send(res, 302, '', { Location: '/dashboard/login/' });
        if (p === 'app.js') return send(res, 200, await asset('app.js'), { 'Content-Type': 'text/javascript; charset=utf-8' });
        return page(res, 'index.html');
      }
      return send(res, 302, '', { Location: '/dashboard/' });
    }

    // ------------------------------------------------------------ login / logout
    if (head === 'login') {
      if (req.method !== 'POST') return send(res, 405, 'Method not allowed', { Allow: 'POST' });
      if (!sameOrigin(req)) return send(res, 403, 'Cross-site request refused');
      if (!authConfigured()) return loginPage(res, '', 503);
      const ip = clientIp(req);
      const { json } = await readBody(req, 20000).catch(() => ({ json: {} }));
      const email = str(json?.email, 160).toLowerCase();
      if (loginBlocked(email, ip)) return loginPage(res, 'Too many tries. Wait about 15 minutes and try again.', 429);
      const user = await authenticate(email, str(json?.password, 200));
      if (!user) {
        await recordFailure(email, ip);
        return loginPage(res, 'That email and password do not match.', 401);
      }
      clearFailures(email, ip);
      logActivity({ by: user.name, action: 'login', detail: user.role });
      return send(res, 303, '', { Location: '/dashboard/', 'Set-Cookie': cookieHeader(makeSession(user)) });
    }
    if (head === 'logout') {
      if (req.method !== 'POST' && req.method !== 'GET') return send(res, 405, 'Method not allowed');
      return send(res, 303, '', { Location: '/dashboard/login/', 'Set-Cookie': cookieHeader('', { clear: true }) });
    }

    // ------------------------------------------------------------ cron (own secret)
    if (head === 'cron') {
      const secret = process.env.CRON_SECRET;
      if (!secret || !safeEqual(bearer(req), secret)) return send(res, 401, { error: 'unauthorized' });
      if (!storeConfigured()) return send(res, 503, { error: 'storage not connected' });
      const out = await refreshAll({ by: 'schedule' });
      bustCache();
      return send(res, 200, { ok: true, ...out });
    }

    // ------------------------------------------------------------ ingest (own bearer key)
    if (head === 'ingest') {
      if (req.method !== 'POST') return send(res, 405, { error: 'POST only' }, { Allow: 'POST' });
      const key = process.env.DASH_INGEST_KEY;
      if (!key || key.length < 16) return send(res, 503, { ok: false, error: 'ingest is not configured' });
      if (!safeEqual(bearer(req), key)) return send(res, 401, { ok: false, error: 'unauthorized' });
      if (!storeConfigured()) return send(res, 503, { ok: false, error: 'storage not connected' });
      let body;
      try {
        body = (await readBody(req, 3_000_000)).json;
      } catch (e) {
        return send(res, e.status || 400, { ok: false, error: e.message });
      }
      const source = rest[0] || '';
      const r = await ingest(source, body);
      if (r.status === 200) {
        bustCache();
        logActivity({ by: `agent:${source}`, action: 'ingest', detail: `${r.body.accepted} accepted, ${r.body.rejected.length} rejected (${r.body.mode})` });
      }
      return send(res, r.status, r.body);
    }

    // ------------------------------------------------------------ everything else needs a login
    const user = currentUser(req);
    if (!user) return send(res, 401, { error: 'login_required' });
    if (!storeConfigured() && head !== 'me') return send(res, 503, { error: 'storage_not_connected', message: 'The dashboard storage is not connected yet.' });
    const isPost = req.method === 'POST';
    if (isPost) {
      if (!sameOrigin(req)) return send(res, 403, { error: 'cross_site' });
      if (!String(req.headers['content-type'] || '').includes('application/json')) return send(res, 415, { error: 'send JSON' });
    } else if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' });
    const body = isPost ? (await readBody(req, 200_000)).json || {} : {};
    const forbid = () => send(res, 403, { error: 'not_allowed', message: 'Your login cannot do that.' });

    if (head === 'me') {
      return send(res, 200, { email: user.email, name: user.name, role: user.role, can: { refresh: can(user, 'refresh'), task_admin: can(user, 'task_admin'), task_add: can(user, 'task_add'), social_edit: can(user, 'social_edit') }, storage: storeConfigured() });
    }
    if (head === 'refresh') {
      if (!isPost) return send(res, 405, { error: 'POST only' });
      if (!can(user, 'refresh')) return forbid();
      let results;
      if (body.source) {
        if (!PULL_IDS.includes(body.source)) return send(res, 400, { error: 'unknown source' });
        const t0 = Date.now();
        const s = await refreshOne(body.source, { by: user.name });
        results = [{ source: body.source, status: s.status, error: s.error, ms: Date.now() - t0 }];
        logActivity({ by: user.name, action: 'refresh', detail: `${body.source}: ${s.status}` });
      } else results = (await refreshAll({ by: user.name })).results;
      bustCache();
      return send(res, 200, { ok: true, results });
    }

    if (head === 'tasks') {
      if (isPost && !rest[0]) {
        if (!can(user, 'task_add')) return forbid();
        const r = await addTask(user, body);
        if (r.errors) return send(res, 422, { errors: r.errors });
        bustCache();
        logActivity({ by: user.name, action: 'task_add', detail: r.task.title });
        return send(res, 200, { ok: true, task: r.task });
      }
      if (isPost) {
        const r = await updateTask(user, rest[0], body);
        if (r.errors) return send(res, r.errors[0].includes('not found') ? 404 : r.errors[0].startsWith('Only') ? 403 : 422, { errors: r.errors });
        bustCache();
        if (!r.unchanged) logActivity({ by: user.name, action: 'task_update', detail: r.task.title });
        return send(res, 200, { ok: true, task: r.task });
      }
    }
    if (head === 'social' && isPost) {
      if (!can(user, 'social_edit')) return forbid();
      if (rest[1] === 'delete') {
        if (!can(user, 'task_admin')) return forbid();
        const ok = await deletePost(rest[0]);
        bustCache();
        logActivity({ by: user.name, action: 'social_delete', detail: rest[0] });
        return send(res, ok ? 200 : 404, { ok });
      }
      const r = await savePost(user, body);
      if (r.errors) return send(res, 422, { errors: r.errors });
      bustCache();
      logActivity({ by: user.name, action: body.id ? 'social_edit' : 'social_add', detail: `${r.post.platform} ${r.post.scheduled_at.slice(0, 10)}` });
      return send(res, 200, { ok: true, post: r.post });
    }

    if (isPost) return send(res, 404, { error: 'not_found' });
    if (head === 'activity') {
      if (!can(user, 'activity')) return forbid();
      const doc = await readDoc('activity', { items: [] });
      return send(res, 200, { items: doc.items.slice(0, 100) });
    }
    const bundle = await loadAll();
    const now = Date.now();
    switch (head) {
      case 'overview': return send(res, 200, views.overview(bundle, now));
      case 'ads': return send(res, 200, views.ads(bundle, now));
      case 'leads': return send(res, 200, views.leads(bundle, { days: Math.min(400, Math.max(7, parseInt(url.searchParams.get('days'), 10) || 120)), now }));
      case 'calls': return send(res, 200, views.calls(bundle, now));
      case 'sales': return send(res, 200, views.sales(bundle, now));
      case 'search': return send(res, 200, views.search(bundle));
      case 'social': return send(res, 200, views.social(bundle));
      case 'tasks': return send(res, 200, views.tasks(bundle));
      case 'connections': return send(res, 200, views.connections(bundle, now));
      default: return send(res, 404, { error: 'not_found' });
    }
  } catch (e) {
    console.error('dash error', e?.stack || e);
    if (e?.status === 413) return send(res, 413, { error: 'too large' });
    return send(res, 500, { error: 'server_error', message: 'Something went wrong on our side.' });
  }
}
