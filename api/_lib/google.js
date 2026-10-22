/**
 * Google service-account sign-in with node crypto (no SDK): builds a signed
 * JWT, trades it for an access token. Used by Search Console and the
 * Google Ads sheet connectors.
 *
 * Env: GOOGLE_SA_JSON = the whole service-account key file, as JSON text
 * (or base64 of that JSON).
 */
import { createSign } from 'node:crypto';
import { fetchJson } from './util.js';

export function parseServiceAccount(env = process.env) {
  const raw = String(env.GOOGLE_SA_JSON || '').trim();
  if (!raw) return null;
  let text = raw;
  if (!raw.startsWith('{')) {
    try {
      text = Buffer.from(raw, 'base64').toString('utf8');
    } catch {
      return null;
    }
  }
  try {
    const j = JSON.parse(text);
    if (!j.client_email || !j.private_key) return null;
    return { email: j.client_email, key: String(j.private_key).replace(/\\n/g, '\n'), tokenUri: j.token_uri || 'https://oauth2.googleapis.com/token' };
  } catch {
    return null;
  }
}

const b64u = (x) => Buffer.from(x).toString('base64url');

export function signJwt(sa, scope, now = Math.floor(Date.now() / 1000)) {
  const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64u(JSON.stringify({ iss: sa.email, scope, aud: sa.tokenUri, iat: now, exp: now + 3300 }));
  const sig = createSign('RSA-SHA256').update(`${head}.${claim}`).sign(sa.key).toString('base64url');
  return `${head}.${claim}.${sig}`;
}

const cache = new Map();

export async function accessToken(sa, scope, fetchImpl = fetch) {
  const hit = cache.get(`${sa.email}|${scope}`);
  if (hit && hit.exp > Date.now() + 60000) return hit.token;
  const body = new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: signJwt(sa, scope) });
  const j = await fetchJson(sa.tokenUri, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body }, { fetchImpl });
  cache.set(`${sa.email}|${scope}`, { token: j.access_token, exp: Date.now() + (j.expires_in || 3300) * 1000 });
  return j.access_token;
}
