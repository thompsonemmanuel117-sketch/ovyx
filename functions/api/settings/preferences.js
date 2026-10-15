import { verifyFirebaseIdToken } from '../_lib/auth.js';
import {
  getFirestoreDataAtPath,
  getFirestoreDocumentAtPath,
  setFirestoreDocumentAtPath
} from '../../_lib/firebase-admin.js';
import { errorResponse, jsonResponse, readJson, requestId, enforceSameOrigin } from '../_lib/http.js';

const SETTINGS_COLLECTION = 'users';
const MAX_BODY_BYTES = 24_000;
const DEFAULT_SETTINGS = Object.freeze({
  notifications: Object.freeze({
    projectActivity: true,
    generationCompleted: true,
    deploymentStatus: true,
    aiUsageWarnings: true,
    billing: true,
    emailProductUpdates: true,
    emailSecurityAlerts: true
  }),
  workspace: Object.freeze({
    openBehavior: 'Web Studio',
    autosave: true,
    confirmDelete: true,
    inspector: true,
    livePreview: true,
    aiSafe: true,
    editorMode: 'build',
    workspaceName: 'Creative Workspace'
  }),
  ai: Object.freeze({
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
    fallback: 'automatic',
    contextLimit: 'automatic',
    generationBudget: 'automatic'
  })
});
const BOOLEAN_KEYS = Object.freeze({
  notifications: ['projectActivity', 'generationCompleted', 'deploymentStatus', 'aiUsageWarnings', 'billing', 'emailProductUpdates', 'emailSecurityAlerts'],
  workspace: ['autosave', 'confirmDelete', 'inspector', 'livePreview', 'aiSafe'],
  ai: ['explain', 'preserve', 'confirmDestructive', 'contextFiles', 'contextPage', 'contextGithub']
});
const ENUM_KEYS = Object.freeze({
  workspace: {
    openBehavior: ['Web Studio', 'Last active view', 'Project overview'],
    editorMode: ['build', 'plan', 'ask', 'fix', 'last-used']
  },
  ai: {
    mode: ['balanced', 'fast', 'quality'],
    model: ['automatic', 'gemini', 'anthropic', 'deepseek', 'openai'],
    provider: ['automatic', 'gemini', 'anthropic', 'deepseek', 'openai', 'groq', 'openrouter'],
    routing: ['automatic', 'preferred-first', 'provider-priority'],
    fallback: ['automatic', 'next-available', 'stop'],
    contextLimit: ['automatic', 'conservative', 'expanded'],
    generationBudget: ['automatic', 'efficient', 'maximum']
  }
});
const ROOT_FORBIDDEN_KEYS = new Set(['uid', 'email', 'role', 'owner', 'admin', 'token', 'accessToken', 'secret', 'password']);

function clean(value, max = 180) {
  return String(value ?? '').trim().slice(0, max);
}

function responseError(error, id) {
  return errorResponse(
    error?.status || 500,
    error?.code || 'SETTINGS_PREFERENCES_FAILED',
    error?.message || 'Settings could not be saved.',
    id
  );
}

function normalizeScope(scope, input, { strict = true } = {}) {
  if (!Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, scope)) {
    throw Object.assign(new Error('Choose a supported Settings category.'), { status: 400, code: 'SETTINGS_SCOPE_INVALID' });
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw Object.assign(new Error('Settings must be sent as an object.'), { status: 400, code: 'SETTINGS_OBJECT_REQUIRED' });
  }
  const result = {};
  const allowed = new Set([
    ...(BOOLEAN_KEYS[scope] || []),
    ...Object.keys(ENUM_KEYS[scope] || {}),
    ...(scope === 'workspace' ? ['workspaceName'] : [])
  ]);
  for (const [key, value] of Object.entries(input)) {
    if (ROOT_FORBIDDEN_KEYS.has(key) || !allowed.has(key)) {
      if (strict) throw Object.assign(new Error('This Settings field is not supported.'), { status: 400, code: 'SETTINGS_FIELD_NOT_ALLOWED' });
      continue;
    }
    if (scope === 'workspace' && key === 'workspaceName') {
      const name = String(value ?? '').replace(/[\\u0000-\\u001F\\u007F]/g, '').trim();
      if (!name || name.length > 60) {
        if (strict) throw Object.assign(new Error('Workspace name must be between 1 and 60 characters.'), { status: 400, code: 'SETTINGS_VALUE_INVALID' });
        continue;
      }
      result[key] = name;
      continue;
    }
    if ((BOOLEAN_KEYS[scope] || []).includes(key)) {
      if (typeof value !== 'boolean') {
        if (strict) throw Object.assign(new Error('Setting ' + key + ' must be true or false.'), { status: 400, code: 'SETTINGS_VALUE_INVALID' });
        continue;
      }
      result[key] = value;
      continue;
    }
    const choices = ENUM_KEYS[scope]?.[key] || [];
    if (!choices.includes(value)) {
      if (strict) throw Object.assign(new Error('Choose a valid value for ' + key + '.'), { status: 400, code: 'SETTINGS_VALUE_INVALID' });
      continue;
    }
    result[key] = value;
  }
  return result;
}

