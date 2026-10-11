import assert from 'node:assert/strict';
import { onRequestGet } from '../functions/api/ai/provider-availability.js';

const originalFetch = globalThis.fetch;
const requests = [];
let nextStatus = 200;

globalThis.fetch = async (url, init = {}) => {
  const headers = new Headers(init.headers || {});
  requests.push({
    url: String(url),
    authorization: headers.get('authorization'),
    geminiKey: headers.get('x-goog-api-key'),
    anthropicKey: headers.get('x-api-key'),
  });
  return new Response(
    JSON.stringify(nextStatus === 200 ? { data: [] } : { error: 'test error' }),
    { status: nextStatus, headers: { 'Content-Type': 'application/json' } },
  );
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
  assert.match(data.message, /try again later/i);
  assert.match(data.message, /connect your own AI Brain/i);
  assert.equal(requests.length, 0, 'Missing key must be detected without calling the provider.');

  requests.length = 0;
  nextStatus = 200;
  response = await onRequestGet(context('gemini', { GEMINI_API_KEY: 'fake-gemini-secret' }));
  data = await response.json();
  assert.equal(data.status, 'READY');
  assert.equal(data.connected, true);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].geminiKey, 'fake-gemini-secret');
  assert.equal(requests[0].url.includes('fake-gemini-secret'), false);
  assert.equal(JSON.stringify(data).includes('fake-gemini-secret'), false);

  requests.length = 0;
  nextStatus = 401;
  response = await onRequestGet(context('anthropic', { ANTHROPIC_API_KEY: 'fake-anthropic-secret' }));
  data = await response.json();
  assert.equal(data.status, 'AUTH_FAILED');
  assert.equal(data.connected, false);
  assert.match(data.message, /not available right now/i);
  assert.equal(requests[0].anthropicKey, 'fake-anthropic-secret');

  response = await onRequestGet(context('unknown'));
  assert.equal(response.status, 400);

  response = await onRequestGet(context('gemini', {}, null));
  assert.equal(response.status, 401);
} finally {
  globalThis.fetch = originalFetch;
}

console.log('Provider availability tests passed.');
