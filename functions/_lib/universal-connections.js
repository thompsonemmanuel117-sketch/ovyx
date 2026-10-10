import {
  getFirestoreDataAtPath,
  setFirestoreDocumentAtPath
} from './firebase-admin.js';

const TYPES = new Set(['ai', 'http', 'webhook', 'tool', 'database']);
const AI_PROTOCOLS = new Set(['openai-chat', 'anthropic-messages', 'gemini-generate-content']);
const PROTOCOLS = new Set([...AI_PROTOCOLS, 'http-json']);
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
  if (type === 'http-api' || type === 'http' || type === 'api') return 'http';
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

export function supportsAIProtocol(value) {
  return AI_PROTOCOLS.has(clean(value, 40).toLowerCase().replace(/[ _]+/g, '-'));
}

function normalizeAuthMode(value) {
  const raw = clean(value, 40).toLowerCase().replace(/[_ ]+/g, '-');
  if (raw === 'apikey' || raw === 'x-api-key' || raw === 'api-key') return 'api-key';
  if (raw === 'bearer' || raw === 'basic' || raw === 'none') return raw;
  return 'none';
}

function assertSafeUrl(value, { required = true, requireHttps = false } = {}) {
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
  if (requireHttps && parsed.protocol !== 'https:') {
    throw Object.assign(new Error('AI endpoints and credential-bearing connections must use HTTPS.'), {
      status: 400, code: 'CONNECTION_HTTPS_REQUIRED'
    });
  }
  for (const parameter of parsed.searchParams.keys()) {
    if (/(?:api[-_]?key|token|secret|auth|credential|password|access[-_]?key)/i.test(parameter)) {
      throw Object.assign(new Error('Do not put API keys or credentials in endpoint query parameters. Use the encrypted credential field instead.'), {
        status: 400, code: 'CONNECTION_CREDENTIALS_IN_URL'
      });
    }
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

function redactSensitiveEndpoint(value) {
  const raw = clean(value);
  if (!raw) return raw;
  try {
    const parsed = new URL(raw);
    for (const key of parsed.searchParams.keys()) {
      if (/(?:api[-_]?key|token|secret|auth|credential|password|access[-_]?key)/i.test(key)) {
        parsed.searchParams.set(key, '[REDACTED]');
      }
    }
    return parsed.toString();
  } catch {
    return raw.replace(/([?&](?:api[-_]?key|token|secret|auth|credential|password|access[-_]?key)=)[^&]*/ig, '$1[REDACTED]');
  }
}

export function publicConnection(record, id) {
  const copy = { ...(record || {}) };
  delete copy.encryptedSecret;
  delete copy.secret;
  copy.id = clean(id || copy.id, 100);
  copy.endpoint = redactSensitiveEndpoint(copy.endpoint);
  copy.healthUrl = redactSensitiveEndpoint(copy.healthUrl);
  copy.hasSecret = !!record?.encryptedSecret;
  copy.requiresSecret = copy.authMode !== 'none';
  copy.capabilities = {
    canUseAsBrain:
      copy.active === true &&
      AI_PROTOCOLS.has(clean(copy.protocol, 40).toLowerCase())
  };
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

  const protocol = normalizeProtocol(body?.protocol || existing?.protocol, type);
  const authMode = normalizeAuthMode(body?.authMode || existing?.authMode);
  const requireHttps = authMode !== 'none' || AI_PROTOCOLS.has(protocol);
  const endpoint = assertSafeUrl(body?.endpoint || existing?.endpoint, { requireHttps });
  const healthUrl =
    assertSafeUrl(
      body?.healthUrl || existing?.healthUrl || endpoint,
      { required: false, requireHttps }
    ) || endpoint;

  let encryptedSecret = existing?.encryptedSecret || null;
  const secretProvided = Object.prototype.hasOwnProperty.call(body || {}, 'secret');

  if (secretProvided) {
    const rawSecret = clean(body?.secret, 8000);
    encryptedSecret = rawSecret ? await encryptSecret(env, rawSecret) : null;
  }

  if (authMode === 'none') {
    encryptedSecret = null;
  }

  if ((protocol === 'anthropic-messages' || protocol === 'gemini-generate-content') && authMode === 'none') {
    throw Object.assign(
      new Error('This provider protocol requires an API key. Choose an authenticated mode and enter the key in the credential field.'),
      { status: 400, code: 'CONNECTION_SECRET_REQUIRED' }
    );
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

export async function getConnection(env, user, id, { requireActive = true } = {}) {
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

  if (requireActive && record.active !== true) {
    throw Object.assign(
      new Error('This Universal Connection is inactive.'),
      { status: 409, code: 'CONNECTION_INACTIVE' }
    );
  }

  return { id: safeId, record };
}

export function applyConnectionAuth(headers, authMode, secret, protocol) {
  // Vendor-native authentication must be applied only on the server.
  if (protocol === 'anthropic-messages') {
    if (secret) {
      headers['x-api-key'] = secret;
      headers['anthropic-version'] = '2023-06-01';
    }
    return;
  }
  if (protocol === 'gemini-generate-content') {
    if (secret) headers['x-goog-api-key'] = secret;
    return;
  }
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
  const parsed = new URL(String(endpoint));
  const path = parsed.pathname.replace(/\/+$/, '');
  if (!/\/chat\/completions$/i.test(path)) {
    parsed.pathname = path + '/chat/completions';
  } else {
    parsed.pathname = path;
  }
  return parsed.toString();
}


function connectionModelCompatible(protocol, value) {
  const model = clean(value, 180);
  if (!model) return false;
  if (protocol === 'anthropic-messages') return /^claude-/i.test(model);
  if (protocol === 'gemini-generate-content') return /^gemini-/i.test(model);
  if (protocol === 'openai-chat') return !/^(?:claude-|gemini-)/i.test(model);
  return true;
}

function resolveConnectionModel(record, requestedModel) {
  const generic = new Set(['automatic', 'auto', 'openai', 'chatgpt', 'gpt', 'claude', 'anthropic', 'gemini', 'deepseek']);
  const saved = clean(record?.model, 180);
  if (saved && !generic.has(saved.toLowerCase()) && connectionModelCompatible(record?.protocol, saved)) {
    return saved;
  }

  const requested = clean(requestedModel, 180);
  if (requested && !generic.has(requested.toLowerCase()) && connectionModelCompatible(record?.protocol, requested)) {
    return requested;
  }

  if (record?.protocol === 'anthropic-messages') return 'claude-sonnet-4-6';
  if (record?.protocol === 'gemini-generate-content') return 'gemini-2.5-flash';

  if (record?.protocol === 'openai-chat') {
    try {
      const host = new URL(String(record.endpoint || '')).hostname.toLowerCase();
      if (host === 'api.deepseek.com' || host.endsWith('.deepseek.com')) return 'deepseek-flash';
      if (host === 'api.openai.com') return 'gpt-5';
      if (host === 'api.groq.com' || host.endsWith('.groq.com')) return 'openai/gpt-oss-20b';
    } catch {}
  }
  return '';
}

export function universalConnectionEndpoint(record, requestedModel) {
  const endpoint = new URL(String(record?.endpoint || ''));
  const path = endpoint.pathname.replace(/\/+$/, '');
  if (record?.protocol === 'openai-chat') {
    if (!/\/chat\/completions$/i.test(path)) endpoint.pathname = path + '/chat/completions';
    else endpoint.pathname = path;
    return endpoint.toString();
  }
  if (record?.protocol === 'anthropic-messages') {
    if (/\/v1\/messages$/i.test(path)) endpoint.pathname = path;
    else if (/\/v1$/i.test(path)) endpoint.pathname = path + '/messages';
    else endpoint.pathname = (path || '') + '/v1/messages';
    return endpoint.toString();
  }
  if (record?.protocol === 'gemini-generate-content') {
    const model = resolveConnectionModel(record, requestedModel) || 'gemini-2.5-flash';
    const encodedModel = encodeURIComponent(model);
    const complete = path.match(/^(.*\/models\/)[^/]+:generateContent$/i);
    if (complete) endpoint.pathname = complete[1] + encodedModel + ':generateContent';
    else if (/\/models$/i.test(path)) endpoint.pathname = path + '/' + encodedModel + ':generateContent';
    else if (/\/v1beta$/i.test(path)) endpoint.pathname = path + '/models/' + encodedModel + ':generateContent';
    else if (!path || path === '/') endpoint.pathname = '/v1beta/models/' + encodedModel + ':generateContent';
    else endpoint.pathname = path + '/v1beta/models/' + encodedModel + ':generateContent';
    return endpoint.toString();
  }
  return endpoint.toString();
}

export function buildUniversalConnectionPayload(record, input = {}) {
  if (input?.payload && typeof input.payload === 'object') return input.payload;
  const model = resolveConnectionModel(record, input.model);
  const system = clean(input.system, 40_000);
  const user = clean(input.user || input.prompt, 50_000);
  const maxTokens = Number(input.maxTokens) > 0 ? Math.min(Number(input.maxTokens), 24000) : 4096;
  const temperature = typeof input.temperature === 'number' ? Math.max(0, Math.min(input.temperature, 1)) : 0.2;

  if (record?.protocol === 'openai-chat' && !model) {
    throw Object.assign(
      new Error('Add the model name to this AI Brain connection before using it.'),
      { status: 400, code: 'AI_MODEL_REQUIRED' }
    );
  }

  if (record?.protocol === 'anthropic-messages') {
    return {
      model: model || 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      ...(system ? { system } : {}),
      messages: [{ role: 'user', content: user }],
      temperature
    };
  }
  if (record?.protocol === 'gemini-generate-content') {
    return {
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: {
        temperature,
        maxOutputTokens: Math.min(maxTokens, 8192)
      }
    };
  }
  return {
    messages: Array.isArray(input.messages) ? input.messages : [],
    prompt: user,
    system,
    ...(model ? { model } : {}),
    max_tokens: Number(input.maxTokens) > 0 ? Math.min(Number(input.maxTokens), 24000) : undefined,
    temperature
  };
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
  applyConnectionAuth(headers, record.authMode, secret, record.protocol);

  try {
    const payload = buildUniversalConnectionPayload(record, input);
    const url = universalConnectionEndpoint(record, input?.model);

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

export async function getActiveBrainConnectionId(env, user) {
  const { uid } = ownerOf(user);
  if (!uid) return null;
  const profile = await getFirestoreDataAtPath(env, ['users', uid]);
  const id = clean(profile?.activeBrainConnectionId, 100);
  if (!id || !/^[A-Za-z0-9_-]{1,100}$/.test(id)) return null;
  return id;
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

  if (!result.text && supportsAIProtocol(record.protocol)) {
    throw Object.assign(
      new Error('Universal Connection returned no text content.'),
      { status: 502, code: 'CONNECTION_EMPTY_RESPONSE' }
    );
  }

  return {
    provider: 'connection:' + id,
    routedProvider: 'universal-connection',
    model: resolveConnectionModel(record, model) || null,
    text: result.text || (typeof result.data === 'string' ? result.data : JSON.stringify(result.data)),
    raw: result.data,
    rawUsage: result.data?.usage || null
  };
}

export async function testUserConnection(env, user, id) {
  const { record } = await getConnection(env, user, id, { requireActive: false });
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  const headers = {
    Accept: 'application/json',
    'User-Agent': 'OVYX-Connection-Check/1.0'
  };
  const secret = await decryptSecret(env, record.encryptedSecret);
  applyConnectionAuth(headers, record.authMode, secret, record.protocol);

  try {
    const healthUrl = record.healthUrl && record.healthUrl !== record.endpoint
      ? record.healthUrl
      : (() => {
          if (!AI_PROTOCOLS.has(record.protocol)) return record.healthUrl || record.endpoint;
          const parsed = new URL(record.endpoint);
          const path = parsed.pathname.replace(/\/+$/, '');
          if (record.protocol === 'anthropic-messages' && parsed.hostname === 'api.anthropic.com') {
            parsed.pathname = '/v1/models';
          } else if (record.protocol === 'gemini-generate-content' && parsed.hostname === 'generativelanguage.googleapis.com') {
            parsed.pathname = '/v1beta/models';
          } else {
            const base = path.replace(/\/(?:chat\/completions|models|responses|v1\/messages)$/i, '').replace(/\/+$/, '');
            parsed.pathname = (base || '') + '/models';
          }
          return parsed.toString();
        })();
    const response = await fetch(
      healthUrl,
      {
        method: 'GET',
        headers,
        redirect: 'manual',
        signal: controller.signal
      }
    );
    return {
      ok:
        (response.status >= 200 && response.status < 400) ||
        response.status === 405,
      authenticated:
        response.status !== 401 &&
        response.status !== 403,
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
