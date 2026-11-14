/**
 * OVYX Subscription Lifecycle State Machine
 * Phase 3
 */

import {
  getFirestoreData,
  setFirestoreDocument
} from './firebase-admin.js';

export const SUBSCRIPTION_STATES = Object.freeze([
  'trialing',
  'active',
  'past_due',
  'canceled',
  'expired',
  'refunded',
  'chargeback',
  'suspended'
]);

export const TIER_CAPABILITIES = Object.freeze({
  free: Object.freeze({
    webStudio: false,
    advancedWebStudio: false,
    appStudio: false,
    gameStudio: false,
    aiGeneration: true,
    github: false,
    cloudflareDeploy: false,
    teamWorkspace: false
  }),

  pro: Object.freeze({
    webStudio: true,
    advancedWebStudio: true,
    appStudio: false,
    gameStudio: false,
    aiGeneration: true,
    github: true,
    cloudflareDeploy: true,
    teamWorkspace: false
  }),

  max: Object.freeze({
    webStudio: true,
    advancedWebStudio: true,
    appStudio: true,
    gameStudio: true,
    aiGeneration: true,
    github: true,
    cloudflareDeploy: true,
    teamWorkspace: true
  })
});

export const TERMINAL_DOWNGRADE_STATES =
  Object.freeze([
    'expired',
    'refunded',
    'chargeback'
  ]);

const VALID_TRANSITIONS = Object.freeze({
  trialing: new Set([
    'trialing',
    'active',
    'past_due',
    'canceled',
    'expired',
    'suspended'
  ]),

  active: new Set([
    'active',
    'past_due',
    'canceled',
    'expired',
    'refunded',
    'chargeback',
    'suspended'
  ]),

  past_due: new Set([
    'past_due',
    'active',
    'canceled',
    'expired',
    'refunded',
    'chargeback',
    'suspended'
  ]),

  canceled: new Set([
    'canceled',
    'active',
    'expired',
    'refunded',
    'chargeback',
    'suspended'
  ]),

  expired: new Set([
    'expired',
    'active',
    'suspended'
  ]),

  refunded: new Set([
    'refunded',
    'suspended',
    'active'
  ]),

  chargeback: new Set([
    'chargeback',
    'suspended',
    'active'
  ]),

  suspended: new Set([
    'suspended',
    'active',
    'expired',
    'refunded',
    'chargeback'
  ])
});

function normalizeState(value) {
  const state =
    String(value || '')
      .trim()
      .toLowerCase();

  return SUBSCRIPTION_STATES.includes(state)
    ? state
    : 'expired';
}

function normalizeTier(value) {
  const tier =
    String(value || '')
      .trim()
      .toLowerCase();

  return ['free', 'pro', 'max'].includes(tier)
    ? tier
    : 'free';
}

function capabilitiesForTier(tier) {
  return {
    ...TIER_CAPABILITIES[
      normalizeTier(tier)
    ]
  };
}

function nowIso() {
  return new Date().toISOString();
}

function makeEventId(event) {
  return [
    event.provider,
    event.eventType,
    event.transactionId,
    event.reference,
    event.notifyId
  ]
    .filter(Boolean)
    .join(':')
    .slice(0, 240);
}

function assertUid(uid) {
  const value = String(uid || '').trim();

  if (!/^[A-Za-z0-9_-]{20,150}$/.test(value)) {
    throw new Error('Invalid Firebase UID.');
  }

  return value;
}

function assertEmail(email) {
  const value =
    String(email || '')
      .trim()
      .toLowerCase();

  if (
    !value ||
    value.length > 320 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  ) {
    throw new Error('Invalid account email.');
  }

  return value;
}

export function determineTierForPayment(
  requestedTier
) {
  const tier =
    normalizeTier(requestedTier);

  if (!['pro', 'max'].includes(tier)) {
    throw new Error(
      'A successful subscription payment must specify PRO or MAX.'
    );
  }

  return tier;
}

