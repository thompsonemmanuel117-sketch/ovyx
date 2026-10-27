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
assert.deepEqual(buildOvyxAiReadiness({ workersAiBinding: true, selectedBrainId: 'private-id' }), {
  status: 'selected_brain_configured', source: 'selected-ai-brain', canTry: true, liveInferenceTested: false,
});
assert.equal(buildOvyxAiReadiness({ workersAiBinding: true, selectionCheckFailed: true }).status, 'check_failed');

let inferenceCalls = 0;
const env = { AI: { run: async () => { inferenceCalls += 1; return { response: 'must not be called' }; } } };
const selectedNone = await onRequestGet(context(env), { getActiveBrainConnectionId: async () => null });
const selectedNoneBody = await selectedNone.json();
assert.equal(selectedNone.status, 200);
assert.equal(selectedNoneBody.status, 'cloudflare_configured');
assert.equal(selectedNoneBody.liveInferenceTested, false);
assert.equal(selectedNone.headers.get('cache-control'), 'no-store');
assert.equal(selectedNone.headers.get('x-content-type-options'), 'nosniff');
assert.equal(inferenceCalls, 0, 'readiness must never run model inference or spend usage');
assert.equal(JSON.stringify(selectedNoneBody).includes('private-id'), false);

const brainEnv = {};
const brain = await onRequestGet(context(brainEnv), { getActiveBrainConnectionId: async () => 'private-id' });
const brainBody = await brain.json();
assert.equal(brainBody.status, 'selected_brain_configured');
assert.equal(brainBody.source, 'selected-ai-brain');
assert.equal(JSON.stringify(brainBody).includes('private-id'), false, 'never expose an owner connection ID');
assert.match(brainBody.message, /did not send a model request/);
assert.equal(inferenceCalls, 0);

const missing = await onRequestGet(context({}), { getActiveBrainConnectionId: async () => null });
const missingBody = await missing.json();
assert.equal(missingBody.status, 'not_configured');
assert.equal(missingBody.canTry, false);
assert.match(missingBody.message, /Cloudflare Workers AI binding named AI/);

const lookupFailed = await onRequestGet(context(env), {
  getActiveBrainConnectionId: async () => { throw new Error('internal database detail'); },
});
const lookupFailedBody = await lookupFailed.json();
assert.equal(lookupFailed.status, 503);
assert.equal(lookupFailedBody.status, 'check_failed');
assert.equal(lookupFailedBody.liveInferenceTested, false);
assert.equal(JSON.stringify(lookupFailedBody).includes('internal database detail'), false);
assert.equal(inferenceCalls, 0);

const unauthorized = await onRequestGet(context({}, null), {
  getActiveBrainConnectionId: async () => { throw new Error('must not be called'); },
});
assert.equal(unauthorized.status, 401);

const wrongMethod = await onRequest(context({}, { uid: 'user-1', sub: 'user-1', email: 'user@example.test' }, 'POST'));
assert.equal(wrongMethod.status, 405);

console.log('OVYX AI readiness tests passed: authenticated, no-inference, no-secret, quota-safe and honest about unverified live access.');
