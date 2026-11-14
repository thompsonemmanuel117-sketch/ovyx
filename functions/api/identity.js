import { getFirestoreData } from '../_lib/firebase-admin.js';
import { jsonResponse, errorResponse, requestId } from './_lib/http.js';

const DEFAULT_IDENTITY = Object.freeze({ assistantName: 'OVYX AI', markColor: '#E8B64F' });

export async function onRequestGet(context) {
  const id = requestId(context.request);
  try {
    const config = await getFirestoreData(context.env, 'system', 'config') || {};
    const saved = config.aiIdentity && typeof config.aiIdentity === 'object' ? config.aiIdentity : {};
    const assistantName = String(saved.assistantName || DEFAULT_IDENTITY.assistantName).replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 60) || DEFAULT_IDENTITY.assistantName;
    const rawColor = String(saved.markColor || DEFAULT_IDENTITY.markColor).trim();
    const markColor = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(rawColor) ? rawColor.toUpperCase() : DEFAULT_IDENTITY.markColor;
    return jsonResponse({ ok: true, identity: { assistantName, markColor }, updatedAt: config.aiIdentityUpdatedAt || null, authority: 'SERVER' }, 200, {
      'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store, max-age=0'
    });
  } catch (error) {
    return errorResponse(error?.status || 503, error?.code || 'AI_IDENTITY_UNAVAILABLE', 'AI identity settings could not be loaded.', id);
  }
}

export async function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  return errorResponse(405, 'METHOD_NOT_ALLOWED', 'GET is required.', requestId(context.request));
}
