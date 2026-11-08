import {
  createFirestoreDocumentAtPath,
  firestoreDocumentToJs,
  getFirestoreDocumentAtPath,
  setFirestoreDocumentAtPath,
} from '../api/_lib/firebase-admin.js';

const STATES = new Set([
  'reserved', 'provisioning', 'migrating', 'building', 'deploying',
  'verifying', 'ready', 'failed', 'recovery_required', 'rolled_back',
]);
const TRANSITIONS = Object.freeze({
  reserved: ['provisioning', 'failed', 'recovery_required'],
  provisioning: ['migrating', 'building', 'failed', 'recovery_required'],
  migrating: ['building', 'failed', 'recovery_required'],
  building: ['deploying', 'failed', 'recovery_required'],
  deploying: ['verifying', 'failed', 'recovery_required'],
  verifying: ['ready', 'failed', 'recovery_required'],
  ready: [],
  failed: [],
  recovery_required: [],
  rolled_back: [],
});
const PATCH_FIELDS = new Set([
  'resourceIds', 'migrationVersionsApplied', 'deploymentId',
  'lastErrorCode', 'lastErrorAt',
]);
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

function fail(code, message, status = 400) {
  throw Object.assign(new Error(message), { code, status });
}
function iso(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) fail('PROVISIONING_TIME_INVALID', 'A valid provisioning timestamp is required.');
  return date.toISOString();
}
async function hash(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value)));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}
function documentId(plan) {
  if (!/^[a-f0-9]{16}$/.test(String(plan?.namespace || '')) ||
      !['preview', 'production'].includes(plan?.environment)) {
    fail('PROVISIONING_PLAN_INVALID', 'The backend provisioning plan is invalid.');
  }
  return plan.namespace + '-' + plan.environment;
}
function sanitizePatch(patch = {}) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    fail('PROVISIONING_PATCH_INVALID', 'The provisioning update is invalid.');
  }
  const result = {};
  for (const [key, value] of Object.entries(patch)) {
    if (!PATCH_FIELDS.has(key)) fail('PROVISIONING_PATCH_FIELD_INVALID', 'The provisioning update contains an unsupported field.');
    if (key === 'resourceIds') {
      if (!value || typeof value !== 'object' || Array.isArray(value) ||
          Object.keys(value).length > 12 ||
          Object.entries(value).some(([name, id]) => !/^[a-z][a-zA-Z0-9]{0,39}$/.test(name) || (id !== null && (typeof id !== 'string' || id.length > 180)))) {
        fail('PROVISIONING_RESOURCE_IDS_INVALID', 'Provisioned resource identifiers are invalid.');
      }
      result.resourceIds = value;
    } else if (key === 'migrationVersionsApplied') {
      if (!Array.isArray(value) || value.length > 500 ||
          value.some(version => !Number.isSafeInteger(version) || version < 1)) {
        fail('PROVISIONING_MIGRATIONS_INVALID', 'Applied migration versions are invalid.');
      }
      result.migrationVersionsApplied = [...new Set(value)].sort((a, b) => a - b);
    } else if (key === 'deploymentId') {
      if (value !== null && (typeof value !== 'string' || value.length > 180 || !/^[A-Za-z0-9_-]+$/.test(value))) {
        fail('PROVISIONING_DEPLOYMENT_ID_INVALID', 'The deployment identifier is invalid.');
      }
      result.deploymentId = value;
    } else if (key === 'lastErrorCode') {
      if (value !== null && (typeof value !== 'string' || !/^[A-Z0-9_]{1,80}$/.test(value))) {
        fail('PROVISIONING_ERROR_CODE_INVALID', 'Only a sanitized error code may be recorded.');
      }
      result.lastErrorCode = value;
    } else if (key === 'lastErrorAt') {
      result.lastErrorAt = value === null ? null : iso(value);
    }
  }
  return result;
}

/**
 * A durable Firestore operation registry. The document contains hashes and
 * resource metadata only; raw owner/project identifiers and secret values
 * are never stored.
 */
export function createFirestoreProvisioningRegistry(env) {
  const pathFor = key => ['backend_provisioning', key];
  return {
    async read(key) {
      const raw = await getFirestoreDocumentAtPath(env, pathFor(key));
      return raw ? { data: firestoreDocumentToJs(raw), updateTime: raw.updateTime } : null;
    },
    async create(key, data) {
      const raw = await createFirestoreDocumentAtPath(env, pathFor(key), data);
      return { data: firestoreDocumentToJs(raw), updateTime: raw.updateTime };
    },
    async compareAndSet(key, data, updateTime) {
      const raw = await setFirestoreDocumentAtPath(env, pathFor(key), data, {
        merge: false,
        expectedUpdateTime: updateTime,
      });
      return { data: firestoreDocumentToJs(raw), updateTime: raw.updateTime };
    },
  };
}

/**
 * Reserves a single operation per owner/project/environment. Firestore's
 * exists=false and updateTime preconditions prevent duplicate concurrent
 * reservations and lost updates.
 */
