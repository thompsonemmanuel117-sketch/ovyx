import assert from 'node:assert/strict';
import { onRequest, onRequestGet } from '../functions/api/ai/provider-availability.js';

const originalFetch = globalThis.fetch;
const requests = [];
globalThis.fetch = async input => { requests.push(String(input)); throw new Error('No external AI provider requests are allowed.'); };

function context(provider = 'automatic', env = { AI: { run() {} } }, user = { sub: 'test-user', uid: 'test-user', email: 'test@example.com' }) {
  return {
    request: new Request('https://ovyx.test/api/ai/provider-availability?provider=' + encodeURIComponent(provider)),
    env,
    data: { user },
  };
}

try {
  let response = await onRequestGet(context());
  let data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.status, 'READY');
  assert.equal(data.connected, true);
  assert.equal(data.provider, 'cloudflare-workers-ai');
  assert.equal(data.routingPolicy, 'cloudflare-only');
  assert.equal(data.externalApiKeysRequired, false);
  assert.equal(requests.length, 0, 'A Cloudflare binding check must not call an external provider.');

  response = await onRequestGet(context('cloudflare-workers-ai'));
  data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.provider, 'cloudflare-workers-ai');
  assert.equal(data.status, 'READY');

  response = await onRequestGet(context('automatic', {}));
  data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.status, 'NOT_CONFIGURED');
  assert.equal(data.connected, false);

  for (const provider of ['gemini', 'anthropic', 'claude', 'deepseek', 'openai', 'groq', 'openrouter']) {
    response = await onRequestGet(context(provider, {
      AI: { run() {} },
      GEMINI_API_KEY: 'unused',
      ANTHROPIC_API_KEY: 'unused',
      DEEPSEEK_API_KEY: 'unused',
      OPENAI_API_KEY: 'unused',
      GROQ_API_KEY: 'unused',
      OPENROUTER_API_KEY: 'unused',
    }));
    data = await response.json();
    assert.equal(response.status, 409, provider + ' must be disabled.');
    assert.equal(data.error, 'AI_PROVIDER_DISABLED');
    assert.equal(data.provider, 'cloudflare-workers-ai');
    assert.match(data.message, /Cloudflare Workers AI as its only AI model provider/i);
  }
  assert.equal(requests.length, 0, 'Even configured third-party keys must never be probed.');

  response = await onRequestGet(context('automatic', {}, null));
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'AUTH_REQUIRED');

  response = await onRequest({
    request: new Request('https://ovyx.test/api/ai/provider-availability', { method: 'POST' }),
    env: {},
    data: { user: { uid: 'test-user', email: 'test@example.com' } },
  });
  assert.equal(response.status, 405);
  assert.equal((await response.json()).error, 'METHOD_NOT_ALLOWED');
} finally {
  globalThis.fetch = originalFetch;
}

console.log('Cloudflare-only provider availability tests passed: only the Workers AI binding is reported and third-party providers are not probed.');
