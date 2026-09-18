'use strict';

const {
  verifyFirebaseIdToken
} = require('../_lib/auth.js');

const {
  errorResponse,
  jsonResponse
} = require('../_lib/http.js');

const {
  getServerPrice
} = require('../_lib/payments/pricing.js');

const {
  createCheckoutOrder
} = require('../_lib/payments/opay.js');

const {
  claimIdempotencyKey,
  completeIdempotencyKey,
  releaseIdempotencyKey
} = require('../_lib/payments/idempotency.js');

const {
  firestoreGet,
  firestoreSet
} = require('../_lib/firestore.js');

const {
  writeAuditLog
} = require('../_lib/logger.js');

const MAX_BODY_BYTES = 16 * 1024;
const ORDER_EXPIRY_SECONDS = 30 * 60;

const ALLOWED_METHODS = Object.freeze([
  'POST',
  'OPTIONS'
]);

function requestId(request) {
  return (
    request.headers.get('CF-Ray') ||
    request.headers.get('X-Request-ID') ||
    crypto.randomUUID()
  );
}

function cleanString(value, max = 128) {
  return String(value || '')
    .trim()
    .slice(0, max);
}

function normalizeTier(value) {
  const tier = cleanString(value, 32).toLowerCase();

  if (tier !== 'pro' && tier !== 'max') {
    return null;
  }

  return tier;
}

function normalizeCurrency(value) {
  const currency = cleanString(value, 8).toUpperCase();

  if (currency !== 'NGN') {
    return null;
  }

  return currency;
}

function normalizePhone(value) {
  const phone = cleanString(value, 32);

  if (!phone) {
    return '';
  }

  if (!/^\+?[0-9]{7,15}$/.test(phone)) {
    return null;
  }

  return phone;
}

function normalizeIdempotencyKey(request, body) {
  const headerValue =
    cleanString(
      request.headers.get('Idempotency-Key'),
      128
    );

  const bodyValue =
    cleanString(
      body.idempotencyKey,
      128
    );

  return headerValue || bodyValue;
}

async function readJson(request) {
  const contentLength =
    Number(
      request.headers.get('Content-Length') || 0
    );

  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_BODY_BYTES
  ) {
    throw new Error('REQUEST_TOO_LARGE');
  }

  const raw = await request.text();

  if (
    new TextEncoder().encode(raw).byteLength >
    MAX_BODY_BYTES
  ) {
    throw new Error('REQUEST_TOO_LARGE');
  }

  if (!raw.trim()) {
    throw new Error('INVALID_JSON');
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('INVALID_JSON');
  }
}

function buildOrderNumber(uid) {
  const time =
    Date.now()
      .toString(36)
      .toUpperCase();

  const random =
    crypto.randomUUID()
      .replace(/-/g, '')
      .slice(0, 12)
      .toUpperCase();

  const userPart =
    cleanString(uid, 12)
      .replace(/[^A-Za-z0-9]/g, '')
      .toUpperCase();

  return (
    `OVYX-${userPart}-${time}-${random}`
  ).slice(0, 32);
}

function buildCustomerName(user, suppliedName) {
  const supplied =
    cleanString(suppliedName, 120);

  if (supplied) {
    return supplied;
  }

  const displayName =
    cleanString(
      user.displayName,
      120
    );

  if (displayName) {
    return displayName;
  }

  const email =
    cleanString(
      user.email,
      160
    );

  if (email) {
    return email.split('@')[0];
  }

  return 'OVYX Customer';
}

async function safeAudit(env, payload) {
  try {
    if (typeof writeAuditLog === 'function') {
      await writeAuditLog(env, payload);
    }
  } catch {
    /*
     * Audit failure must never expose secrets or cause
     * a successful payment request to be retried as a
     * payment failure.
     */
  }
}

