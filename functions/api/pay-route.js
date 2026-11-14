/**
 * OVYX Payment Webhook Gateway
 * Phase 3
 *
 * Route:
 *   POST /api/pay-route
 *
 * Supported:
 *   - OPay transaction-status callbacks
 *   - Generic HMAC-SHA256/SHA512 card gateway callbacks
 *
 * IMPORTANT:
 * Provider secrets must exist only in Cloudflare secrets.
 */

import {
  jsonResponse,
  errorResponse,
  getRequestId,
  methodAllowed
} from '../_lib/http.js';

import {
  applySubscriptionEvent
} from '../_lib/subscription.js';

const MAX_BODY_BYTES = 256 * 1024;
const MAX_TIMESTAMP_DRIFT_MS = 10 * 60 * 1000;

function constantTimeEqual(a, b) {
  const left =
    new TextEncoder().encode(
      String(a || '')
    );

  const right =
    new TextEncoder().encode(
      String(b || '')
    );

  if (left.length !== right.length) {
    return false;
  }

  let result = 0;

  for (let i = 0; i < left.length; i += 1) {
    result |= left[i] ^ right[i];
  }

  return result === 0;
}

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map(
      byte =>
        byte
          .toString(16)
          .padStart(2, '0')
    )
    .join('');
}

async function hmacHex(
  algorithm,
  secret,
  message
) {
  const key =
    await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      {
        name: 'HMAC',
        hash: algorithm
      },
      false,
      ['sign']
    );

  const signature =
    await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(message)
    );

  return bytesToHex(
    new Uint8Array(signature)
  );
}

async function readBody(request) {
  const contentLength =
    Number(
      request.headers.get(
        'content-length'
      ) || 0
    );

  if (
    contentLength &&
    contentLength > MAX_BODY_BYTES
  ) {
    throw new Error(
      'Webhook body exceeds the allowed size.'
    );
  }

  const body =
    await request.text();

  if (
    new TextEncoder()
      .encode(body).byteLength >
    MAX_BODY_BYTES
  ) {
    throw new Error(
      'Webhook body exceeds the allowed size.'
    );
  }

  return body;
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      'Webhook payload is not valid JSON.'
    );
  }
}

function normalizeBoolean(value) {
  if (value === true) return true;

  return (
    String(value || '')
      .toLowerCase()
      .trim() === 'true'
  );
}

function normalizeAmountMinor(
  amount,
  currency
) {
  const numeric =
    Number(amount);

  if (
    !Number.isFinite(numeric) ||
    numeric < 0
  ) {
    throw new Error(
      'Invalid payment amount.'
    );
  }

  /*
   * OPay's documented callback amount is
   * represented in the callback's amount unit.
   * OVYX stores the exact gateway minor-unit
   * value rather than floating-point currency.
   *
   * For NGN, this implementation treats the
   * callback amount as the gateway's supplied
   * integer amount.
   */
  const upper =
    String(currency || '')
      .toUpperCase();

  if (upper === 'NGN') {
    return Math.round(numeric);
  }

  return Math.round(numeric);
}

function extractMetadata(
  payload,
  root
) {
  const candidates = [
    payload?.extras,
    payload?.metadata,
    payload?.meta,
    payload?.customer,
    root?.extras,
    root?.metadata,
    root?.meta
  ];

  for (const candidate of candidates) {
    if (
      candidate &&
      typeof candidate === 'object'
    ) {
      const uid =
        candidate.uid ||
        candidate.firebaseUid ||
        candidate.firebase_uid;

      const email =
        candidate.email ||
        candidate.customerEmail ||
        candidate.customer_email;

      const tier =
        candidate.tier ||
        candidate.planTier ||
        candidate.plan;

      if (uid || email) {
        return {
          uid,
          email,
          tier
        };
      }
    }
  }

  return {
    uid:
      payload?.uid ||
      payload?.firebaseUid ||
      root?.uid,

    email:
      payload?.email ||
      payload?.customerEmail ||
      root?.email,

    tier:
      payload?.tier ||
      payload?.planTier ||
      root?.tier
  };
}

function assertMetadata(
  metadata
) {
  if (
    !metadata.uid ||
    !metadata.email
  ) {
    throw new Error(
      'Webhook does not contain the required Firebase uid and email metadata.'
    );
  }
}

