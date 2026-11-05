import {
  getBearerToken,
  errorResponse
} from './http.js';

const FIREBASE_LOOKUP_URL =
  'https://identitytoolkit.googleapis.com/v1/accounts:lookup';

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export async function verifyFirebaseIdToken(request, env) {
  const token = getBearerToken(request);

  if (!token) {
    return {
      ok: false,
      response: errorResponse(
        'A valid Firebase ID token is required.',
        401,
        'AUTH_REQUIRED'
      )
    };
  }

  const apiKey = String(env.FIREBASE_WEB_API_KEY || '').trim();

  if (!apiKey) {
    return {
      ok: false,
      response: errorResponse(
        'Firebase server authentication is not configured.',
        500,
        'AUTH_CONFIGURATION_ERROR'
      )
    };
  }

  let response;

  try {
    response = await fetch(
      `${FIREBASE_LOOKUP_URL}?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          idToken: token
        })
      }
    );
  } catch {
    return {
      ok: false,
      response: errorResponse(
        'Firebase authentication service is temporarily unavailable.',
        503,
        'AUTH_UPSTREAM_UNAVAILABLE'
      )
    };
  }

  let payload = {};

  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) {
    return {
      ok: false,
      response: errorResponse(
        'The Firebase authentication session is invalid or expired.',
        401,
        'INVALID_SESSION'
      )
    };
  }

  const account = Array.isArray(payload.users)
    ? payload.users[0]
    : null;

  if (!account || !account.localId) {
    return {
      ok: false,
      response: errorResponse(
        'Firebase did not return a valid authenticated account.',
        401,
        'INVALID_SESSION'
      )
    };
  }

  if (account.disabled === true) {
    return {
      ok: false,
      response: errorResponse(
        'This OVYX account has been disabled.',
        403,
        'ACCOUNT_DISABLED'
      )
    };
  }

  const uid = String(account.localId).trim();
  const email = normalizeEmail(account.email);

  if (!uid) {
    return {
      ok: false,
      response: errorResponse(
        'The authenticated identity is incomplete.',
        401,
        'INVALID_IDENTITY'
      )
    };
  }

  return {
    ok: true,
    token,
    user: {
      uid,
      email,
      emailVerified: account.emailVerified === true,
      displayName: String(account.displayName || ''),
      photoUrl: String(account.photoUrl || ''),
      disabled: false,
      createdAt: account.createdAt
        ? Number(account.createdAt)
        : null,
      lastLoginAt: account.lastLoginAt
        ? Number(account.lastLoginAt)
        : null
    }
  };
}
