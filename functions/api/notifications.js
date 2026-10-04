import { jsonResponse, errorResponse, requestId, readJson } from './_lib/http.js';
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

async function loadAnnouncements(env) {
  const result = await listFirestoreDocuments(env, ANNOUNCEMENTS, 100);
  return result.documents
    .map(normalizeAnnouncement)
    .filter(item => item.published)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

async function loadReadMap(env, uid) {
  const rows = await listFirestoreSubcollectionDocuments(
    env,
    'users',
    uid,
    'notificationState',
    100
  );

  const read = {};
  for (const row of rows) {
    const id = clean(row?.id, 160);
    if (id && row?.data?.readAt) read[id] = row.data.readAt;
  }
  return read;
}

export async function onRequestGet(context) {
  const id = requestId(context.request);
  try {
    const auth = await verifyFirebaseIdToken(context.request, context.env);
    if (!auth.ok) return auth.response;

    const [announcements, read] = await Promise.all([
      loadAnnouncements(context.env),
      loadReadMap(context.env, auth.user.uid)
    ]);

    const notifications = announcements.map(item => ({
      ...item,
      readAt: read[item.id] || null,
      unread: !read[item.id]
    }));

    return jsonResponse(
      {
        ok: true,
        notifications,
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
    const auth = await verifyFirebaseIdToken(context.request, context.env);
    if (!auth.ok) return auth.response;

    const body = await readJson(context.request, MAX_BODY_BYTES);
    const action = clean(body?.action, 40).toLowerCase();
    const notificationId = clean(body?.notificationId || body?.id, 160);

    if (action !== 'read' || !notificationId || !/^[A-Za-z0-9_-]{1,160}$/.test(notificationId)) {
      return errorResponse(400, 'INVALID_NOTIFICATION_ACTION', 'A valid notification read action is required.');
    }

    const readAt = new Date().toISOString();

    await setFirestoreDocumentAtPath(
      context.env,
      ['users', auth.user.uid, 'notificationState', notificationId],
      { readAt },
      { merge: true }
    );

    return jsonResponse(
      { ok: true, id: notificationId, readAt },
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
  return errorResponse(405, 'METHOD_NOT_ALLOWED', 'GET or POST is required.');
}
