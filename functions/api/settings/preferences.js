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

export const NOTIFICATION_DEFAULTS = Object.freeze({
  projectActivity: true,
  generationCompleted: true,
  deploymentStatus: true,
  aiUsageWarnings: true,
  billing: true,
  emailProductUpdates: true,
  emailSecurityAlerts: true
});
const ALLOWED_KEYS = new Set(Object.keys(NOTIFICATION_DEFAULTS));
const preferencePath = uid => ['users', uid, 'settings', 'preferences'];

function cleanUid(value) {
  return String(value || '').trim().slice(0, 180);
}

export function normalizeNotificationPreferences(value = {}, fallback = NOTIFICATION_DEFAULTS) {
  const result = {};
  for (const key of ALLOWED_KEYS) {
    result[key] = typeof value?.[key] === 'boolean'
      ? value[key]
      : Boolean(fallback?.[key] ?? NOTIFICATION_DEFAULTS[key]);
  }
  return result;
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
      const saved = await getFirestoreDataAtPath(env, path) || {};
      return jsonResponse({
        ok: true,
        notifications: normalizeNotificationPreferences(saved.notifications),
        updatedAt: saved.updatedAt || null,
        authority: 'SERVER',
        scope: 'account',
        emailDelivery: 'preference-only'
      }, 200, {
        'X-OVYX-Request-ID': id,
        'Cache-Control': 'no-store, max-age=0'
      });
    }

    if (request.method !== 'PUT') {
      return errorResponse(405, 'METHOD_NOT_ALLOWED', 'GET or PUT is required.', id);
    }

    const body = await readJson(request, 12000);
    const incoming = body?.notifications || body?.preferences || body;
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
      return errorResponse(400, 'NOTIFICATION_PREFERENCES_REQUIRED', 'Notification preferences are required.', id);
    }
    for (const key of ALLOWED_KEYS) {
      if (incoming[key] !== undefined && typeof incoming[key] !== 'boolean') {
        return errorResponse(400, 'INVALID_NOTIFICATION_PREFERENCE', 'Every notification preference must be true or false.', id);
      }
    }
    const current = await getFirestoreDataAtPath(env, path) || {};
    const notifications = normalizeNotificationPreferences(incoming, current.notifications);
    const updatedAt = new Date().toISOString();

    await setFirestoreDocumentAtPath(env, path, {
      notifications,
      updatedAt,
      updatedBy: identity.uid
    }, { merge: true });

    const saved = await getFirestoreDataAtPath(env, path);
    const verified = normalizeNotificationPreferences(saved?.notifications);
    if (!saved || Object.keys(notifications).some(key => verified[key] !== notifications[key])) {
      return errorResponse(503, 'PREFERENCES_WRITE_UNCONFIRMED', 'The server could not verify that notification preferences were saved.', id);
    }

    return jsonResponse({
      ok: true,
      notifications: verified,
      updatedAt: saved.updatedAt || updatedAt,
      authority: 'SERVER',
      scope: 'account',
      emailDelivery: 'preference-only'
    }, 200, {
      'X-OVYX-Request-ID': id,
      'Cache-Control': 'no-store, max-age=0'
    });
  } catch (error) {
    return errorResponse(
      error?.status || 503,
      error?.code || 'NOTIFICATION_PREFERENCES_FAILED',
      error?.message || 'Notification preferences could not be saved.',
      id
    );
  }
}
