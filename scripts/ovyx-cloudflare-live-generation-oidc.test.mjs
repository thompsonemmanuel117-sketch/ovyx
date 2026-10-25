import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { chooseProvider, handleLiveGenerationRequest, safeLiveGenerationFailureDetail, safeLiveGenerationProviderAttempts, safeLiveGenerationOutputDiagnostics, verifyGithubOidcToken } from '../functions/api/internal/live-generation-eval.js';
import { isTrustedGithubOidcRequestUrl } from './ovyx-github-oidc-url.mjs';
import { selectLiveAcceptanceCases } from './ovyx-live-acceptance-cases.mjs';

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

assert.equal(safeLiveGenerationFailureDetail(Object.assign(new Error('Provider error may contain sensitive payload'), {
  code: 'AI_PROVIDER_REQUEST_FAILED',
  status: 429,
})), 'ai-provider-request-failed-http-429');
assert.equal(safeLiveGenerationFailureDetail(Object.assign(new Error('No secret should leak'), {
  code: 'AI_PROVIDER_NOT_CONFIGURED',
})), 'ai-provider-not-configured');
assert.equal(safeLiveGenerationFailureDetail(Object.assign(new Error('network details must stay private'), {
  name: 'TypeError',
})), 'upstream-network-error');
assert.equal(safeLiveGenerationFailureDetail(Object.assign(new Error('timeout details must stay private'), {
  name: 'TimeoutError',
})), 'upstream-timeout');
assert.equal(safeLiveGenerationFailureDetail(new Error('private message / key=DO_NOT_LEAK')), 'generation-error');

const safeOutputDiagnostics = safeLiveGenerationOutputDiagnostics({
  outputDiagnostics: {
    responseCharacters: 4096,
    parsedJson: true,
    rootKeys: ['files', 'DO_NOT_LEAK_PRIVATE_KEY', 'html'],
    fileContainerKind: 'object',
    fileContainerEntries: 1,
    extractedFileCount: 0,
    startsWithJsonObject: true,
    endsWithJsonObject: false,
    containsMarkdownFence: false,
    containsHtmlDocument: false,
    endsWithHtmlDocument: false,
    batchIndex: 2,
    batchTotal: 7,
    targetFileExtension: 'html',
    rawResponseText: 'DO_NOT_LEAK_GENERATED_CONTENT',
  },
});
assert.deepEqual(safeOutputDiagnostics, {
  responseCharacters: 4096,
  parsedJson: true,
  rootKeys: ['files', 'other', 'html'],
  fileContainerKind: 'object',
  fileContainerEntries: 1,
  extractedFileCount: 0,
  startsWithJsonObject: true,
  endsWithJsonObject: false,
  containsMarkdownFence: false,
  containsHtmlDocument: false,
  endsWithHtmlDocument: false,
  batchIndex: 2,
  batchTotal: 7,
  targetFileExtension: 'html',
});
assert.equal(JSON.stringify(safeOutputDiagnostics).includes('DO_NOT_LEAK'), false,
  'Output-shape diagnostics must not expose raw model output or unknown response keys.');
