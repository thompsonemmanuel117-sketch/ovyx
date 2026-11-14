import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { normalizeDomain, summarizeDeployment, summarizeDomain, isApexDomain, isRollbackEligible } from '../functions/api/publishing.js';

for (const value of ['example.com', 'WWW.Example.COM', 'https://example.com/', 'example.com.ng', 'shop.example.co.uk']) {
  assert.ok(normalizeDomain(value), value + ' should be accepted as a public domain');
}
for (const value of ['', 'localhost', 'example', 'https://example.com/path', 'example.com:8080', 'user@example.com', 'example.com.evil.invalid', 'project.pages.dev', 'site.workers.dev', '127.0.0.1', '*.example.com']) {
  assert.throws(() => normalizeDomain(value), Error, value + ' must be rejected');
}
assert.equal(normalizeDomain('WWW.Example.COM'), 'www.example.com');
assert.equal(isApexDomain('example.co.uk'), true);
assert.equal(isApexDomain('shop.example.co.uk'), false);
assert.equal(isApexDomain('example.com.ng'), true);
assert.equal(isApexDomain('www.example.com.ng'), false);

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
assert.equal(isRollbackEligible({ environment: 'production', latest_stage: { name: 'deploy', status: 'success' } }), true);
assert.equal(isRollbackEligible({ environment: 'production', stages: [{ name: 'deploy', status: 'success' }] }), true);
assert.equal(isRollbackEligible({ environment: 'preview', latest_stage: { name: 'deploy', status: 'success' } }), false);
assert.equal(isRollbackEligible({ environment: 'production', latest_stage: { name: 'deploy', status: 'failure' } }), false);
assert.equal(isRollbackEligible({ environment: 'production', latest_stage: { name: 'build', status: 'success' } }), false);
assert.equal(isRollbackEligible({ environment: 'production', latest_stage: { name: 'deploy', status: 'success' }, is_skipped: true }), false);

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
const ukApex = summarizeDomain({ name: 'example.co.uk', status: 'pending' }, 'ovyx-project.pages.dev');
assert.equal(ukApex.dns.type, 'Nameservers');

const apiSource = readFileSync(new URL('../functions/api/publishing.js', import.meta.url), 'utf8');
const clientSource = readFileSync(new URL('../assets/ovyx-publishing-center.js', import.meta.url), 'utf8');
const middlewareSource = readFileSync(new URL('../functions/_middleware.js', import.meta.url), 'utf8');
assert.ok(apiSource.includes("'/rollback'"));
assert.ok(apiSource.includes("'add-domain'"));
assert.ok(apiSource.includes("'retry-domain'"));
assert.ok(apiSource.includes("'remove-domain'"));
assert.ok(apiSource.includes('resolveEntitlements'));
assert.ok(clientSource.includes('getIdToken(true)'));
assert.ok(clientSource.includes('/api/deployment-status'));
assert.ok(clientSource.includes('Publish to production'));
assert.ok(clientSource.includes('Create preview'));
assert.ok(clientSource.includes('Provision full-stack Preview'), 'Saved full-stack projects must get a dedicated Preview provisioning action.');
assert.ok(clientSource.includes('/api/backend/provision'), 'The publishing panel must call the authenticated full-stack provision endpoint.');
assert.ok(clientSource.includes('/api/backend/status?'), 'The publishing panel must wait for independent Preview verification.');
assert.ok(clientSource.includes("environment: 'production'"), 'The publishing panel must offer an explicit Production provisioning action.');
assert.ok(clientSource.includes('Publish this full-stack website to Production?'), 'Production promotion must require a clear owner confirmation.');
assert.ok(clientSource.includes("environment: 'preview'"), 'Preview and Production releases must be tracked separately.');
assert.ok(clientSource.includes("finalState.status === 'ready'"), 'The UI must report Preview success only after the backend status endpoint verifies it.');
assert.ok(clientSource.includes('yourdomain.com'));
assert.ok(middlewareSource.includes('ovyx-publishing-center.js'));
console.log('OVYX Stage 7 publishing contract tests passed.');
