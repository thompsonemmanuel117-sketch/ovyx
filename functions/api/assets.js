'use strict';

import { authenticateRequest } from '../_lib/firebase.js';
import {
  getFirestoreDocumentAtPath,
  getFirestoreDataAtPath,
  setFirestoreDocumentAtPath,
  deleteFirestoreDocumentAtPath,
  listFirestoreSubcollectionDocumentsAtPath,
} from '../_lib/firebase-admin.js';
import { readJson, jsonResponse, requestId } from './_lib/http.js';

const MAX_BODY_BYTES = 32 * 1024;
const MAX_NAME = 180;
const MAX_PROJECT = 120;
const MAX_ASSETS = 500;

function clean(value, max = 400) {
  return String(value ?? '').trim().slice(0, max);
}

function safeProjectId(value) {
  const id = clean(value, MAX_PROJECT);
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(id)) {
    throw Object.assign(new Error('Project ID is invalid.'), {
      status: 400,
      code: 'INVALID_PROJECT_ID',
    });
  }
  return id;
}

function safeAssetId(value) {
  const id = clean(value, 120);
  if (!/^asset_[A-Za-z0-9_-]{8,120}$/.test(id)) {
    throw Object.assign(new Error('Asset ID is invalid.'), {
      status: 400,
      code: 'INVALID_ASSET_ID',
    });
  }
  return id;
}

function safeName(value) {
  const name = clean(value, MAX_NAME);
  if (!name) {
    throw Object.assign(new Error('Asset name is required.'), {
      status: 400,
      code: 'ASSET_NAME_REQUIRED',
    });
  }
  return name;
}

function identityOf(user) {
  const uid = clean(user?.uid || user?.sub, 180);
  const email = clean(user?.email, 320).toLowerCase();
  if (!uid || !email) {
    throw Object.assign(new Error('Authenticated email and UID are required.'), {
      status: 401,
      code: 'AUTH_IDENTITY_REQUIRED',
    });
  }
  return { uid, email };
}

async function loadOwnedProject(env, email, uid, projectId) {
  const path = ['users', email, 'projects', projectId];
  const doc = await getFirestoreDocumentAtPath(env, path);
  if (!doc) {
    throw Object.assign(new Error('Project not found.'), {
      status: 404,
      code: 'PROJECT_NOT_FOUND',
    });
  }
  const project = await getFirestoreDataAtPath(env, path) || {};
  if (clean(project.ownerUid) !== uid || clean(project.ownerEmail).toLowerCase() !== email) {
    throw Object.assign(new Error('Project does not belong to this account.'), {
      status: 403,
      code: 'PROJECT_ACCESS_DENIED',
    });
  }
  return path;
}

function storagePath(uid, projectId, assetId, name) {
  const cleanFile = safeName(name).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, MAX_NAME) || 'asset';
  return `users/${uid}/projects/${projectId}/assets/${assetId}/${cleanFile}`;
}

