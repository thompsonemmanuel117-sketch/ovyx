'use strict';

/**
 * OVYX — Payment Idempotency Engine
 *
 * File:
 *   functions/api/_lib/payments/idempotency.js
 *
 * Collection:
 *   /payment_events/{idempotencyKey}
 *
 * Purpose:
 *   Prevent the same OPay webhook/payment event from being
 *   processed more than once.
 *
 * Important:
 *   This module uses Firestore create semantics instead of
 *   read-then-write logic so two concurrent webhook requests
 *   cannot both successfully claim the same event.
 */

const FIRESTORE_SCOPE =
  'https://www.googleapis.com/auth/datastore';

const FIRESTORE_TOKEN_URL =
  'https://oauth2.googleapis.com/token';

const FIRESTORE_BASE_URL =
  'https://firestore.googleapis.com/v1';

const COLLECTION_NAME =
  'payment_events';

const MAX_KEY_LENGTH = 300;

function text(value) {
  return String(
    value == null ? '' : value
  );
}

function normalizeKey(
  value
) {
  const key =
    text(value)
      .trim()
      .toLowerCase();

  if (!key) {
    throw new Error(
      'Idempotency key is required.'
    );
  }

  if (
    key.length >
    MAX_KEY_LENGTH
  ) {
    throw new Error(
      'Idempotency key is too long.'
    );
  }

  if (
    !/^[a-z0-9._:-]+$/.test(
      key
    )
  ) {
    throw new Error(
      'Idempotency key contains unsupported characters.'
    );
  }

  return key;
}

function base64UrlEncodeBytes(
  bytes
) {
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(
      byte
    );
  }

  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function stringToBytes(
  value
) {
  return new TextEncoder().encode(
    text(value)
  );
}

function base64UrlEncodeString(
  value
) {
  return base64UrlEncodeBytes(
    stringToBytes(value)
  );
}

function normalizePrivateKey(
  value
) {
  return text(value)
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .trim();
}

function pemToDer(
  pem
) {
  const body =
    normalizePrivateKey(pem)
      .replace(
        /-----BEGIN [^-]+-----/g,
        ''
      )
      .replace(
        /-----END [^-]+-----/g,
        ''
      )
      .replace(/\s+/g, '');

  if (!body) {
    throw new Error(
      'Firebase service-account private key is empty.'
    );
  }

  const padded =
    body +
    '='.repeat(
      (4 - (body.length % 4)) %
        4
    );

  const binary =
    atob(padded);

  const bytes =
    new Uint8Array(
      binary.length
    );

  for (
    let i = 0;
    i < binary.length;
    i += 1
  ) {
    bytes[i] =
      binary.charCodeAt(i);
  }

  return bytes;
}

async function createGoogleAccessToken(
  serviceAccount
) {
  const clientEmail =
    text(
      serviceAccount.client_email
    ).trim();

  const privateKey =
    normalizePrivateKey(
      serviceAccount.private_key
    );

  if (
    !clientEmail ||
    !privateKey
  ) {
    throw new Error(
      'Firebase service account credentials are incomplete.'
    );
  }

  const now =
    Math.floor(
      Date.now() / 1000
    );

  const header =
    base64UrlEncodeString(
      JSON.stringify({
        alg: 'RS256',
        typ: 'JWT'
      })
    );

  const claim =
    base64UrlEncodeString(
      JSON.stringify({
        iss: clientEmail,
        scope:
          FIRESTORE_SCOPE,
        aud:
          FIRESTORE_TOKEN_URL,
        iat: now,
        exp:
          now + 3600
      })
    );

  const unsignedToken =
    `${header}.${claim}`;

  const signingKey =
    await crypto.subtle.importKey(
      'pkcs8',
      pemToDer(
        privateKey
      ),
      {
        name:
          'RSASSA-PKCS1-v1_5',
        hash:
          'SHA-256'
      },
      false,
      ['sign']
    );

  const signature =
    await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      signingKey,
      stringToBytes(
        unsignedToken
      )
    );

  const assertion =
    `${unsignedToken}.${base64UrlEncodeBytes(
      new Uint8Array(
        signature
      )
    )}`;

  const response =
    await fetch(
      FIRESTORE_TOKEN_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type':
            'application/x-www-form-urlencoded'
        },
        body:
          `grant_type=${encodeURIComponent(
            'urn:ietf:params:oauth:grant-type:jwt-bearer'
          )}&assertion=${encodeURIComponent(
            assertion
          )}`
      }
    );

  const payload =
    await response
      .json()
      .catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      `Google service authentication failed with HTTP ${response.status}.`
    );
  }

  const accessToken =
    text(
      payload.access_token
    ).trim();

  if (!accessToken) {
    throw new Error(
      'Google service authentication returned no access token.'
    );
  }

  return accessToken;
}

