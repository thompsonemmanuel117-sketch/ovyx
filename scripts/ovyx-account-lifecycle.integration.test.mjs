import assert from 'node:assert/strict';
import fs from 'node:fs';
import { generateKeyPairSync } from 'node:crypto';
import { verifyFirebaseIdToken } from '../functions/_lib/auth.js';
import { setFirestoreDocument } from '../functions/_lib/firebase-admin.js';
import { applySubscriptionEvent } from '../functions/_lib/subscription.js';
import { beginAIQuota, finalizeAIQuota, getQuotaState } from '../functions/_lib/token-quota.js';
import { resolveEntitlements } from '../functions/api/entitlements.js';
import { isAllowedNewAccountProvider } from '../firebase-auth-blocking/policy.js';

/*
 * Isolated account-lifecycle integration test.
 *
 * This uses a disposable in-memory Firestore REST double and a fake Firebase
 * Identity Toolkit response. No production Firebase project, live Paystack /
 * OPay endpoint, customer card, payment credential or real balance is used.
 * A verified payment event is injected only after the payment endpoint source
 * contracts are checked below.
 */

const uid = 'ovyx-lifecycle-test-user-00000001';
const email = 'ovyx-lifecycle-test@example.invalid';
const authState = { email, emailVerified: false, disabled: false, localId: uid };
const documents = new Map();
let updateSequence = 0;
const privateKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey
  .export({ type: 'pkcs8', format: 'pem' });
const env = {
  FIREBASE_WEB_API_KEY: 'test-only-web-api-key',
  FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
    type: 'service_account',
    project_id: 'ovyx-lifecycle-isolated-test',
    client_email: 'ovyx-test@ovyx-lifecycle-isolated-test.iam.gserviceaccount.com',
    private_key: privateKey,
  }),
};

function encodeValue(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value)
    ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (value && typeof value === 'object') {
    return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encodeValue(v)])) } };
  }
  return { stringValue: String(value) };
}
function decodeValue(value) {
  if (!value || typeof value !== 'object') return null;
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeValue);
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([k, v]) => [k, decodeValue(v)]));
  if ('timestampValue' in value) return value.timestampValue;
  return null;
}
function toDocument(collection, id, record) {
  return {
    name: `projects/ovyx-lifecycle-isolated-test/databases/(default)/documents/${collection}/${id}`,
    fields: Object.fromEntries(Object.entries(record).map(([k, v]) => [k, encodeValue(v)])),
    updateTime: new Date(1_700_000_000_000 + updateSequence++).toISOString(),
  };
}
function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
function keyFor(collection, id) { return `${collection}/${id}`; }
function readRecord(document) {
  return document ? Object.fromEntries(Object.entries(document.fields || {}).map(([k, v]) => [k, decodeValue(v)])) : null;
}

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  const method = String(init.method || 'GET').toUpperCase();

  if (url.hostname === 'identitytoolkit.googleapis.com' && url.pathname.endsWith('/accounts:lookup')) {
    const body = JSON.parse(String(init.body || '{}'));
    if (body.idToken !== 'ovyx-lifecycle-test-token') return response({ error: { message: 'INVALID_ID_TOKEN' } }, 400);
    return response({ users: [{ ...authState }] });
  }
  if (url.hostname === 'oauth2.googleapis.com' && url.pathname === '/token') {
    return response({ access_token: 'ovyx-isolated-firestore-test-token', expires_in: 3600 });
  }
  if (url.hostname === 'firestore.googleapis.com') {
    const marker = '/documents';
    const markerIndex = url.pathname.indexOf(marker);
    if (markerIndex < 0) throw new Error(`Unexpected isolated test Firestore URL: ${url.pathname}`);
    const tail = url.pathname.slice(markerIndex + marker.length).replace(/^\//, '');

    if (tail === ':runQuery' && method === 'POST') {
      const query = JSON.parse(String(init.body || '{}')).structuredQuery || {};
      const field = query.where?.fieldFilter?.field?.fieldPath;
      const expected = decodeValue(query.where?.fieldFilter?.value);
      const rows = [];
      for (const [key, document] of documents) {
        const [collection] = key.split('/');
        const record = readRecord(document);
        if (collection === 'users' && field === 'email' && record.email === expected) rows.push({ document });
      }
      return response(rows.slice(0, query.limit || rows.length));
    }

    const parts = tail.split('/').filter(Boolean).map(decodeURIComponent);
    if (method === 'POST' && parts.length === 1) {
      const collection = parts[0];
      const id = url.searchParams.get('documentId');
      if (!id) return response({ error: { message: 'DOCUMENT_ID_REQUIRED' } }, 400);
      const key = keyFor(collection, id);
      if (documents.has(key)) return response({ error: { status: 'ALREADY_EXISTS' } }, 409);
      const incoming = readRecord({ fields: JSON.parse(String(init.body || '{}')).fields || {} });
      const document = toDocument(collection, id, incoming);
      documents.set(key, document);
      return response(document, 200);
    }

    if (parts.length === 2) {
      const [collection, id] = parts;
      const key = keyFor(collection, id);
      if (method === 'GET') {
        const document = documents.get(key);
        return document ? response(document) : response({ error: { message: 'NOT_FOUND' } }, 404);
      }
      if (method === 'PATCH') {
        const current = documents.get(key);
        const requiredUpdateTime = url.searchParams.get('currentDocument.updateTime');
        if (requiredUpdateTime && current?.updateTime !== requiredUpdateTime) {
          return response({ error: { status: 'FAILED_PRECONDITION' } }, 409);
        }
        const incoming = readRecord({ fields: JSON.parse(String(init.body || '{}')).fields || {} }) || {};
        const masks = url.searchParams.getAll('updateMask.fieldPaths');
        const next = { ...(current ? readRecord(current) : {}) };
        const selected = masks.length ? masks : Object.keys(incoming);
        for (const field of selected) {
          if (Object.prototype.hasOwnProperty.call(incoming, field)) next[field] = incoming[field];
        }
        const document = toDocument(collection, id, next);
        documents.set(key, document);
        return response(document);
      }
    }
    throw new Error(`Unexpected isolated test Firestore operation: ${method} ${url.pathname}`);
  }

  throw new Error(`Unexpected outbound request in isolated account test: ${url.origin}${url.pathname}`);
};

