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


const iconSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><title id="title">OVYX</title><path d="M32 5L55 18.5V45.5L32 59L9 45.5V18.5L32 5Z"/></svg>';
const shellHtml = '<!doctype html><html><head><title>OVYX</title><link rel="icon" type="image/svg+xml" href="/ovyx-tab-v6.svg?v=20261021-6"></head><body><main><h1>OVYX</h1></main><script src="/assets/ovyx-shell-favicon-lock.js?v=20261021-3"></script><script defer src="/assets/ovyx-webstudio-cancel-safety.js?v=20261022-1"></script><script defer src="/assets/ovyx-webstudio-reliability.js?v=20261019-2"></script><script defer src="/assets/ovyx-webstudio-research.js?v=20261019-1"></script><script defer src="/assets/ovyx-webstudio-apply-suggestions.js?v=20261019-1"></script><script defer src="/assets/ovyx-webstudio-quality.js?v=20261018-7"></script></body></html>';
const expectedQualitySource = 'function auditSources(report, pages, files, project) {} /* cross-page fragment link */ function publishVerifiedPreview() {}';
const expectedRuntimeSources = {
  '/assets/ovyx-shell-favicon-lock.js': `window.__OVYX_SHELL_FAVICON_LOCK_V3__ = true; var href = "/ovyx-tab-v6.svg?v=20261021-6"; window.OVYXShellFavicon = {}; var observer = new MutationObserver();`,
  '/assets/ovyx-webstudio-cancel-safety.js': `window.__OVYX_WEBSTUDIO_CANCEL_SAFETY_V3__ = true; function restoreProjectOnly() {} function installBrowserFetchCancellation() {} var key = "ovyx.webstudio.rollback.snapshot.v3."; button.id = 'ws-task-cancel'; coordinator.cancel();`,
  '/assets/ovyx-webstudio-reliability.js': 'var __ovyxBuildArtifactGuard = true; function installFollowUpIntentRouter() {}',
  '/assets/ovyx-webstudio-research.js': 'function runResearch() {} function addResearchContext() {} .ovyx-ws-live-activity',
  '/assets/ovyx-webstudio-apply-suggestions.js': '/* OVYX_APPLY_SUGGESTIONS */ function applySuggestion() {} studio.submitPrompt()',
  '/assets/ovyx-webstudio-quality.js': expectedQualitySource,
};
const healthyFetch = async input => {
  const url = new URL(input);
  if (url.pathname === '/') return new Response(shellHtml, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
  if (url.pathname === '/ovyx-tab-v6.svg' || url.pathname === '/favicon.ico') {
    return new Response(iconSvg, { status: 200, headers: { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'no-store, no-cache, must-revalidate, max-age=0' } });
  }
  const source = expectedRuntimeSources[url.pathname];
  if (source) return new Response(source, { status: 200, headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' } });
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
assert.equal(healthyShell.requiredRuntimes.faviconLock.ok, true, 'The live app shell must serve the currently expected favicon lock runtime.');
assert.equal(healthyShell.requiredRuntimes.faviconLock.version, '20261021-3');
assert.equal(healthyShell.requiredRuntimes.cancelSafety.ok, true, 'The live app shell must serve the actual browser-connected Cancel/rollback runtime.');
assert.equal(healthyShell.requiredRuntimes.cancelSafety.version, '20261022-1');
assert.equal(healthyShell.browserTabIcon.ok, true, JSON.stringify(healthyShell.browserTabIcon));
assert.equal(healthyShell.browserTabIcon.iconLinkCount, 1);
assert.equal(healthyShell.browserTabIcon.tabIcon.brandMarkPresent, true);
assert.equal(healthyShell.browserTabIcon.faviconFallback.noStore, true);

const missingApplyRuntime = await probeApplicationShell('https://production-fixture.pages.dev', async input => {
  const url = new URL(input);
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
  if (new URL(input).pathname === '/') return new Response('<html><body><main>OVYX</main></body></html>', { status: 200, headers: { 'content-type': 'text/html' } });
  throw new Error('The probe must stop before requesting an absent runtime.');
});
assert.equal(missingRuntime.ok, false);
assert.equal(missingRuntime.qualityRuntimeInjected, false);
assert.match(missingRuntime.error, /missing the Web Studio quality inspector script/i);

const staleRuntime = await probeApplicationShell('https://production-fixture.pages.dev', async input => {
  const url = new URL(input);
  if (url.pathname === '/') return new Response(shellHtml, { status: 200, headers: { 'content-type': 'text/html' } });
  return new Response('/* stale script with none of the expected signatures */', { status: 200, headers: { 'content-type': 'text/javascript' } });
});
assert.equal(staleRuntime.ok, false, 'A 200 asset response with the wrong/stale code must not pass the shell smoke test.');
assert.equal(staleRuntime.qualityRuntimeAssetOk, true);
assert.equal(staleRuntime.qualityRuntimeSignaturePresent, false);

let externalAssetRequests = 0;
const crossOriginRuntime = await probeApplicationShell('https://production-fixture.pages.dev', async input => {
  const url = new URL(input);
  if (url.pathname === '/') return new Response('<html><script src="https://cdn.example.invalid/assets/ovyx-webstudio-quality.js?v=1"></script></html>', { status: 200, headers: { 'content-type': 'text/html' } });
  if (url.pathname === '/ovyx-tab-v6.svg' || url.pathname === '/favicon.ico') {
    return new Response(iconSvg, { status: 200, headers: { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'no-store, no-cache, must-revalidate, max-age=0' } });
  }
  externalAssetRequests += 1;
  return new Response(expectedQualitySource, { status: 200, headers: { 'content-type': 'text/javascript' } });
});
assert.equal(crossOriginRuntime.ok, false, 'The runtime probe must only trust a same-origin inspector asset.');
assert.equal(externalAssetRequests, 0, 'The probe must reject cross-origin runtime URLs before requesting them.');

const missingCancelRuntime = await probeApplicationShell('https://production-fixture.pages.dev', async input => {
  const url = new URL(input);
  if (url.pathname === '/') return new Response(shellHtml.replace(/<script[^>]+ovyx-webstudio-cancel-safety\.js[^>]*><\/script>/, ''), { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
  if (url.pathname === '/ovyx-tab-v6.svg' || url.pathname === '/favicon.ico') return healthyFetch(input);
  const source = expectedRuntimeSources[url.pathname];
  if (source) return new Response(source, { status: 200, headers: { 'content-type': 'text/javascript; charset=utf-8' } });
  return new Response('', { status: 404 });
});
assert.equal(missingCancelRuntime.ok, false, 'A production shell missing the mobile Cancel runtime must fail the deployment smoke test.');
assert.equal(missingCancelRuntime.requiredRuntimes.cancelSafety.injected, false);
assert.match(missingCancelRuntime.error, /missing the Web Studio mobile Cancel and rollback script/i);

const brokenFavicon = await probeApplicationShell('https://production-fixture.pages.dev', async input => {
  const url = new URL(input);
  if (url.pathname === '/') return new Response(shellHtml, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
  if (url.pathname === '/ovyx-tab-v6.svg') return new Response('<svg><path d="M0 0Z"/></svg>', { status: 200, headers: { 'content-type': 'image/svg+xml', 'cache-control': 'no-store, no-cache, max-age=0' } });
  if (url.pathname === '/favicon.ico') return new Response('', { status: 404, headers: { 'content-type': 'text/plain' } });
  const source = expectedRuntimeSources[url.pathname];
  if (source) return new Response(source, { status: 200, headers: { 'content-type': 'text/javascript; charset=utf-8' } });
  return new Response('', { status: 404 });
});
assert.equal(brokenFavicon.ok, false, 'A stale/missing browser-tab icon must fail live deployment health.');
assert.equal(brokenFavicon.browserTabIcon.tabIcon.brandMarkPresent, false);
assert.equal(brokenFavicon.browserTabIcon.faviconFallback.httpStatus, 404);

const invalidShellUrl = await probeApplicationShell('javascript:alert(1)', healthyFetch);
assert.equal(invalidShellUrl.ok, false);
assert.equal(invalidShellUrl.status, 'unavailable');

console.log('Cloudflare diagnostics log filter tests passed: Git metadata ignored; real build failures remain detectable.');
