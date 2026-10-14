import assert from 'node:assert/strict';
import { collectSentinelCIMetadata } from '../functions/_lib/ovyx-sentinel-ci.js';

const secret = 'ghp_testcredentialthatmustneverappear000000000000';
let calls = [];
const now = Date.parse('2026-10-14T10:00:00.000Z');
const fakeFetch = async (url, init = {}) => {
  const parsed = new URL(String(url));
  calls.push({ url: parsed.toString(), headers: new Headers(init.headers || {}) });
  if (parsed.pathname.endsWith('/actions/runs')) {
    return Response.json({
      workflow_runs: [
        { id: 101, workflow_id: 10, name: 'Build pipeline', status: 'completed', conclusion: 'failure', created_at: '2026-10-14T07:00:00Z' },
        { id: 102, workflow_id: 10, name: 'Build pipeline', status: 'completed', conclusion: 'success', created_at: '2026-10-14T08:00:00Z' },
        { id: 203, workflow_id: 20, name: 'Security checks', status: 'completed', conclusion: 'failure', created_at: '2026-10-14T08:30:00Z' },
        { id: 300, workflow_id: 30, name: 'In progress', status: 'in_progress', conclusion: null, created_at: '2026-10-14T09:00:00Z' }
      ]
    });
  }
  if (parsed.pathname.endsWith('/actions/runs/203/jobs')) {
    return Response.json({
      jobs: [
        { name: 'Unit tests', conclusion: 'failure', steps: [
          { name: 'Install dependencies', conclusion: 'success', number: 1 },
          { name: 'Run tests TOKEN=' + secret, conclusion: 'failure', number: 4 },
          { name: 'Cleanup', conclusion: 'success', number: 5 }
        ] },
        { name: 'Build', conclusion: 'success', steps: [{ name: 'Compile', conclusion: 'success', number: 1 }] }
      ]
    });
  }
  throw new Error('Unexpected GitHub endpoint: ' + parsed.pathname);
};

calls = [];
const missing = await collectSentinelCIMetadata({ env: {}, fetchImpl: fakeFetch, now: () => now });
assert.equal(missing.status, 'skipped');
assert.equal(missing.code, 'GITHUB_TOKEN_NOT_CONFIGURED');
assert.equal(calls.length, 0, 'no optional GitHub credential must mean no GitHub requests');

calls = [];
const report = await collectSentinelCIMetadata({
  env: { OVYX_SENTINEL_GITHUB_TOKEN: secret },
  fetchImpl: fakeFetch,
  now: () => now
});
assert.equal(report.status, 'fail');
assert.equal(report.code, 'LATEST_CI_FAILURES_FOUND');
assert.equal(report.latestCompletedWorkflowCount, 2, 'in-progress workflows are not falsely counted as completed');
assert.equal(report.failedWorkflows.length, 1, 'the older failure is ignored when the latest run of that workflow succeeded');
assert.equal(report.failedWorkflows[0].workflow, 'Security checks');
assert.equal(report.failedWorkflows[0].failedJobs[0].job, 'Unit tests');
assert.deepEqual(report.failedWorkflows[0].failedJobs[0].failedSteps, [
  { name: 'Run tests TOKEN=[redacted]', conclusion: 'failure', number: 4 }
]);
assert.equal(calls.length, 2, 'only recent run metadata and the failed run jobs endpoint are queried');
assert.equal(calls.every(item => item.headers.get('authorization') === 'Bearer ' + secret), true);
assert.equal(JSON.stringify(report).includes(secret), false, 'credential values must not enter diagnostic context');
assert.equal(JSON.stringify(report).includes('https://api.github.com'), false, 'internal request URLs must not be returned');

const rejected = await collectSentinelCIMetadata({
  env: { OVYX_SENTINEL_GITHUB_TOKEN: secret },
  fetchImpl: async () => new Response('credential must not be returned', { status: 403 }),
  now: () => now
});
assert.equal(rejected.status, 'unavailable');
assert.equal(rejected.code, 'GITHUB_TOKEN_REJECTED');
assert.equal(JSON.stringify(rejected).includes(secret), false);

const timeout = await collectSentinelCIMetadata({
  env: { OVYX_SENTINEL_GITHUB_TOKEN: secret },
  fetchImpl: async () => { throw Object.assign(new Error('timeout'), { name: 'AbortError' }); },
  now: () => now
});
assert.equal(timeout.status, 'unavailable');
assert.equal(timeout.code, 'GITHUB_ACTIONS_TIMEOUT');

console.log('Sentinel CI metadata tests passed: optional auth, latest-per-workflow semantics, failure-step evidence, deadline, permission failure and credential redaction.');
