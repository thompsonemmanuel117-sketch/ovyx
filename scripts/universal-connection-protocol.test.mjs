import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
const universalSource = readFileSync(new URL('../functions/_lib/universal-connections.js', import.meta.url), 'utf8');
const connectionsRouteSource = readFileSync(new URL('../functions/api/settings/connections.js', import.meta.url), 'utf8');

// Protect the original connection-management capabilities against accidental
// deletion while purpose-scoped Brain/Web Studio routing evolves.
for (const name of [
  'encryptSecret',
  'publicConnection',
  'buildConnectionRecord',
  'getConnection',
  'getActiveBrainConnectionId',
  'callUserUniversalConnection',
  'testUserConnection',
]) {
  assert.match(
    universalSource,
    new RegExp('export\\s+(?:async\\s+)?function\\s+' + name + '\\b'),
    'The existing Universal Connection runtime export must remain available: ' + name,
  );
}
assert.match(universalSource, /let encryptedSecret = existing\?\.encryptedSecret \|\| null/,
  'Editing connection metadata without supplying a new key must preserve the saved encrypted credential.');
assert.match(universalSource, /delete copy\.encryptedSecret/);
assert.match(universalSource, /delete copy\.secret/,
  'Credentials must remain hidden from connection list and detail responses.');
assert.match(universalSource, /name: 'AES-GCM'/,
  'Saved credentials must remain authenticated-encrypted at rest.');
for (const method of [
  /request\.method === 'GET'/,
  /request\.method === 'DELETE'/,
  /request\.method !== 'POST' && request\.method !== 'PUT'/,
]) {
  assert.match(connectionsRouteSource, method,
    'Listing, deleting, creating, and updating connections must remain available.');
}
assert.match(connectionsRouteSource, /buildConnectionRecord/,
  'The existing create/update path must remain available.');
assert.match(connectionsRouteSource, /deleteFirestoreDocumentAtPath/,
  'The existing delete path must remain available.');
assert.match(connectionsRouteSource, /action === 'test'/,
  'The existing connection health-test action must remain available.');
for (const action of ['use-ai', 'clear-ai', 'use-webstudio', 'clear-webstudio']) {
  assert.ok(connectionsRouteSource.includes("action === '" + action + "'"),
    'The account purpose-selection action must remain available: ' + action);
}
assert.match(universalSource, /requireAIProtocol = true/,
  'A generic HTTP, webhook, database or tool connection must not be treated as an AI Brain by default.');
assert.match(universalSource, /if \(requireAIProtocol && !supportsAIProtocol\(record\.protocol\)\)/,
  'Universal Connection invocation must validate the selected protocol before sending AI prompts.');
assert.match(universalSource, /export async function getActiveWebStudioConnectionId/,
  'Web Studio continuation must have its own account-scoped connection selection.');
assert.match(universalSource, /canUseForWebStudio: copy\.active === true && supportsAI/,
  'Only active AI-protocol connections may be assigned to Web Studio.');
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
