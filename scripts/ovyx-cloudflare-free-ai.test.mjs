import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  OVYX_CLOUDFLARE_FREE_MODEL,
  OVYX_CLOUDFLARE_FREE_MAX_OUTPUT_TOKENS,
  OVYX_CLOUDFLARE_FREE_DEFAULT_DAILY_BUDGET,
  OVYX_CLOUDFLARE_FREE_MAX_DAILY_BUDGET,
  isCloudflareFreeOnlyMode,
  isLegacyProviderRoutingEnabled,
  hasActivePaidAiEntitlement,
  estimateCloudflareFreeNeurons,
  compactCloudflareFreeMessages,
} from '../functions/_lib/cloudflare-free-ai.js';

assert.equal(OVYX_CLOUDFLARE_FREE_MODEL, '@cf/qwen/qwen3-30b-a3b-fp8');
assert.equal(OVYX_CLOUDFLARE_FREE_MAX_OUTPUT_TOKENS, 4096);
assert.equal(OVYX_CLOUDFLARE_FREE_DEFAULT_DAILY_BUDGET, 7000);
assert.equal(OVYX_CLOUDFLARE_FREE_MAX_DAILY_BUDGET, 8000);
assert.equal(isCloudflareFreeOnlyMode({ OVYX_AI_ENGINE_MODE: 'cloudflare-free-only' }), true);
assert.equal(isCloudflareFreeOnlyMode({ OVYX_AI_ENGINE_MODE: 'legacy-provider-routing' }), false);
assert.equal(isLegacyProviderRoutingEnabled({ OVYX_AI_ENGINE_MODE: 'legacy-provider-routing' }), false);
assert.equal(isLegacyProviderRoutingEnabled({ OVYX_AI_ENGINE_MODE: 'legacy-provider-routing', OVYX_ALLOW_PAID_PROVIDER_ROUTING: 'true' }), true);

const now = Date.now();
assert.equal(hasActivePaidAiEntitlement({ planTier: 'pro', planTierState: 'active', accessActive: true, expiresAt: now + 60000 }, now), true);
assert.equal(hasActivePaidAiEntitlement({ planTier: 'max', planTierState: 'canceled', accessActive: false, expiresAt: now + 60000 }, now), false);
assert.equal(hasActivePaidAiEntitlement({ planTier: 'pro', planTierState: 'active', accessActive: true, expiresAt: now - 1 }, now), false);
assert.equal(hasActivePaidAiEntitlement({ planTier: 'free', planTierState: 'active', accessActive: true, expiresAt: now + 60000 }, now), false);
assert.equal(hasActivePaidAiEntitlement({ role: 'ROOT_SUPERUSER', bypass: true }, now), true);

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

const helperSource = readFileSync(new URL('../functions/_lib/cloudflare-free-ai.js', import.meta.url), 'utf8');
const providerSource = readFileSync(new URL('../functions/_lib/providers.js', import.meta.url), 'utf8');
const middlewareSource = readFileSync(new URL('../functions/api/_middleware.js', import.meta.url), 'utf8');
assert.match(helperSource, /setFirestoreDocumentIfCurrent/);
assert.match(helperSource, /OVYX_AI_BUDGET_LEDGER_UNAVAILABLE/);
assert.match(helperSource, /OVYX_AI_NEURON_BUDGET_EXHAUSTED/);
assert.match(providerSource, /isCloudflareFreeOnlyMode\(env\)/);
assert.match(providerSource, /OVYX_AI_ENGINE_MODE_NOT_CONFIGURED/);
assert.match(middlewareSource, /ACTIVE_PAID_SUBSCRIPTION_REQUIRED/);
assert.match(middlewareSource, /cloudflare-free-only/);
console.log('OVYX Cloudflare free-only guard tests passed.');
