// Etsy API v3 OAuth 2.0 (PKCE) connection. Etsy's v3 flow is a public-client PKCE flow —
// no client secret is used in the code/token exchange, only the Keystring (client_id) and
// the x-api-key header on API calls. The "Shared Secret" Etsy also issues is a legacy
// carryover from API v2 and isn't needed here.
const crypto = require('crypto');
const { readJson, writeJson, del } = require('./blobStore');

const AUTHORIZE_URL = 'https://www.etsy.com/oauth/connect';
const TOKEN_URL = 'https://api.etsy.com/v3/public/oauth/token';
const API_BASE = 'https://openapi.etsy.com/v3/application';

const TOKENS_PATHNAME = 'pod-pilot/etsy/tokens.json';
const PENDING_PATHNAME_PREFIX = 'pod-pilot/etsy/pending';

const KEYSTRING = process.env.ETSY_KEYSTRING;
const REDIRECT_URI = process.env.ETSY_REDIRECT_URI || 'https://booklet.today/api/etsy/callback';
const SCOPES = ['listings_r', 'listings_w', 'shops_r', 'shops_rw', 'transactions_r'].join(' ');

function base64url(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function generatePkce() {
  const codeVerifier = base64url(crypto.randomBytes(48));
  const codeChallenge = base64url(crypto.createHash('sha256').update(codeVerifier).digest());
  return { codeVerifier, codeChallenge };
}

// Etsy redirects the browser back with the same `state` we sent, so we stash the PKCE
// verifier under that state (a few minutes of Blob storage) and look it up on callback —
// serverless functions have no in-memory session to hold it between requests.
async function savePendingAuth(state, codeVerifier) {
  await writeJson(`${PENDING_PATHNAME_PREFIX}/${state}.json`, { codeVerifier, createdAt: Date.now() });
}

async function consumePendingAuth(state) {
  const pathname = `${PENDING_PATHNAME_PREFIX}/${state}.json`;
  const data = await readJson(pathname, null);
  if (data) await del(pathname).catch(() => {});
  return data;
}

function buildAuthorizeUrl({ state, codeChallenge }) {
  if (!KEYSTRING) throw new Error('ETSY_KEYSTRING is not configured');
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: KEYSTRING,
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256'
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

async function exchangeCodeForTokens(code, codeVerifier) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: KEYSTRING,
      redirect_uri: REDIRECT_URI,
      code,
      code_verifier: codeVerifier
    })
  });
  if (!res.ok) throw new Error(`Etsy token exchange failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function refreshAccessToken(refreshToken) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: KEYSTRING,
      refresh_token: refreshToken
    })
  });
  if (!res.ok) throw new Error(`Etsy token refresh failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function apiRequest(path, { accessToken, method = 'GET', body } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'x-api-key': KEYSTRING,
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) throw new Error(`Etsy API ${method} ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function readTokens() {
  return readJson(TOKENS_PATHNAME, null);
}

async function writeTokens(tokens) {
  await writeJson(TOKENS_PATHNAME, tokens);
}

async function disconnect() {
  await del(TOKENS_PATHNAME).catch(() => {});
}

// Returns a valid access token, refreshing (and persisting) if the current one is expired
// or close to it. Etsy access tokens live ~1 hour; refresh tokens rotate on each use.
async function getValidAccessToken() {
  const tokens = await readTokens();
  if (!tokens) return null;

  const expiresSoon = Date.now() > tokens.expiresAt - 60_000;
  if (!expiresSoon) return tokens.accessToken;

  const refreshed = await refreshAccessToken(tokens.refreshToken);
  const updated = {
    ...tokens,
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token,
    expiresAt: Date.now() + refreshed.expires_in * 1000
  };
  await writeTokens(updated);
  return updated.accessToken;
}

module.exports = {
  generatePkce,
  savePendingAuth,
  consumePendingAuth,
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  apiRequest,
  readTokens,
  writeTokens,
  disconnect,
  getValidAccessToken
};
