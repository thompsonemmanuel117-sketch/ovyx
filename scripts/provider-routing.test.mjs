import assert from 'node:assert/strict';
import { callModel, providerOrder } from '../functions/_lib/providers.js';

assert.deepEqual(
  providerOrder({ OVYX_AI_PROVIDER_ORDER: 'gemini,deepseek,claude,openai' }, 'gemini'),
  ['gemini'],
  'An explicitly selected provider must stay exclusive.',
);
assert.deepEqual(
  providerOrder({ OVYX_AI_PROVIDER_ORDER: 'gemini,deepseek,claude,openai' }, 'deepseek'),
  ['deepseek'],
  'An explicit DeepSeek choice must not be rerouted.',
);
assert.deepEqual(
  providerOrder({
    OVYX_AI_PROVIDER_ORDER: 'gemini,deepseek',
    DEEPSEEK_API_KEY: 'test-deepseek-key',
  }, 'automatic'),
  ['deepseek'],
  'Automatic must skip providers without configured keys.',
);

const connectedProviders = {
  GEMINI_API_KEY: 'test-gemini-key',
  DEEPSEEK_API_KEY: 'test-deepseek-key',
  ANTHROPIC_API_KEY: 'test-anthropic-key',
  OPENAI_API_KEY: 'test-openai-key',
};
assert.deepEqual(
  providerOrder(connectedProviders, 'automatic', { user: 'Design a responsive landing page website with clean CSS and layout.' }),
  ['gemini', 'claude', 'deepseek', 'openai'],
  'OVYX Auto should prioritize a connected design-capable brain for website work.',
);
assert.deepEqual(
  providerOrder(connectedProviders, 'automatic', { user: 'Fix a TypeScript bug and add a regression test in this repository.' }),
  ['claude', 'deepseek', 'openai', 'gemini'],
  'OVYX Auto should prioritize engineering-capable brains for code work.',
);

