'use strict';

/**
 * OVYX — PAYMENT SUBSCRIPTION LIFECYCLE STATE MACHINE
 *
 * Authoritative states:
 *
 *   trialing
 *   active
 *   past_due
 *   canceled
 *   expired
 *   refunded
 *   chargeback
 *   suspended
 *
 * This module is intentionally deterministic.
 *
 * It does NOT:
 *   - trust browser plan values
 *   - trust browser subscription status
 *   - call OPay
 *   - perform Firestore writes
 *   - calculate entitlement access
 *
 * Subscription timestamp persistence is performed by
 * the authoritative payment route after successful
 * provider verification.
 */

const STATES = Object.freeze([
  'trialing',
  'active',
  'past_due',
  'canceled',
  'expired',
  'refunded',
  'chargeback',
  'suspended'
]);

const EVENTS = Object.freeze([
  'TRIAL_STARTED',
  'PAYMENT_SUCCEEDED',
  'PAYMENT_FAILED',
  'PAYMENT_RECOVERED',
  'SUBSCRIPTION_CANCELED',
  'SUBSCRIPTION_REACTIVATED',
  'SUBSCRIPTION_EXPIRED',
  'REFUND_CONFIRMED',
  'CHARGEBACK_CONFIRMED',
  'ACCOUNT_SUSPENDED',
  'ACCOUNT_REINSTATED'
]);

const TERMINAL_STATES = new Set([
  'refunded',
  'chargeback',
  'expired'
]);

const TRANSITIONS = Object.freeze({
  trialing: Object.freeze({
    TRIAL_STARTED: 'trialing',
    PAYMENT_SUCCEEDED: 'active',
    PAYMENT_FAILED: 'past_due',
    SUBSCRIPTION_CANCELED: 'canceled',
    SUBSCRIPTION_EXPIRED: 'expired',
    REFUND_CONFIRMED: 'refunded',
    CHARGEBACK_CONFIRMED: 'chargeback',
    ACCOUNT_SUSPENDED: 'suspended'
  }),

  active: Object.freeze({
    PAYMENT_SUCCEEDED: 'active',
    PAYMENT_FAILED: 'past_due',
    SUBSCRIPTION_CANCELED: 'canceled',
    SUBSCRIPTION_EXPIRED: 'expired',
    REFUND_CONFIRMED: 'refunded',
    CHARGEBACK_CONFIRMED: 'chargeback',
    ACCOUNT_SUSPENDED: 'suspended'
  }),

  past_due: Object.freeze({
    PAYMENT_SUCCEEDED: 'active',
    PAYMENT_RECOVERED: 'active',
    PAYMENT_FAILED: 'past_due',
    SUBSCRIPTION_CANCELED: 'canceled',
    SUBSCRIPTION_EXPIRED: 'expired',
    REFUND_CONFIRMED: 'refunded',
    CHARGEBACK_CONFIRMED: 'chargeback',
    ACCOUNT_SUSPENDED: 'suspended'
  }),

  canceled: Object.freeze({
    PAYMENT_SUCCEEDED: 'active',
    SUBSCRIPTION_REACTIVATED: 'active',
    SUBSCRIPTION_EXPIRED: 'expired',
    REFUND_CONFIRMED: 'refunded',
    CHARGEBACK_CONFIRMED: 'chargeback',
    ACCOUNT_SUSPENDED: 'suspended'
  }),

  expired: Object.freeze({
    PAYMENT_SUCCEEDED: 'active',
    SUBSCRIPTION_REACTIVATED: 'active',
    REFUND_CONFIRMED: 'refunded',
    CHARGEBACK_CONFIRMED: 'chargeback',
    ACCOUNT_SUSPENDED: 'suspended'
  }),

  refunded: Object.freeze({
    CHARGEBACK_CONFIRMED: 'chargeback',
    ACCOUNT_SUSPENDED: 'suspended'
  }),

  chargeback: Object.freeze({
    ACCOUNT_SUSPENDED: 'suspended'
  }),

  suspended: Object.freeze({
    ACCOUNT_REINSTATED: 'active',
    CHARGEBACK_CONFIRMED: 'chargeback',
    REFUND_CONFIRMED: 'refunded'
  })
});

function normalizeState(value) {
  const state =
    String(value || '')
      .trim()
      .toLowerCase();

  if (
    !STATES.includes(state)
  ) {
    return null;
  }

  return state;
}

function normalizeEvent(value) {
  const event =
    String(value || '')
      .trim()
      .toUpperCase();

  if (
    !EVENTS.includes(event)
  ) {
    return null;
  }

  return event;
}

function assertState(value) {
  const state =
    normalizeState(value);

  if (!state) {
    throw new Error(
      'INVALID_PAYMENT_LIFECYCLE_STATE'
    );
  }

  return state;
}

