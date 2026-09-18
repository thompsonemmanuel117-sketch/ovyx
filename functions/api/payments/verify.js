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
  queryOrder
} = require('../_lib/payments/opay.js');

const {
  getServerPrice,
  assertServerAmount,
  assertCurrency
} = require('../_lib/payments/pricing.js');

const {
  writeAuditLog
} = require('../_lib/logger.js');

const MAX_ORDER_LENGTH = 128;

function cleanString(
  value,
  max = MAX_ORDER_LENGTH
) {
  return String(value || '')
    .trim()
    .slice(0, max);
}

function requestId(request) {
  return (
    request.headers.get('CF-Ray') ||
    request.headers.get('X-Request-ID') ||
    crypto.randomUUID()
  );
}

function normalizeStatus(
  value
) {
  return cleanString(
    value,
    64
  ).toUpperCase();
}

function extractData(
  response
) {
  if (
    response &&
    typeof response === 'object' &&
    response.data &&
    typeof response.data === 'object'
  ) {
    return response.data;
  }

  return response || {};
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

async function handleGet(
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

  const url =
    new URL(
      request.url
    );

  const reference =
    cleanString(
      url.searchParams.get(
        'reference'
      ) ||
      url.searchParams.get(
        'orderNo'
      )
    );

  if (!reference) {
    return errorResponse(
      400,
      'PAYMENT_REFERENCE_REQUIRED',
      'A payment reference is required.'
    );
  }

  if (
    reference.length >
    MAX_ORDER_LENGTH
  ) {
    return errorResponse(
      400,
      'INVALID_PAYMENT_REFERENCE',
      'The payment reference is invalid.'
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
    return errorResponse(
      503,
      'PAYMENT_RECORD_UNAVAILABLE',
      'The payment record could not be loaded.'
    );
  }

  if (!payment) {
    return errorResponse(
      404,
      'PAYMENT_NOT_FOUND',
      'The payment order was not found.'
    );
  }

  /*
   * Users may reconcile only their own payment.
   */
  if (
    payment.uid !==
    identity.user.uid
  ) {
    return errorResponse(
      403,
      'PAYMENT_ACCESS_DENIED',
      'You are not allowed to access this payment.'
    );
  }

  if (
    payment.provider !==
    'opay'
  ) {
    return errorResponse(
      409,
      'PAYMENT_PROVIDER_MISMATCH',
      'This payment does not belong to OPay.'
    );
  }

  let providerResponse;

  try {
    providerResponse =
      await queryOrder(
        env,
        {
          outOrderNo:
            reference,

          orderNo:
            payment.providerOrderNo ||
            undefined
        }
      );
  } catch {
    await audit(
      env,
      {
        user:
          identity.user.uid,

        action:
          'paymentReconciliationFailed',

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
          null
      }
    );

    return errorResponse(
      502,
      'OPAY_QUERY_FAILED',
      'OPay could not be queried for this payment.'
    );
  }

  const provider =
    extractData(
      providerResponse
    );

  const status =
    normalizeStatus(
      provider.status
    );

  const providerAmount =
    provider.amount;

  const providerCurrency =
    cleanString(
      provider.currency ||
      'NGN',
      8
    ).toUpperCase();

  const providerOrderNo =
    cleanString(
      provider.orderNo,
      128
    );

  const providerOutOrderNo =
    cleanString(
      provider.outOrderNo,
      128
    );

  const providerPayNo =
    cleanString(
      provider.payNo,
      160
    );

  /*
   * Make sure the provider did not return a different
   * merchant order.
   */
  if (
    providerOutOrderNo &&
    providerOutOrderNo !==
      reference
  ) {
    return errorResponse(
      409,
      'OPAY_ORDER_REFERENCE_MISMATCH',
      'The OPay order reference does not match the OVYX payment.'
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
      'OPAY_PROVIDER_ORDER_MISMATCH',
      'The OPay provider order does not match the OVYX payment.'
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

    assertServerAmount(
      authoritativePrice.amount,
      providerAmount
    );

    assertCurrency(
      authoritativePrice.currency,
      providerCurrency
    );
  } catch {
    await audit(
      env,
      {
        user:
          identity.user.uid,

        action:
          'paymentReconciliationAmountMismatch',

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
          providerPayNo ||
          providerOrderNo ||
          null
      }
    );

    return errorResponse(
      409,
      'PAYMENT_RECONCILIATION_MISMATCH',
      'The OPay transaction does not match the server-authoritative OVYX payment.'
    );
  }

  const now =
    new Date().toISOString();

  const normalizedPayment =
    {
      ...payment,

      providerOrderNo:
        providerOrderNo ||
        payment.providerOrderNo ||
        null,

      providerTransactionId:
        providerPayNo ||
        payment.providerTransactionId ||
        null,

      lastQueriedStatus:
        status,

      lastProviderAmount:
        Number(
          providerAmount
        ),

      lastProviderCurrency:
        providerCurrency,

      lastReconciledAt:
        now,

      updatedAt:
        now
    };

  /*
   * Reconciliation can safely update the payment record's
   * provider facts.
   *
   * It does not independently activate a subscription.
   * Subscription fulfillment remains controlled by the
   * lifecycle/webhook flow.
   */
  await firestoreSet(
    env,
    [
      'payment_orders',
      reference
    ],
    normalizedPayment
  );

  await audit(
    env,
    {
      user:
        identity.user.uid,

      action:
        'paymentReconciled',

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
        providerPayNo ||
        providerOrderNo ||
        null
    }
  );

  return jsonResponse(
    {
      ok:
        true,

      reference,

      provider:
        'opay',

      status,

      plan:
        payment.plan,

      currency:
        authoritativePrice.currency,

      amount:
        authoritativePrice.amount,

      providerOrderNo:
        providerOrderNo ||
        null,

      providerTransactionId:
        providerPayNo ||
        null,

      reconciledAt:
        now
    },
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
    'GET'
  ) {
    return errorResponse(
      405,
      'METHOD_NOT_ALLOWED',
      'Only GET is supported for payment reconciliation.'
    );
  }

  return handleGet(
    request,
    env
  );
}

module.exports = {
  onRequest
};
