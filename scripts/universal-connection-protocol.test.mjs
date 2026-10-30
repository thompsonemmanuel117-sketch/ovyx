import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  applyConnectionAuth,
  buildConnectionRecord,
  buildUniversalConnectionPayload,
  callUserUniversalConnection,
  getActiveBrainConnectionId,
  getActiveWebStudioConnectionId,
  publicConnection,
  supportsAIProtocol,
  testUserConnection,
  universalConnectionEndpoint,
} from '../functions/_lib/universal-connections.js';

const universalSource = readFileSync(new URL('../functions/_lib/universal-connections.js', import.meta.url), 'utf8');
const connectionsRouteSource = readFileSync(new URL('../functions/api/settings/connections.js', import.meta.url), 'utf8');

// Legacy saved records can still be recognized and removed, but they are not
// advertised or callable as model providers.
assert.equal(supportsAIProtocol('openai-chat'), true);
assert.equal(supportsAIProtocol('anthropic-messages'), true);
assert.equal(supportsAIProtocol('gemini-generate-content'), true);
assert.equal(supportsAIProtocol('http-json'), false);
const legacyPublicRecord = publicConnection({
  id: 'legacy-ai-1',
  type: 'ai',
  protocol: 'openai-chat',
  active: true,
  encryptedSecret: 'encrypted-placeholder',
  secret: 'must-not-leak',
}, 'legacy-ai-1');
assert.equal(legacyPublicRecord.hasSecret, true);
assert.equal(legacyPublicRecord.secret, undefined);
assert.equal(legacyPublicRecord.encryptedSecret, undefined);
assert.deepEqual(legacyPublicRecord.capabilities, {
  canUseAsBrain: false,
  canUseForWebStudio: false,
});

assert.equal(await getActiveBrainConnectionId({}, { uid: 'owner-1' }), null);
assert.equal(await getActiveWebStudioConnectionId({}, { uid: 'owner-1' }), null);
await assert.rejects(
  () => callUserUniversalConnection({}, {
    connectionId: 'legacy-ai-1',
    authUser: { uid: 'owner-1' },
    system: 'system prompt',
    user: 'user prompt',
  }),
  error => error.code === 'AI_PROVIDER_DISABLED' && error.status === 409,
  'The library-level model call must fail before it can read credentials or send a request.',
);

// Attempts to create or edit an external AI model connection are rejected at
// the connection-record boundary, before encryption or endpoint validation.
for (const input of [
  { name: 'Legacy AI', type: 'ai', endpoint: 'https://example.test/v1', protocol: 'openai-chat', authMode: 'none' },
  { name: 'Gemini Brain', type: 'tool', endpoint: 'https://example.test/v1', protocol: 'gemini-generate-content', authMode: 'bearer' },
  { name: 'Claude Brain', type: 'http', endpoint: 'https://example.test/v1', protocol: 'anthropic-messages', authMode: 'bearer' },
]) {
  await assert.rejects(
    () => buildConnectionRecord({}, input, { uid: 'owner-1', email: 'owner@example.test' }),
    error => error.code === 'AI_PROVIDER_DISABLED' && error.status === 409,
  );
}

// Non-AI HTTP/webhook/database/tool connections remain creatable and keep their
// explicit generic JSON protocol without being mistaken for model providers.
const serviceRecord = await buildConnectionRecord(
  {},
  {
    name: 'Order webhook',
    type: 'webhook',
    endpoint: 'https://service.example.test/ovyx/orders',
    protocol: 'http-json',
    authMode: 'none',
    active: true,
  },
  { uid: 'owner-1', email: 'owner@example.test' },
);
assert.equal(serviceRecord.type, 'webhook');
assert.equal(serviceRecord.protocol, 'http-json');
assert.equal(serviceRecord.active, true);
assert.equal(serviceRecord.encryptedSecret, null);

// The legacy protocol serializers remain deterministic for safe compatibility
// and migration inspection; they are not reachable from model routing.
assert.equal(
  universalConnectionEndpoint({ protocol: 'openai-chat', endpoint: 'https://api.deepseek.com' }),
  'https://api.deepseek.com/chat/completions',
);
assert.equal(
  universalConnectionEndpoint({ protocol: 'anthropic-messages', endpoint: 'https://api.anthropic.com' }),
  'https://api.anthropic.com/v1/messages',
);
assert.equal(
  universalConnectionEndpoint({ protocol: 'anthropic-messages', endpoint: 'https://api.anthropic.com/v1' }),
  'https://api.anthropic.com/v1/messages',
);
assert.equal(
  universalConnectionEndpoint({ protocol: 'gemini-generate-content', endpoint: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.5-flash' }),
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
);
const anthropicBody = buildUniversalConnectionPayload(
  { protocol: 'anthropic-messages', model: 'claude-sonnet-4-6' },
  { system: 'be helpful', user: 'say hello', maxTokens: 120 },
);
assert.equal(anthropicBody.model, 'claude-sonnet-4-6');
const geminiBody = buildUniversalConnectionPayload(
  { protocol: 'gemini-generate-content', model: 'gemini-2.5-flash' },
  { system: 'be helpful', user: 'say hello', maxTokens: 120 },
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

// Both the route and the underlying library reject AI-protocol readiness checks
// before any fetch call, while still allowing safe HTTP/webhook checks.
const testStart = universalSource.indexOf('export async function testUserConnection(');
const aiGuard = universalSource.indexOf('if (supportsAIProtocol(record.protocol))', testStart);
const firstFetch = universalSource.indexOf('await fetch(', testStart);
assert.ok(testStart >= 0 && aiGuard > testStart && firstFetch > aiGuard);
assert.match(connectionsRouteSource, /if \(supportsAIProtocol\(record\.protocol\)\)[\s\S]{0,300}AI_PROVIDER_DISABLED/);
assert.match(connectionsRouteSource, /action === 'use-ai'/);
assert.match(connectionsRouteSource, /action === 'clear-ai'/);
assert.match(connectionsRouteSource, /action === 'use-webstudio'/);
assert.match(connectionsRouteSource, /action === 'clear-webstudio'/);
assert.match(universalSource, /name: 'AES-GCM'/);
assert.match(universalSource, /delete copy\.encryptedSecret/);
assert.match(universalSource, /delete copy\.secret/);

console.log('Universal Connection tests passed: legacy AI credentials preserved but blocked from routing, while non-AI service connections remain supported.');
