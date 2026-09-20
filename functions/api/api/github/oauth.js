/**
 * OVYX Phase 5
 * GitHub App OAuth Backend
 *
 * Route:
 *   GET /api/github/oauth?action=state
 *   GET /api/github/oauth?code=...&state=...
 *
 * Responsibilities:
 *   - Authenticate the caller with the existing OVYX Firebase session.
 *   - Generate and validate OAuth state.
 *   - Keep GitHub client credentials exclusively server-side.
 *   - Exchange GitHub's temporary authorization code server-to-server.
 *   - Never return GitHub access/refresh tokens to the browser.
 *   - Encrypt GitHub credentials before storing them in Firestore.
 *   - Verify the GitHub identity belongs to the authenticated OVYX user.
 *   - Record the connection through Phase 4 audit logging.
 *
 * Required Cloudflare secrets:
 *   GITHUB_CLIENT_ID
 *   GITHUB_CLIENT_SECRET
 *   GITHUB_REDIRECT_URI
 *   GITHUB_TOKEN_ENCRYPTION_KEY
 *
 * Existing OVYX modules:
 *   ../../_lib/http.js
 *   ../../_lib/auth.js
 *   ../../_lib/firebase-admin.js
 *   ../../_lib/logger.js
 */

import * as Http from '../../_lib/http.js';
import * as Auth from '../../_lib/auth.js';
import {
  getFirestoreDocument,
  setFirestoreDocument,
} from '../../_lib/firebase-admin.js';
import { audit } from '../../_lib/logger.js';

const GITHUB_TOKEN_ENDPOINT =
  'https://github.com/login/oauth/access_token';

const GITHUB_API_ENDPOINT =
  'https://api.github.com';

const GITHUB_API_VERSION = '2026-03-10';

const STATE_COOKIE = 'ovyx_github_oauth_state';

const STATE_MAX_AGE_SECONDS = 600;

const MAX_CODE_LENGTH = 512;

const MAX_STATE_LENGTH = 1024;

const MAX_BODYLESS_QUERY_VALUE = 2048;

const GITHUB_CONNECTION_COLLECTION = 'github_connections';

const SAFE_ERROR = 'GitHub authentication could not be completed.';

function responseJson(payload, status = 200, extraHeaders = {}) {
  if (typeof Http.json === 'function') {
    return Http.json(payload, status, extraHeaders);
  }

  if (typeof Http.jsonResponse === 'function') {
    return Http.jsonResponse(payload, status, extraHeaders);
  }

  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
      ...extraHeaders,
    },
  });
}

function responseError(message, status = 400, extraHeaders = {}) {
  if (typeof Http.error === 'function') {
    return Http.error(message, status, extraHeaders);
  }

  return responseJson(
    {
      ok: false,
      error: message,
    },
    status,
    extraHeaders,
  );
}

function methodAllowed(request, methods) {
  if (typeof Http.methodAllowed === 'function') {
    return Http.methodAllowed(request, methods);
  }

  const method = request.method.toUpperCase();

  if (!methods.includes(method)) {
    return responseError('Method not allowed.', 405, {
      Allow: methods.join(', '),
    });
  }

  return null;
}

/**
 * Existing OVYX auth.js has changed during earlier phases.
 * Resolve the established authentication helper without duplicating
 * Firebase token verification logic inside this route.
 */
async function requireAuthenticatedUser(request, env) {
  const candidates = [
    'authenticateRequest',
    'authenticateFirebaseRequest',
    'requireAuth',
    'requireFirebaseAuth',
    'verifyRequest',
    'verifyFirebaseRequest',
  ];

  for (const name of candidates) {
    if (typeof Auth[name] !== 'function') {
      continue;
    }

    const result = await Auth[name](request, env);

    if (!result) {
      continue;
    }

    if (result.user) {
      return result.user;
    }

    if (result.identity) {
      return result.identity;
    }

    return result;
  }

  throw new Error(
    'OVYX authentication module does not expose a supported request-authentication handler.',
  );
}

