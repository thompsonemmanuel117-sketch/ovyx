import assert from 'node:assert/strict';
import { findCloudflareLogErrors, isInformationalVcsLine } from './cloudflare-diagnostics-log-filter.mjs';
import { probeApplicationShell } from './cloudflare-application-shell.mjs';

const commitCheckout = 'HEAD is now at bba6b90 fix: harden provider availability error responses';
assert.equal(isInformationalVcsLine(commitCheckout), true, 'Git checkout metadata must not be classified as a deployment error just because the commit subject contains the word error.');
assert.deepEqual(findCloudflareLogErrors([{ line: commitCheckout }]), [], 'a clean checkout notice must not fail Cloudflare diagnostics.');

const cases = [
  'Error: Cannot find module "example-package"',
  'npm ERR! build failed',
  'Deployment failed: missing output directory',
  'Unhandled exception while building Pages Functions',
  'Permission denied writing build output',
];
for (const line of cases) {
  assert.equal(findCloudflareLogErrors([{ line }]).length, 1, 'real failure line must still be reported: ' + line);
}

assert.deepEqual(
  findCloudflareLogErrors([
    { line: commitCheckout },
    { line: 'Building application...' },
    { line: 'Error: Unexpected build failure' },
  ]),
  ['Error: Unexpected build failure'],
  'only actual error lines should be reported after filtering checkout chatter.',
);