export async function onRequest(context) {
  const id = requestId(context.request);
  try {
    const user = context.data?.user || await authenticateRequest(context.request, context.env);
    const { uid, email } = identityOf(user);
    const method = context.request.method.toUpperCase();
    const url = new URL(context.request.url);
    const projectId = safeProjectId(
      method === 'POST'
        ? (url.searchParams.get('projectId') || '')
        : (url.searchParams.get('projectId') || ''),
    );
    const projectPath = await loadOwnedProject(context.env, email, uid, projectId);

    if (method === 'GET') {
      const assets = await listFirestoreSubcollectionDocumentsAtPath(
        context.env,
        projectPath,
        'assets',
        MAX_ASSETS,
      );
      return jsonResponse(
        {
          ok: true,
          projectId,
          assets: assets.map(row => ({ ...(row.data || {}), id: row.id })),
        },
        200,
        { 'X-OVYX-Request-ID': id, 'Cache-Control': 'private, no-store' },
      );
    }

    if (method === 'POST') {
      const body = await readJson(context.request, MAX_BODY_BYTES);
      const bodyProjectId = safeProjectId(body?.projectId || projectId);
      if (bodyProjectId !== projectId) {
        throw Object.assign(new Error('Project identity mismatch.'), {
          status: 400,
          code: 'PROJECT_ID_MISMATCH',
        });
      }

      const assetId = safeAssetId(body?.id || '');
      const name = safeName(body?.name);
      const size = Number(body?.size);
      const contentType = clean(body?.contentType, 180).toLowerCase();

      if (!Number.isFinite(size) || size <= 0 || size > 100 * 1024 * 1024) {
        throw Object.assign(new Error('Asset size is outside the supported 100 MB range.'), {
          status: 400,
          code: 'INVALID_ASSET_SIZE',
        });
      }
      if (!contentType) {
        throw Object.assign(new Error('Asset content type is required.'), {
          status: 400,
          code: 'ASSET_TYPE_REQUIRED',
        });
      }

      const path = [...projectPath, 'assets', assetId];
      const currentDoc = await getFirestoreDocumentAtPath(context.env, path);
      const current = currentDoc ? await getFirestoreDataAtPath(context.env, path) : null;

      if (current && (
        clean(current.ownerUid) !== uid ||
        clean(current.ownerEmail).toLowerCase() !== email
      )) {
        throw Object.assign(new Error('Asset ownership conflict.'), {
          status: 409,
          code: 'ASSET_OWNERSHIP_CONFLICT',
        });
      }

      const now = new Date().toISOString();
      const record = {
        id: assetId,
        projectId,
        ownerUid: uid,
        ownerEmail: email,
        name,
        size: Math.round(size),
        contentType,
        storagePath: storagePath(uid, projectId, assetId, name),
        createdAt: current?.createdAt || now,
        updatedAt: now,
      };

      await setFirestoreDocumentAtPath(context.env, path, record, {
        merge: false,
        expectedUpdateTime: currentDoc?.updateTime || null,
      });

      return jsonResponse(
        { ok: true, asset: record },
        200,
        { 'X-OVYX-Request-ID': id, 'Cache-Control': 'private, no-store' },
      );
    }

    if (method === 'DELETE') {
      const body = await readJson(context.request, MAX_BODY_BYTES);
      const assetId = safeAssetId(body?.assetId || '');
      const requestedProject = safeProjectId(body?.projectId || projectId);

      if (requestedProject !== projectId) {
        throw Object.assign(new Error('Project identity mismatch.'), {
          status: 400,
          code: 'PROJECT_ID_MISMATCH',
        });
      }

      const path = [...projectPath, 'assets', assetId];
      const currentDoc = await getFirestoreDocumentAtPath(context.env, path);

      if (!currentDoc) {
        return jsonResponse(
          { ok: true, deleted: true, alreadyMissing: true, assetId },
          200,
          { 'X-OVYX-Request-ID': id },
        );
      }

      const current = await getFirestoreDataAtPath(context.env, path);
      if (
        clean(current?.ownerUid) !== uid ||
        clean(current?.ownerEmail).toLowerCase() !== email
      ) {
        throw Object.assign(new Error('Asset does not belong to this account.'), {
          status: 403,
          code: 'ASSET_ACCESS_DENIED',
        });
      }

      await deleteFirestoreDocumentAtPath(
        context.env,
        path,
        currentDoc.updateTime,
      );

      return jsonResponse(
        { ok: true, deleted: true, assetId },
        200,
        { 'X-OVYX-Request-ID': id, 'Cache-Control': 'private, no-store' },
      );
    }

    return jsonResponse(
      { ok: false, error: 'GET, POST or DELETE is required.', code: 'METHOD_NOT_ALLOWED' },
      405,
      { 'X-OVYX-Request-ID': id },
    );
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: error?.message || 'Asset operation failed.',
        code: error?.code || 'ASSET_OPERATION_FAILED',
      },
      error?.status || 500,
      { 'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store' },
    );
  }
}
