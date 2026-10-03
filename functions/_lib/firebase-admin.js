/**
 * OVYX Firebase Admin REST Layer
 * Phase 2 + Phase 3
 *
 * Cloudflare Pages Functions / Workers compatible.
 * Uses a Firebase service account through OAuth2 + Firestore REST.
 */

const FIRESTORE_SCOPE =
  'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/devstorage.full_control';

let cachedAccessToken = null;
let cachedAccessTokenExpiresAt = 0;

function base64UrlEncode(bytes) {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
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
    normalized + '='.repeat((4 - normalized.length % 4) % 4);

  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function pemToArrayBuffer(pem) {
  const normalized = String(pem)
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');

  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes.buffer;
}

async function signJwtRS256(header, payload, privateKeyPem) {
  const headerPart = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify(header))
  );

  const payloadPart = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify(payload))
  );

  const signingInput = `${headerPart}.${payloadPart}`;

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(privateKeyPem),
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256'
    },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  return `${signingInput}.${base64UrlEncode(
    new Uint8Array(signature)
  )}`;
}

function parseServiceAccount(env) {
  const raw =
    env?.FIREBASE_SERVICE_ACCOUNT_JSON ||
    env?.FIREBASE_SERVICE_ACCOUNT;

  if (!raw) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_JSON is not configured.'
    );
  }

  let account;

  try {
    account =
      typeof raw === 'string'
        ? JSON.parse(raw)
        : raw;
  } catch {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_JSON is invalid JSON.'
    );
  }

  if (
    !account ||
    !account.client_email ||
    !account.private_key ||
    !account.project_id
  ) {
    throw new Error(
      'Firebase service account is missing required fields.'
    );
  }

  return account;
}

async function getGoogleAccessToken(env) {
  const now = Date.now();

  if (
    cachedAccessToken &&
    cachedAccessTokenExpiresAt > now + 60_000
  ) {
    return cachedAccessToken;
  }

  const serviceAccount = parseServiceAccount(env);

  const issuedAt = Math.floor(now / 1000);

  const assertion = await signJwtRS256(
    {
      alg: 'RS256',
      typ: 'JWT'
    },
    {
      iss: serviceAccount.client_email,
      scope: FIRESTORE_SCOPE,
      aud: 'https://oauth2.googleapis.com/token',
      iat: issuedAt,
      exp: issuedAt + 3600
    },
    serviceAccount.private_key
  );

  const response = await fetch(
    'https://oauth2.googleapis.com/token',
    {
      method: 'POST',
      headers: {
        'content-type':
          'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type:
          'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion
      })
    }
  );

  if (!response.ok) {
    throw new Error(
      `Google OAuth token exchange failed (${response.status}).`
    );
  }

  const data = await response.json();

  if (!data.access_token) {
    throw new Error(
      'Google OAuth response did not contain an access token.'
    );
  }

  cachedAccessToken = data.access_token;

  cachedAccessTokenExpiresAt =
    now + Number(data.expires_in || 3600) * 1000;

  return cachedAccessToken;
}

function firestoreBaseUrl(projectId) {
  return (
    `https://firestore.googleapis.com/v1/projects/` +
    `${encodeURIComponent(projectId)}` +
    `/databases/(default)/documents`
  );
}

function firestoreValue(value) {
  if (value === null) {
    return { nullValue: null };
  }

  if (typeof value === 'boolean') {
    return { booleanValue: value };
  }

  if (typeof value === 'number') {
    if (
      Number.isInteger(value) &&
      Number.isSafeInteger(value)
    ) {
      return { integerValue: String(value) };
    }

    return { doubleValue: value };
  }

  if (typeof value === 'string') {
    return { stringValue: value };
  }

  if (value instanceof Date) {
    return {
      timestampValue: value.toISOString()
    };
  }

  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map(firestoreValue)
      }
    };
  }

  if (typeof value === 'object') {
    const fields = {};

    for (const [key, nestedValue] of Object.entries(value)) {
      fields[key] = firestoreValue(nestedValue);
    }

    return {
      mapValue: {
        fields
      }
    };
  }

  return {
    stringValue: String(value)
  };
}

