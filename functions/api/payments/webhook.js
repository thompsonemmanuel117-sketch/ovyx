'use strict';

const {
  errorResponse,
  jsonResponse
} = require('../_lib/http.js');

const {
  getServerPrice,
  assertServerAmount,
  assertCurrency
} = require('../_lib/payments/pricing.js');

const {
  verifyWebhook,
  queryOrder
} = require('../_lib/payments/opay.js');

const {
  firestoreGet,
  firestoreSet
} = require('../_lib/firestore.js');

const {
  claimIdempotencyKey,
  completeIdempotencyKey
} = require('../_lib/payments/idempotency.js');

const {
  writeAuditLog
} = require('../_lib/logger.js');

const {
  normalizeState,
  paymentSucceeded,
  initialPaidState
} = require('../_lib/payments/lifecycle.js');

const MAX_BODY_BYTES = 64 * 1024;

const THIRTY_DAYS_MS =
  30 * 24 * 60 * 60 * 1000;

const ROOT_EMAIL =
  'ovyxsupportteam@gmail.com';

const SUCCESS_STATES = new Set([
  'SUCCESS'
]);

const FAILURE_STATES = new Set([
  'FAIL',
  'CLOSE',
  'CANCEL'
]);

const PENDING_STATES = new Set([
  'PENDING'
]);

function requestId(request) {
  return (
    request.headers.get('CF-Ray') ||
    request.headers.get('X-Request-ID') ||
    crypto.randomUUID()
  );
}

function cleanString(value, max = 512) {
  return String(value || '')
    .trim()
    .slice(0, max);
}

function normalizeStatus(value) {
  return cleanString(
    value,
    32
  ).toUpperCase();
}

function normalizePlan(value) {
  return cleanString(
    value,
    32
  ).toLowerCase();
}

function normalizeTimestamp(value) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  const numeric =
    Number(value);

  if (
    !Number.isFinite(numeric) ||
    numeric <= 0
  ) {
    return null;
  }

  return numeric;
}

/**
 * Calculates the authoritative rolling subscription
 * expiry timestamp.
 *
 * Rules:
 *
 * 1. A brand-new payment starts a 30-day period
 *    from the exact server payment timestamp.
 *
 * 2. If the account already has an active future
 *    expiry timestamp, an early renewal preserves
 *    that remaining time and adds another 30 days.
 *
 * 3. An already-expired timestamp is ignored and the
 *    new paidAt timestamp becomes the base.
 *
 * This function is deterministic and does not perform
 * any database or provider operation.
 */
function calculateRollingExpiry(
  existingExpiresAt,
  paidAt
) {
  const paidTimestamp =
    normalizeTimestamp(
      paidAt
    );

  if (
    paidTimestamp === null
  ) {
    throw new Error(
      'INVALID_PAID_AT_TIMESTAMP'
    );
  }

  const existingExpiry =
    normalizeTimestamp(
      existingExpiresAt
    );

  const baseTimestamp =
    existingExpiry !== null &&
    existingExpiry > paidTimestamp
      ? existingExpiry
      : paidTimestamp;

  return (
    baseTimestamp +
    THIRTY_DAYS_MS
  );
}

async function readBody(request) {
  const contentLength =
    Number(
      request.headers.get(
        'Content-Length'
      ) || 0
    );

  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_BODY_BYTES
  ) {
    throw new Error(
      'REQUEST_TOO_LARGE'
    );
  }

  const raw =
    await request.text();

  if (
    new TextEncoder()
      .encode(raw)
      .byteLength >
    MAX_BODY_BYTES
  ) {
    throw new Error(
      'REQUEST_TOO_LARGE'
    );
  }

  if (!raw.trim()) {
    throw new Error(
      'INVALID_JSON'
    );
  }

  let parsed;

  try {
    parsed =
      JSON.parse(raw);
  } catch {
    throw new Error(
      'INVALID_JSON'
    );
  }

  return {
    raw,
    parsed
  };
}

