import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { callModel } from '../functions/_lib/providers.js';
import {
  cloudflareOnlyModelOptions,
  OVYX_CLOUDFLARE_ONLY_PROVIDER,
  withCloudflareAIOnly,
} from '../functions/_lib/cloudflare-routing.js';

const binding = { run() {} };
const secure = withCloudflareAIOnly({
  AI: binding,
  OVYX_AI_ENGINE_MODE: 'legacy-provider-routing',
  OVYX_ALLOW_PAID_PROVIDER_ROUTING: 'true',
  GEMINI_API_KEY: 'must-not-be-used',
  ANTHROPIC_API_KEY: 'must-not-be-used',
  DEEPSEEK_API_KEY: 'must-not-be-used',
  OPENAI_API_KEY: 'must-not-be-used',
  GROQ_API_KEY: 'must-not-be-used',
  OPENROUTER_API_KEY: 'must-not-be-used',
});
assert.equal(secure.AI, binding, 'Cloudflare Workers AI binding must survive secure environment wrapping.');
assert.equal(secure.OVYX_AI_ENGINE_MODE, 'cloudflare-free-only');
assert.equal(secure.OVYX_ALLOW_PAID_PROVIDER_ROUTING, 'false');
assert.equal(withCloudflareAIOnly({ OVYX_AI_ENGINE_MODE: 'cloudflare-paid-capped' }).OVYX_AI_ENGINE_MODE, 'cloudflare-paid-capped');
assert.equal(withCloudflareAIOnly({ OVYX_AI_ENGINE_MODE: 'legacy-provider-routing' }).OVYX_AI_ENGINE_MODE, 'cloudflare-free-only');

const options = cloudflareOnlyModelOptions({
  provider: 'gemini',
  preferredProvider: 'openai',
  providerRouting: 'preferred-first',
  fallback: 'automatic',
  useSelectedUniversalBrain: true,
  model: 'claude-sonnet',
});
assert.equal(options.provider, OVYX_CLOUDFLARE_ONLY_PROVIDER);
assert.equal(options.preferredProvider, '');
assert.equal(options.providerRouting, 'automatic');
assert.equal(options.fallback, 'stop');
assert.equal(options.useSelectedUniversalBrain, false);
assert.equal(options.model, 'claude-sonnet', 'The shared callModel boundary pins the actual model independently of caller input.');

const originalFetch = globalThis.fetch;
const outbound = [];
globalThis.fetch = async input => {
  outbound.push(String(input));
  throw new Error('The Cloudflare-only route must not call an external AI provider.');
};
try {
  for (const provider of ['gemini', 'anthropic', 'claude', 'deepseek', 'openai', 'groq', 'openrouter', 'automatic']) {
    await assert.rejects(
      () => callModel({
        OVYX_AI_ENGINE_MODE: 'legacy-provider-routing',
        OVYX_ALLOW_PAID_PROVIDER_ROUTING: 'true',
        GEMINI_API_KEY: 'test-gemini-key',
        ANTHROPIC_API_KEY: 'test-anthropic-key',
        DEEPSEEK_API_KEY: 'test-deepseek-key',
        OPENAI_API_KEY: 'test-openai-key',
        GROQ_API_KEY: 'test-groq-key',
        OPENROUTER_API_KEY: 'test-openrouter-key',
      }, {
        provider,
        preferredProvider: provider,
        useSelectedUniversalBrain: true,
        system: 'Test request.',
        user: 'Hello.',
        maxTokens: 32,
      }),
      error => error?.code === 'OVYX_NATIVE_AI_NOT_CONFIGURED',
      provider + ' must not bypass a missing Cloudflare AI binding or fall back externally.',
    );
  }
  assert.deepEqual(outbound, [], 'No external provider endpoint may be contacted when the Cloudflare binding is missing.');
} finally {
  globalThis.fetch = originalFetch;
}

const providerSource = await readFile(new URL('../functions/_lib/providers.js', import.meta.url), 'utf8');
const routerStart = providerSource.indexOf('export async function callModel(');
const routerEnd = providerSource.indexOf('export async function callJsonModel(', routerStart);
assert.ok(routerStart >= 0 && routerEnd > routerStart, 'The single public model-routing boundary must be present.');
const routerBody = providerSource.slice(routerStart, routerEnd);
assert.match(routerBody, /withCloudflareAIOnly\(env\)/);
assert.match(routerBody, /callCloudflareWorkersAI\(secureEnv/);
assert.match(routerBody, /OVYX_CLOUDFLARE_FREE_MODEL/);
assert.match(routerBody, /OVYX_CLOUDFLARE_ONLY_PROVIDER/);
assert.doesNotMatch(routerBody, /callSelectedUniversalBrain|providerOrder\(|callGemini|callClaude|callDeepSeek|callOpenAI|callGroq|callOpenRouter/);
assert.doesNotMatch(providerSource, /GEMINI_API_KEY|ANTHROPIC_API_KEY|DEEPSEEK_API_KEY|OPENAI_API_KEY|GROQ_API_KEY|OPENROUTER_API_KEY/);
assert.doesNotMatch(providerSource, /generativelanguage\.googleapis\.com|api\.anthropic\.com|api\.deepseek\.com|api\.openai\.com|api\.groq\.com|openrouter\.ai/);

const assistant = await readFile(new URL('../functions/api/ai/assistant.js', import.meta.url), 'utf8');
const gateway = await readFile(new URL('../functions/api/ai/gateway.js', import.meta.url), 'utf8');
const agent = await readFile(new URL('../functions/api/generate.js', import.meta.url), 'utf8');
const callback = await readFile(new URL('../functions/api/agent/callback.js', import.meta.url), 'utf8');
const native = await readFile(new URL('../functions/_lib/ovyx-native-ai.js', import.meta.url), 'utf8');
assert.match(assistant, /cloudflareOnlyModelOptions\(options\)/);
assert.match(gateway, /cloudflareOnlyModelOptions\(options\)/);
assert.match(agent, /requestedProvider:\s*OVYX_CLOUDFLARE_ONLY_PROVIDER/);
assert.match(agent, /withCloudflareAIOnly\(context\.env\)/);
assert.match(callback, /withCloudflareAIOnly\(context\.env\)/);
assert.match(native, /withCloudflareAIOnly\(env\)/);
assert.match(native, /runCloudflareFreeInference/);
assert.doesNotMatch(native, /callSelectedUniversalBrain|universalBrainDependencies/);

console.log('OVYX Cloudflare-only model routing tests passed: caller provider preferences cannot route or fall back outside Cloudflare Workers AI.');
