import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { applyGlobalGating, applyPlanFeatures } from '../functions/api/entitlements.js';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const source = {
  runtime: read('assets/ovyx-admin-controls.js'),
  browserFixtures: read('scripts/ovyx-owner-browser-api-fixtures.mjs'),
  appMiddleware: read('functions/api/_middleware.js'),
  switchState: read('functions/_lib/integration-state.js'),
  controlApi: read('functions/api/admin/control.js'),
  usersApi: read('functions/api/admin/users.js'),
  firebaseAdmin: read('functions/_lib/firebase-admin.js'),
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
  paymentVerify: read('functions/api/payments/verify.js'),
  opayWebhook: read('functions/api/payments/opay-webhook.js'),
  paystackWebhook: read('functions/api/payments/paystack-webhook.js'),
  shellMiddleware: read('functions/_middleware.js'),
  headers: read('_headers'),
  html: read('index.html'),
  packageJson: JSON.parse(read('package.json')),
};

const changedJavaScriptFiles = [
  'assets/ovyx-admin-controls.js',
  'scripts/ovyx-owner-browser-api-fixtures.mjs',
  'functions/api/_middleware.js',
  'functions/_lib/integration-state.js',
  'functions/api/admin/control.js',
  'functions/api/admin/users.js',
  'functions/_lib/firebase-admin.js',
  'functions/api/admin/plans/update.js',
  'functions/api/plans.js',
  'functions/api/entitlements.js',
  'functions/_lib/token-quota.js',
  'functions/_lib/providers.js',
  'functions/api/admin/ai-config.js',
  'functions/api/admin/identity.js',
  'functions/api/identity.js',
  'functions/_lib/ai-identity.js',
  'functions/api/ai/ovyx.js',
  'functions/api/ai/assistant.js',
  'functions/api/ai/gateway.js',
  'functions/api/admin/broadcasts.js',
  'functions/api/admin/templates.js',
  'functions/api/payments/verify.js',
  'functions/api/payments/opay-webhook.js',
  'functions/api/payments/paystack-webhook.js'
];
for (const path of changedJavaScriptFiles) {
  execFileSync(process.execPath, ['--check', fileURLToPath(new URL('../' + path, import.meta.url))], { stdio: 'pipe' });
}

