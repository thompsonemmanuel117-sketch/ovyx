import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  OVYX_CLOUDFLARE_FREE_MODEL,
  OVYX_CLOUDFLARE_FREE_MAX_OUTPUT_TOKENS,
  OVYX_CLOUDFLARE_FREE_DEFAULT_DAILY_BUDGET,
  OVYX_CLOUDFLARE_FREE_MAX_DAILY_BUDGET,
  OVYX_CLOUDFLARE_PAID_MAX_DAILY_BUDGET,
  isCloudflareFreeOnlyMode,
  isCloudflarePaidCappedMode,
  isCloudflareWorkersAIGuardedMode,
  getCloudflareWorkersAiDailyNeuronBudget,
  isLegacyProviderRoutingEnabled,
  hasActivePaidAiEntitlement,
  isCloudflareDailyFreeLimitError,
  isCloudflareFreeQuotaError,
  isWebStudioUniversalConnectionFallbackTrigger,
  estimateCloudflareFreeNeurons,
  compactCloudflareFreeMessages,
} from '../functions/_lib/cloudflare-free-ai.js';

assert.equal(OVYX_CLOUDFLARE_FREE_MODEL, '@cf/meta/llama-3.1-8b-instruct-fp8-fast');
assert.equal(OVYX_CLOUDFLARE_FREE_MAX_OUTPUT_TOKENS, 4096);
assert.equal(OVYX_CLOUDFLARE_FREE_DEFAULT_DAILY_BUDGET, 7000);
assert.equal(OVYX_CLOUDFLARE_FREE_MAX_DAILY_BUDGET, 8000);
assert.equal(OVYX_CLOUDFLARE_PAID_MAX_DAILY_BUDGET, 15000);
assert.equal(isCloudflareFreeOnlyMode({ OVYX_AI_ENGINE_MODE: 'cloudflare-free-only' }), true);
assert.equal(isCloudflareFreeOnlyMode({ OVYX_AI_ENGINE_MODE: 'legacy-provider-routing' }), false);
assert.equal(isCloudflarePaidCappedMode({ OVYX_AI_ENGINE_MODE: 'cloudflare-paid-capped' }), true);
assert.equal(isCloudflarePaidCappedMode({ OVYX_AI_ENGINE_MODE: 'cloudflare-free-only' }), false);
assert.equal(isCloudflareWorkersAIGuardedMode({ OVYX_AI_ENGINE_MODE: 'cloudflare-free-only' }), true);
assert.equal(isCloudflareWorkersAIGuardedMode({ OVYX_AI_ENGINE_MODE: 'cloudflare-paid-capped' }), true);
assert.equal(isCloudflareWorkersAIGuardedMode({ OVYX_AI_ENGINE_MODE: 'legacy-provider-routing' }), false);
assert.throws(
  () => getCloudflareWorkersAiDailyNeuronBudget({ OVYX_AI_ENGINE_MODE: 'cloudflare-paid-capped' }),
  error => error?.code === 'OVYX_AI_PAID_BUDGET_NOT_CONFIGURED',
  'paid-capped mode must require an explicitly configured budget',
);
assert.equal(getCloudflareWorkersAiDailyNeuronBudget({
  OVYX_AI_ENGINE_MODE: 'cloudflare-paid-capped', OVYX_WORKERS_AI_DAILY_NEURON_BUDGET: '12000',
}), 12000);
assert.equal(getCloudflareWorkersAiDailyNeuronBudget({
  OVYX_AI_ENGINE_MODE: 'cloudflare-paid-capped', OVYX_WORKERS_AI_DAILY_NEURON_BUDGET: '99999',
}), 15000, 'paid usage must remain bounded by OVYX hard cap');
assert.equal(getCloudflareWorkersAiDailyNeuronBudget({
  OVYX_AI_ENGINE_MODE: 'cloudflare-free-only', OVYX_WORKERS_AI_DAILY_NEURON_BUDGET: '99999',
}), 8000, 'free mode must retain the existing lower cap');
assert.equal(isLegacyProviderRoutingEnabled({ OVYX_AI_ENGINE_MODE: 'legacy-provider-routing' }), false);
assert.equal(isLegacyProviderRoutingEnabled({ OVYX_AI_ENGINE_MODE: 'legacy-provider-routing', OVYX_ALLOW_PAID_PROVIDER_ROUTING: 'true' }), true);