export async function reserveBackendProvisioningOperation({
  store, plan, ownerUid, projectId, operationId, now = new Date().toISOString(),
  leaseMs = 120_000,
} = {}) {
  if (!store || typeof store.read !== 'function' || typeof store.create !== 'function' ||
      typeof store.compareAndSet !== 'function') fail('PROVISIONING_STORE_INVALID', 'The provisioning registry is unavailable.', 503);
  if (typeof ownerUid !== 'string' || !ownerUid || ownerUid.length > 128 ||
      typeof projectId !== 'string' || !SAFE_ID.test(projectId) ||
      typeof operationId !== 'string' || !SAFE_ID.test(operationId)) {
    fail('PROVISIONING_IDENTITY_INVALID', 'A verified owner, saved project and operation ID are required.');
  }
  if (!Number.isSafeInteger(leaseMs) || leaseMs < 10_000 || leaseMs > 600_000) {
    fail('PROVISIONING_LEASE_INVALID', 'The provisioning lease duration is invalid.');
  }
  const key = documentId(plan);
  const timestamp = iso(now);
  const expiresAt = new Date(Date.parse(timestamp) + leaseMs).toISOString();
  const [ownerHash, projectHash] = await Promise.all([hash(ownerUid), hash(projectId)]);
  const initial = {
    schemaVersion: 1,
    namespace: plan.namespace,
    environment: plan.environment,
    ownerHash,
    projectHash,
    resourceNames: plan.resources,
    state: 'reserved',
    operationId,
    attempt: 1,
    leaseExpiresAt: expiresAt,
    createdAt: timestamp,
    updatedAt: timestamp,
    migrationVersionsApplied: [],
    resourceIds: {},
    deploymentId: null,
    lastErrorCode: null,
    lastErrorAt: null,
  };
  let current = await store.read(key);
  if (!current) {
    try {
      const created = await store.create(key, initial);
      return { outcome: 'reserved', key, data: created.data, record: created.data, updateTime: created.updateTime };
    } catch (error) {
      if (error?.code !== 'FIRESTORE_CREATE_CONFLICT' && error?.status !== 409) throw error;
      current = await store.read(key);
      if (!current) fail('PROVISIONING_RESERVATION_RACE', 'The provisioning reservation changed; retry safely.', 409);
    }
  }
  const record = current.data || {};
  if (record.ownerHash !== ownerHash || record.projectHash !== projectHash ||
      record.namespace !== plan.namespace || record.environment !== plan.environment) {
    fail('PROVISIONING_OWNERSHIP_CONFLICT', 'The provisioning namespace does not match this saved project.', 409);
  }
  if (record.state === 'ready') return { outcome: 'already_ready', key, data: record, record, updateTime: current.updateTime };
  if (record.state === 'recovery_required' || record.state === 'reserved' ||
      ['provisioning', 'migrating', 'building', 'deploying', 'verifying'].includes(record.state)) {
    const leaseEnd = Date.parse(record.leaseExpiresAt || '');
    if (Number.isFinite(leaseEnd) && leaseEnd > Date.parse(timestamp)) {
      return { outcome: 'busy', key, data: record, record, updateTime: current.updateTime };
    }
    return { outcome: 'recovery_required', key, data: record, record, updateTime: current.updateTime };
  }
  if (!['failed', 'rolled_back'].includes(record.state)) {
    fail('PROVISIONING_STATE_INVALID', 'The saved provisioning state is invalid.', 409);
  }
  const retry = {
    ...record,
    state: 'reserved',
    operationId,
    attempt: Math.min(Number(record.attempt || 0) + 1, 1_000_000),
    leaseExpiresAt: expiresAt,
    updatedAt: timestamp,
    lastErrorCode: null,
    lastErrorAt: null,
  };
  const saved = await store.compareAndSet(key, retry, current.updateTime);
  return { outcome: 'reserved', key, data: saved.data, record: saved.data, updateTime: saved.updateTime };
}

export async function transitionBackendProvisioningOperation({
  store, key, current, operationId, nextState, patch = {},
  now = new Date().toISOString(), leaseMs = 120_000,
} = {}) {
  if (!store || typeof store.compareAndSet !== 'function' || !current?.data || !current.updateTime) {
    fail('PROVISIONING_CAS_REQUIRED', 'A current provisioning record is required for a safe update.', 409);
  }
  if (!SAFE_ID.test(String(key || '')) || current.data.operationId !== operationId) {
    fail('PROVISIONING_OPERATION_MISMATCH', 'This provisioning operation no longer owns the active lease.', 409);
  }
  const from = current.data.state;
  if (!STATES.has(nextState) || !TRANSITIONS[from]?.includes(nextState)) {
    fail('PROVISIONING_TRANSITION_INVALID', 'This provisioning state transition is not allowed.', 409);
  }
  const timestamp = iso(now);
  const safePatch = sanitizePatch(patch);
  const active = !['ready', 'failed', 'recovery_required', 'rolled_back'].includes(nextState);
  const next = {
    ...current.data,
    ...safePatch,
    state: nextState,
    updatedAt: timestamp,
    leaseExpiresAt: active
      ? new Date(Date.parse(timestamp) + Math.min(Math.max(leaseMs, 10_000), 600_000)).toISOString()
      : null,
  };
  const saved = await store.compareAndSet(key, next, current.updateTime);
  return { key, data: saved.data, record: saved.data, updateTime: saved.updateTime };
}