function getServiceAccount(
  env
) {
  const raw =
    text(
      env.FIREBASE_SERVICE_ACCOUNT_JSON
    ).trim();

  if (!raw) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_JSON is not configured.'
    );
  }

  let parsed;

  try {
    parsed =
      JSON.parse(raw);
  } catch {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.'
    );
  }

  return parsed;
}

function getProjectId(
  env,
  serviceAccount
) {
  const projectId =
    text(
      serviceAccount.project_id ||
      env.FIREBASE_PROJECT_ID
    ).trim();

  if (!projectId) {
    throw new Error(
      'Firebase project ID is not configured.'
    );
  }

  return projectId;
}

function firestoreValue(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return {
      nullValue: null
    };
  }

  if (
    typeof value === 'boolean'
  ) {
    return {
      booleanValue: value
    };
  }

  if (
    typeof value === 'number'
  ) {
    if (
      Number.isInteger(value)
    ) {
      return {
        integerValue:
          String(value)
      };
    }

    return {
      doubleValue: value
    };
  }

  if (
    value instanceof Date
  ) {
    return {
      timestampValue:
        value.toISOString()
    };
  }

  if (
    Array.isArray(value)
  ) {
    return {
      arrayValue: {
        values:
          value.map(
            firestoreValue
          )
      }
    };
  }

  if (
    typeof value === 'object'
  ) {
    const fields = {};

    for (
      const [key, current]
      of Object.entries(value)
    ) {
      fields[key] =
        firestoreValue(
          current
        );
    }

    return {
      mapValue: {
        fields
      }
    };
  }

  return {
    stringValue:
      String(value)
  };
}

function buildFirestoreDocument(
  data
) {
  const fields = {};

  for (
    const [key, value]
    of Object.entries(data)
  ) {
    fields[key] =
      firestoreValue(value);
  }

  return {
    fields
  };
}

function getFirestoreRoot(
  projectId
) {
  return `${FIRESTORE_BASE_URL}/projects/${encodeURIComponent(
    projectId
  )}/databases/(default)/documents`;
}

async function firestoreCreateEvent(
  env,
  key,
  data
) {
  const serviceAccount =
    getServiceAccount(env);

  const projectId =
    getProjectId(
      env,
      serviceAccount
    );

  const accessToken =
    await createGoogleAccessToken(
      serviceAccount
    );

  const parent =
    getFirestoreRoot(
      projectId
    );

  const url =
    `${parent}/${COLLECTION_NAME}?documentId=${encodeURIComponent(
      key
    )}`;

  const response =
    await fetch(
      url,
      {
        method: 'POST',
        headers: {
          Authorization:
            `Bearer ${accessToken}`,
          'Content-Type':
            'application/json'
        },
        body:
          JSON.stringify(
            buildFirestoreDocument(
              data
            )
          )
      }
    );

  const payload =
    await response
      .json()
      .catch(() => ({}));

  return {
    response,
    payload
  };
}

async function firestoreGetEvent(
  env,
  key
) {
  const serviceAccount =
    getServiceAccount(env);

  const projectId =
    getProjectId(
      env,
      serviceAccount
    );

  const accessToken =
    await createGoogleAccessToken(
      serviceAccount
    );

  const url =
    `${getFirestoreRoot(
      projectId
    )}/${COLLECTION_NAME}/${encodeURIComponent(
      key
    )}`;

  const response =
    await fetch(
      url,
      {
        method: 'GET',
        headers: {
          Authorization:
            `Bearer ${accessToken}`
        }
      }
    );

  if (
    response.status ===
    404
  ) {
    return null;
  }

  const payload =
    await response
      .json()
      .catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      `Unable to read payment idempotency record. HTTP ${response.status}.`
    );
  }

  return payload;
}

/**
 * Attempts to atomically claim an event.
 *
 * Returns:
 *
 * {
 *   claimed: true,
 *   duplicate: false,
 *   key
 * }
 *
 * or:
 *
 * {
 *   claimed: false,
 *   duplicate: true,
 *   key,
 *   existing
 * }
 */