function extractPayload(parsed) {
  if (
    parsed &&
    typeof parsed === 'object' &&
    parsed.data &&
    typeof parsed.data === 'object'
  ) {
    return parsed.data;
  }

  return parsed || {};
}

function extractOrderNo(data) {
  return cleanString(
    data.outOrderNo ||
    data.reference ||
    data.orderNo,
    128
  );
}

function extractProviderOrderNo(data) {
  return cleanString(
    data.orderNo ||
    data.checkoutOrderNo,
    128
  );
}

function extractTransactionId(data) {
  return cleanString(
    data.transactionId ||
    data.payNo ||
    data.transactionNo ||
    data.tranId,
    160
  );
}

function extractAmount(data) {
  return (
    data.amount ??
    data.depositAmount ??
    data.paymentAmount ??
    null
  );
}

function extractCurrency(data) {
  return cleanString(
    data.currency ||
    'NGN',
    8
  ).toUpperCase();
}

function buildEventId(
  data,
  request
) {
  return (
    extractTransactionId(data) ||
    extractProviderOrderNo(data) ||
    cleanString(
      request.headers.get(
        'X-Opay-Tranid'
      ),
      160
    ) ||
    crypto.randomUUID()
  );
}

async function safeAudit(
  env,
  payload
) {
  try {
    if (
      typeof writeAuditLog ===
      'function'
    ) {
      await writeAuditLog(
        env,
        payload
      );
    }
  } catch {}
}

async function acknowledge(
  requestIdValue,
  body
) {
  return jsonResponse(
    body,
    200,
    {
      'X-OVYX-Request-ID':
        requestIdValue
    }
  );
}

