/**
 * Server-side Web Push utilities for the verified OVYX root owner's devices.
 * Uses Web Crypto and the standard aes128gcm Web Push content encoding.
 */

import {
  getFirestoreData,
  listFirestoreDocuments,
  setFirestoreDocument,
} from './firebase-admin.js';

export const ADMIN_PUSH_COLLECTION = 'ovyx_admin_push_subscriptions';
export const ADMIN_PUSH_SETTINGS = Object.freeze([
  'paymentEvents',
  'subscriptionEvents',
  'securityEvents',
  'systemAlerts',
  'testNotifications',
]);

const DEFAULT_PREFERENCES = Object.freeze({
  paymentEvents: true,
  subscriptionEvents: true,
  securityEvents: true,
  systemAlerts: true,
  testNotifications: true,
});
const DEFAULT_SUBJECT = 'mailto:ovyxsupportteam@gmail.com';
const text = (value, max = 500) => String(value ?? '').trim().slice(0, max);

function decodeBase64(value) {
  const source = String(value || '').trim().replace(/^-----BEGIN [^-]+-----/i, '')
    .replace(/-----END [^-]+-----$/i, '').replace(/\s+/g, '')
    .replace(/-/g, '+').replace(/_/g, '/');
  if (!source || !/^[A-Za-z0-9+/]*={0,2}$/.test(source)) throw new Error('Invalid base64/base64url value.');
  const normalized = source.replace(/=+$/, '');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function encodeBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function publicKeyBytes(value) {
  try {
    const bytes = decodeBase64(value);
    return bytes.length === 65 && bytes[0] === 4 ? bytes : null;
  } catch {
    return null;
  }
}

function privateKeyDescription(value) {
  const raw = text(value, 4000);
  if (!raw) return { kind: 'missing', bytes: null };
  if (/^-----BEGIN PRIVATE KEY-----/.test(raw)) {
    try {
      const der = decodeBase64(raw);
      return der.length > 0 ? { kind: 'pkcs8', bytes: der } : { kind: 'invalid', bytes: null };
    } catch {
      return { kind: 'invalid', bytes: null };
    }
  }
  try {
    const bytes = decodeBase64(raw);
    return bytes.length === 32 ? { kind: 'raw-p256', bytes } : { kind: 'invalid', bytes: null };
  } catch {
    return { kind: 'invalid', bytes: null };
  }
}

function normalizedSubject(value) {
  const subject = text(value || DEFAULT_SUBJECT, 320);
  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(subject)) return subject;
  try {
    const url = new URL(subject);
    if (url.protocol === 'https:' && !url.username && !url.password) return url.href;
  } catch { /* a supported mailto subject is handled above */ }
  return DEFAULT_SUBJECT;
}

export function getAdminPushConfiguration(env = {}) {
  const publicKey = text(env.OVYX_VAPID_PUBLIC_KEY, 200);
  const privateKey = privateKeyDescription(env.OVYX_VAPID_PRIVATE_KEY);
  const decodedPublicKey = publicKeyBytes(publicKey);
  const subject = normalizedSubject(env.OVYX_VAPID_SUBJECT);
  if (!publicKey || !privateKey.bytes || !decodedPublicKey) {
    const reason = !publicKey || !decodedPublicKey
      ? 'OVYX_VAPID_PUBLIC_KEY must be a base64url-encoded 65-byte uncompressed P-256 public key.'
      : 'OVYX_VAPID_PRIVATE_KEY must be a 32-byte base64url P-256 scalar or a PKCS8 PEM private key.';
    return { configured: false, publicKey: null, subject, reason };
  }
  return {
    configured: true,
    publicKey,
    publicKeyBytes: decodedPublicKey,
    privateKeyKind: privateKey.kind,
    subject,
    reason: 'VAPID key material has the expected shape; live delivery is confirmed only after a push request succeeds.',
  };
}

export function normalizeAdminPushPreferences(value = {}) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return Object.fromEntries(ADMIN_PUSH_SETTINGS.map(key => [
    key,
    typeof input[key] === 'boolean' ? input[key] : DEFAULT_PREFERENCES[key],
  ]));
}

