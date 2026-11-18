import { jsonResponse, errorResponse, requestId, readJson, enforceSameOrigin } from './_lib/http.js';
import { verifyFirebaseIdToken } from '../_lib/auth.js';
import {
  listFirestoreDocuments,
  listFirestoreSubcollectionDocuments,
  setFirestoreDocumentAtPath
} from '../_lib/firebase-admin.js';

const ANNOUNCEMENTS = 'ovyx_announcements';
const MAX_BODY_BYTES = 8000;

const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);

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
    createdAt: row?.createdAt || null
  };
}

async function loadAnnouncements(env, pageToken = null) {
  const result = await listFirestoreDocuments(env, ANNOUNCEMENTS, 100, pageToken, 'createdAt desc, __name__ desc');
  return {
    notifications: (result.documents || [])
      .map(normalizeAnnouncement)
      .filter(item => item.published)
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))),
    nextPageToken: result.nextPageToken || null
  };
}

async function loadReadMap(env, uid) {
  const read = {};
  let pageToken = null;
  for (let page = 0; page < 20; page += 1) {
    const rows = await listFirestoreSubcollectionDocuments(
      env,
      'users',
      uid,
      'notificationState',
      1000,
      pageToken
    );
    for (const row of rows) {
      const id = clean(row?.id, 160);
      if (id && row?.data?.readAt) read[id] = row.data.readAt;
    }
    pageToken = rows.nextPageToken || null;
    if (!pageToken) break;
  }
  return read;
}

export async function onRequestGet(context) {
  const id = requestId(context.request);
  try {
    if (!enforceSameOrigin(context.request)) return errorResponse(403, 'ORIGIN_REJECTED', 'Cross-origin notification requests are not permitted.', id);
    const auth = await verifyFirebaseIdToken(context.request, context.env);
    if (!auth.ok) return auth.response;

    const url = new URL(context.request.url);
    const pageToken = clean(url.searchParams.get('pageToken'), 4000) || null;
    const [page, read] = await Promise.all([
      loadAnnouncements(context.env, pageToken),
      loadReadMap(context.env, auth.user.uid)
    ]);

    const notifications = page.notifications.map(item => ({
      ...item,
      readAt: read[item.id] || null,
      unread: !read[item.id]
    }));

    return jsonResponse(
      {
        ok: true,
        notifications,
        nextPageToken: page.nextPageToken,
        unreadCount: notifications.filter(item => item.unread).length
      },
      200,
      { 'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store, max-age=0' }
    );
  } catch (error) {
    return errorResponse(
      error?.status || 503,
      error?.code || 'NOTIFICATIONS_UNAVAILABLE',
      error?.message || 'Notifications are temporarily unavailable.'
    );
  }
}

export async function onRequestPost(context) {
  const id = requestId(context.request);
  try {
    if (!enforceSameOrigin(context.request)) return errorResponse(403, 'ORIGIN_REJECTED', 'Cross-origin notification requests are not permitted.', id);
    const auth = await verifyFirebaseIdToken(context.request, context.env);
    if (!auth.ok) return auth.response;

    const body = await readJson(context.request, MAX_BODY_BYTES);
    const action = clean(body?.action, 40).toLowerCase();
    if (action === 'read-all') {
      const pageToken = clean(body?.pageToken, 4000) || null;
      const result = await listFirestoreDocuments(
        context.env,
        ANNOUNCEMENTS,
        1000,
        pageToken,
        'createdAt desc, __name__ desc'
      );
      const ids = (result.documents || [])
        .map(normalizeAnnouncement)
        .filter(item => item.published && /^[A-Za-z0-9_-]{1,160}$/.test(item.id))
        .map(item => item.id);
      const readAt = new Date().toISOString();
      for (let offset = 0; offset < ids.length; offset += 100) {
        const batch = ids.slice(offset, offset + 100);
        await Promise.all(batch.map(notificationId => setFirestoreDocumentAtPath(
          context.env,
          ['users', auth.user.uid, 'notificationState', notificationId],
          { readAt },
          { merge: true }
        )));
      }
      const nextPageToken = result.nextPageToken || null;
      return jsonResponse(
        { ok: true, action, readAt, updatedCount: ids.length, complete: !nextPageToken, nextPageToken },
        200,
        { 'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store, max-age=0' }
      );
    }

    const notificationId = clean(body?.notificationId || body?.id, 160);
    if (!['read', 'unread'].includes(action) || !notificationId || !/^[A-Za-z0-9_-]{1,160}$/.test(notificationId)) {
      return errorResponse(400, 'INVALID_NOTIFICATION_ACTION', 'Choose a valid notification action.');
    }

    const unread = action === 'unread';
    const readAt = unread ? null : new Date().toISOString();
    await setFirestoreDocumentAtPath(
      context.env,
      ['users', auth.user.uid, 'notificationState', notificationId],
      { readAt },
      { merge: true }
    );

    return jsonResponse(
      { ok: true, id: notificationId, readAt, unread },
      200,
      { 'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store, max-age=0' }
    );
  } catch (error) {
    return errorResponse(
      error?.status || 500,
      error?.code || 'NOTIFICATION_UPDATE_FAILED',
      error?.message || 'Notification state could not be updated.'
    );
  }
}

export async function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  if (context.request.method === 'POST') return onRequestPost(context);
  return errorResponse(405, 'METHOD_NOT_ALLOWED', 'This action is not supported.');
}