export function normalizeUserSettings(value = {}) {
  const settings = {};
  for (const scope of Object.keys(DEFAULT_SETTINGS)) {
    const saved = value && typeof value === 'object' && value[scope] && typeof value[scope] === 'object'
      ? value[scope] : {};
    settings[scope] = {
      ...DEFAULT_SETTINGS[scope],
      ...normalizeScope(scope, saved, { strict: false })
    };
  }
  return settings;
}

export { DEFAULT_SETTINGS as USER_SETTINGS_DEFAULTS, normalizeScope as normalizeUserSettingsScope };

async function authenticate(request, env, id) {
  if (!enforceSameOrigin(request)) {
    return { response: errorResponse(403, 'ORIGIN_REJECTED', 'Cross-origin Settings requests are not permitted.', id) };
  }
  const auth = await verifyFirebaseIdToken(request, env);
  if (!auth.ok) return { response: auth.response };
  const uid = clean(auth.user?.uid || auth.user?.sub, 180);
  if (!uid) return { response: errorResponse(401, 'AUTH_IDENTITY_REQUIRED', 'A verified account identity is required.', id) };
  return { user: auth.user, uid };
}

export async function onRequestGet(context) {
  const id = requestId(context.request);
  try {
    const auth = await authenticate(context.request, context.env, id);
    if (auth.response) return auth.response;
    const path = [SETTINGS_COLLECTION, auth.uid, 'settings', 'preferences'];
    const stored = await getFirestoreDataAtPath(context.env, path) || {};
    return jsonResponse({
      ok: true,
      settings: normalizeUserSettings(stored),
      updatedAt: stored.updatedAt || null,
      savedScopes: Object.keys(DEFAULT_SETTINGS).filter(scope => Object.prototype.hasOwnProperty.call(stored, scope)),
      scope: 'account',
      authority: 'SERVER'
    }, 200, { 'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store, max-age=0' });
  } catch (error) {
    return responseError(error, id);
  }
}

export async function onRequestPut(context) {
  const id = requestId(context.request);
  try {
    const auth = await authenticate(context.request, context.env, id);
    if (auth.response) return auth.response;
    const body = await readJson(context.request, MAX_BODY_BYTES);
    const scope = clean(body?.scope, 40);
    const patch = normalizeScope(scope, body?.settings);
    if (!Object.keys(patch).length) {
      return errorResponse(400, 'SETTINGS_PATCH_EMPTY', 'Choose at least one supported setting to save.', id);
    }
    const path = [SETTINGS_COLLECTION, auth.uid, 'settings', 'preferences'];
    const updatedAt = new Date().toISOString();
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const currentDocument = await getFirestoreDocumentAtPath(context.env, path);
      const currentData = await getFirestoreDataAtPath(context.env, path) || {};
      const priorScope = normalizeUserSettings(currentData)[scope];
      const updatedScope = { ...priorScope, ...patch };
      try {
        await setFirestoreDocumentAtPath(context.env, path, {
          [scope]: updatedScope,
          updatedAt,
          updatedBy: auth.uid
        }, { merge: true, expectedUpdateTime: currentDocument?.updateTime || null });
        const saved = await getFirestoreDataAtPath(context.env, path) || {};
        return jsonResponse({
          ok: true,
          scope,
          settings: normalizeUserSettings(saved),
          updatedAt: saved.updatedAt || updatedAt,
          authority: 'SERVER',
          persisted: true
        }, 200, { 'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store, max-age=0' });
      } catch (error) {
        if (error?.status === 409 || error?.code === 'FIRESTORE_PRECONDITION_FAILED') {
          if (attempt < 3) continue;
          throw Object.assign(new Error('Settings changed at the same time in another session. Reload Settings and retry.'), {
            status: 409, code: 'SETTINGS_WRITE_CONFLICT'
          });
        }
        throw error;
      }
    }
    throw Object.assign(new Error('Settings could not be saved safely.'), { status: 503, code: 'SETTINGS_WRITE_FAILED' });
  } catch (error) {
    return responseError(error, id);
  }
}

export async function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  if (context.request.method === 'PUT') return onRequestPut(context);
  return errorResponse(405, 'METHOD_NOT_ALLOWED', 'GET or PUT is required.', requestId(context.request));
}
