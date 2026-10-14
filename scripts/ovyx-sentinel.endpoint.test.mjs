import assert from 'node:assert/strict';
import { onRequest, publicDiagnosisRecord } from '../functions/api/admin/sentinel.js';

async function call(method, { headers = {}, body, env = {} } = {}) {
  const request = new Request('https://ovyx.invalid/api/admin/sentinel', {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const response = await onRequest({ request, env, data: {} });
  return { status: response.status, body: await response.json() };
}

{
  const result = await call('GET');
  assert.equal(result.status, 401, 'unauthenticated users must not read Sentinel reports');
}
{
  const result = await call('GET', { headers: { Origin: 'https://attacker.invalid' } });
  assert.equal(result.status, 403, 'cross-origin report requests must be rejected before reading reports');
}
{
  const result = await call('PUT');
  assert.equal(result.status, 405, 'unsupported methods must be rejected');
}
{
  const result = await call('POST', { body: { action: 'scan' } });
  assert.equal(result.status, 401, 'manual scan requires authenticated administrator identity');
}
{
  const result = await call('POST', {
    headers: { 'x-ovyx-sentinel-cron-secret': 'short' },
    body: { action: 'scan' },
    env: { OVYX_SENTINEL_CRON_SECRET: 'a-long-secret-value-that-is-not-the-provided-secret-00001' },
  });
  assert.equal(result.status, 401, 'scheduled scans must reject a missing/wrong shared secret');
  assert.equal(result.body.error, 'SENTINEL_CRON_AUTH_FAILED');
}
{
  const shared = 'sentinel-cron-secret-test-value-with-32-or-more-characters';
  const result = await call('POST', {
    headers: { 'x-ovyx-sentinel-cron-secret': shared },
    body: { action: 'unexpected-delete' },
    env: { OVYX_SENTINEL_CRON_SECRET: shared },
  });
  assert.equal(result.status, 400, 'even a valid scheduler secret can only invoke the allowlisted scan action');
  assert.equal(result.body.error, 'SENTINEL_ACTION_REQUIRED');
}
{
  const shared = 'sentinel-cron-secret-test-value-with-32-or-more-characters';
  const result = await call('POST', {
    headers: { 'x-ovyx-sentinel-cron-secret': shared },
    body: { action: 'scan' },
    env: { OVYX_SENTINEL_CRON_SECRET: shared },
  });
  assert.equal(result.status, 503, 'a well-authenticated scheduled scan without Firestore configuration must fail closed and not report success');
  assert.equal(result.body.error, 'SENTINEL_SCAN_FAILED');
}


{
  const record = publicDiagnosisRecord({
    id: 'diagnosis_test',
    reportId: 'run_test',
    generatedAt: '2026-10-14T08:00:00.000Z',
    model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    diagnosis: 'a'.repeat(7000),
    changesApplied: true,
    ciEvidenceStatus: 'fake-status',
    accessToken: 'never-copy-me',
  });
  assert.equal(record.id, 'diagnosis_test');
  assert.equal(record.diagnosis.length, 6000, 'history summaries must be bounded');
  assert.equal(record.changesApplied, false, 'history must never claim Sentinel changed code');
  assert.equal(record.ciEvidenceStatus, 'unknown', 'unknown status values must be normalized');
  assert.equal('accessToken' in record, false, 'private credential fields must not be copied to the history response');
  assert.equal(publicDiagnosisRecord(null), null);
}

console.log('OVYX Sentinel endpoint tests passed: admin authentication required, same-origin guard, method allowlist, schedule-secret validation, action allowlist, and fail-closed persistence.');
