import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { QUOTA_PLANS } from '../functions/_lib/token-quota.js';
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
const entitlements = readFileSync(new URL('../functions/api/entitlements.js', import.meta.url), 'utf8');
assert.match(entitlements, /webStudio: true,[\s\S]*?advancedWebStudio: false,[\s\S]*?appStudio: false/);
assert.match(entitlements, /function buildPaidCapabilities\(tier\)[\s\S]*?webStudio: true,[\s\S]*?appStudio: true/);
assert.match(entitlements, /advancedWebStudio: tier === 'max'/);
console.log('OVYX plan quota, Universal Connection and App Studio gate tests passed.');
