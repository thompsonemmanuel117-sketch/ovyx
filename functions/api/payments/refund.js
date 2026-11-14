'use strict';

const {
  verifyFirebaseIdToken
} = require('../_lib/auth.js');

const {
  errorResponse,
  jsonResponse
} = require('../_lib/http.js');

const {
  firestoreGet,
  firestoreSet
} = require('../_lib/firestore.js');

const {
  writeAuditLog
} = require('../_lib/logger.js');

const {
  getServerPrice
} = require('../_lib/payments/pricing.js');

const {
  confirmRefund
} = require('../_lib/payments/lifecycle.js');

const {
  claimIdempotencyKey,
  completeIdempotencyKey,
  releaseIdempotencyKey
} = require('../_lib/payments/idempotency.js');

const ROOT_EMAIL =
  'ovyxsupportteam@gmail.com';

const MAX_BODY_BYTES =
  16 * 1024;

function cleanString(
  value,
  max = 256
) {
  return String(value || '')
    .trim()
    .slice(0, max);
}

function normalizeEmail(
  value
) {
  return cleanString(
    value,
    160
  ).toLowerCase();
}

function requestId(
  request
) {
  return (
    request.headers.get(
      'CF-Ray'
    ) ||
    request.headers.get(
      'X-Request-ID'
    ) ||
    crypto.randomUUID()
  );
}

