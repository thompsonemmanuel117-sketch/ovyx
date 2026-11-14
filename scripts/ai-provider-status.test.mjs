import assert from 'node:assert/strict';
import { onRequestGet } from '../functions/api/ai/status.js';

const originalFetch = globalThis.fetch;
const calls = [];
globalThis.fetch = async input => { calls.push(String(input)); throw new Error('Third-party AI diagnostics are disabled.'); };

function ctx(env = {}, email = 'ovyxsupportteam@gmail.com') {
  return {
    request: new Request('https://ovyx.test/api/ai/status'),
    env,
    data: { user: { uid: 'test-owner', email } },
  };
}
try {
  const env = {
    AI: { run() {} },
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
  assert.equal(data.routingPolicy, 'cloudflare-only');
  assert.equal(data.engineMode, 'cloudflare-free-only');
  assert.equal(data.providers.length, 1, 'Only Cloudflare Workers AI belongs in the provider list.');
  assert.equal(data.providers[0].provider, 'cloudflare-workers-ai');
  assert.equal(data.providers[0].status, 'READY');
  assert.deepEqual(data.additionalProviders, []);
  assert.equal(data.cloudflare.workersAiBinding, true);
  assert.equal(data.externalApiKeysRequired, false);
  assert.equal(JSON.stringify(data).includes('test-openrouter-key'), false);
  assert.equal(calls.length, 0, 'Admin diagnostics must not ping Gemini, Claude, DeepSeek, OpenAI, Groq or OpenRouter.');

  response = await onRequestGet(ctx({}));
  data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.status, 'DEGRADED');
  assert.equal(data.providers[0].status, 'NOT_CONFIGURED');
  assert.deepEqual(data.additionalProviders, []);
  assert.equal(calls.length, 0);

  response = await onRequestGet(ctx(env, 'not-the-owner@example.com'));
  assert.equal(response.status, 403, 'The existing owner-only gate must remain enforced.');
} finally {
  globalThis.fetch = originalFetch;
}

console.log('AI provider diagnostics tests passed: Cloudflare-only status, no third-party health probes and owner-only access.');
