import assert from 'node:assert/strict';
import { onRequestGet } from '../functions/api/app-studio/release-health.js';

const originalFetch = globalThis.fetch;
const calls = [];
let aliases = ['https://coastal-preview.pages.dev'];
let deploymentStatus = 'active';
let pageStatus = 200;

globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  calls.push({ url, method: init.method || 'GET', headers: init.headers || {} });
  if (url.includes('api.cloudflare.com/client/v4/')) {
    return new Response(JSON.stringify({
      success: true,
      result: {
        id: 'deployment-123',
        environment: 'production',
        status: 'success',
        aliases,
        stages: [{ name: 'deploy', status: deploymentStatus }],
        created_on: '2026-10-18T12:00:00.000Z',
        modified_on: '2026-10-18T12:01:00.000Z'
      }
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (url === 'https://coastal-preview.pages.dev/') {
    return new Response('ok', { status: pageStatus, headers: { 'content-type': 'text/html; charset=utf-8' } });
  }
  throw new Error('Unexpected fetch URL in release health test: ' + url);
};

function context(query, capabilities = { cloudflareDeploy: true }) {
  return {
    request: new Request('https://ovyx.example/api/app-studio/release-health?' + query, {
      method: 'GET',
      headers: { Authorization: 'Bearer test-token' }
    }),
    env: { CLOUDFLARE_API_TOKEN: 'server-only-test-token', CLOUDFLARE_ACCOUNT_ID: 'test-account' },
    data: {
      user: { uid: 'owner-uid-123', sub: 'owner-uid-123', email: 'owner@example.test', emailVerified: true },
      entitlements: { capabilities }
    }
  };
}

try {
  const params = new URLSearchParams({ projectId: 'link-coastal-living', deploymentId: 'deployment-123', projectName: 'Coastal Living' });
  let response = await onRequestGet(context(params.toString()));
  let result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.ok, true);
  assert.equal(result.authoritative, true);
  assert.equal(result.deployment.deploymentId, 'deployment-123');
  assert.equal(result.deployment.environment, 'production');
  assert.equal(result.health.status, 'healthy');
  assert.equal(result.health.checked, true);
  assert.equal(result.health.reachable, true);
  assert.equal(result.health.httpStatus, 200);
  assert.ok(calls.some(call => call.url.startsWith('https://api.cloudflare.com/client/v4/')), 'The health report must read the authoritative provider record.');
  assert.ok(calls.some(call => call.url === 'https://coastal-preview.pages.dev/'), 'The health checker must probe the provider-returned HTTPS Pages alias.');

  calls.length = 0;
  pageStatus = 503;
  response = await onRequestGet(context(params.toString()));
  result = await response.json();
  assert.equal(response.status, 200, 'A health failure is a diagnostic result, not a status-endpoint transport failure.');
  assert.equal(result.health.status, 'needs-attention');
  assert.equal(result.health.reachable, false);
  assert.equal(result.health.httpStatus, 503);

  calls.length = 0;
  pageStatus = 200;
  aliases = ['https://attacker.example/'];
  response = await onRequestGet(context(params.toString()));
  result = await response.json();
  assert.equal(result.health.checked, false, 'The health endpoint must not fetch arbitrary domains supplied as deployment aliases.');
  assert.equal(result.health.reachable, false);
  assert.ok(!calls.some(call => call.url.startsWith('https://attacker.example')), 'Health checks must not turn the endpoint into a caller-steered URL fetcher.');

  calls.length = 0;
  response = await onRequestGet(context(params.toString(), { cloudflareDeploy: false }));
  result = await response.json();
  assert.equal(response.status, 403);
  assert.equal(result.code, 'CLOUDFLARE_DEPLOY_NOT_INCLUDED');
  assert.equal(calls.length, 0, 'A caller without the server-authoritative deploy capability must not trigger provider calls.');

  response = await onRequestGet(context('deploymentId=deployment-123&projectName=Coastal'));
  result = await response.json();
  assert.equal(response.status, 400);
  assert.equal(result.code, 'RELEASE_IDENTIFIERS_REQUIRED');

  aliases = ['https://coastal-preview.pages.dev'];
  deploymentStatus = 'active';
  console.log('OVYX Stage 6 release health checks passed: provider-authenticated deployment lookup, bounded public URL probe, failure diagnosis, SSRF boundary and server-side entitlement enforcement.');
} finally {
  globalThis.fetch = originalFetch;
}
