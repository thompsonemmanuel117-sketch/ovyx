'use strict';

const {
  jsonResponse,
  errorResponse,
  getRequestId,
  enforceSameOrigin
} = require('../../../_lib/http.js');

const {
  verifyFirebaseIdToken
} = require('../../../_lib/auth.js');

export async function onRequestPost(context) {
  const request = context.request;
  const requestId = getRequestId(request);

  if (!enforceSameOrigin(request)) {
    return errorResponse(
      403,
      'ORIGIN_REJECTED',
      'Cross-origin session requests are not permitted.',
      requestId
    );
  }

  const result =
    await verifyFirebaseIdToken(
      request,
      context.env
    );

  if (!result.ok) {
    return result.response;
  }

  const user = result.user;

  return jsonResponse(
    {
      ok: true,
      authenticated: true,
      session: {
        uid: user.uid,
        email: user.email,
        emailVerified: user.emailVerified,
        displayName: user.displayName,
        photoUrl: user.photoUrl
      },
      authority: 'SERVER'
    },
    200,
    {
      'X-OVYX-Request-ID': requestId
    }
  );
}

export async function onRequestGet(context) {
  return errorResponse(
    405,
    'METHOD_NOT_ALLOWED',
    'Use POST for the authenticated session handshake.',
    getRequestId(context.request)
  );
}
