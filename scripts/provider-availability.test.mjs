import assert from 'node:assert/strict';
import { onRequestGet } from '../functions/api/ai/provider-availability.js';

const originalFetch = globalThis.fetch;
const requests = [];
let nextStatus = 200;

globalThis.fetch = async (url, init = {}) => {
  const headers = new Headers(init.headers || {});
  requests.push({
    url: String(url),
    method: init.method,
    geminiKey: headers.get('x-goog-api-key'),
    anthropicKey: headers.get('x-api-key'),
    authorization: headers.get('authorization'),
    redirect: init.redirect,
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
  let result = await onRequestGet(context('gemini'));
  let payload = await result.json();
  assert.equal(result.status, 200);
  assert.equal(payload.status, 'NOT_CONFIGURED');
  assert.equal(payload.connected, false);
  assert.match(payload.message, /try again later/i);
  assert.match(payload.message, /connect your own AI Brain/i);
  assert.equal(requests.length, 0, 'a missing key must be detected without contacting a provider');

  requests.length = 0;
  nextStatus = 200;
  result = await onRequestGet(context('gemini', { GEMINI_API_KEY: 'fake-gemini-secret' }));
  payload = await result.json();
  assert.equal(payload.status, 'READY');
  assert.equal(payload.connected, true);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, 'GET');
  assert.equal(requests[0].geminiKey, 'fake-gemini-secret');
  assert.equal(requests[0].url.includes('fake-gemini-secret'), false);
  assert.equal(requests[0].redirect, 'manual');
  assert.equal(JSON.stringify(payload).includes('fake-gemini-secret'), false);
  assert.equal(result.headers.get('cache-control')?.includes('no-store'), true);

  requests.length = 0;
  nextStatus = 401;
  result = await onRequestGet(context('anthropic', { ANTHROPIC_API_KEY: 'fake-anthropic-secret' }));
  payload = await result.json();
  assert.equal(payload.status, 'AUTH_FAILED');
  assert.equal(payload.connected, false);
  assert.match(payload.message, /not available right now/i);
  assert.equal(requests[0].anthropicKey, 'fake-anthropic-secret');
  assert.equal(JSON.stringify(payload).includes('fake-anthropic-secret'), false);

  nextStatus = 429;
  result = await onRequestGet(context('deepseek', { DEEPSEEK_API_KEY: 'fake-deepseek-secret' }));
  payload = await result.json();
  assert.equal(payload.status, 'RATE_LIMITED');
  assert.equal(payload.connected, false);

  nextStatus = 402;
  result = await onRequestGet(context('openai', { OPENAI_API_KEY: 'fake-openai-secret' }));
  payload = await result.json();
  assert.equal(payload.status, 'INSUFFICIENT_CREDITS');
  assert.equal(payload.connected, false);

  result = await onRequestGet(context('unknown'));
  assert.equal(result.status, 400);

  result = await onRequestGet(context('gemini', {}, null));
  assert.equal(result.status, 401, 'provider checks must require an authenticated account');
} finally {
  globalThis.fetch = originalFetch;
}

console.log('Provider availability tests passed: authentication, key isolation, URL secrecy, status mapping, and cache controls.');
