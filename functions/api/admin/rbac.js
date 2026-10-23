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

import { ROOT_EMAIL } from '../../_lib/brain/registry.js';
import { resolveEntitlements } from '../entitlements.js';



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
    // Use the same server-authoritative entitlement resolver as the rest of OVYX.
    // The verified root email bypasses subscription and feature-plan gates; a stored
    // profile.role value must never mint ROOT_SUPERUSER access.
    const entitlements = await resolveEntitlements(context.env, auth.user);
    const isRoot = normalizeEmail(auth.user.email) === ROOT_EMAIL;
    const tier = String(entitlements?.planTier || 'free').trim().toLowerCase();
    const role = isRoot ? 'ROOT_SUPERUSER' : tier === 'max' ? 'MAX_USER' : tier === 'pro' ? 'PRO_USER' : 'FREE_USER';
    const allowed = entitlements?.capabilities?.[capability] === true;

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
