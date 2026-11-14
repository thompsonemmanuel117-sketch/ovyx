import assert from 'node:assert/strict';
import { findExactCommitDeployment, normalizePagesSubdomain } from './ovyx-cloudflare-deployment-target.mjs';

const currentSha = 'b'.repeat(40);
const previousSha = 'a'.repeat(40);
const subdomain = 'forgeos-2k0.pages.dev';
const deploymentId = '167ebe66-13b6-4e8c-aa56-6c224668bd75';

function deployment({
  id = deploymentId,
  sha = currentSha,
  environment = 'production',
  stage = { name: 'deploy', status: 'success' },
  url = 'https://167ebe66.forgeos-2k0.pages.dev',
  createdOn = '2026-10-26T21:16:31.000Z',
} = {}) {
  return {
    id,
    environment,
    url,
    created_on: createdOn,
    latest_stage: stage,
    deployment_trigger: { metadata: { commit_hash: sha, branch: 'main' } },
  };
}

assert.equal(normalizePagesSubdomain('forgeos-2k0.pages.dev'), subdomain);
assert.equal(normalizePagesSubdomain('https://forgeos-2k0.pages.dev/'), subdomain);
assert.equal(normalizePagesSubdomain('forgeos-2k0.pages.dev.evil.invalid'), null);
assert.equal(normalizePagesSubdomain('localhost'), null);

const selected = findExactCommitDeployment([
  deployment({ sha: previousSha, id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', url: 'https://aaaaaaaa.forgeos-2k0.pages.dev', createdOn: '2026-10-26T21:17:00.000Z' }),
  deployment(),
], currentSha, subdomain);
assert.deepEqual(selected, {
  id: deploymentId,
  commitSha: currentSha,
  origin: 'https://167ebe66.forgeos-2k0.pages.dev',
  createdOn: '2026-10-26T21:16:31.000Z',
  stage: 'deploy/success',
}, 'acceptance must use the specific successful deployment for the exact Actions commit');

assert.equal(findExactCommitDeployment([deployment({ sha: previousSha })], currentSha, subdomain), null,
  'a healthy but older deployment must never be selected for a newer commit');
assert.equal(findExactCommitDeployment([deployment({ environment: 'preview' })], currentSha, subdomain), null,
  'preview deployments must not substitute for production acceptance');
assert.equal(findExactCommitDeployment([deployment({ stage: { name: 'build', status: 'in_progress' } })], currentSha, subdomain), null,
  'an in-progress deployment must not be tested before its deploy stage succeeds');
assert.equal(findExactCommitDeployment([deployment({ stage: { name: 'deploy', status: 'failure' } })], currentSha, subdomain), null,
  'failed deployments must not be tested');
assert.equal(findExactCommitDeployment([deployment({ url: 'https://forgeos-2k0.pages.dev' })], currentSha, subdomain), null,
  'the stable canonical hostname is not an acceptable deployment-specific target');
assert.equal(findExactCommitDeployment([deployment({ url: 'https://167ebe66.evil.invalid' })], currentSha, subdomain), null,
  'deployment URLs outside the configured Pages project must be rejected');
assert.equal(findExactCommitDeployment([deployment({ url: 'http://167ebe66.forgeos-2k0.pages.dev' })], currentSha, subdomain), null,
  'plain HTTP deployment origins must be rejected');
assert.equal(findExactCommitDeployment([deployment({ url: 'https://user@167ebe66.forgeos-2k0.pages.dev' })], currentSha, subdomain), null,
  'credential-bearing deployment URLs must be rejected');
assert.throws(() => findExactCommitDeployment([deployment()], 'b'.repeat(8), subdomain), /full 40-character GitHub commit SHA/);
assert.throws(() => findExactCommitDeployment([deployment()], currentSha, 'forgeos-2k0.pages.dev.evil.invalid'), /valid canonical Pages subdomain/);

console.log('Cloudflare live acceptance pins the exact successful Pages deployment for the current commit.');
