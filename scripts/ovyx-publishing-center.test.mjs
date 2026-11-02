import assert from 'node:assert/strict';
import { normalizeDomain, summarizeDeployment, summarizeDomain } from '../functions/api/publishing.js';

for (const value of ['example.com', 'WWW.Example.COM', 'https://example.com/', 'example.com.ng', 'shop.example.co.uk']) {
  assert.ok(normalizeDomain(value), value + ' should be accepted as a public domain');
}
for (const value of ['', 'localhost', 'example', 'https://example.com/path', 'example.com:8080', 'user@example.com', 'example.com.evil.invalid', 'project.pages.dev', 'site.workers.dev', '127.0.0.1', '*.example.com']) {
  assert.throws(() => normalizeDomain(value), undefined, value + ' must be rejected');
}
assert.equal(normalizeDomain('WWW.Example.COM'), 'www.example.com');

const healthy = summarizeDeployment({
  id: 'deployment-12345678',
  environment: 'production',
  latest_stage: { name: 'deploy', status: 'success' },
  aliases: ['https://release.example.pages.dev', 'http://unsafe.example'],
  created_on: '2026-11-01T12:00:00.000Z'
});
assert.equal(healthy.canRollback, true);
assert.equal(healthy.url, 'https://release.example.pages.dev');
assert.equal(healthy.status, 'success');

const preview = summarizeDeployment({
  id: 'preview-123',
  environment: 'preview',
  latest_stage: { name: 'deploy', status: 'success' }
});
assert.equal(preview.canRollback, false);
const failed = summarizeDeployment({
  id: 'failed-123',
  environment: 'production',
  latest_stage: { name: 'deploy', status: 'failure' }
});
assert.equal(failed.canRollback, false);

const activeDomain = summarizeDomain({
  name: 'www.example.com',
  status: 'active',
  certificate_authority: 'google',
  validation_data: { method: 'http', status: 'active' },
  verification_data: { status: 'active' }
}, 'ovyx-project.pages.dev');
assert.equal(activeDomain.httpsReady, true);
assert.deepEqual(activeDomain.dns, {
  type: 'CNAME',
  name: 'www.example.com',
  target: 'ovyx-project.pages.dev'
});
const pendingDomain = summarizeDomain({
  name: 'example.com',
  status: 'pending',
  validation_data: { method: 'txt', status: 'pending', txt_name: '_cf-custom-hostname', txt_value: 'verification-token' }
}, 'ovyx-project.pages.dev');
assert.equal(pendingDomain.httpsReady, false);
assert.equal(pendingDomain.validation.txtValue, 'verification-token');
assert.equal(pendingDomain.dns.type, 'Nameservers');

console.log('OVYX Stage 7 publishing contract tests passed.');
