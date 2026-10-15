import { verifyFirebaseIdToken } from '../_lib/auth.js';
import { errorResponse, jsonResponse, readJson, requestId, enforceSameOrigin } from '../_lib/http.js';
import { getFirestoreDataAtPath, setFirestoreDocumentAtPath } from '../../_lib/firebase-admin.js';
import { mergeUserSettings, normalizeUserSettingsSection } from '../../_lib/user-settings.js';

function uidOf(user) {
  const id = String(user?.uid || user?.sub || '').trim();
  return /^[A-Za-z0-9_-]{1,180}$/.test(id) ? id : '';
}

export async function onRequest(context) {
  const request = context.request;
  const id = requestId(request);
  if (!enforceSameOrigin(request)) {
    return errorResponse(403, 'ORIGIN_REJECTED', 'Cross-origin settings requests are not permitted.', id);
  }
  const auth = await verifyFirebaseIdToken(request, context.env);
  if (!auth.ok) return auth.response;
  const uid = uidOf(auth.user);
  if (!uid) return errorResponse(401, 'AUTH_IDENTITY_REQUIRED', 'A verified account is required.', id);
  const path = ['users', uid, 'settings', 'preferences'];

  try {
    if (request.method === 'GET') {
      const stored = await getFirestoreDataAtPath(context.env, path) || {};
      const settings = mergeUserSettings(stored);
      const query = new URL(request.url).searchParams.get('section');
      if (query) {
        if (!Object.prototype.hasOwnProperty.call(settings, query)) {
          return errorResponse(400, 'SETTINGS_SECTION_INVALID', 'Unsupported settings section.', id);
        }
        return jsonResponse({ ok: true, section: query, settings: settings[query], updatedAt: stored.updatedAt || null, authority: 'SERVER' }, 200, {
          'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store, max-age=0'
        });
      }
      return jsonResponse({ ok: true, settings, updatedAt: stored.updatedAt || null, authority: 'SERVER' }, 200, {
        'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store, max-age=0'
      });
    }
    if (request.method !== 'PUT' && request.method !== 'POST') {
      return errorResponse(405, 'METHOD_NOT_ALLOWED', 'GET or PUT is required.', id);
    }
    const body = await readJson(request, 24000);
    const section = String(body?.section || '').trim().toLowerCase();
    const value = normalizeUserSettingsSection(section, body?.settings || {});
    const previous = await getFirestoreDataAtPath(context.env, path) || {};
    const updatedAt = new Date().toISOString();
    const updatedBy = uid;
    const next = { ...previous, [section]: value, updatedAt, updatedBy };
    await setFirestoreDocumentAtPath(context.env, path, next, { merge: true });
    const confirmed = await getFirestoreDataAtPath(context.env, path);
    const saved = mergeUserSettings(confirmed || next);
    return jsonResponse({ ok: true, section, settings: saved[section], updatedAt, authority: 'SERVER', scope: 'account' }, 200, {
      'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store, max-age=0'
    });
  } catch (error) {
    return errorResponse(error?.status || 500, error?.code || 'SETTINGS_SAVE_FAILED', error?.message || 'Settings could not be saved to your account.', id);
  }
}
