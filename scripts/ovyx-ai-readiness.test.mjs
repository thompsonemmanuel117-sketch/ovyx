import assert from 'node:assert/strict';
import { buildOvyxAiReadiness, onRequest, onRequestGet } from '../functions/api/ai/readiness.js';

const context = (env = {}, user = { uid: 'user-1', sub: 'user-1', email: 'user@example.test' }, method = 'GET') => ({
  request: new Request('https://ovyx.test/api/ai/readiness', { method }),
  env,
  data: user ? { user } : {},
});

assert.deepEqual(buildOvyxAiReadiness(), {
  status: 'not_configured', source: 'none', canTry: false, liveInferenceTested: false,
});
assert.deepEqual(buildOvyxAiReadiness({ workersAiBinding: true }), {
  status: 'cloudflare_configured', source: 'cloudflare-workers-ai', canTry: true, liveInferenceTested: false,
});
// Legacy saved Brain values are intentionally ignored. They cannot make the
// platform look ready or trigger a connection lookup after the Cloudflare-only migration.
assert.deepEqual(buildOvyxAiReadiness({ selectedBrainId: 'private-id' }), {
  status: 'not_configured', source: 'none', canTry: false, liveInferenceTested: false,
});
assert.deepEqual(buildOvyxAiReadiness({ workersAiBinding: true, selectedBrainId: 'private-id' }), {
  status: 'cloudflare_configured', source: 'cloudflare-workers-ai', canTry: true, liveInferenceTested: false,
});

let inferenceCalls = 0;
let legacySelectionLookups = 0;
const env = { AI: { run: async () => { inferenceCalls += 1; return { response: 'must not be called' }; } } };
const configured = await onRequestGet(context(env), {
  getActiveBrainConnectionId: async () => { legacySelectionLookups += 1; throw new Error('must not be consulted'); }
});
const configuredBody = await configured.json();
assert.equal(configured.status, 200);
assert.equal(configuredBody.status, 'cloudflare_configured');
assert.equal(configuredBody.source, 'cloudflare-workers-ai');
assert.equal(configuredBody.liveInferenceTested, false);
assert.equal(configured.headers.get('cache-control'), 'no-store');
assert.equal(configured.headers.get('x-content-type-options'), 'nosniff');
assert.equal(inferenceCalls, 0, 'readiness must never run model inference or spend usage');
assert.equal(legacySelectionLookups, 0, 'readiness must not inspect personal AI Brain records');
assert.equal(JSON.stringify(configuredBody).includes('private-id'), false);

const legacyOnly = await onRequestGet(context({}), {
  getActiveBrainConnectionId: async () => { legacySelectionLookups += 1; return 'private-id'; }
});
const legacyOnlyBody = await legacyOnly.json();
assert.equal(legacyOnly.status, 200);
assert.equal(legacyOnlyBody.status, 'not_configured', 'a legacy personal Brain must not make the platform look configured');
assert.equal(legacyOnlyBody.canTry, false);
assert.match(legacyOnlyBody.message, /Cloudflare Workers AI must be enabled/);
assert.equal(JSON.stringify(legacyOnlyBody).includes('private-id'), false);
assert.equal(legacySelectionLookups, 0);

const unauthorized = await onRequestGet(context({}, null), {
  getActiveBrainConnectionId: async () => { legacySelectionLookups += 1; throw new Error('must not be called'); }
});
assert.equal(unauthorized.status, 401);
assert.equal(legacySelectionLookups, 0);

const wrongMethod = await onRequest(context({}, { uid: 'user-1', sub: 'user-1', email: 'user@example.test' }, 'POST'));
assert.equal(wrongMethod.status, 405);
assert.equal(inferenceCalls, 0);
console.log('OVYX AI readiness tests passed: authenticated, no-inference, no-secret, quota-safe and honest about unverified live access.');
