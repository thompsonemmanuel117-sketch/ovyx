import assert from 'node:assert/strict';
import {
  resolveOpenAICompatibleConfig,
  resolveOpenAICompatibleModel,
} from '../functions/_lib/openai-compatible.js';

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

console.log('OpenAI-compatible endpoint resolution tests passed.');
