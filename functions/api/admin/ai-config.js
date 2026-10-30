import { verifyFirebaseIdToken, normalizeEmail } from '../_lib/auth.js';
import { getFirestoreData, setFirestoreDocument } from '../../_lib/firebase-admin.js';
import { errorResponse, jsonResponse, readJson, requestId, enforceSameOrigin } from '../_lib/http.js';

const ROOT_EMAIL = 'ovyxsupportteam@gmail.com';
const ALLOWED_PROVIDERS = Object.freeze(['cloudflare-workers-ai']);
const DEFAULT_CONFIG = Object.freeze({ providerOrder: ['cloudflare-workers-ai'] });

async function requireRoot(request, env, id) {
  if (!enforceSameOrigin(request)) return { response: errorResponse(403, 'ORIGIN_REJECTED', 'Cross-origin admin requests are not permitted.', id) };
  const auth = await verifyFirebaseIdToken(request, env);
  if (!auth.ok) return { response: auth.response };
  if (normalizeEmail(auth.user.email) !== ROOT_EMAIL) return { response: errorResponse(403, 'ROOT_REQUIRED', 'Root administrator access is required.', id) };
  return { user: auth.user };
}
function normalizeConfig() {
  // Ignore stale provider-order values from older releases. They are no longer
  // executable and must not be reactivated by an admin save or old Firestore data.
  return { providerOrder: [...DEFAULT_CONFIG.providerOrder] };
}

export async function onRequestGet(context) {
  const id = requestId(context.request);
  try {
    const auth = await requireRoot(context.request, context.env, id);
    if (auth.response) return auth.response;
    const systemConfig = await getFirestoreData(context.env, 'system', 'config') || {};
    return jsonResponse({
      ok: true, config: normalizeConfig(systemConfig.aiConfig || {}),
      updatedAt: systemConfig.aiConfigUpdatedAt || null, authority: 'SERVER'
    }, 200, { 'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store, max-age=0' });
  } catch (error) {
    return errorResponse(error?.status || 503, error?.code || 'AI_CONFIG_UNAVAILABLE', 'Global AI routing settings could not be loaded.', id);
  }
}

export async function onRequestPost(context) {
  const id = requestId(context.request);
  try {
    const auth = await requireRoot(context.request, context.env, id);
    if (auth.response) return auth.response;
    const payload = await readJson(context.request, 12000);
    const config = normalizeConfig(payload.config || payload);
    const updatedAt = new Date().toISOString();
    const updatedBy = String(auth.user.uid || auth.user.email || '').slice(0, 200);
    await setFirestoreDocument(context.env, 'system', 'config', {
      aiConfig: config, aiConfigUpdatedAt: updatedAt, aiConfigUpdatedBy: updatedBy, updatedAt, updatedBy
    }, { merge: true });
    return jsonResponse({ ok: true, config, updatedAt, scope: 'global', authority: 'SERVER' }, 200, {
      'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store, max-age=0'
    });
  } catch (error) {
    return errorResponse(error?.status || 500, error?.code || 'AI_CONFIG_SAVE_FAILED', error?.message || 'Global AI routing configuration could not be saved.', id);
  }
}

export async function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  if (context.request.method === 'POST') return onRequestPost(context);
  return errorResponse(405, 'METHOD_NOT_ALLOWED', 'GET or POST is required.', requestId(context.request));
}
