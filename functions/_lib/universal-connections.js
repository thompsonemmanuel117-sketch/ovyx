import {
  getFirestoreDataAtPath,
  setFirestoreDocumentAtPath
} from './firebase-admin.js';
import { getOAuthClientConfig, refreshOAuthCredential } from './connection-oauth.js';

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
      new Error('Personal Connection secret encryption is not configured on the server.'),
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

export async function decryptSecret(env, encrypted) {
  if (!encrypted) return '';
  if (!String(encrypted).startsWith('v1.')) {
    throw Object.assign(
      new Error('Stored Personal Connection secret uses an unsupported format.'),
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
  delete copy.encryptedRefreshToken;
  delete copy.secret;
  copy.id = clean(id || copy.id, 100);
  copy.endpoint = redactSensitiveEndpoint(copy.endpoint);
  copy.healthUrl = redactSensitiveEndpoint(copy.healthUrl);
  copy.hasSecret = !!record?.encryptedSecret;
  copy.requiresSecret = copy.authMode !== 'none';
  // Only an active, encrypted account-owned AI connection can be selected as fallback.
  copy.capabilities = {
    canUseAsBrain: copy.type === 'ai' && supportsAIProtocol(copy.protocol) && copy.active === true && !!record?.encryptedSecret,
    canUseForWebStudio: false,
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
  if ((type === 'ai' && !AI_PROTOCOLS.has(protocol)) || (type !== 'ai' && AI_PROTOCOLS.has(protocol))) throw Object.assign(new Error('AI provider connections must use the AI connection type and a supported OpenAI-compatible, Anthropic, or Gemini protocol.'), { status: 400, code: 'AI_CONNECTION_PROTOCOL_INVALID' });
  const authMode = normalizeAuthMode(body?.authMode || existing?.authMode || (type === 'ai' ? 'bearer' : 'none'));
  if (type === 'ai' && authMode === 'none') throw Object.assign(new Error('AI provider connections require an API key.'), { status: 400, code: 'CONNECTION_SECRET_REQUIRED' });
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
      new Error('This Personal Connection is inactive.'),
      { status: 409, code: 'CONNECTION_INACTIVE' }
    );
  }

  return { id: safeId, record: { ...record, id: safeId } };
}

export function applyConnectionAuth(headers, authMode, secret, protocol) {
  // Vendor-native authentication must be applied only on the server.
  if (protocol === 'openai-chat') {
    if (secret) headers.Authorization = 'Bearer ' + secret;
    return;
  }
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
      messages: (Array.isArray(input.messages) && input.messages.length ? input.messages : [{ role: 'user', content: user }]).filter(item => item && ['user','assistant'].includes(item.role)).slice(-20).map(item => ({ role: item.role, content: clean(item.content, 50000) })),
      temperature
    };
  }
  if (record?.protocol === 'gemini-generate-content') {
    return {
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents: (Array.isArray(input.messages) && input.messages.length ? input.messages : [{ role: 'user', content: user }]).filter(item => item && ['user','assistant'].includes(item.role)).slice(-20).map(item => ({ role: item.role === 'assistant' ? 'model' : 'user', parts: [{ text: clean(item.content, 50000) }] })),
      generationConfig: {
        temperature,
        maxOutputTokens: Math.min(maxTokens, 8192)
      }
    };
  }
  const messages = Array.isArray(input.messages) && input.messages.length ? input.messages.filter(item => item && ['system','user','assistant'].includes(item.role)).slice(-20).map(item => ({ role: item.role, content: clean(item.content, 50000) })) : [...(system ? [{ role: 'system', content: system }] : []), ...(user ? [{ role: 'user', content: user }] : [])];
  if (system && !messages.some(item => item.role === 'system')) messages.unshift({ role: 'system', content: system });
  return { messages, ...(model ? { model } : {}), max_tokens: Number(input.maxTokens) > 0 ? Math.min(Number(input.maxTokens), 24000) : undefined, temperature };
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
      new Error('Personal Connection response is too large.'),
      { status: 502, code: 'CONNECTION_RESPONSE_TOO_LARGE' }
    );
  }
  try {
    return { data: JSON.parse(text), raw: text };
  } catch {
    return { data: text, raw: text };
  }
}

