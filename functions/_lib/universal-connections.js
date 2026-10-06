import {
  getFirestoreDataAtPath,
  setFirestoreDocumentAtPath
} from './firebase-admin.js';

const TYPES = new Set(['ai', 'http', 'webhook', 'tool', 'database']);
const PROTOCOLS = new Set(['openai-chat', 'http-json']);
const AUTH_MODES = new Set(['bearer', 'api-key', 'basic', 'none']);
const MAX_RESPONSE_BYTES = 1_000_000;
const DEFAULT_TIMEOUT_MS = 30_000;

function clean(value, max = 1200) {
  return String(value ?? '').trim().slice(0, max);
}

function ownerOf(user) {
  return {
    uid: clean(user?.uid || user?.sub, 180),
    email: clean(user?.email, 320).toLowerCase()
  };
}

function normalizeType(value) {
  const type = clean(value, 40).toLowerCase().replace(/[ _-]+/g, '-');
  if (type === 'ai-brain' || type === 'ai') return 'ai';
  if (type === 'http-api' || type === 'http') return 'http';
  if (type === 'tool-endpoint' || type === 'tool') return 'tool';
  if (type === 'legacy-http-database' || type === 'database') return 'database';
  if (type === 'webhook') return 'webhook';
  return type;
}

function normalizeProtocol(value, type) {
  const raw = clean(value, 40).toLowerCase().replace(/[ _]+/g, '-');
  if (PROTOCOLS.has(raw)) return raw;
  return normalizeType(type) === 'ai' ? 'openai-chat' : 'http-json';
}

function normalizeAuthMode(value) {
  const raw = clean(value, 40).toLowerCase().replace(/[_ ]+/g, '-');
  if (raw === 'apikey' || raw === 'x-api-key' || raw === 'api-key') return 'api-key';
  if (raw === 'bearer' || raw === 'basic' || raw === 'none') return raw;
  return 'none';
}

function assertSafeUrl(value, { required = true } = {}) {
  const raw = clean(value);
  if (!raw) {
    if (required) throw Object.assign(new Error('Connection endpoint is required.'), {
      status: 400, code: 'CONNECTION_ENDPOINT_REQUIRED'
    });
    return '';
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw Object.assign(new Error('Connection endpoint must be a valid URL.'), {
      status: 400, code: 'INVALID_CONNECTION_URL'
    });
  }

  if (!['https:', 'http:'].includes(parsed.protocol)) {
    throw Object.assign(new Error('Connection endpoint must use HTTP or HTTPS.'), {
      status: 400, code: 'INVALID_CONNECTION_PROTOCOL'
    });
  }

  const host = parsed.hostname.toLowerCase();
  const blockedNames = new Set([
    'localhost',
    'localhost.localdomain',
    'metadata.google.internal',
    'metadata',
    'host.docker.internal'
  ]);

  if (
    blockedNames.has(host) ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host === '169.254.169.254'
  ) {
    throw Object.assign(new Error('Private or local connection targets are not allowed.'), {
      status: 400, code: 'CONNECTION_TARGET_BLOCKED'
    });
  }

  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
    const parts = host.split('.').map(Number);
    const validOctets = parts.every(part => part >= 0 && part <= 255);
    if (validOctets) {
      const [a, b] = parts;
      const privateIp =
        a === 10 ||
        a === 127 ||
        a === 0 ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168);
      if (privateIp) {
        throw Object.assign(new Error('Private IP connection targets are not allowed.'), {
          status: 400, code: 'CONNECTION_TARGET_BLOCKED'
        });
      }
    }
  }

  if (parsed.username || parsed.password) {
    throw Object.assign(new Error('Credentials must be supplied through the connection authentication fields, not the URL.'), {
      status: 400, code: 'CONNECTION_CREDENTIALS_IN_URL'
    });
  }

  return parsed.toString();
}

