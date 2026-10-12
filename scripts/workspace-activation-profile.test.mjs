import assert from 'node:assert/strict';
import {
  buildWorkspaceActivationRecord,
  buildUniversalConnectionsStatus,
} from '../functions/api/workspace/activate.js';

const activation = buildWorkspaceActivationRecord(
  {
    uid: 'firebase-user-1',
    sub: 'firebase-user-1',
    email: '  OWNER@Example.test ',
    displayName: '  OVYX Owner  ',
    photoUrl: ' https://profiles.example.test/avatar.png ',
  },
  { planTier: 'pro', billingCustomerId: 'billing-keep' },
  '2026-10-12T21:00:00.000Z',
);
assert.deepEqual(activation, {
  uid: 'firebase-user-1',
  email: 'owner@example.test',
  displayName: 'OVYX Owner',
  photoUrl: 'https://profiles.example.test/avatar.png',
  workspaceActive: true,
  workspaceActivatedAt: '2026-10-12T21:00:00.000Z',
  workspaceActivationVersion: 2,
});
assert.equal(Object.hasOwn(activation, 'planTier'), false, 'activation patch must not overwrite plan/subscription');
assert.equal(Object.hasOwn(activation, 'billingCustomerId'), false, 'activation patch must not overwrite billing data');

const fallback = buildWorkspaceActivationRecord(
  { uid: 'firebase-user-2', email: '', displayName: '', photoUrl: '' },
  { email: 'fallback@example.test', displayName: 'Saved Name', photoUrl: 'https://example.test/saved.png' },
  '2026-10-12T21:01:00.000Z',
);
assert.equal(fallback.uid, 'firebase-user-2');
assert.equal(fallback.email, 'fallback@example.test');
assert.equal(fallback.displayName, 'Saved Name');
assert.equal(fallback.photoUrl, 'https://example.test/saved.png');

assert.deepEqual(buildUniversalConnectionsStatus({}), {
  enabled: true, configured: false, status: 'NOT_CONFIGURED',
});
const connectionStatus = buildUniversalConnectionsStatus({
  OVYX_CONNECTION_ENCRYPTION_KEY: 'this-is-a-fake-test-key-never-use-for-production',
});
assert.deepEqual(connectionStatus, { enabled: true, configured: true, status: 'CONFIGURED' });
assert.equal(JSON.stringify(connectionStatus).includes('fake-test-key'), false, 'the encryption key must never appear in activation status');

console.log('OVYX workspace activation profile tests passed: authenticated identity fields, fallback preservation, merge-safe plan/billing fields, and secret-safe connection readiness.');
