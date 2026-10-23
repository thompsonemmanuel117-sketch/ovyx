import assert from 'node:assert/strict';
import { onRequest, usesRouteLevelOidcAuthentication } from '../functions/api/_middleware.js';

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

console.log('API middleware HTTP helpers and route-scoped OIDC handoff tests passed.');
