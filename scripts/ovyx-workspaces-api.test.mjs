import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  DEFAULT_WORKSPACE_ID,
  normalizeWorkspaceId,
  normalizeWorkspaceName,
  isWorkspaceOwner,
} from '../functions/api/workspaces.js';

assert.equal(DEFAULT_WORKSPACE_ID, 'personal');
assert.equal(normalizeWorkspaceId('personal'), 'personal');
assert.equal(normalizeWorkspaceId('ws_project-123'), 'ws_project-123');
assert.throws(() => normalizeWorkspaceId('../private'), error => error.code === 'INVALID_WORKSPACE_ID');
assert.throws(() => normalizeWorkspaceId(''), error => error.code === 'INVALID_WORKSPACE_ID');
assert.equal(normalizeWorkspaceName('  Product   Studio  '), 'Product Studio');
assert.throws(() => normalizeWorkspaceName(' '), error => error.code === 'WORKSPACE_NAME_REQUIRED');
assert.throws(() => normalizeWorkspaceName('x'), error => error.code === 'WORKSPACE_NAME_REQUIRED');

const owner = { uid: 'workspace-owner-1', email: 'owner@example.test' };
assert.equal(isWorkspaceOwner({ ownerUid: owner.uid, ownerEmail: owner.email }, owner), true);
assert.equal(isWorkspaceOwner({ ownerUid: 'another-user', ownerEmail: owner.email }, owner), false);
assert.equal(isWorkspaceOwner({ ownerUid: owner.uid, ownerEmail: 'other@example.test' }, owner), false);
assert.equal(isWorkspaceOwner({ ownerUid: owner.uid, ownerEmail: owner.email }, { uid: owner.uid }), false);

const workspaceApi = await readFile(new URL('../functions/api/workspaces.js', import.meta.url), 'utf8');
const projectsApi = await readFile(new URL('../functions/api/projects.js', import.meta.url), 'utf8');
assert.match(workspaceApi, /listFirestoreSubcollectionDocumentsAtPath/);
assert.match(workspaceApi, /expectedUpdateTime/);
assert.match(workspaceApi, /WORKSPACE_OWNERSHIP_CONFLICT/);
assert.match(workspaceApi, /DEFAULT_WORKSPACE_REQUIRED/);
assert.match(workspaceApi, /Team membership and invitations are not configured/);
assert.match(projectsApi, /workspaceId/);
assert.match(projectsApi, /assertWorkspaceAccess/);
assert.match(projectsApi, /projectWorkspaceId/);
assert.match(projectsApi, /PROJECT_OWNERSHIP_CONFLICT/);

console.log('OVYX workspace management contract tests passed.');


// Exercise the real Cloudflare Pages handlers against a deterministic Firestore REST double.
import { generateKeyPairSync } from 'node:crypto';
import { onRequest as handleWorkspaces } from '../functions/api/workspaces.js';
import { onRequest as handleProjects } from '../functions/api/projects.js';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const serviceAccount = {
  client_email: 'ovyx-workspace-test@example.iam.gserviceaccount.com',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  project_id: 'ovyx-workspace-test',
};
const documents = new Map();
let clock = 0;
const nextUpdateTime = () => new Date(Date.UTC(2026, 10, 6, 0, 0, ++clock)).toISOString();

function encode(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isSafeInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === 'string') return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  if (value && typeof value === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)])) } };
  return { stringValue: String(value) };
}
function decode(value) {
  if (!value) return null;
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decode);
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, item]) => [key, decode(item)]));
  return null;
}
function firestoreDocument(path, data) {
  const fields = Object.fromEntries(Object.entries(data).map(([key, value]) => [key, encode(value)]));
  return {
    name: 'projects/ovyx-workspace-test/databases/(default)/documents/' + path,
    fields,
    updateTime: nextUpdateTime(),
  };
}
function dataFrom(document) {
  return Object.fromEntries(Object.entries(document?.fields || {}).map(([key, value]) => [key, decode(value)]));
}
function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  if (url.hostname === 'oauth2.googleapis.com') return json({ access_token: 'ovyx-workspace-test-token', expires_in: 3600 });
  if (url.hostname !== 'firestore.googleapis.com') throw new Error('Unexpected network request in workspace API test: ' + url.href);
  const pathParts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const marker = pathParts.indexOf('documents');
  const path = pathParts.slice(marker + 1).join('/');
  const method = String(init.method || 'GET').toUpperCase();

  if (method === 'GET' && pathParts.length - marker - 1 > 0 && (pathParts.length - marker - 1) % 2 === 1) {
    const prefix = path + '/';
    const directChildren = [...documents.entries()]
      .filter(([key]) => key.startsWith(prefix) && !key.slice(prefix.length).includes('/'))
      .map(([, value]) => value);
    return json({ documents: directChildren });
  }
  if (method === 'GET') {
    const document = documents.get(path);
    return document ? json(document) : json({ error: { message: 'Not found' } }, 404);
  }
  if (method === 'PATCH') {
    const existing = documents.get(path);
    const expected = url.searchParams.get('currentDocument.updateTime');
    if (expected && (!existing || existing.updateTime !== expected)) return json({ error: { message: 'Precondition failed' } }, 409);
    const payload = JSON.parse(init.body || '{}');
    const incoming = dataFrom({ fields: payload.fields || {} });
    const merge = url.searchParams.has('updateMask.fieldPaths');
    const data = merge && existing ? { ...dataFrom(existing), ...incoming } : incoming;
    const updated = firestoreDocument(path, data);
    documents.set(path, updated);
    return json(updated);
  }
  if (method === 'DELETE') {
    documents.delete(path);
    return json({});
  }
  throw new Error('Unsupported Firestore test operation: ' + method + ' ' + path);
};

