import assert from 'node:assert/strict';
import {
  applyConnectionAuth,
  buildUniversalConnectionPayload,
  supportsAIProtocol,
  universalConnectionEndpoint,
  buildConnectionRecord,
} from '../functions/_lib/universal-connections.js';

assert.equal(supportsAIProtocol('openai-chat'), true);
assert.equal(supportsAIProtocol('anthropic-messages'), true);
assert.equal(supportsAIProtocol('gemini-generate-content'), true);
assert.equal(supportsAIProtocol('http-json'), false);
assert.equal(universalConnectionEndpoint({ protocol: 'openai-chat', endpoint: 'https://api.deepseek.com' }), 'https://api.deepseek.com/chat/completions');
assert.equal(universalConnectionEndpoint({ protocol: 'anthropic-messages', endpoint: 'https://api.anthropic.com' }), 'https://api.anthropic.com/v1/messages');
assert.equal(universalConnectionEndpoint({ protocol: 'anthropic-messages', endpoint: 'https://api.anthropic.com/v1' }), 'https://api.anthropic.com/v1/messages');
assert.equal(
  universalConnectionEndpoint({ protocol: 'gemini-generate-content', endpoint: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.5-flash' }),
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'
);

const anthropicBody = buildUniversalConnectionPayload(
  { protocol: 'anthropic-messages', model: 'claude-sonnet-4-6' },
  { system: 'be helpful', user: 'say hello', maxTokens: 120 }
);
assert.equal(anthropicBody.model, 'claude-sonnet-4-6');
const savedAnthropicModelWins = buildUniversalConnectionPayload(
  { protocol: 'anthropic-messages', model: 'claude-sonnet-4-6' },
  { model: 'gemini-2.5-flash', system: 'safe', user: 'say hello' }
);
assert.equal(savedAnthropicModelWins.model, 'claude-sonnet-4-6');
assert.equal(anthropicBody.system, 'be helpful');
assert.deepEqual(anthropicBody.messages, [{ role: 'user', content: 'say hello' }]);
assert.equal(anthropicBody.max_tokens, 120);

const geminiBody = buildUniversalConnectionPayload(
  { protocol: 'gemini-generate-content', model: 'gemini-2.5-flash' },
  { system: 'be helpful', user: 'say hello', maxTokens: 120 }
);
assert.deepEqual(geminiBody.systemInstruction, { parts: [{ text: 'be helpful' }] });
assert.deepEqual(geminiBody.contents, [{ role: 'user', parts: [{ text: 'say hello' }] }]);
assert.equal(geminiBody.generationConfig.maxOutputTokens, 120);

const anthropicHeaders = {};
applyConnectionAuth(anthropicHeaders, 'bearer', 'test-anthropic-key', 'anthropic-messages');
assert.equal(anthropicHeaders['x-api-key'], 'test-anthropic-key');
assert.equal(anthropicHeaders['anthropic-version'], '2023-06-01');
assert.equal(anthropicHeaders.Authorization, undefined);

const geminiHeaders = {};
applyConnectionAuth(geminiHeaders, 'bearer', 'test-gemini-key', 'gemini-generate-content');
assert.equal(geminiHeaders['x-goog-api-key'], 'test-gemini-key');
assert.equal(geminiHeaders.Authorization, undefined);

await assert.rejects(
  () => buildConnectionRecord(
    {},
    { name: 'Insecure AI', type: 'ai', endpoint: 'http://example.test/v1', protocol: 'openai-chat', authMode: 'bearer', secret: 'test-key' },
    { uid: 'test-user', email: 'test@example.test' }
  ),
  /HTTPS/
);
await assert.rejects(
  () => buildConnectionRecord(
    {},
    { name: 'Query Secret', type: 'ai', endpoint: 'https://example.test/v1?api_key=do-not-save', protocol: 'openai-chat', authMode: 'bearer', secret: 'test-key' },
    { uid: 'test-user', email: 'test@example.test' }
  ),
  /query parameters/
);
console.log('Universal Connection provider protocol tests passed.');