function firestoreDocument(fields = {}) {
  const result = {};

  for (const [key, value] of Object.entries(fields)) {
    result[key] = firestoreValue(value);
  }

  return { fields: result };
}

function firestoreValueToJs(value) {
  if (!value) return null;

  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;

  if ('integerValue' in value) {
    const number = Number(value.integerValue);

    return Number.isSafeInteger(number)
      ? number
      : value.integerValue;
  }

  if ('doubleValue' in value) {
    return value.doubleValue;
  }

  if ('timestampValue' in value) {
    return value.timestampValue;
  }

  if ('arrayValue' in value) {
    return (value.arrayValue.values || [])
      .map(firestoreValueToJs);
  }

  if ('mapValue' in value) {
    const result = {};

    for (
      const [key, nestedValue] of Object.entries(
        value.mapValue.fields || {}
      )
    ) {
      result[key] = firestoreValueToJs(nestedValue);
    }

    return result;
  }

  return null;
}

export function firestoreDocumentToJs(document) {
  const result = {};

  for (
    const [key, value] of Object.entries(
      document?.fields || {}
    )
  ) {
    result[key] = firestoreValueToJs(value);
  }

  return result;
}

export async function getFirestoreDocument(
  env,
  collection,
  documentId
) {
  const serviceAccount = parseServiceAccount(env);
  const accessToken =
    await getGoogleAccessToken(env);

  const url =
    `${firestoreBaseUrl(serviceAccount.project_id)}/` +
    `${encodeURIComponent(collection)}/` +
    `${encodeURIComponent(documentId)}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(
      `Firestore document read failed (${response.status}).`
    );
  }

  return response.json();
}

export async function getFirestoreData(
  env,
  collection,
  documentId
) {
  const document =
    await getFirestoreDocument(
      env,
      collection,
      documentId
    );

  return document
    ? firestoreDocumentToJs(document)
    : null;
}

export async function listFirestoreDocuments(
  env,
  collection,
  pageSize = 100,
  pageToken = null
) {
  const serviceAccount = parseServiceAccount(env);
  const accessToken = await getGoogleAccessToken(env);

  const normalizedPageSize = Math.min(
    Math.max(Number(pageSize) || 100, 1),
    1000
  );

  const params = new URLSearchParams({
    pageSize: String(normalizedPageSize)
  });

  if (pageToken) {
    params.set('pageToken', String(pageToken));
  }

  const url =
    `${firestoreBaseUrl(serviceAccount.project_id)}\/${encodeURIComponent(collection)}?${params.toString()}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    const text = await response.text();

    console.error(
      '[OVYX FIRESTORE LIST]',
      response.status,
      text.slice(0, 500)
    );

    throw new Error(
      `Firestore document list failed (${response.status}).`
    );
  }

  const data = await response.json();

  const documents = Array.isArray(data.documents)
    ? data.documents.map(document => {
        const value = firestoreDocumentToJs(document);
        const name = String(document?.name || '');
        const id = name.split('/').pop() || '';

        return {
          ...value,
          id
        };
      })
    : [];

  return {
    documents,
    nextPageToken: data.nextPageToken || null
  };
}

export async function addFirestoreDocument(
  env,
  collection,
  data,
  documentId = crypto.randomUUID()
) {
  if (
    !/^[A-Za-z0-9_-]{1,160}$/.test(
      String(documentId)
    )
  ) {
    throw new Error(
      'Firestore document ID is invalid.'
    );
  }

  await setFirestoreDocument(
    env,
    collection,
    documentId,
    data,
    { merge: false }
  );

  return documentId;
}

