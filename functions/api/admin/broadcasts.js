import { jsonResponse, errorResponse, requestId, readJson } from '../_lib/http.js';
import { verifyFirebaseIdToken, normalizeEmail } from '../../_lib/auth.js';
import { isRootUser } from '../../_lib/brain/registry.js';
import { sendUserPushNotification } from '../_lib/admin-push.js';
import { sendBroadcastEmails } from '../_lib/broadcast-mailer.js';
import {
  listFirestoreDocuments,
  getFirestoreDataAtPath,
  setFirestoreDocumentAtPath
} from '../../_lib/firebase-admin.js';

const COLLECTION = 'ovyx_announcements';
const MAX_BODY_BYTES = 32_000;
const MAX_BROADCAST_ACCOUNTS = 5000;

const clean = (value, max = 4000) => String(value ?? '').trim().slice(0, max);

function rootRequired(user) {
  if (!isRootUser(user)) {
    return errorResponse(403, 'ROOT_REQUIRED', 'Root administrator access is required.');
  }
  return null;
}

function normalizeAnnouncement(row) {
  return {
    id: String(row?.id || ''),
    title: clean(row?.title || 'OVYX Update', 120),
    body: clean(row?.body || '', 4000),
    category: ['product', 'account', 'security', 'maintenance'].includes(String(row?.category || '').toLowerCase())
      ? String(row.category).toLowerCase()
      : 'product',
    link: clean(row?.link || '', 500),
    published: row?.published === true,
    createdBy: row?.createdBy || null,
    createdAt: row?.createdAt || null,
    updatedAt: row?.updatedAt || null
  };
}

export async function onRequestGet(context) {
  const id = requestId(context.request);
  try {
    const auth = await verifyFirebaseIdToken(context.request, context.env);
    if (!auth.ok) return auth.response;
    const denied = rootRequired(auth.user);
    if (denied) return denied;

    const result = await listFirestoreDocuments(context.env, COLLECTION, 100);
    const broadcasts = result.documents
      .map(normalizeAnnouncement)
      .filter(item => item.published)
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

    return jsonResponse(
      { ok: true, broadcasts, nextPageToken: result.nextPageToken || null },
      200,
      { 'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store, max-age=0' }
    );
  } catch (error) {
    return errorResponse(
      error?.status || 503,
      error?.code || 'ADMIN_BROADCASTS_UNAVAILABLE',
      error?.message || 'The broadcast registry is temporarily unavailable.'
    );
  }
}



function normalizeBroadcastLink(raw, requestUrl) {
  const link = clean(raw || '', 500);
  if (!link) return '';
  const origin = new URL(requestUrl).origin;
  if (link.startsWith('/') && !link.startsWith('//') && !link.includes('\\')) {
    try {
      const target = new URL(link, origin);
      return target.origin === origin ? target.pathname + target.search + target.hash : null;
    } catch (_) { return null; }
  }
  if (!/^https:\/\//i.test(link)) return null;
  try {
    const target = new URL(link);
    if (target.protocol !== 'https:' || target.username || target.password) return null;
    return target.href.slice(0, 500);
  } catch (_) { return null; }
}

async function mapLimit(items, limit, worker) {
  const output = new Array(items.length);
  let index = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index++;
      output[current] = await worker(items[current], current);
    }
  });
  await Promise.all(runners);
  return output;
}

async function loadBroadcastEmailRecipients(env, category) {
  const documents = [];
  let pageToken = null;
  let truncated = false;
  while (documents.length < MAX_BROADCAST_ACCOUNTS) {
    const pageSize = Math.min(1000, MAX_BROADCAST_ACCOUNTS - documents.length);
    const result = await listFirestoreDocuments(env, 'users', pageSize, pageToken);
    documents.push(...(result.documents || []));
    pageToken = result.nextPageToken || null;
    if (!pageToken) break;
    if (documents.length >= MAX_BROADCAST_ACCOUNTS) { truncated = true; break; }
  }
  const candidates = documents.map(row => ({
    uid: clean(row?.id, 180),
    email: normalizeEmail(row?.email),
    displayName: clean(row?.displayName || '', 80),
    disabled: row?.disabled === true || String(row?.accountStatus || '').toLowerCase() === 'disabled'
  })).filter(row => row.uid && row.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(row.email) && !row.disabled);
  const key = ['security', 'account'].includes(String(category || '').toLowerCase())
    ? 'emailSecurityAlerts' : 'emailProductUpdates';
  let skippedOptOut = 0;
  let preferenceCheckFailed = 0;
  const checked = await mapLimit(candidates, 16, async recipient => {
    let storedPreferences;
    let storedProfile = null;
    try {
      storedPreferences = await getFirestoreDataAtPath(env, ['users', recipient.uid, 'settings', 'preferences']);
    } catch (_) {
      // Never send a marketing/security broadcast if the stored opt-out state cannot be checked.
      preferenceCheckFailed += 1;
      return null;
    }
    try {
      storedProfile = await getFirestoreDataAtPath(env, ['users', recipient.uid, 'settings', 'profile']);
    } catch (_) {
      // The profile name is cosmetic; preference privacy remains authoritative.
    }
    if (storedPreferences?.notifications && storedPreferences.notifications[key] === false) {
      skippedOptOut += 1;
      return null;
    }
    return {
      uid: recipient.uid,
      email: recipient.email,
      displayName: clean(storedProfile?.displayName || recipient.displayName, 80)
    };
  });
  return {
    recipients: checked.filter(Boolean),
    accountCount: documents.length,
    eligibleAccountCount: candidates.length,
    skippedOptOut,
    preferenceCheckFailed,
    truncated
  };
}

