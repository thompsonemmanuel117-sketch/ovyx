'use strict';

const TOKEN_CACHE = new Map();

function base64UrlEncode(value) {
  let bytes;

  if (value instanceof Uint8Array) {
    bytes = value;
  } else {
    bytes = new TextEncoder().encode(String(value));
  }

  let binary = '';

  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecodeToBytes(value) {
  const normalized = String(value)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const padded =
    normalized + '='.repeat((4 - (normalized.length % 4)) % 4);

  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function pemToArrayBuffer(pem) {
  const normalized = String(pem || '')
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');

  if (!normalized) {
    throw new Error('Service-account private key is empty.');
  }

  return base64UrlDecodeToBytes(
    normalized
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
  ).buffer;
}

async function importPrivateKey(privateKeyPem) {
  return crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(privateKeyPem),
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256'
    },
    false,
    ['sign']
  );
}

async function createServiceAccountAssertion(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);

  const header = {
    alg: 'RS256',
    typ: 'JWT'
  };

  const claims = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  };

  const encodedHeader = base64UrlEncode(
    JSON.stringify(header)
  );

  const encodedClaims = base64UrlEncode(
    JSON.stringify(claims)
  );

  const unsignedToken =
    `${encodedHeader}.${encodedClaims}`;

  const privateKey = await importPrivateKey(
    serviceAccount.private_key
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(unsignedToken)
  );

  return `${unsignedToken}.${base64UrlEncode(
    new Uint8Array(signature)
  )}`;
}

function parseServiceAccount(raw) {
  let parsed;

  try {
    parsed =
      typeof raw === 'string'
        ? JSON.parse(raw)
        : raw;
  } catch {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.'
    );
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !parsed.client_email ||
    !parsed.private_key ||
    !parsed.project_id
  ) {
    throw new Error(
      'Firebase service-account configuration is incomplete.'
    );
  }

  return parsed;
}

async function getServiceAccountAccessToken(env) {
  const serviceAccount =
    parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT_JSON);

  const cacheKey =
    `${serviceAccount.client_email}:${serviceAccount.project_id}`;

  const cached = TOKEN_CACHE.get(cacheKey);

  if (
    cached &&
    cached.accessToken &&
    cached.expiresAt > Date.now() + 60_000
  ) {
    return {
      accessToken: cached.accessToken,
      projectId: serviceAccount.project_id
    };
  }

  const assertion =
    await createServiceAccountAssertion(serviceAccount);

  const tokenResponse = await fetch(
    'https://oauth2.googleapis.com/token',
    {
      method: 'POST',
      headers: {
        'Content-Type':
          'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body:
        `grant_type=${encodeURIComponent(
          'urn:ietf:params:oauth:grant-type:jwt-bearer'
        )}` +
        `&assertion=${encodeURIComponent(assertion)}`
    }
  );

  let payload = {};

  try {
    payload = await tokenResponse.json();
  } catch {
    payload = {};
  }

  if (!tokenResponse.ok || !payload.access_token) {
    throw new Error(
      'Firebase service-account OAuth authentication failed.'
    );
  }

  const expiresIn =
    Number(payload.expires_in) || 3600;

  TOKEN_CACHE.set(cacheKey, {
    accessToken: payload.access_token,
    expiresAt:
      Date.now() +
      Math.max(60, expiresIn - 60) * 1000
  });

  return {
    accessToken: payload.access_token,
    projectId: serviceAccount.project_id
  };
}

function firestoreValue(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  if ('stringValue' in value) {
    return value.stringValue;
  }

  if ('integerValue' in value) {
    return Number(value.integerValue);
  }

  if ('doubleValue' in value) {
    return Number(value.doubleValue);
  }

  if ('booleanValue' in value) {
    return value.booleanValue === true;
  }

  if ('timestampValue' in value) {
    return value.timestampValue;
  }

  if ('nullValue' in value) {
    return null;
  }

  if ('arrayValue' in value) {
    return Array.isArray(value.arrayValue?.values)
      ? value.arrayValue.values.map(firestoreValue)
      : [];
  }

  if ('mapValue' in value) {
    return firestoreFieldsToObject(
      value.mapValue?.fields || {}
    );
  }

  return null;
}

function firestoreFieldsToObject(fields) {
  const result = {};

  for (const [key, value] of Object.entries(
    fields || {}
  )) {
    result[key] = firestoreValue(value);
  }

  return result;
}

function firestoreDocumentToObject(document) {
  if (!document) {
    return null;
  }

  return {
    id:
      String(
        document.name?.split('/').pop() || ''
      ),
    ...firestoreFieldsToObject(
      document.fields || {}
    )
  };
}

async function getFirestoreDocument(
  env,
  collection,
  documentId
) {
  const { accessToken, projectId } =
    await getServiceAccountAccessToken(env);

  const encodedCollection =
    encodeURIComponent(collection);

  const encodedDocument =
    encodeURIComponent(documentId);

  const url =
    `https://firestore.googleapis.com/v1/projects/` +
    `${encodeURIComponent(projectId)}` +
    `/databases/(default)/documents/` +
    `${encodedCollection}/${encodedDocument}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    }
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(
      `Firestore document request failed with HTTP ${response.status}.`
    );
  }

  const document = await response.json();

  return firestoreDocumentToObject(document);
}

async function listFirestoreDocuments(
  env,
  collection,
  pageSize = 100
) {
  const { accessToken, projectId } =
    await getServiceAccountAccessToken(env);

  const url =
    `https://firestore.googleapis.com/v1/projects/` +
    `${encodeURIComponent(projectId)}` +
    `/databases/(default)/documents/` +
    `${encodeURIComponent(collection)}` +
    `?pageSize=${Math.min(Math.max(pageSize, 1), 100)}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(
      `Firestore collection request failed with HTTP ${response.status}.`
    );
  }

  const payload = await response.json();

  return {
    documents: Array.isArray(payload.documents)
      ? payload.documents
          .map(firestoreDocumentToObject)
          .filter(Boolean)
      : [],
    nextPageToken:
      payload.nextPageToken || null
  };
}

module.exports = {
  getServiceAccountAccessToken,
  getFirestoreDocument,
  listFirestoreDocuments
};
