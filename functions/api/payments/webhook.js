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

const MAX_BODY_BYTES = 64 * 1024;

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

async function readBody(request) {
  const contentLength =
    Number(
      request.headers.get('Content-Length') || 0
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
    new TextEncoder().encode(raw).byteLength >
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

function buildEventId(data, request) {
  return (
    extractTransactionId(data) ||
    extractProviderOrderNo(data) ||
    cleanString(
      request.headers.get('X-Opay-Tranid'),
      160
    ) ||
    crypto.randomUUID()
  );
}

async function safeAudit(env, payload) {
  try {
    if (typeof writeAuditLog === 'function') {
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
    /*
     * Group 1 performs the OPay RSA verification.
     *
     * The raw request body is passed to the helper so
     * signature verification is performed against the
     * exact bytes received from OPay.
     */
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
    /*
     * Do not acknowledge an unknown order as successful.
     *
     * Returning a failure lets the provider retry while
     * the merchant system is investigated.
     */
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
    payment.email &&
    typeof payment.uid !== 'string'
  ) {
    return errorResponse(
      409,
      'PAYMENT_RECORD_INVALID',
      'The payment record is invalid.'
    );
  }

  /*
   * A webhook may arrive using the OPay order number.
   * Verify that it matches the provider order previously
   * returned by OPay when one has already been stored.
   */
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

  /*
   * Validate the provider amount against the
   * authoritative current price.
   */
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

  /*
   * Idempotency is keyed by the provider event.
   *
   * OPay can retry a webhook when acknowledgement
   * is delayed or unsuccessful.
   */
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

  /*
   * If already fulfilled, never credit the plan again.
   */
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

  /*
   * For SUCCESS, perform a second server-side
   * reconciliation against OPay.
   *
   * This protects against accepting a malformed
   * notification that happens to contain a valid-looking
   * signature envelope.
   */
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

  const now =
    new Date().toISOString();

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
      cleanString(
        existingUser.planTier,
        32
      ).toLowerCase();

    /*
     * Never downgrade a Root account.
     */
    const isRoot =
      cleanString(
        payment.email,
        160
      ).toLowerCase() ===
      'ovyxsupportteam@gmail.com';

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
     * Server-side subscription activation.
     *
     * This deliberately does not trust any plan/tier
     * supplied by the webhook.
     *
     * payment.plan came from the server-authoritative
     * pricing lookup during payment creation.
     */
    const userUpdate = {
      ...existingUser,

      planTier:
        payment.plan,

      planTierState:
        'active',

      subscriptionStatus:
        'active',

      subscriptionProvider:
        'opay',

      subscriptionId:
        providerOrderNo ||
        orderNo,

      paymentStatus:
        'paid',

      paymentProvider:
        'opay',

      paymentReference:
        orderNo,

      paymentProviderReference:
        providerOrderNo ||
        null,

      paymentTransactionId:
        transactionId ||
        null,

      paymentCurrency:
        payment.currency,

      paymentAmount:
        payment.amount,

      subscriptionActivatedAt:
        now,

      lastPaymentAt:
        now,

      updatedAt:
        now
    };

    /*
     * Preserve higher plan state when the account already
     * has an active MAX subscription and a duplicate/older
     * PRO payment is received.
     */
    if (
      currentTier === 'max' &&
      currentState === 'active' &&
      payment.plan === 'pro'
    ) {
      userUpdate.planTier =
        currentTier;
    }

    await firestoreSet(
      env,
      [
        'users',
        payment.uid
      ],
      userUpdate
    );

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
          'subscriptionActivated',

        resource:
          `users/${payment.uid}`,

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

  return errorResponse(
    400,
    'UNHANDLED_PAYMENT_STATE',
    'The payment state could not be processed.'
  );
}

async function onRequest(context) {
  const {
    request,
    env
  } = context;

  if (
    request.method !==
    'POST'
  ) {
    return errorResponse(
      405,
      'METHOD_NOT_ALLOWED',
      'Only POST is supported for the OPay webhook.'
    );
  }

  return handleWebhook(
    request,
    env
  );
}

module.exports = {
  onRequest
};
    
