import { authenticateRequest } from '../../_lib/firebase.js';
import {
  deleteFirestoreDocumentTree,
  deleteStoragePrefix,
  listFirestoreDocuments,
} from '../../_lib/firebase-admin.js';
import { jsonResponse, requestId } from '../_lib/http.js';

const ROOT_EMAIL = 'ovyxsupportteam@gmail.com';
const RECENT_AUTH_SECONDS = 10 * 60;

function uidOf(user) {
  return String(user?.sub || user?.uid || '').trim();
}

function isPrivileged(user) {
  const email = String(user?.email || '').trim().toLowerCase();
  return user?.admin === true ||
    user?.owner === true ||
    user?.role === 'admin' ||
    user?.role === 'owner' ||
    email === ROOT_EMAIL;
}

function assertFreshAuth(user) {
  const authTime = Number(user?.auth_time || 0);
  const now = Math.floor(Date.now() / 1000);

  if (!authTime || now - authTime > RECENT_AUTH_SECONDS) {
    throw Object.assign(
      new Error('For security, sign in again before deleting your account.'),
      { status: 403, code: 'REAUTH_REQUIRED' }
    );
  }
}

async function deleteUserBuildRecords(env, uid) {
  let pageToken = null;
  do {
    const page = await listFirestoreDocuments(env, 'mobile_builds', 1000, pageToken);
    pageToken = page.nextPageToken || null;

    for (const item of page.documents || []) {
      if (String(item.userId || '').trim() !== uid) continue;
      await deleteFirestoreDocumentTree(env, 'mobile_builds', String(item.id));
    }
  } while (pageToken);
}

export async function onRequestPost(context) {
  const id = requestId(context.request);

  try {
    const user =
      context.data?.user ||
      await authenticateRequest(context.request, context.env);

    if (!uidOf(user)) {
      return jsonResponse(
        { ok: false, error: 'Authentication required.', code: 'AUTH_REQUIRED' },
        401,
        { 'X-OVYX-Request-ID': id }
      );
    }

    if (isPrivileged(user)) {
      return jsonResponse(
        {
          ok: false,
          error: 'The root administrator account is protected from self-service deletion.',
          code: 'PRIVILEGED_ACCOUNT_DELETE_BLOCKED',
        },
        403,
        { 'X-OVYX-Request-ID': id }
      );
    }

    if (String(context.request.headers.get('X-OVYX-Account-Deletion') || '') !== 'CONFIRM') {
      return jsonResponse(
        { ok: false, error: 'Account deletion confirmation is required.', code: 'DELETE_CONFIRMATION_REQUIRED' },
        400,
        { 'X-OVYX-Request-ID': id }
      );
    }

    assertFreshAuth(user);

    const uid = uidOf(user);

    // Delete the authenticated user's Firestore tree, including project,
    // conversation and notification subcollections. Payment/audit records
    // are intentionally preserved where required for reconciliation/security.
    await deleteFirestoreDocumentTree(context.env, 'users', uid);

    // Remove the trusted GitHub connection record, if one exists.
    try {
      await deleteFirestoreDocumentTree(context.env, 'github_connections', uid);
    } catch (error) {
      console.warn('[OVYX ACCOUNT DELETE] github connection cleanup failed', error);
    }

    // Remove server-side mobile build payloads belonging to this account.
    try {
      await deleteUserBuildRecords(context.env, uid);
    } catch (error) {
      console.warn('[OVYX ACCOUNT DELETE] mobile build cleanup failed', error);
      throw Object.assign(new Error('Cloud project build data could not be fully removed.'), {
        status: 503,
        code: 'ACCOUNT_BUILD_CLEANUP_FAILED',
      });
    }

    // Remove Firebase Storage objects using the user's OVYX namespace.
    await deleteStoragePrefix(context.env, `users/${uid}/`);

    return jsonResponse(
      {
        ok: true,
        uid,
        deleted: true,
        firestore: 'deleted',
        storage: 'deleted',
        requiresClientAuthDeletion: true,
        nextStep: 'Call currentUser.delete() on the Firebase client, then signOut and clear local session state.',
      },
      200,
      {
        'X-OVYX-Request-ID': id,
        'Cache-Control': 'no-store, max-age=0',
      }
    );
  } catch (error) {
    console.error('[OVYX ACCOUNT DELETE]', id, error);
    return jsonResponse(
      {
        ok: false,
        error: error?.message || 'Account deletion failed.',
        code: error?.code || 'ACCOUNT_DELETE_FAILED',
      },
      error?.status || 500,
      { 'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store, max-age=0' }
    );
  }
}

export async function onRequest(context) {
  if (context.request.method === 'POST') return onRequestPost(context);
  return jsonResponse(
    { ok: false, error: 'POST is required.', code: 'METHOD_NOT_ALLOWED' },
    405,
    { 'X-OVYX-Request-ID': requestId(context.request) }
  );
}