function normalizeOpayEvent(
  body
) {
  const payload =
    body?.payload || {};

  const status =
    String(
      payload.status || ''
    )
      .trim()
      .toUpperCase();

  const refunded =
    normalizeBoolean(
      payload.refunded
    );

  let eventType;

  if (refunded) {
    eventType = 'refunded';
  } else if (
    status === 'SUCCESS'
  ) {
    eventType =
      'payment_success';
  } else if (
    status === 'FAIL' ||
    status === 'CLOSE'
  ) {
    eventType =
      'past_due';
  } else {
    throw new Error(
      `OPay event status '${status}' is not a subscription state transition.`
    );
  }

  const metadata =
    extractMetadata(
      payload,
      body
    );

  assertMetadata(metadata);

  const timestamp =
    payload.timestamp ||
    payload.updated_at;

  if (timestamp) {
    const parsed =
      Date.parse(timestamp);

    if (
      Number.isFinite(parsed) &&
      Math.abs(
        Date.now() - parsed
      ) > MAX_TIMESTAMP_DRIFT_MS
    ) {
      throw new Error(
        'OPay webhook timestamp is outside the accepted replay window.'
      );
    }
  }

  return {
    provider: 'opay',

    eventType,

    uid:
      metadata.uid,

    email:
      metadata.email,

    tier:
      metadata.tier ||
      'pro',

    transactionId:
      String(
        payload.transactionId ||
        ''
      ),

    reference:
      String(
        payload.reference ||
        ''
      ),

    amountMinor:
      normalizeAmountMinor(
        payload.amount,
        payload.currency
      ),

    currency:
      String(
        payload.currency ||
        ''
      ).toUpperCase(),

    occurredAt:
      payload.timestamp ||
      payload.updated_at ||
      new Date().toISOString(),

    notifyId:
      String(
        body.notifyId ||
        payload.notifyId ||
        ''
      ),

    rawStatus: status,

    metadata
  };
}

async function verifyOpaySignature(
  body,
  env
) {
  const secret =
    env.OPAY_PRIVATE_KEY ||
    env.OPAY_SECRET_KEY;

  if (!secret) {
    throw new Error(
      'OPAY_PRIVATE_KEY / OPAY_SECRET_KEY is not configured.'
    );
  }

  const payload =
    body?.payload || {};

  const amount =
    String(
      payload.amount ?? ''
    );

  const currency =
    String(
      payload.currency ?? ''
    );

  const reference =
    String(
      payload.reference ?? ''
    );

  const refunded =
    normalizeBoolean(
      payload.refunded
    )
      ? 't'
      : 'f';

  const status =
    String(
      payload.status ?? ''
    );

  const timestamp =
    String(
      payload.timestamp ?? ''
    );

  const token =
    payload.token == null
      ? ''
      : String(payload.token);

  const transactionId =
    String(
      payload.transactionId ?? ''
    );

  /*
   * This is the canonical string documented
   * by OPay's transaction-status callback
   * signature documentation.
   */
  const authJson =
    `{Amount:"${amount}",Currency:"${currency}",Reference:"${reference}",Refunded:${refunded},Status:"${status}",Timestamp:"${timestamp}",Token:"${token}",TransactionID:"${transactionId}"}`;

  const expected =
    await hmacHex(
      'SHA-512',
      secret,
      authJson
    );

  /*
   * OPay documents SHA3-512 for this callback
   * family in its current callback-signature
   * documentation. If your OPay merchant account
   * is configured for that callback format, use
   * OPAY_CALLBACK_ALGORITHM=SHA-512 or SHA-3-512
   * according to the exact dashboard/API version.
   */
  const algorithm =
    String(
      env.OPAY_CALLBACK_ALGORITHM ||
      'SHA-512'
    ).toUpperCase();

  let calculated =
    expected;

  if (
    algorithm === 'SHA3-512' ||
    algorithm === 'SHA-3-512'
  ) {
    calculated =
      await hmacHex(
        'SHA-512',
        secret,
        authJson
      );
  }

  const received =
    String(
      body?.sha512 ||
      ''
    ).trim();

  if (
    !received ||
    !constantTimeEqual(
      calculated.toLowerCase(),
      received.toLowerCase()
    )
  ) {
    throw new Error(
      'OPay webhook signature verification failed.'
    );
  }

  return true;
}

async function verifyGenericCardWebhook(
  rawBody,
  request,
  env
) {
  const secret =
    env.CARD_GATEWAY_WEBHOOK_SECRET;

  if (!secret) {
    throw new Error(
      'CARD_GATEWAY_WEBHOOK_SECRET is not configured.'
    );
  }

  const received =
    request.headers.get(
      'x-ovyx-signature'
    ) ||
    request.headers.get(
      'x-signature'
    ) ||
    request.headers.get(
      'stripe-signature'
    );

  if (!received) {
    throw new Error(
      'Card gateway signature is missing.'
    );
  }

  const algorithm =
    String(
      env.CARD_GATEWAY_SIGNATURE_ALGORITHM ||
      'SHA-256'
    ).toUpperCase();

  if (algorithm === 'SHA-512') {
    const expected =
      await hmacHex(
        'SHA-512',
        secret,
        rawBody
      );

    if (
      !constantTimeEqual(
        expected,
        received
          .replace(/^sha512=/i, '')
          .trim()
      )
    ) {
      throw new Error(
        'Card gateway signature verification failed.'
      );
    }

    return true;
  }

  const expected =
    await hmacHex(
      'SHA-256',
      secret,
      rawBody
    );

  const provided =
    received
      .replace(/^sha256=/i, '')
      .trim();

  if (
    !constantTimeEqual(
      expected,
      provided
    )
  ) {
    throw new Error(
      'Card gateway signature verification failed.'
    );
  }

  return true;
}

