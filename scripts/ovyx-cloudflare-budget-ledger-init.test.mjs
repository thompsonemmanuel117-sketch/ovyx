import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { createFirestoreDocumentIfAbsent } from '../functions/_lib/firebase-admin.js';
import { runCloudflareFreeInference } from '../functions/_lib/cloudflare-free-ai.js';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, publicExponent: 0x10001 });
const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
const env = {
  FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
    client_email: 'ovyx-budget-ledger-test@example.invalid',
    private_key: privateKeyPem,
    project_id: 'ovyx-budget-ledger-test',
  }),
  OVYX_AI_ENGINE_MODE: 'cloudflare-free-only',
};
let storedDocument = null;
let version = 0;
let modelCalls = 0;
let createCalls = 0;
const originalFetch = globalThis.fetch;

function okJson(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
function makeFirestoreDocument() {
  return {
    name: 'projects/ovyx-budget-ledger-test/databases/(default)/documents/system/config',
    fields: storedDocument,
    updateTime: `v${version}`,
  };
}

try {
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));

    if (url.origin === 'https://oauth2.googleapis.com' && url.pathname === '/token') {
      return okJson({ access_token: 'test-only-fake-access-token', expires_in: 3600 });
    }

    assert.equal(url.origin, 'https://firestore.googleapis.com');
    assert.match(url.pathname, /\/projects\/ovyx-budget-ledger-test\/databases\/\(default\)\/documents/);

    if (init.method === 'GET' && url.pathname.endsWith('/system/config')) {
      return storedDocument ? okJson(makeFirestoreDocument()) : new Response('', { status: 404 });
    }

    if (init.method === 'POST' && url.pathname.endsWith('/documents/system') && url.searchParams.get('documentId') === 'config') {
      createCalls += 1;
      if (storedDocument) {
        return okJson({ error: { status: 'ALREADY_EXISTS' } }, 409);
      }
      storedDocument = JSON.parse(init.body).fields;
      version += 1;
      return okJson(makeFirestoreDocument());
    }

    if (init.method === 'PATCH' && url.pathname.endsWith('/system/config')) {
      if (!storedDocument || url.searchParams.get('currentDocument.updateTime') !== `v${version}`) {
        return okJson({ error: { status: 'ABORTED' } }, 409);
      }
      const patch = JSON.parse(init.body).fields || {};
      for (const key of url.searchParams.getAll('updateMask.fieldPaths')) {
        if (Object.prototype.hasOwnProperty.call(patch, key)) storedDocument[key] = patch[key];
        else delete storedDocument[key];
      }
      version += 1;
      return okJson(makeFirestoreDocument());
    }

    throw new Error('Unexpected mocked request: ' + init.method + ' ' + url.pathname);
  };

  const result = await runCloudflareFreeInference(env, {
    messages: [{ role: 'user', content: 'Reply with exactly OVYX_PROVIDER_READY.' }],
    maxTokens: 8,
    timeoutMs: 2000,
  });

  assert.equal(result.model, '@cf/qwen/qwen3-30b-a3b-fp8');
  assert.equal(result.result.response, 'OVYX_PROVIDER_READY');
  assert.equal(modelCalls, 0, 'modelCalls remains zero until the explicit AI binding below is supplied');
  assert.ok(storedDocument, 'missing system/config document should be created atomically');
  assert.equal(storedDocument._ovyxWorkersAiDayUtc.stringValue, new Date().toISOString().slice(0, 10));
  assert.equal(storedDocument._ovyxWorkersAiReservedNeurons.integerValue, '0');
  assert.ok(Number(storedDocument._ovyxWorkersAiConsumedNeurons.integerValue) > 0);
  assert.equal(createCalls, 1, 'ledger document should be initialized once, not overwritten');

  await assert.rejects(
    () => createFirestoreDocumentIfAbsent(env, 'system', 'config', {
      _ovyxWorkersAiDayUtc: new Date().toISOString().slice(0, 10),
      _ovyxWorkersAiConsumedNeurons: 0,
      _ovyxWorkersAiReservedNeurons: 0,
      _ovyxWorkersAiRequestCount: 0,
    }),
    error => error?.code === 'FIRESTORE_DOCUMENT_ALREADY_EXISTS' && error?.status === 409,
  );
  assert.equal(createCalls, 2);
  console.log('OVYX Cloudflare AI budget ledger atomic initialization test passed.');
} finally {
  globalThis.fetch = originalFetch;
}
