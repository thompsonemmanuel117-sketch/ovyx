import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { handleLiveGenerationRequest, verifyGithubOidcToken } from '../functions/api/internal/live-generation-eval.js';

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
  ['too long lived', { exp: now + 3600 }],
  ['missing token id', { jti: '' }],
]) {
  const token = await signToken(override);
  const result = await verifyGithubOidcToken(token, { fetchImpl, nowSeconds: now });
  assert.equal(result.ok, false, label + ' must be rejected');
}
assert.equal((await verifyGithubOidcToken('not.a.jwt', { fetchImpl, nowSeconds: now })).ok, false);
assert.equal((await verifyGithubOidcToken('', { fetchImpl, nowSeconds: now })).ok, false);

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
    body: JSON.stringify({ caseId: 'arbitrary-user-prompt', prompt: 'Try to call an unlimited model.' }),
  }),
  {},
  { fetchImpl, nowSeconds: now },
);
assert.equal(unknownCase.status, 400, 'only allow-listed test case IDs are accepted');
assert.equal((await unknownCase.json()).error, 'EVALUATION_CASE_NOT_ALLOWED');

console.log('Cloudflare live-generation OIDC route rejects wrong signatures/claims, untrusted workflow refs, cross-origin requests, missing credentials and arbitrary generation prompts.');
