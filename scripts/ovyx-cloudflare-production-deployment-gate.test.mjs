import assert from 'node:assert/strict';
import { assessProductionDeployment, waitForProductionDeployment } from './ovyx-cloudflare-production-deployment-gate.mjs';

const sha = 'a'.repeat(40);
const otherSha = 'b'.repeat(40);
function deployment({
  commit = sha,
  branch = 'main',
  environment = 'production',
  stageName = 'deploy',
  stageStatus = 'success',
  skipped = false,
  createdOn = '2026-10-26T21:00:00.000Z',
} = {}) {
  return {
    id: 'deployment-test-id',
    environment,
    created_on: createdOn,
    is_skipped: skipped,
    deployment_trigger: { metadata: { branch, commit_hash: commit } },
    latest_stage: { name: stageName, status: stageStatus },
  };
}

assert.equal(assessProductionDeployment([deployment()], sha).state, 'ready');
assert.equal(assessProductionDeployment([deployment({ commit: otherSha })], sha).state, 'not-found');
assert.equal(assessProductionDeployment([deployment({ branch: 'preview-branch' })], sha).state, 'not-found');
assert.equal(assessProductionDeployment([deployment({ environment: 'preview' })], sha).state, 'not-found');
assert.equal(assessProductionDeployment([deployment({ stageName: 'build', stageStatus: 'success' })], sha).state, 'pending');
assert.equal(assessProductionDeployment([deployment({ stageName: 'deploy', stageStatus: 'active' })], sha).state, 'pending');
assert.equal(assessProductionDeployment([deployment({ stageStatus: 'failure' })], sha).state, 'failed');
assert.equal(assessProductionDeployment([deployment({ skipped: true })], sha).state, 'failed');

const validEnv = {
  CLOUDFLARE_API_TOKEN: 'PRIVATE_TEST_TOKEN',
  CLOUDFLARE_ACCOUNT_ID: 'test-account',
  CLOUDFLARE_PAGES_PROJECT: 'ovyx',
  OVYX_EXPECTED_DEPLOYMENT_SHA: sha,
};
let requests = 0;
const logLines = [];
const ready = await waitForProductionDeployment({
  env: validEnv,
  timeoutMs: 1000,
  pollIntervalMs: 100,
  sleepImpl: async () => {},
  fetchImpl: async (url, init) => {
    requests += 1;
    assert.equal(url.hostname, 'api.cloudflare.com');
    assert.equal(url.searchParams.get('env'), 'production');
    assert.equal(url.searchParams.get('per_page'), '20');
    assert.equal(init.headers.Authorization, 'Bearer PRIVATE_TEST_TOKEN');
    return Response.json({
      success: true,
      result: requests === 1 ? [] : [deployment()],
    });
  },
  logImpl: line => logLines.push(line),
});
assert.equal(ready.status, 'ready');
assert.equal(ready.commit, sha);
assert.equal(requests, 2, 'the gate must wait while the production deployment has not appeared');
assert.equal(logLines.length, 1);
assert.equal(logLines.join('\n').includes('PRIVATE_TEST_TOKEN'), false);

await assert.rejects(
  () => waitForProductionDeployment({
    env: { ...validEnv, OVYX_EXPECTED_DEPLOYMENT_SHA: 'not-a-sha' },
    fetchImpl: async () => { throw new Error('must not make network request'); },
  }),
  /full 40-character Git commit SHA/,
);

await assert.rejects(
  () => waitForProductionDeployment({
    env: validEnv,
    fetchImpl: async () => new Response(JSON.stringify({ errors: [{ message: 'SECRET DETAIL' }] }), { status: 403 }),
  }),
  error => error.message.includes('HTTP 403') && error.message.includes('Pages Read') && !error.message.includes('SECRET DETAIL'),
);

await assert.rejects(
  () => waitForProductionDeployment({
    env: validEnv,
    fetchImpl: async () => Response.json({ success: true, result: [deployment({ stageStatus: 'failure' })] }),
  }),
  /did not succeed/,
);

assert.equal(logLines.join('\n').includes('PRIVATE_TEST_TOKEN'), false);
assert.equal(logLines.join('\n').includes('SECRET DETAIL'), false);
console.log('OVYX production deployment revision gate tests passed.');