const now = Date.now();
assert.equal(hasActivePaidAiEntitlement({ planTier: 'pro', planTierState: 'active', accessActive: true, expiresAt: now + 60000 }, now), true);
assert.equal(hasActivePaidAiEntitlement({ planTier: 'max', planTierState: 'canceled', accessActive: false, expiresAt: now + 60000 }, now), false);
assert.equal(hasActivePaidAiEntitlement({ planTier: 'pro', planTierState: 'active', accessActive: true, expiresAt: now - 1 }, now), false);
assert.equal(hasActivePaidAiEntitlement({ planTier: 'free', planTierState: 'active', accessActive: true, expiresAt: now + 60000 }, now), false);
assert.equal(hasActivePaidAiEntitlement({ role: 'ROOT_SUPERUSER', bypass: true }, now), true);
assert.equal(isCloudflareDailyFreeLimitError({ code: '3036', status: 429 }), true);
assert.equal(isCloudflareDailyFreeLimitError({ message: 'Used up your daily free allocation of 10,000 neurons' }), true);
assert.equal(isCloudflareDailyFreeLimitError({ status: 429, message: 'temporary rate limit' }), false);
assert.equal(isCloudflareFreeQuotaError({ code: 'OVYX_AI_NEURON_BUDGET_EXHAUSTED' }), true);
assert.equal(isCloudflareFreeQuotaError({ code: 'OVYX_AI_CLOUDFLARE_RATE_LIMITED' }), false);
assert.equal(isWebStudioUniversalConnectionFallbackTrigger({ code: 'DAILY_RATION_EXHAUSTED' }), true);
assert.equal(isWebStudioUniversalConnectionFallbackTrigger({ code: 'ACTIVE_PAID_SUBSCRIPTION_REQUIRED' }), false);

const sample = [{ role: 'system', content: 'Safe instructions.' }, { role: 'user', content: 'Build a responsive site.' }];
assert.ok(estimateCloudflareFreeNeurons(sample, 256) > 0);
assert.ok(estimateCloudflareFreeNeurons(sample, 4096) > estimateCloudflareFreeNeurons(sample, 256));
const compacted = compactCloudflareFreeMessages([
  { role: 'system', content: 's'.repeat(50000) },
  { role: 'user', content: 'u'.repeat(50000) },
  { role: 'assistant', content: 'a'.repeat(50000) },
  { role: 'user', content: 'latest user prompt' },
], 12000);
assert.ok(compacted.reduce((sum, item) => sum + item.content.length, 0) <= 12000);
assert.equal(compacted[compacted.length - 1].content, 'latest user prompt');

// Long Web Studio prompts must retain both their opening contract and ending
// project context. Tail-only truncation can discard the required JSON schema and
// target file allowlist, causing a valid Cloudflare response to become unusable.
const longPrompt = 'REQUIRED_OUTPUT_CONTRACT_AT_START\n' +
  'x'.repeat(12000) +
  '\nMIDDLE_ONLY_SENTINEL_SHOULD_BE_TRUNCATED\n' +
  'y'.repeat(12000) +
  '\nREQUIRED_TARGET_PATHS_AT_END';
const boundedLongPrompt = compactCloudflareFreeMessages([
  { role: 'system', content: 'System rules.' },
  { role: 'user', content: longPrompt },
], 10000);
assert.equal(boundedLongPrompt.length, 2);
assert.ok(boundedLongPrompt[1].content.startsWith('REQUIRED_OUTPUT_CONTRACT_AT_START'), 'long prompt compaction must preserve task/output instructions');
assert.ok(boundedLongPrompt[1].content.endsWith('REQUIRED_TARGET_PATHS_AT_END'), 'long prompt compaction must preserve required target/context details');
assert.ok(!boundedLongPrompt[1].content.includes('MIDDLE_ONLY_SENTINEL_SHOULD_BE_TRUNCATED'), 'middle content should be shortened rather than consuming the prompt budget');
assert.ok(boundedLongPrompt.reduce((sum, item) => sum + item.content.length, 0) <= 10000);

const helperSource = readFileSync(new URL('../functions/_lib/cloudflare-free-ai.js', import.meta.url), 'utf8');
const providerSource = readFileSync(new URL('../functions/_lib/providers.js', import.meta.url), 'utf8');
const middlewareSource = readFileSync(new URL('../functions/api/_middleware.js', import.meta.url), 'utf8');
assert.match(helperSource, /setFirestoreDocumentIfCurrent/);
assert.match(helperSource, /OVYX_AI_BUDGET_LEDGER_UNAVAILABLE/);
assert.match(helperSource, /reserveCloudflareFreeUserMinute/);
assert.match(providerSource, /reserveCloudflareFreeUserMinute\(env, options\.authUser\)/);
assert.match(helperSource, /OVYX_AI_NEURON_BUDGET_EXHAUSTED/);
assert.match(providerSource, /isCloudflareWorkersAIGuardedMode\(env\)/);
assert.match(providerSource, /OVYX_AI_ENGINE_MODE_NOT_CONFIGURED/);
assert.match(middlewareSource, /ACTIVE_PAID_SUBSCRIPTION_REQUIRED/);
assert.match(middlewareSource, /isCloudflareWorkersAIGuardedMode/);
console.log('OVYX Cloudflare free-only guard tests passed.');