const shellHtml = '<!doctype html><html><head><title>OVYX</title></head><body><main><h1>OVYX</h1></main><script defer src="/assets/ovyx-webstudio-reliability.js?v=20261019-2"></script><script defer src="/assets/ovyx-webstudio-research.js?v=20261019-1"></script><script defer src="/assets/ovyx-webstudio-apply-suggestions.js?v=20261019-1"></script><script defer src="/assets/ovyx-webstudio-quality.js?v=20261018-7"></script><script defer src="/assets/ovyx-webstudio-cancel-safety.js?v=20261021-3"></script></body></html>';
const expectedQualitySource = 'function auditSources(report, pages, files, project) {} /* cross-page fragment link */ function publishVerifiedPreview() {}';
const faviconSvg = '<svg xmlns="http://www.w3.org/2000/svg"><title id="title">OVYX</title></svg>';
function faviconResponse(url) {
  if (url.pathname !== '/favicon.ico' && url.pathname !== '/ovyx-tab-v6.svg') return null;
  return new Response(faviconSvg, { status: 200, headers: { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'no-store, no-cache, max-age=0' } });
}
const expectedRuntimeSources = {
  '/assets/ovyx-webstudio-reliability.js': 'var __ovyxBuildArtifactGuard = true; function installFollowUpIntentRouter() {}',
  '/assets/ovyx-webstudio-research.js': 'function runResearch() {} function addResearchContext() {} .ovyx-ws-live-activity',
  '/assets/ovyx-webstudio-apply-suggestions.js': '/* OVYX_APPLY_SUGGESTIONS */ function applySuggestion() {} studio.submitPrompt()',
  '/assets/ovyx-webstudio-quality.js': expectedQualitySource,
  '/assets/ovyx-webstudio-cancel-safety.js': 'OVYX_WEBSTUDIO_CANCEL_SAFETY_V3 PERSISTED_SNAPSHOT_PREFIX installBrowserFetchCancellation restoreProjectOnly',
};
const healthyFetch = async input => {
  const url = new URL(input);
  const icon = faviconResponse(url); if (icon) return icon;
  if (url.pathname === '/') return new Response(shellHtml, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
  const source = expectedRuntimeSources[url.pathname];
  if (source) return new Response(source, { status: 200, headers: { 'content-type': 'text/javascript; charset=utf-8' } });
  return new Response('', { status: 404 });
};
const healthyShell = await probeApplicationShell('https://production-fixture.pages.dev/', healthyFetch);
assert.equal(healthyShell.ok, true, JSON.stringify(healthyShell));
assert.equal(healthyShell.status, 'healthy');
assert.equal(healthyShell.qualityRuntimeInjected, true);
assert.equal(healthyShell.qualityRuntimeVersion, '20261018-7');
assert.equal(healthyShell.qualityRuntimeAssetOk, true);
assert.equal(healthyShell.qualityRuntimeSignaturePresent, true);
assert.equal(healthyShell.requiredRuntimes.reliability.ok, true);
assert.equal(healthyShell.requiredRuntimes.research.ok, true);
assert.equal(healthyShell.requiredRuntimes.applySuggestions.ok, true);
assert.equal(healthyShell.requiredRuntimes.applySuggestions.version, '20261019-1');
assert.equal(healthyShell.requiredRuntimes.cancelSafety.ok, true, 'The mobile cancel/rollback runtime must be injected and served on production.');
assert.equal(healthyShell.faviconRoutes.canonical.ok, true, 'The canonical OVYX tab icon must return a fresh SVG response.');
assert.equal(healthyShell.faviconRoutes.fallback.ok, true, 'The browser fallback favicon route must return the same fresh SVG response.');

const missingApplyRuntime = await probeApplicationShell('https://production-fixture.pages.dev', async input => {
  const url = new URL(input);
  const icon = faviconResponse(url); if (icon) return icon;
  if (url.pathname === '/') {
    return new Response(shellHtml.replace(/<script[^>]+ovyx-webstudio-apply-suggestions\.js[^>]*><\/script>/, ''), {
      status: 200, headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }
  const source = expectedRuntimeSources[url.pathname];
  if (source) return new Response(source, { status: 200, headers: { 'content-type': 'text/javascript; charset=utf-8' } });
  return new Response('', { status: 404 });
});
assert.equal(missingApplyRuntime.ok, false, 'A production shell missing the one-click Apply runtime must fail the deployment smoke test.');
assert.equal(missingApplyRuntime.requiredRuntimes.applySuggestions.injected, false);
assert.match(missingApplyRuntime.error, /missing the Web Studio Apply this suggestion script/i);


let failedRootRequests = 0;
const failedRoot = await probeApplicationShell('https://production-fixture.pages.dev', async () => {
  failedRootRequests += 1;
  return new Response('not available', { status: 503, headers: { 'content-type': 'text/plain' } });
});
assert.equal(failedRoot.ok, false);
assert.equal(failedRoot.httpStatus, 503);
assert.equal(failedRootRequests, 1, 'A failed root check must not request or execute application JavaScript.');

const missingRuntime = await probeApplicationShell('https://production-fixture.pages.dev', async input => {
  const url = new URL(input);
  const icon = faviconResponse(url); if (icon) return icon;
  if (url.pathname === '/') return new Response('<html><body><main>OVYX</main></body></html>', { status: 200, headers: { 'content-type': 'text/html' } });
  throw new Error('The probe must stop before requesting an absent runtime.');
});
assert.equal(missingRuntime.ok, false);
assert.equal(missingRuntime.qualityRuntimeInjected, false);
assert.match(missingRuntime.error, /missing the Web Studio quality inspector script/i);

const staleRuntime = await probeApplicationShell('https://production-fixture.pages.dev', async input => {
  const url = new URL(input);
  const icon = faviconResponse(url); if (icon) return icon;
  if (url.pathname === '/') return new Response(shellHtml, { status: 200, headers: { 'content-type': 'text/html' } });
  return new Response('/* stale script with none of the expected signatures */', { status: 200, headers: { 'content-type': 'text/javascript' } });
});
assert.equal(staleRuntime.ok, false, 'A 200 asset response with the wrong/stale code must not pass the shell smoke test.');
assert.equal(staleRuntime.qualityRuntimeAssetOk, true);
assert.equal(staleRuntime.qualityRuntimeSignaturePresent, false);

let externalAssetRequests = 0;
const crossOriginRuntime = await probeApplicationShell('https://production-fixture.pages.dev', async input => {
  const url = new URL(input);
  const icon = faviconResponse(url); if (icon) return icon;
  if (url.pathname === '/') return new Response('<html><script src="https://cdn.example.invalid/assets/ovyx-webstudio-quality.js?v=1"></script></html>', { status: 200, headers: { 'content-type': 'text/html' } });
  externalAssetRequests += 1;
  return new Response(expectedQualitySource, { status: 200, headers: { 'content-type': 'text/javascript' } });
});
assert.equal(crossOriginRuntime.ok, false, 'The runtime probe must only trust a same-origin inspector asset.');
assert.equal(externalAssetRequests, 0, 'The probe must reject cross-origin runtime URLs before requesting them.');

const invalidShellUrl = await probeApplicationShell('javascript:alert(1)', healthyFetch);
assert.equal(invalidShellUrl.ok, false);
assert.equal(invalidShellUrl.status, 'unavailable');

console.log('Cloudflare diagnostics log filter tests passed: Git metadata ignored; real build failures remain detectable.');
