import {
  getBearerToken,
  errorResponse
} from './http.js';

import {
  authenticateRequest
} from '../../_lib/firebase.js';

const AUTH_ERROR_MESSAGES = Object.freeze({
  AUTH_CONFIGURATION_ERROR:
    'Firebase server authentication is not configured.',
  AUTH_UPSTREAM_UNAVAILABLE:
    'Firebase authentication service is temporarily unavailable.',
  EMAIL_NOT_VERIFIED:
    'Verify your email address before entering the OVYX workspace.',
  AUTH_SESSION_REVOKED:
    'This OVYX session has been revoked. Sign in again.',
  ACCOUNT_DISABLED:
    'This OVYX account has been disabled.'
});

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export async function verifyFirebaseIdToken(request, env) {
  const token =
    getBearerToken(request);

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

  try {
    const user =
      await authenticateRequest(
        request,
        env
      );

    if (!user) {
      return {
        ok: false,
        response: errorResponse(
          401,
          'AUTH_REQUIRED',
          'A valid Firebase ID token is required.'
        )
      };
    }

    return {
      ok: true,
      token,
      user
    };
  } catch (error) {
    const code =
      String(
        error?.code ||
        'AUTH_INVALID'
      );

    const status =
      Number.isInteger(error?.status)
        ? error.status
        : (
          code === 'EMAIL_NOT_VERIFIED' ||
          code === 'ACCOUNT_DISABLED'
            ? 403
            : 401
        );

    return {
      ok: false,
      response: errorResponse(
        status,
        code,
        AUTH_ERROR_MESSAGES[code] ||
          'The Firebase authentication session is invalid or expired.'
      )
    };
  }
}