export function normalizePaymentEvent(input) {
  const provider =
    String(input.provider || '')
      .trim()
      .toLowerCase();

  const eventType =
    String(input.eventType || '')
      .trim()
      .toLowerCase();

  const uid = assertUid(input.uid);
  const email = assertEmail(input.email);

  const requestedTier =
    normalizeTier(input.tier);

  return {
    provider,
    eventType,
    uid,
    email,
    tier: requestedTier,
    transactionId:
      String(input.transactionId || '').trim(),
    reference:
      String(input.reference || '').trim(),
    amountMinor:
      Number.isSafeInteger(input.amountMinor)
        ? input.amountMinor
        : Number(input.amountMinor),
    currency:
      String(input.currency || '')
        .trim()
        .toUpperCase(),
    occurredAt:
      input.occurredAt ||
      nowIso(),
    notifyId:
      String(input.notifyId || '').trim(),
    rawStatus:
      String(input.rawStatus || '')
        .trim()
        .toUpperCase(),
    metadata:
      input.metadata &&
      typeof input.metadata === 'object'
        ? input.metadata
        : {}
  };
}

export async function applySubscriptionEvent(
  env,
  input
) {
  const event =
    normalizePaymentEvent(input);

  const userRef =
    await getFirestoreData(
      env,
      'users',
      event.uid
    );

  if (!userRef) {
    throw new Error(
      'Firebase user account does not exist.'
    );
  }

  const currentState =
    normalizeState(
      userRef.planTierState
    );

  const currentTier =
    normalizeTier(
      userRef.planTier
    );

  let nextState = currentState;
  let nextTier = currentTier;

  switch (event.eventType) {
    case 'payment_success':
    case 'subscription_renewed':
      nextState = 'active';
      nextTier =
        determineTierForPayment(event.tier);
      break;

    case 'past_due':
      nextState = 'past_due';
      break;

    case 'canceled':
      nextState = 'canceled';
      break;

    case 'expired':
      nextState = 'expired';
      nextTier = 'free';
      break;

    case 'refunded':
      nextState = 'refunded';
      nextTier = 'free';
      break;

    case 'chargeback':
      nextState = 'chargeback';
      nextTier = 'free';
      break;

    case 'suspended':
      nextState = 'suspended';
      nextTier = 'free';
      break;

    case 'trial_started':
      nextState = 'trialing';
      nextTier = 'free';
      break;

    default:
      throw new Error(
        `Unsupported subscription event: ${event.eventType}`
      );
  }

  const allowed =
    VALID_TRANSITIONS[currentState]?.has(
      nextState
    );

  /*
   * Security rule:
   * downgrade events always win, even if an older
   * local/client state claims otherwise.
   */
  if (
    TERMINAL_DOWNGRADE_STATES.includes(
      nextState
    )
  ) {
    nextTier = 'free';
  }

  if (!allowed) {
    throw new Error(
      `Illegal subscription transition: ${currentState} → ${nextState}`
    );
  }

  const capabilities =
    capabilitiesForTier(nextTier);

  const eventId =
    makeEventId(event);

  const updatedAt = nowIso();

  const update = {
    planTier: nextTier,
    planTierState: nextState,

    capabilities,

    subscriptionProvider:
      event.provider,

    subscriptionReference:
      event.reference,

    subscriptionTransactionId:
      event.transactionId,

    subscriptionCurrency:
      event.currency,

    subscriptionAmountMinor:
      event.amountMinor,

    subscriptionUpdatedAt:
      updatedAt,

    subscriptionEventId:
      eventId,

    subscriptionEventType:
      event.eventType,

    subscriptionEmail:
      event.email
  };

  if (
    event.eventType === 'payment_success' ||
    event.eventType === 'subscription_renewed'
  ) {
    update.lastSuccessfulPaymentAt =
      updatedAt;
  }

  if (
    TERMINAL_DOWNGRADE_STATES.includes(
      nextState
    )
  ) {
    update.advancedAccessRevokedAt =
      updatedAt;
    update.accessRevocationReason =
      nextState;
  }

  await setFirestoreDocument(
    env,
    'users',
    event.uid,
    update,
    { merge: true }
  );

  console.log(
    JSON.stringify({
      type: 'OVYX_SUBSCRIPTION_STATE_CHANGE',
      eventId,
      uid: event.uid,
      provider: event.provider,
      previousState: currentState,
      nextState,
      previousTier: currentTier,
      nextTier,
      transactionId:
        event.transactionId || null,
      reference:
        event.reference || null,
      occurredAt: event.occurredAt,
      processedAt: updatedAt
    })
  );

  return {
    uid: event.uid,
    email: event.email,
    previousState: currentState,
    state: nextState,
    previousTier: currentTier,
    tier: nextTier,
    capabilities,
    eventId
  };
}
