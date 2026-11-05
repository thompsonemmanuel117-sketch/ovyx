/**
 * OVYX server-authoritative capability check.
 *
 * The live entitlement resolver is the single source of truth for account
 * tier, subscription state, expiry, owner-managed plan features and global
 * feature locks. This endpoint must never make its own paid-plan decision.
 */
import { jsonResponse, errorResponse, getRequestId, getBearerToken, enforceSameOrigin, isValidCapabilityName } from '../../_lib/http.js';
import { verifyFirebaseIdToken, normalizeEmail } from '../../_lib/auth.js';
import { resolveEntitlements } from '../entitlements.js';
import { ROOT_EMAIL } from '../../_lib/brain/registry.js';

// Retained as a compatibility/display helper for older imports. It is not
// used to authorize requests; authorization always uses resolveEntitlements.
export function resolveRole(profile, email) {
  if (normalizeEmail(email) === ROOT_EMAIL) return 'ROOT_SUPERUSER';
  const role = String(profile?.role || '').trim().toUpperCase();
  if (role === 'MAX_USER' || role === 'PRO_USER') return role;
  const plan = String(profile?.planTier ?? profile?.tier ?? profile?.plan ?? 'free').trim().toLowerCase();
  if (plan === 'max' || plan === 'maximum') return 'MAX_USER';
  if (plan === 'pro' || plan === 'professional') return 'PRO_USER';
  return 'FREE_USER';
}

function roleForEntitlements(entitlements, email) {
  if (normalizeEmail(email) === ROOT_EMAIL) return 'ROOT_SUPERUSER';
  const tier = String(entitlements?.planTier || 'free').trim().toLowerCase();
  if (tier === 'max') return 'MAX_USER';
  if (tier === 'pro') return 'PRO_USER';
  return 'FREE_USER';
}

export async function onRequestPost(context) {
  const request = context.request;
  const id = getRequestId(request);
  if (!enforceSameOrigin(request)) return errorResponse(403, 'ORIGIN_REJECTED', 'Cross-origin RBAC requests are not permitted.', id);
  if (!getBearerToken(request)) return errorResponse(401, 'AUTH_REQUIRED', 'Authentication is required.', id);

  let body;
  try { body = await request.json(); }
  catch { return errorResponse(400, 'INVALID_JSON', 'Request body must be valid JSON.', id); }

  const capability = String(body?.capability || '');
  if (!isValidCapabilityName(capability)) return errorResponse(400, 'INVALID_CAPABILITY', 'The requested capability is not recognized.', id);

  const auth = await verifyFirebaseIdToken(request, context.env);
  if (!auth.ok) return auth.response;

  try {
    const entitlements = await resolveEntitlements(context.env, auth.user);
    const role = roleForEntitlements(entitlements, auth.user.email);
    const allowed = entitlements?.capabilities?.[capability] === true;
    return jsonResponse({
      ok: true,
      allowed,
      capability,
      role,
      planTier: entitlements?.planTier || 'free',
      planTierState: entitlements?.planTierState || 'expired',
      accessActive: entitlements?.accessActive === true || entitlements?.bypass === true,
      authority: 'SERVER'
    }, 200, { 'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store, max-age=0' });
  } catch (error) {
    console.error('[OVYX RBAC ' + id + ']', error?.code || error?.message || 'evaluation failed');
    return errorResponse(503, 'RBAC_EVALUATION_FAILED', 'Authorization could not be safely evaluated.', id);
  }
}

export async function onRequestGet(context) {
  return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Use POST for RBAC evaluation.', getRequestId(context.request));
}