try {
  // Registration policy: only the explicit email/password create-account path
  // may create a new identity. Existing OAuth sign-in behavior is unchanged.
  assert.equal(isAllowedNewAccountProvider('password'), true);
  assert.equal(isAllowedNewAccountProvider('google.com'), false);
  assert.equal(isAllowedNewAccountProvider('github.com'), false);

  await setFirestoreDocument(env, 'users', uid, {
    email, displayName: 'OVYX Lifecycle QA', planTier: 'free', planTierState: 'free',
    expiresAt: null, current_monthly_tokens: 50_000, booster_tokens: 0,
    daily_prompts_allowance: 4, is_monthly_exhausted: false,
  }, { merge: true });
  await setFirestoreDocument(env, 'system', 'config', {
    tokenQuotas: { free: 50_000, pro: 500_000, max: 5_000_000 },
    dailyPromptQuotas: { free: 4, pro: 20, max: 100 },
  }, { merge: true });

  // Step 1 — a newly registered but unverified account can authenticate, but
  // checkout must remain blocked until Firebase confirms email verification.
  const request = () => new Request('https://ovyx.test/api/payments/create', {
    headers: { Authorization: 'Bearer ovyx-lifecycle-test-token' },
  });
  let identity = await verifyFirebaseIdToken(request(), env);
  assert.equal(identity.ok, true);
  assert.equal(identity.user.emailVerified, false);
  const paymentCreate = fs.readFileSync(new URL('../functions/api/payments/create.js', import.meta.url), 'utf8');
  assert.match(paymentCreate, /if\(identity\.user\.emailVerified!==true\)return errorResponse\(403,'EMAIL_VERIFICATION_REQUIRED'/);
  assert.match(paymentCreate, /getServerPrice\(env,productId,currency\)/, 'Checkout must use server-authoritative plan pricing.');

  // Step 2 — verify the email in the isolated Firebase identity fixture.
  authState.emailVerified = true;
  identity = await verifyFirebaseIdToken(request(), env);
  assert.equal(identity.ok, true);
  assert.equal(identity.user.emailVerified, true);

  // Step 3 — inject a verified payment-success event into the real
  // subscription lifecycle service (no payment provider is contacted).
  const activated = await applySubscriptionEvent(env, {
    provider: 'isolated-test-provider',
    eventType: 'payment_success',
    uid,
    email,
    tier: 'pro',
    transactionId: 'test-transaction-0001',
    reference: 'OVYX-TEST-PRO-0001',
    amountMinor: 2000,
    currency: 'USD',
    rawStatus: 'SUCCESS',
  });
  assert.equal(activated.state, 'active');
  assert.equal(activated.tier, 'pro');
  // The payment webhook is responsible for assigning the paid-through date.
  // Seed that verified webhook result in this isolated profile fixture.
  await setFirestoreDocument(env, 'users', uid, {
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  }, { merge: true });

  let entitlements = await resolveEntitlements(env, { uid, email });
  assert.equal(entitlements.accessActive, true);
  assert.equal(entitlements.planTier, 'pro');
  assert.equal(entitlements.capabilities.appStudio, true);

  // Step 4 — paid plan quota is synchronized by the production quota engine.
  let quota = await getQuotaState(env, { uid, email });
  assert.equal(quota.plan, 'pro');
  assert.equal(quota.current_monthly_tokens, 500_000);

  // Step 5 — model a provider-verified token-booster fulfillment in the
  // disposable Firestore fixture, then consume tokens through production quota.
  await setFirestoreDocument(env, 'users', uid, {
    booster_tokens: 100_000,
    lastPaymentReference: 'OVYX-TEST-BOOSTER-0001',
  }, { merge: true });
  const monthlyReservation = await beginAIQuota(env, { uid, email });
  assert.equal(monthlyReservation.mode, 'monthly');
  await finalizeAIQuota(env, monthlyReservation, { totalTokenCount: 500_000 }, 'test prompt', 'test response');
  const boosterReservation = await beginAIQuota(env, { uid, email });
  assert.equal(boosterReservation.mode, 'booster');
  const afterUse = await finalizeAIQuota(env, boosterReservation, { totalTokenCount: 10_000 }, 'test prompt', 'test response');
  assert.equal(afterUse.boosterTokens, 90_000);

  // Step 6 — expire the paid plan. Server entitlements and quota must fall
  // back to Free even if a stale browser still says "Pro".
  await setFirestoreDocument(env, 'users', uid, {
    planTier: 'pro', planTierState: 'active',
    expiresAt: new Date(Date.now() - 60_000).toISOString(),
  }, { merge: true });
  entitlements = await resolveEntitlements(env, { uid, email });
  assert.equal(entitlements.accessActive, false);
  assert.equal(entitlements.planTier, 'free');
  quota = await getQuotaState(env, { uid, email });
  assert.equal(quota.plan, 'free');

  // Step 7 — administrative suspension downgrades the plan and revokes
  // entitlements. The existing admin API must disable the Firebase identity too.
  const suspended = await applySubscriptionEvent(env, {
    provider: 'isolated-test-admin',
    eventType: 'suspended',
    uid, email, tier: 'free',
    transactionId: 'test-suspension-0001',
    reference: 'OVYX-TEST-SUSPEND-0001',
    amountMinor: 0, currency: 'USD',
  });
  assert.equal(suspended.state, 'suspended');
  entitlements = await resolveEntitlements(env, { uid, email });
  assert.equal(entitlements.planTier, 'free');
  const adminUsers = fs.readFileSync(new URL('../functions/api/admin/users.js', import.meta.url), 'utf8');
  assert.match(adminUsers, /setFirebaseAccountDisabled\(/, 'Admin suspension must disable Firebase Authentication.');
  assert.match(adminUsers, /authorizeRoot\(/, 'Only the root owner may suspend accounts.');

  authState.disabled = true;
  const disabledIdentity = await verifyFirebaseIdToken(request(), env);
  assert.equal(disabledIdentity.ok, false);
  assert.equal(disabledIdentity.response.status, 403);

  // Payment flow contract checks: server-verified provider status, amount,
  // currency, webhook HMAC, idempotent fulfillment, owner-bound payment reads,
  // and atomic wallet updates must all remain in the production path.
  const paystackWebhook = fs.readFileSync(new URL('../functions/api/payments/paystack-webhook.js', import.meta.url), 'utf8');
  const paystackVerify = fs.readFileSync(new URL('../functions/api/payments/verify.js', import.meta.url), 'utf8');
  const quotaSource = fs.readFileSync(new URL('../functions/_lib/token-quota.js', import.meta.url), 'utf8');
  assert.match(paystackWebhook, /hmacSha512\(raw,secret\)/);
  assert.match(paystackWebhook, /verifyPayment\(context\.env,reference\)/);
  assert.match(paystackWebhook, /transaction\.status\)\.toLowerCase\(\)!=='success'/);
  assert.match(paystackWebhook, /claimIdempotencyKey\(/);
  assert.match(paystackWebhook, /record\.fulfillmentStatus==='fulfilled'/);
  assert.match(paystackWebhook, /setFirestoreDocumentIfCurrent\(/);
  assert.match(paystackVerify, /String\(payment\.uid\|\|''\)!==String\(identity\.user\.uid\|\|''\)/, 'A payment order may only be read by its owner.');
  assert.match(quotaSource, /setFirestoreDocumentIfCurrent\(/);
  assert.match(quotaSource, /booster_tokens/);

  console.log('OVYX isolated account lifecycle passed: email verification gate, verified-plan activation, server entitlements, paid quota sync, booster consumption, expiry downgrade, admin suspension and disabled-account rejection. Payment provider fulfillment remains contract-verified only; no live payment was made.');
} finally {
  globalThis.fetch = originalFetch;
}
