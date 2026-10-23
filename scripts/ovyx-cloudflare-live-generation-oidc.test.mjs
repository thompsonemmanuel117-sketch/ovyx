import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { chooseProvider, handleLiveGenerationRequest, verifyGithubOidcToken } from '../functions/api/internal/live-generation-eval.js';
import { isTrustedGithubOidcRequestUrl } from './ovyx-cloudflare-live-generation-client.mjs';

// Cover the exact GitHub-hosted runner hostname reported by the production
// workflow. Preserve a strict host allowlist rather than broadly trusting URLs.
assert.equal(isTrustedGithubOidcRequestUrl('https://pipelines.actions.githubusercontent.com/_apis/idtoken/request?api-version=2.0'), true,
  'the stable GitHub Actions OIDC host remains supported');
assert.equal(isTrustedGithubOidcRequestUrl('https://run-actions-3-azure-eastus.actions.githubusercontent.com/50//idtoken/request?api-version=2.0'), true,
  'GitHub regional hosted-runner OIDC hosts must be accepted');
assert.equal(isTrustedGithubOidcRequestUrl('https://run-actions-12-azure-northcentralus.actions.githubusercontent.com/50//idtoken/request?api-version=2.0'), true,
  'regional runner names with multi-part locations must be accepted');
for (const url of [
  'http://run-actions-3-azure-eastus.actions.githubusercontent.com/idtoken',
  'https://run-actions-3-azure-eastus.actions.githubusercontent.com.evil.invalid/idtoken',
  'https://evil.run-actions-3-azure-eastus.actions.githubusercontent.com/idtoken',
  'https://run-actions-eastus.actions.githubusercontent.com/idtoken',
  'https://run-actions-3-azure-eastus.actions.githubusercontent.com:8443/idtoken',
  'https://user@run-actions-3-azure-eastus.actions.githubusercontent.com/idtoken',
  'https://run-actions-3-azure-eastus.actions.githubusercontent.com/idtoken#fragment',
  'https://pipelines.actions.githubusercontent.com.evil.invalid/idtoken',
  'not a URL',
]) {
  assert.equal(isTrustedGithubOidcRequestUrl(url), false, 'unsafe OIDC request URL must be rejected: ' + url);
}

