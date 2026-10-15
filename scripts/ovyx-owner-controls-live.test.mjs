import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const source = {
  runtime: read('assets/ovyx-admin-controls.js'),
  appMiddleware: read('functions/api/_middleware.js'),
  switchState: read('functions/_lib/integration-state.js'),
  controlApi: read('functions/api/admin/control.js'),
  usersApi: read('functions/api/admin/users.js'),
  firebaseAdmin: read('functions/api/_lib/firebase-admin.js'),
  planUpdate: read('functions/api/admin/plans/update.js'),
  publicPlans: read('functions/api/plans.js'),
  entitlements: read('functions/api/entitlements.js'),
  quota: read('functions/_lib/token-quota.js'),
  providerRouter: read('functions/_lib/providers.js'),
  aiConfigApi: read('functions/api/admin/ai-config.js'),
  identityApi: read('functions/api/admin/identity.js'),
  publicIdentityApi: read('functions/api/identity.js'),
  identityDirective: read('functions/_lib/ai-identity.js'),
  nativeAI: read('functions/api/ai/ovyx.js'),
  assistantAI: read('functions/api/ai/assistant.js'),
  gatewayAI: read('functions/api/ai/gateway.js'),
  broadcastApi: read('functions/api/admin/broadcasts.js'),
  templatesApi: read('functions/api/admin/templates.js'),
  shellMiddleware: read('functions/_middleware.js'),
  headers: read('_headers'),
  packageJson: JSON.parse(read('package.json')),
};

assert.match(source.appMiddleware, /INTEGRATION_GATED_PATHS/);
for (const path of [
  '/api/ai/assistant', '/api/ai/gateway', '/api/ai/ovyx', '/api/generate',
  '/api/deploy', '/api/payments/create', '/api/github/repos', '/api/workspace/activate'
]) assert.ok(source.appMiddleware.includes("'" + path + "'"), 'Global integration switch must guard ' + path + '.');
assert.match(source.appMiddleware, /PRODUCTION_INTEGRATIONS_PAUSED/);
assert.match(source.switchState, /getProductionIntegrationState/);
assert.match(source.controlApi, /action === 'setProductionState'/);
assert.match(source.controlApi, /action === 'saveSettings'/);
assert.match(source.runtime, /function patchProductionSwitch/);
assert.match(source.runtime, /function mountProductionControlPanel/);
assert.match(source.runtime, /api\('\/api\/admin\/control'/);

assert.match(source.usersApi, /export async function onRequestPost/);
for (const action of ['setPlan', 'setAccountStatus', 'resetQuota']) {
  assert.ok(source.usersApi.includes("'" + action + "'"), 'Admin user API must support ' + action + '.');
  assert.ok(source.runtime.includes("'" + action + "'") || source.runtime.includes('action: \'' + action + '\''), 'Owner user UI must call ' + action + '.');
}
assert.match(source.usersApi, /ROOT_ACCOUNT_PROTECTED/);
assert.match(source.usersApi, /setFirebaseAccountDisabled/);
assert.match(source.firebaseAdmin, /export async function setFirebaseAccountDisabled/);
assert.match(source.firebaseAdmin, /accounts:update/);
assert.match(source.usersApi, /revokeFirebaseRefreshTokens/);

assert.match(source.planUpdate, /dailyPromptQuotas/);
assert.match(source.planUpdate, /planFeaturesManaged:true/);
assert.match(source.planUpdate, /gating:next\.gating/);
assert.match(source.runtime, /gating: gating/);
assert.match(source.runtime, /tokenQuotas: \{ free: readInt/);
assert.match(source.publicPlans, /planFeaturesManaged/);
assert.match(source.quota, /async function getConfiguredQuotaPlans/);
assert.match(source.quota, /normalizeProfile\(profile, plans\)/);
assert.match(source.quota, /_ovyxQuotaMonthlyLimit/);
assert.match(source.entitlements, /applyPlanFeatures\(capabilities, systemConfig\.planFeatures/);
assert.match(source.entitlements, /applyGlobalGating\(/);

assert.match(source.aiConfigApi, /ROOT_REQUIRED/);
assert.match(source.providerRouter, /readGlobalProviderOrder/);
assert.match(source.providerRouter, /GLOBAL_AI_CONFIG_UNAVAILABLE/);
assert.match(source.runtime, /function saveAIProviderOrder/);
assert.match(source.runtime, /function loadProviderStatus/);
assert.match(source.runtime, /item\.connected === true/);

assert.match(source.identityApi, /aiIdentityUpdatedAt/);
assert.match(source.publicIdentityApi, /assistantName/);
assert.match(source.identityDirective, /getAIIdentityDirective/);
for (const path of ['nativeAI','assistantAI','gatewayAI']) {
  assert.match(source[path], /getAIIdentityDirective/);
  assert.match(source[path], /global(?:AI)?IdentityDirective/);
}

assert.match(source.broadcastApi, /action === 'unpublish'/);
assert.match(source.templatesApi, /action === 'unpublish'/);
assert.match(source.runtime, /function withdrawBroadcast/);
assert.match(source.runtime, /function withdrawTemplate/);
assert.match(source.runtime, /function bindGlobalBroadcast/);
assert.match(source.runtime, /function bindTemplatePublisher/);
assert.match(source.templatesApi, /updatedAt: now/);
assert.match(source.shellMiddleware, /ovyx-admin-controls\.js/);
assert.match(source.headers, /\/assets\/ovyx-admin-controls\.js/);
assert.match(source.runtime, /async function runTelemetryProbe/);
assert.doesNotMatch(source.runtime, /Math\.random\s*\(/, 'Owner telemetry must not fabricate random service results.');

const testCommand = source.packageJson.scripts.test;
assert.ok(testCommand.includes('scripts/ovyx-owner-controls-live.test.mjs'), 'Owner-controls regression test must run under npm test.');

console.log('OVYX owner-control contracts passed: global switch enforcement, root-only account mutations, pricing/gates/quotas, global AI identity and routing, broadcast/template withdrawal, and evidence-based telemetry.');
