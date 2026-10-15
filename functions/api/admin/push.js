import { verifyFirebaseIdToken, normalizeEmail } from '../_lib/auth.js';
import {
  getFirestoreData,
  listFirestoreDocuments,
  setFirestoreDocument,
} from '../../_lib/firebase-admin.js';
import {
  ADMIN_PUSH_COLLECTION,
  ADMIN_PUSH_SETTINGS,
  adminPushSubscriptionId,
  getAdminPushConfiguration,
  normalizeAdminPushPreferences,
  sendAdminPushNotification,
  validateAdminPushEndpoint,
} from '../_lib/admin-push.js';
import {
  enforceSameOrigin,
  errorResponse,
  jsonResponse,
  readJson,
  requestId,
} from '../_lib/http.js';

const ROOT_EMAIL = 'ovyxsupportteam@gmail.com';
const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);

async function requireRoot(request, env, id) {
  if (!enforceSameOrigin(request)) {
    return { response: errorResponse(403, 'ORIGIN_REJECTED', 'Cross-origin admin requests are not permitted.', id) };
  }
  const auth = await verifyFirebaseIdToken(request, env);
  if (!auth.ok) return { response: auth.response };
  if (normalizeEmail(auth.user.email) !== ROOT_EMAIL || auth.user.emailVerified !== true) {
    return { response: errorResponse(403, 'ROOT_REQUIRED', 'Verified root administrator access is required.', id) };
  }
  return { user: auth.user };
}

async function loadSubscriptions(env, uid) {
  const result = await listFirestoreDocuments(env, ADMIN_PUSH_COLLECTION, 1000);
  return (result.documents || []).filter(row =>
    row.active === true && String(row.ownerUid || '') === String(uid || '')
  );
}

async function onRequestGet(context) {
  const id = requestId(context.request);
  try {
    const auth = await requireRoot(context.request, context.env, id);
    if (auth.response) return auth.response;
    const [pushConfig, settings, subscriptions] = await Promise.all([
      Promise.resolve(getAdminPushConfiguration(context.env)),
      getFirestoreData(context.env, 'system', 'admin_push'),
      loadSubscriptions(context.env, auth.user.uid),
    ]);
    return jsonResponse({
      ok: true,
      authority: 'SERVER',
      vapidConfigured: pushConfig.configured,
      vapidPublicKey: pushConfig.configured ? pushConfig.publicKey : null,
      vapidReason: pushConfig.reason,
      activeDeviceCount: subscriptions.length,
      preferences: normalizeAdminPushPreferences(settings?.preferences || {}),
      checkedAt: new Date().toISOString(),
    }, 200, { 'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store, max-age=0' });
  } catch (error) {
    return errorResponse(error?.status || 503, error?.code || 'ADMIN_PUSH_READ_FAILED', 'Admin push settings could not be loaded.', id);
  }
}

function validateSubscription(subscription) {
  const endpoint = validateAdminPushEndpoint(subscription?.endpoint);
  const keys = subscription?.keys || {};
  const p256dh = clean(keys.p256dh, 200);
  const auth = clean(keys.auth, 120);
  if (!endpoint) return null;
  if (!/^[A-Za-z0-9_-]{80,100}$/.test(p256dh)) return null;
  if (!/^[A-Za-z0-9_-]{20,50}$/.test(auth)) return null;
  // Canonical Web Push encodings are unpadded base64url; malformed or oversized keys are refused.
  try {
    const decode = value => {
      const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
      const binary = atob(padded);
      return new Uint8Array([...binary].map(char => char.charCodeAt(0)));
    };
    const publicKey = decode(p256dh);
    const authKey = decode(auth);
    if (publicKey.length !== 65 || publicKey[0] !== 4 || authKey.length < 16 || authKey.length > 32) return null;
  } catch {
    return null;
  }
  return { endpoint, keys: { p256dh, auth } };
}

