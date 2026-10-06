import {
  getFirestoreDocumentAtPath,
  getFirestoreDataAtPath,
} from './firebase-admin.js';

function clean(value, max = 400) {
  return String(value ?? '').trim().slice(0, max);
}

function denyPrivateHost(url) {
  const hostname = String(url.hostname || '').toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname === '0.0.0.0' ||
    hostname === '::1' ||
    /^127(?:\.|$)/.test(hostname) ||
    /^10(?:\.|$)/.test(hostname) ||
    /^192\.168(?:\.|$)/.test(hostname) ||
    /^169\.254(?:\.|$)/.test(hostname) ||
    /^172\.(?:1[6-9]|2\d|3[0-1])\./.test(hostname) ||
    /^(?:fc|fd)[0-9a-f]{2}:/i.test(hostname) ||
    /^fe80:/i.test(hostname)
  ) {
    throw Object.assign(new Error('Private or local network endpoints are not allowed.'), {
      status: 400, code: 'CONNECTION_PRIVATE_HOST_DENIED'
    });
  }
}

function resolveUrl(endpoint, path = '') {
  let url;
  try { url = new URL(clean(endpoint, 2000)); }
  catch {
    throw Object.assign(new Error('Connection endpoint is not a valid URL.'), {
      status: 400, code: 'INVALID_CONNECTION_URL'
    });
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw Object.assign(new Error('Connection endpoint must use HTTP or HTTPS.'), {
      status: 400, code: 'INVALID_CONNECTION_PROTOCOL'
    });
  }
  denyPrivateHost(url);
  if (clean(path, 1000)) {
    try {
      url = new URL(clean(path, 1000), url);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('invalid');
      denyPrivateHost(url);
    } catch (error) {
      if (error?.code === 'CONNECTION_PRIVATE_HOST_DENIED') throw error;
      throw Object.assign(new Error('Connection request path is invalid.'), {
        status: 400, code: 'INVALID_CONNECTION_PATH'
      });
    }
  }
  return url;
}

async function deriveKey(secret) {
  const value = clean(secret, 4096);
  if (value.length < 32) {
    throw Object.assign(new Error('OVYX connection encryption is not configured.'), {
      status: 503, code: 'CONNECTION_ENCRYPTION_NOT_CONFIGURED'
    });
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt','decrypt']);
}

function b64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function unb64(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function encryptConnectionSecret(env, secret) {
  const value = clean(secret, 12000);
  if (!value) return null;
  const key = await deriveKey(env?.OVYX_CONNECTION_ENCRYPTION_KEY);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(value)
  );
  return { v: 1, alg: 'AES-GCM', iv: b64(iv), data: b64(new Uint8Array(cipher)) };
}

export async function decryptConnectionSecret(env, record) {
  if (!record?.encrypted?.data || !record?.encrypted?.iv) return '';
  const key = await deriveKey(env?.OVYX_CONNECTION_ENCRYPTION_KEY);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: unb64(record.encrypted.iv) },
    key,
    unb64(record.encrypted.data)
  );
  return new TextDecoder().decode(plain);
}

export function connectionPath(user, id) {
  const email = clean(user?.email, 320).toLowerCase();
  const uid = clean(user?.uid || user?.sub, 180);
  const safeId = clean(id, 100);
  if (!email || !uid || !safeId) {
    throw Object.assign(new Error('Authenticated connection identity is incomplete.'), {
      status: 401, code: 'AUTH_IDENTITY_REQUIRED'
    });
  }
  return ['users', email, 'universal_connections', safeId];
}

