'use strict';

const {
  jsonResponse,
  errorResponse,
  getRequestId,
  getBearerToken,
  enforceSameOrigin
} = require('../../../_lib/http.js');

const {
  verifyFirebaseIdToken,
  normalizeEmail
} = require('../../../_lib/auth.js');

const {
  listFirestoreDocuments
} = require('../../../_lib/firebase-admin.js');

const ROOT_EMAIL =
  'ovyxsupportteam@gmail.com';

export async function onRequestGet(context) {
  const request = context.request;
  const requestId =
    getRequestId(request);

  if (!enforceSameOrigin(request)) {
    return errorResponse(
      403,
      'ORIGIN_REJECTED',
      'Cross-origin admin requests are not permitted.',
      requestId
    );
  }

  if (!getBearerToken(request)) {
    return errorResponse(
      401,
      'AUTH_REQUIRED',
      'Authentication is required.',
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

  if (
    normalizeEmail(auth.user.email) !==
    ROOT_EMAIL
  ) {
    return errorResponse(
      403,
      'ADMIN_REQUIRED',
      'Root administrator access is required.',
      requestId
    );
  }

  try {
    const result =
      await listFirestoreDocuments(
        context.env,
        'users',
        100
      );

    const users =
      result.documents.map(user => ({
        uid: String(user.id || ''),
        email: String(user.email || ''),
        displayName:
          String(user.displayName || ''),
        role:
          String(user.role || 'FREE_USER'),
        plan:
          String(
            user.planTier ??
            user.tier ??
            user.plan ??
            'free'
          ).toLowerCase(),
        disabled:
          user.disabled === true
      }));

    return jsonResponse(
      {
        ok: true,
        authority: 'SERVER',
        users,
        nextPageToken:
          result.nextPageToken || null
      },
      200,
      {
        'X-OVYX-Request-ID': requestId
      }
    );
  } catch (error) {
    console.error(
      `[OVYX ADMIN USERS ${requestId}]`,
      error?.message || error
    );

    return errorResponse(
      503,
      'ADMIN_USERS_UNAVAILABLE',
      'The server could not retrieve the user registry.',
      requestId
    );
  }
}

export async function onRequestPost(context) {
  return errorResponse(
    405,
    'METHOD_NOT_ALLOWED',
    'User administration writes are not enabled by this Phase 2 endpoint.',
    getRequestId(context.request)
  );
      }
