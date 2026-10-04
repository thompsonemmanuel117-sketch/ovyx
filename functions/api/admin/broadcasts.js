import { jsonResponse, errorResponse, requestId, readJson } from '../_lib/http.js';
import { verifyFirebaseIdToken } from '../../_lib/auth.js';
import { isRootUser } from '../../_lib/brain/registry.js';
import {
  listFirestoreDocuments,
  getFirestoreDataAtPath,
  setFirestoreDocumentAtPath
} from '../../_lib/firebase-admin.js';

const COLLECTION = 'ovyx_announcements';
const MAX_BODY_BYTES = 32_000;

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

export async function onRequestPost(context) {
  const id = requestId(context.request);
  try {
    const auth = await verifyFirebaseIdToken(context.request, context.env);
    if (!auth.ok) return auth.response;
    const denied = rootRequired(auth.user);
    if (denied) return denied;

    const body = await readJson(context.request, MAX_BODY_BYTES);
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

    const announcementId = crypto.randomUUID().replace(/-/g, '').slice(0, 32);
    const now = new Date().toISOString();
    const record = {
      title,
      body: message,
      category,
      link: clean(body?.link || '', 500),
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

    return jsonResponse(
      { ok: true, broadcast: { id: announcementId, ...record }, delivery: 'global-inbox' },
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
