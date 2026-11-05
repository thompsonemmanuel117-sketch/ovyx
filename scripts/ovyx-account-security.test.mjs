import assert from 'node:assert/strict';
import fs from 'node:fs';
import { hasValidRollingAccess, buildPaidCapabilities, applyGlobalGating, applyFeatureRules } from '../functions/api/entitlements.js';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const now = Date.UTC(2026, 10, 5);

// The live entitlement primitives must reject expired/canceled paid plans.
assert.equal(hasValidRollingAccess({ planTier: 'pro', planTierState: 'active', expiresAt: now + 60000 }, now), true);
assert.equal(hasValidRollingAccess({ planTier: 'pro', planTierState: 'active', expiresAt: now - 1 }, now), false);
assert.equal(hasValidRollingAccess({ planTier: 'max', planTierState: 'canceled', expiresAt: now + 60000 }, now), false);
assert.equal(hasValidRollingAccess({ planTier: 'free', planTierState: 'active', expiresAt: now + 60000 }, now), false);

// Paid capabilities are derived from the same resolver used by protected API routes.
const pro = buildPaidCapabilities('pro');
const max = buildPaidCapabilities('max');
assert.equal(pro.webStudio, true);
assert.equal(pro.advancedWebStudio, false);
assert.equal(pro.appStudio, true);
assert.equal(max.advancedWebStudio, true);
assert.equal(max.appStudio, true);
assert.equal(applyGlobalGating({ webStudio: true }, { webStudio: 'pro' }, 'free').webStudio, false);
assert.equal(applyFeatureRules({ webStudio: true }, [{ feature: 'webStudio', locked: true }]).webStudio, false);

const middleware = read('functions/api/_middleware.js');
assert.match(middleware, /if \(requiredFeatures && !user\)/, 'Plan-gated API routes must reject anonymous callers before route execution.');
assert.match(middleware, /AUTH_REQUIRED/);
assert.match(middleware, /resolveEntitlements\(context\.env, user\)/, 'Feature access must be resolved from server-owned account state.');

const rbac = read('functions/api/admin/rbac.js');
assert.match(rbac, /import \{ resolveEntitlements \} from '\.\.\/entitlements\.js'/, 'RBAC must use the central entitlement resolver.');
assert.match(rbac, /entitlements\?\.capabilities\?\.\[capability\] === true/, 'RBAC decisions must use resolved capabilities.');
assert.doesNotMatch(rbac, /CAPABILITIES\[role\]/, 'RBAC must not authorize from a second hard-coded tier matrix.');

const auth = read('functions/_lib/firebase.js');
assert.match(auth, /account\.disabled === true/, 'Disabled Firebase accounts must be rejected.');
assert.match(auth, /if \(!emailVerified\)/, 'Unverified accounts must be blocked server-side.');
assert.match(auth, /validSince/, 'Revoked sessions must be rejected.');

const rules = read('firestore.rules');
assert.match(rules, /function protectedUserFields\(\)/);
assert.match(rules, /'plan'[\s\S]*?'entitlements'[\s\S]*?'subscription'[\s\S]*?'current_monthly_tokens'/, 'Plan, subscription and wallet balances must remain server-authoritative.');
assert.match(rules, /allow update: if isOwner\(uid\)[\s\S]*?doesNotChangeProtectedUserFields\(\)/);
assert.match(rules, /match \/users\/\{userEmail\}\/projects\/\{projectId\}[\s\S]*?allow read, write: if false/, 'Browser clients must not bypass the authenticated project API.');
assert.match(rules, /match \/\{document=\*\*\}[\s\S]*?allow read, write: if false/);

const payments = read('functions/api/payments/create.js');
assert.match(payments, /verifyFirebaseIdToken/, 'Checkout must require a verified Firebase identity.');
assert.match(payments, /getServerPrice/, 'Subscription prices must come from server configuration.');
assert.match(payments, /emailVerified!==true/, 'Unverified users must not start checkout.');

const opay = read('functions/api/payments/opay-webhook.js');
const paystack = read('functions/api/payments/paystack-webhook.js');
assert.match(opay, /timingSafeEqual\(supplied,expected\)/);
assert.match(opay, /setFirestoreDocumentIfCurrent/, 'OPay fulfillment must use conditional writes.');
assert.match(paystack, /timingSafeEqual\(actualBytes,expectedBytes\)/);
assert.match(paystack, /claimIdempotencyKey/, 'Paystack webhook fulfillment must be idempotent.');

const quota = read('functions/_lib/token-quota.js');
assert.match(quota, /setFirestoreDocumentIfCurrent/, 'Quota mutations must use Firestore compare-and-set writes.');
assert.match(quota, /booster_tokens/, 'Purchased token boosters must remain server-owned.');
assert.match(quota, /export async function beginAIQuota/);
assert.match(quota, /export async function finalizeAIQuota/);

const adminUsers = read('functions/api/admin/users.js');
assert.match(adminUsers, /authorizeRoot/, 'User administration must require the root owner.');
assert.match(adminUsers, /adminActionBy/, 'Administrative account changes must record the actor.');
assert.match(adminUsers, /setFirebaseAccountDisabled/, 'Account suspension must also disable Firebase Authentication.');

const deletion = read('functions/api/account/delete.js');
assert.match(deletion, /assertFreshAuth/, 'Account deletion must require recent authentication.');
assert.match(deletion, /PRIVILEGED_ACCOUNT_DELETE_BLOCKED/, 'The root owner account must not be self-deleted.');

console.log('OVYX account security tests passed: live plan expiry, shared RBAC, anonymous-route denial, Firebase verification, protected user data, verified checkout, idempotent payment fulfillment, server-owned token quotas and audited administration.');