function assertEvent(value) {
  const event =
    normalizeEvent(value);

  if (!event) {
    throw new Error(
      'INVALID_PAYMENT_LIFECYCLE_EVENT'
    );
  }

  return event;
}

function isTerminalState(value) {
  const state =
    normalizeState(value);

  if (!state) {
    return false;
  }

  return TERMINAL_STATES.has(
    state
  );
}

function canTransition(
  currentState,
  event
) {
  const state =
    assertState(
      currentState
    );

  const lifecycleEvent =
    assertEvent(
      event
    );

  const transitions =
    TRANSITIONS[state] || {};

  return (
    Object.prototype.hasOwnProperty.call(
      transitions,
      lifecycleEvent
    )
  );
}

function nextState(
  currentState,
  event
) {
  const state =
    assertState(
      currentState
    );

  const lifecycleEvent =
    assertEvent(
      event
    );

  const transitions =
    TRANSITIONS[state] || {};

  const result =
    transitions[
      lifecycleEvent
    ];

  if (!result) {
    throw new Error(
      `INVALID_PAYMENT_STATE_TRANSITION:${state}:${lifecycleEvent}`
    );
  }

  return result;
}

function transition(
  currentState,
  event
) {
  const from =
    assertState(
      currentState
    );

  const lifecycleEvent =
    assertEvent(
      event
    );

  const to =
    nextState(
      from,
      lifecycleEvent
    );

  return {
    from,

    event:
      lifecycleEvent,

    to,

    changed:
      from !== to,

    terminal:
      isTerminalState(to)
  };
}

function paymentSucceeded(
  currentState
) {
  return transition(
    currentState,
    'PAYMENT_SUCCEEDED'
  );
}

function paymentFailed(
  currentState
) {
  return transition(
    currentState,
    'PAYMENT_FAILED'
  );
}

function paymentRecovered(
  currentState
) {
  return transition(
    currentState,
    'PAYMENT_RECOVERED'
  );
}

function cancelSubscription(
  currentState
) {
  return transition(
    currentState,
    'SUBSCRIPTION_CANCELED'
  );
}

function reactivateSubscription(
  currentState
) {
  return transition(
    currentState,
    'SUBSCRIPTION_REACTIVATED'
  );
}

function expireSubscription(
  currentState
) {
  return transition(
    currentState,
    'SUBSCRIPTION_EXPIRED'
  );
}

function confirmRefund(
  currentState
) {
  return transition(
    currentState,
    'REFUND_CONFIRMED'
  );
}

function confirmChargeback(
  currentState
) {
  return transition(
    currentState,
    'CHARGEBACK_CONFIRMED'
  );
}

function suspendAccount(
  currentState
) {
  return transition(
    currentState,
    'ACCOUNT_SUSPENDED'
  );
}

function reinstateAccount(
  currentState
) {
  return transition(
    currentState,
    'ACCOUNT_REINSTATED'
  );
}

function initialTrialState() {
  return {
    state:
      'trialing',

    event:
      'TRIAL_STARTED',

    changed:
      true
  };
}

function initialPaidState() {
  return {
    state:
      'active',

    event:
      'PAYMENT_SUCCEEDED',

    changed:
      true
  };
}

/**
 * Prevents browser-controlled lifecycle authority.
 *
 * The browser must never be allowed to provide a
 * client-side plan or subscription state that controls
 * the server payment lifecycle.
 */
function assertNoBrowserAuthority(
  candidate
) {
  if (
    candidate &&
    typeof candidate ===
      'object'
  ) {
    if (
      Object.prototype.hasOwnProperty.call(
        candidate,
        'clientPlan'
      )
    ) {
      throw new Error(
        'CLIENT_PLAN_CANNOT_CONTROL_LIFECYCLE'
      );
    }

    if (
      Object.prototype.hasOwnProperty.call(
        candidate,
        'clientSubscriptionStatus'
      )
    ) {
      throw new Error(
        'CLIENT_SUBSCRIPTION_STATUS_CANNOT_CONTROL_LIFECYCLE'
      );
    }
  }

  return true;
}

module.exports = {
  STATES,
  EVENTS,
  TERMINAL_STATES,
  TRANSITIONS,

  normalizeState,
  normalizeEvent,

  assertState,
  assertEvent,

  isTerminalState,
  canTransition,
  nextState,
  transition,

  paymentSucceeded,
  paymentFailed,
  paymentRecovered,

  cancelSubscription,
  reactivateSubscription,
  expireSubscription,

  confirmRefund,
  confirmChargeback,

  suspendAccount,
  reinstateAccount,

  initialTrialState,
  initialPaidState,

  assertNoBrowserAuthority
};
