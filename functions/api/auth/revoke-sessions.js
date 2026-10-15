import { authenticateRequest } from '../../_lib/firebase.js';
import { revokeFirebaseRefreshTokens } from '../../_lib/firebase-admin.js';
import { enforceSameOrigin, errorResponse, jsonResponse, requestId } from '../_lib/http.js';

const RECENT_AUTH_SECONDS = 10 * 60;

export async function onRequestPost(context) {
  const { request, env } = context;
  const id = requestId(request);
  if (!enforceSameOrigin(request)) {
    return errorResponse(403, 'ORIGIN_REJECTED', 'Cross-origin session controls are not permitted.', id);
  }

  try {
    const user = context.data?.user || await authenticateRequest(request, env);
    const uid = String(user?.uid || user?.sub || '').trim();
    if (!uid) return errorResponse(401, 'AUTH_REQUIRED', 'Sign in before revoking sessions.', id);

    const authTime = Number(user?.auth_time || 0);
    const now = Math.floor(Date.now() / 1000);
    if (!authTime || now - authTime > RECENT_AUTH_SECONDS) {
      return errorResponse(403, 'REAUTH_REQUIRED', 'Sign in again before logging out every device.', id);
    }

    const result = await revokeFirebaseRefreshTokens(env, uid, now);
    return jsonResponse({
      ok: true,
      revoked: true,
      uid: result.uid,
      revokedAt: new Date(now * 1000).toISOString(),
      scope: 'all-refresh-sessions',
      nextStep: 'Sign in again on the devices you still want to use.'
    }, 200, {
      'X-OVYX-Request-ID': id,
      'Cache-Control': 'no-store, max-age=0'
    });
  } catch (error) {
    return errorResponse(
      error?.status || 503,
      error?.code || 'SESSION_REVOCATION_FAILED',
      error?.message || 'OVYX could not revoke the account sessions.',
      id
    );
  }
}

export async function onRequest(context) {
  if (context.request.method === 'POST') return onRequestPost(context);
  return errorResponse(405, 'METHOD_NOT_ALLOWED', 'POST is required.', requestId(context.request));
}
