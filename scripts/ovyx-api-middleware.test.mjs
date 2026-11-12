import assert from 'node:assert/strict';
import fs from 'node:fs';
import { onRequest, usesRouteLevelOidcAuthentication } from '../functions/api/_middleware.js';
import { withCors as withWorkerCors } from '../functions/_lib/http.js';
import { withCors as withApiCors } from '../functions/api/_lib/http.js';

async function call(request) {
  return onRequest({
    request,
    env: {},
    data: {},
    next: async () => new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  });
}

{
  const request = new Request('https://ovyx.test/api/plans', {
    method: 'GET',
    headers: { Origin: 'https://attacker.invalid' },
  });
  const response = await call(request);
  assert.equal(response.status, 403, 'cross-origin API calls must return a valid 403, not a Response-constructor RangeError');
  const body = await response.json();
  assert.equal(body.error, 'CORS_DENIED');
  assert.equal(body.message, 'Cross-origin API requests are not allowed.');
}

{
  const request = new Request('https://ovyx.test/api/plans', { method: 'OPTIONS' });
  const response = await call(request);
  assert.equal(response.status, 204, 'preflight requests must return 204');
}

{
  assert.equal(usesRouteLevelOidcAuthentication('/api/internal/live-generation-eval'), true,
    'only the dedicated acceptance endpoint may use its own GitHub OIDC verifier');
  assert.equal(usesRouteLevelOidcAuthentication('/api/internal/live-generation-eval/'), false,
    'a path variant must not inherit the OIDC middleware exception');
  assert.equal(usesRouteLevelOidcAuthentication('/api/ai/gateway'), false,
    'normal AI endpoints must continue to require Firebase authentication');
  const request = new Request('https://ovyx.test/api/internal/live-generation-eval', {
    method: 'POST',
    headers: { Authorization: 'Bearer a-github-oidc-token' },
  });
  const response = await call(request);
  assert.equal(response.status, 200,
    'the exact OIDC route must reach its dedicated downstream signature verifier instead of treating its JWT as Firebase');
  assert.deepEqual(await response.json(), { ok: true });
}

{
  const request = new Request('https://ovyx.test/api/internal/live-generation-eval/', {
    method: 'POST',
    headers: { Authorization: 'Bearer a-github-oidc-token' },
  });
  const response = await call(request);
  assert.equal(response.status, 401,
    'trailing-slash variants must not bypass standard Firebase authentication');
}

// Firebase/browser SDK requests can use HTTP Message Signature headers.
// Both Pages CORS helpers and the static fallback must permit the preflight
// header names; this does not expose credentials or relax origin checks.
{
  const request = new Request('https://ovyx.test/api/health', {
    method: 'OPTIONS',
    headers: { Origin: 'https://ovyx.test', 'Access-Control-Request-Headers': 'authorization,content-type,signature-input,signature' },
  });
  const workerResponse = withWorkerCors(new Response(null, { status: 204 }), request);
  const apiResponse = withApiCors(new Response(null, { status: 204 }), request);
  for (const [label, response] of [['worker', workerResponse], ['api', apiResponse]]) {
    const allowed = String(response.headers.get('Access-Control-Allow-Headers') || '').toLowerCase();
    assert.match(allowed, /signature-input/, label + ' CORS helper must allow Signature-Input preflight');
    assert.match(allowed, /signature/, label + ' CORS helper must allow Signature preflight');
  }
  const staticHeaders = fs.readFileSync('_headers', 'utf8');
  assert.match(staticHeaders, /Access-Control-Allow-Headers: [^\\n]*Signature-Input[^\\n]*Signature/i,
    'static Pages API fallback headers must permit HTTP message signature headers too');
}

console.log('API middleware HTTP helpers and route-scoped OIDC handoff tests passed.');