export async function loadConnection(env, user, id) {
  const path = connectionPath(user, id);
  const doc = await getFirestoreDocumentAtPath(env, path);
  if (!doc) throw Object.assign(new Error('Connection not found.'), {
    status: 404, code: 'CONNECTION_NOT_FOUND'
  });
  const record = await getFirestoreDataAtPath(env, path) || {};
  const email = clean(user?.email, 320).toLowerCase();
  const uid = clean(user?.uid || user?.sub, 180);
  if (record.ownerUid !== uid || clean(record.ownerEmail, 320).toLowerCase() !== email) {
    throw Object.assign(new Error('Connection does not belong to this account.'), {
      status: 403, code: 'CONNECTION_ACCESS_DENIED'
    });
  }
  return { path, doc, record, id: safeId(id) };
}

function safeId(value) {
  return clean(value, 100);
}

function authHeaders(authMode, secret) {
  const mode = clean(authMode, 40).toLowerCase();
  if (!secret) return {};
  if (mode === 'bearer') return { Authorization: 'Bearer ' + secret };
  if (mode === 'api-key') return { 'X-API-Key': secret };
  if (mode === 'basic') return { Authorization: 'Basic ' + secret };
  return {};
}

function parseProviderText(data) {
  const candidates = [
    data?.output_text,
    data?.answer,
    data?.text,
    data?.message?.content,
    data?.choices?.[0]?.message?.content,
    data?.candidates?.[0]?.content?.parts?.map(x => x?.text || '').join(''),
    data?.content?.filter?.(x => x?.type === 'text').map?.(x => x?.text || '').join('')
  ];
  return String(candidates.find(Boolean) || '').trim();
}

export async function executeUniversalConnection(env, user, id, {
  action = 'execute',
  method = '',
  path = '',
  body = null,
  headers = {}
} = {}) {
  const loaded = await loadConnection(env, user, id);
  const record = loaded.record;
  if (action === 'chat' && record.type !== 'ai') {
    throw Object.assign(new Error('Only AI Brain connections can handle chat requests.'), {
      status: 400, code: 'CONNECTION_NOT_AI'
    });
  }

  const url = resolveUrl(record.endpoint, path);
  const secret = await decryptConnectionSecret(env, record);
  const requestMethod = clean(method || record.method || ((record.type === 'ai' || record.type === 'api') ? 'POST' : 'GET'), 12).toUpperCase();
  const requestHeaders = {
    Accept: 'application/json, text/plain;q=0.9, */*;q=0.8',
    'User-Agent': 'OVYX-Universal-Connection/1.0',
    ...authHeaders(record.authMode, secret),
    ...(headers && typeof headers === 'object' ? headers : {})
  };
  const init = { method: requestMethod, headers: requestHeaders };
  if (!['GET','HEAD'].includes(requestMethod) && body !== null && body !== undefined) {
    requestHeaders['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  const started = Date.now();
  let response;
  try {
    response = await fetch(url, { ...init, redirect: 'manual', signal: controller.signal });
  } catch (error) {
    throw Object.assign(new Error(error?.name === 'AbortError'
      ? 'Connection request timed out.'
      : 'Connection request could not be completed.'), {
      status: 502,
      code: error?.name === 'AbortError' ? 'CONNECTION_TIMEOUT' : 'CONNECTION_NETWORK_ERROR'
    });
  } finally {
    clearTimeout(timer);
  }

  const raw = await response.text();
  const clipped = raw.slice(0, 1000000);
  let parsed = null;
  try { parsed = JSON.parse(clipped); } catch { parsed = null; }

  const result = {
    ok: response.ok,
    status: response.status,
    latencyMs: Date.now() - started,
    contentType: response.headers.get('content-type') || '',
    data: parsed ?? clipped
  };

  if (!response.ok) {
    throw Object.assign(new Error('Connected service returned HTTP ' + response.status + '.'), {
      status: 502, code: 'CONNECTION_UPSTREAM_ERROR', result
    });
  }

  if (action === 'chat') {
    return {
      ...result,
      text: parseProviderText(parsed ?? {}),
      provider: 'universal-connection',
      model: record.model || null,
      rawUsage: parsed?.usage || parsed?.usageMetadata || null
    };
  }

  return result;
}