async function handleWebhook(
  request,
  env
) {
  const id =
    requestId(request);

  let body;

  try {
    body =
      await readBody(
        request
      );
  } catch (error) {
    return errorResponse(
      error.message ===
        'REQUEST_TOO_LARGE'
        ? 413
        : 400,
      error.message ===
        'REQUEST_TOO_LARGE'
        ? 'REQUEST_TOO_LARGE'
        : 'INVALID_WEBHOOK',
      error.message ===
        'REQUEST_TOO_LARGE'
        ? 'The OPay webhook payload is too large.'
        : 'The OPay webhook payload is invalid.'
    );
  }

  let verified;

  try {
    verified =
      await verifyWebhook(
        env,
        request,
        body.raw
      );
  } catch {
    return errorResponse(
      401,
      'INVALID_OPAY_SIGNATURE',
      'The OPay webhook signature could not be verified.'
    );
  }

  if (
    !verified ||
    verified.valid !== true
  ) {
    return errorResponse(
      401,
      'INVALID_OPAY_SIGNATURE',
      'The OPay webhook signature is invalid.'
    );
  }

  const data =
    extractPayload(
      verified.data ||
      body.parsed
    );

  const status =
    normalizeStatus(
      data.status
    );

  const orderNo =
    extractOrderNo(
      data
    );

  const providerOrderNo =
    extractProviderOrderNo(
      data
    );

  const transactionId =
    extractTransactionId(
      data
    );

  const eventId =
    buildEventId(
      data,
      request
    );

  if (!orderNo) {
    return errorResponse(
      400,
      'OPAY_ORDER_REFERENCE_REQUIRED',
      'The OPay notification does not contain an OVYX order reference.'
    );
  }

  if (
    !SUCCESS_STATES.has(status) &&
    !FAILURE_STATES.has(status) &&
    !PENDING_STATES.has(status)
  ) {
    return errorResponse(
      400,
      'UNSUPPORTED_OPAY_STATUS',
      'The OPay notification contains an unsupported payment status.'
    );
  }

  let payment;

  try {
    payment =
      await firestoreGet(
        env,
        [
          'payment_orders',
          orderNo
        ]
      );
  } catch {
    return errorResponse(
      503,
      'PAYMENT_RECORD_UNAVAILABLE',
      'The payment record could not be loaded.'
    );
  }

  if (!payment) {
    return errorResponse(
      404,
      'PAYMENT_ORDER_NOT_FOUND',
      'The OVYX payment order does not exist.'
    );
  }

  if (
    payment.provider !==
    'opay'
  ) {
    return errorResponse(
      409,
      'PAYMENT_PROVIDER_MISMATCH',
      'The payment provider does not match the OVYX payment order.'
    );
  }

  if (
    payment.uid &&
    typeof payment.uid !==
      'string'
  ) {
    return errorResponse(
      409,
      'PAYMENT_RECORD_INVALID',
      'The payment record is invalid.'
    );
  }

  if (
    payment.providerOrderNo &&
    providerOrderNo &&
    payment.providerOrderNo !==
      providerOrderNo
  ) {
    return errorResponse(
      409,
      'OPAY_ORDER_MISMATCH',
      'The OPay order does not match the OVYX payment record.'
    );
  }

  const configuredPrice =
    await getServerPrice(
      env,
      payment.plan,
      payment.currency
    );

  const providerAmount =
    extractAmount(
      data
    );

  const providerCurrency =
    extractCurrency(
      data
    );

  try {
    assertServerAmount(
      configuredPrice.amount,
      providerAmount
    );

    assertCurrency(
      configuredPrice.currency,
      providerCurrency
    );
  } catch {
    await safeAudit(
      env,
      {
        user:
          payment.uid,

        action:
          'paymentWebhookRejected',

        resource:
          `payment_orders/${orderNo}`,

        timestamp:
          new Date().toISOString(),

        requestId:
          id,

        ipAddress:
          request.headers.get(
            'CF-Connecting-IP'
          ) || '',

        result:
          'failure',

        providerEventId:
          eventId
      }
    );

    return errorResponse(
      409,
      'PAYMENT_AMOUNT_MISMATCH',
      'The OPay payment amount or currency does not match the server-authoritative OVYX price.'
    );
  }

  let eventClaim;

  try {
    eventClaim =
      await claimIdempotencyKey(
        env,
        `opay:webhook:${eventId}`,
        {
          uid:
            payment.uid,

          operation:
            'payment.webhook',

          requestId:
            id
        }
      );
  } catch {
    return errorResponse(
      503,
      'WEBHOOK_IDEMPOTENCY_UNAVAILABLE',
      'Webhook idempotency protection is temporarily unavailable.'
    );
  }

  if (
    eventClaim &&
    eventClaim.replay === true
  ) {
    return acknowledge(
      id,
      {
        code:
          '00000',

        message:
          'SUCCESSFUL'
      }
    );
  }

  if (
    payment.fulfillmentStatus ===
      'fulfilled' &&
    payment.status ===
      'success'
  ) {
    await completeIdempotencyKey(
      env,
      `opay:webhook:${eventId}`,
      {
        status:
          200,

        body: {
          code:
            '00000',

          message:
            'SUCCESSFUL'
        }
      }
    );

    return acknowledge(
      id,
      {
        code:
          '00000',

        message:
          'SUCCESSFUL'
      }
    );
  }

  if (
    SUCCESS_STATES.has(status)
  ) {
    let queried;

    try {
      queried =
        await queryOrder(
          env,
          {
            outOrderNo:
              orderNo,

            orderNo:
              providerOrderNo ||
              payment.providerOrderNo
          }
        );
    } catch {
      return errorResponse(
        503,
        'OPAY_RECONCILIATION_FAILED',
        'The successful OPay payment could not be reconciled yet.'
      );
    }

    const queriedData =
      queried?.data ||
      queried;

    const queriedStatus =
      normalizeStatus(
        queriedData?.status
      );

    const queriedAmount =
      extractAmount(
        queriedData || {}
      );

    const queriedCurrency =
      extractCurrency(
        queriedData || {}
      );

    if (
      queriedStatus !==
      'SUCCESS'
    ) {
      return errorResponse(
        409,
        'OPAY_STATUS_NOT_CONFIRMED',
        'OPay has not independently confirmed the payment as successful.'
      );
    }

    try {
      assertServerAmount(
        configuredPrice.amount,
        queriedAmount
      );

      assertCurrency(
        configuredPrice.currency,
        queriedCurrency
      );
    } catch {
      return errorResponse(
        409,
        'OPAY_RECONCILIATION_MISMATCH',
        'The reconciled OPay transaction does not match the server-authoritative payment.'
      );
    }
  }

  const nowDate =
    new Date();

  const now =
    nowDate.toISOString();

  const paidAt =
    nowDate.getTime();

  if (
    !Number.isFinite(paidAt) ||
    paidAt <= 0
  ) {
    return errorResponse(
      500,
      'PAYMENT_TIMESTAMP_ERROR',
      'The server could not establish an authoritative payment timestamp.'
    );
  }

  if (
    PENDING_STATES.has(status)
  ) {
    await firestoreSet(
      env,
      [
        'payment_orders',
        orderNo
      ],
      {
        ...payment,

        status:
          'pending',

        providerOrderNo:
          providerOrderNo ||
          payment.providerOrderNo ||
          null,

        providerTransactionId:
          transactionId ||
          payment.providerTransactionId ||
          null,

        lastWebhookStatus:
          status,

        lastWebhookEventId:
          eventId,

        updatedAt:
          now
      }
    );

    await completeIdempotencyKey(
      env,
      `opay:webhook:${eventId}`,
      {
        status:
          200,

        body: {
          code:
            '00000',

          message:
            'SUCCESSFUL'
        }
      }
    );

    return acknowledge(
      id,
      {
        code:
          '00000',

        message:
          'SUCCESSFUL'
      }
    );
  }

  if (
    FAILURE_STATES.has(status)
  ) {
    await firestoreSet(
      env,
      [
        'payment_orders',
        orderNo
      ],
      {
        ...payment,

        status:
          'failed',

        fulfillmentStatus:
          'unfulfilled',

        providerOrderNo:
          providerOrderNo ||
          payment.providerOrderNo ||
          null,

        providerTransactionId:
          transactionId ||
          payment.providerTransactionId ||
          null,

        failureCode:
          cleanString(
            data.errorCode,
            128
          ) || null,

        failureMessage:
          cleanString(
            data.errorMsg ||
            data.errorMessage,
            500
          ) || null,

        lastWebhookStatus:
          status,

        lastWebhookEventId:
          eventId,

        failedAt:
          now,

        updatedAt:
          now
      }
    );

    await completeIdempotencyKey(
      env,
      `opay:webhook:${eventId}`,
      {
        status:
          200,

        body: {
          code:
            '00000',

          message:
            'SUCCESSFUL'
        }
      }
    );

    await safeAudit(
      env,
      {
        user:
          payment.uid,

        action:
          'paymentFailed',

        resource:
          `payment_orders/${orderNo}`,

        timestamp:
          now,

        requestId:
          id,

        ipAddress:
          request.headers.get(
            'CF-Connecting-IP'
          ) || '',

        result:
          'failure',

        providerEventId:
          eventId
      }
    );

    return acknowledge(
      id,
      {
        code:
          '00000',

        message:
          'SUCCESSFUL'
      }
    );
  }

  /*
   * SUCCESS
   *
   * The payment has passed:
   *
   * 1. OPay signature verification
   * 2. OVYX order lookup
   * 3. amount validation
   * 4. currency validation
   * 5. provider order matching
   * 6. independent OPay status query
   * 7. independent amount/currency validation
   * 8. idempotency protection
   *
   * Only after all of those checks do we modify
   * the authoritative user subscription.
   */
  if (
    SUCCESS_STATES.has(status)
  ) {
    if (
      payment.fulfillmentStatus ===
      'fulfilled'
    ) {
      await completeIdempotencyKey(
        env,
        `opay:webhook:${eventId}`,
        {
          status:
            200,

          body: {
            code:
              '00000',

            message:
              'SUCCESSFUL'
          }
        }
      );

      return acknowledge(
        id,
        {
          code:
            '00000',

          message:
            'SUCCESSFUL'
        }
      );
    }

    const existingUser =
      await firestoreGet(
        env,
        [
          'users',
          payment.uid
        ]
      );

    if (!existingUser) {
      return errorResponse(
        404,
        'USER_NOT_FOUND',
        'The OVYX account associated with the payment does not exist.'
      );
    }

    const currentState =
      cleanString(
        existingUser.planTierState,
        64
      ).toLowerCase();

    const currentTier =
      normalizePlan(
        existingUser.planTier
      );

    const isRoot =
      cleanString(
        payment.email,
        160
      ).toLowerCase() ===
      ROOT_EMAIL;

    if (isRoot) {
      await firestoreSet(
        env,
        [
          'payment_orders',
          orderNo
        ],
        {
          ...payment,

          status:
            'success',

          fulfillmentStatus:
            'fulfilled',

          providerOrderNo:
            providerOrderNo ||
            payment.providerOrderNo ||
            null,

          providerTransactionId:
            transactionId ||
            payment.providerTransactionId ||
            null,

          fulfilledAt:
            now,

          updatedAt:
            now
        }
      );

      await completeIdempotencyKey(
        env,
        `opay:webhook:${eventId}`,
        {
          status:
            200,

          body: {
            code:
              '00000',

            message:
              'SUCCESSFUL'
          }
        }
      );

      await safeAudit(
        env,
        {
          user:
            payment.uid,

          action:
            'paymentConfirmedRootAccount',

          resource:
            `payment_orders/${orderNo}`,

          timestamp:
            now,

          requestId:
            id,

          ipAddress:
            request.headers.get(
              'CF-Connecting-IP'
            ) || '',

          result:
            'success',

          providerEventId:
            eventId
        }
      );

      return acknowledge(
        id,
        {
          code:
            '00000',

          message:
            'SUCCESSFUL'
        }
      );
    }

    /*
     * Determine the lifecycle transition before writing
     * the new subscription state.
     *
     * A user with no valid existing lifecycle state is
     * treated as a first paid activation.
     *
     * An existing valid lifecycle state must transition
     * through the deterministic state machine.
     */
    let lifecycleResult;

    const normalizedCurrentState =
      normalizeState(
        currentState
      );

    try {
      if (
        normalizedCurrentState
      ) {
        lifecycleResult =
          paymentSucceeded(
            normalizedCurrentState
          );
      } else {
        lifecycleResult =
          initialPaidState();
      }
    } catch {
      return errorResponse(
        409,
        'INVALID_PAYMENT_LIFECYCLE',
        'The OVYX account has an invalid payment lifecycle state and the subscription was not activated.'
      );
    }

    /*
     * Server-authoritative rolling subscription period.
     *
     * New purchase:
     *
     *   expiresAt = paidAt + 30 days
     *
     * Early renewal:
     *
     *   expiresAt =
     *     existingFutureExpiresAt + 30 days
     *
     * Expired account:
     *
     *   expiresAt =
     *     paidAt + 30 days
     *
     * The comparison is performed using exact Unix
     * millisecond timestamps.
     */
    const existingExpiresAt =
      normalizeTimestamp(
        existingUser.expiresAt
      );

    const expiresAt =
      calculateRollingExpiry(
        existingExpiresAt,
        paidAt
      );

    const purchasedPlan =
      normalizePlan(
        payment.plan
      );

    if (
      purchasedPlan !== 'pro' &&
      purchasedPlan !== 'max'
    ) {
      return errorResponse(
        409,
        'INVALID_PAYMENT_PLAN',
        'The payment order does not contain a supported OVYX subscription plan.'
      );
    }

    /*
     * Preserve MAX when a PRO payment is received while
     * MAX is currently active.
     *
     * The renewal period is still extended by exactly
     * 30 days from the existing future expiry.
     */
    let resultingTier =
      purchasedPlan;

    if (
      currentTier === 'max' &&
      currentState === 'active' &&
      purchasedPlan === 'pro'
    ) {
      resultingTier =
        'max';
          }
  );

  const paidAt = normalizeTimestamp(
    payment.paidAt ||
    payment.lastPaymentAt ||
    payment.createdAt ||
    Date.now()
  );

  const existingExpiresAt = normalizeTimestamp(
    userData.expiresAt,
    0
  );

  const expiresAt = calculateRollingExpiry(
    paidAt,
    existingExpiresAt
  );

  const previousState = normalizeState(
    currentState || initialPaidState().state
  );

  let lifecycleState;

  try {
    lifecycleState = paymentSucceeded(previousState);
  } catch {
    lifecycleState = initialPaidState();
  }

  const userUpdate = {
    planTier: resultingTier,
    planTierState: lifecycleState,

    subscriptionStatus: lifecycleState,
    subscriptionId: String(
      payment.subscriptionId ||
      payment.orderNo ||
      orderNo
    ).trim(),

    paymentStatus: 'paid',
    paymentProvider: 'opay',
    paymentReference: reference,
    paymentOrderNo: orderNo,
    paymentTransactionId: transactionId,

    paidAt,
    expiresAt,

    subscriptionActivatedAt: paidAt,
    lastPaymentAt: paidAt,

    updatedAt: Date.now()
  };

  /*
   * Preserve any existing subscription metadata when it exists.
   * The paidAt timestamp is the authoritative start of this payment
   * period, while expiresAt is calculated from the existing future
   * expiry when applicable.
   */
  if (payment.currency) {
    userUpdate.paymentCurrency = String(
      payment.currency
    ).trim().toUpperCase();
  }

  if (payment.amount !== undefined && payment.amount !== null) {
    userUpdate.paymentAmount = payment.amount;
  }

  if (payment.providerOrderNo) {
    userUpdate.providerOrderNo = String(
      payment.providerOrderNo
    ).trim();
  }

  if (payment.payNo) {
    userUpdate.paymentTransactionId = String(
      payment.payNo
    ).trim();
  }

  if (payment.reference) {
    userUpdate.paymentReference = String(
      payment.reference
    ).trim();
  }

  await firestoreSet(
    env,
    `users/${payment.uid}`,
    userUpdate
  );

  await firestoreSet(
    env,
    `payment_orders/${orderNo}`,
    {
      ...payment,
      status: 'fulfilled',
      paymentStatus: 'paid',
      providerStatus: 'SUCCESS',

      plan: purchasedPlan,
      fulfilled: true,
      fulfilledAt: Date.now(),

      paidAt,
      expiresAt,

      lifecycleState,
      previousLifecycleState: previousState,

      providerTransactionId: transactionId,
      providerOrderNo:
        providerOrderNo ||
        payment.providerOrderNo ||
        '',

      reconciledAt: Date.now(),
      updatedAt: Date.now()
    }
  );

  await completeIdempotency(
    env,
    idempotencyKey,
    {
      status: 'fulfilled',
      orderNo,
      uid: payment.uid,
      paidAt,
      expiresAt
    }
  );

  await writeAuditLog(env, {
    user: payment.uid,
    action: 'subscriptionActivated',
    resource: `payment_orders/${orderNo}`,
    timestamp: Date.now(),
    requestId:
      request.headers.get('cf-ray') ||
      request.headers.get('x-request-id') ||
      orderNo,
    ipAddress:
      request.headers.get('cf-connecting-ip') ||
      '',
    result: 'success',
    providerEventId: eventId
  });

  return jsonResponse({
    ok: true,
    acknowledged: true,
    status: 'fulfilled',
    orderNo,
    plan: resultingTier,
    paidAt,
    expiresAt
  });
}

module.exports = {
  onRequest
};
