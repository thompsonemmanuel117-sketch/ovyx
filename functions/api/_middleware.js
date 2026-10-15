import {
  authenticateRequest,
} from '../_lib/firebase.js';

import {
  errorResponse,
  withCors,
  requestId,
} from './_lib/http.js';

import { resolveEntitlements } from './entitlements.js';

const INTEGRATION_GATED_PATHS = new Set([
  '/api/ai/assistant',
  '/api/ai/gateway',
  '/api/ai/ovyx',
  '/api/generate',
  '/api/deploy',
  '/api/payments/create',
  '/api/github/repos',
  '/api/workspace/activate'
]);

const FEATURE_REQUIREMENTS_BY_PATH = new Map([
  ['/api/ai/assistant', ['aiGeneration']],
  ['/api/ai/gateway', ['aiGeneration']],
  ['/api/ai/ovyx', ['aiGeneration']],
  ['/api/generate', ['aiGeneration', 'github']],
  ['/api/deploy', ['cloudflareDeploy']],
  ['/api/github/repos', ['github']],
  ['/api/workspace/activate', ['teamWorkspace']],
]);


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
          errorResponse(403, 'CORS_DENIED', 'Cross-origin API requests are not allowed.', id),
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

    if (INTEGRATION_GATED_PATHS.has(url.pathname)) {
      let integrationState;
      try {
        const { getProductionIntegrationState } = await import('../_lib/integration-state.js');
        integrationState = await getProductionIntegrationState(context.env);
      } catch (error) {
        return withCors(errorResponse(503, 'INTEGRATION_STATE_UNAVAILABLE', 'OVYX could not verify the global production integration state. Retry when the platform configuration service is available.', id), req);
      }
      if (!integrationState.live) {
        return withCors(errorResponse(503, 'PRODUCTION_INTEGRATIONS_PAUSED', 'The OVYX owner has paused production integrations. This service will become available when the owner switches integrations back on.', id), req);
      }
    }

    const requiredFeatures = FEATURE_REQUIREMENTS_BY_PATH.get(url.pathname);
    if (user && requiredFeatures) {
      let resolved;
      try {
        resolved = await resolveEntitlements(context.env, user);
      } catch {
        return withCors(errorResponse(503, 'FEATURE_ACCESS_UNAVAILABLE', 'OVYX could not verify this account’s live feature permissions. Retry when the account service is available.', id), req);
      }
      context.data.entitlements = resolved;
      const denied = requiredFeatures.filter(feature => resolved?.capabilities?.[feature] !== true);
      if (denied.length) {
        return withCors(errorResponse(403, 'FEATURE_NOT_INCLUDED', 'This account does not currently have access to: ' + denied.join(', ') + '. The owner-controlled plan configuration is authoritative.', id), req);
      }
    }

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
