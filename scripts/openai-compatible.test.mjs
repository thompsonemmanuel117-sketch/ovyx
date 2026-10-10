import assert from 'node:assert/strict';
import {
  resolveOpenAICompatibleConfig,
  resolveOpenAICompatibleModel,
} from '../functions/_lib/openai-compatible.js';
import { callModel, providerOrder } from '../functions/_lib/providers.js';

const native = resolveOpenAICompatibleConfig({ OPENAI_API_KEY: 'test-native-key' });
assert.equal(native.provider, 'openai');
assert.equal(native.chatCompletionsUrl, 'https://api.openai.com/v1/chat/completions');
assert.equal(native.modelsUrl, 'https://api.openai.com/v1/models');
assert.equal(native.configured, true);
assert.equal(native.keySource, 'OPENAI_API_KEY');

const genericKeyFallback = resolveOpenAICompatibleConfig({
  OPENAI_BASE_URL: 'https://api.groq.com/openai/v1',
  GEMINI_API_KEY: 'test-key-kept-in-an-unrelated-env-slot',
});
assert.equal(genericKeyFallback.provider, 'groq');
assert.equal(genericKeyFallback.keySource, 'GEMINI_API_KEY');
assert.equal(genericKeyFallback.key, 'test-key-kept-in-an-unrelated-env-slot');

const sharedGatewayConfig = resolveOpenAICompatibleConfig({
  OVYX_AI_BASE_URL: 'https://api.groq.com/openai/v1',
  OVYX_AI_MODEL: 'openai/gpt-oss-20b',
  ANTHROPIC_API_KEY: 'test-shared-gateway-key',
});
assert.equal(sharedGatewayConfig.provider, 'groq');
assert.equal(sharedGatewayConfig.keySource, 'ANTHROPIC_API_KEY');
assert.equal(
  resolveOpenAICompatibleModel(
    { OVYX_AI_BASE_URL: sharedGatewayConfig.baseUrl, OVYX_AI_MODEL: 'openai/gpt-oss-20b' },
    sharedGatewayConfig,
    'claude-sonnet-4-6',
  ),
  'openai/gpt-oss-20b',
);
assert.deepEqual(
  providerOrder({ OVYX_AI_BASE_URL: 'https://api.groq.com/openai/v1', OVYX_AI_PROVIDER_ORDER: 'gemini,deepseek,claude,openai' }, 'gemini'),
  ['openai'],
);
assert.deepEqual(
  providerOrder({ OVYX_AI_BASE_URL: 'https://api.groq.com/openai/v1', OVYX_AI_PROVIDER_ORDER: 'gemini,deepseek,claude,openai' }, 'automatic'),
  ['openai'],
);

const groq = resolveOpenAICompatibleConfig({
  OPENAI_BASE_URL: 'https://api.groq.com/openai/v1/chat/completions',
  OPENAI_API_KEY: 'test-compatible-key',
});
assert.equal(groq.provider, 'groq');
assert.equal(groq.chatCompletionsUrl, 'https://api.groq.com/openai/v1/chat/completions');
assert.equal(groq.keySource, 'OPENAI_API_KEY');
assert.equal(
  resolveOpenAICompatibleModel({}, groq, 'automatic'),
  'openai/gpt-oss-20b',
);

const groqSpecificKey = resolveOpenAICompatibleConfig({
  OPENAI_BASE_URL: 'https://api.groq.com/openai/v1',
  OPENAI_API_KEY: 'test-generic-key',
  GROQ_API_KEY: 'test-groq-key',
});
assert.equal(groqSpecificKey.keySource, 'GROQ_API_KEY');

const openrouter = resolveOpenAICompatibleConfig({
  OPENAI_BASE_URL: 'https://openrouter.ai/api/v1',
  OPENAI_API_KEY: 'test-router-key',
  OPENROUTER_MODEL: 'openai/gpt-4o-mini',
});
assert.equal(openrouter.provider, 'openrouter');
assert.equal(openrouter.modelsUrl, 'https://openrouter.ai/api/v1/models');
assert.equal(
  resolveOpenAICompatibleModel(
    { OPENROUTER_MODEL: 'openai/gpt-4o-mini' },
    openrouter,
    'automatic',
  ),
  'openai/gpt-4o-mini',
);

