import assert from 'node:assert/strict';
import { findCloudflareLogErrors, isInformationalVcsLine } from './cloudflare-diagnostics-log-filter.mjs';

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

console.log('Cloudflare diagnostics log filter tests passed: Git metadata ignored; real build failures remain detectable.');