async function onRequestPost(context) {
  const id = requestId(context.request);
  try {
    const auth = await requireRoot(context.request, context.env, id);
    if (auth.response) return auth.response;
    const payload = await readJson(context.request, 12000);
    const action = clean(payload.action, 40).toLowerCase();
    const env = context.env;
    const uid = String(auth.user.uid || '').slice(0, 160);
    const email = normalizeEmail(auth.user.email);
    const now = new Date().toISOString();

    if (action === 'subscribe') {
      const pushConfig = getAdminPushConfiguration(env);
      if (!pushConfig.configured || !pushConfig.publicKey) {
        return errorResponse(503, 'VAPID_NOT_CONFIGURED', 'Push notifications are not configured. Add OVYX_VAPID_PUBLIC_KEY and OVYX_VAPID_PRIVATE_KEY to the Cloudflare Pages secrets before subscribing.', id);
      }
      const subscription = validateSubscription(payload.subscription);
      if (!subscription) return errorResponse(400, 'PUSH_SUBSCRIPTION_INVALID', 'The browser returned an invalid or unsupported push subscription.', id);
      const subscriptionId = await adminPushSubscriptionId(subscription.endpoint);
      const existing = await getFirestoreData(env, ADMIN_PUSH_COLLECTION, subscriptionId);
      await setFirestoreDocument(env, ADMIN_PUSH_COLLECTION, subscriptionId, {
        id: subscriptionId,
        endpoint: subscription.endpoint,
        keys: subscription.keys,
        ownerUid: uid,
        ownerEmail: email,
        active: true,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        inactiveReason: null,
      }, { merge: true });
      const subscriptions = await loadSubscriptions(env, uid);
      return jsonResponse({
        ok: true,
        action,
        activeDeviceCount: subscriptions.length,
        subscribed: true,
        updatedAt: now,
      }, 200, { 'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store, max-age=0' });
    }

    if (action === 'unsubscribe') {
      const endpointInput = clean(payload.endpoint, 2048);
      if (endpointInput) {
        const endpoint = validateAdminPushEndpoint(endpointInput);
        if (!endpoint) return errorResponse(400, 'PUSH_ENDPOINT_INVALID', 'The push endpoint is invalid.', id);
        const subscriptionId = await adminPushSubscriptionId(endpoint);
        const existing = await getFirestoreData(env, ADMIN_PUSH_COLLECTION, subscriptionId);
        if (!existing || String(existing.ownerUid || '') !== uid) {
          return errorResponse(404, 'PUSH_SUBSCRIPTION_NOT_FOUND', 'This device subscription was not found for the signed-in owner.', id);
        }
        await setFirestoreDocument(env, ADMIN_PUSH_COLLECTION, subscriptionId, {
          active: false, updatedAt: now, inactiveReason: 'owner_unsubscribed'
        }, { merge: true });
      } else {
        const rows = await listFirestoreDocuments(env, ADMIN_PUSH_COLLECTION, 1000);
        const owned = (rows.documents || []).filter(row => row.active === true && String(row.ownerUid || '') === uid);
        await Promise.all(owned.map(row => setFirestoreDocument(env, ADMIN_PUSH_COLLECTION, String(row.id), {
          active: false, updatedAt: now, inactiveReason: 'owner_unsubscribed'
        }, { merge: true })));
      }
      const subscriptions = await loadSubscriptions(env, uid);
      return jsonResponse({
        ok: true,
        action,
        activeDeviceCount: subscriptions.length,
        unsubscribed: true,
        updatedAt: now,
      }, 200, { 'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store, max-age=0' });
    }

    if (action === 'preferences') {
      const incoming = payload.preferences;
      if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
        return errorResponse(400, 'PUSH_PREFERENCES_INVALID', 'A notification preference object is required.', id);
      }
      for (const key of Object.keys(incoming)) {
        if (!ADMIN_PUSH_SETTINGS.includes(key) || typeof incoming[key] !== 'boolean') {
          return errorResponse(400, 'PUSH_PREFERENCES_INVALID', 'Only the supported boolean admin notification preferences may be changed.', id);
        }
      }
      const current = await getFirestoreData(env, 'system', 'admin_push') || {};
      const preferences = normalizeAdminPushPreferences({ ...(current.preferences || {}), ...incoming });
      await setFirestoreDocument(env, 'system', 'admin_push', {
        preferences,
        preferencesUpdatedAt: now,
        preferencesUpdatedBy: { uid, email },
        updatedAt: now,
      }, { merge: true });
      return jsonResponse({ ok: true, action, preferences, updatedAt: now }, 200, {
        'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store, max-age=0'
      });
    }

    if (action === 'test') {
      const delivery = await sendAdminPushNotification(env, {
        type: 'test',
        title: 'OVYX payment notification test',
        body: 'Your OVYX owner push notification is connected.',
        url: '/view-admin-overview',
        tag: 'ovyx-admin-push-test',
      });
      if (delivery.configured !== true) {
        return errorResponse(503, 'VAPID_NOT_CONFIGURED', 'Push notification delivery is not configured on this deployment. Add valid OVYX_VAPID_PUBLIC_KEY and OVYX_VAPID_PRIVATE_KEY secrets.', id);
      }
      return jsonResponse({
        ok: true,
        action,
        result: {
          delivered: Number(delivery.delivered || 0) > 0,
          deliveredCount: Number(delivery.delivered || 0),
          attemptedCount: Number(delivery.attempted || 0),
          failedCount: Number(delivery.failed || 0),
          skipped: delivery.skipped === true,
        },
        updatedAt: now,
      }, 200, { 'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store, max-age=0' });
    }

    return errorResponse(400, 'PUSH_ACTION_NOT_ALLOWED', 'Supported actions are subscribe, unsubscribe, preferences and test.', id);
  } catch (error) {
    return errorResponse(error?.status || 500, error?.code || 'ADMIN_PUSH_ACTION_FAILED', error?.message || 'Admin push action could not be completed.', id);
  }
}

export async function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  if (context.request.method === 'POST') return onRequestPost(context);
  return errorResponse(405, 'METHOD_NOT_ALLOWED', 'GET or POST is required.', requestId(context.request));
}
