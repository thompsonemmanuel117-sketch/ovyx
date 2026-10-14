import assert from 'node:assert/strict';
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

console.log('Sentinel AI diagnostic tests passed: trusted saved report only, stale-report rejection, credential redaction, output bounds, authentication, origin and method guards.');
