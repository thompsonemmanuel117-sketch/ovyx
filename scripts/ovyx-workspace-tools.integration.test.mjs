import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { onRequestPost } from '../functions/api/ai/workspace-tools.js';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const serviceAccount = {
  client_email: 'ovyx-test@example.iam.gserviceaccount.com',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  project_id: 'ovyx-workspace-test',
};
const owner = { uid: 'owner-uid', email: 'owner@example.com' };
const projectId = 'project-safe-edit-1';
const projectPath = 'users/owner@example.com/projects/' + projectId;
const originalSource = '<!doctype html>\n<html><body><main>Original content</main></body></html>';
const proposedSource = '<!doctype html>\n<html><body><main>Updated content</main><footer>New footer</footer></body></html>';
const documents = new Map();
let clock = 0;
const updateTime = () => new Date(Date.UTC(2026, 0, 1, 0, 0, ++clock)).toISOString();

function encodeValue(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isSafeInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === 'string') return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (value && typeof value === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encodeValue(v)])) } };
  return { stringValue: String(value) };
}
function decodeValue(value) {
  if (!value) return null;
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeValue);
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([k, v]) => [k, decodeValue(v)]));
  return null;
}
function documentFrom(path, data, version = updateTime()) {
  const fields = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, encodeValue(v)]));
  const doc = { name: 'projects/ovyx-workspace-test/databases/(default)/documents/' + path, fields, updateTime: version };
  documents.set(path, doc);
  return doc;
}
function dataFrom(doc) {
  return Object.fromEntries(Object.entries(doc?.fields || {}).map(([k, v]) => [k, decodeValue(v)]));
}
function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
const initialProject = {
  id: projectId,
  name: 'Safety test project',
  ownerUid: owner.uid,
  ownerEmail: owner.email,
  updatedAt: '2026-01-01T00:00:00.000Z',
  ovyxGraph: { files: {
    'index.html': { type: 'text/html', content: originalSource },
    'src/config.js': { type: 'text/javascript', content: "export const API_KEY = 'sk_test_dummy_secret_value_12345';\\nexport const mode = 'test';" },
  } },
};
documentFrom(projectPath, initialProject, '2026-01-01T00:00:00.000Z');

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  if (url.hostname === 'oauth2.googleapis.com') return response({ access_token: 'test-access-token', expires_in: 3600 });
  if (url.hostname !== 'firestore.googleapis.com') throw new Error('Unexpected network request in integration test: ' + url.href);
  const segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const marker = segments.indexOf('documents');
  const path = segments.slice(marker + 1).join('/');
  const method = String(init.method || 'GET').toUpperCase();

  if (method === 'GET' && (segments.length - marker - 1) % 2 === 1) {
    const prefix = path + '/';
    const docs = [...documents.entries()]
      .filter(([key]) => key.startsWith(prefix) && !key.slice(prefix.length).includes('/'))
      .map(([, value]) => value);
    return response({ documents: docs });
  }

  if (method === 'GET') {
    const doc = documents.get(path);
    return doc ? response(doc) : response({ error: { message: 'Not found' } }, 404);
  }

  if (method === 'PATCH') {
    const existing = documents.get(path);
    const expected = url.searchParams.get('currentDocument.updateTime');
    if (expected && (!existing || existing.updateTime !== expected)) return response({ error: { message: 'Precondition failed' } }, 409);
    const payload = JSON.parse(init.body || '{}');
    const nextData = dataFrom({ fields: payload.fields || {} });
    const merged = url.searchParams.has('updateMask.fieldPaths') && existing
      ? { ...dataFrom(existing), ...nextData }
      : nextData;
    const nextDoc = documentFrom(path, merged, updateTime());
    return response(nextDoc);
  }

  throw new Error('Unsupported mocked Firestore operation: ' + method + ' ' + path);
};