assert.match(source.appMiddleware, /INTEGRATION_GATED_PATHS/);
for (const path of [
  '/api/ai/assistant', '/api/ai/gateway', '/api/ai/ovyx', '/api/generate',
  '/api/deploy', '/api/payments/create', '/api/github/repos', '/api/workspace/activate'
]) assert.ok(source.appMiddleware.includes("'" + path + "'"), 'Global integration switch must guard ' + path + '.');
assert.match(source.appMiddleware, /PRODUCTION_INTEGRATIONS_PAUSED/);
assert.match(source.appMiddleware, /FEATURE_REQUIREMENTS_BY_PATH/);
assert.match(source.appMiddleware, /resolveEntitlements\(context\.env, user\)/);
assert.match(source.appMiddleware, /import \{ resolveEntitlements \} from '\.\/entitlements\.js';/, 'Feature enforcement middleware must import the resolver it invokes.');
assert.match(source.appMiddleware, /FEATURE_NOT_INCLUDED/);
assert.match(source.entitlements, /aiGeneration: true/, 'Free AI access must remain consistent with the existing Free prompt/token allowance.');
assert.match(source.assistantAI, /capabilities\?\.webStudio !== true/);
assert.match(source.gatewayAI, /capabilities\?\.webStudio !== true/);
assert.match(source.assistantAI, /capabilities\?\.appStudio !== true/);
assert.match(source.gatewayAI, /capabilities\?\.appStudio !== true/);
assert.match(source.runtime, /function bindTemplateAccessGuard/);
assert.match(source.runtime, /capabilities\?\.templates !== true/);
assert.match(source.runtime, /Global feature gates/);
assert.match(source.runtime, /select\.id = 'gate-' \+ key/);
assert.match(source.runtime, /ac\.adminOverride = owner\(\) && config\.masterAdminOverride === true/);
assert.match(source.runtime, /if \(!owner\(\) && window\.AdminConfigurator\)/, 'Owner preview override must clear on account switch/sign-out.');
assert.match(source.html, /function ownerAdminOpsAuthorized\(\)\{return window\.OVYXServerOwner\?\.active===true&&window\.__OVYX_ROOT_AUTH_VERIFIED===true/);
assert.match(source.html, /function injectPlanControl\(\)\{var v=\$\('view-admin-pricing'\);if\(!ownerAdminOpsAuthorized\(\)\|\|!v/);
assert.match(source.html, /function injectAdminOps\(\)\{var v=\$\('view-admin-broadcasts'\);if\(!ownerAdminOpsAuthorized\(\)\|\|!v/);
assert.doesNotMatch(source.html, /const auth=window\.firebase\?\.auth\(\);/, 'Firebase mock/runtime initialization must not call a non-function auth property.');

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
assert.match(source.firebaseAdmin, /disableUser: disabled/, 'Suspension must use the project-level Identity Platform admin field.');
assert.match(source.firebaseAdmin, /accounts:lookup/, 'Account status changes must be verified by a follow-up Firebase lookup.');
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
assert.match(source.entitlements, /Date\.parse\(String\(value\)\)/, 'Entitlements must accept ISO expiry timestamps written by payment fulfillment.');
assert.match(source.quota, /const expiresAt = timestampMs\(profile\.expiresAt\)/, 'AI quota tier must honor subscription expiry.');
assert.match(source.usersApi, /const targetExpiryMs = timestampMs\(target\.expiresAt\)/, 'Quota reset must correctly parse ISO expiry timestamps.');
assert.match(source.paymentVerify, /assertServerAmount\(expectedAmount/);
assert.match(source.opayWebhook, /stored OVYX order snapshot/);
assert.match(source.paystackWebhook, /stored OVYX order snapshot/);
assert.match(source.paystackWebhook, /Number\(data\.amount\)!==expectedMinor/);


assert.match(source.aiConfigApi, /ROOT_REQUIRED/);
assert.match(source.providerRouter, /readGlobalProviderOrder/);
assert.match(source.providerRouter, /globalOrder = null/);
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
assert.match(source.runtime, /function applyPublicPlanCatalog\(data\)/, 'Owner Tools must sync persisted pricing into public account UI');
assert.match(source.runtime, /async function syncPublicPlanCatalog\(\)/, 'Public plan state should refresh on active pages');
assert.match(source.runtime, /OvyxCurrencyEngine\?\.renderFormattedPrices\?\.\(\)/, 'Saved server pricing must update price labels in the current page');
assert.match(source.browserFixtures, /installOwnerBrowserApiFixtures/);
assert.match(source.browserFixtures, /path === '\/api\/admin\/plans\/update'/);
assert.match(source.browserFixtures, /fixtureUsers/);
assert.doesNotMatch(source.runtime, /Math\.random\s*\(/, 'Owner telemetry must not fabricate random service results.');

const managedPlanBase = {
  webStudio: true,
  advancedWebStudio: false,
  appStudio: true,
  gameStudio: false,
  aiGeneration: true,
  github: false,
  cloudflareDeploy: false,
  teamWorkspace: false,
  templates: false
};
const configuredPro = applyPlanFeatures(managedPlanBase, {
  pro: ['webStudio', 'advancedWebStudio', 'gameStudio', 'aiGeneration']
}, 'pro', true);
assert.equal(configuredPro.advancedWebStudio, true, 'Owner-managed Pro features must be able to enable an advanced capability.');
assert.equal(configuredPro.gameStudio, true, 'Owner-managed Pro features must honor the saved allowlist even when a capability is off by default.');
assert.equal(configuredPro.github, false, 'Features absent from the paid-plan allowlist must remain disabled.');
assert.equal(applyPlanFeatures(managedPlanBase, { pro: ['github'] }, 'pro', false).github, false,
  'Unmanaged plans must retain the built-in capability defaults.');
assert.equal(applyGlobalGating({ webStudio: true }, { webstudio: 'max' }, 'pro').webStudio, false,
  'The saved global tier gate must further restrict plan capabilities.');

const testCommand = source.packageJson.scripts.test;
assert.ok(testCommand.includes('scripts/ovyx-owner-controls-live.test.mjs'), 'Owner-controls regression test must run under npm test.');

console.log('OVYX owner-control contracts passed: global switch enforcement, root-only account mutations, pricing/gates/quotas, public price propagation, global AI identity and routing, broadcast/template withdrawal, and evidence-based telemetry.');
