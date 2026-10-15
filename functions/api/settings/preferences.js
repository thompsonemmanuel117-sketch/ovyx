import { verifyFirebaseIdToken, normalizeEmail } from '../_lib/auth.js';
import {
  getFirestoreDocumentAtPath,
  getFirestoreDataAtPath,
  setFirestoreDocumentAtPath
} from '../../_lib/firebase-admin.js';
import { errorResponse, jsonResponse, readJson, requestId, enforceSameOrigin } from '../_lib/http.js';
import { defaultProjectSettings, mergeProjectSettings, normalizeProjectSettings } from '../../_lib/project-settings.js';

const MAX_BODY_BYTES = 20_000;
const clean = (value, max = 200) => String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max);

async function authenticate(request, env, id) {
  const result = await verifyFirebaseIdToken(request, env);
  if (!result.ok) return { response: result.response };
  const uid = clean(result.user?.uid || result.user?.sub, 180);
  if (!uid) return { response: errorResponse(401, 'SETTINGS_IDENTITY_REQUIRED', 'A verified account is required to sync settings.', id) };
  return { user: result.user, uid, email: normalizeEmail(result.user.email) };
}

export async function onRequestGet(context) {
  const id = requestId(context.request);
  try {
    const auth = await authenticate(context.request, context.env, id);
    if (auth.response) return auth.response;
    const profile = await getFirestoreDataAtPath(context.env, ['users', auth.uid]) || {};
    const saved = !!(profile.settingsPreferences && typeof profile.settingsPreferences === 'object');
    const preferences = saved
      ? normalizeProjectSettings(profile.settingsPreferences, defaultProjectSettings())
      : defaultProjectSettings();
    return jsonResponse({
      ok: true,
      authority: 'USER_ACCOUNT',
      saved,
      preferences,
      updatedAt: profile.settingsPreferencesUpdatedAt || null
    }, 200, { 'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store, max-age=0' });
  } catch (error) {
    return errorResponse(error?.status || 503, error?.code || 'SETTINGS_LOAD_FAILED', error?.message || 'Account settings could not be loaded.', id);
  }
}

export async function onRequestPut(context) {
  const id = requestId(context.request);
  if (!enforceSameOrigin(context.request)) {
    return errorResponse(403, 'ORIGIN_REJECTED', 'Cross-origin settings writes are not permitted.', id);
  }
  try {
    const auth = await authenticate(context.request, context.env, id);
    if (auth.response) return auth.response;
    const body = await readJson(context.request, MAX_BODY_BYTES);
    const patch = body?.preferences && typeof body.preferences === 'object'
      ? body.preferences
      : body;
    const allowedSections = new Set(['profile', 'workspace', 'notifications', 'ai', 'appearance', 'version']);
    if (!patch || typeof patch !== 'object' || Array.isArray(patch) ||
        !Object.keys(patch).some(key => allowedSections.has(key)) ||
        Object.keys(patch).some(key => !allowedSections.has(key))) {
      return errorResponse(400, 'SETTINGS_SCHEMA_INVALID', 'Provide one or more supported settings sections.', id);
    }

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const doc = await getFirestoreDocumentAtPath(context.env, ['users', auth.uid]);
      const profile = await getFirestoreDataAtPath(context.env, ['users', auth.uid]) || {};
      const current = profile.settingsPreferences && typeof profile.settingsPreferences === 'object'
        ? normalizeProjectSettings(profile.settingsPreferences, defaultProjectSettings())
        : defaultProjectSettings();
      const preferences = mergeProjectSettings(current, patch);
      const updatedAt = new Date().toISOString();
      try {
        await setFirestoreDocumentAtPath(context.env, ['users', auth.uid], {
          settingsPreferences: preferences,
          settingsPreferencesUpdatedAt: updatedAt,
          settingsPreferencesUpdatedBy: { uid: auth.uid, email: auth.email || null }
        }, { merge: true, expectedUpdateTime: doc?.updateTime || null });
        return jsonResponse({
          ok: true,
          authority: 'USER_ACCOUNT',
          saved: true,
          preferences,
          updatedAt
        }, 200, { 'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store, max-age=0' });
      } catch (error) {
        if (error?.status === 409 || error?.status === 412 || error?.code === 'FIRESTORE_PRECONDITION_FAILED') {
          if (attempt < 3) continue;
          throw Object.assign(new Error('Settings changed on another device. Reload settings and retry.'), { status: 409, code: 'SETTINGS_CONFLICT' });
        }
        throw error;
      }
    }
    throw Object.assign(new Error('Account settings could not be saved.'), { status: 503, code: 'SETTINGS_SAVE_FAILED' });
  } catch (error) {
    return errorResponse(error?.status || 500, error?.code || 'SETTINGS_SAVE_FAILED', error?.message || 'Account settings could not be saved.', id);
  }
}

export async function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  if (context.request.method === 'PUT' || context.request.method === 'POST') return onRequestPut(context);
  return errorResponse(405, 'METHOD_NOT_ALLOWED', 'GET or PUT is required.', requestId(context.request));
}
