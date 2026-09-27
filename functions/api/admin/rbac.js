/**
 * OVYX (ForgeOS) - Phase 8 Server-Authoritative RBAC Authority
 * Fixed folder routing pathways for Cloudflare V8 runtime engine compatibility.
 */

import {
  jsonResponse,
  errorResponse,
  getRequestId,
  getBearerToken,
  enforceSameOrigin,
  isValidCapabilityName
} from '../../_lib/http.js';

import {
  verifyFirebaseIdToken,
  normalizeEmail
} from '../../_lib/auth.js';

import {
  getFirestoreDocument
} from '../../_lib/firebase-admin.js';

const ROOT_EMAIL = 'ovyxsupportteam@gmail.com';

const CAPABILITIES = Object.freeze({
  FREE_USER: Object.freeze({
    webStudio: false,
    advancedWebStudio: false,
    appStudio: false,
    gameStudio: false,
    aiGeneration: true,
    github: true,
    cloudflareDeploy: false,
    teamWorkspace: false
  }),

  PRO_USER: Object.freeze({
    webStudio: true,
    advancedWebStudio: true,
    appStudio: false,
    gameStudio: false,
    aiGeneration: true,
    github: true,
    cloudflareDeploy: true,
    teamWorkspace: false
  }),

  MAX_USER: Object.freeze({
    webStudio: true,
    advancedWebStudio: true,
    appStudio: true,
    gameStudio: true,
    aiGeneration: true,
    github: true,
    cloudflareDeploy: true,
    teamWorkspace: true
  }),

  ROOT_SUPERUSER: Object.freeze({
    webStudio: true,
    advancedWebStudio: true,
    appStudio: true,
    gameStudio: true,
    aiGeneration: true,
    github: true,
    cloudflareDeploy: true,
    teamWorkspace: true
  })
});

function resolveRole(profile, email) {
  if (normalizeEmail(email) === ROOT_EMAIL) {
    return 'ROOT_SUPERUSER';
  }

  const role = String(profile?.role || '').trim().toUpperCase();

  if (role === 'ROOT_SUPERUSER' || role === 'MAX_USER' || role === 'PRO_USER') {
    return role;
  }

  const plan = String(profile?.planTier ?? profile?.tier ?? profile?.plan ?? 'free').trim().toLowerCase();

  if (plan === 'max' || plan === 'maximum') {
    return 'MAX_USER';
  }

  if (plan === 'pro' || plan === 'professional') {
    return 'PRO_USER';
  }

  return 'FREE_USER';
}

export async function onRequestPost(context) {
  const request = context.request;
  const requestId = getRequestId(request);

  if (!enforceSameOrigin(request)) {
    return errorResponse(403, 'ORIGIN_REJECTED', 'Cross-origin RBAC requests are not permitted.', requestId);
  }

  if (!getBearerToken(request)) {
    return errorResponse(401, 'AUTH_REQUIRED', 'Authentication is required.', requestId);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, 'INVALID_JSON', 'Request body must be valid JSON.', requestId);
  }

  const capability = String(body?.capability || '');

  if (!isValidCapabilityName(capability)) {
    return errorResponse(400, 'INVALID_CAPABILITY', 'The requested capability is not recognized.', requestId);
  }

  const auth = await verifyFirebaseIdToken(request, context.env);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    let profile = null;

    if (normalizeEmail(auth.user.email) !== ROOT_EMAIL) {
      profile = await getFirestoreDocument(context.env, 'users', auth.user.uid);
    }

    const role = resolveRole(profile, auth.user.email);
    const allowed = CAPABILITIES[role]?.[capability] === true;

    return jsonResponse(
      {
        ok: true,
        allowed,
        capability,
        role,
        authority: 'SERVER'
      },
      200,
      { 'X-OVYX-Request-ID': requestId }
    );
  } catch (error) {
    console.error(`[OVYX RBAC ${requestId}]`, error?.message || error);
    return errorResponse(503, 'RBAC_EVALUATION_FAILED', 'Authorization could not be safely evaluated.', requestId);
  }
}

export async function onRequestGet(context) {
  return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Use POST for RBAC evaluation.', getRequestId(context.request));
}