async function claim(
  env,
  {
    key,
    provider = 'opay',
    eventType = '',
    providerEventId = '',
    outOrderNo = '',
    orderNo = '',
    uid = '',
    metadata = {}
  }
) {
  const normalizedKey =
    normalizeKey(key);

  const now =
    new Date().toISOString();

  const record = {
    provider:
      text(provider)
        .trim()
        .toLowerCase(),

    eventType:
      text(eventType)
        .trim(),

    providerEventId:
      text(providerEventId)
        .trim(),

    outOrderNo:
      text(outOrderNo)
        .trim(),

    orderNo:
      text(orderNo)
        .trim(),

    uid:
      text(uid)
        .trim(),

    status:
      'received',

    createdAt:
      now,

    updatedAt:
      now,

    metadata:
      metadata &&
      typeof metadata ===
        'object'
        ? metadata
        : {}
  };

  const result =
    await firestoreCreateEvent(
      env,
      normalizedKey,
      record
    );

  if (
    result.response.ok
  ) {
    return {
      claimed: true,
      duplicate: false,
      key: normalizedKey
    };
  }

  /*
   * Firestore's createDocument returns
   * ALREADY_EXISTS when another request
   * already claimed the same document.
   */
  if (
    result.response.status ===
      409 ||
    text(
      result.payload?.error?.status
    ).toUpperCase() ===
      'ALREADY_EXISTS'
  ) {
    const existing =
      await firestoreGetEvent(
        env,
        normalizedKey
      );

    return {
      claimed: false,
      duplicate: true,
      key: normalizedKey,
      existing
    };
  }

  throw new Error(
    `Unable to claim payment event. HTTP ${result.response.status}.`
  );
}

/**
 * Marks an already claimed event as processed.
 *
 * This deliberately uses the existing payment event
 * document rather than creating a second event record.
 *
 * The webhook/lifecycle layer will call this after
 * successful processing.
 */
async function updateStatus(
  env,
  key,
  status,
  extra = {}
) {
  const normalizedKey =
    normalizeKey(key);

  const serviceAccount =
    getServiceAccount(env);

  const projectId =
    getProjectId(
      env,
      serviceAccount
    );

  const accessToken =
    await createGoogleAccessToken(
      serviceAccount
    );

  const url =
    `${getFirestoreRoot(
      projectId
    )}/${COLLECTION_NAME}/${encodeURIComponent(
      normalizedKey
    )}?updateMask.fieldPaths=status&updateMask.fieldPaths=updatedAt`;

  const response =
    await fetch(
      url,
      {
        method: 'PATCH',
        headers: {
          Authorization:
            `Bearer ${accessToken}`,
          'Content-Type':
            'application/json'
        },
        body:
          JSON.stringify({
            fields: {
              status:
                firestoreValue(
                  status
                ),

              updatedAt:
                firestoreValue(
                  new Date()
                    .toISOString()
                )
            }
          })
      }
    );

  if (!response.ok) {
    const payload =
      await response
        .json()
        .catch(() => ({}));

    throw new Error(
      `Unable to update payment event status. HTTP ${response.status}: ${
        text(
          payload?.error?.message
        )
      }`
    );
  }

  return true;
}

/**
 * Generates a stable idempotency key from
 * provider + provider event/order identifiers.
 *
 * The provider's own order/event identifier is preferred.
 */
function buildKey({
  provider = 'opay',
  providerEventId = '',
  outOrderNo = '',
  orderNo = '',
  eventType = ''
}) {
  const providerPart =
    text(provider)
      .trim()
      .toLowerCase();

  const eventPart =
    text(providerEventId)
      .trim();

  const externalPart =
    text(outOrderNo)
      .trim();

  const orderPart =
    text(orderNo)
      .trim();

  const typePart =
    text(eventType)
      .trim()
      .toLowerCase();

  const identity =
    eventPart ||
    orderPart ||
    externalPart;

  if (!identity) {
    throw new Error(
      'Cannot create an idempotency key without a provider event or order identifier.'
    );
  }

  /*
   * Keep the generated document ID within
   * Firestore's safe document-ID character set.
   */
  return normalizeKey(
    [
      providerPart,
      typePart,
      identity
    ]
      .filter(Boolean)
      .join(':')
  );
}

module.exports = {
  COLLECTION_NAME,
  normalizeKey,
  claim,
  updateStatus,
  buildKey
};
