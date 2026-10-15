import { verifyFirebaseIdToken } from '../_lib/auth.js';
import {
  getFirestoreDocumentAtPath,
  getFirestoreDataAtPath,
  setFirestoreDocumentAtPath
} from '../../_lib/firebase-admin.js';
import {
  errorResponse,
  jsonResponse,
  readJson,
  requestId,
  enforceSameOrigin
} from '../_lib/http.js';

const MAX_BODY_BYTES = 24_000;
const SECTIONS = new Set(['notifications', 'workspace', 'ai']);
const NOTIFICATION_DEFAULTS = Object.freeze({
  projectActivity: true,
  generationCompleted: true,
  deploymentStatus: true,
  aiUsageWarnings: true,
  billing: true,
  emailProductUpdates: true,
  emailSecurityAlerts: true
});
const WORKSPACE_DEFAULTS = Object.freeze({
  openBehavior: 'Web Studio',
  editorMode: 'Magic',
  autosave: true,
  confirmDelete: true,
  inspector: true,
  livePreview: true,
  aiSafe: true,
  projectSync: true
});
const AI_DEFAULTS = Object.freeze({
  mode: 'balanced',
  model: 'automatic',
  provider: 'gemini',
  explain: true,
  preserve: true,
  confirmDestructive: false,
  contextFiles: true,
  contextPage: true,
  contextGithub: true,
  routing: 'Automatic',
  fallback: 'Automatic',
  contextLimit: 'Automatic',
  budget: 'Automatic'
});
const DEFAULTS = Object.freeze({
  notifications: NOTIFICATION_DEFAULTS,
  workspace: WORKSPACE_DEFAULTS,
  ai: AI_DEFAULTS
});

function clean(value, max = 160) {
  return String(value ?? '').trim().slice(0, max);
}
function identity(user) {
  const uid = clean(user?.uid || user?.sub, 180);
  const email = clean(user?.email, 320).toLowerCase();
  if (!uid || !email) throw Object.assign(new Error('A verified OVYX account is required.'), { status: 401, code: 'AUTH_IDENTITY_REQUIRED' });
  return { uid, email };
}
function sanitizeSection(section, incoming = {}, existing = {}) {
  const source = { ...(DEFAULTS[section] || {}), ...(existing && typeof existing === 'object' ? existing : {}), ...(incoming && typeof incoming === 'object' && !Array.isArray(incoming) ? incoming : {}) };
  if (section === 'notifications') {
    return Object.fromEntries(Object.keys(NOTIFICATION_DEFAULTS).map(key => [key, typeof source[key] === 'boolean' ? source[key] : NOTIFICATION_DEFAULTS[key]]));
  }
  if (section === 'workspace') {
    const openBehavior = ['Web Studio', 'Last active view', 'Project overview'].includes(source.openBehavior) ? source.openBehavior : WORKSPACE_DEFAULTS.openBehavior;
    const editorMode = ['Magic', 'Advanced', 'Last used'].includes(source.editorMode) ? source.editorMode : WORKSPACE_DEFAULTS.editorMode;
    const result = { openBehavior, editorMode };
    for (const key of ['autosave', 'confirmDelete', 'inspector', 'livePreview', 'aiSafe', 'projectSync']) {
      result[key] = typeof source[key] === 'boolean' ? source[key] : WORKSPACE_DEFAULTS[key];
    }
    return result;
  }
  if (section === 'ai') {
    const result = {
      mode: ['balanced', 'fast', 'quality'].includes(source.mode) ? source.mode : AI_DEFAULTS.mode,
      model: ['automatic', 'gemini', 'anthropic', 'deepseek', 'openai'].includes(source.model) ? source.model : AI_DEFAULTS.model,
      provider: ['automatic', 'gemini', 'anthropic', 'deepseek', 'openai'].includes(source.provider) ? source.provider : AI_DEFAULTS.provider,
      routing: ['Automatic', 'Preferred model first', 'Provider priority'].includes(source.routing) ? source.routing : AI_DEFAULTS.routing,
      fallback: ['Automatic', 'Next available provider', 'Stop and notify me'].includes(source.fallback) ? source.fallback : AI_DEFAULTS.fallback,
      contextLimit: ['Automatic', 'Conservative', 'Expanded'].includes(source.contextLimit) ? source.contextLimit : AI_DEFAULTS.contextLimit,
      budget: ['Automatic', 'Efficient', 'Maximum'].includes(source.budget) ? source.budget : AI_DEFAULTS.budget
    };
    for (const key of ['explain', 'preserve', 'confirmDestructive', 'contextFiles', 'contextPage', 'contextGithub']) {
      result[key] = typeof source[key] === 'boolean' ? source[key] : AI_DEFAULTS[key];
    }
    return result;
  }
  return {};
}
function normalizeSaved(value = {}) {
  return Object.fromEntries([...SECTIONS].map(section => [
    section,
    sanitizeSection(section, value[section], {})
  ]));
}