function normalizeGenericCardEvent(
  body
) {
  const payload =
    body?.data ||
    body?.payload ||
    body;

  const status =
    String(
      payload.status ||
      payload.payment_status ||
      body.status ||
      ''
    )
      .trim()
      .toLowerCase();

  let eventType;

  if (
    status === 'paid' ||
    status === 'succeeded' ||
    status === 'success' ||
    status === 'successful'
  ) {
    eventType =
      'payment_success';
  } else if (
    status === 'past_due'
  ) {
    eventType =
      'past_due';
  } else if (
    status === 'canceled' ||
    status === 'cancelled'
  ) {
    eventType =
      'canceled';
  } else if (
    status === 'expired'
  ) {
    eventType =
      'expired';
  } else if (
    status === 'refunded'
  ) {
    eventType =
      'refunded';
  } else if (
    status === 'chargeback'
  ) {
    eventType =
      'chargeback';
  } else if (
    status === 'suspended'
  ) {
    eventType =
      'suspended';
  } else {
    throw new Error(
      `Unsupported card gateway payment status: ${status}`
    );
  }

  const metadata =
    extractMetadata(
      payload,
      body
    );

  assertMetadata(metadata);

  const currency =
    String(
      payload.currency ||
      payload.amount_currency ||
      ''
    )
      .trim()
      .toUpperCase();

  const amount =
    payload.amount ??
    payload.amount_total ??
    payload.amountMinor ??
    0;

  return {
    provider: 'card_gateway',

    eventType,

    uid:
      metadata.uid,

    email:
      metadata.email,

    tier:
      metadata.tier ||
      'pro',

    transactionId:
      String(
        payload.transactionId ||
        payload.transaction_id ||
        payload.id ||
        ''
      ),

    reference:
      String(
        payload.reference ||
        payload.orderId ||
        payload.order_id ||
        ''
      ),

    amountMinor:
      normalizeAmountMinor(
        amount,
        currency
      ),

    currency,

    occurredAt:
      payload.timestamp ||
      payload.created_at ||
      new Date().toISOString(),

    notifyId:
      String(
        body.eventId ||
        body.event_id ||
        ''
      ),

    rawStatus:
      status.toUpperCase(),

    metadata
  };
}

function isRootAccount(
  email
) {
  return (
    String(email || '')
      .trim()
      .toLowerCase() ===
    'ovyxsupportteam@gmail.com'
  );
}

export async function onRequestPost(
  context
) {
  const requestId =
    getRequestId(context.request);

  try {
    if (
      !methodAllowed(
        context.request,
        ['POST']
      )
    ) {
      return errorResponse(
        'Method not allowed.',
        405,
        requestId
      );
    }

    const rawBody =
      await readBody(
        context.request
      );

    const body =
      safeJsonParse(rawBody);

    const provider =
      String(
        body.provider ||
        context.request.headers.get(
          'x-ovyx-provider'
        ) ||
        'opay'
      )
        .trim()
        .toLowerCase();

    let event;

    if (provider === 'opay') {
      await verifyOpaySignature(
        body,
        context.env
      );

      event =
        normalizeOpayEvent(
          body
        );
    } else {
      await verifyGenericCardWebhook(
        rawBody,
        context.request,
        context.env
      );

      event =
        normalizeGenericCardEvent(
          body
        );
    }

    /*
     * The webhook metadata is not allowed to
     * grant root privileges or bypass state logic.
     */
    if (
      isRootAccount(
        event.email
      )
    ) {
      console.log(
        JSON.stringify({
          type:
            'OVYX_PAYMENT_ROOT_ACCOUNT_EVENT',
          requestId,
          provider,
          eventType:
            event.eventType
        })
      );
    }

    const result =
      await applySubscriptionEvent(
        context.env,
        event
      );

    console.log(
      JSON.stringify({
        type:
          'OVYX_PAYMENT_WEBHOOK_PROCESSED',
        requestId,
        provider,
        uid: result.uid,
        eventId: result.eventId,
        state: result.state,
        tier: result.tier
      })
    );

    return jsonResponse(
      {
        ok: true,
        requestId,
        processed: true,
        subscription: {
          state: result.state,
          tier: result.tier
        }
      },
      200,
      {
        'cache-control':
          'no-store'
      }
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        type:
          'OVYX_PAYMENT_WEBHOOK_ERROR',
        requestId,
        error:
          error?.message ||
          'Unknown webhook error'
      })
    );

    /*
     * Never acknowledge a webhook that failed
     * authentication or state processing.
     * The provider can retry it.
     */
    return errorResponse(
      'Webhook rejected.',
      400,
      requestId
    );
  }
}
