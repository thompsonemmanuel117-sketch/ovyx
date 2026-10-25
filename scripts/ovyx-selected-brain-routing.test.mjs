import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { callSelectedUniversalBrain } from '../functions/_lib/providers.js';

const user = { uid: 'owner-123', sub: 'owner-123', email: 'owner@example.test' };
const calls = [];
const dependencies = {
  getActiveBrainConnectionId: async (_env, authUser) => {
    assert.equal(authUser.uid, user.uid, 'the Brain lookup must be scoped to the authenticated owner');
    calls.push({ type: 'lookup', authUser });
    return 'owner-brain-1';
  },
  callUserUniversalConnection: async (_env, input) => {
    calls.push({ type: 'invoke', input });
    return {
      provider: 'connection:owner-brain-1',
      model: 'gemini-2.5-flash',
      text: 'Reply from the account-owned AI Brain',
      rawUsage: { prompt_tokens: 3, completion_tokens: 4 },
    };
  },
};

const result = await callSelectedUniversalBrain(
  {},
  {
    provider: 'automatic',
    authUser: user,
    system: 'Be helpful.',
    user: 'Hello.',
    model: 'automatic',
    maxTokens: 64,
  },
  dependencies,
);
assert.equal(result.text, 'Reply from the account-owned AI Brain');
assert.equal(result.routedProvider, 'universal-connection');
assert.equal(result.activeBrainConnectionId, 'owner-brain-1');
assert.equal(result.requestedProvider, 'automatic');
assert.deepEqual(calls.map(item => item.type), ['lookup', 'invoke']);
assert.equal(calls[1].input.connectionId, 'owner-brain-1');
assert.equal(calls[1].input.authUser.uid, user.uid);
assert.equal(calls[1].input.requireAIProtocol, true);
assert.equal(calls[1].input.user, 'Hello.');

// With no explicitly selected Brain, the caller can continue with Cloudflare.
const noBrain = await callSelectedUniversalBrain(
  {},
  { authUser: user, user: 'Hello.' },
  {
    getActiveBrainConnectionId: async () => null,
    callUserUniversalConnection: async () => {
      throw new Error('Must not call a connection when none is selected.');
    },
  },
);
assert.equal(noBrain, null);

// A broken selection is fail-closed: it must not silently switch providers.
await assert.rejects(
  () => callSelectedUniversalBrain(
    {},
    { authUser: user, user: 'Hello.' },
    {
      getActiveBrainConnectionId: async () => { throw new Error('private lookup detail'); },
      callUserUniversalConnection: async () => { throw new Error('must not run'); },
    },
  ),
  error => error.code === 'UNIVERSAL_CONNECTION_SELECTION_FAILED' &&
    !error.message.includes('private lookup detail'),
);
await assert.rejects(
  () => callSelectedUniversalBrain(
    {},
    { authUser: user, user: 'Hello.' },
    {
      getActiveBrainConnectionId: async () => 'owner-brain-1',
      callUserUniversalConnection: async () => {
        throw Object.assign(new Error('provider unavailable'), { status: 503, code: 'CONNECTION_UPSTREAM_FAILED' });
      },
    },
  ),
  error => error.code === 'CONNECTION_UPSTREAM_FAILED' &&
    /did not switch to another AI provider/.test(error.message),
);

const providerSource = readFileSync(new URL('../functions/_lib/providers.js', import.meta.url), 'utf8');
const assistantSource = readFileSync(new URL('../functions/api/ai/assistant.js', import.meta.url), 'utf8');
const docs = readFileSync(new URL('../docs/UNIVERSAL-CONNECTIONS.md', import.meta.url), 'utf8');
assert.match(providerSource, /options\.useSelectedUniversalBrain === true/);
assert.match(providerSource, /options\.webStudioRequest !== true/);
assert.match(providerSource, /options\.appStudioRequest !== true/);
assert.match(providerSource, /OVYX_WEBSTUDIO_UNIVERSAL_CONNECTION_NOT_READY/);
assert.match(assistantSource, /webStudioRequest: isWebStudio/);
assert.match(assistantSource, /appStudioRequest: isAppStudio/);
assert.match(assistantSource, /useSelectedUniversalBrain: !isWebStudio && !isAppStudio/);
assert.match(assistantSource, /useUniversalConnectionAfterCloudflareLimit: true/);
assert.match(docs, /Ordinary OVYX AI Assistant chats/);
assert.match(docs, /activeWebStudioConnectionId/);
assert.match(docs, /user explicitly confirms continuing with their own connection/);
assert.match(docs, /Assigning a Brain alone does not authorize Web Studio to use it/);

console.log('Selected Universal AI Brain routing tests passed: owner-scoped, exclusive on failure, Web Studio fallback consent preserved, App Studio gate unchanged.');