function normalizeIdentity(user) {
  const uid =
    user?.uid ||
    user?.localId ||
    user?.user?.uid ||
    user?.user?.localId ||
    '';

  const email =
    user?.email ||
    user?.user?.email ||
    '';

  if (!uid) {
    throw new Error('Authenticated Firebase user has no UID.');
  }

  return {
    uid: String(uid),
    email: email ? String(email).trim().toLowerCase() : '',
  };
}

function randomBytes(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function base64UrlEncode(bytes) {
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecode(value) {
  const normalized = String(value)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const padded =
    normalized + '='.repeat((4 - (normalized.length % 4)) % 4);

  const binary = atob(padded);

  const output = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    output[i] = binary.charCodeAt(i);
  }

  return output;
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(String(value));

  const digest = await crypto.subtle.digest(
    'SHA-256',
    bytes,
  );

  return new Uint8Array(digest);
}

async function deriveEncryptionKey(secret) {
  if (!secret || String(secret).length < 32) {
    throw new Error(
      'GITHUB_TOKEN_ENCRYPTION_KEY is not configured with sufficient entropy.',
    );
  }

  const digest = await sha256(secret);

  return crypto.subtle.importKey(
    'raw',
    digest,
    {
      name: 'AES-GCM',
    },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encryptSecret(secret, encryptionSecret) {
  if (!secret) {
    throw new Error('Cannot encrypt an empty secret.');
  }

  const key = await deriveEncryptionKey(encryptionSecret);

  const iv = randomBytes(12);

  const plaintext = new TextEncoder().encode(secret);

  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    plaintext,
  );

  return {
    algorithm: 'AES-GCM',
    version: 1,
    iv: base64UrlEncode(iv),
    ciphertext: base64UrlEncode(
      new Uint8Array(ciphertext),
    ),
  };
}

async function decryptSecret(record, encryptionSecret) {
  if (!record?.ciphertext || !record?.iv) {
    throw new Error('Encrypted GitHub credential is malformed.');
  }

  const key = await deriveEncryptionKey(encryptionSecret);

  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: base64UrlDecode(record.iv),
    },
    key,
    base64UrlDecode(record.ciphertext),
  );

  return new TextDecoder().decode(plaintext);
}

function getCookie(request, name) {
  const header = request.headers.get('Cookie');

  if (!header) {
    return null;
  }

  const parts = header.split(';');

  for (const part of parts) {
    const index = part.indexOf('=');

    if (index === -1) {
      continue;
    }

    const key = part.slice(0, index).trim();

    if (key !== name) {
      continue;
    }

    return decodeURIComponent(
      part.slice(index + 1).trim(),
    );
  }

  return null;
}

function createStateCookie(state) {
  return [
    `${STATE_COOKIE}=${encodeURIComponent(state)}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${STATE_MAX_AGE_SECONDS}`,
  ].join('; ');
}

