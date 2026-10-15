import { verifyFirebaseIdToken } from '../_lib/auth.js';
import {
  getFirestoreDataAtPath,
  setFirestoreDocumentAtPath
} from '../../_lib/firebase-admin.js';
import {
  enforceSameOrigin,
  errorResponse,
  jsonResponse,
  readJson,
  requestId
} from '../_lib/http.js';

export const AI_PREFERENCE_DEFAULTS = Object.freeze({
  mode: 'balanced',
  model: 'automatic',
  provider: 'gemini',
  explain: true,
  preserve: true,
  confirmDestructive: false,
  contextFiles: true,
  contextPage: true,
  contextGithub: true,
  routing: 'automatic',
  fallback: 'next',
  contextLimit: 'automatic',
  budget: 'automatic'
});

const BOOLEAN_KEYS = ['explain', 'preserve', 'confirmDestructive', 'contextFiles', 'contextPage', 'contextGithub'];
const ALLOWED = new Set(Object.keys(AI_PREFERENCE_DEFAULTS));
const ENUMS = Object.freeze({
  mode: ['balanced', 'fast', 'quality'],
  model: ['automatic', 'gemini-3.8-flash', 'claude-opus-5', 'deepseek-flash', 'gpt-6.1-sol'],
  provider: ['gemini', 'anthropic', 'deepseek', 'openai'],
  routing: ['automatic', 'preferred-first', 'provider-priority'],
  fallback: ['automatic', 'next', 'stop'],
  contextLimit: ['automatic', 'conservative', 'expanded'],
  budget: ['automatic', 'efficient', 'maximum']
});
const preferencePath = uid => ['users', uid, 'settings', 'ai_preferences'];

function cleanUid(value) {
  return String(value || '').trim().slice(0, 180);
}

export function normalizeAIPreferences(value = {}, fallback = AI_PREFERENCE_DEFAULTS) {
  const result = {};
  for (const key of BOOLEAN_KEYS) {
    result[key] = typeof value?.[key] === 'boolean'
      ? value[key]
      : (typeof fallback?.[key] === 'boolean' ? fallback[key] : AI_PREFERENCE_DEFAULTS[key]);
  }
  for (const [key, options] of Object.entries(ENUMS)) {
    const candidate = String(value?.[key] ?? '');
    const fallbackValue = String(fallback?.[key] ?? AI_PREFERENCE_DEFAULTS[key]);
    result[key] = options.includes(candidate)
      ? candidate
      : (options.includes(fallbackValue) ? fallbackValue : AI_PREFERENCE_DEFAULTS[key]);
  }
  return result;
}

function validateAIPreferences(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return 'AI preferences must be provided as an object.';
  }
  for (const key of ALLOWED) {
    if (value[key] === undefined) continue;
    if (BOOLEAN_KEYS.includes(key) && typeof value[key] !== 'boolean') {
      return 'AI preference "' + key + '" must be true or false.';
    }
    if (ENUMS[key] && !ENUMS[key].includes(String(value[key]))) {
      return 'AI preference "' + key + '" contains an unsupported value.';
    }
  }
  return '';
}

async function getIdentity(request, env, id) {
  if (!enforceSameOrigin(request)) {
    return { response: errorResponse(403, 'ORIGIN_REJECTED', 'Cross-origin settings requests are not permitted.', id) };
  }
  const auth = await verifyFirebaseIdToken(request, env);
  if (!auth.ok) return { response: auth.response };
  const uid = cleanUid(auth.user?.uid || auth.user?.sub);
  if (!uid || !auth.user?.email) {
    return { response: errorResponse(401, 'AUTH_IDENTITY_REQUIRED', 'A verified Firebase account is required.', id) };
  }
  return { user: auth.user, uid };
}

export async function onRequest(context) {
  const { request, env } = context;
  const id = requestId(request);
  try {
    const identity = await getIdentity(request, env, id);
    if (identity.response) return identity.response;
    const path = preferencePath(identity.uid);

    if (request.method === 'GET') {
      const stored = await getFirestoreDataAtPath(env, path) || {};
      return jsonResponse({
        ok: true,
        preferences: normalizeAIPreferences(stored.preferences),
        updatedAt: stored.updatedAt || null,
        authority: 'SERVER',
        scope: 'account'
      }, 200, {
        'X-OVYX-Request-ID': id,
        'Cache-Control': 'no-store, max-age=0'
      });
    }

    if (request.method !== 'PUT') {
      return errorResponse(405, 'METHOD_NOT_ALLOWED', 'GET or PUT is required.', id);
    }

    const body = await readJson(request, 16000);
    const incoming = body?.preferences || body?.ai || body;
    const validationError = validateAIPreferences(incoming);
    if (validationError) {
      return errorResponse(400, 'INVALID_AI_PREFERENCES', validationError, id);
    }

    const current = await getFirestoreDataAtPath(env, path) || {};
    const merged = { ...normalizeAIPreferences(current.preferences), ...incoming };
    const preferences = normalizeAIPreferences(merged);
    const updatedAt = new Date().toISOString();
    await setFirestoreDocumentAtPath(env, path, {
      preferences,
      ownerUid: identity.uid,
      updatedAt,
      updatedBy: identity.uid
    }, { merge: true });

    const saved = await getFirestoreDataAtPath(env, path);
    const verified = normalizeAIPreferences(saved?.preferences);
    if (!saved || Object.keys(preferences).some(key => verified[key] !== preferences[key])) {
      return errorResponse(503, 'AI_PREFERENCES_WRITE_UNCONFIRMED', 'The server could not verify that AI preferences were saved.', id);
    }

    return jsonResponse({
      ok: true,
      preferences: verified,
      updatedAt: saved.updatedAt || updatedAt,
      authority: 'SERVER',
      scope: 'account'
    }, 200, {
      'X-OVYX-Request-ID': id,
      'Cache-Control': 'no-store, max-age=0'
    });
  } catch (error) {
    return errorResponse(
      error?.status || 503,
      error?.code || 'AI_PREFERENCES_FAILED',
      error?.message || 'AI preferences could not be saved.',
      id
    );
  }
}
