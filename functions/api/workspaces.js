import { authenticateRequest } from '../_lib/firebase.js';
import {
  getFirestoreDocumentAtPath,
  getFirestoreDataAtPath,
  setFirestoreDocumentAtPath,
  listFirestoreSubcollectionDocumentsAtPath,
} from '../_lib/firebase-admin.js';
import { readJson, jsonResponse, requestId } from './_lib/http.js';

export const DEFAULT_WORKSPACE_ID = 'personal';
const MAX_WORKSPACES = 50;

function clean(value, max = 320) {
  return String(value ?? '').trim().slice(0, max);
}

export function normalizeWorkspaceId(value) {
  const id = clean(value, 120);
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(id)) {
    throw Object.assign(new Error('The selected workspace could not be identified.'), {
      status: 400,
      code: 'INVALID_WORKSPACE_ID',
    });
  }
  return id;
}

export function normalizeWorkspaceName(value) {
  const name = clean(value, 80).replace(/\s+/g, ' ');
  if (name.length < 2) {
    throw Object.assign(new Error('Workspace names must contain at least 2 characters.'), {
      status: 400,
      code: 'WORKSPACE_NAME_REQUIRED',
    });
  }
  return name;
}

export function projectWorkspaceId(project) {
  const value = clean(project?.workspaceId, 120);
  return /^[A-Za-z0-9_-]{1,120}$/.test(value) ? value : DEFAULT_WORKSPACE_ID;
}

export function isWorkspaceOwner(workspace, user) {
  const uid = clean(user?.uid || user?.sub);
  const email = clean(user?.email, 320).toLowerCase();
  return Boolean(
    uid &&
    email &&
    clean(workspace?.ownerUid) === uid &&
    clean(workspace?.ownerEmail, 320).toLowerCase() === email
  );
}

function workspacePath(uid, id) {
  return ['users', uid, 'workspaces', id];
}

async function ensurePersonalWorkspace(env, user, uid, email) {
  const path = workspacePath(uid, DEFAULT_WORKSPACE_ID);
  const existing = await getFirestoreDocumentAtPath(env, path);
  if (existing) {
    const data = await getFirestoreDataAtPath(env, path);
    if (!isWorkspaceOwner(data, user)) {
      throw Object.assign(new Error('The personal workspace could not be verified.'), {
        status: 409,
        code: 'WORKSPACE_OWNERSHIP_CONFLICT',
      });
    }
    return data;
  }

  const now = new Date().toISOString();
  const workspace = {
    id: DEFAULT_WORKSPACE_ID,
    name: 'Personal workspace',
    description: 'Your private OVYX workspace.',
    workspaceType: 'personal',
    status: 'active',
    isDefault: true,
    ownerUid: uid,
    ownerEmail: email,
    createdAt: now,
    updatedAt: now,
  };
  await setFirestoreDocumentAtPath(env, path, workspace, { merge: false });
  return workspace;
}

async function readOwnedWorkspace(env, user, uid, email, id) {
  const path = workspacePath(uid, id);
  const document = await getFirestoreDocumentAtPath(env, path);
  const workspace = document ? await getFirestoreDataAtPath(env, path) : null;
  if (!workspace || !isWorkspaceOwner(workspace, { uid, email })) {
    throw Object.assign(new Error('Workspace not found.'), {
      status: 404,
      code: 'WORKSPACE_NOT_FOUND',
    });
  }
  return { path, document, workspace };
}

function safeWorkspace(row, user) {
  const workspace = row?.data || {};
  if (!isWorkspaceOwner(workspace, user)) return null;
  return {
    id: row.id,
    name: clean(workspace.name, 80) || 'Untitled workspace',
    description: clean(workspace.description, 280),
    workspaceType: workspace.workspaceType === 'personal' ? 'personal' : 'workspace',
    status: workspace.status === 'archived' ? 'archived' : 'active',
    isDefault: workspace.isDefault === true || row.id === DEFAULT_WORKSPACE_ID,
    ownerUid: clean(workspace.ownerUid),
    createdAt: clean(workspace.createdAt, 40) || null,
    updatedAt: clean(workspace.updatedAt, 40) || null,
    archivedAt: clean(workspace.archivedAt, 40) || null,
    role: 'owner',
    collaboration: { supported: false, reason: 'Team membership and invitations are not configured for this workspace model.' },
  };
}

