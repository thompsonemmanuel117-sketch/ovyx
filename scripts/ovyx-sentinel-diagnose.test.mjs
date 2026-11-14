import assert from 'node:assert/strict';
import { collectSentinelCIMetadata } from '../functions/_lib/ovyx-sentinel-ci.js';
import {
  buildSentinelDiagnosticInput,
  extractSentinelDiagnosticText,
  onRequest,
} from '../functions/api/admin/sentinel-diagnose.js';

const now = Date.parse('2026-10-14T08:00:00.000Z');
const report = {
  id: 'run_123',
  status: 'critical',
  source: 'scheduled',
  startedAt: '2026-10-14T07:59:00.000Z',
  finishedAt: '2026-10-14T08:00:00.000Z',
  checkedCount: 4,
  passedCount: 2,
  criticalCount: 1,
  warningCount: 1,
  checks: [
    { id: 'platform_health', path: '/api/health', status: 'warning', code: 'PLATFORM_HEALTH_DEGRADED', httpStatus: 200, durationMs: 28, summary: 'Required configuration is missing.', details: ['FIREBASE_PROJECT_ID'] },
    { id: 'ai_gemini', path: 'Gemini credential', status: 'fail', code: 'PROVIDER_AUTH_FAILED', httpStatus: 401, durationMs: 102, summary: 'Gemini rejected the credential (HTTP 401); check whether it was revoked.', details: [] },
    { id: 'unknown', path: 'x', status: 'fail', code: 'PROVIDER_AUTH_FAILED', summary: 'Bearer abcdefghijklmnopqrstuvwxyz123456' },
  ],
};

const built = buildSentinelDiagnosticInput(report, now);
assert.equal(built.ok, true);
assert.equal(built.value.reportId, 'run_123');
assert.equal(built.value.status, 'critical');
assert.equal(built.value.checks.length, 3);
assert.equal(built.value.checks[0].details[0], 'FIREBASE_PROJECT_ID');
assert.equal(built.value.checks[2].summary.includes('abcdefghijklmnopqrstuvwxyz123456'), false, 'credential-like values in summaries are redacted');
assert.equal(JSON.stringify(built.value).includes('userPrivatePrompt'), false);

assert.equal(buildSentinelDiagnosticInput(null, now).code, 'SENTINEL_REPORT_REQUIRED');
assert.equal(buildSentinelDiagnosticInput({ ...report, finishedAt: 'not-a-date' }, now).code, 'SENTINEL_REPORT_INVALID');
assert.equal(buildSentinelDiagnosticInput({ ...report, finishedAt: '2026-10-12T08:00:00.000Z' }, now).code, 'SENTINEL_REPORT_STALE');
assert.equal(buildSentinelDiagnosticInput({ ...report, finishedAt: '2026-10-14T09:00:00.000Z' }, now).code, 'SENTINEL_REPORT_STALE');
assert.equal(extractSentinelDiagnosticText({ response: 'Findings: Gemini returned HTTP 401.' }), 'Findings: Gemini returned HTTP 401.');
assert.equal(extractSentinelDiagnosticText({ response: '' }), '');

const unauth = await onRequest({
  request: new Request('https://ovyx.invalid/api/admin/sentinel-diagnose', { method: 'POST', body: JSON.stringify({ action: 'diagnose' }) }),
  env: {},
  data: {},
});
assert.equal(unauth.status, 401, 'diagnostic endpoint must reject requests without a Firebase bearer token');

const crossOrigin = await onRequest({
  request: new Request('https://ovyx.invalid/api/admin/sentinel-diagnose', {
    method: 'POST',
    headers: { Origin: 'https://attacker.invalid' },
    body: JSON.stringify({ action: 'diagnose' }),
  }),
  env: {},
  data: {},
});
assert.equal(crossOrigin.status, 403, 'cross-origin requests must be rejected before authentication');

const method = await onRequest({
  request: new Request('https://ovyx.invalid/api/admin/sentinel-diagnose', { method: 'GET' }),
  env: {},
  data: {},
});
assert.equal(method.status, 405, 'the diagnostic route must not allow read or write actions over GET');


const ciToken = 'ghp_ci_test_credential_that_must_not_be_returned_0123456789';
let ciCalls = [];
const ciFetch = async (url, init = {}) => {
  const parsed = new URL(String(url));
  ciCalls.push({ url: parsed.toString(), headers: new Headers(init.headers || {}) });
  if (parsed.pathname.endsWith('/actions/runs')) {
    return Response.json({ workflow_runs: [
      { id: 100, workflow_id: 10, name: 'Build', status: 'completed', conclusion: 'failure', created_at: '2026-10-14T07:00:00Z' },
      { id: 101, workflow_id: 10, name: 'Build', status: 'completed', conclusion: 'success', created_at: '2026-10-14T08:00:00Z' },
      { id: 202, workflow_id: 20, name: 'Security', status: 'completed', conclusion: 'failure', created_at: '2026-10-14T08:30:00Z' },
      { id: 300, workflow_id: 30, name: 'Still running', status: 'in_progress', conclusion: null, created_at: '2026-10-14T09:00:00Z' }
    ] });
  }
  if (parsed.pathname.endsWith('/actions/runs/202/jobs')) {
    return Response.json({ jobs: [{ name: 'Unit tests', conclusion: 'failure', steps: [
      { name: 'Run tests TOKEN=' + ciToken, conclusion: 'failure', number: 4 }
    ] }] });
  }
  throw new Error('Unexpected GitHub request');
};

ciCalls = [];
const ciSkipped = await collectSentinelCIMetadata({ env: {}, fetchImpl: ciFetch, now: () => now });
assert.equal(ciSkipped.status, 'skipped');
assert.equal(ciCalls.length, 0, 'missing optional token must not create outbound GitHub calls');

ciCalls = [];
const ciReport = await collectSentinelCIMetadata({
  env: { OVYX_SENTINEL_GITHUB_TOKEN: ciToken },
  fetchImpl: ciFetch,
  now: () => now,
});
assert.equal(ciReport.status, 'fail');
assert.equal(ciReport.latestCompletedWorkflowCount, 2);
assert.equal(ciReport.failedWorkflows.length, 1, 'older failures are ignored when a workflow has a newer successful run');
assert.equal(ciReport.failedWorkflows[0].workflow, 'Security');
assert.deepEqual(ciReport.failedWorkflows[0].failedJobs[0].failedSteps, [
  { name: 'Run tests TOKEN=[redacted]', conclusion: 'failure', number: 4 }
]);
assert.equal(ciCalls.length, 2, 'diagnosis retrieves only recent runs and metadata for a failed run');
assert.equal(ciCalls.every(call => call.headers.get('authorization') === 'Bearer ' + ciToken), true);
assert.equal(JSON.stringify(ciReport).includes(ciToken), false, 'GitHub credentials must not appear in diagnosis evidence');
assert.equal(JSON.stringify(ciReport).includes('https://api.github.com'), false);
const ciDenied = await collectSentinelCIMetadata({
  env: { OVYX_SENTINEL_GITHUB_TOKEN: ciToken },
  fetchImpl: async () => new Response('do not echo this body', { status: 403 }),
  now: () => now,
});
assert.equal(ciDenied.status, 'unavailable');
assert.equal(ciDenied.code, 'GITHUB_TOKEN_REJECTED');
assert.equal(JSON.stringify(ciDenied).includes(ciToken), false);

console.log('Sentinel AI diagnostic tests passed: trusted saved report only, stale-report rejection, credential redaction, output bounds, authentication, origin and method guards.');