export function buildConnectionRequestUrl(record, input = {}) {
  const url = new URL(universalConnectionEndpoint(record, input?.model));
  if (input.path !== undefined && input.path !== null && input.path !== '') {
    const path = clean(input.path, 512);
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('?') || path.includes('#') || path.includes('\\') || /[\x00-\x1f]/.test(path) || /%(?:2e|2f|5c)/i.test(path)) {
      throw Object.assign(new Error('Use a relative API path under the saved connection endpoint.'), { status: 400, code: 'CONNECTION_PATH_INVALID' });
    }
    let segments;
    try { segments = path.split('/').filter(Boolean).map(decodeURIComponent); }
    catch { throw Object.assign(new Error('The API path encoding is invalid.'), { status: 400, code: 'CONNECTION_PATH_INVALID' }); }
    if (segments.some(segment => segment === '.' || segment === '..' || /[\\/\x00-\x1f]/.test(segment))) {
      throw Object.assign(new Error('Path traversal is not allowed in a connection request.'), { status: 400, code: 'CONNECTION_PATH_INVALID' });
    }
    url.pathname = url.pathname.replace(/\/+$/, '') + path;
  }
  if (input.query !== undefined && input.query !== null) {
    if (!input.query || typeof input.query !== 'object' || Array.isArray(input.query)) throw Object.assign(new Error('Query parameters must be a JSON object.'), { status: 400, code: 'CONNECTION_QUERY_INVALID' });
    const entries = Object.entries(input.query);
    if (entries.length > 30) throw Object.assign(new Error('A connection request supports up to 30 query parameters.'), { status: 400, code: 'CONNECTION_QUERY_LIMIT' });
    for (const [key, value] of entries) {
      if (!/^[A-Za-z0-9_.-]{1,80}$/.test(key) || /^(?:key|api[_-]?key|token|access[_-]?token|secret|password|authorization)$/i.test(key)) throw Object.assign(new Error('Credential-like query parameters are blocked. Keep API credentials in the encrypted connection settings.'), { status: 400, code: 'CONNECTION_SECRET_IN_QUERY_BLOCKED' });
      if (!['string', 'number', 'boolean'].includes(typeof value)) throw Object.assign(new Error('Query parameter values must be strings, numbers or booleans.'), { status: 400, code: 'CONNECTION_QUERY_INVALID' });
      url.searchParams.set(key, String(value).slice(0, 2000));
    }
  }
  return assertSafeUrl(url.toString(), { requireHttps: record.authMode !== 'none' || supportsAIProtocol(record.protocol) });
}


async function refreshConnectionAccessToken(env, record) {
  const refreshToken = record.encryptedRefreshToken ? await decryptSecret(env, record.encryptedRefreshToken) : '';
  if (!refreshToken) {
    await setFirestoreDocumentAtPath(env, ['users', record.ownerEmail, 'universal_connections', record.id], { oauthStatus:'expired', updatedAt:new Date().toISOString() }, { merge:true });
    throw Object.assign(new Error('This OAuth connection expired. Reconnect the service to continue.'), { status:409, code:'OAUTH_RECONNECT_REQUIRED' });
  }
  const config = getOAuthClientConfig(record.oauthProvider, env);
  const refreshed = await refreshOAuthCredential(record.oauthProvider, config, refreshToken);
  const encryptedSecret = await encryptSecret(env, refreshed.access_token);
  const encryptedRefreshToken = refreshed.refresh_token ? await encryptSecret(env, refreshed.refresh_token) : record.encryptedRefreshToken;
  const patch = {
    encryptedSecret,
    encryptedRefreshToken,
    oauthTokenExpiresAt: Number(refreshed.expires_in) > 0 ? new Date(Date.now() + Number(refreshed.expires_in) * 1000).toISOString() : null,
    oauthStatus:'connected',
    updatedAt:new Date().toISOString()
  };
  await setFirestoreDocumentAtPath(env, ['users', record.ownerEmail, 'universal_connections', record.id], patch, { merge:true });
  record.encryptedSecret = encryptedSecret;
  record.encryptedRefreshToken = encryptedRefreshToken;
  record.oauthTokenExpiresAt = patch.oauthTokenExpiresAt;
  record.oauthStatus = 'connected';
  return refreshed.access_token;
}

