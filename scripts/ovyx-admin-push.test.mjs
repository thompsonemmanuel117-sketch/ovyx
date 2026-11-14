import assert from 'node:assert/strict';
import {
  ADMIN_PUSH_COLLECTION,
  ADMIN_PUSH_SETTINGS,
  adminPushSubscriptionId,
  getAdminPushConfiguration,
  normalizeAdminPushPreferences,
  validateAdminPushEndpoint,
} from '../functions/api/_lib/admin-push.js';

assert.equal(ADMIN_PUSH_COLLECTION, 'ovyx_admin_push_subscriptions');
assert.deepEqual(ADMIN_PUSH_SETTINGS, [
  'paymentEvents', 'subscriptionEvents', 'securityEvents', 'systemAlerts', 'testNotifications',
]);
assert.deepEqual(normalizeAdminPushPreferences({}), {
  paymentEvents: true, subscriptionEvents: true, securityEvents: true,
  systemAlerts: true, testNotifications: true,
});
assert.deepEqual(normalizeAdminPushPreferences({ paymentEvents: false, systemAlerts: 'false', unknown: false }), {
  paymentEvents: false, subscriptionEvents: true, securityEvents: true,
  systemAlerts: true, testNotifications: true,
});
assert.equal(validateAdminPushEndpoint('http://fcm.googleapis.com/fcm/send/test'), null);
assert.equal(validateAdminPushEndpoint('https://127.0.0.1/private'), null);
assert.equal(validateAdminPushEndpoint('https://fcm.googleapis.com/fcm/send/test'), 'https://fcm.googleapis.com/fcm/send/test');
assert.equal(validateAdminPushEndpoint('https://evil.example/fcm/send/test'), null);
assert.equal(validateAdminPushEndpoint('https://user:pass@fcm.googleapis.com/fcm/send/test'), null);

const generated = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const publicKeyBytes = new Uint8Array(await crypto.subtle.exportKey('raw', generated.publicKey));
const privateJwk = await crypto.subtle.exportKey('jwk', generated.privateKey);
const publicKey = Buffer.from(publicKeyBytes).toString('base64url');
const privateKey = Buffer.from(privateJwk.d, 'base64url').toString('base64url');
const config = getAdminPushConfiguration({
  OVYX_VAPID_PUBLIC_KEY: publicKey,
  OVYX_VAPID_PRIVATE_KEY: privateKey,
  OVYX_VAPID_SUBJECT: 'mailto:ovyxsupportteam@gmail.com',
});
assert.equal(config.configured, true);
assert.equal(config.publicKey, publicKey);
assert.equal(JSON.stringify(config).includes(privateKey), false);
assert.equal(getAdminPushConfiguration({}).configured, false);
assert.equal(getAdminPushConfiguration({ OVYX_VAPID_PUBLIC_KEY: 'bad', OVYX_VAPID_PRIVATE_KEY: privateKey }).configured, false);

const endpoint = 'https://fcm.googleapis.com/fcm/send/test';
const id = await adminPushSubscriptionId(endpoint);
assert.match(id, /^[a-f0-9]{64}$/);
assert.equal(await adminPushSubscriptionId(endpoint), id, 'Subscription ID must be stable for a given endpoint.');
await assert.rejects(() => adminPushSubscriptionId('http://127.0.0.1/'), /supported HTTPS push endpoint/i);

console.log('OVYX admin push contracts passed: VAPID validation, preference defaults, endpoint SSRF restrictions and stable subscription IDs.');
