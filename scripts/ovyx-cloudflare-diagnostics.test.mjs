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


const shellHtml = '<!doctype html><html><head><title>OVYX</title></head><body><main><h1>OVYX</h1></main><script defer src="/assets/ovyx-webstudio-quality.js?v=20261014-5"></script></body></html>';
const expectedQualitySource = 'function auditSources(report, pages, files, project) {} /* cross-page fragment link */ function publishVerifiedPreview() {}';
const healthyFetch = async input => {
  const url = new URL(input);
  if (url.pathname === '/') return new Response(shellHtml, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
  if (url.pathname === '/assets/ovyx-webstudio-quality.js') return new Response(expectedQualitySource, { status: 200, headers: { 'content-type': 'text/javascript; charset=utf-8' } });
  return new Response('', { status: 404 });
};
const healthyShell = await probeApplicationShell('https://production-fixture.pages.dev/', healthyFetch);
assert.equal(healthyShell.ok, true, JSON.stringify(healthyShell));
assert.equal(healthyShell.status, 'healthy');
assert.equal(healthyShell.qualityRuntimeInjected, true);
assert.equal(healthyShell.qualityRuntimeVersion, '20261014-5');
assert.equal(healthyShell.qualityRuntimeAssetOk, true);
assert.equal(healthyShell.qualityRuntimeSignaturePresent, true);

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
  externalAssetRequests += 1;
  return new Response(expectedQualitySource, { status: 200, headers: { 'content-type': 'text/javascript' } });
});
assert.equal(crossOriginRuntime.ok, false, 'The runtime probe must only trust a same-origin inspector asset.');
assert.equal(externalAssetRequests, 0, 'The probe must reject cross-origin runtime URLs before requesting them.');

const invalidShellUrl = await probeApplicationShell('javascript:alert(1)', healthyFetch);
assert.equal(invalidShellUrl.ok, false);
assert.equal(invalidShellUrl.status, 'unavailable');

console.log('Cloudflare diagnostics log filter tests passed: Git metadata ignored; real build failures remain detectable.');