async function connectionAccessToken(env, record) {
  const accessToken = await decryptSecret(env, record.encryptedSecret);
  if (!record?.oauthProvider || !record?.oauthTokenExpiresAt) return accessToken;
  const expiresAt = Date.parse(record.oauthTokenExpiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt > Date.now() + 60_000) return accessToken;
  return refreshConnectionAccessToken(env, record);
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
  if (record.oauthProvider === 'notion') headers['Notion-Version'] = '2026-03-11';
  const secret = await connectionAccessToken(env, record);
  applyConnectionAuth(headers, record.authMode, secret, record.protocol);

  try {
    const payload = buildUniversalConnectionPayload(record, input);
    const url = buildConnectionRequestUrl(record, input);

    const method = clean(input?.method || 'POST', 10).toUpperCase();
    const requestOptions = {
      method,
      headers,
      body: method === 'GET' || method === 'HEAD' ? undefined : JSON.stringify(payload),
      signal: controller.signal,
      redirect: 'manual'
    };
    let response = await fetch(url, requestOptions);
    if (response.status === 401 && record.oauthProvider && record.encryptedRefreshToken) {
      const refreshedToken = await refreshConnectionAccessToken(env, record);
      applyConnectionAuth(headers, record.authMode, refreshedToken, record.protocol);
      response = await fetch(url, requestOptions);
    }

    const parsed = await responseJson(response);

    if (!response.ok || (record.oauthProvider === 'slack' && parsed?.data?.ok === false)) {
      throw Object.assign(
        new Error(
          parsed?.data?.error?.message ||
          parsed?.data?.message ||
          'Personal Connection upstream request failed with HTTP ' + response.status
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
        new Error('Personal Connection request timed out.'),
        { status: 504, code: 'CONNECTION_TIMEOUT' }
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function getActiveBrainConnectionId(env, user) {
  const { uid, email } = ownerOf(user);
  if (!uid || !email) return null;
  const profile = await getFirestoreDataAtPath(env, ['users', uid]) || {};
  const id = clean(profile.activeBrainConnectionId, 100);
  if (!id) return null;
  try { const { record } = await getConnection(env, user, id); return record.type === 'ai' && supportsAIProtocol(record.protocol) && record.encryptedSecret ? id : null; } catch { return null; }
}

export async function getActiveWebStudioConnectionId() {
  // Retained as a compatibility export. Web Studio uses the platform Cloudflare engine.
  return null;
}

export async function callUserUniversalConnection(env, input = {}) {
  const user = input.authUser;
  const { record } = await getConnection(env, user, input.connectionId);
  if (record.type !== 'ai' || !supportsAIProtocol(record.protocol) || !record.encryptedSecret) throw Object.assign(new Error('The selected connection is not a ready AI provider.'), { status: 409, code: 'AI_CONNECTION_NOT_READY' });
  const result = await requestConnection(record, input, env);
  if (!result.text) throw Object.assign(new Error('The connected AI provider returned no text response.'), { status: 502, code: 'AI_PROVIDER_EMPTY_RESPONSE' });
  const owner = ownerOf(user); const usage = result.data?.usage || result.data?.usageMetadata || null;
  try { await setFirestoreDocumentAtPath(env, ['users', owner.email, 'personal_ai_usage', crypto.randomUUID().replace(/-/g, '')], { ownerUid: owner.uid, provider: clean(record.name, 120), protocol: record.protocol, model: clean(record.model, 180) || null, usage: usage && typeof usage === 'object' ? usage : null, status: 'success', createdAt: new Date().toISOString() }, { merge: false }); } catch (error) { console.warn('[OVYX PERSONAL AI USAGE]', error?.message || error); }
  return { text: result.text, provider: record.name, model: record.model || null, rawUsage: usage, requestedProvider: 'personal-connection', routedProvider: 'personal-connection' };
}

export function hasConnectionPermission(method, type, permissions) {
  const verb = clean(method, 10).toUpperCase();
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(verb)) return false;
  const granted = new Set(Array.isArray(permissions) ? permissions : []);
  if (verb === 'GET') return granted.has('read');
  if (verb === 'DELETE') return granted.has('delete');
  return granted.has('write') || (type === 'tool' && granted.has('execute'));
}

export async function callProjectUniversalConnection(env, user, input = {}) {
  const owner = ownerOf(user); const projectId = clean(input.projectId, 120); const connectionId = clean(input.connectionId, 100);
  if (!owner.uid || !owner.email) throw Object.assign(new Error('Authenticated workspace identity is required.'), { status: 401, code: 'AUTH_IDENTITY_REQUIRED' });
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(projectId) || !/^[A-Za-z0-9_-]{1,100}$/.test(connectionId)) throw Object.assign(new Error('Project or connection ID is invalid.'), { status: 400, code: 'INVALID_CONNECTION_GRANT_TARGET' });
  const project = await getFirestoreDataAtPath(env, ['users', owner.email, 'projects', projectId]);
  if (!project || project.ownerUid !== owner.uid || String(project.ownerEmail || '').toLowerCase() !== owner.email) throw Object.assign(new Error('Project not found.'), { status: 404, code: 'PROJECT_NOT_FOUND' });
  const grant = await getFirestoreDataAtPath(env, ['users', owner.email, 'projects', projectId, 'connection_grants', connectionId]);
  if (!grant || grant.active !== true || grant.ownerUid !== owner.uid || grant.connectionId !== connectionId) throw Object.assign(new Error('This project has not been granted access to that connection.'), { status: 403, code: 'PROJECT_CONNECTION_NOT_GRANTED' });
  const { record } = await getConnection(env, user, connectionId);
  if (record.type === 'ai' || supportsAIProtocol(record.protocol)) throw Object.assign(new Error('Personal AI Brain credentials cannot be exposed as general project service credentials.'), { status: 403, code: 'AI_CONNECTION_PROJECT_SCOPE_BLOCKED' });
  const method = clean(input.method || 'POST', 10).toUpperCase();
  if (!hasConnectionPermission(method, record.type, grant.permissions)) throw Object.assign(new Error('The project connection grant does not allow this operation.'), { status: 403, code: 'PROJECT_CONNECTION_PERMISSION_DENIED' });
  if (method !== 'GET' && method !== 'DELETE' && (!input.payload || typeof input.payload !== 'object' || Array.isArray(input.payload))) throw Object.assign(new Error('A JSON object payload is required for this operation.'), { status: 400, code: 'CONNECTION_PAYLOAD_REQUIRED' });
  const audit = async (status, code = null) => { try { await setFirestoreDocumentAtPath(env, ['users', owner.email, 'projects', projectId, 'connection_audit', crypto.randomUUID().replace(/-/g, '')], { ownerUid: owner.uid, projectId, connectionId, method, status, code, createdAt: new Date().toISOString() }, { merge: false }); } catch (error) { console.warn('[OVYX CONNECTION AUDIT]', error?.message || error); } };
  try { const result = await requestConnection(record, { method, payload: input.payload, path: input.path, query: input.query }, env); await audit('success'); return { ok: true, status: result.status, data: result.data }; }
  catch (error) { await audit('failed', clean(error?.code || 'UPSTREAM_FAILED', 80)); throw error; }
}

export async function testUserConnection(env, user, id) {
  const { record } = await getConnection(env, user, id, { requireActive: false });
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), record.oauthProvider ? 20_000 : 8000);
  const headers = {
    Accept: 'application/json',
    'User-Agent': 'OVYX-Connection-Check/1.0'
  };
  if (record.oauthProvider === 'notion') headers['Notion-Version'] = '2026-03-11';
  const secret = await connectionAccessToken(env, record);
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
    const healthOptions = { method:'GET', headers, redirect:'manual', signal:controller.signal };
    let response = await fetch(healthUrl, healthOptions);
    if (response.status === 401 && record.oauthProvider && record.encryptedRefreshToken) {
      const refreshedToken = await refreshConnectionAccessToken(env, record);
      applyConnectionAuth(headers, record.authMode, refreshedToken, record.protocol);
      response = await fetch(healthUrl, healthOptions);
    }
    let providerOk = true;
    if (record.oauthProvider === 'slack') {
      const payload = await response.clone().json().catch(() => null);
      providerOk = payload?.ok === true;
    }
    return {
      ok: ((response.status >= 200 && response.status < 400) || response.status === 405) && providerOk,
      authenticated: response.status !== 401 && response.status !== 403 && providerOk,
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
