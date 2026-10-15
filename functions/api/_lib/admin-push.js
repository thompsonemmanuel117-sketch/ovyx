import {
  getFirestoreData,
  listFirestoreDocuments,
  setFirestoreDocument,
} from './firebase-admin.js';

export const ADMIN_PUSH_COLLECTION = 'ovyx_admin_push_subscriptions';
export const ADMIN_PUSH_SETTINGS = Object.freeze(['payments', 'refunds', 'chargebacks', 'subscriptions', 'deploymentFailures']);

const DEFAULT_PREFERENCES = Object.freeze({
  payments: true,
  refunds: true,
  chargebacks: true,
  subscriptions: true,
  deploymentFailures: true,
});
const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const encoder = new TextEncoder();

function bytes(value) {
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}
function concatBytes(...parts) {
  const arrays = parts.map(bytes);
  const size = arrays.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  for (const part of arrays) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}
function b64urlEncode(value) {
  const input = bytes(value);
  let binary = '';
  for (let offset = 0; offset < input.length; offset += 0x8000) {
    binary += String.fromCharCode(...input.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function b64urlDecode(value) {
  const raw = String(value || '').trim().replace(/-/g, '+').replace(/_/g, '/');
  if (!raw || !/^[A-Za-z0-9+/]*={0,2}$/.test(raw)) throw new Error('Invalid base64url value.');
  const normalized = raw.replace(/=+$/g, '');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const result = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) result[i] = binary.charCodeAt(i);
  return result;
}
async function hmacSha256(keyBytes, input) {
  const key = await crypto.subtle.importKey('raw', bytes(keyBytes), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, bytes(input)));
}
async function hkdfExpand(pseudorandomKey, info, length) {
  const result = new Uint8Array(length);
  let previous = new Uint8Array(0);
  let offset = 0;
  for (let counter = 1; offset < length; counter += 1) {
    previous = await hmacSha256(pseudorandomKey, concatBytes(previous, info, Uint8Array.of(counter)));
    const take = Math.min(previous.length, length - offset);
    result.set(previous.subarray(0, take), offset);
    offset += take;
    if (counter > 255) throw new Error('Push encryption output limit exceeded.');
  }
  return result;
}

function vapidConfig(env = {}) {
  const publicKey = clean(env.OVYX_VAPID_PUBLIC_KEY || env.VAPID_PUBLIC_KEY, 180);
  const privateKey = clean(env.OVYX_VAPID_PRIVATE_KEY || env.VAPID_PRIVATE_KEY, 180);
  const subject = clean(env.OVYX_VAPID_SUBJECT || env.VAPID_SUBJECT || 'mailto:ovyxsupportteam@gmail.com', 320);
  try {
    const publicBytes = b64urlDecode(publicKey);
    const privateBytes = b64urlDecode(privateKey);
    if (publicBytes.length !== 65 || publicBytes[0] !== 4 || privateBytes.length !== 32) {
      return { configured: false, publicKey: '', subject, reason: 'invalid_key_format' };
    }
    if (!(subject.startsWith('mailto:') || subject.startsWith('https://')) || /[\r\n]/.test(subject)) {
      return { configured: false, publicKey: '', subject: '', reason: 'invalid_subject' };
    }
    const privateJwk = {
      kty: 'EC',
      crv: 'P-256',
      x: b64urlEncode(publicBytes.subarray(1, 33)),
      y: b64urlEncode(publicBytes.subarray(33, 65)),
      d: b64urlEncode(privateBytes),
      ext: true,
      key_ops: ['sign'],
    };
    return { configured: true, publicKey, publicBytes, privateJwk, subject, reason: 'configured' };
  } catch {
    return { configured: false, publicKey: '', subject, reason: publicKey && privateKey ? 'invalid_key_format' : 'missing_vapid_keys' };
  }
}

export function getAdminPushConfiguration(env = {}) {
  const config = vapidConfig(env);
  return {
    configured: config.configured,
    publicKey: config.configured ? config.publicKey : null,
    subject: config.configured ? config.subject : null,
    reason: config.reason,
  };
}

export function normalizeAdminPushPreferences(value = {}) {
  const result = {};
  for (const key of ADMIN_PUSH_SETTINGS) {
    result[key] = typeof value[key] === 'boolean' ? value[key] : DEFAULT_PREFERENCES[key];
  }
  return result;
}

export function validateAdminPushEndpoint(value) {
  const endpoint = clean(value, 2048);
  let url;
  try { url = new URL(endpoint); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  const allowed =
    host === 'fcm.googleapis.com' ||
    host === 'updates.push.services.mozilla.com' ||
    host.endsWith('.push.services.mozilla.com') ||
    host === 'web.push.apple.com' ||
    host.endsWith('.push.apple.com') ||
    host.endsWith('.notify.windows.com') ||
    host.endsWith('.wns.windows.com');
  return allowed ? url.href : null;
}

export async function adminPushSubscriptionId(endpoint) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(String(endpoint || ''))));
  return [...digest].map(value => value.toString(16).padStart(2, '0')).join('');
}

async function vapidAuthorization(config, audience) {
  const key = await crypto.subtle.importKey('jwk', config.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const header = b64urlEncode(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64urlEncode(encoder.encode(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + (12 * 60 * 60),
    sub: config.subject,
  })));
  const unsigned = header + '.' + claims;
  const signature = new Uint8Array(await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    encoder.encode(unsigned),
  ));
  if (signature.length !== 64) throw new Error('VAPID signature format was not supported by the runtime.');
  return 'vapid t=' + unsigned + '.' + b64urlEncode(signature) + ', k=' + config.publicKey;
}

