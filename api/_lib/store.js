/**
 * Dashboard data store. JSON documents in Vercel Blob, reached only from the
 * authenticated functions; no blob address ever goes to a browser.
 *
 * - Blobs are written with access 'private' (needs the store to be a private
 *   store). If the connected store is a public one, the code falls back to
 *   public blobs under a pathname that is an HMAC of the document name, which
 *   nobody can guess, and still never hands the address out.
 * - Writes use the blob's etag so two people saving at once cannot silently
 *   overwrite each other (readModifyWrite retries).
 * - For local testing and the verify script, set DASH_STORE_DIR to use plain
 *   files instead (never used on Vercel unless set on purpose).
 */
import { createHmac } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';

let accessMode = null; // 'private' | 'public', learned on first write

export function storeConfigured(env = process.env) {
  return Boolean(env.DASH_STORE_DIR || env.BLOB_READ_WRITE_TOKEN);
}

const SAFE_NAME = /^[a-z0-9][a-z0-9/_-]*$/;

export function blobPathname(name, env = process.env) {
  if (!SAFE_NAME.test(name)) throw new Error(`bad document name: ${name}`);
  const salt = env.DASH_STORE_SALT || env.DASH_SESSION_SECRET;
  if (!salt) throw new Error('DASH_SESSION_SECRET is not set');
  const key = createHmac('sha256', salt).update(`dash-doc:${name}`).digest('hex').slice(0, 40);
  return `dash/${key}/${name.replace(/\//g, '__')}.json`;
}

async function blobSdk() {
  return import('@vercel/blob');
}

// ---------------------------------------------------------------- file mode
async function fileRead(name, env) {
  try {
    const raw = await readFile(join(env.DASH_STORE_DIR, `${name.replace(/\//g, '__')}.json`), 'utf8');
    return { data: JSON.parse(raw), etag: String(raw.length) + ':' + raw.slice(-24) };
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}
async function fileWrite(name, data, env) {
  const file = join(env.DASH_STORE_DIR, `${name.replace(/\//g, '__')}.json`);
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(data));
  await rename(tmp, file);
}

// ---------------------------------------------------------------- blob mode
async function blobRead(name, env) {
  const { get } = await blobSdk();
  const pathname = blobPathname(name, env);
  const tryAccess = accessMode ? [accessMode] : ['private', 'public'];
  let lastErr;
  for (const access of tryAccess) {
    try {
      const r = await get(pathname, { access, useCache: false, token: env.BLOB_READ_WRITE_TOKEN });
      if (!r) {
        if (access === tryAccess[tryAccess.length - 1]) return null;
        continue; // maybe stored under the other access mode
      }
      if (r.statusCode !== 200) return null;
      const text = await new Response(r.stream).text();
      accessMode = access;
      return { data: JSON.parse(text), etag: r.blob.etag };
    } catch (e) {
      lastErr = e;
      if (!/access|private|public/i.test(String(e?.message))) throw e;
    }
  }
  if (lastErr) throw lastErr;
  return null;
}

async function blobWrite(name, data, env, etag) {
  const { put } = await blobSdk();
  const pathname = blobPathname(name, env);
  const body = JSON.stringify(data);
  const base = { allowOverwrite: true, addRandomSuffix: false, contentType: 'application/json', cacheControlMaxAge: 60, token: env.BLOB_READ_WRITE_TOKEN };
  if (etag) base.ifMatch = etag;
  const order = accessMode ? [accessMode] : ['private', 'public'];
  let lastErr;
  for (const access of order) {
    try {
      await put(pathname, body, { ...base, access });
      accessMode = access;
      return;
    } catch (e) {
      lastErr = e;
      if (e?.name === 'BlobPreconditionFailedError') {
        const err = new Error('conflict');
        err.conflict = true;
        throw err;
      }
      if (!/access|private|public/i.test(String(e?.message))) throw e;
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------- API
export async function readDoc(name, fallback = null, env = process.env) {
  const r = env.DASH_STORE_DIR ? await fileRead(name, env) : await blobRead(name, env);
  return r ? r.data : fallback;
}

async function readWithEtag(name, env) {
  return env.DASH_STORE_DIR ? fileRead(name, env) : blobRead(name, env);
}

export async function writeDoc(name, data, env = process.env) {
  if (env.DASH_STORE_DIR) return fileWrite(name, data, env);
  return blobWrite(name, data, env, null);
}

/**
 * Read, change, write, with a conflict retry. `mutate(current)` returns the
 * new document (or throws). Returns whatever mutate returned.
 */
export async function readModifyWrite(name, fallback, mutate, env = process.env) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const cur = await readWithEtag(name, env);
    const next = await mutate(cur ? cur.data : structuredClone(fallback));
    try {
      if (env.DASH_STORE_DIR) await fileWrite(name, next, env);
      else await blobWrite(name, next, env, cur?.etag);
      return next;
    } catch (e) {
      if (e.conflict && attempt < 4) continue;
      throw e;
    }
  }
  throw new Error('could not save after several tries');
}

/** Appends an activity-log line (kept to the latest 600). Never throws. */
export async function logActivity(entry, env = process.env) {
  try {
    await readModifyWrite('activity', { items: [] }, (doc) => {
      doc.items.unshift({ at: new Date().toISOString(), ...entry });
      doc.items = doc.items.slice(0, 600);
      return doc;
    }, env);
  } catch (e) {
    console.error('activity log failed', String(e?.message || e));
  }
}

export const _resetAccessMode = () => {
  accessMode = null;
};