export function validateAdminPushEndpoint(value) {
  const raw = text(value, 2048);
  if (!raw || raw.length > 2048) return null;
  let url;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return null;
  const host = url.hostname.toLowerCase();
  const allowed = host === 'fcm.googleapis.com' ||
    host === 'updates.push.services.mozilla.com' ||
    host === 'push.services.mozilla.com' ||
    host.endsWith('.push.services.mozilla.com') ||
    host === 'web.push.apple.com' ||
    host === 'push.apple.com' ||
    host === 'notify.windows.com' ||
    host.endsWith('.notify.windows.com');
  if (!allowed) return null;
  return url.href;
}

export async function adminPushSubscriptionId(endpoint) {
  const normalized = validateAdminPushEndpoint(endpoint);
  if (!normalized) throw Object.assign(new Error('A supported HTTPS push endpoint is required.'), {
    status: 400, code: 'PUSH_ENDPOINT_INVALID',
  });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function preferenceForType(type) {
  const normalized = text(type, 80).toLowerCase();
  if (normalized.includes('payment')) return 'paymentEvents';
  if (normalized.includes('subscription')) return 'subscriptionEvents';
  if (normalized.includes('security') || normalized.includes('account')) return 'securityEvents';
  if (normalized === 'test') return 'testNotifications';
  return 'systemAlerts';
}

function loadPrivateKey(config, env) {
  const privateValue = text(env.OVYX_VAPID_PRIVATE_KEY, 4000);
  const privateInfo = privateKeyDescription(privateValue);
  if (privateInfo.kind === 'pkcs8') {
    return crypto.subtle.importKey('pkcs8', privateInfo.bytes, {
      name: 'ECDSA', namedCurve: 'P-256',
    }, false, ['sign']);
  }
  if (privateInfo.kind === 'raw-p256') {
    const pub = config.publicKeyBytes;
    return crypto.subtle.importKey('jwk', {
      kty: 'EC',
      crv: 'P-256',
      x: encodeBase64Url(pub.slice(1, 33)),
      y: encodeBase64Url(pub.slice(33, 65)),
      d: encodeBase64Url(privateInfo.bytes),
      ext: true,
      key_ops: ['sign'],
    }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  }
  throw Object.assign(new Error('The configured VAPID private key is invalid.'), {
    status: 503, code: 'VAPID_PRIVATE_KEY_INVALID',
  });
}

async function vapidToken(env, config, audience) {
  const now = Math.floor(Date.now() / 1000);
  const header = encodeBase64Url(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = encodeBase64Url(new TextEncoder().encode(JSON.stringify({
    aud: audience,
    exp: now + 12 * 60 * 60,
    sub: config.subject,
  })));
  const unsigned = header + '.' + payload;
  const key = await loadPrivateKey(config, env);
  const signature = await crypto.subtle.sign({
    name: 'ECDSA', hash: 'SHA-256',
  }, key, new TextEncoder().encode(unsigned));
  return unsigned + '.' + encodeBase64Url(new Uint8Array(signature));
}

async function hkdf(input, salt, info, length) {
  const key = await crypto.subtle.importKey('raw', input, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({
    name: 'HKDF',
    hash: 'SHA-256',
    salt,
    info,
  }, key, length * 8);
  return new Uint8Array(bits);
}

function concatBytes(...parts) {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function bytesFromText(value) {
  return new TextEncoder().encode(value);
}

async function encryptPayload(subscription, payload) {
  const uaPublic = decodeBase64(subscription.keys.p256dh);
  const authSecret = decodeBase64(subscription.keys.auth);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4 || authSecret.length < 16 || authSecret.length > 32) {
    throw Object.assign(new Error('Stored push subscription keys are invalid.'), {
      status: 400, code: 'PUSH_SUBSCRIPTION_KEYS_INVALID',
    });
  }
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, {
    name: 'ECDH', namedCurve: 'P-256',
  }, false, []);
  const ephemeral = await crypto.subtle.generateKey({
    name: 'ECDH', namedCurve: 'P-256',
  }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', ephemeral.publicKey));
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits({
    name: 'ECDH', public: uaKey,
  }, ephemeral.privateKey, 256));
  const authInfo = concatBytes(bytesFromText('WebPush: info\0'), uaPublic, asPublic);
  const ikm = await hkdf(sharedSecret, authSecret, authInfo, 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(ikm, salt, bytesFromText('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(ikm, salt, bytesFromText('Content-Encoding: nonce\0'), 12);
  const plaintext = concatBytes(bytesFromText(payload), new Uint8Array([2]));
  if (plaintext.length + 16 > 3993) {
    throw Object.assign(new Error('Push notification payload exceeds the supported record size.'), {
      status: 413, code: 'PUSH_PAYLOAD_TOO_LARGE',
    });
  }
  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({
    name: 'AES-GCM', iv: nonce, tagLength: 128,
  }, aesKey, plaintext));
  const rs = new Uint8Array([0, 0, 16, 0]); // 4096-byte maximum record size.
  const body = concatBytes(salt, rs, new Uint8Array([asPublic.length]), asPublic, ciphertext);
  return body;
}

async function sendToSubscription(env, config, subscription, payload) {
  const endpoint = validateAdminPushEndpoint(subscription.endpoint);
  if (!endpoint) throw Object.assign(new Error('Stored push endpoint is not supported.'), {
    status: 400, code: 'PUSH_ENDPOINT_INVALID',
  });
  const encrypted = await encryptPayload(subscription, JSON.stringify(payload));
  const audience = new URL(endpoint).origin;
  const token = await vapidToken(env, config, audience);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    return await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: 'vapid t=' + token + ', k=' + config.publicKey,
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'aes128gcm',
        'TTL': '60',
        'Urgency': 'normal',
      },
      body: encrypted,
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw Object.assign(new Error('Push service timed out.'), {
      status: 504, code: 'PUSH_SERVICE_TIMEOUT',
    });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function sendAdminPushNotification(env, input = {}) {
  const config = getAdminPushConfiguration(env);
  if (!config.configured) return { configured: false, skipped: true, attempted: 0, delivered: 0, failed: 0, reason: config.reason };
  const settings = await getFirestoreData(env, 'system', 'admin_push').catch(() => null);
  const preferences = normalizeAdminPushPreferences(settings?.preferences || {});
  if (!preferences[preferenceForType(input.type)]) {
    return { configured: true, skipped: true, attempted: 0, delivered: 0, failed: 0 };
  }
  const listed = await listFirestoreDocuments(env, ADMIN_PUSH_COLLECTION, 1000);
  const subscriptions = (listed.documents || []).filter(item =>
    item.active === true &&
    typeof item.endpoint === 'string' &&
    item.keys && typeof item.keys === 'object'
  );
  const payload = {
    id: text(input.id || input.tag || 'ovyx-admin-alert', 160),
    type: text(input.type || 'system', 80),
    title: text(input.title || 'OVYX Alert', 120),
    body: text(input.body || input.message || 'A new OVYX event needs your attention.', 1200),
    url: text(input.url || '/view-admin-overview', 500).startsWith('/') &&
      !text(input.url || '/view-admin-overview', 500).startsWith('//')
      ? text(input.url || '/view-admin-overview', 500) : '/view-admin-overview',
    tag: text(input.tag || input.id || 'ovyx-admin-alert', 160),
  };
  const results = await Promise.all(subscriptions.map(async subscription => {
    try {
      const response = await sendToSubscription(env, config, subscription, payload);
      if (response.status === 404 || response.status === 410) {
        await setFirestoreDocument(env, ADMIN_PUSH_COLLECTION, String(subscription.id || ''), {
          active: false, updatedAt: new Date().toISOString(), inactiveReason: 'push_endpoint_expired',
        }, { merge: true });
        return { ok: false, status: response.status, expired: true };
      }
      return { ok: response.ok, status: response.status };
    } catch (error) {
      return { ok: false, status: Number(error?.status) || 0, code: String(error?.code || 'PUSH_DELIVERY_FAILED') };
    }
  }));
  return {
    configured: true,
    skipped: subscriptions.length === 0,
    attempted: results.length,
    delivered: results.filter(item => item.ok).length,
    failed: results.filter(item => !item.ok).length,
  };
}