export async function setFirestoreDocument(
  env,
  collection,
  documentId,
  data,
  { merge = true } = {}
) {
  const serviceAccount = parseServiceAccount(env);
  const accessToken =
    await getGoogleAccessToken(env);

  const url =
    `${firestoreBaseUrl(serviceAccount.project_id)}/` +
    `${encodeURIComponent(collection)}/` +
    `${encodeURIComponent(documentId)}`;

  const body = firestoreDocument(data);

  let requestUrl = url;

  if (merge) {
    const fieldPaths = Object.keys(data);

    const params = new URLSearchParams();

    for (const fieldPath of fieldPaths) {
      params.append(
        'updateMask.fieldPaths',
        fieldPath
      );
    }

    requestUrl = `${url}?${params.toString()}`;
  }

  const response = await fetch(requestUrl, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();

    console.error(
      '[OVYX FIRESTORE WRITE]',
      response.status,
      text.slice(0, 500)
    );

    throw new Error(
      `Firestore document write failed (${response.status}).`
    );
  }

  return response.json();
}

export async function createFirestoreDocument(
  env,
  collection,
  documentId,
  data
) {
  return setFirestoreDocument(
    env,
    collection,
    documentId,
    data,
    { merge: false }
  );
}


export async function setFirestoreDocumentIfCurrent(
  env,
  collection,
  documentId,
  data,
  updateTime
) {
  const serviceAccount = parseServiceAccount(env);
  const accessToken = await getGoogleAccessToken(env);

  if (!updateTime) {
    throw Object.assign(
      new Error('Firestore update precondition is missing.'),
      { status: 400, code: 'FIRESTORE_PRECONDITION_REQUIRED' }
    );
  }

  const url =
    `${firestoreBaseUrl(serviceAccount.project_id)}/` +
    `${encodeURIComponent(collection)}/` +
    `${encodeURIComponent(documentId)}`;

  const params = new URLSearchParams({
    'currentDocument.updateTime': String(updateTime),
  });

  for (const fieldPath of Object.keys(data)) {
    params.append('updateMask.fieldPaths', fieldPath);
  }

  const response = await fetch(`${url}?${params.toString()}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(firestoreDocument(data)),
  });

  if (response.status === 409) {
    throw Object.assign(
      new Error('Firestore document changed concurrently.'),
      { status: 409, code: 'FIRESTORE_PRECONDITION_FAILED' }
    );
  }

  if (!response.ok) {
    const text = await response.text();
    console.error(
      '[OVYX FIRESTORE CONDITIONAL WRITE]',
      response.status,
      text.slice(0, 500)
    );
    throw Object.assign(
      new Error(`Firestore conditional write failed (${response.status}).`),
      { status: 503, code: 'FIRESTORE_CONDITIONAL_WRITE_FAILED' }
    );
  }

  return response.json();
}

function encodeFirestorePath(pathValue) {
  return String(pathValue || '')
    .split('/')
    .filter(Boolean)
    .map(segment => encodeURIComponent(segment))
    .join('/');
}

async function firestoreListCollectionIds(env, parentPath) {
  const serviceAccount = parseServiceAccount(env);
  const accessToken = await getGoogleAccessToken(env);

  let pageToken = null;
  const collectionIds = [];

  do {
    const params = new URLSearchParams({ pageSize: '1000' });
    if (pageToken) params.set('pageToken', pageToken);

    const url =
      `${firestoreBaseUrl(serviceAccount.project_id)}/` +
      `${encodeFirestorePath(parentPath)}:listCollectionIds?${params.toString()}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: '{}',
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Firestore collection enumeration failed (${response.status}): ${text.slice(0, 300)}`
      );
    }

    const data = await response.json();
    for (const id of data.collectionIds || []) collectionIds.push(String(id));
    pageToken = data.nextPageToken || null;
  } while (pageToken);

  return collectionIds;
}

async function firestoreListChildDocuments(env, parentPath, collectionId) {
  const serviceAccount = parseServiceAccount(env);
  const accessToken = await getGoogleAccessToken(env);

  let pageToken = null;
  const documents = [];

  do {
    const params = new URLSearchParams({ pageSize: '1000' });
    if (pageToken) params.set('pageToken', pageToken);

    const path =
      `${parentPath}/${collectionId}`;

    const url =
      `${firestoreBaseUrl(serviceAccount.project_id)}/` +
      `${encodeFirestorePath(path)}?${params.toString()}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (response.status === 404) return documents;

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Firestore child document enumeration failed (${response.status}): ${text.slice(0, 300)}`
      );
    }

    const data = await response.json();
    for (const document of data.documents || []) {
      if (document?.name) documents.push(String(document.name));
    }
    pageToken = data.nextPageToken || null;
  } while (pageToken);

  return documents;
}

async function deleteFirestoreDocumentPath(env, relativePath) {
  const serviceAccount = parseServiceAccount(env);
  const accessToken = await getGoogleAccessToken(env);

  const url =
    `${firestoreBaseUrl(serviceAccount.project_id)}/` +
    encodeFirestorePath(relativePath);

  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (response.status === 404) return false;

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Firestore document deletion failed (${response.status}): ${text.slice(0, 300)}`
    );
  }

  return true;
}