const env = { FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify(serviceAccount) };
const integrationOwner = { uid: 'workspace-owner-1', email: 'owner@example.test', displayName: 'Workspace Owner' };
const otherIdentity = { uid: 'workspace-owner-2', email: 'owner@example.test', displayName: 'Different UID' };
async function invoke(handler, path, method = 'GET', body = null, user = integrationOwner) {
  const request = new Request('https://ovyx.test' + path, {
    method,
    headers: body === null ? {} : { 'content-type': 'application/json' },
    body: body === null ? undefined : JSON.stringify(body),
  });
  const response = await handler({ request, env, data: { user } });
  return { status: response.status, body: await response.json() };
}

try {
  const firstList = await invoke(handleWorkspaces, '/api/workspaces');
  assert.equal(firstList.status, 200);
  assert.equal(firstList.body.workspaces.length, 1, 'A first account visit should provision one personal workspace.');
  assert.equal(firstList.body.workspaces[0].id, 'personal');
  assert.equal(firstList.body.workspaces[0].role, 'owner');
  assert.equal(firstList.body.collaboration.supported, false, 'The API must not pretend team collaboration is enabled.');

  const created = await invoke(handleWorkspaces, '/api/workspaces', 'POST', {
    action: 'create',
    name: 'Client Studio',
    description: 'Client delivery projects',
  });
  assert.equal(created.status, 201);
  const workspaceId = created.body.workspace.id;
  assert.match(workspaceId, /^ws_[A-Za-z0-9]+$/);
  assert.equal(created.body.workspace.name, 'Client Studio');

  const renamed = await invoke(handleWorkspaces, '/api/workspaces', 'POST', {
    action: 'update', workspaceId, name: 'Client Operations', description: 'Active client work',
  });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.body.workspace.name, 'Client Operations');

  const archived = await invoke(handleWorkspaces, '/api/workspaces', 'POST', { action: 'archive', workspaceId });
  assert.equal(archived.status, 200);
  assert.equal(archived.body.workspace.status, 'archived');

  const defaultArchive = await invoke(handleWorkspaces, '/api/workspaces', 'POST', { action: 'archive', workspaceId: 'personal' });
  assert.equal(defaultArchive.status, 400);
  assert.equal(defaultArchive.body.code, 'DEFAULT_WORKSPACE_REQUIRED');

  const restored = await invoke(handleWorkspaces, '/api/workspaces', 'POST', { action: 'restore', workspaceId });
  assert.equal(restored.status, 200);
  assert.equal(restored.body.workspace.status, 'active');

  const saved = await invoke(handleProjects, '/api/projects', 'POST', {
    workspaceId,
    project: { id: 'stage6-workspace-project', name: 'Workspace scoped site', status: 'draft', pages: [{ name: 'Home' }] },
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.project.workspaceId, workspaceId);

  const inWorkspace = await invoke(handleProjects, '/api/projects?workspaceId=' + workspaceId);
  assert.equal(inWorkspace.status, 200);
  assert.equal(inWorkspace.body.projects.length, 1);
  assert.equal(inWorkspace.body.projects[0].id, 'stage6-workspace-project');

  const inPersonal = await invoke(handleProjects, '/api/projects?workspaceId=personal');
  assert.equal(inPersonal.status, 200);
  assert.equal(inPersonal.body.projects.length, 0, 'A project must not leak into the personal workspace inventory.');

  const details = await invoke(handleProjects, '/api/projects?projectId=stage6-workspace-project');
  assert.equal(details.status, 200);
  assert.equal(details.body.project.name, 'Workspace scoped site');

  const archivedAgain = await invoke(handleWorkspaces, '/api/workspaces', 'POST', { action: 'archive', workspaceId });
  assert.equal(archivedAgain.status, 200);
  const archivedRead = await invoke(handleProjects, '/api/projects?workspaceId=' + workspaceId);
  assert.equal(archivedRead.status, 200, 'Archived workspace projects remain readable for recovery and restore.');
  const archivedWrite = await invoke(handleProjects, '/api/projects', 'POST', {
    workspaceId,
    project: { id: 'stage6-archived-write', name: 'Must not save', pages: [] },
  });
  assert.equal(archivedWrite.status, 404, 'Archived workspaces must reject new project writes.');

  const foreignWorkspace = await invoke(handleProjects, '/api/projects?workspaceId=' + workspaceId, 'GET', null, otherIdentity);
  assert.equal(foreignWorkspace.status, 404, 'A different Firebase UID must not read another owner workspace.');
  const foreignProject = await invoke(handleProjects, '/api/projects?projectId=stage6-workspace-project', 'GET', null, otherIdentity);
  assert.equal(foreignProject.status, 404, 'A different Firebase UID must not read another owner project.');

  const foreignWorkspaceUpdate = await invoke(handleWorkspaces, '/api/workspaces', 'POST', {
    action: 'update', workspaceId, name: 'Hijack attempt',
  }, otherIdentity);
  assert.equal(foreignWorkspaceUpdate.status, 404, 'Workspace updates must remain owner-scoped.');
} finally {
  globalThis.fetch = originalFetch;
}

console.log('OVYX workspace management integration tests passed.');