function clearStateCookie() {
  return [
    `${STATE_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Max-Age=0',
  ].join('; ');
}

async function createOAuthState(uid) {
  const nonce = base64UrlEncode(randomBytes(32));

  /*
   * Bind the state to the authenticated OVYX account.
   * The raw Firebase token is never placed into the state.
   */
  const digest = await sha256(`${uid}:${nonce}`);

  return {
    state: `${base64UrlEncode(digest)}.${nonce}`,
    nonce,
  };
}

async function verifyOAuthState(state, cookieState, uid) {
  if (!state || !cookieState || state !== cookieState) {
    return false;
  }

  const separator = state.indexOf('.');

  if (separator <= 0) {
    return false;
  }

  const nonce = state.slice(separator + 1);

  if (!nonce || nonce.length > MAX_STATE_LENGTH) {
    return false;
  }

  const expected = await sha256(`${uid}:${nonce}`);

  const expectedPrefix = base64UrlEncode(expected);

  const suppliedPrefix = state.slice(0, separator);

  if (expectedPrefix.length !== suppliedPrefix.length) {
    return false;
  }

  let difference = 0;

  for (let i = 0; i < expectedPrefix.length; i += 1) {
    difference |=
      expectedPrefix.charCodeAt(i) ^
      suppliedPrefix.charCodeAt(i);
  }

  return difference === 0;
}

function validateCode(code) {
  const value = String(code || '').trim();

  if (!value) {
    throw new Error('GitHub authorization code is required.');
  }

  if (value.length > MAX_CODE_LENGTH) {
    throw new Error('GitHub authorization code is invalid.');
  }

  if (!/^[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+$/.test(value)) {
    throw new Error('GitHub authorization code contains invalid characters.');
  }

  return value;
}

function validateState(state) {
  const value = String(state || '').trim();

  if (!value || value.length > MAX_STATE_LENGTH) {
    throw new Error('GitHub OAuth state is invalid.');
  }

  return value;
}

function validateEnvironment(env) {
  const required = [
    'GITHUB_CLIENT_ID',
    'GITHUB_CLIENT_SECRET',
    'GITHUB_REDIRECT_URI',
    'GITHUB_TOKEN_ENCRYPTION_KEY',
  ];

  const missing = required.filter(
    (key) => !env?.[key] || String(env[key]).trim() === '',
  );

  if (missing.length) {
    throw new Error(
      `Missing required GitHub server configuration: ${missing.join(', ')}`,
    );
  }
}

async function githubRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
      'User-Agent': 'OVYX-GitHub-Integration',
      ...(options.headers || {}),
    },
  });

  return response;
}

async function exchangeCode(code, env) {
  const body = new URLSearchParams();

  body.set('client_id', env.GITHUB_CLIENT_ID);
  body.set('client_secret', env.GITHUB_CLIENT_SECRET);
  body.set('code', code);
  body.set('redirect_uri', env.GITHUB_REDIRECT_URI);

  const response = await fetch(
    GITHUB_TOKEN_ENDPOINT,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type':
          'application/x-www-form-urlencoded',
        'User-Agent': 'OVYX-GitHub-Integration',
      },
      body: body.toString(),
    },
  );

  const payload = await response
    .json()
    .catch(() => null);

  if (!response.ok) {
    throw new Error(
      `GitHub OAuth exchange failed with HTTP ${response.status}.`,
    );
  }

  if (
    !payload ||
    typeof payload !== 'object' ||
    payload.error ||
    !payload.access_token
  ) {
    throw new Error(
      'GitHub did not return a usable access token.',
    );
  }

  return payload;
}

async function getGitHubIdentity(accessToken) {
  const response = await githubRequest(
    `${GITHUB_API_ENDPOINT}/user`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  const payload = await response
    .json()
    .catch(() => null);

  if (!response.ok || !payload?.id) {
    throw new Error(
      'GitHub identity verification failed.',
    );
  }

  return payload;
}

function sanitizeGitHubIdentity(user) {
  return {
    id: Number(user.id),
    login: String(user.login || '').slice(0, 100),
    name: user.name
      ? String(user.name).slice(0, 200)
      : null,
    avatarUrl: user.avatar_url
      ? String(user.avatar_url).slice(0, 1000)
      : null,
    htmlUrl: user.html_url
      ? String(user.html_url).slice(0, 1000)
      : null,
    type: String(user.type || 'User').slice(0, 50),
  };
}

async function persistGitHubConnection({
  identity,
  githubUser,
  oauth,
  env,
}) {
  const uid = identity.uid;

  const accessToken = await encryptSecret(
    String(oauth.access_token),
    env.GITHUB_TOKEN_ENCRYPTION_KEY,
  );

  const refreshToken = oauth.refresh_token
    ? await encryptSecret(
        String(oauth.refresh_token),
        env.GITHUB_TOKEN_ENCRYPTION_KEY,
      )
    : null;

  const now = new Date().toISOString();

  const document = {
    uid,
    provider: 'github',
    providerType: 'github_app',
    status: 'connected',

    githubUser: sanitizeGitHubIdentity(githubUser),

    accessToken,
    refreshToken,

    tokenType: String(
      oauth.token_type || 'bearer',
    ).toLowerCase(),

    scope: String(oauth.scope || '')
      .split(/[,\s]+/)
      .map((scope) => scope.trim())
      .filter(Boolean)
      .slice(0, 50),

    expiresAt: oauth.expires_in
      ? new Date(
          Date.now() +
            Number(oauth.expires_in) * 1000,
        ).toISOString()
      : null,

    refreshTokenExpiresAt:
      oauth.refresh_token_expires_in
        ? new Date(
            Date.now() +
              Number(oauth.refresh_token_expires_in) *
                1000,
          ).toISOString()
        : null,

    createdAt: now,
    updatedAt: now,
    lastValidatedAt: now,
  };

  await setFirestoreDocument(
    `github_connections/${uid}`,
    document,
    env,
  );
}

export async function onRequest(context) {
  const { request, env } = context;

  const methodError = methodAllowed(
    request,
    ['GET'],
  );

  if (methodError) {
    return methodError;
  }

  const requestUrl = new URL(request.url);

  let identity;

  try {
    validateEnvironment(env);

    const authenticatedUser =
      await requireAuthenticatedUser(request, env);

    identity = normalizeIdentity(authenticatedUser);

    const action =
      requestUrl.searchParams.get('action') || '';

    /*
     * STEP 1:
     * Browser asks this endpoint for a signed/bound OAuth state.
     */
    if (action === 'state') {
      const { state } =
        await createOAuthState(identity.uid);

      return responseJson(
        {
          ok: true,
          state,
          clientId: String(env.GITHUB_CLIENT_ID),
          redirectUri: String(env.GITHUB_REDIRECT_URI),
        },
        200,
        {
          'Cache-Control':
            'no-store, no-cache, must-revalidate',
          Pragma: 'no-cache',
          'Set-Cookie': createStateCookie(state),
        },
      );
    }

    /*
     * STEP 2:
     * GitHub returns the temporary code.
     */
    const rawCode =
      requestUrl.searchParams.get('code');

    const rawState =
      requestUrl.searchParams.get('state');

    const code = validateCode(rawCode);
    const state = validateState(rawState);

    const cookieState =
      getCookie(request, STATE_COOKIE);

    const validState =
      await verifyOAuthState(
        state,
        cookieState,
        identity.uid,
      );

    if (!validState) {
      return responseError(
        'GitHub OAuth state validation failed.',
        403,
        {
          'Set-Cookie': clearStateCookie(),
        },
      );
    }

    const oauth =
      await exchangeCode(code, env);

    /*
     * Do not trust the OAuth exchange alone.
     * Verify the actual GitHub identity using the newly issued token.
     */
    const githubUser =
      await getGitHubIdentity(
        oauth.access_token,
      );

    await persistGitHubConnection({
      identity,
      githubUser,
      oauth,
      env,
    });

    /*
     * Phase 4 audit ledger.
     *
     * Important:
     * The access token, refresh token, code and scopes are never
     * passed to the logger.
     */
    await audit.githubRepositoryConnected(
      {
        user: {
          uid: identity.uid,
          email: identity.email || null,
        },
        resource: {
          type: 'github_account',
          id: String(githubUser.id),
        },
        result: 'success',
        providerEventId:
          `github-oauth-${githubUser.id}`,
        metadata: {
          githubLogin: githubUser.login,
          provider: 'github',
          providerType: 'github_app',
        },
      },
      request,
      env,
    );

    /*
     * Deliberately return metadata only.
     * The GitHub access token NEVER reaches index.html.
     */
    return responseJson(
      {
        ok: true,
        connected: true,
        provider: 'github',
        github: sanitizeGitHubIdentity(
          githubUser,
        ),
      },
      200,
      {
        'Cache-Control':
          'no-store, no-cache, must-revalidate',
        Pragma: 'no-cache',
        'Set-Cookie': clearStateCookie(),
      },
    );
  } catch (error) {
    console.error(
      '[OVYX GitHub OAuth]',
      error?.message || 'unknown error',
    );

    /*
     * Never return:
     * - GitHub client secret
     * - OAuth code
     * - access token
     * - refresh token
     * - raw provider response
     */
    return responseError(
      SAFE_ERROR,
      500,
      {
        'Cache-Control':
          'no-store, no-cache, must-revalidate',
        Pragma: 'no-cache',
      },
    );
  }
    