const cryptoApi = globalThis.crypto || webcrypto;
const now = Math.floor(Date.now() / 1000);
const keys = await cryptoApi.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
  true,
  ['sign', 'verify'],
);
const jwk = await cryptoApi.subtle.exportKey('jwk', keys.publicKey);
jwk.kid = 'ovyx-eval-test-key';
jwk.use = 'sig';
jwk.alg = 'RS256';
const fetchImpl = async url => {
  assert.equal(String(url), 'https://token.actions.githubusercontent.com/.well-known/jwks');
  return new Response(JSON.stringify({ keys: [jwk] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};
function b64url(value) {
  return Buffer.from(value).toString('base64url');
}
async function signToken(overrides = {}) {
  const header = { alg: 'RS256', typ: 'JWT', kid: jwk.kid };
  const claims = {
    iss: 'https://token.actions.githubusercontent.com',
    aud: 'ovyx-live-site-evaluation',
    sub: 'repo:thompsonemmanuel117-sketch/ovyx:ref:refs/heads/main',
    repository: 'thompsonemmanuel117-sketch/ovyx',
    repository_id: '1333698814',
    repository_owner: 'thompsonemmanuel117-sketch',
    ref: 'refs/heads/main',
    workflow_ref: 'thompsonemmanuel117-sketch/ovyx/.github/workflows/ovyx-webstudio-live-generation.yml@refs/heads/main',
    event_name: 'workflow_dispatch',
    jti: 'test-token-id',
    run_id: '123456',
    iat: now,
    nbf: now - 5,
    exp: now + 240,
    ...overrides,
  };
  const signingInput = b64url(JSON.stringify(header)) + '.' + b64url(JSON.stringify(claims));
  const signature = await cryptoApi.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    keys.privateKey,
    new TextEncoder().encode(signingInput),
  );
  return signingInput + '.' + Buffer.from(new Uint8Array(signature)).toString('base64url');
}

assert.equal(chooseProvider({}, 'automatic'), null, 'automatic routing must not claim a provider exists if Cloudflare has no configured key or AI binding.');
assert.equal(chooseProvider({GEMINI_API_KEY:'configured-test-key'}, 'automatic'), 'automatic',
  'automatic routing must use OVYX’s provider-selection/fallback logic instead of pinning the first key');
assert.equal(chooseProvider({DEEPSEEK_API_KEY:'configured-test-key'}, 'deepseek'), 'deepseek');
assert.equal(chooseProvider({GEMINI_API_KEY:'configured-test-key'}, 'openai'), null,
  'an explicitly selected provider must not silently borrow another provider key');
assert.equal(chooseProvider({AI:{run:async()=>({response:'ok'})}}, 'automatic'), 'automatic',
  'the existing Cloudflare Workers AI binding is a valid no-vendor-key path');

const validToken = await signToken();
const verified = await verifyGithubOidcToken(validToken, { fetchImpl, nowSeconds: now });
assert.equal(verified.ok, true, 'a valid signature and exact trusted main workflow claims are accepted');
assert.equal(verified.claims.repository, 'thompsonemmanuel117-sketch/ovyx');

for (const [label, override] of [
  ['wrong audience', { aud: 'other-service' }],
  ['wrong repository', { repository: 'attacker/other' }],
  ['wrong immutable repository ID', { repository_id: '123' }],
  ['wrong owner', { repository_owner: 'someone-else' }],
  ['feature branch', { ref: 'refs/heads/feature/unsafe' }],
  ['pull request ref', { ref: 'refs/pull/10/merge' }],
  ['wrong workflow', { workflow_ref: 'thompsonemmanuel117-sketch/ovyx/.github/workflows/untrusted.yml@refs/heads/main' }],
  ['pull request event', { event_name: 'pull_request' }],
  ['wrong issuer', { iss: 'https://attacker.invalid' }],
  ['expired', { exp: now - 1 }],
  ['not-yet-valid', { nbf: now + 120 }],
  ['malformed not-before', { nbf: 'not-a-time' }],
  ['too long lived', { exp: now + 3600 }],
  ['missing token id', { jti: '' }],
]) {
  const token = await signToken(override);
  const result = await verifyGithubOidcToken(token, { fetchImpl, nowSeconds: now });
  assert.equal(result.ok, false, label + ' must be rejected');
}
assert.equal((await verifyGithubOidcToken('not.a.jwt', { fetchImpl, nowSeconds: now })).ok, false);
assert.equal((await verifyGithubOidcToken('', { fetchImpl, nowSeconds: now })).ok, false);
const tamperedParts = validToken.split('.');
tamperedParts[2] = b64url('this-is-not-the-rsa-signature');
assert.equal((await verifyGithubOidcToken(tamperedParts.join('.'), { fetchImpl, nowSeconds: now })).ok, false, 'valid claims with a forged signature must be rejected');

const unauthorized = await handleLiveGenerationRequest(
  new Request('https://forgeos-2k0.pages.dev/api/internal/live-generation-eval', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ caseId: 'nigeria-lagos-real-estate' }),
  }),
  {},
  { fetchImpl, nowSeconds: now },
);
assert.equal(unauthorized.status, 401, 'the endpoint must reject requests without a bearer OIDC token');

const wrongOrigin = await handleLiveGenerationRequest(
  new Request('https://forgeos-2k0.pages.dev/api/internal/live-generation-eval', {
    method: 'POST',
    headers: { origin: 'https://attacker.invalid', authorization: 'Bearer ' + validToken, 'content-type': 'application/json' },
    body: JSON.stringify({ caseId: 'nigeria-lagos-real-estate' }),
  }),
  {},
  { fetchImpl, nowSeconds: now },
);
assert.equal(wrongOrigin.status, 403, 'cross-origin browser submissions are blocked');

const badMethod = await handleLiveGenerationRequest(
  new Request('https://forgeos-2k0.pages.dev/api/internal/live-generation-eval', { method: 'GET' }),
  {},
  { fetchImpl, nowSeconds: now },
);
assert.equal(badMethod.status, 405, 'readiness probes are no-cost and never start generation');

const unknownCase = await handleLiveGenerationRequest(
  new Request('https://forgeos-2k0.pages.dev/api/internal/live-generation-eval', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + validToken, 'content-type': 'application/json' },
    body: JSON.stringify({ caseId: 'nigeria-lagos-real-estate', prompt: 'Try to override the fixed evaluation with an arbitrary prompt.' }),
  }),
  {},
  { fetchImpl, nowSeconds: now },
);
assert.equal(unknownCase.status, 400, 'only allow-listed test case IDs are accepted');
assert.equal((await unknownCase.json()).error, 'EVALUATION_CASE_NOT_ALLOWED', 'arbitrary prompts are rejected before provider selection or any billable call');

console.log('Cloudflare live-generation OIDC route rejects wrong signatures/claims, untrusted workflow refs, cross-origin requests, missing credentials and arbitrary generation prompts.');
