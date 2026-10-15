import { verifyFirebaseIdToken } from '../_lib/auth.js';
import {
  getFirestoreDataAtPath,
  setFirestoreDocumentAtPath
} from '../../_lib/firebase-admin.js';
import {
  errorResponse,
  jsonResponse,
  readJson,
  requestId
} from '../_lib/http.js';

const MAX_BODY_BYTES = 100_000;
const USER_PREFS_PATH = uid => ['users', uid, 'settings', 'preferences'];
const clean = (value, max = 200) => String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max);
const isRecord = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const bool = value => typeof value === 'boolean' ? value : undefined;
const COLOR_KEYS = ['accentColor', 'backgroundColor', 'sidebarColor', 'cardColor', 'borderColor', 'textColor', 'mutedColor'];
const THEME_KEYS = ['bg', 'panel', 'elev', 'text', 'secondary', 'muted', 'accent'];

function normalizeAppearance(value) {
  if (!isRecord(value)) return null;
  const out = {};
  if (['dark', 'light', 'system'].includes(value.mode)) out.mode = value.mode;
  for (const key of COLOR_KEYS) {
    const color = String(value[key] || '').trim();
    if (/^#[0-9a-fA-F]{6}$/.test(color)) out[key] = color.toUpperCase();
  }
  for (const key of ['density', 'scale', 'motion']) {
    const allowed = key === 'density' ? ['comfortable', 'balanced', 'compact']
      : key === 'scale' ? ['small', 'balanced', 'large']
      : ['full', 'reduced', 'minimal'];
    if (allowed.includes(value[key])) out[key] = value[key];
  }
  return out;
}

function normalizeTheme(value) {
  if (!isRecord(value)) return null;
  const out = { name: clean(value.name || 'OVYX Theme', 60) || 'OVYX Theme' };
  for (const key of THEME_KEYS) {
    const color = String(value[key] || '').trim();
    if (/^#[0-9a-fA-F]{6}$/.test(color)) out[key] = color.toUpperCase();
  }
  return out;
}

function normalizeThemeLab(value) {
  if (!isRecord(value)) return null;
  const out = {};
  if (typeof value.active === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value.active)) out.active = value.active;
  const custom = normalizeTheme(value.custom);
  if (custom) out.custom = custom;
  const customThemes = {};
  if (isRecord(value.customThemes)) {
    for (const [key, raw] of Object.entries(value.customThemes).slice(0, 30)) {
      if (!/^[A-Za-z0-9_-]{1,100}$/.test(key)) continue;
      const theme = normalizeTheme(raw);
      if (theme) customThemes[key] = theme;
    }
  }
  out.customThemes = customThemes;
  return out;
}

function normalizeWorkspace(value) {
  if (!isRecord(value)) return null;
  const out = {};
  if (['Web Studio', 'Last active view', 'Project overview'].includes(value.openBehavior)) out.openBehavior = value.openBehavior;
  const editorMode = value.editorMode === 'Magic' ? 'build' : value.editorMode === 'Advanced' ? 'last-used' : value.editorMode;
  if (['build', 'plan', 'ask', 'fix', 'last-used'].includes(editorMode)) out.editorMode = editorMode;
  for (const key of ['autosave', 'confirmDelete', 'inspector', 'livePreview', 'aiSafe']) {
    const val = bool(value[key]);
    if (val !== undefined) out[key] = val;
  }
  return out;
}

function normalizeAI(value) {
  if (!isRecord(value)) return null;
  const out = {};
  if (['balanced', 'fast', 'quality'].includes(value.mode)) out.mode = value.mode;
  if (['automatic', 'gemini', 'anthropic', 'claude', 'deepseek', 'openai', 'groq', 'openrouter'].includes(String(value.provider || '').toLowerCase())) out.provider = String(value.provider).toLowerCase();
  if (['automatic', 'gemini', 'anthropic', 'claude', 'deepseek', 'openai', 'groq', 'openrouter'].includes(String(value.model || '').toLowerCase())) out.model = String(value.model).toLowerCase();
  if (['automatic', 'preferred'].includes(value.routing)) out.routing = value.routing;
  if (['automatic', 'stop'].includes(value.fallback)) out.fallback = value.fallback;
  if (['automatic', 'conservative', 'expanded'].includes(value.contextLimit)) out.contextLimit = value.contextLimit;
  if (['automatic', 'efficient', 'maximum'].includes(value.generationBudget)) out.generationBudget = value.generationBudget;
  for (const key of ['explain', 'preserve', 'confirmDestructive', 'contextFiles', 'contextPage', 'contextGithub']) {
    const val = bool(value[key]);
    if (val !== undefined) out[key] = val;
  }
  return out;
}

function normalizeProfile(value) {
  if (!isRecord(value)) return null;
  const out = {};
  const displayName = clean(value.displayName, 60);
  const workspaceName = clean(value.workspaceName, 60);
  if (displayName) out.displayName = displayName;
  if (workspaceName) out.workspaceName = workspaceName;
  return out;
}

function normalizeNotifications(value) {
  if (!isRecord(value)) return null;
  const out = {};
  for (const key of ['projectActivity', 'generationCompleted', 'deploymentStatus', 'aiUsageWarnings', 'billing', 'emailProductUpdates', 'emailSecurityAlerts']) {
    const val = bool(value[key]);
    if (val !== undefined) out[key] = val;
  }
  return out;
}

export function sanitizeSettingsPreferences(value) {
  if (!isRecord(value)) {
    throw Object.assign(new Error('Settings preferences must be a JSON object.'), { status: 400, code: 'INVALID_SETTINGS_PREFERENCES' });
  }
  const out = {};
  const normalizers = {
    appearance: normalizeAppearance,
    themeLab: normalizeThemeLab,
    workspace: normalizeWorkspace,
    profile: normalizeProfile,
    ai: normalizeAI,
    notifications: normalizeNotifications
  };
  for (const [key, normalize] of Object.entries(normalizers)) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const normalized = normalize(value[key]);
    if (normalized !== null) out[key] = normalized;
  }
  if (!Object.keys(out).length) {
    throw Object.assign(new Error('At least one supported Settings category is required.'), { status: 400, code: 'SETTINGS_NAMESPACE_REQUIRED' });
  }
  const serialized = JSON.stringify(out);
  if (serialized.length > MAX_BODY_BYTES - 5000) {
    throw Object.assign(new Error('Settings preferences exceed the allowed size.'), { status: 413, code: 'SETTINGS_PREFERENCES_TOO_LARGE' });
  }
  return out;
}