assert.equal(safeLiveGenerationOutputDiagnostics(new Error('nothing attached')), null);
const generationClientSource = readFileSync(new URL('./ovyx-cloudflare-live-generation-client.mjs', import.meta.url), 'utf8');
assert.match(generationClientSource, /function safeOutputShapeDiagnostics\(/);
assert.match(generationClientSource, /live-generation-output-shape-diagnostics/);
assert.doesNotMatch(generationClientSource, /console\.log\(JSON\.stringify\(\{[^\n]*rawResponseText/i,
  'Live generation logs must never serialize raw model output into diagnostics.');

for (const [code, expected] of [
  ['OVYX_AI_ENGINE_MODE_NOT_CONFIGURED', 'cloudflare-engine-mode-not-configured'],
  ['OVYX_NATIVE_AI_NOT_CONFIGURED', 'cloudflare-ai-binding-not-configured'],
  ['OVYX_AI_BUDGET_LEDGER_UNAVAILABLE', 'cloudflare-ai-budget-ledger-unavailable'],
  ['OVYX_AI_NEURON_BUDGET_EXHAUSTED', 'cloudflare-ai-neuron-budget-exhausted'],
  ['OVYX_AI_CLOUDFLARE_QUOTA_EXHAUSTED', 'cloudflare-ai-daily-quota-exhausted'],
  ['OVYX_AI_CLOUDFLARE_RATE_LIMITED', 'cloudflare-ai-rate-limited'],
  ['OVYX_AI_MODEL_NOT_AVAILABLE_ON_FREE_PLAN', 'cloudflare-model-not-available-on-free-plan'],
  ['OVYX_AI_CLOUDFLARE_UNAVAILABLE', 'cloudflare-ai-unavailable'],
  ['OVYX_AI_CLOUDFLARE_EMPTY_RESPONSE', 'cloudflare-ai-empty-response'],
  ['OVYX_AI_CLOUDFLARE_CHOICES_EMPTY', 'cloudflare-ai-empty-choices'],
  ['OVYX_AI_CLOUDFLARE_CHOICES_NO_TEXT', 'cloudflare-ai-choices-no-text'],
  ['OVYX_AI_CLOUDFLARE_REASONING_ONLY', 'cloudflare-ai-reasoning-only'],
  ['OVYX_AI_CLOUDFLARE_MESSAGE_CONTENT_UNSUPPORTED', 'cloudflare-ai-message-content-unsupported'],
  ['OVYX_AI_CLOUDFLARE_RESPONSE_SHAPE_UNSUPPORTED', 'cloudflare-ai-response-shape-unsupported'],
  ['OVYX_AI_TIMEOUT', 'cloudflare-ai-timeout'],
]) {
  assert.equal(safeLiveGenerationFailureDetail(Object.assign(new Error('private provider details must not leak'), { code })), expected,
    'known Cloudflare runtime failures should expose only a safe diagnostic category: ' + code);
}

assert.equal(safeLiveGenerationFailureDetail(Object.assign(new Error('model output content must remain private'), {
  code: 'WEBSTUDIO_BATCH_MISSING_FILES',
})), 'webstudio-batch-missing-files');
assert.equal(safeLiveGenerationFailureDetail(Object.assign(new Error('generated user copy must remain private'), {
  code: 'WEBSTUDIO_PROMPT_REQUIREMENT_MISSING',
})), 'webstudio-prompt-requirement-missing',
  'builder diagnostics should expose a safe allow-listed category instead of collapsing every model-output failure to generation-error');

assert.deepEqual(safeLiveGenerationProviderAttempts({
  providerAttempts: [
    { provider: 'gemini', kind: 'authentication-rejected', status: 401, message: 'DO_NOT_LEAK', secret: 'DO_NOT_LEAK' },
    { provider: 'claude', kind: 'rate-limited-or-quota', status: 429 },
    { provider: 'openai', kind: 'payment-or-billing-required', status: 402 },
    { provider: 'claude', kind: 'plan-required', status: 403 },
    { provider: 'attacker-provider', kind: 'provider-error', status: 500 },
    { provider: 'openai', kind: 'exfiltrate', status: 200 },
    { provider: 'deepseek', kind: 'provider-server-error', status: 503 },
  ],
}), [
  { provider: 'gemini', kind: 'authentication-rejected', status: 401 },
  { provider: 'claude', kind: 'rate-limited-or-quota', status: 429 },
  { provider: 'openai', kind: 'payment-or-billing-required', status: 402 },
  { provider: 'claude', kind: 'plan-required', status: 403 },
  { provider: 'deepseek', kind: 'provider-server-error', status: 503 },
], 'provider diagnostics must keep only allow-listed provider/kind/status data and never echo messages or secret fields');

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
const fetchImpl = async (url, init = {}) => {
  assert.equal(String(url), 'https://token.actions.githubusercontent.com/.well-known/jwks');
  assert.equal(init.redirect, 'follow', 'the public JWKS fetch supports legitimate redirects');
  assert.ok(init.signal, 'JWKS requests must have a bounded timeout');
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

const noListingFeedPlan = selectLiveAcceptanceCases({});
assert.deepEqual(noListingFeedPlan.caseIds, [
  'nigeria-baby-products',
  'uk-independent-restaurant',
  'us-independent-fashion',
  'japan-product-software',
], 'When no authoritative property feed exists, still generate four real non-property acceptance sites.');
assert.deepEqual(noListingFeedPlan.skippedCases, [{
  id: 'nigeria-lagos-real-estate',
  reason: 'no-authoritative-public-listing-feed-configured',
  substitute: 'nigeria-baby-products',
}], 'The property case must be reported as skipped rather than presented as tested.');
const authoritativeListingPlan = selectLiveAcceptanceCases({
  OVYX_EVAL_LISTINGS_PUBLIC_BROWSER_URL: 'https://listings.example.test/api/properties',
  OVYX_EVAL_LISTINGS_SOURCE_AUTHORITY: 'authoritative',
});
assert.deepEqual(authoritativeListingPlan.caseIds, [
  'nigeria-lagos-real-estate',
  'uk-independent-restaurant',
  'us-independent-fashion',
  'japan-product-software',
], 'Only an explicitly authoritative HTTPS feed enables the live-property case.');
assert.deepEqual(authoritativeListingPlan.skippedCases, []);
assert.equal(selectLiveAcceptanceCases({
  OVYX_EVAL_LISTINGS_PUBLIC_BROWSER_URL: 'http://listings.example.test/api/properties',
  OVYX_EVAL_LISTINGS_SOURCE_AUTHORITY: 'authoritative',
}).caseIds[0], 'nigeria-baby-products', 'An unsafe non-HTTPS listing endpoint must not enable property acceptance.');

assert.equal(chooseProvider({}, 'automatic'), null, 'automatic routing must not claim a provider exists if Cloudflare has no configured key or AI binding.');
assert.equal(chooseProvider({GEMINI_API_KEY:'configured-test-key'}, 'automatic'), 'automatic',
  'automatic routing must use OVYX’s provider-selection/fallback logic instead of pinning the first key');
assert.equal(chooseProvider({DEEPSEEK_API_KEY:'configured-test-key'}, 'deepseek'), 'deepseek');
assert.equal(chooseProvider({GEMINI_API_KEY:'configured-test-key'}, 'openai'), null,
  'an explicitly selected provider must not silently borrow another provider key');
assert.equal(chooseProvider({AI:{run:async()=>({response:'ok'})}}, 'automatic'), 'automatic',
  'the existing Cloudflare Workers AI binding is a valid no-vendor-key path');

const validToken = await signToken();
const untrustedJwksFetcher = async () => {
  const response = new Response(JSON.stringify({ keys: [jwk] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
  Object.defineProperty(response, 'url', { value: 'https://attacker.invalid/keys' });
  return response;
};
const untrustedJwks = await verifyGithubOidcToken(validToken, {
  fetchImpl: untrustedJwksFetcher,
  nowSeconds: now,
});
assert.equal(untrustedJwks.ok, false, 'keys served from an untrusted redirect destination must be rejected');
assert.equal(untrustedJwks.reason, 'jwks-unavailable');
assert.equal(untrustedJwks.detail, 'jwks-final-url-untrusted');

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

const preflightCall = { count: 0, input: null };
const providerPreflightReady = await handleLiveGenerationRequest(
  new Request('https://forgeos-2k0.pages.dev/api/internal/live-generation-eval', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + validToken, 'content-type': 'application/json' },
    body: JSON.stringify({ operation: 'provider-preflight', provider: 'gemini', model: 'test-model' }),
  }),
  { GEMINI_API_KEY: 'configured-test-key' },
  {
    fetchImpl,
    nowSeconds: now,
    getProductionIntegrationState: async () => ({ live: true }),
    callModel: async (_env, input) => {
      preflightCall.count += 1;
      preflightCall.input = input;
      return { text: 'OVYX_PROVIDER_READY', provider: 'gemini', model: 'test-model' };
    },
  },
);
assert.equal(providerPreflightReady.status, 200, 'the allow-listed provider preflight should confirm a real model response');
assert.deepEqual(await providerPreflightReady.json(), {
  ok: true,
  operation: 'provider-preflight',
  readiness: 'ready',
  provider: 'gemini',
  model: 'test-model',
});
assert.equal(preflightCall.count, 1, 'one bounded preflight model request must run before full website generation');
assert.equal(preflightCall.input.provider, 'gemini', 'an explicit provider preflight must not borrow another provider');
assert.equal(preflightCall.input.maxTokens, 32, 'the non-reasoning readiness model should use a small output budget');
assert.equal(preflightCall.input.disableThinking, true, 'the readiness probe should request deterministic inference without enabling reasoning');
assert.equal(preflightCall.input.user, 'Reply with exactly OVYX_PROVIDER_READY.', 'the readiness prompt should be a plain final-answer request');
assert.equal(preflightCall.input.timeoutMs, 25_000, 'the preflight must have a bounded provider timeout');
assert.match(preflightCall.input.system, /provider readiness check/i);
assert.doesNotMatch(preflightCall.input.user, /website|property|restaurant|fashion|country/i,
  'the preflight must not force a website category or country into OVYX generation');

const preflightSecretFailure = Object.assign(new Error('PRIVATE_TOKEN_SHOULD_NEVER_LEAK'), {
  code: 'AI_PROVIDER_UNAVAILABLE',
  providerAttempts: [
    { provider: 'gemini', kind: 'rate-limited-or-quota', status: 429, secret: 'PRIVATE_TOKEN_SHOULD_NEVER_LEAK' },
    { provider: 'attacker', kind: 'exfiltrate', status: 200 },
  ],
});
const providerPreflightBlocked = await handleLiveGenerationRequest(
  new Request('https://forgeos-2k0.pages.dev/api/internal/live-generation-eval', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + validToken, 'content-type': 'application/json' },
    body: JSON.stringify({ operation: 'provider-preflight', provider: 'gemini' }),
  }),
  { GEMINI_API_KEY: 'configured-test-key' },
  {
    fetchImpl,
    nowSeconds: now,
    getProductionIntegrationState: async () => ({ live: true }),
    callModel: async () => { throw preflightSecretFailure; },
  },
);
assert.equal(providerPreflightBlocked.status, 503, 'a failed provider preflight must stop before website generation');
const blockedBody = await providerPreflightBlocked.json();
assert.equal(blockedBody.ok, false);
assert.equal(blockedBody.error, 'AI_PROVIDER_PREFLIGHT_FAILED');
assert.equal(blockedBody.detail, 'ai-provider-unavailable');
assert.deepEqual(blockedBody.providerAttempts, [{ provider: 'gemini', kind: 'rate-limited-or-quota', status: 429 }]);
assert.equal(JSON.stringify(blockedBody).includes('PRIVATE_TOKEN_SHOULD_NEVER_LEAK'), false,
  'provider preflight errors must not expose private provider messages, tokens, or arbitrary fields');

let arbitraryPreflightCalled = false;
const arbitraryPreflight = await handleLiveGenerationRequest(
  new Request('https://forgeos-2k0.pages.dev/api/internal/live-generation-eval', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + validToken, 'content-type': 'application/json' },
    body: JSON.stringify({ operation: 'provider-preflight', provider: 'gemini', prompt: 'Run a full website build here.' }),
  }),
  { GEMINI_API_KEY: 'configured-test-key' },
  {
    fetchImpl,
    nowSeconds: now,
    getProductionIntegrationState: async () => ({ live: true }),
    callModel: async () => { arbitraryPreflightCalled = true; return { text: 'should never be reached' }; },
  },
);
assert.equal(arbitraryPreflight.status, 400, 'preflight requests must not allow arbitrary prompts or generation settings');
assert.equal(arbitraryPreflightCalled, false, 'invalid preflight requests must be rejected before provider calls');

console.log('Cloudflare live-generation OIDC route rejects unsafe requests and proves a bounded provider preflight before full generation.');
