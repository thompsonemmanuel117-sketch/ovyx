import { verifyFirebaseIdToken } from '../../_lib/auth.js';
import { getFirestoreData, listFirestoreDocuments, setFirestoreDocument } from '../../_lib/firebase-admin.js';
import { getAdminPushConfiguration, adminPushSubscriptionId, USER_PUSH_COLLECTION, validateAdminPushEndpoint } from '../_lib/admin-push.js';
import { enforceSameOrigin, errorResponse, jsonResponse, readJson, requestId } from '../_lib/http.js';

const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);

async function requireUser(request, env, id) {
  if (!enforceSameOrigin(request)) return { response: errorResponse(403, 'ORIGIN_REJECTED', 'Cross-origin notification requests are not permitted.', id) };
  const auth = await verifyFirebaseIdToken(request, env);
  if (!auth.ok) return { response: auth.response };
  const uid = clean(auth.user?.uid || auth.user?.sub, 180);
  if (!uid || !auth.user?.email) return { response: errorResponse(401, 'AUTH_IDENTITY_REQUIRED', 'Please sign in again to verify your account.', id) };
  return { user: auth.user, uid };
}

async function ownedSubscriptions(env, uid) {
  const result = await listFirestoreDocuments(env, USER_PUSH_COLLECTION, 1000);
  return (result.documents || []).filter(row => row.active === true && String(row.ownerUid || '') === String(uid || ''));
}

function validateSubscription(subscription) {
  const endpoint = validateAdminPushEndpoint(subscription?.endpoint);
  const keys = subscription?.keys || {};
  const p256dh = clean(keys.p256dh, 200);
  const auth = clean(keys.auth, 120);
  if (!endpoint || !/^[A-Za-z0-9_-]{80,100}$/.test(p256dh) || !/^[A-Za-z0-9_-]{20,50}$/.test(auth)) return null;
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
  } catch (_) {
    return null;
  }
  return { endpoint, keys: { p256dh, auth } };
}

export async function onRequestGet(context) {
  const id = requestId(context.request);
  try {
    const identity = await requireUser(context.request, context.env, id);
    if (identity.response) return identity.response;
    const config = getAdminPushConfiguration(context.env);
    const subscriptions = await ownedSubscriptions(context.env, identity.uid);
    return jsonResponse({
      ok: true,
      authority: 'SERVER',
      pushConfigured: config.configured,
      vapidPublicKey: config.configured ? config.publicKey : null,
      reason: config.configured ? null : config.reason,
      activeDeviceCount: subscriptions.length,
    }, 200, { 'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store, max-age=0' });
  } catch (error) {
    return errorResponse(error?.status || 503, error?.code || 'USER_PUSH_READ_FAILED', 'Phone notification settings could not be loaded.', id);
  }
}

export async function onRequestPost(context) {
  const id = requestId(context.request);
  try {
    const identity = await requireUser(context.request, context.env, id);
    if (identity.response) return identity.response;
    const body = await readJson(context.request, 12000);
    const action = clean(body?.action, 30).toLowerCase();
    const env = context.env;
    const uid = identity.uid;
    const email = String(identity.user?.email || '').trim().toLowerCase();
    const now = new Date().toISOString();

    if (action === 'subscribe') {
      const config = getAdminPushConfiguration(env);
      if (!config.configured || !config.publicKey) return errorResponse(503, 'VAPID_NOT_CONFIGURED', 'Phone notifications are not configured for this OVYX deployment yet.', id);
      const subscription = validateSubscription(body?.subscription);
      if (!subscription) return errorResponse(400, 'PUSH_SUBSCRIPTION_INVALID', 'The browser returned an invalid or unsupported push subscription.', id);
      const subscriptionId = await adminPushSubscriptionId(subscription.endpoint);
      const existing = await getFirestoreData(env, USER_PUSH_COLLECTION, subscriptionId);
      await setFirestoreDocument(env, USER_PUSH_COLLECTION, subscriptionId, {
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
      const subscriptions = await ownedSubscriptions(env, uid);
      return jsonResponse({ ok: true, action, subscribed: true, activeDeviceCount: subscriptions.length, updatedAt: now }, 200, {
        'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store, max-age=0'
      });
    }

    if (action === 'unsubscribe') {
      const endpointInput = clean(body?.endpoint, 2048);
      if (endpointInput) {
        const endpoint = validateAdminPushEndpoint(endpointInput);
        if (!endpoint) return errorResponse(400, 'PUSH_ENDPOINT_INVALID', 'The push endpoint is invalid.', id);
        const subscriptionId = await adminPushSubscriptionId(endpoint);
        const existing = await getFirestoreData(env, USER_PUSH_COLLECTION, subscriptionId);
        if (!existing || String(existing.ownerUid || '') !== uid) return errorResponse(404, 'PUSH_SUBSCRIPTION_NOT_FOUND', 'This device subscription was not found for the signed-in account.', id);
        await setFirestoreDocument(env, USER_PUSH_COLLECTION, subscriptionId, {
          active: false, updatedAt: now, inactiveReason: 'user_unsubscribed'
        }, { merge: true });
      } else {
        const rows = await listFirestoreDocuments(env, USER_PUSH_COLLECTION, 1000);
        const owned = (rows.documents || []).filter(row => row.active === true && String(row.ownerUid || '') === uid);
        await Promise.all(owned.map(row => setFirestoreDocument(env, USER_PUSH_COLLECTION, String(row.id), {
          active: false, updatedAt: now, inactiveReason: 'user_unsubscribed'
        }, { merge: true })));
      }
      const subscriptions = await ownedSubscriptions(env, uid);
      return jsonResponse({ ok: true, action, unsubscribed: true, activeDeviceCount: subscriptions.length, updatedAt: now }, 200, {
        'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store, max-age=0'
      });
    }

    return errorResponse(400, 'USER_PUSH_ACTION_NOT_ALLOWED', 'Supported actions are subscribe and unsubscribe.', id);
  } catch (error) {
    return errorResponse(error?.status || 500, error?.code || 'USER_PUSH_ACTION_FAILED', error?.message || 'Phone notification settings could not be updated.', id);
  }
}

export async function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  if (context.request.method === 'POST') return onRequestPost(context);
  return errorResponse(405, 'METHOD_NOT_ALLOWED', 'GET or POST is required.', requestId(context.request));
}
