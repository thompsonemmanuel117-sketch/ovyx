import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/_middleware.js';

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

console.log('API middleware HTTP helper regression tests passed.');