async function handlePost(request, env) {
  const id = requestId(request);

  const identity =
    await verifyFirebaseIdToken(
      request,
      env
    );

  if (!identity.ok) {
    return identity.response;
  }

  if (
    identity.user.emailVerified !== true
  ) {
    return errorResponse(
      403,
      'EMAIL_VERIFICATION_REQUIRED',
      'Verify your OVYX email address before starting a payment.'
    );
  }

  let body;

  try {
    body =
      await readJson(request);
  } catch (error) {
    if (error.message === 'REQUEST_TOO_LARGE') {
      return errorResponse(
        413,
        'REQUEST_TOO_LARGE',
        'The payment request is too large.'
      );
    }

    return errorResponse(
      400,
      'INVALID_JSON',
      'The payment request body is invalid.'
    );
  }

  const tier =
    normalizeTier(
      body.plan ||
      body.tier ||
      body.productId
    );

  const currency =
    normalizeCurrency(
      body.currency
    );

  const phone =
    normalizePhone(
      body.phone
    );

  const customerName =
    buildCustomerName(
      identity.user,
      body.customerName ||
      body.fullName ||
      body.name
    );

  if (!tier) {
    return errorResponse(
      400,
      'INVALID_PLAN',
      'A valid OVYX plan is required.'
    );
  }

  if (!currency) {
    return errorResponse(
      400,
      'INVALID_CURRENCY',
      'OPay checkout currently requires NGN.'
    );
  }

  if (phone === null) {
    return errorResponse(
      400,
      'INVALID_PHONE',
      'The supplied phone number is invalid.'
    );
  }

  if (!identity.user.email) {
    return errorResponse(
      400,
      'EMAIL_REQUIRED',
      'A verified account email is required for payment.'
    );
  }

  const idempotencyKey =
    normalizeIdempotencyKey(
      request,
      body
    );

  if (!idempotencyKey) {
    return errorResponse(
      400,
      'IDEMPOTENCY_KEY_REQUIRED',
      'An Idempotency-Key is required for payment creation.'
    );
  }

  let idempotency;

  try {
    idempotency =
      await claimIdempotencyKey(
        env,
        idempotencyKey,
        {
          uid: identity.user.uid,
          operation: 'payment.create',
          requestId: id
        }
      );
  } catch {
    return errorResponse(
      503,
      'IDEMPOTENCY_UNAVAILABLE',
      'Payment protection is temporarily unavailable. Please try again.'
    );
  }

  if (
    idempotency &&
    idempotency.replay === true &&
    idempotency.response
  ) {
    return jsonResponse(
      idempotency.response.body,
      idempotency.response.status || 200,
      {
        'X-OVYX-Request-ID': id
      }
    );
  }

  if (
    idempotency &&
    idempotency.inProgress === true
  ) {
    return errorResponse(
      409,
      'PAYMENT_REQUEST_IN_PROGRESS',
      'This payment request is already being processed.'
    );
  }

  try {
    /*
     * NEVER use body.amount as the authoritative amount.
     *
     * The server reads the current Root Admin pricing
     * configuration through pricing.js.
     */
    const price =
      await getServerPrice(
        env,
        tier,
        currency
      );

    const orderNo =
      buildOrderNumber(
        identity.user.uid
      );

    const now =
      new Date();

    const expiresAt =
      new Date(
        now.getTime() +
        ORDER_EXPIRY_SECONDS * 1000
      );

    /*
     * Persist the internal payment record BEFORE
     * calling OPay so the webhook can safely reconcile
     * the transaction against the authenticated OVYX
     * account.
     */
    const paymentRecord = {
      uid:
        identity.user.uid,

      email:
        identity.user.email,

      plan:
        price.tier,

      currency:
        price.currency,

      amount:
        price.amount,

      minorUnitAmount:
        price.minorUnitAmount,

      provider:
        'opay',

      status:
        'pending',

      fulfillmentStatus:
        'unfulfilled',

      orderNo,

      idempotencyKey,

      requestId:
        id,

      customerName,

      phone:
        phone || null,

      createdAt:
        now.toISOString(),

      expiresAt:
        expiresAt.toISOString(),

      providerOrderNo:
        null,

      providerTransactionId:
        null
    };

    await firestoreSet(
      env,
      [
        'payment_orders',
        orderNo
      ],
      paymentRecord
    );

    let providerResult;

    try {
      providerResult =
        await createCheckoutOrder(
          env,
          {
            outOrderNo:
              orderNo,

            amount:
              price.amount,

            currency:
              price.currency,

            orderExpireTime:
              ORDER_EXPIRY_SECONDS,

            customerName,

            customerEmail:
              identity.user.email,

            customerPhone:
              phone || undefined,

            productName:
              `OVYX ${price.tier.toUpperCase()} Plan`,

            remark:
              `OVYX ${price.tier.toUpperCase()} subscription`
          }
        );
    } catch (error) {
      await firestoreSet(
        env,
        [
          'payment_orders',
          orderNo
        ],
        {
          ...paymentRecord,

          status:
            'failed',

          failureCode:
            'OPAY_CREATE_FAILED',

          failureMessage:
            String(
              error?.message ||
              'OPay order creation failed.'
            ).slice(0, 500),

          failedAt:
            new Date().toISOString()
        }
      );

      await releaseIdempotencyKey(
        env,
        idempotencyKey
      );

      await safeAudit(
        env,
        {
          user:
            identity.user.uid,

          action:
            'paymentCreationFailed',

          resource:
            `payment_orders/${orderNo}`,

          timestamp:
            new Date().toISOString(),

          requestId:
            id,

          ipAddress:
            request.headers.get('CF-Connecting-IP') ||
            '',

          result:
            'failure',

          providerEventId:
            null
        }
      );

      return errorResponse(
        502,
        'OPAY_CREATE_FAILED',
        'OPay could not create the payment order.'
      );
    }

    const providerOrderNo =
      String(
        providerResult?.orderNo ||
        providerResult?.data?.orderNo ||
        ''
      ).trim();

    if (!providerOrderNo) {
      await firestoreSet(
        env,
        [
          'payment_orders',
          orderNo
        ],
        {
          ...paymentRecord,

          status:
            'failed',

          failureCode:
            'OPAY_MISSING_ORDER_NUMBER',

          failedAt:
            new Date().toISOString()
        }
      );

      await releaseIdempotencyKey(
        env,
        idempotencyKey
      );

      return errorResponse(
        502,
        'OPAY_INVALID_RESPONSE',
        'OPay returned an invalid payment order.'
      );
    }

    const updatedRecord = {
      ...paymentRecord,

      providerOrderNo,

      provider:
        'opay',

      status:
        'pending',

      updatedAt:
        new Date().toISOString()
    };

    await firestoreSet(
      env,
      [
        'payment_orders',
        orderNo
      ],
      updatedRecord
    );

    const responseBody = {
      ok:
        true,

      provider:
        'opay',

      reference:
        orderNo,

      orderNo,

      providerOrderNo,

      plan:
        price.tier,

      currency:
        price.currency,

      amount:
        price.amount,

      minorUnitAmount:
        price.minorUnitAmount,

      status:
        'pending',

      expiresAt:
        expiresAt.toISOString()
    };

    await completeIdempotencyKey(
      env,
      idempotencyKey,
      {
        status:
          200,

        body:
          responseBody
      }
    );

    await safeAudit(
      env,
      {
        user:
          identity.user.uid,

        action:
          'paymentInitiated',

        resource:
          `payment_orders/${orderNo}`,

        timestamp:
          new Date().toISOString(),

        requestId:
          id,

        ipAddress:
          request.headers.get('CF-Connecting-IP') ||
          '',

        result:
          'success',

        providerEventId:
          providerOrderNo
      }
    );

    return jsonResponse(
      responseBody,
      200,
      {
        'X-OVYX-Request-ID': id
      }
    );
  } catch (error) {
    try {
      await releaseIdempotencyKey(
        env,
        idempotencyKey
      );
    } catch {}

    return errorResponse(
      500,
      'PAYMENT_CREATION_FAILED',
      'The payment could not be initialized.'
    );
  }
}

async function onRequest(context) {
  const {
    request,
    env
  } = context;

  if (
    !ALLOWED_METHODS.includes(
      request.method
    )
  ) {
    return errorResponse(
      405,
      'METHOD_NOT_ALLOWED',
      'Only POST is supported for this endpoint.',
      {
        Allow: 'POST, OPTIONS'
      }
    );
  }

  if (request.method === 'OPTIONS') {
    return new Response(
      null,
      {
        status: 204,
        headers: {
          'Allow': 'POST, OPTIONS'
        }
      }
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