async function readJson(
  request
) {
  const contentLength =
    Number(
      request.headers.get(
        'Content-Length'
      ) || 0
    );

  if (
    Number.isFinite(
      contentLength
    ) &&
    contentLength >
      MAX_BODY_BYTES
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

  try {
    return JSON.parse(
      raw
    );
  } catch {
    throw new Error(
      'INVALID_JSON'
    );
  }
}

async function audit(
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

function isRoot(
  user
) {
  return (
    normalizeEmail(
      user.email
    ) ===
    ROOT_EMAIL
  );
}

function normalizeRefundAmount(
  value
) {
  if (
    value === undefined ||
    value === null ||
    String(value).trim() === ''
  ) {
    return null;
  }

  const amount =
    Number(value);

  if (
    !Number.isFinite(
      amount
    ) ||
    amount <= 0
  ) {
    return null;
  }

  return Number(
    amount.toFixed(2)
  );
}

async function handlePost(
  request,
  env
) {
  const id =
    requestId(request);

  const identity =
    await verifyFirebaseIdToken(
      request,
      env
    );

  if (!identity.ok) {
    return identity.response;
  }

  /*
   * Refunds are a privileged administrative action.
   *
   * The exact OVYX root account is the only account
   * authorized by this endpoint.
   */
  if (
    !isRoot(
      identity.user
    )
  ) {
    return errorResponse(
      403,
      'REFUND_ADMIN_REQUIRED',
      'Only the OVYX Root Superuser can initiate refunds.'
    );
  }

  let body;

  try {
    body =
      await readJson(
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
        : 'INVALID_JSON',
      error.message ===
        'REQUEST_TOO_LARGE'
        ? 'The refund request is too large.'
        : 'The refund request body is invalid.'
    );
  }

  const reference =
    cleanString(
      body.reference ||
      body.orderNo ||
      body.paymentReference,
      128
    );

  const reason =
    cleanString(
      body.reason ||
      body.refundReason,
      500
    );

  const suppliedAmount =
    normalizeRefundAmount(
      body.amount
    );

  if (!reference) {
    return errorResponse(
      400,
      'PAYMENT_REFERENCE_REQUIRED',
      'A payment reference is required.'
    );
  }

  if (!reason) {
    return errorResponse(
      400,
      'REFUND_REASON_REQUIRED',
      'A refund reason is required.'
    );
  }

  const idempotencyKey =
    cleanString(
      request.headers.get(
        'Idempotency-Key'
      ) ||
      body.idempotencyKey,
      128
    );

  if (!idempotencyKey) {
    return errorResponse(
      400,
      'IDEMPOTENCY_KEY_REQUIRED',
      'An Idempotency-Key is required for refunds.'
    );
  }

  let claim;

  try {
    claim =
      await claimIdempotencyKey(
        env,
        `refund:${idempotencyKey}`,
        {
          uid:
            identity.user.uid,

          operation:
            'payment.refund',

          requestId:
            id
        }
      );
  } catch {
    return errorResponse(
      503,
      'IDEMPOTENCY_UNAVAILABLE',
      'Refund protection is temporarily unavailable.'
    );
  }

  if (
    claim &&
    claim.replay === true &&
    claim.response
  ) {
    return jsonResponse(
      claim.response.body,
      claim.response.status ||
        200,
      {
        'X-OVYX-Request-ID':
          id
      }
    );
  }

  if (
    claim &&
    claim.inProgress === true
  ) {
    return errorResponse(
      409,
      'REFUND_IN_PROGRESS',
      'This refund request is already being processed.'
    );
  }

  let payment;

  try {
    payment =
      await firestoreGet(
        env,
        [
          'payment_orders',
          reference
        ]
      );
  } catch {
    await releaseIdempotencyKey(
      env,
      `refund:${idempotencyKey}`
    );

    return errorResponse(
      503,
      'PAYMENT_RECORD_UNAVAILABLE',
      'The payment record could not be loaded.'
    );
  }

  if (!payment) {
    await releaseIdempotencyKey(
      env,
      `refund:${idempotencyKey}`
    );

    return errorResponse(
      404,
      'PAYMENT_NOT_FOUND',
      'The payment order was not found.'
    );
  }

  if (
    payment.provider !==
    'opay'
  ) {
    await releaseIdempotencyKey(
      env,
      `refund:${idempotencyKey}`
    );

    return errorResponse(
      409,
      'PAYMENT_PROVIDER_MISMATCH',
      'The payment does not belong to OPay.'
    );
  }

  if (
    payment.status !==
    'success' ||
    payment.fulfillmentStatus !==
    'fulfilled'
  ) {
    await releaseIdempotencyKey(
      env,
      `refund:${idempotencyKey}`
    );

    return errorResponse(
      409,
      'PAYMENT_NOT_REFUNDABLE',
      'Only a successfully fulfilled payment can enter the refund process.'
    );
  }

  if (
    payment.refundStatus ===
    'refunded'
  ) {
    const response =
      {
        ok:
          true,

        alreadyRefunded:
          true,

        reference,

        refundStatus:
          'refunded'
      };

    await completeIdempotencyKey(
      env,
      `refund:${idempotencyKey}`,
      {
        status:
          200,

        body:
          response
      }
    );

    return jsonResponse(
      response,
      200,
      {
        'X-OVYX-Request-ID':
          id
      }
    );
  }

  let authoritativePrice;

  try {
    authoritativePrice =
      await getServerPrice(
        env,
        payment.plan,
        payment.currency
      );
  } catch {
    await releaseIdempotencyKey(
      env,
      `refund:${idempotencyKey}`
    );

    return errorResponse(
      503,
      'PRICING_CONFIGURATION_UNAVAILABLE',
      'The authoritative payment pricing could not be loaded.'
    );
  }

  const originalAmount =
    Number(
      payment.amount
    );

  if (
    !Number.isFinite(
      originalAmount
    ) ||
    originalAmount <= 0
  ) {
    await releaseIdempotencyKey(
      env,
      `refund:${idempotencyKey}`
    );

    return errorResponse(
      409,
      'PAYMENT_AMOUNT_INVALID',
      'The payment amount stored on the server is invalid.'
    );
  }

  /*
   * A partial refund must never exceed the original
   * transaction amount.
   */
  const refundAmount =
    suppliedAmount === null
      ? originalAmount
      : suppliedAmount;

  if (
    refundAmount >
    originalAmount
  ) {
    await releaseIdempotencyKey(
      env,
      `refund:${idempotencyKey}`
    );

    return errorResponse(
      400,
      'REFUND_AMOUNT_TOO_LARGE',
      'The refund amount cannot exceed the original payment amount.'
    );
  }

  /*
   * The current pricing configuration is intentionally
   * loaded above so that refund records always preserve
   * the server-side currency and payment configuration.
   *
   * Refund amount itself is based on the actual payment,
   * not today's retail price.
   */
  if (
    payment.currency !==
    authoritativePrice.currency
  ) {
    await releaseIdempotencyKey(
      env,
      `refund:${idempotencyKey}`
    );

    return errorResponse(
      409,
      'PAYMENT_CURRENCY_INVALID',
      'The payment currency does not match the server payment configuration.'
    );
  }

  /*
   * IMPORTANT:
   *
   * The public OPay documentation currently available
   * to this integration documents querying transactions
   * and refund-related statuses, but does not provide a
   * verified general refund API contract that this file
   * can safely invent.
   *
   * Therefore this endpoint looks for an explicitly
   * implemented server-side refund adapter.
   *
   * If it does not exist, the operation fails closed.
   */
  let refundOperation;

  try {
    const opay =
      require('../_lib/payments/opay.js');

    refundOperation =
      opay.refundOrder ||
      opay.createRefund ||
      opay.requestRefund ||
      null;
  } catch {
    refundOperation =
      null;
  }

  if (
    typeof refundOperation !==
    'function'
  ) {
    await releaseIdempotencyKey(
      env,
      `refund:${idempotencyKey}`
    );

    await audit(
      env,
      {
        user:
          identity.user.uid,

        action:
          'refundRejectedProviderCapabilityUnavailable',

        resource:
          `payment_orders/${reference}`,

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
          payment.providerOrderNo ||
          reference
      }
    );

    return errorResponse(
      501,
      'OPAY_REFUND_API_NOT_CONFIGURED',
      'The OPay refund operation is not configured. No refund was issued.'
    );
  }

  let providerResult;

  try {
    providerResult =
      await refundOperation(
        env,
        {
          outOrderNo:
            reference,

          orderNo:
            payment.providerOrderNo ||
            undefined,

          amount:
            refundAmount,

          currency:
            payment.currency,

          reason,

          requestId:
            id
        }
      );
  } catch {
    await releaseIdempotencyKey(
      env,
      `refund:${idempotencyKey}`
    );

    await audit(
      env,
      {
        user:
          identity.user.uid,

        action:
          'refundProviderFailed',

        resource:
          `payment_orders/${reference}`,

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
          payment.providerOrderNo ||
          reference
      }
    );

    return errorResponse(
      502,
      'OPAY_REFUND_FAILED',
      'OPay did not confirm the refund request.'
    );
  }

  const providerStatus =
    cleanString(
      providerResult?.status ||
      providerResult?.data?.status,
      64
    ).toUpperCase();

  const providerReference =
    cleanString(
      providerResult?.refundId ||
      providerResult?.data?.refundId ||
      providerResult?.refundOrderNo ||
      providerResult?.data?.refundOrderNo,
      160
    );

  /*
   * A refund request is not considered fulfilled merely
   * because an API call returned.
   *
   * Only an explicit provider-success response may move
   * the local payment to refund-pending/confirmed.
   */
  const providerSuccess =
    providerResult?.success === true ||
    providerResult?.code === '00000' ||
    providerResult?.data?.code === '00000' ||
    providerStatus === 'SUCCESS';

  if (!providerSuccess) {
    await releaseIdempotencyKey(
      env,
      `refund:${idempotencyKey}`
    );

    await audit(
      env,
      {
        user:
          identity.user.uid,

        action:
          'refundProviderRejected',

        resource:
          `payment_orders/${reference}`,

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
          providerReference ||
          payment.providerOrderNo ||
          reference
      }
    );

    return errorResponse(
      502,
      'OPAY_REFUND_NOT_CONFIRMED',
      'OPay did not confirm the refund.'
    );
  }

  const now =
    new Date().toISOString();

  const lifecycleResult =
    confirmRefund(
      'active'
    );

  /*
   * Preserve the user's actual current state in the
   * payment record. The subscription lifecycle itself
   * is reconciled separately by the entitlement system.
   */
  const updatedPayment = {
    ...payment,

    refundStatus:
      'pending_confirmation',

    refundAmount,

    refundCurrency:
      payment.currency,

    refundReason:
      reason,

    refundProviderReference:
      providerReference ||
      null,

    refundRequestedAt:
      now,

    refundRequestedBy:
      identity.user.uid,

    refundLifecycleEvent:
      lifecycleResult.event,

    updatedAt:
      now
  };

  await firestoreSet(
    env,
    [
      'payment_orders',
      reference
    ],
    updatedPayment
  );

  const response = {
    ok:
      true,

    reference,

    refundStatus:
      'pending_confirmation',

    refundAmount,

    currency:
      payment.currency,

    provider:
      'opay',

    providerReference:
      providerReference ||
      null,

    requestedAt:
      now
  };

  await completeIdempotencyKey(
    env,
    `refund:${idempotencyKey}`,
    {
      status:
        200,

      body:
        response
    }
  );

  await audit(
    env,
    {
      user:
        identity.user.uid,

      action:
        'refundInitiated',

      resource:
        `payment_orders/${reference}`,

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
        providerReference ||
        payment.providerOrderNo ||
        reference
    }
  );

  return jsonResponse(
    response,
    200,
    {
      'Cache-Control':
        'no-store, max-age=0',

      Pragma:
        'no-cache',

      'X-OVYX-Request-ID':
        id
    }
  );
}

async function onRequest(
  context
) {
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
      'Only POST is supported for refunds.'
    );
  }

  return handlePost(
    request,
    env
  );
}

module.exports = {
  onRequest
};
