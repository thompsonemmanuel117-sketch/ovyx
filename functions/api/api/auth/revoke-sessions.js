import {
  errorResponse,
  jsonResponse,
  getBearerToken,
  getRequestId,
  enforceSameOrigin
} from '../../../_lib/http.js';

import {
  verifyFirebaseIdToken
} from '../../../_lib/auth.js';

import {
  revokeFirebaseRefreshTokens
} from '../../_lib/firebase-admin.js';

export async function onRequestPost(context) {
  const request =
    context.request;

  const requestId =
    getRequestId(request);

  if (!enforceSameOrigin(request)) {
    return errorResponse(
      403,
      'ORIGIN_REJECTED',
      'Cross-origin session requests are not permitted.',
      requestId
    );
  }

  if (!getBearerToken(request)) {
    return errorResponse(
      401,
      'AUTH_REQUIRED',
      'A valid Firebase ID token is required.',
      requestId
    );
  }

  const auth =
    await verifyFirebaseIdToken(
      request,
      context.env
    );

  if (!auth.ok) {
    return auth.response;
  }

  try {
    const revoked =
      await revokeFirebaseRefreshTokens(
        context.env,
        auth.user.uid
      );

    return jsonResponse(
      {
        ok: true,
        authenticated: true,
        revoked: true,
        revokedAt:
          revoked.validSince,
        reauthenticationRequired:
          true,
        message:
          'All Firebase refresh-token sessions were revoked. Sign in again on this device to create a new session.',
        authority:
          'SERVER'
      },
      200,
      {
        'X-OVYX-Request-ID':
          requestId
      }
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        event:
          'ovyx_auth_session_revocation_failed',
        requestId,
        uid:
          auth.user.uid,
        code:
          error?.code ||
          'AUTH_REVOCATION_FAILED'
      })
    );

    const status =
      Number.isInteger(error?.status) &&
      error.status >= 400 &&
      error.status <= 599
        ? error.status
        : 503;

    return errorResponse(
      status >= 500
        ? 503
        : status,
      error?.code ||
        'AUTH_REVOCATION_FAILED',
      status >= 500
        ? 'Unable to revoke the other Firebase sessions right now.'
        : 'Unable to revoke Firebase sessions.',
      requestId
    );
  }
}

export async function onRequestGet(context) {
  return errorResponse(
    405,
    'METHOD_NOT_ALLOWED',
    'Use POST to revoke Firebase sessions.',
    getRequestId(context.request)
  );
}
