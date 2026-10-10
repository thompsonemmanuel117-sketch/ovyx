import assert from 'node:assert/strict';
import {
  resolveOpenAICompatibleConfig,
  resolveOpenAICompatibleModel,
} from '../functions/_lib/openai-compatible.js';
import { callModel } from '../functions/_lib/providers.js';

const native = resolveOpenAICompatibleConfig({ OPENAI_API_KEY: 'test-native-key' });
assert.equal(native.provider, 'openai');
assert.equal(native.chatCompletionsUrl, 'https://api.openai.com/v1/chat/completions');
assert.equal(native.modelsUrl, 'https://api.openai.com/v1/models');
assert.equal(native.configured, true);

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
  requests.push({
    url: String(input),
    authorization: new Headers(init.headers).get('Authorization'),
    body: JSON.parse(String(init.body || '{}')),
  });
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: 'routing test passed' } }],
      usage: { prompt_tokens: 2, completion_tokens: 2 },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
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
} finally {
  globalThis.fetch = originalFetch;
}

console.log('OpenAI-compatible endpoint and real router tests passed.');
