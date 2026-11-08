import assert from 'node:assert/strict';
import { createCloudflarePagesPreviewBindingAdapter } from '../functions/_lib/backend-pages-preview-binding.js';

const accountId = 'a'.repeat(32);
const apiToken = 'test-token-that-is-long-enough';
const databaseId = '12345678-1234-4234-8234-123456789abc';
const prefix = 'ovyx-a1b2c3d4e5-';
const projectName = prefix + 'store';

function response(result, status = 200, success = true) {
  return new Response(JSON.stringify({ success, result, errors: [] }), { status });
}

const original = {
  name: projectName,
  deployment_configs: {
    preview: {
      compatibility_date: '2026-11-01',
      compatibility_flags: ['nodejs_compat'],
      env_vars: { PUBLIC_MODE: { type: 'plain_text', value: 'preview' } },
      d1_databases: { LEGACY_DB: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } },
    },
    production: {
      compatibility_date: '2026-11-01',
      d1_databases: { PRODUCTION_DB: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' } },
    },
  },
};
let saved = structuredClone(original);
const calls = [];
const adapter = createCloudflarePagesPreviewBindingAdapter({
  accountId,
  apiToken,
  fetchImpl: async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null });
    if ((init.method || 'GET') === 'GET') return response(structuredClone(saved));
    if (init.method === 'PATCH') {
      const patch = JSON.parse(init.body);
      saved = {
        ...saved,
        deployment_configs: {
          ...saved.deployment_configs,
          ...patch.deployment_configs,
        },
      };
      return response(saved);
    }
    return response({}, 405, false);
  },
});

const result = await adapter.bindPreviewD1({
  projectName,
  expectedProjectPrefix: prefix,
  databaseId,
});
assert.deepEqual(result, {
  projectName,
  environment: 'preview',
  bindingName: 'OVYX_DB',
  databaseId,
  verified: true,
});
assert.equal(calls.length, 3, 'binding setup must read, patch, and independently verify');
assert.equal(saved.deployment_configs.preview.d1_databases.OVYX_DB.id, databaseId);
assert.equal(saved.deployment_configs.preview.d1_databases.LEGACY_DB.id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
assert.equal(saved.deployment_configs.preview.compatibility_date, '2026-11-01');
assert.deepEqual(saved.deployment_configs.preview.compatibility_flags, ['nodejs_compat']);
assert.deepEqual(saved.deployment_configs.preview.env_vars, original.deployment_configs.preview.env_vars);
assert.deepEqual(saved.deployment_configs.production, original.deployment_configs.production,
  'preview provisioning must never modify Production bindings or settings');
assert.deepEqual(Object.keys(calls[1].body.deployment_configs), ['preview'],
  'the PATCH payload must not include the Production environment');
assert.ok(calls.every(call => !call.url.includes(apiToken)), 'the Cloudflare token must never appear in a request URL');

let patchCount = 0;
const conflictAdapter = createCloudflarePagesPreviewBindingAdapter({
  accountId,
  apiToken,
  fetchImpl: async (_url, init = {}) => {
    if ((init.method || 'GET') === 'PATCH') patchCount += 1;
    return response({
      name: projectName,
      deployment_configs: {
        preview: { d1_databases: { OVYX_DB: { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' } } },
      },
    });
  },
});
await assert.rejects(
  conflictAdapter.bindPreviewD1({ projectName, expectedProjectPrefix: prefix, databaseId }),
  error => error.code === 'BACKEND_PAGES_BINDING_CONFLICT' && error.status === 409,
);
assert.equal(patchCount, 0, 'a conflicting binding must fail before any write');

for (const input of [
  { projectName: 'other-customer-site', expectedProjectPrefix: prefix, databaseId },
  { projectName, expectedProjectPrefix: prefix, databaseId: 'not-a-database-id' },
  { projectName, expectedProjectPrefix: prefix, databaseId, bindingName: 'not-safe' },
]) {
  await assert.rejects(
    adapter.bindPreviewD1(input),
    error => /^BACKEND_PAGES_/.test(error.code),
  );
}

const failedVerify = createCloudflarePagesPreviewBindingAdapter({
  accountId,
  apiToken,
  fetchImpl: async (_url, init = {}) => {
    if (init.method === 'PATCH') return response({});
    return response({ name: projectName, deployment_configs: { preview: { d1_databases: {} } } });
  },
});
await assert.rejects(
  failedVerify.bindPreviewD1({ projectName, expectedProjectPrefix: prefix, databaseId }),
  error => error.code === 'BACKEND_PAGES_BINDING_VERIFY_FAILED' && error.status === 502,
);

const productionOriginal = structuredClone(original);
let productionSaved = structuredClone(productionOriginal);
const productionCalls = [];
const productionAdapter = createCloudflarePagesPreviewBindingAdapter({
  accountId,
  apiToken,
  fetchImpl: async (url, init = {}) => {
    productionCalls.push({ method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null });
    if ((init.method || 'GET') === 'GET') return response(structuredClone(productionSaved));
    if (init.method === 'PATCH') {
      const patch = JSON.parse(init.body);
      productionSaved = {
        ...productionSaved,
        deployment_configs: {
          ...productionSaved.deployment_configs,
          ...patch.deployment_configs,
        },
      };
      return response(productionSaved);
    }
    return response({}, 405, false);
  },
});
const productionResult = await productionAdapter.bindProductionD1({
  projectName, expectedProjectPrefix: prefix, databaseId, bindingName: 'DB',
});
assert.equal(productionResult.environment, 'production');
assert.equal(productionSaved.deployment_configs.production.d1_databases.DB.id, databaseId);
assert.deepEqual(productionSaved.deployment_configs.preview, productionOriginal.deployment_configs.preview,
  'Production binding must never change Preview settings');
assert.deepEqual(Object.keys(productionCalls[1].body.deployment_configs), ['production'],
  'Production provisioning must patch only the Production environment');

console.log('OVYX Pages Preview and Production D1 binding adapter tests passed.');
