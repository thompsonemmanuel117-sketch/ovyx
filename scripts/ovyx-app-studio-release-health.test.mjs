import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { onRequestGet } from '../functions/api/app-studio/release-health.js';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const runtime = read('assets/ovyx-app-studio-link-builder.js');
const mobileWorkflow = read('mobile-app/.eas/workflows/ovyx-mobile-build.yml');
const deployRoute = read('functions/api/deploy.js');
const mobileRoute = read('functions/api/mobile/build.js');
const statusRoute = read('functions/api/mobile/build/status.js');
const packageJson = JSON.parse(read('package.json'));
const workflow = read('.github/workflows/ovyx-assistant-workspace-browser.yml');

for (const path of [
  'functions/api/app-studio/release-health.js',
  'scripts/ovyx-app-studio-release-health.test.mjs',
  'assets/ovyx-app-studio-link-builder.js'
]) {
  execFileSync(process.execPath, ['--check', fileURLToPath(new URL('../' + path, import.meta.url))], { stdio: 'pipe' });
}

assert.ok(runtime.includes('data-lb-export-zip') && runtime.includes('data-lb-export-json'), 'The release workspace must expose ZIP and portable source JSON exports.');
assert.ok(runtime.includes('browserZipBlob') && runtime.includes('zipCrc32'), 'ZIP export must create a real ZIP archive rather than renaming a text file.');
assert.ok(runtime.includes("path.startsWith('public/') ? path.slice('public/'.length) : path"), 'Framework public/ asset paths must be rooted correctly for static Pages output.');
assert.ok(runtime.includes('validateForRelease') && runtime.includes('runtimeChecked !== true'), 'Publishing must require completed live-preview validation.');
assert.ok(runtime.includes("'/api/deploy'") && runtime.includes("action === 'publish'"), 'Web preview deployment and production publish must call the existing server deploy route.');
assert.ok(runtime.includes("'/api/deployment-status?'"), 'The release UI must retrieve current deployment status.');
assert.ok(runtime.includes("'/api/app-studio/release-health?'"), 'The release UI must display a public post-release health probe.');
assert.ok(runtime.includes("'/api/mobile/build'") && runtime.includes("'/api/mobile/build/status?'"), 'Mobile build and status actions must use the existing EAS routes.');
assert.ok(runtime.includes('mobileStandaloneHtml') && runtime.includes('ovyx-mobile-route-runtime'), 'The native WebView build must include the generated inspected pages and local route switching.');
assert.ok(runtime.includes('data-ovyx-published-actions') && runtime.includes('connect-src'), 'The published static build must disclose/localize supported actions and block arbitrary network calls.');
assert.ok(runtime.includes('window.confirm') && runtime.includes('Save the release history'), 'Publishing and cloud release-record writes must ask for confirmation.');
assert.ok(runtime.includes('saveReleaseRecord') && runtime.includes('releaseHistory'), 'Release status history must be savable through the existing authenticated OVYX Projects endpoint.');
assert.ok(runtime.includes('OVYX account APIs are available only inside the authenticated OVYX preview'), 'A public static release must not pretend it has authenticated OVYX account APIs.');
assert.ok(deployRoute.includes("body?.action==='publish'") && deployRoute.includes('onRequestPost'), 'The existing Cloudflare route must support preview and production actions.');
assert.ok(mobileRoute.includes('EAS_BUILD_NOT_CONFIGURED') && mobileRoute.includes('platforms'), 'The UI must rely on the existing configured EAS pipeline and its platform validation.');
assert.ok(statusRoute.includes('BUILD_ACCESS_DENIED') && statusRoute.includes('workflowStatus'), 'Mobile status is user-owned and reports provider workflow status.');
assert.ok(mobileWorkflow.includes('Build Android APK') && mobileWorkflow.includes('Build Apple iOS IPA'), 'The configured EAS pipeline must include Android and iOS native build targets.');
assert.ok(packageJson.scripts.test.includes('scripts/ovyx-app-studio-release-health.test.mjs'), 'Release health tests must run under npm test.');
assert.ok(workflow.includes('functions/api/app-studio/release-health.js') && workflow.includes('scripts/ovyx-app-studio-release-health.test.mjs'), 'CI must run Stage 6 route tests for changed release functionality.');

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