const custom = resolveOpenAICompatibleConfig({
  OPENAI_BASE_URL: 'https://ai.example.test/v1',
  OPENAI_API_KEY: 'test-custom-key',
  OPENAI_MODEL: 'provider/model-1',
});
assert.equal(custom.provider, 'openai-compatible');
assert.equal(custom.chatCompletionsUrl, 'https://ai.example.test/v1/chat/completions');
assert.equal(
  resolveOpenAICompatibleModel(
    { OPENAI_MODEL: 'provider/model-1' },
    custom,
    'automatic',
  ),
  'provider/model-1',
);

assert.throws(
  () => resolveOpenAICompatibleConfig({ OPENAI_BASE_URL: 'http://ai.example.test/v1' }),
  /HTTPS/,
);
assert.throws(
  () => resolveOpenAICompatibleConfig({ OPENAI_BASE_URL: 'https://user:pass@ai.example.test/v1' }),
  /credentials/,
);
assert.throws(
  () => resolveOpenAICompatibleConfig({ OPENAI_BASE_URL: 'https://ai.example.test/v1?key=secret' }),
  /query parameters/,
);

// Exercise the real provider router with a fake HTTP response so no paid provider is called.
const originalFetch = globalThis.fetch;
const requests = [];
globalThis.fetch = async (input, init = {}) => {
  const headers = new Headers(init.headers);
  const url = String(input);
  requests.push({
    url,
    authorization: headers.get('Authorization'),
    anthropicKey: headers.get('x-api-key'),
    geminiKey: headers.get('x-goog-api-key'),
    body: JSON.parse(String(init.body || '{}')),
  });
  const payload = url.includes('anthropic')
    ? { content: [{ type: 'text', text: 'claude routing test passed' }], usage: { input_tokens: 2, output_tokens: 2 } }
    : {
        choices: [{ message: { content: 'routing test passed' } }],
        usage: { prompt_tokens: 2, completion_tokens: 2 },
      };
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

try {
  const explicit = await callModel(
    {
      OPENAI_BASE_URL: 'https://api.groq.com/openai/v1',
      OPENAI_API_KEY: 'test-only-key',
    },
    {
      provider: 'openai',
      model: 'automatic',
      system: 'test system',
      user: 'test prompt',
      maxTokens: 32,
    },
  );
  assert.equal(explicit.text, 'routing test passed');
  assert.equal(explicit.provider, 'groq');
  assert.equal(requests[0].url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(requests[0].authorization, 'Bearer test-only-key');
  assert.equal(requests[0].body.model, 'openai/gpt-oss-20b');

  requests.length = 0;
  const automatic = await callModel(
    {
      OPENAI_BASE_URL: 'https://api.groq.com/openai/v1',
      OPENAI_API_KEY: 'test-only-key',
      OVYX_AI_PROVIDER_ORDER: 'gemini,deepseek,cloudflare-workers-ai,groq',
    },
    {
      provider: 'automatic',
      model: 'automatic',
      system: 'test system',
      user: 'test prompt',
      maxTokens: 32,
    },
  );
  assert.equal(automatic.text, 'routing test passed');
  assert.equal(automatic.provider, 'groq');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(requests[0].authorization, 'Bearer test-only-key');

  requests.length = 0;
  const openai = await callModel(
    { OPENAI_API_KEY: 'test-openai-key' },
    { provider: 'openai', model: 'automatic', system: 'test system', user: 'test prompt', maxTokens: 32 },
  );
  assert.equal(openai.provider, 'openai');
  assert.equal(requests[0].url, 'https://api.openai.com/v1/responses');
  assert.equal(requests[0].authorization, 'Bearer test-openai-key');

  requests.length = 0;
  const claude = await callModel(
    { ANTHROPIC_API_KEY: 'test-anthropic-key' },
    { provider: 'anthropic', model: 'automatic', system: 'test system', user: 'test prompt', maxTokens: 32 },
  );
  assert.equal(claude.provider, 'claude');
  assert.equal(claude.text, 'claude routing test passed');
  assert.equal(requests[0].url, 'https://api.anthropic.com/v1/messages');
  assert.equal(requests[0].anthropicKey, 'test-anthropic-key');

  requests.length = 0;
  const deepseek = await callModel(
    { DEEPSEEK_API_KEY: 'test-deepseek-key' },
    { provider: 'deepseek', model: 'deepseek-flash', system: 'test system', user: 'test prompt', maxTokens: 32 },
  );
  assert.equal(deepseek.provider, 'deepseek');
  assert.equal(requests[0].url, 'https://api.deepseek.com/chat/completions');
  assert.equal(requests[0].authorization, 'Bearer test-deepseek-key');

  requests.length = 0;
  const gemini = await callModel(
    { GEMINI_API_KEY: 'test-gemini-key' },
    { provider: 'gemini', model: 'gemini-2.5-flash', system: 'test system', user: 'test prompt', maxTokens: 32 },
  );
  assert.equal(gemini.provider, 'gemini');
  assert.equal(requests[0].url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
  assert.equal(requests[0].geminiKey, 'test-gemini-key');
  assert.equal(requests[0].url.includes('test-gemini-key'), false);

  requests.length = 0;
  const sharedGateway = await callModel(
    {
      OVYX_AI_BASE_URL: 'https://api.groq.com/openai/v1',
      OVYX_AI_MODEL: 'openai/gpt-oss-20b',
      ANTHROPIC_API_KEY: 'test-shared-gateway-key',
    },
    {
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      system: 'test system',
      user: 'test prompt',
      maxTokens: 32,
    },
  );
  assert.equal(sharedGateway.provider, 'groq');
  assert.equal(sharedGateway.model, 'openai/gpt-oss-20b');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(requests[0].authorization, 'Bearer test-shared-gateway-key');
  assert.equal(requests[0].body.model, 'openai/gpt-oss-20b');

  requests.length = 0;
  requests.length = 0;
  const selectedSlotWins = await callModel(
    {
      OVYX_AI_BASE_URL: 'https://api.groq.com/openai/v1',
      OVYX_AI_MODEL: 'openai/gpt-oss-20b',
      GEMINI_API_KEY: 'test-selected-gemini-slot',
      GROQ_API_KEY: 'test-other-provider-slot',
    },
    {
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      system: 'test system',
      user: 'test prompt',
      maxTokens: 32,
    },
  );
  assert.equal(selectedSlotWins.provider, 'groq');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].authorization, 'Bearer test-selected-gemini-slot');

  requests.length = 0;
  const sharedGatewayClaudeLabel = await callModel(
    {
      OVYX_AI_BASE_URL: 'https://api.groq.com/openai/v1',
      OVYX_AI_MODEL: 'openai/gpt-oss-20b',
      GEMINI_API_KEY: 'test-any-slot-key',
    },
    {
      provider: 'claude',
      model: 'claude-sonnet-4-6',
      system: 'test system',
      user: 'test prompt',
      maxTokens: 32,
    },
  );
  assert.equal(sharedGatewayClaudeLabel.provider, 'groq');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].authorization, 'Bearer test-any-slot-key');
  assert.equal(requests[0].body.model, 'openai/gpt-oss-20b');

  const workersRequests = [];
  const workersAI = {
    run: async (model, payload) => {
      workersRequests.push({ model, payload });
      return { response: 'Cloudflare Workers AI fallback passed' };
    }
  };
  const fallback = await callModel(
    { AI: workersAI, OVYX_AI_PROVIDER_ORDER: 'gemini,deepseek,claude,openai' },
    { provider: 'automatic', model: 'automatic', system: 'test system', user: 'test prompt', maxTokens: 32 },
  );
  assert.equal(fallback.provider, 'cloudflare-workers-ai');
  assert.equal(fallback.text, 'Cloudflare Workers AI fallback passed');
  assert.equal(workersRequests.length, 1);
} finally {
  globalThis.fetch = originalFetch;
}

console.log('OpenAI-compatible endpoint and real router tests passed.');
