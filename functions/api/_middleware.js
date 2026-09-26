import {
  authenticateRequest,
} from '../_lib/firebase.js';

import {
  errorResponse,
  withCors,
  requestId,
} from '../_lib/http.js';

export async function onRequest(context) {
  const req = context.request;
  const url = new URL(req.url);
  const id = requestId(req);

  if (req.method === 'OPTIONS') {
    return withCors(new Response(null, { status: 204 }), req);
  }

  try {
    if (url.pathname.startsWith('/api/')) {
      const origin = req.headers.get('origin');

      if (origin && origin !== url.origin) {
        return withCors(
          errorResponse(403, 'CORS_DENIED', 'Cross-origin API requests are not allowed.'),
          req
        );
      }
    }

    let user = null;

    try {
      user = await authenticateRequest(req, context.env);
    } catch (err) {
      if (req.headers.has('authorization')) {
        return withCors(
          errorResponse(401, err.code || 'AUTH_INVALID', err.message || 'Authentication failed.', id),
          req
        );
      }
    }

    context.data = context.data || {};
    context.data.user = user;
    context.data.requestId = id;

    const response = await context.next();
    const out = withCors(response, req);

    out.headers.set('X-OVYX-Request-ID', id);

    return out;
  } catch (err) {
    return withCors(
      errorResponse(err.status || 500, err.code || 'INTERNAL_ERROR', err.message || 'Internal server error.', id),
      req
    );
  }
}