const originalFetch = globalThis.fetch;
const requests = [];
let rejectGemini = false;
globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  const headers = new Headers(init.headers || {});
  requests.push({
    url,
    authorization: headers.get('Authorization'),
    anthropicKey: headers.get('x-api-key'),
    geminiKey: headers.get('x-goog-api-key'),
    body: JSON.parse(String(init.body || '{}')),
  });

  if (url.includes('generativelanguage.googleapis.com')) {
    if (rejectGemini) {
      return new Response(JSON.stringify({ error: { message: 'test credential rejected' } }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'Gemini test passed' }] } }],
      usageMetadata: { promptTokenCount: 2, candidatesTokenCount: 2 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (url.includes('api.anthropic.com')) {
    return new Response(JSON.stringify({
      content: [{ type: 'text', text: 'Claude test passed' }],
      usage: { input_tokens: 2, output_tokens: 2 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (url.includes('api.openai.com')) {
    return new Response(JSON.stringify({
      output_text: 'OpenAI test passed',
      usage: { input_tokens: 2, output_tokens: 2 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (url.includes('api.deepseek.com')) {
    return new Response(JSON.stringify({
      choices: [{ message: { content: 'DeepSeek test passed' } }],
      usage: { prompt_tokens: 2, completion_tokens: 2 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  return new Response(JSON.stringify({ error: { message: 'Unexpected test URL' } }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  });
};

try {
  // Each provider calls only its own official endpoint and uses only its own key.
  let result = await callModel(
    { GEMINI_API_KEY: 'test-gemini-key' },
    { provider: 'gemini', model: 'gemini-2.5-flash', system: 'test', user: 'hello', maxTokens: 32 },
  );
  assert.equal(result.provider, 'gemini');
  assert.equal(result.text, 'Gemini test passed');
  assert.equal(requests.at(-1).geminiKey, 'test-gemini-key');
  assert.equal(requests.at(-1).url.includes('test-gemini-key'), false);

  result = await callModel(
    { DEEPSEEK_API_KEY: 'test-deepseek-key' },
    { provider: 'deepseek', model: 'deepseek-flash', system: 'test', user: 'hello', maxTokens: 32 },
  );
  assert.equal(result.provider, 'deepseek');
  assert.equal(result.text, 'DeepSeek test passed');
  assert.equal(requests.at(-1).url, 'https://api.deepseek.com/chat/completions');
  assert.equal(requests.at(-1).authorization, 'Bearer test-deepseek-key');

  result = await callModel(
    { ANTHROPIC_API_KEY: 'test-anthropic-key' },
    { provider: 'anthropic', model: 'claude-sonnet-4-6', system: 'test', user: 'hello', maxTokens: 32 },
  );
  assert.equal(result.provider, 'claude');
  assert.equal(result.text, 'Claude test passed');
  assert.equal(requests.at(-1).url, 'https://api.anthropic.com/v1/messages');
  assert.equal(requests.at(-1).anthropicKey, 'test-anthropic-key');

  result = await callModel(
    { OPENAI_API_KEY: 'test-openai-key' },
    { provider: 'openai', model: 'automatic', system: 'test', user: 'hello', maxTokens: 32 },
  );
  assert.equal(result.provider, 'openai');
  assert.equal(result.text, 'OpenAI test passed');
  assert.equal(requests.at(-1).url, 'https://api.openai.com/v1/responses');
  assert.equal(requests.at(-1).authorization, 'Bearer test-openai-key');

  // Missing Gemini must not use another provider's key, even if one is available.
  requests.length = 0;
  await assert.rejects(
    () => callModel(
      { DEEPSEEK_API_KEY: 'test-deepseek-key', OVYX_AI_API_KEY: 'unused-shared-key', OVYX_AI_BASE_URL: 'https://api.groq.com/openai/v1' },
      { provider: 'gemini', model: 'gemini-2.5-flash', system: 'test', user: 'hello', maxTokens: 32 },
    ),
    error => {
      assert.equal(error.code, 'AI_PROVIDER_NOT_CONFIGURED');
      assert.match(error.message, /Gemini is not available right now/i);
      assert.match(error.message, /try again later/i);
      assert.match(error.message, /connect your own AI Brain/i);
      return true;
    },
  );
  assert.equal(requests.length, 0, 'Missing provider must stop without making a request or trying another key.');

  // A configured but rejected Gemini key must not fall back to a working DeepSeek key.
  requests.length = 0;
  rejectGemini = true;
  await assert.rejects(
    () => callModel(
      { GEMINI_API_KEY: 'test-invalid-gemini-key', DEEPSEEK_API_KEY: 'test-deepseek-key' },
      { provider: 'gemini', model: 'gemini-2.5-flash', system: 'test', user: 'hello', maxTokens: 32 },
    ),
    error => {
      assert.equal(error.code, 'AI_PROVIDER_UNAVAILABLE');
      assert.match(error.message, /Gemini is not available right now/i);
      return true;
    },
  );
  assert.equal(requests.length, 1, 'Rejected Gemini must not trigger a DeepSeek request.');
  assert.match(requests[0].url, /generativelanguage\.googleapis\.com/);
  rejectGemini = false;

  // Automatic is intentionally different: it can skip missing keys and use the next configured provider.
  requests.length = 0;
  result = await callModel(
    { DEEPSEEK_API_KEY: 'test-deepseek-key', OVYX_AI_PROVIDER_ORDER: 'gemini,deepseek' },
    { provider: 'automatic', model: 'automatic', system: 'test', user: 'hello', maxTokens: 32 },
  );
  assert.equal(result.provider, 'deepseek');
  assert.equal(result.text, 'DeepSeek test passed');
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /api\.deepseek\.com/);
  assert.equal(result.autoRouting?.category, 'general');
  assert.equal(result.failoverUsed, false);

  // Auto may fall back only when Auto was selected; direct provider selection stays exclusive.
  requests.length = 0;
  rejectGemini = true;
  result = await callModel(
    {
      GEMINI_API_KEY: 'test-invalid-gemini-key',
      DEEPSEEK_API_KEY: 'test-deepseek-key',
      OVYX_AI_PROVIDER_ORDER: 'gemini,deepseek',
    },
    { provider: 'automatic', model: 'automatic', system: 'design a website', user: 'Design a responsive website layout with CSS.', maxTokens: 32 },
  );
  assert.equal(result.provider, 'deepseek');
  assert.equal(result.autoRouting?.category, 'web-design');
  assert.equal(result.failoverUsed, true);
  assert.equal(requests.length, 2, 'Auto should try the preferred connected brain, then the next connected brain.');
  assert.match(requests[0].url, /generativelanguage\.googleapis\.com/);
  assert.match(requests[1].url, /api\.deepseek\.com/);
  rejectGemini = false;

  // No configured brains should produce a friendly message without trying random providers.
  requests.length = 0;
  await assert.rejects(
    () => callModel({}, { provider: 'automatic', system: 'test', user: 'hello', maxTokens: 32 }),
    error => {
      assert.equal(error.code, 'AI_PROVIDER_UNAVAILABLE');
      assert.match(error.message, /No AI Brain is connected/i);
      assert.match(error.message, /connect your own AI Brain/i);
      return true;
    },
  );
  assert.equal(requests.length, 0);

  // Cloudflare Workers AI can be Automatic's final fallback when the binding exists.
  requests.length = 0;
  const workersAI = {
    run: async (model, payload) => ({ response: 'Cloudflare Workers AI test passed', usage: { prompt_tokens: 1, completion_tokens: 1 } }),
  };
  result = await callModel(
    { AI: workersAI, OVYX_AI_PROVIDER_ORDER: 'gemini,deepseek,claude,openai' },
    { provider: 'automatic', model: 'automatic', system: 'test', user: 'hello', maxTokens: 32 },
  );
  assert.equal(result.provider, 'cloudflare-workers-ai');
  assert.equal(result.text, 'Cloudflare Workers AI test passed');
  assert.equal(requests.length, 0, 'Workers AI binding should be called without a vendor HTTP key.');
} finally {
  globalThis.fetch = originalFetch;
}

console.log('Provider-specific routing tests passed.');
