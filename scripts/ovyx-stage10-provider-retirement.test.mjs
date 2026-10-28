import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  isCloudflareWorkersAIGuardedMode,
  isLegacyProviderRoutingEnabled,
} from '../functions/_lib/cloudflare-free-ai.js';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const [
  packageSource,
  providerRouter,
  guardedEngine,
  statusRoute,
  statusTests,
  assistantRoute,
  gatewayRoute,
  agentRoute,
  orchestrator,
  adminAiConfig,
  duplicateAdapter,
  duplicateBrainAdapter,
  retirementDoc,
] = await Promise.all([
  read('package.json'),
  read('functions/_lib/providers.js'),
  read('functions/_lib/cloudflare-free-ai.js'),
  read('functions/api/ai/status.js'),
  read('scripts/ai-provider-status.test.mjs'),
  read('functions/api/ai/assistant.js'),
  read('functions/api/ai/gateway.js'),
  read('functions/api/generate.js'),
  read('functions/_lib/orchestrator.js'),
  read('functions/api/admin/ai-config.js'),
  read('functions/api/_lib/providers.js'),
  read('functions/api/_lib/brain/providers.js'),
  read('docs/OVYX-STAGE-10-PROVIDER-RETIREMENT.md'),
]);

const scripts = JSON.parse(packageSource).scripts || {};
assert.ok((scripts.test || '').includes('node scripts/ovyx-stage10-provider-retirement.test.mjs'),
  'Stage 10 retirement safety contract must remain in npm test.');

// Production guard: legacy routing must require both the explicit mode and
// the explicit paid-routing acknowledgement. A missing flag must fail closed.
assert.equal(isCloudflareWorkersAIGuardedMode({ OVYX_AI_ENGINE_MODE: 'cloudflare-free-only' }), true);
assert.equal(isCloudflareWorkersAIGuardedMode({ OVYX_AI_ENGINE_MODE: 'cloudflare-paid-capped' }), true);
assert.equal(isCloudflareWorkersAIGuardedMode({ OVYX_AI_ENGINE_MODE: 'legacy-provider-routing' }), false);
assert.equal(isLegacyProviderRoutingEnabled({ OVYX_AI_ENGINE_MODE: 'legacy-provider-routing' }), false);
assert.equal(isLegacyProviderRoutingEnabled({
  OVYX_AI_ENGINE_MODE: 'legacy-provider-routing',
  OVYX_ALLOW_PAID_PROVIDER_ROUTING: 'false',
}), false);
assert.equal(isLegacyProviderRoutingEnabled({
  OVYX_AI_ENGINE_MODE: 'legacy-provider-routing',
  OVYX_ALLOW_PAID_PROVIDER_ROUTING: 'true',
}), true);

// The shared router must apply the guarded route before the legacy-only gate.
const guardedAt = providerRouter.indexOf('if (isCloudflareWorkersAIGuardedMode(env))');
const legacyGateAt = providerRouter.indexOf('if (!isLegacyProviderRoutingEnabled(env))');
assert.ok(guardedAt >= 0 && legacyGateAt > guardedAt, 'guarded Cloudflare routing must precede legacy provider routing');
assert.match(providerRouter, /OVYX_AI_ENGINE_MODE_NOT_CONFIGURED/);
assert.match(guardedEngine, /return String\(env\?\.OVYX_AI_ENGINE_MODE[^]*?=== 'legacy-provider-routing'/);
assert.match(guardedEngine, /OVYX_ALLOW_PAID_PROVIDER_ROUTING/);

// Owner diagnostics must mirror the runtime gate. Guarded, unconfigured and
// disabled legacy modes must return before any external provider is probed.
assert.match(statusRoute, /isCloudflareWorkersAIGuardedMode/);
assert.match(statusRoute, /isLegacyProviderRoutingEnabled/);
assert.match(statusRoute, /engineMode/);
assert.match(statusRoute, /legacyProviderRoutingEnabled/);
assert.match(statusRoute, /externalApiKeysRequired/);
assert.ok(statusRoute.indexOf('if (!isLegacyProviderRoutingEnabled(context.env))') <
  statusRoute.indexOf('const [results, additionalProviders]'),
  'provider diagnostics must not call external model-list APIs when legacy routing is disabled');
assert.match(statusTests, /cloudflare-paid-capped/);
assert.match(statusTests, /legacy-provider-routing-disabled/);
assert.match(statusTests, /must not probe external providers/);
assert.match(legacyProviderTestRoute, /isCloudflareWorkersAIGuardedMode/);
assert.match(legacyProviderTestRoute, /isLegacyProviderRoutingEnabled/);

// The old direct provider-test endpoint must be unreachable in guarded,
// unsupported or unset engine modes, even if a production secret is still
// present. Verify it never performs a network request in those states.
{
  const oldFetch = globalThis.fetch;
  let externalCalls = 0;
  globalThis.fetch = async () => {
    externalCalls += 1;
    throw new Error('external provider call should have been blocked');
  };
  try {
    const scenarios = [
      { env: { OVYX_AI_ENGINE_MODE: 'cloudflare-free-only', GEMINI_API_KEY: 'must-not-be-used' }, code: 'PROVIDER_TESTS_DISABLED_IN_FREE_ONLY_MODE' },
      { env: { OVYX_AI_ENGINE_MODE: 'cloudflare-paid-capped', GEMINI_API_KEY: 'must-not-be-used' }, code: 'PROVIDER_TESTS_DISABLED_IN_GUARDED_MODE' },
      { env: { GEMINI_API_KEY: 'must-not-be-used' }, code: 'PROVIDER_TESTS_DISABLED_BY_ENGINE_MODE' },
    ];
    for (const scenario of scenarios) {
      const response = await testLegacyProviderEndpoint({
        request: new Request('https://ovyx.test/api/test-provider?provider=gemini'),
        env: scenario.env,
        data: { user: { uid: 'stage10-owner', email: 'ovyxsupportteam@gmail.com' } },
      });
      const body = await response.json();
      assert.equal(response.status, 409);
      assert.equal(body.error, scenario.code);
    }
    assert.equal(externalCalls, 0, 'direct provider tests must not contact external APIs while legacy routing is disabled');
  } finally {
    globalThis.fetch = oldFetch;
  }
}

// These call paths still import the shared adapter and are deliberately
// classified as active migration seams until real release acceptance passes.
assert.match(assistantRoute, /from ['"]\.\.\/\.\.\/\_lib\/providers\.js['"]/);
assert.match(gatewayRoute, /from ['"]\.\.\/\.\.\/\_lib\/providers\.js['"]/);
assert.match(agentRoute, /runAgent/);
assert.match(orchestrator, /callJsonModel\(/);
assert.match(orchestrator, /from ['"]\.\/providers\.js['"]/);
assert.match(adminAiConfig, /ALLOWED_PROVIDERS/);

// Duplicate modules are currently in source; this test intentionally prevents
// an audit-only change from falsely claiming that they have already been deleted.
assert.match(duplicateAdapter, /from ['"]\.\.\/\.\.\/\_lib\/brain\/providers\.js['"]/);
assert.match(duplicateBrainAdapter, /export async function generate/);
assert.match(retirementDoc, /Full integration retirement is not yet authorized/);
assert.match(retirementDoc, /production secrets untouched/);
assert.match(retirementDoc, /Required evidence before deleting old integration code/);
assert.match(retirementDoc, /ordinary chat, Web Studio build\/repair, App Studio build\/fix and Agent Mode/);

console.log('OVYX Stage 10 retirement safety tests passed: guarded routing, explicit rollback gate, safe admin diagnostics and current dependency seams are recorded.');