async function deleteFirestoreTreeByPath(env, relativePath) {
  let deleted = 0;

  const collectionIds = await firestoreListCollectionIds(
    env,
    relativePath
  );

  for (const collectionId of collectionIds) {
    const children = await firestoreListChildDocuments(
      env,
      relativePath,
      collectionId
    );

    for (const fullName of children) {
      const marker = '/documents/';
      const index = fullName.indexOf(marker);
      const childPath = index >= 0
        ? fullName.slice(index + marker.length)
        : fullName;

      deleted += await deleteFirestoreTreeByPath(env, childPath);
    }
  }

  if (await deleteFirestoreDocumentPath(env, relativePath)) {
    deleted += 1;
  }

  return deleted;
}

export async function deleteFirestoreDocumentTree(
  env,
  collection,
  documentId
) {
  const path =
    `${String(collection || '').trim()}/${String(documentId || '').trim()}`;

  return deleteFirestoreTreeByPath(env, path);
}

async function storageBucket(env) {
  if (String(env?.FIREBASE_STORAGE_BUCKET || '').trim()) {
    return String(env.FIREBASE_STORAGE_BUCKET).trim();
  }

  const serviceAccount = parseServiceAccount(env);
  return `${serviceAccount.project_id}.firebasestorage.app`;
}

export async function deleteStoragePrefix(
  env,
  prefix
) {
  const serviceAccount = parseServiceAccount(env);
  const accessToken = await getGoogleAccessToken(env);
  const bucket = await storageBucket(env);
  const objectPrefix = String(prefix || '').replace(/^\/+/, '');

  let pageToken = null;
  let deleted = 0;

  do {
    const params = new URLSearchParams({
      prefix: objectPrefix,
      maxResults: '1000',
    });
    if (pageToken) params.set('pageToken', pageToken);

    const listUrl =
      `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o?${params.toString()}`;

    const response = await fetch(listUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (response.status === 404) return 0;

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Firebase Storage cleanup enumeration failed (${response.status}): ${text.slice(0, 300)}`
      );
    }

    const data = await response.json();

    for (const object of data.items || []) {
      const name = String(object?.name || '');
      if (!name) continue;

      const deleteUrl =
        `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(name)}`;

      const deletion = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (deletion.status === 404) continue;

      if (!deletion.ok) {
        const text = await deletion.text();
        throw new Error(
          `Firebase Storage object deletion failed (${deletion.status}): ${text.slice(0, 300)}`
        );
      }

      deleted += 1;
    }

    pageToken = data.nextPageToken || null;
  } while (pageToken);

  return deleted;
}
