'use strict';

const { verifyFirebaseIdToken } = require('../_lib/auth.js');
const { errorResponse, jsonResponse } = require('../_lib/http.js');

function requestId(request) {
  return request.headers.get('CF-Ray') ||
    request.headers.get('X-Request-ID') ||
    crypto.randomUUID();
}

async function onRequestGet(context) {
  const { request, env } = context;
  const id = requestId(request);
  const identity = await verifyFirebaseIdToken(request, env);
  if (!identity.ok) return identity.response;

  try {
    // UID comes exclusively from the verified Firebase identity.
    const { findRecentPaymentsForUid } = await import('../_lib/firebase-query.js');
    const payments = await findRecentPaymentsForUid(env, identity.user.uid, 8);
    return jsonResponse(
      { ok: true, payments, count: payments.length, checkedAt: new Date().toISOString() },
      200,
      {
        'Cache-Control': 'no-store, max-age=0',
        Pragma: 'no-cache',
        'X-OVYX-Request-ID': id,
      }
    );
  } catch (error) {
    console.error('[OVYX PAYMENT HISTORY]', id, error?.code || 'UNAVAILABLE');
    return errorResponse(
      error?.status || 503,
      error?.code || 'PAYMENT_HISTORY_UNAVAILABLE',
      'Payment history is temporarily unavailable. No local browser history was substituted.',
      id
    );
  }
}

async function onRequest(context) {
  const method = context.request.method;
  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { Allow: 'GET, OPTIONS', 'Cache-Control': 'no-store' },
    });
  }
  if (method !== 'GET') {
    return errorResponse(
      405,
      'METHOD_NOT_ALLOWED',
      'Only GET is supported for payment history.',
      requestId(context.request)
    );
  }
  return onRequestGet(context);
}

module.exports = { onRequest };