export async function onRequestPost(context) {
  const id = requestId(context.request);
  try {
    const auth = await verifyFirebaseIdToken(context.request, context.env);
    if (!auth.ok) return auth.response;
    const denied = rootRequired(auth.user);
    if (denied) return denied;

    const body = await readJson(context.request, MAX_BODY_BYTES);
    const action = clean(body?.action || 'publish', 40).toLowerCase();
    if (action === 'unpublish') {
      const announcementId = clean(body?.id || body?.announcementId, 160);
      if (!/^[A-Za-z0-9_-]{1,160}$/.test(announcementId)) {
        return errorResponse(400, 'BROADCAST_ID_REQUIRED', 'A valid broadcast ID is required.');
      }
      const existing = await getFirestoreDataAtPath(context.env, [COLLECTION, announcementId]);
      if (!existing) return errorResponse(404, 'BROADCAST_NOT_FOUND', 'The broadcast was not found.');
      if (existing.published !== true) return jsonResponse({ ok: true, action, id: announcementId, published: false }, 200, { 'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store, max-age=0' });
      const now = new Date().toISOString();
      await setFirestoreDocumentAtPath(context.env, [COLLECTION, announcementId], {
        published: false,
        updatedAt: now,
        unpublishedBy: { uid: String(auth.user?.uid || ''), email: normalizeEmail(auth.user?.email) }
      }, { merge: true });
      return jsonResponse({ ok: true, action, id: announcementId, published: false, updatedAt: now, scope: 'global' }, 200, { 'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store, max-age=0' });
    }
    if (action !== 'publish') return errorResponse(400, 'BROADCAST_ACTION_NOT_ALLOWED', 'Supported actions: publish and unpublish.');
    const title = clean(body?.title || 'OVYX Update', 120) || 'OVYX Update';
    const message = clean(body?.message ?? body?.body, 4000);
    if (!message) {
      return errorResponse(400, 'BROADCAST_MESSAGE_REQUIRED', 'A broadcast message is required.');
    }

    const category = ['product', 'account', 'security', 'maintenance'].includes(
      String(body?.category || 'product').trim().toLowerCase()
    )
      ? String(body.category).trim().toLowerCase()
      : 'product';
    const link = normalizeBroadcastLink(body?.link || '', context.request.url);
    if (link === null) {
      return errorResponse(400, 'BROADCAST_LINK_INVALID', 'The optional link must be a local OVYX path or a safe HTTPS URL.', id);
    }

    const announcementId = crypto.randomUUID().replace(/-/g, '').slice(0, 32);
    const now = new Date().toISOString();
    const record = {
      title,
      body: message,
      category,
      link,
      published: true,
      createdBy: {
        uid: String(auth.user?.uid || ''),
        email: String(auth.user?.email || '').toLowerCase()
      },
      createdAt: now,
      updatedAt: now
    };

    await setFirestoreDocumentAtPath(
      context.env,
      [COLLECTION, announcementId],
      record,
      { merge: false }
    );

    const origin = new URL(context.request.url).origin;
    const emailRequested = body?.sendEmail === true;
    const deliveryJobs = [
      sendUserPushNotification(context.env, {
        id: announcementId,
        type: 'broadcast',
        title,
        body: message,
        url: link.startsWith('/') ? link : '/',
        tag: 'ovyx-broadcast-' + announcementId
      }).catch(error => ({
        configured: false, skipped: true, attempted: 0, accepted: 0, failed: 0,
        reason: clean(error?.message || 'Phone notification delivery failed.', 220)
      }))
    ];
    if (emailRequested) {
      deliveryJobs.push((async () => {
        try {
          const recipientInfo = await loadBroadcastEmailRecipients(context.env, category);
          const email = await sendBroadcastEmails(context.env, {
            broadcast: { id: announcementId, title, body: message, category, link },
            recipients: recipientInfo.recipients,
            logoUrl: new URL('/assets/ovyx-logo.png', origin).href,
            origin
          });
          return { ...email, preferenceCheckFailed: recipientInfo.preferenceCheckFailed,
            skippedOptOut: recipientInfo.skippedOptOut, eligibleAccountCount: recipientInfo.eligibleAccountCount,
            accountCount: recipientInfo.accountCount, truncated: recipientInfo.truncated };
        } catch (error) {
          return { configured: false, attemptedCount: 0, providerAcceptedCount: 0, failedCount: 0,
            skippedCount: 0, reason: clean(error?.message || 'Email delivery could not be prepared.', 220) };
        }
      })());
    } else {
      deliveryJobs.push(Promise.resolve({
        requested: false, configured: null, attemptedCount: 0, providerAcceptedCount: 0,
        failedCount: 0, skippedCount: 0, reason: 'Email delivery was not selected for this broadcast.'
      }));
    }
    const [pushDelivery, emailDelivery] = await Promise.all(deliveryJobs);

    return jsonResponse(
      {
        ok: true,
        broadcast: { id: announcementId, ...record },
        delivery: {
          inApp: { published: true, scope: 'global-inbox' },
          push: pushDelivery,
          email: { ...emailDelivery, requested: emailRequested }
        }
      },
      201,
      { 'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store' }
    );
  } catch (error) {
    return errorResponse(
      error?.status || 500,
      error?.code || 'ADMIN_BROADCAST_CREATE_FAILED',
      error?.message || 'The broadcast could not be published.'
    );
  }
}

export async function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  if (context.request.method === 'POST') return onRequestPost(context);
  return errorResponse(405, 'METHOD_NOT_ALLOWED', 'GET or POST is required.');
}
