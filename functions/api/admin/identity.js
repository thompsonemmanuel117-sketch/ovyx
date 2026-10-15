import { verifyFirebaseIdToken, normalizeEmail } from '../_lib/auth.js';
import { getFirestoreData, setFirestoreDocument } from '../../_lib/firebase-admin.js';
import { errorResponse, jsonResponse, readJson, requestId, enforceSameOrigin } from '../_lib/http.js';

const ROOT_EMAIL = 'ovyxsupportteam@gmail.com';
const DEFAULT_IDENTITY = Object.freeze({ assistantName: 'OVYX AI', persona: '', markColor: '#E8B64F' });
const clean = (value, limit) => String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, limit);

function normalizeIdentity(value = {}) {
  const name = clean(value.assistantName || DEFAULT_IDENTITY.assistantName, 60) || DEFAULT_IDENTITY.assistantName;
  const persona = clean(value.persona, 3000);
  const rawColor = clean(value.markColor || DEFAULT_IDENTITY.markColor, 20);
  const markColor = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(rawColor) ? rawColor.toUpperCase() : DEFAULT_IDENTITY.markColor;
  return { assistantName: name, persona, markColor };
}

async function requireRoot(request, env, id) {
  if (!enforceSameOrigin(request)) return { response: errorResponse(403, 'ORIGIN_REJECTED', 'Cross-origin admin requests are not permitted.', id) };
  const auth = await verifyFirebaseIdToken(request, env);
  if (!auth.ok) return { response: auth.response };
  if (normalizeEmail(auth.user.email) !== ROOT_EMAIL) return { response: errorResponse(403, 'ROOT_REQUIRED', 'Root administrator access is required.', id) };
  return { user: auth.user };
}

export async function onRequestGet(context) {
  const id = requestId(context.request);
  try {
    const auth = await requireRoot(context.request, context.env, id);
    if (auth.response) return auth.response;
    const config = await getFirestoreData(context.env, 'system', 'config') || {};
    return jsonResponse({ ok: true, identity: normalizeIdentity(config.aiIdentity || {}), updatedAt: config.aiIdentityUpdatedAt || null, authority: 'SERVER' }, 200, {
      'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store, max-age=0'
    });
  } catch (error) {
    return errorResponse(error?.status || 503, error?.code || 'AI_IDENTITY_UNAVAILABLE', 'AI identity settings could not be loaded.', id);
  }
}

export async function onRequestPost(context) {
  const id = requestId(context.request);
  try {
    const auth = await requireRoot(context.request, context.env, id);
    if (auth.response) return auth.response;
    const body = await readJson(context.request, 8000);
    if (body.action && body.action !== 'saveIdentity') return errorResponse(400, 'IDENTITY_ACTION_NOT_ALLOWED', 'Supported action: saveIdentity.', id);
    const identity = normalizeIdentity(body.identity || body);
    const updatedAt = new Date().toISOString();
    const updatedBy = String(auth.user.uid || auth.user.email || '').slice(0, 200);
    await setFirestoreDocument(context.env, 'system', 'config', {
      aiIdentity: identity,
      aiIdentityUpdatedAt: updatedAt,
      aiIdentityUpdatedBy: updatedBy,
      updatedAt,
      updatedBy
    }, { merge: true });
    return jsonResponse({ ok: true, identity, updatedAt, authority: 'SERVER', scope: 'global' }, 200, {
      'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store, max-age=0'
    });
  } catch (error) {
    return errorResponse(error?.status || 500, error?.code || 'AI_IDENTITY_SAVE_FAILED', error?.message || 'AI identity settings could not be saved.', id);
  }
}

export async function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  if (context.request.method === 'POST') return onRequestPost(context);
  return errorResponse(405, 'METHOD_NOT_ALLOWED', 'GET or POST is required.', requestId(context.request));
}