function encodeBytes(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeBytes(value) {
  const binary = atob(String(value || ''));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function encryptionKey(env) {
  const raw = clean(env?.OVYX_CONNECTION_ENCRYPTION_KEY, 400);
  if (!raw) {
    throw Object.assign(
      new Error('Universal Connection secret encryption is not configured on the server.'),
      { status: 503, code: 'CONNECTION_SECRETS_NOT_CONFIGURED' }
    );
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptSecret(env, secret) {
  const value = clean(secret, 8000);
  if (!value) return null;
  const key = await encryptionKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(value)
  );
  return 'v1.' + encodeBytes(iv) + '.' + encodeBytes(new Uint8Array(cipher));
}

async function decryptSecret(env, encrypted) {
  if (!encrypted) return '';
  if (!String(encrypted).startsWith('v1.')) {
    throw Object.assign(
      new Error('Stored universal connection secret uses an unsupported format.'),
      { status: 500, code: 'CONNECTION_SECRET_FORMAT_INVALID' }
    );
  }
  const parts = String(encrypted).split('.');
  const key = await encryptionKey(env);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: decodeBytes(parts[1]) },
    key,
    decodeBytes(parts[2])
  );
  return new TextDecoder().decode(plain);
}

export function publicConnection(record, id) {
  const copy = { ...(record || {}) };
  delete copy.encryptedSecret;
  delete copy.secret;
  copy.id = clean(id || copy.id, 100);
  copy.hasSecret = !!record?.encryptedSecret;
  return copy;
}

export async function buildConnectionRecord(env, body, owner, existing = {}) {
  const type = normalizeType(body?.type || existing?.type || 'tool');
  if (!TYPES.has(type)) {
    throw Object.assign(
      new Error('Connection type must be ai, http, webhook, tool or database.'),
      { status: 400, code: 'INVALID_CONNECTION_TYPE' }
    );
  }

  const name = clean(body?.name || existing?.name, 120);
  if (!name) {
    throw Object.assign(
      new Error('Connection name is required.'),
      { status: 400, code: 'CONNECTION_NAME_REQUIRED' }
    );
  }

  const endpoint = assertSafeUrl(body?.endpoint || existing?.endpoint);
  const healthUrl =
    assertSafeUrl(
      body?.healthUrl || existing?.healthUrl || endpoint,
      { required: false }
    ) || endpoint;

  const protocol = normalizeProtocol(body?.protocol || existing?.protocol, type);
  const authMode = normalizeAuthMode(body?.authMode || existing?.authMode);

  let encryptedSecret = existing?.encryptedSecret || null;
  const secretProvided = Object.prototype.hasOwnProperty.call(body || {}, 'secret');

  if (secretProvided) {
    const rawSecret = clean(body?.secret, 8000);
    encryptedSecret = rawSecret ? await encryptSecret(env, rawSecret) : null;
  }

  if (authMode !== 'none' && !encryptedSecret) {
    throw Object.assign(
      new Error('This connection authentication mode requires a server secret.'),
      { status: 400, code: 'CONNECTION_SECRET_REQUIRED' }
    );
  }

  return {
    name,
    type,
    endpoint,
    healthUrl,
    active: body?.active !== false,
    protocol,
    authMode,
    model: clean(body?.model || existing?.model, 180) || null,
    ownerUid: owner.uid,
    ownerEmail: owner.email,
    encryptedSecret,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export async function getConnection(env, user, id) {
  const { uid, email } = ownerOf(user);
  if (!uid || !email) {
    throw Object.assign(
      new Error('Authenticated workspace identity is required.'),
      { status: 401, code: 'AUTH_IDENTITY_REQUIRED' }
    );
  }

  const safeId = clean(id, 100);
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(safeId)) {
    throw Object.assign(
      new Error('Connection ID is invalid.'),
      { status: 400, code: 'INVALID_CONNECTION_ID' }
    );
  }

  const record = await getFirestoreDataAtPath(
    env,
    ['users', email, 'universal_connections', safeId]
  );

  if (!record) {
    throw Object.assign(
      new Error('Connection not found.'),
      { status: 404, code: 'CONNECTION_NOT_FOUND' }
    );
  }

  if (record.ownerUid !== uid || record.ownerEmail !== email) {
    throw Object.assign(
      new Error('Connection does not belong to this account.'),
      { status: 403, code: 'CONNECTION_ACCESS_DENIED' }
    );
  }

  if (record.active !== true) {
    throw Object.assign(
      new Error('This Universal Connection is inactive.'),
      { status: 409, code: 'CONNECTION_INACTIVE' }
    );
  }

  return { id: safeId, record };
}

function applyAuth(headers, authMode, secret) {
  if (authMode === 'bearer') {
    headers.Authorization = 'Bearer ' + secret;
  } else if (authMode === 'api-key') {
    headers['X-API-Key'] = secret;
  } else if (authMode === 'basic') {
    const separator = secret.indexOf(':');
    const username = separator >= 0 ? secret.slice(0, separator) : secret;
    const password = separator >= 0 ? secret.slice(separator + 1) : '';
    headers.Authorization = 'Basic ' + btoa(username + ':' + password);
  }
}

function openAiEndpoint(endpoint) {
  const url = String(endpoint).replace(/\/+$/, '');
  return /\/chat\/completions$/i.test(url) ? url : url + '/chat/completions';
}

function extractResponseText(payload) {
  if (!payload) return '';
  if (typeof payload === 'string') return payload;
  if (typeof payload.output_text === 'string') return payload.output_text;
  if (typeof payload.text === 'string') return payload.text;

  const choice = payload?.choices?.[0];
  if (typeof choice?.message?.content === 'string') return choice.message.content;
  if (Array.isArray(choice?.message?.content)) {
    return choice.message.content.map(x => x?.text || '').join('');
  }

  if (Array.isArray(payload?.content)) {
    return payload.content.map(x => x?.text || '').join('');
  }

  if (Array.isArray(payload?.candidates?.[0]?.content?.parts)) {
    return payload.candidates[0].content.parts.map(x => x?.text || '').join('');
  }

  return '';
}

async function responseJson(response) {
  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) {
    throw Object.assign(
      new Error('Universal Connection response is too large.'),
      { status: 502, code: 'CONNECTION_RESPONSE_TOO_LARGE' }
    );
  }
  try {
    return { data: JSON.parse(text), raw: text };
  } catch {
    return { data: text, raw: text };
  }
}

async function requestConnection(record, input, env) {
  const timeoutMs = Math.min(
    Math.max(Number(env?.OVYX_CONNECTION_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS, 5000),
    60_000
  );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'User-Agent': 'OVYX-Universal-Connection/1.0'
  };
  const secret = await decryptSecret(env, record.encryptedSecret);
  applyAuth(headers, record.authMode, secret);

  try {
    const payload = input?.payload && typeof input.payload === 'object'
      ? input.payload
      : {
          messages: Array.isArray(input?.messages) ? input.messages : [],
          prompt: clean(input?.prompt, 50_000),
          system: clean(input?.system, 40_000),
          model: clean(input?.model || record.model, 180) || undefined
        };

    const url = record.protocol === 'openai-chat'
      ? openAiEndpoint(record.endpoint)
      : record.endpoint;

    const method = clean(input?.method || 'POST', 10).toUpperCase();
    const response = await fetch(url, {
      method,
      headers,
      body: method === 'GET' || method === 'HEAD' ? undefined : JSON.stringify(payload),
      signal: controller.signal,
      redirect: 'manual'
    });

    const parsed = await responseJson(response);

    if (!response.ok) {
      throw Object.assign(
        new Error(
          parsed?.data?.error?.message ||
          parsed?.data?.message ||
          'Universal Connection upstream request failed with HTTP ' + response.status
        ),
        {
          status: response.status,
          code: 'CONNECTION_UPSTREAM_FAILED',
          providerPayload: parsed.data
        }
      );
    }

    return {
      text: extractResponseText(parsed.data),
      data: parsed.data,
      status: response.status
    };
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw Object.assign(
        new Error('Universal Connection request timed out.'),
        { status: 504, code: 'CONNECTION_TIMEOUT' }
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function callUserUniversalConnection(
  env,
  { connectionId, authUser, system, user, model, maxTokens }
) {
  const { record, id } = await getConnection(env, authUser, connectionId);

  if (!['ai', 'http', 'tool', 'database', 'webhook'].includes(record.type)) {
    throw Object.assign(
      new Error('This Universal Connection type cannot act as an AI Brain.'),
      { status: 400, code: 'CONNECTION_NOT_AI_CAPABLE' }
    );
  }

  const messages = [];
  if (clean(system)) {
    messages.push({
      role: 'system',
      content: clean(system, 40_000)
    });
  }
  messages.push({
    role: 'user',
    content: clean(user, 50_000)
  });

  const result = await requestConnection(
    record,
    {
      messages,
      prompt: user,
      system,
      model,
      maxTokens
    },
    env
  );

  if (!result.text && record.protocol === 'openai-chat') {
    throw Object.assign(
      new Error('Universal Connection returned no text content.'),
      { status: 502, code: 'CONNECTION_EMPTY_RESPONSE' }
    );
  }

  return {
    provider: 'connection:' + id,
    routedProvider: 'universal-connection',
    model: clean(model || record.model, 180) || null,
    text: result.text || (typeof result.data === 'string' ? result.data : JSON.stringify(result.data)),
    raw: result.data,
    rawUsage: result.data?.usage || null
  };
}

export async function testUserConnection(env, user, id) {
  const { record } = await getConnection(env, user, id);
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  const headers = {
    Accept: 'application/json',
    'User-Agent': 'OVYX-Connection-Check/1.0'
  };
  const secret = await decryptSecret(env, record.encryptedSecret);
  applyAuth(headers, record.authMode, secret);

  try {
    const response = await fetch(
      record.healthUrl || record.endpoint,
      {
        method: 'GET',
        headers,
        redirect: 'manual',
        signal: controller.signal
      }
    );
    return {
      ok: response.status >= 200 && response.status < 500,
      status: response.status,
      latencyMs: Date.now() - started
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      latencyMs: Date.now() - started,
      error: error?.name === 'AbortError' ? 'timeout' : 'unreachable'
    };
  } finally {
    clearTimeout(timer);
  }
}
