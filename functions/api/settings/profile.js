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

const DEFAULTS = Object.freeze({ displayName: '', workspaceName: 'Creative Workspace' });
const PROFILE_PATH = uid => ['users', uid, 'settings', 'profile'];

function cleanText(value, max = 60) {
  return String(value ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max);
}

function normalizeProfile(input = {}, fallbackName = '') {
  return {
    displayName: cleanText(input.displayName || fallbackName, 60) || cleanText(fallbackName, 60),
    workspaceName: cleanText(input.workspaceName || DEFAULTS.workspaceName, 60) || DEFAULTS.workspaceName
  };
}

async function getIdentity(request, env, id) {
  if (!enforceSameOrigin(request)) {
    return { response: errorResponse(403, 'ORIGIN_REJECTED', 'Cross-origin settings requests are not permitted.', id) };
  }
  const auth = await verifyFirebaseIdToken(request, env);
  if (!auth.ok) return { response: auth.response };
  const uid = cleanText(auth.user?.uid || auth.user?.sub, 180);
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
    const path = PROFILE_PATH(identity.uid);

    if (request.method === 'GET') {
      const stored = await getFirestoreDataAtPath(env, path) || {};
      const profile = normalizeProfile(stored, identity.user.displayName || '');
      return jsonResponse({
        ok: true,
        profile,
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

    const body = await readJson(request, 12000);
    const incoming = body?.profile || body;
    if (!String(incoming?.displayName || '').trim()) {
      return errorResponse(400, 'PROFILE_NAME_REQUIRED', 'Display name cannot be empty.', id);
    }
    const profile = normalizeProfile(incoming, identity.user.displayName || '');
    if (!profile.displayName) {
      return errorResponse(400, 'PROFILE_NAME_REQUIRED', 'Display name cannot be empty.', id);
    }

    const updatedAt = new Date().toISOString();
    await setFirestoreDocumentAtPath(env, path, {
      ...profile,
      ownerUid: identity.uid,
      updatedAt,
      updatedBy: identity.uid
    }, { merge: true });

    const saved = await getFirestoreDataAtPath(env, path);
    if (!saved || saved.displayName !== profile.displayName || saved.workspaceName !== profile.workspaceName) {
      return errorResponse(503, 'PROFILE_WRITE_UNCONFIRMED', 'The server could not verify that the profile changes were saved.', id);
    }

    return jsonResponse({
      ok: true,
      profile: normalizeProfile(saved, identity.user.displayName || ''),
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
      error?.code || 'PROFILE_SETTINGS_FAILED',
      error?.message || 'Account profile settings could not be updated.',
      id
    );
  }
}