async function requireIdentity(request, env, id) {
  if (!enforceSameOrigin(request)) return { response: errorResponse(403, 'ORIGIN_REJECTED', 'Cross-origin settings requests are not permitted.', id) };
  const auth = await verifyFirebaseIdToken(request, env);
  if (!auth.ok) return { response: auth.response };
  try { return { identity: identity(auth.user) }; }
  catch (error) { return { response: errorResponse(error.status || 401, error.code || 'AUTH_IDENTITY_REQUIRED', error.message, id) }; }
}
const settingsPath = uid => ['users', uid, 'settings', 'preferences'];

export async function onRequestGet(context) {
  const id = requestId(context.request);
  try {
    const auth = await requireIdentity(context.request, context.env, id);
    if (auth.response) return auth.response;
    const path = settingsPath(auth.identity.uid);
    const saved = await getFirestoreDataAtPath(context.env, path) || {};
    const preferences = normalizeSaved(saved);
    return jsonResponse({
      ok: true,
      preferences,
      updatedAt: saved.updatedAt || null,
      authority: 'SERVER'
    }, 200, { 'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store, max-age=0' });
  } catch (error) {
    return errorResponse(error?.status || 503, error?.code || 'SETTINGS_PREFERENCES_UNAVAILABLE', 'Settings preferences could not be loaded from the server.', id);
  }
}

export async function onRequestPut(context) {
  const id = requestId(context.request);
  try {
    const auth = await requireIdentity(context.request, context.env, id);
    if (auth.response) return auth.response;
    const body = await readJson(context.request, MAX_BODY_BYTES);
    const section = clean(body.section, 40).toLowerCase();
    if (!SECTIONS.has(section)) return errorResponse(400, 'SETTINGS_SECTION_INVALID', 'Choose notifications, workspace or ai preferences.', id);
    const path = settingsPath(auth.identity.uid);
    let saved;
    let merged;
    let updatedAt = new Date().toISOString();
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const currentDoc = await getFirestoreDocumentAtPath(context.env, path);
      saved = currentDoc ? (await getFirestoreDataAtPath(context.env, path) || {}) : {};
      merged = normalizeSaved(saved);
      merged[section] = sanitizeSection(section, body.preferences, saved[section]);
      const fields = {
        ...merged,
        updatedAt,
        updatedBy: { uid: auth.identity.uid, email: auth.identity.email }
      };
      try {
        await setFirestoreDocumentAtPath(context.env, path, fields, {
          merge: true,
          expectedUpdateTime: currentDoc?.updateTime || null
        });
        const confirmed = await getFirestoreDataAtPath(context.env, path) || fields;
        return jsonResponse({
          ok: true,
          section,
          preferences: normalizeSaved(confirmed),
          updatedAt: confirmed.updatedAt || updatedAt,
          authority: 'SERVER'
        }, 200, { 'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store, max-age=0' });
      } catch (error) {
        if (error?.status === 409 || error?.code === 'FIRESTORE_PRECONDITION_FAILED') continue;
        throw error;
      }
    }
    throw Object.assign(new Error('Settings changed concurrently. Reload and retry.'), { status: 409, code: 'SETTINGS_WRITE_CONFLICT' });
  } catch (error) {
    return errorResponse(error?.status || 500, error?.code || 'SETTINGS_PREFERENCES_SAVE_FAILED', error?.message || 'Settings preferences could not be saved.', id);
  }
}

export async function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  if (context.request.method === 'PUT') return onRequestPut(context);
  return errorResponse(405, 'METHOD_NOT_ALLOWED', 'GET or PUT is required.', requestId(context.request));
}
