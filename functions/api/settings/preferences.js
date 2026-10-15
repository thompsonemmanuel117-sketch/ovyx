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

const DEFAULTS = Object.freeze({
  profile: Object.freeze({ displayName: '', workspaceName: 'Creative Workspace' }),
  appearance: Object.freeze({
    mode: 'dark', density: 'balanced', scale: 'balanced', motion: 'full',
    typography: 'jetbrains', haptic: true
  }),
  workspace: Object.freeze({
    openBehavior: 'Web Studio', autosave: true, confirmDelete: true,
    inspector: true, livePreview: true, aiSafe: true, editorMode: 'Magic'
  }),
  ai: Object.freeze({
    mode: 'balanced', model: 'automatic', provider: 'automatic',
    explain: true, preserve: true, confirmDestructive: false,
    contextFiles: true, contextPage: true, contextGithub: true,
    routing: 'automatic', fallback: 'automatic',
    contextLimit: 'automatic', generationBudget: 'automatic'
  }),
  notifications: Object.freeze({
    projectActivity: true, generationCompleted: true, deploymentStatus: true,
    aiUsageWarnings: true, billing: true, emailProductUpdates: true,
    emailSecurityAlerts: true
  })
});

const ENUMS = Object.freeze({
  appearance: {
    mode: ['system', 'dark', 'light'],
    density: ['comfortable', 'balanced', 'compact'],
    scale: ['small', 'balanced', 'large'],
    motion: ['full', 'reduced', 'minimal'],
    typography: ['jetbrains', 'inter', 'fira']
  },
  workspace: {
    openBehavior: ['Web Studio', 'Last active view', 'Project overview'],
    editorMode: ['Magic', 'Advanced', 'Last used']
  },
  ai: {
    mode: ['balanced', 'fast', 'quality'],
    model: ['automatic', 'gemini', 'anthropic', 'deepseek', 'openai'],
    provider: ['automatic', 'gemini', 'anthropic', 'deepseek', 'openai'],
    routing: ['automatic', 'preferred', 'priority'],
    fallback: ['automatic', 'next-available', 'stop'],
    contextLimit: ['automatic', 'conservative', 'expanded'],
    generationBudget: ['automatic', 'efficient', 'maximum']
  }
});

const BOOLEAN_KEYS = Object.freeze({
  appearance: ['haptic'],
  workspace: ['autosave', 'confirmDelete', 'inspector', 'livePreview', 'aiSafe'],
  ai: ['explain', 'preserve', 'confirmDestructive', 'contextFiles', 'contextPage', 'contextGithub'],
  notifications: Object.keys(DEFAULTS.notifications)
});

function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeSettings(input, current = DEFAULTS) {
  const source = isRecord(input) ? input : {};
  const previous = isRecord(current) ? current : DEFAULTS;
  const out = {};

  const rawProfile = isRecord(source.profile) ? source.profile : {};
  const baseProfile = isRecord(previous.profile) ? previous.profile : DEFAULTS.profile;
  out.profile = {
    displayName: Object.prototype.hasOwnProperty.call(rawProfile, 'displayName')
      ? String(rawProfile.displayName ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 60)
      : String(baseProfile.displayName ?? '').slice(0, 60),
    workspaceName: Object.prototype.hasOwnProperty.call(rawProfile, 'workspaceName')
      ? (String(rawProfile.workspaceName ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 60) || 'Creative Workspace')
      : (String(baseProfile.workspaceName ?? '').slice(0, 60) || 'Creative Workspace')
  };

  for (const section of Object.keys(DEFAULTS).filter(key => key !== 'profile')) {
    const base = isRecord(previous[section]) ? previous[section] : DEFAULTS[section];
    const requested = isRecord(source[section]) ? source[section] : {};
    const sectionOut = { ...DEFAULTS[section], ...base };

    for (const [key, choices] of Object.entries(ENUMS[section] || {})) {
      if (!Object.prototype.hasOwnProperty.call(requested, key)) continue;
      const value = String(requested[key] ?? '');
      if (choices.includes(value)) sectionOut[key] = value;
    }

    for (const key of BOOLEAN_KEYS[section] || []) {
      if (Object.prototype.hasOwnProperty.call(requested, key)) {
        sectionOut[key] = requested[key] === true;
      }
    }

    // Unknown keys are intentionally dropped so connection credentials or arbitrary
    // client payloads cannot be stored as preferences.
    out[section] = sectionOut;
  }

  return out;
}

async function authenticatedIdentity(request, env, id) {
  if (!enforceSameOrigin(request)) {
    return { ok: false, response: errorResponse(403, 'ORIGIN_REJECTED', 'Cross-origin settings requests are not permitted.', id) };
  }
  const auth = await verifyFirebaseIdToken(request, env);
  if (!auth.ok) return { ok: false, response: auth.response };
  const uid = String(auth.user?.uid || auth.user?.sub || '').trim();
  if (!uid || !/^[A-Za-z0-9_-]{1,128}$/.test(uid)) {
    return { ok: false, response: errorResponse(401, 'AUTH_IDENTITY_REQUIRED', 'A verified OVYX account ID is required.', id) };
  }
  return { ok: true, uid };
}

export async function onRequestGet(context) {
  const id = requestId(context.request);
  try {
    const identity = await authenticatedIdentity(context.request, context.env, id);
    if (!identity.ok) return identity.response;
    const path = ['users', identity.uid, 'settings', 'preferences'];
    const stored = await getFirestoreDataAtPath(context.env, path) || {};
    return jsonResponse({
      ok: true,
      preferences: normalizeSettings(stored.preferences || {}),
      updatedAt: stored.updatedAt || null,
      scope: 'account',
      authority: 'SERVER'
    }, 200, { 'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store, max-age=0' });
  } catch (error) {
    return errorResponse(error?.status || 503, error?.code || 'SETTINGS_LOAD_FAILED', error?.message || 'Account settings could not be loaded.', id);
  }
}

export async function onRequestPut(context) {
  const id = requestId(context.request);
  try {
    const identity = await authenticatedIdentity(context.request, context.env, id);
    if (!identity.ok) return identity.response;
    const body = await readJson(context.request, 24_000);
    const path = ['users', identity.uid, 'settings', 'preferences'];
    const stored = await getFirestoreDataAtPath(context.env, path) || {};
    const patch = isRecord(body.preferences) ? body.preferences : body;
    const preferences = normalizeSettings(patch, normalizeSettings(stored.preferences || {}));
    const updatedAt = new Date().toISOString();
    await setFirestoreDocumentAtPath(context.env, path, {
      schemaVersion: 1,
      preferences,
      updatedAt,
      updatedBy: identity.uid
    }, { merge: true });
    return jsonResponse({
      ok: true,
      preferences,
      updatedAt,
      scope: 'account',
      authority: 'SERVER'
    }, 200, { 'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store, max-age=0' });
  } catch (error) {
    return errorResponse(error?.status || 500, error?.code || 'SETTINGS_SAVE_FAILED', error?.message || 'Account settings could not be saved.', id);
  }
}

export async function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  if (context.request.method === 'PUT') return onRequestPut(context);
  return errorResponse(405, 'METHOD_NOT_ALLOWED', 'GET or PUT is required.', requestId(context.request));
}
