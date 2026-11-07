import assert from 'node:assert/strict';
import fs from 'node:fs';
import { generateKeyPairSync, webcrypto } from 'node:crypto';
import { onRequestGet } from '../functions/api/admin/logs.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' }
});

const env = {
  FIREBASE_WEB_API_KEY: 'test-web-api-key',
  FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
    project_id: 'ovyx-audit-test',
    client_email: 'audit-test@ovyx-audit-test.iam.gserviceaccount.com',
    private_key: privateKey
  })
};

const originalFetch = globalThis.fetch;
let fetchCalls = [];
let firestoreUrl = '';

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function request({ token = 'test-id-token', origin = 'https://ovyx.test', pageToken = '' } = {}) {
  const url = new URL('https://ovyx.test/api/admin/logs');
  if (pageToken) url.searchParams.set('pageToken', pageToken);
  return new Request(url, {
    method: 'GET',
    headers: {
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(origin ? { Origin: origin } : {})
    }
  });
}

try {
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    fetchCalls.push({ url: target, options });
    if (target.includes('identitytoolkit.googleapis.com/v1/accounts:lookup')) {
      const body = JSON.parse(options.body || '{}');
      assert.equal(body.idToken, 'test-id-token');
      const email = globalThis.__auditTestEmail || 'ovyxsupportteam@gmail.com';
      return response({ users: [{ localId: 'audit-test-user', email, emailVerified: true }] });
    }
    if (target === 'https://oauth2.googleapis.com/token') {
      return response({ access_token: 'test-google-access-token', expires_in: 3600 });
    }
    if (target.includes('firestore.googleapis.com/v1/projects/ovyx-audit-test/databases/(default)/documents/audit_logs')) {
      firestoreUrl = target;
      assert.equal(options.headers.Authorization, 'Bearer test-google-access-token');
      return response({
        documents: [{
          name: 'projects/ovyx-audit-test/databases/(default)/documents/audit_logs/log-1',
          fields: {
            user: { stringValue: 'admin@example.com' },
            action: { stringValue: 'plan.updated' },
            resource: { stringValue: 'user/target-1' },
            timestamp: { timestampValue: '2026-11-07T10:00:00.000Z' },
            requestId: { stringValue: 'req-123' },
            ipAddress: { stringValue: '203.0.113.10' },
            result: { stringValue: 'SUCCESS' }
          }
        }],
        nextPageToken: 'next-page-token'
      });
    }
    throw new Error('Unexpected outbound request: ' + target);
  };

  fetchCalls = [];
  const missingAuth = await onRequestGet({ request: request({ token: '' }), env });
  assert.equal(missingAuth.status, 401, 'Unauthenticated requests must be rejected.');
  assert.equal(fetchCalls.length, 0, 'Missing credentials must not trigger upstream requests.');

  const foreignOrigin = await onRequestGet({
    request: request({ origin: 'https://attacker.example' }),
    env
  });
  assert.equal(foreignOrigin.status, 403, 'Cross-origin requests must be rejected.');
  assert.equal(fetchCalls.length, 0, 'Origin rejection must happen before Firebase verification.');

  globalThis.__auditTestEmail = 'ordinary-user@example.com';
  const nonAdmin = await onRequestGet({ request: request(), env });
  assert.equal(nonAdmin.status, 403, 'A non-owner account must not read audit records.');
  assert.equal(fetchCalls.length, 1, 'Non-owner identity must be rejected before Firestore access.');

  globalThis.__auditTestEmail = 'OVYXSupportTeam@gmail.com';
  const ownerResponse = await onRequestGet({
    request: request({ pageToken: 'cursor-1' }),
    env
  });
  assert.equal(ownerResponse.status, 200, 'The configured administrator identity must read audit records.');
  assert.equal(ownerResponse.headers.get('cache-control'), 'no-store, no-cache, must-revalidate');
  assert.equal(ownerResponse.headers.get('access-control-allow-origin'), null, 'The endpoint must not publish wildcard CORS.');
  const payload = await ownerResponse.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.authority, 'SERVER');
  assert.equal(payload.logs.length, 1);
  assert.deepEqual(payload.logs[0], {
    id: 'log-1',
    user: 'admin@example.com',
    action: 'plan.updated',
    resource: 'user/target-1',
    timestamp: '2026-11-07T10:00:00.000Z',
    requestId: 'req-123',
    ipAddress: '203.0.113.10',
    result: 'SUCCESS'
  });
  assert.equal(payload.nextPageToken, 'next-page-token');
  assert.ok(firestoreUrl.includes('pageSize=50'), 'The server must enforce a bounded page size.');
  assert.ok(firestoreUrl.includes('pageToken=cursor-1'), 'The Firestore cursor must be forwarded for pagination.');

  const invalidCursor = await onRequestGet({
    request: request({ pageToken: 'x'.repeat(4001) }),
    env
  });
  assert.equal(invalidCursor.status, 400, 'Oversized pagination cursors must be rejected.');
  assert.equal(fetchCalls.length, 4, 'Invalid cursors must be rejected without another upstream request.');

  const ui = fs.readFileSync(new URL('../assets/ovyx-admin-controls.js', import.meta.url), 'utf8');
  assert.ok(ui.includes("function mountAuditLogs()"), 'The Admin monitoring workspace must expose the audit trail.');
  assert.ok(ui.includes("api('/api/admin/logs?' + query.toString())"), 'The audit UI must use the protected server endpoint.');
  assert.ok(ui.includes("if (view === 'admin-telemetry') mountAuditLogs();"), 'The audit trail must mount inside the existing Admin monitoring area.');
  assert.ok(ui.includes('textContent = String(log.action'), 'Audit data must be rendered as text, not injected as HTML.');

  const endpoint = fs.readFileSync(new URL('../functions/api/admin/logs.js', import.meta.url), 'utf8');
  assert.ok(endpoint.includes("normalizeEmail(auth.user.email) !== ROOT_EMAIL"), 'Audit access must use the configured administrator email.');
  assert.ok(endpoint.includes('enforceSameOrigin(request)'), 'The audit endpoint must enforce same-origin requests.');
  assert.ok(endpoint.includes('listFirestoreDocuments'), 'The audit endpoint must use authenticated Firestore access.');
  assert.doesNotMatch(endpoint, /Access-Control-Allow-Origin\s*:\s*['"]\*['"]/, 'Wildcard CORS must not be restored.');

  console.log('OVYX Stage 11 audit-log tests passed: owner-only access, origin protection, authenticated Firestore reads, bounded pagination, safe rendering, and monitoring UI.');
} finally {
  globalThis.fetch = originalFetch;
  delete globalThis.__auditTestEmail;
}
