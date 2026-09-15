'use strict';

const {
  getBearerToken,
  errorResponse
} = require('./http.js');

const FIREBASE_LOOKUP_URL =
  'https://identitytoolkit.googleapis.com/v1/accounts:lookup';

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

async function verifyFirebaseIdToken(request, env) {
  const token = getBearerToken(request);

  if (!token) {
    return {
      ok: false,
      response: errorResponse(
        401,
        'AUTH_REQUIRED',
        'A valid Firebase ID token is required.'
      )
    };
  }

  const apiKey = String(env.FIREBASE_WEB_API_KEY || '').trim();

  if (!apiKey) {
    return {
      ok: false,
      response: errorResponse(
        500,
        'AUTH_CONFIGURATION_ERROR',
        'Firebase server authentication is not configured.'
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
        503,
        'AUTH_UPSTREAM_UNAVAILABLE',
        'Firebase authentication service is temporarily unavailable.'
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
        401,
        'INVALID_SESSION',
        'The Firebase authentication session is invalid or expired.'
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
        401,
        'INVALID_SESSION',
        'Firebase did not return a valid authenticated account.'
      )
    };
  }

  if (account.disabled === true) {
    return {
      ok: false,
      response: errorResponse(
        403,
        'ACCOUNT_DISABLED',
        'This OVYX account has been disabled.'
      )
    };
  }

  const uid = String(account.localId).trim();
  const email = normalizeEmail(account.email);

  if (!uid) {
    return {
      ok: false,
      response: errorResponse(
        401,
        'INVALID_IDENTITY',
        'The authenticated identity is incomplete.'
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

module.exports = {
  normalizeEmail,
  verifyFirebaseIdToken
};
