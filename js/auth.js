// Service-account authentication, done entirely in the browser with the Web Crypto API.
//
// Flow (OAuth 2.0 JWT-bearer grant, https://developers.google.com/identity/protocols/oauth2/service-account):
//   1. Build a JWT signed with the service account's RSA private key (RS256).
//   2. POST it to the token endpoint to receive a short-lived access token.
//   3. Use that token as `Authorization: Bearer` for the GCS JSON API.
//
// The token endpoint accepts a simple form POST (no custom headers) so it needs no
// CORS config. The GCS bucket, however, does — see README.

import { b64urlFromString, b64urlFromBuffer, pemToArrayBuffer } from './util.js';

const SCOPE = 'https://www.googleapis.com/auth/devstorage.read_only';
const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token';

async function signAssertion(sa) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: sa.client_email,
    scope: SCOPE,
    aud: sa.token_uri || DEFAULT_TOKEN_URI,
    iat: now,
    exp: now + 3600,
  };
  const signingInput = `${b64urlFromString(JSON.stringify(header))}.${b64urlFromString(JSON.stringify(claims))}`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${b64urlFromBuffer(sig)}`;
}

/** Validate that the parsed JSON looks like a usable service-account key. */
export function validateServiceAccount(sa) {
  if (!sa || typeof sa !== 'object') throw new Error('Service account JSON is not an object.');
  if (sa.type && sa.type !== 'service_account') {
    throw new Error(`Expected a "service_account" key, got "${sa.type}".`);
  }
  if (!sa.client_email) throw new Error('Missing "client_email" in the service account JSON.');
  if (!sa.private_key || !sa.private_key.includes('PRIVATE KEY')) {
    throw new Error('Missing or malformed "private_key" in the service account JSON.');
  }
}

/**
 * Holds the service account and lazily fetches / refreshes an access token.
 * `current()` returns the cached token string synchronously (kept fresh by a timer);
 * `getToken()` guarantees a valid token, refreshing if needed.
 */
export class TokenManager {
  constructor(sa) {
    validateServiceAccount(sa);
    this.sa = sa;
    this.token = null;
    this.expiresAt = 0;
    this._pending = null;
    this._timer = null;
  }

  current() {
    return this.token;
  }

  async getToken() {
    if (this.token && Date.now() < this.expiresAt) return this.token;
    if (this._pending) return this._pending;
    this._pending = this._fetch().finally(() => { this._pending = null; });
    return this._pending;
  }

  async _fetch() {
    const assertion = await signAssertion(this.sa);
    const body = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    });
    let res;
    try {
      res = await fetch(this.sa.token_uri || DEFAULT_TOKEN_URI, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
    } catch (e) {
      throw new Error(`Could not reach the token endpoint (${e.message}). Check your network connection.`);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let hint = '';
      try {
        const j = JSON.parse(text);
        hint = j.error_description || j.error || '';
      } catch { /* keep raw */ }
      throw new Error(`Authentication failed (HTTP ${res.status}). ${hint || text}`.trim());
    }
    const j = await res.json();
    this.token = j.access_token;
    // Refresh a minute before the real expiry to be safe.
    this.expiresAt = Date.now() + (j.expires_in - 60) * 1000;
    this._scheduleRefresh(j.expires_in);
    return this.token;
  }

  _scheduleRefresh(expiresIn) {
    clearTimeout(this._timer);
    const ms = Math.max(30, expiresIn - 300) * 1000; // ~5 min before expiry
    this._timer = setTimeout(() => { this.getToken().catch(() => {}); }, ms);
  }

  destroy() {
    clearTimeout(this._timer);
    this.token = null;
    this.expiresAt = 0;
  }
}
