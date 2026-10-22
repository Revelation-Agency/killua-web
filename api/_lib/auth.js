/**
 * Dashboard login: scrypt password check, HMAC-signed session cookie, roles.
 *
 * Users live in env DASH_USERS, a JSON array of {email, name, role, salt, hash}.
 * Make an entry with:  node scripts/dash-user.mjs <email> <name> <role>
 * The session cookie is `kdash=<payload>.<signature>`; the signature is
 * HMAC-SHA256 with DASH_SESSION_SECRET. Every request re-checks that the user
 * still exists and still has the same role, so removing a user from DASH_USERS
 * logs them out everywhere.
 */
import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { parseCookies, sleep } from './util.js';

const scryptAsync = promisify(scrypt);
export const COOKIE = 'kdash';
export const SESSION_DAYS = 30;
export const ROLES = ['admin', 'owner', 'team'];
const KEYLEN = 64;

const b64u = (b) => Buffer.from(b).toString('base64url');

export async function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const key = await scryptAsync(String(password), salt, KEYLEN);
  return { salt, hash: key.toString('hex') };
}

export async function checkPassword(password, salt, hash) {
  try {
    const key = await scryptAsync(String(password), String(salt), KEYLEN);
    const want = Buffer.from(String(hash), 'hex');
    return want.length === key.length && timingSafeEqual(key, want);
  } catch {
    return false;
  }
}

/** Parsed DASH_USERS, or [] when missing or malformed (nobody can log in). */
export function loadUsers(env = process.env) {
  try {
    const arr = JSON.parse(env.DASH_USERS || '[]');
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((u) => u && typeof u.email === 'string' && u.salt && u.hash && ROLES.includes(u.role))
      .map((u) => ({ email: u.email.trim().toLowerCase(), name: String(u.name || u.email), role: u.role, salt: u.salt, hash: u.hash }));
  } catch {
    return [];
  }
}

export function authConfigured(env = process.env) {
  return loadUsers(env).length > 0 && String(env.DASH_SESSION_SECRET || '').length >= 24;
}

const sign = (payload, secret) => createHmac('sha256', secret).update(payload).digest('base64url');

export function makeSession(user, env = process.env, now = Date.now()) {
  const secret = env.DASH_SESSION_SECRET;
  if (!secret || secret.length < 24) throw new Error('DASH_SESSION_SECRET is missing or too short');
  const payload = b64u(JSON.stringify({ e: user.email, r: user.role, iat: now, exp: now + SESSION_DAYS * 86400000 }));
  return `${payload}.${sign(payload, secret)}`;
}

/** Returns {email,name,role} for a valid session cookie value, else null. */
export function readSession(cookieValue, env = process.env, now = Date.now()) {
  const secret = env.DASH_SESSION_SECRET;
  if (!cookieValue || !secret || secret.length < 24) return null;
  const dot = cookieValue.lastIndexOf('.');
  if (dot < 1) return null;
  const payload = cookieValue.slice(0, dot);
  const given = Buffer.from(cookieValue.slice(dot + 1));
  const want = Buffer.from(sign(payload, secret));
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
  let p;
  try {
    p = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!p || typeof p.exp !== 'number' || p.exp < now) return null;
  const user = loadUsers(env).find((u) => u.email === p.e);
  if (!user || user.role !== p.r) return null;
  return { email: user.email, name: user.name, role: user.role };
}

/** The signed-in user for a request, or null. */
export function currentUser(req, env = process.env) {
  return readSession(parseCookies(req.headers.cookie)[COOKIE], env);
}

export function cookieHeader(value, { clear = false, env = process.env } = {}) {
  const insecure = env.DASH_INSECURE_COOKIES === '1' && !env.VERCEL; // local testing only
  const parts = [`${COOKIE}=${clear ? '' : value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (!insecure) parts.push('Secure');
  parts.push(clear ? 'Max-Age=0' : `Max-Age=${SESSION_DAYS * 86400}`);
  return parts.join('; ');
}

// ---- failed-login slow-down (per server instance; the real protection is scrypt cost + a long password)
const fails = new Map();
const WINDOW = 15 * 60 * 1000;

function failKey(email, ip) {
  return `${String(email).toLowerCase()}|${ip}`;
}
function recent(key, now) {
  const list = (fails.get(key) || []).filter((t) => now - t < WINDOW);
  fails.set(key, list);
  return list;
}

export function loginBlocked(email, ip, now = Date.now()) {
  return recent(failKey(email, ip), now).length >= 8;
}

export async function recordFailure(email, ip, { delay = true, now = Date.now() } = {}) {
  const key = failKey(email, ip);
  const list = recent(key, now);
  list.push(now);
  if (delay) await sleep(Math.min(700 * 2 ** (list.length - 1), 6000));
}
export const clearFailures = (email, ip) => fails.delete(failKey(email, ip));
export const _resetFailures = () => fails.clear();

const DUMMY = { salt: '00'.repeat(16), hash: '00'.repeat(KEYLEN) };

/** Checks email+password. Takes the same time whether or not the user exists. */
export async function authenticate(email, password, env = process.env) {
  const users = loadUsers(env);
  const user = users.find((u) => u.email === String(email || '').trim().toLowerCase());
  const ok = await checkPassword(String(password || ''), (user || DUMMY).salt, (user || DUMMY).hash);
  return user && ok ? { email: user.email, name: user.name, role: user.role } : null;
}

// ---- permissions
const CAN = {
  admin: new Set(['read', 'refresh', 'task_add', 'task_admin', 'social_edit', 'activity']),
  owner: new Set(['read', 'task_add', 'social_edit']),
  team: new Set(['read', 'task_add']),
};
export const can = (user, action) => !!user && !!CAN[user.role]?.has(action);