export async function onRequest(context) {
  const id = requestId(context.request);
  try {
    const user = context.data?.user || await authenticateRequest(context.request, context.env);
    const uid = clean(user?.uid || user?.sub);
    const email = clean(user?.email, 320).toLowerCase();
    if (!uid || !email) {
      throw Object.assign(new Error('Please sign in with a verified email address.'), {
        status: 401,
        code: 'EMAIL_REQUIRED',
      });
    }

    const method = context.request.method.toUpperCase();
    if (method === 'GET') {
      await ensurePersonalWorkspace(context.env, user, uid, email);
      const rows = await listFirestoreSubcollectionDocumentsAtPath(
        context.env,
        ['users', uid],
        'workspaces',
        1000,
      );
      const workspaces = rows.map(row => safeWorkspace(row, { uid, email })).filter(Boolean);
      workspaces.sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name));
      return jsonResponse({
        ok: true,
        workspaces,
        owner: { uid, email },
        collaboration: { supported: false, reason: 'This account currently has owner-only personal workspaces; team invitations and member roles are not enabled.' },
      }, 200, {
        'X-OVYX-Request-ID': id,
        'Cache-Control': 'no-store',
      });
    }

    if (method === 'POST') {
      const body = await readJson(context.request, 16_000);
      await ensurePersonalWorkspace(context.env, user, uid, email);
      const action = clean(body.action, 24).toLowerCase();
      const now = new Date().toISOString();

      if (action === 'create') {
        const rows = await listFirestoreSubcollectionDocumentsAtPath(
          context.env,
          ['users', uid],
          'workspaces',
          1000,
        );
        const owned = rows.filter(row => isWorkspaceOwner(row.data, { uid, email }));
        if (owned.length >= MAX_WORKSPACES) {
          throw Object.assign(new Error('This account has reached the workspace limit.'), {
            status: 409,
            code: 'WORKSPACE_LIMIT_REACHED',
          });
        }
        const workspaceId = 'ws_' + crypto.randomUUID().replace(/-/g, '').slice(0, 24);
        const workspace = {
          id: workspaceId,
          name: normalizeWorkspaceName(body.name),
          description: clean(body.description, 280),
          workspaceType: 'workspace',
          status: 'active',
          isDefault: false,
          ownerUid: uid,
          ownerEmail: email,
          createdAt: now,
          updatedAt: now,
        };
        await setFirestoreDocumentAtPath(
          context.env,
          workspacePath(uid, workspaceId),
          workspace,
          { merge: false },
        );
        return jsonResponse({ ok: true, workspace: safeWorkspace({ id: workspaceId, data: workspace }, { uid, email }) }, 201, {
          'X-OVYX-Request-ID': id,
          'Cache-Control': 'no-store',
        });
      }

      if (action === 'update' || action === 'archive' || action === 'restore') {
        const workspaceId = normalizeWorkspaceId(body.workspaceId);
        const current = await readOwnedWorkspace(context.env, user, uid, email, workspaceId);
        if (action === 'archive' && workspaceId === DEFAULT_WORKSPACE_ID) {
          throw Object.assign(new Error('Your personal workspace cannot be archived.'), {
            status: 400,
            code: 'DEFAULT_WORKSPACE_REQUIRED',
          });
        }
        const patch = { updatedAt: now };
        if (action === 'update') {
          if (Object.prototype.hasOwnProperty.call(body, 'name')) patch.name = normalizeWorkspaceName(body.name);
          if (Object.prototype.hasOwnProperty.call(body, 'description')) patch.description = clean(body.description, 280);
        } else if (action === 'archive') {
          patch.status = 'archived';
          patch.archivedAt = now;
        } else {
          patch.status = 'active';
          patch.archivedAt = null;
        }
        await setFirestoreDocumentAtPath(context.env, current.path, patch, {
          merge: true,
          expectedUpdateTime: current.document?.updateTime || null,
        });
        const updated = { ...current.workspace, ...patch, id: workspaceId };
        return jsonResponse({ ok: true, workspace: safeWorkspace({ id: workspaceId, data: updated }, { uid, email }) }, 200, {
          'X-OVYX-Request-ID': id,
          'Cache-Control': 'no-store',
        });
      }

      throw Object.assign(new Error('Use create, update, archive or restore for workspace management.'), {
        status: 400,
        code: 'INVALID_WORKSPACE_ACTION',
      });
    }

    return jsonResponse({ ok: false, error: 'GET or POST is required.', code: 'METHOD_NOT_ALLOWED' }, 405, {
      'X-OVYX-Request-ID': id,
      'Cache-Control': 'no-store',
    });
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: error?.message || 'Your workspace request could not be completed. Please try again.',
      code: error?.code || 'WORKSPACES_FAILED',
    }, error?.status || 500, {
      'X-OVYX-Request-ID': id,
      'Cache-Control': 'no-store',
    });
  }
}
