import { store } from './util.js';
import { show } from './ui.js';
import { AUTH_URL, TOKEN_URL, REVOKE_URL, SCOPES, REDIRECT_URI, CFG_KEY, TOK_KEY, CACHE_KEY, OAUTH_KEY } from './constants.js';

const b64url = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export async function signIn() {
  const cfg = store.get(CFG_KEY);
  if (!cfg) return show('view-setup');
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
  // localStorage, not sessionStorage: Firefox can hand the OAuth redirect to
  // a fresh tab context (session restore, container tabs), which loses
  // sessionStorage and made sign-in fail with a state mismatch.
  store.set(OAUTH_KEY, { verifier, state, t: Date.now() });
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const p = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    access_type: 'offline',
    prompt: 'consent',
  });
  location.href = `${AUTH_URL}?${p}`;
}

async function tokenCall(form, revoke = false) {
  const r = await fetch(revoke ? REVOKE_URL : TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
  });
  let j = {};
  try { j = await r.json(); } catch { /* revoke returns empty */ }
  if (!r.ok) {
    const msg = (j.error_description || (j.error && j.error.message) || j.error || `HTTP ${r.status}`);
    throw new Error('Google sign-in failed: ' + msg);
  }
  return j;
}

function saveTokens(j) {
  const prev = store.get(TOK_KEY) || {};
  store.set(TOK_KEY, {
    access_token: j.access_token,
    refresh_token: j.refresh_token || prev.refresh_token,
    expires_at: Date.now() + Math.max(60, (j.expires_in || 3600) - 120) * 1000,
  });
}

export async function exchangeCode(code, verifier) {
  const cfg = store.get(CFG_KEY);
  const form = {
    grant_type: 'authorization_code',
    code,
    client_id: cfg.clientId,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier || '',
  };
  if (cfg.clientSecret) form.client_secret = cfg.clientSecret;
  saveTokens(await tokenCall(form));
}

let refreshing = null;
export async function refreshTokens() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const cfg = store.get(CFG_KEY);
    const tok = store.get(TOK_KEY);
    if (!tok || !tok.refresh_token) throw new Error('Not signed in.');
    const form = {
      grant_type: 'refresh_token',
      refresh_token: tok.refresh_token,
      client_id: cfg.clientId,
    };
    if (cfg.clientSecret) form.client_secret = cfg.clientSecret;
    try {
      saveTokens(await tokenCall(form));
    } catch (e) {
      store.del(TOK_KEY); // refresh token expired/revoked — require a fresh sign-in
      throw new Error('Your Google session has expired — please sign in again.');
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export async function ensureToken() {
  const tok = store.get(TOK_KEY);
  if (!tok) throw new Error('Not signed in.');
  if (Date.now() >= tok.expires_at) await refreshTokens();
  return store.get(TOK_KEY).access_token;
}

export async function signOut() {
  const tok = store.get(TOK_KEY);
  if (tok && tok.refresh_token) {
    try { await tokenCall({ token: tok.refresh_token }, true); } catch { /* best effort */ }
  }
  store.del(TOK_KEY);
  store.del(CACHE_KEY);
  show('view-signin');
}
