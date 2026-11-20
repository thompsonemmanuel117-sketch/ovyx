import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { QUOTA_PLANS } from '../functions/_lib/token-quota.js';
import { buildAvailableCapabilities, buildPaidCapabilities } from '../functions/api/entitlements.js';
import { resolveConnectionTier, UNIVERSAL_CONNECTION_LIMITS } from '../functions/api/settings/connections.js';

assert.deepEqual(
  Object.fromEntries(Object.entries(QUOTA_PLANS).map(([tier, row]) => [tier, { monthly: row.monthly, daily: row.daily }])),
  { free: { monthly: 50000, daily: 4 }, pro: { monthly: 500000, daily: 20 }, max: { monthly: 5000000, daily: 100 } },
  'The server quota defaults must match the published plan rules'
);
const now = Date.UTC(2026, 0, 1);
assert.equal(resolveConnectionTier({ planTier: 'pro', planTierState: 'active', expiresAt: Date.UTC(2027, 0, 1) }, 'member@example.test', now), 'pro');
assert.equal(resolveConnectionTier({ planTier: 'max', planTierState: 'trialing', expiresAt: '2027-01-01T00:00:00.000Z' }, 'member@example.test', now), 'max');
assert.equal(resolveConnectionTier({ planTier: 'pro', planTierState: 'active', expiresAt: Date.UTC(2025, 0, 1) }, 'member@example.test', now), 'free');
assert.equal(resolveConnectionTier({ planTier: 'max', planTierState: 'canceled', expiresAt: Date.UTC(2027, 0, 1) }, 'member@example.test', now), 'free');
assert.equal(resolveConnectionTier({ planTier: 'max', planTierState: '', expiresAt: Date.UTC(2027, 0, 1) }, 'member@example.test', now), 'free');
assert.equal(resolveConnectionTier({}, 'ovyxsupportteam@gmail.com', now), 'max');
assert.deepEqual(UNIVERSAL_CONNECTION_LIMITS, { free: 3, pro: 5, max: Infinity });
const expectedAvailableCapabilities = {
  webStudio: true,
  advancedWebStudio: true,
  appStudio: true,
  gameStudio: false,
  aiGeneration: true,
  github: true,
  cloudflareDeploy: true,
  teamWorkspace: true,
  templates: true
};
assert.deepEqual(buildAvailableCapabilities(), expectedAvailableCapabilities);
assert.deepEqual(buildPaidCapabilities('pro'), expectedAvailableCapabilities);
assert.deepEqual(buildPaidCapabilities('max'), expectedAvailableCapabilities);

const entitlements = readFileSync(new URL('../functions/api/entitlements.js', import.meta.url), 'utf8');
assert.match(entitlements, /const capabilities = buildAvailableCapabilities\(\)/);
assert.doesNotMatch(entitlements, /capabilities = applyPlanFeatures\(/);
assert.doesNotMatch(entitlements, /capabilities = applyGlobalGating\(/);
assert.doesNotMatch(entitlements, /capabilities = applyFeatureRules\(/);
const publicPlans = readFileSync(new URL('../functions/api/plans.js', import.meta.url), 'utf8');
assert.match(publicPlans, /free: AVAILABLE_FEATURES,[\s\S]*?pro: AVAILABLE_FEATURES,[\s\S]*?max: AVAILABLE_FEATURES/);
assert.match(publicPlans, /const gating = \{\}/);
assert.match(publicPlans, /planFeaturesManaged: false/);
console.log('OVYX plan quota and open feature availability tests passed.');
