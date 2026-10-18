import assert from 'node:assert/strict';
import { onRequest, onRequestGet } from '../functions/api/ai/provider-availability.js';

const originalFetch = globalThis.fetch;
const requests = [];
let nextStatus = 200;
let thrownError = null;

globalThis.fetch = async (url, init = {}) => {
  if (thrownError) throw thrownError;
  const headers = new Headers(init.headers || {});
  requests.push({
    url: String(url),
    method: init.method,
    headers,
    signal: init.signal,
  });
  return new Response(JSON.stringify({ data: [] }), {
    status: nextStatus,
    headers: { 'Content-Type': 'application/json' },
  });
};

function context(provider, env = {}, user = { sub: 'test-user', uid: 'test-user', email: 'test@example.com' }) {
  return {
    request: new Request('https://ovyx.test/api/ai/provider-availability?provider=' + encodeURIComponent(provider)),
    env,
    data: { user },
  };
}

try {
  requests.length = 0;
  let response = await onRequestGet(context('gemini'));
  let data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.status, 'NOT_CONFIGURED');
  assert.equal(data.connected, false);
  assert.match(data.message, /choose another available AI option/i);
  assert.equal(requests.length, 0, 'a missing key must be detected without calling the provider');

  requests.length = 0;
  nextStatus = 200;
  response = await onRequestGet(context('gemini', { GEMINI_API_KEY: 'fake-gemini-secret' }));
  data = await response.json();
  assert.equal(data.status, 'READY');
  assert.equal(data.connected, true);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].headers.get('x-goog-api-key'), 'fake-gemini-secret');
  assert.match(requests[0].url, /^https:\/\/generativelanguage\.googleapis\.com\//);
  assert.equal(requests[0].url.includes('fake-gemini-secret'), false, 'keys must never appear in provider URLs');
  assert.equal(JSON.stringify(data).includes('fake-gemini-secret'), false, 'keys must never appear in the response');
  assert.equal(requests[0].method, 'GET');
  assert.ok(requests[0].signal, 'provider requests must have an abort deadline');
  assert.equal(response.headers.get('cache-control'), 'no-store, max-age=0');

  requests.length = 0;
  nextStatus = 401;
  response = await onRequestGet(context('anthropic', { ANTHROPIC_API_KEY: 'fake-anthropic-secret' }));
  data = await response.json();
  assert.equal(data.status, 'AUTH_FAILED');
  assert.equal(data.connected, false);
  assert.match(data.message, /not available right now/i);
  assert.equal(requests[0].headers.get('x-api-key'), 'fake-anthropic-secret');
  assert.equal(requests[0].headers.get('anthropic-version'), '2023-06-01');

  nextStatus = 429;
  response = await onRequestGet(context('openai', { OPENAI_API_KEY: 'fake-openai-secret' }));
  data = await response.json();
  assert.equal(data.status, 'RATE_LIMITED');

  nextStatus = 200;
  response = await onRequestGet(context('claude', { ANTHROPIC_API_KEY: 'fake-anthropic-secret' }));
  data = await response.json();
  assert.equal(data.provider, 'anthropic', 'Claude is a supported alias for Anthropic');

  thrownError = Object.assign(new Error('simulated timeout'), { name: 'AbortError' });
  response = await onRequestGet(context('deepseek', { DEEPSEEK_API_KEY: 'fake-deepseek-secret' }));
  data = await response.json();
  assert.equal(data.status, 'TIMEOUT');
  thrownError = null;

  response = await onRequestGet(context('unknown'));
  assert.equal(response.status, 400);
  data = await response.json();
  assert.equal(data.error, 'PROVIDER_REQUIRED');

  response = await onRequestGet(context('gemini', {}, null));
  assert.equal(response.status, 401, 'missing authentication must return a valid HTTP 401 response');
  data = await response.json();
  assert.equal(data.error, 'AUTH_REQUIRED');
  assert.equal(data.ok, false);

  response = await onRequest({
    request: new Request('https://ovyx.test/api/ai/provider-availability', { method: 'POST' }),
    env: {},
    data: { user: { uid: 'test-user', email: 'test@example.com' } },
  });
  assert.equal(response.status, 405, 'unsupported methods must return a valid HTTP 405 response');
  assert.equal((await response.json()).error, 'METHOD_NOT_ALLOWED');
} finally {
  globalThis.fetch = originalFetch;
}

console.log('Provider availability tests passed: no-key short circuit, safe authenticated check, auth failures, rate limiting, alias, timeout, invalid provider and unauthenticated access.');
