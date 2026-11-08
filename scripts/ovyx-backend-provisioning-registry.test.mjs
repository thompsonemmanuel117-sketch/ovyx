import assert from 'node:assert/strict';
import {
  reserveBackendProvisioningOperation,
  transitionBackendProvisioningOperation,
} from '../functions/_lib/backend-provisioning-registry.js';

function memoryStore() {
  const docs = new Map();
  let version = 0;
  return {
    async read(key) { const item = docs.get(key); return item ? structuredClone(item) : null; },
    async create(key, data) {
      if (docs.has(key)) throw Object.assign(new Error('exists'), { code: 'FIRESTORE_CREATE_CONFLICT', status: 409 });
      const item = { data: structuredClone(data), updateTime: String(++version) };
      docs.set(key, item); return structuredClone(item);
    },
    async compareAndSet(key, data, expected) {
      const current = docs.get(key);
      if (!current || current.updateTime !== expected) throw Object.assign(new Error('stale'), { code: 'FIRESTORE_PRECONDITION_FAILED', status: 409 });
      const item = { data: structuredClone(data), updateTime: String(++version) };
      docs.set(key, item); return structuredClone(item);
    },
  };
}
const plan = {
  namespace: '0123456789abcdef',
  environment: 'preview',
  resources: { workerScript: 'ovyx-test-preview', database: 'ovyx-test-preview', databaseBinding: 'DB' },
};
const store = memoryStore();
const reserved = await reserveBackendProvisioningOperation({
  store, plan, ownerUid: 'firebase-user-1', projectId: 'saved-project-1',
  operationId: 'operation-1', now: '2026-11-08T10:00:00.000Z',
});
assert.equal(reserved.outcome, 'reserved');
assert.equal(reserved.record.state, 'reserved');
assert.equal(reserved.record.ownerUid, undefined);
assert.equal(reserved.record.projectId, undefined);
assert.match(reserved.record.ownerHash, /^[a-f0-9]{64}$/);
assert.match(reserved.record.projectHash, /^[a-f0-9]{64}$/);

const busy = await reserveBackendProvisioningOperation({
  store, plan, ownerUid: 'firebase-user-1', projectId: 'saved-project-1',
  operationId: 'operation-2', now: '2026-11-08T10:00:30.000Z',
});
assert.equal(busy.outcome, 'busy');
assert.equal(busy.record.operationId, 'operation-1');

await assert.rejects(
  reserveBackendProvisioningOperation({
    store, plan, ownerUid: 'firebase-user-2', projectId: 'saved-project-1',
    operationId: 'operation-3', now: '2026-11-08T10:00:40.000Z',
  }),
  error => error.code === 'PROVISIONING_OWNERSHIP_CONFLICT',
);

const provisioning = await transitionBackendProvisioningOperation({
  store, key: reserved.key, current: reserved, operationId: 'operation-1',
  nextState: 'provisioning', now: '2026-11-08T10:00:45.000Z',
});
const migrating = await transitionBackendProvisioningOperation({
  store, key: reserved.key, current: provisioning, operationId: 'operation-1',
  nextState: 'migrating', patch: { migrationVersionsApplied: [1, 2, 2] },
  now: '2026-11-08T10:01:00.000Z',
});
assert.deepEqual(migrating.record.migrationVersionsApplied, [1, 2]);
await assert.rejects(
  transitionBackendProvisioningOperation({
    store, key: reserved.key, current: migrating, operationId: 'operation-1',
    nextState: 'ready', now: '2026-11-08T10:01:10.000Z',
  }),
  error => error.code === 'PROVISIONING_TRANSITION_INVALID',
);
await assert.rejects(
  transitionBackendProvisioningOperation({
    store, key: reserved.key, current: migrating, operationId: 'operation-1',
    nextState: 'building', patch: { ownerUid: 'attacker' },
    now: '2026-11-08T10:01:10.000Z',
  }),
  error => error.code === 'PROVISIONING_PATCH_FIELD_INVALID',
);

const failed = await transitionBackendProvisioningOperation({
  store, key: reserved.key, current: migrating, operationId: 'operation-1',
  nextState: 'failed', patch: { lastErrorCode: 'D1_CREATE_FAILED' },
  now: '2026-11-08T10:01:20.000Z',
});
const retry = await reserveBackendProvisioningOperation({
  store, plan, ownerUid: 'firebase-user-1', projectId: 'saved-project-1',
  operationId: 'operation-4', now: '2026-11-08T10:02:00.000Z',
});
assert.equal(retry.outcome, 'reserved');
assert.equal(retry.record.attempt, 2);
assert.equal(retry.record.lastErrorCode, null);

const expiringStore = memoryStore();
const expiringReservation = await reserveBackendProvisioningOperation({
  store: expiringStore, plan: { ...plan, namespace: 'fedcba9876543210' },
  ownerUid: 'firebase-user-1', projectId: 'saved-project-1',
  operationId: 'operation-expiring', now: '2026-11-08T10:00:00.000Z', leaseMs: 10_000,
});
await transitionBackendProvisioningOperation({
  store: expiringStore, key: expiringReservation.key, current: expiringReservation,
  operationId: 'operation-expiring', nextState: 'provisioning',
  now: '2026-11-08T10:00:01.000Z', leaseMs: 10_000,
});
const recovery = await reserveBackendProvisioningOperation({
  store: expiringStore, plan: { ...plan, namespace: 'fedcba9876543210' },
  ownerUid: 'firebase-user-1', projectId: 'saved-project-1',
  operationId: 'operation-recovery', now: '2026-11-08T10:01:00.000Z',
});
assert.equal(recovery.outcome, 'recovery_required');

console.log('OVYX durable backend provisioning registry tests passed.');