async function authenticatedUser(request, env) {
  const auth = await verifyFirebaseIdToken(request, env);
  if (!auth.ok) return auth;
  const uid = clean(auth.user?.uid || auth.user?.sub, 180);
  if (!uid) {
    return {
      ok: false,
      response: errorResponse(401, 'AUTH_IDENTITY_REQUIRED', 'A verified account identity is required.')
    };
  }
  return { ok: true, user: { ...auth.user, uid } };
}

export async function onRequestGet(context) {
  const id = requestId(context.request);
  try {
    const auth = await authenticatedUser(context.request, context.env);
    if (!auth.ok) return auth.response;
    const stored = await getFirestoreDataAtPath(context.env, USER_PREFS_PATH(auth.user.uid));
    const preferences = isRecord(stored?.preferences) ? stored.preferences : {};
    return jsonResponse({
      ok: true,
      found: Boolean(stored && isRecord(stored.preferences)),
      preferences,
      updatedAt: stored?.updatedAt || null,
      scope: 'account',
      authority: 'SERVER'
    }, 200, { 'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store, max-age=0' });
  } catch (error) {
    return errorResponse(error?.status || 503, error?.code || 'SETTINGS_PREFERENCES_UNAVAILABLE', 'Account Settings could not be loaded from OVYX.', id);
  }
}

export async function onRequestPut(context) {
  const id = requestId(context.request);
  try {
    const auth = await authenticatedUser(context.request, context.env);
    if (!auth.ok) return auth.response;
    const body = await readJson(context.request, MAX_BODY_BYTES);
    const preferences = sanitizeSettingsPreferences(body?.preferences);
    const existing = await getFirestoreDataAtPath(context.env, USER_PREFS_PATH(auth.user.uid)) || {};
    const merged = { ...(isRecord(existing.preferences) ? existing.preferences : {}), ...preferences };
    const updatedAt = new Date().toISOString();
    await setFirestoreDocumentAtPath(context.env, USER_PREFS_PATH(auth.user.uid), {
      version: 1,
      preferences: merged,
      updatedAt,
      updatedBy: auth.user.uid
    }, { merge: true });
    return jsonResponse({
      ok: true,
      preferences: merged,
      updatedAt,
      scope: 'account',
      authority: 'SERVER'
    }, 200, { 'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store, max-age=0' });
  } catch (error) {
    return errorResponse(error?.status || 500, error?.code || 'SETTINGS_PREFERENCES_SAVE_FAILED', error?.message || 'Account Settings could not be saved.', id);
  }
}

export async function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  if (context.request.method === 'PUT') return onRequestPut(context);
  return errorResponse(405, 'METHOD_NOT_ALLOWED', 'GET or PUT is required.', requestId(context.request));
}
