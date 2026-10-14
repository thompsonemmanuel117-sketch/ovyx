import assert from 'node:assert/strict';
import { onRequestGet } from '../functions/api/ai/status.js';

const originalFetch = globalThis.fetch;
const calls = [];
const responseStatuses = new Map([
  ['generativelanguage.googleapis.com', 200],
  ['api.deepseek.com', 401],
  ['api.openai.com', 402],
  ['api.anthropic.com', 503],
  ['api.groq.com', 200],
  ['openrouter.ai', 429],
]);
globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  const headers = new Headers(init.headers || {});
  calls.push({ url, headers });
  const host = new URL(url).hostname;
  const status = responseStatuses.get(host) || 200;
  return new Response(JSON.stringify({ data: [] }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
};

function ctx(env = {}, email = 'ovyxsupportteam@gmail.com') {
  return {
    request: new Request('https://ovyx.test/api/ai/status'),
    env,
    data: { user: { uid: 'test-owner', email } },
  };
}
try {
  const env = {
    GEMINI_API_KEY: 'test-gemini-key',
    DEEPSEEK_API_KEY: 'test-deepseek-key',
    OPENAI_API_KEY: 'test-openai-key',
    ANTHROPIC_API_KEY: 'test-anthropic-key',
    GROQ_API_KEY: 'test-groq-key',
    OPENROUTER_API_KEY: 'test-openrouter-key',
  };
  let response = await onRequestGet(ctx(env));
  let data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.providers.length, 4, 'keep the existing Admin AutoBrain provider contract unchanged');
  assert.equal(data.additionalProviders.length, 2, 'Groq/OpenRouter must be reported in a separate additive field');
  assert.deepEqual(data.additionalProviders.map(x => x.provider), ['groq', 'openrouter']);
  assert.equal(data.additionalProviders[0].status, 'READY');
  assert.equal(data.additionalProviders[1].status, 'RATE_LIMITED');
  assert.equal(data.providers.find(x => x.provider === 'deepseek').status, 'AUTH_FAILED');
  assert.equal(data.providers.find(x => x.provider === 'openai').status, 'INSUFFICIENT_CREDITS');
  assert.equal(data.providers.find(x => x.provider === 'anthropic').status, 'UPSTREAM_ERROR');
  assert.ok(calls.some(x => x.url === 'https://api.groq.com/openai/v1/models'));
  assert.ok(calls.some(x => x.url === 'https://openrouter.ai/api/v1/models'));
  assert.equal(calls.find(x => x.url.includes('api.groq.com'))?.headers.get('authorization'), 'Bearer test-groq-key');
  assert.equal(calls.find(x => x.url.includes('openrouter.ai'))?.headers.get('authorization'), 'Bearer test-openrouter-key');
  assert.equal(JSON.stringify(data).includes('test-openrouter-key'), false, 'secret values must not appear in API response');
  assert.equal(JSON.stringify(data).includes('test-groq-key'), false, 'secret values must not appear in API response');
  assert.equal(response.headers.get('cache-control'), 'no-store');

  calls.length = 0;
  response = await onRequestGet(ctx({}));
  data = await response.json();
  assert.equal(data.additionalProviders.find(x => x.provider === 'groq').status, 'NOT_CONFIGURED');
  assert.equal(data.additionalProviders.find(x => x.provider === 'openrouter').status, 'NOT_CONFIGURED');
  assert.equal(calls.length, 0, 'missing secrets must be reported without probing external providers');

  response = await onRequestGet(ctx(env, 'not-the-owner@example.com'));
  assert.equal(response.status, 403, 'additional diagnostics must preserve the existing owner-only gate');
} finally {
  globalThis.fetch = originalFetch;
}
console.log('AI provider diagnostics tests passed: existing 4-provider contract preserved, Groq/OpenRouter status verified, key values never returned, and owner-only access preserved.');