async function call(payload, user = owner) {
  const request = new Request('https://ovyx.test/api/ai/workspace-tools', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const responseValue = await onRequestPost({
    request,
    env: { FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify(serviceAccount) },
    data: { user },
  });
  return { status: responseValue.status, body: await responseValue.json() };
}

try {
  const unauthenticated = await onRequestPost({
    request: new Request('https://ovyx.test/api/ai/workspace-tools', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operation: 'snapshot' }),
    }),
    env: { FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify(serviceAccount) },
    data: {},
  });
  assert.equal(unauthenticated.status, 401, 'workspace tools must reject unsigned requests');
  const initialDoc = documents.get(projectPath);
  const readFile = await call({ operation: 'read_file', projectId, filePath: 'index.html' });
  assert.equal(readFile.status, 200, JSON.stringify(readFile.body));
  assert.equal(readFile.body.operation, 'read_file');
  assert.equal(readFile.body.file.path, 'index.html');
  assert.equal(readFile.body.file.content, originalSource, 'file reader returns the actual saved source');
  assert.equal(readFile.body.file.contentComplete, true, 'small unredacted source is marked complete for evidence-based repair');
  assert.ok(readFile.body.revision, 'file reader includes the actual saved project revision');

  const searchFile = await call({ operation: 'search', projectId, query: 'Original content' });
  assert.equal(searchFile.status, 200);
  assert.ok(searchFile.body.matches.some(match => match.path === 'index.html'), 'project search finds text in the owned saved source');

  const redactedRead = await call({ operation: 'read_file', projectId, filePath: 'src/config.js' });
  assert.equal(redactedRead.status, 200);
  assert.equal(redactedRead.body.file.contentComplete, false, 'secret-redacted source can never be marked edit-ready');
  assert.equal(redactedRead.body.file.secretValuesRedacted, true);
  assert.ok(!redactedRead.body.file.content.includes('sk_test_dummy_secret_value_12345'), 'file reader must not disclose detected secret values');

  const unsafeRead = await call({ operation: 'read_file', projectId, filePath: '../index.html' });
  assert.equal(unsafeRead.status, 400);
  assert.equal(unsafeRead.body.code, 'UNSAFE_FILE_PATH');

  const deniedRead = await call({ operation: 'read_file', projectId, filePath: 'index.html' }, { uid: 'other-uid', email: 'other@example.com' });
  assert.equal(deniedRead.status, 404, 'file reads must be scoped to the authenticated owner');

  const prepared = await call({ operation: 'prepare_patch', projectId, filePath: 'index.html', content: proposedSource, reason: 'Integration test edit' });
  assert.equal(prepared.status, 200);
  assert.equal(prepared.body.changed, true);
  assert.equal(prepared.body.approvalRequired, true);
  assert.match(prepared.body.preview, /Original content/);
  assert.match(prepared.body.preview, /Updated content/);
  assert.equal(dataFrom(documents.get(projectPath)).ovyxGraph.files['index.html'].content, originalSource, 'prepare must not write to persistence');

  const unapproved = await call({ operation: 'apply_patch', projectId, filePath: 'index.html', content: proposedSource, expectedUpdateTime: prepared.body.revision, confirm: false });
  assert.equal(unapproved.status, 403);
  assert.equal(unapproved.body.code, 'PATCH_APPROVAL_REQUIRED');
  assert.equal(dataFrom(documents.get(projectPath)).ovyxGraph.files['index.html'].content, originalSource);

  const applied = await call({ operation: 'apply_patch', projectId, filePath: 'index.html', content: proposedSource, expectedUpdateTime: prepared.body.revision, confirm: true, reason: 'Integration test edit' });
  assert.equal(applied.status, 200);
  assert.equal(applied.body.verified, true);
  assert.equal(dataFrom(documents.get(projectPath)).ovyxGraph.files['index.html'].content, proposedSource);
  assert.ok(documents.has(projectPath + '/revisions/' + applied.body.revisionId), 'the previous file must be persisted before/with the write');

  const revisions = await call({ operation: 'list_revisions', projectId });
  assert.equal(revisions.status, 200, JSON.stringify(revisions.body));
  assert.equal(revisions.body.revisions.length, 1);
  const revisionId = revisions.body.revisions[0].id;

  const restorePreview = await call({ operation: 'prepare_restore', projectId, revisionId });
  assert.equal(restorePreview.status, 200);
  assert.equal(restorePreview.body.changed, true);
  assert.match(restorePreview.body.preview, /Updated content/);
  assert.match(restorePreview.body.preview, /Original content/);

  const unapprovedRestore = await call({ operation: 'restore_revision', projectId, revisionId, expectedUpdateTime: restorePreview.body.revision, confirm: false });
  assert.equal(unapprovedRestore.status, 403);
  assert.equal(unapprovedRestore.body.code, 'RESTORE_APPROVAL_REQUIRED');
  assert.equal(dataFrom(documents.get(projectPath)).ovyxGraph.files['index.html'].content, proposedSource);

  const restored = await call({ operation: 'restore_revision', projectId, revisionId, expectedUpdateTime: restorePreview.body.revision, confirm: true });
  assert.equal(restored.status, 200);
  assert.equal(restored.body.restored, true);
  assert.equal(restored.body.verified, true);
  assert.equal(dataFrom(documents.get(projectPath)).ovyxGraph.files['index.html'].content, originalSource);
  assert.ok(documents.has(projectPath + '/revisions/' + restored.body.safetyRevisionId), 'the replaced source must remain recoverable after undo');

  const stalePreview = await call({ operation: 'prepare_patch', projectId, filePath: 'index.html', content: proposedSource, reason: 'Stale edit test' });
  const currentData = dataFrom(documents.get(projectPath));
  documentFrom(projectPath, currentData, '2026-02-01T00:00:00.000Z');
  const staleApply = await call({ operation: 'apply_patch', projectId, filePath: 'index.html', content: proposedSource, expectedUpdateTime: stalePreview.body.revision, confirm: true });
  assert.equal(staleApply.status, 409);
  assert.equal(staleApply.body.code, 'PROJECT_REVISION_CHANGED');

  const wrongOwner = await call({ operation: 'inspect', projectId }, { uid: 'other-uid', email: 'other@example.com' });
  assert.equal(wrongOwner.status, 404);
  assert.equal(wrongOwner.body.code, 'PROJECT_NOT_FOUND');

  console.log('OVYX workspace persistence integration tests passed: preview-only, approval, saved backup, read-back verification, restore preview, undo safety copy, stale revision and ownership checks.');
} finally {
  globalThis.fetch = originalFetch;
}