async function encryptWebPushPayload(subscription, payload) {
  const clientPublic = b64urlDecode(subscription?.keys?.p256dh);
  const authSecret = b64urlDecode(subscription?.keys?.auth);
  if (clientPublic.length !== 65 || clientPublic[0] !== 4 || authSecret.length < 16 || authSecret.length > 32) {
    throw new Error('The stored push subscription keys are invalid.');
  }
  const clientPublicKey = await crypto.subtle.importKey('raw', clientPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const serverKeys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const serverPublic = new Uint8Array(await crypto.subtle.exportKey('raw', serverKeys.publicKey));
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: clientPublicKey }, serverKeys.privateKey, 256));

  const authPrk = await hmacSha256(authSecret, sharedSecret);
  const ikmInfo = concatBytes(encoder.encode('WebPush: info\u0000'), clientPublic, serverPublic);
  const inputKeyMaterial = await hkdfExpand(authPrk, ikmInfo, 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmacSha256(salt, inputKeyMaterial);
  const contentKey = await hkdfExpand(prk, encoder.encode('Content-Encoding: aes128gcm\u0000'), 16);
  const nonce = await hkdfExpand(prk, encoder.encode('Content-Encoding: nonce\u0000'), 12);
  const plain = concatBytes(encoder.encode(JSON.stringify(payload)), Uint8Array.of(2));
  if (plain.length > 3800) throw new Error('Push notification payload exceeds the supported size.');
  const aesKey = await crypto.subtle.importKey('raw', contentKey, { name: 'AES-GCM' }, false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, aesKey, plain));
  // RFC 8188 aes128gcm header: salt (16), record size (4096), key-id length and ephemeral public key.
  return concatBytes(salt, Uint8Array.of(0, 0, 16, 0), Uint8Array.of(serverPublic.length), serverPublic, ciphertext);
}

async function deliver(subscription, payload, config) {
  const endpoint = validateAdminPushEndpoint(subscription?.endpoint);
  if (!endpoint) return { delivered: false, status: 400, reason: 'invalid_endpoint' };
  try {
    const payloadBytes = await encryptWebPushPayload(subscription, payload);
    const authorization = await vapidAuthorization(config, new URL(endpoint).origin);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: authorization,
          'Content-Type': 'application/octet-stream',
          'Content-Encoding': 'aes128gcm',
          'TTL': '300',
          'Urgency': 'normal',
        },
        body: payloadBytes,
        signal: controller.signal,
      });
      return { delivered: response.ok, status: response.status, expired: response.status === 404 || response.status === 410 };
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    return { delivered: false, status: null, reason: error?.name === 'AbortError' ? 'push_timeout' : 'push_delivery_failed' };
  }
}

export async function sendAdminPushNotification(env, {
  type = 'test',
  title = 'OVYX Alert',
  body = 'You have a new OVYX notification.',
  url = '/view-admin-overview',
  tag = '',
} = {}) {
  const config = vapidConfig(env);
  if (!config.configured) return { configured: false, attempted: 0, delivered: 0, failed: 0, reason: config.reason };

  const settings = await getFirestoreData(env, 'system', 'admin_push') || {};
  const preferences = normalizeAdminPushPreferences(settings.preferences || {});
  const preferenceKey = ADMIN_PUSH_SETTINGS.includes(type) ? type : '';
  if (preferenceKey && preferences[preferenceKey] === false) return { configured: true, skipped: true, attempted: 0, delivered: 0, failed: 0 };
  // Delivery is restricted to subscriptions created for the root UID saved by the protected owner API.
  const registeredOwnerUid = clean(settings.ownerUid || settings.owner?.uid, 160);
  if (!registeredOwnerUid) return { configured: true, skipped: true, attempted: 0, delivered: 0, failed: 0, reason: 'no_owner_device_registered' };

  const result = await listFirestoreDocuments(env, ADMIN_PUSH_COLLECTION, 1000);
  const active = (result.documents || []).filter(row =>
    row.active === true && String(row.ownerUid || '') === registeredOwnerUid
  );
  const safeUrl = (() => {
    try {
      const parsed = new URL(String(url || '/view-admin-overview'), 'https://internal.invalid');
      return parsed.origin === 'https://internal.invalid' ? parsed.pathname + parsed.search + parsed.hash : '/view-admin-overview';
    } catch { return '/view-admin-overview'; }
  })();
  const message = {
    id: crypto.randomUUID(),
    type: clean(type, 40),
    title: clean(title || 'OVYX Alert', 120),
    body: clean(body || 'You have a new OVYX notification.', 1200),
    url: safeUrl,
    tag: clean(tag || (type + '-' + Date.now()), 160),
  };
  const outcomes = await Promise.all(active.slice(0, 100).map(async row => {
    const subscription = { endpoint: row.endpoint, keys: row.keys };
    const outcome = await deliver(subscription, message, config);
    if (outcome.expired && row.id) {
      await setFirestoreDocument(env, ADMIN_PUSH_COLLECTION, String(row.id), {
        active: false,
        updatedAt: new Date().toISOString(),
        inactiveReason: 'push_endpoint_expired',
      }, { merge: true }).catch(() => {});
    }
    return outcome;
  }));
  const delivered = outcomes.filter(item => item.delivered).length;
  return {
    configured: true,
    attempted: outcomes.length,
    delivered,
    failed: outcomes.filter(item => !item.delivered).length,
    skipped: false,
  };
}
