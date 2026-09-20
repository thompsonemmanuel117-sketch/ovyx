'use strict';

/*
 * OVYX Runtime Lease Manager
 *
 * Firestore collections:
 *   /ovyx_runtime_leases/{uid__projectId}
 *   /ovyx_runtime_sessions/{uid__projectId__tabId}
 *
 * The existing OVYX Firebase server configuration is used through
 * ./firestore.js. This module deliberately does not create a second
 * Firebase Admin application or expose Firebase credentials.
 */

const LEASE_SECONDS = 5 * 60;
const SESSION_SECONDS = 5 * 60;
const MAX_SHUTDOWN_ATTEMPTS = 3;

const LEASE_COLLECTION = 'ovyx_runtime_leases';
const SESSION_COLLECTION = 'ovyx_runtime_sessions';

function clean(value, maxLength = 300) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function runtimeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function assertIdentifier(value, name, maxLength = 300) {
  const normalized = clean(value, maxLength);

  if (!normalized) {
    throw runtimeError(
      `INVALID_${name.toUpperCase()}`,
      `${name} is required.`
    );
  }

  if (/[\u0000-\u001f\u007f]/.test(normalized)) {
    throw runtimeError(
      `INVALID_${name.toUpperCase()}`,
      `${name} contains invalid characters.`
    );
  }

  return normalized;
}

function makeDocumentId(...parts) {
  return parts
    .map((part) => encodeURIComponent(String(part)))
    .join('__');
}

/*
 * Existing OVYX Firebase server connection.
 *
 * The existing _lib/firestore.js is the authoritative server-side
 * Firebase/Firestore connection. We intentionally reuse it instead of
 * calling initializeApp() again here.
 */
async function getFirestoreAdmin(env) {
  try {
    const firestoreModule = require('./firestore.js');

    if (!firestoreModule) {
      throw runtimeError(
        'FIRESTORE_MODULE_UNAVAILABLE',
        'OVYX Firestore server module is unavailable.'
      );
    }

    /*
     * Existing OVYX helper exposes accessToken()/server Firestore
     * configuration. Keep the connection centralized there.
     */
    if (typeof firestoreModule.getFirestore === 'function') {
      const db = await firestoreModule.getFirestore(env);

      if (!db) {
        throw runtimeError(
          'FIRESTORE_UNAVAILABLE',
          'OVYX Firestore service is unavailable.'
        );
      }

      return db;
    }

    if (typeof firestoreModule.db === 'function') {
      const db = await firestoreModule.db(env);

      if (!db) {
        throw runtimeError(
          'FIRESTORE_UNAVAILABLE',
          'OVYX Firestore service is unavailable.'
        );
      }

      return db;
    }

    /*
     * Compatibility with the existing OVYX Firestore REST helper.
     * This path still uses the existing server Firebase credential
     * implementation and does not initialize another Firebase app.
     */
    if (typeof firestoreModule.accessToken === 'function') {
      return {
        __ovyxRestFirestore: true,
        accessToken: async () => firestoreModule.accessToken(env)
      };
    }

    throw runtimeError(
      'FIRESTORE_CONFIGURATION_ERROR',
      'No supported OVYX Firestore server connection was found.'
    );
  } catch (error) {
    if (error?.code) {
      throw error;
    }

    throw runtimeError(
      'FIRESTORE_CONFIGURATION_ERROR',
      error?.message || 'Unable to connect to OVYX Firestore.'
    );
  }
}

function firestoreRestDocumentUrl(projectId, path) {
  return (
    `https://firestore.googleapis.com/v1/projects/` +
    `${encodeURIComponent(projectId)}` +
    `/databases/(default)/documents/` +
    path.map((part) => encodeURIComponent(part)).join('/')
  );
}

function encodeFirestoreValue(value) {
  if (value === null) {
    return { nullValue: null };
  }

  if (typeof value === 'boolean') {
    return { booleanValue: value };
  }

  if (typeof value === 'number' && Number.isInteger(value)) {
    return { integerValue: String(value) };
  }

  if (typeof value === 'number') {
    return { doubleValue: value };
  }

  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map(encodeFirestoreValue)
      }
    };
  }

  if (value && typeof value === 'object') {
    return {
      mapValue: {
        fields: encodeFirestoreFields(value)
      }
    };
  }

  return {
    stringValue: String(value)
  };
}

function encodeFirestoreFields(value) {
  const fields = {};

  for (const [key, item] of Object.entries(value || {})) {
    if (item !== undefined) {
      fields[key] = encodeFirestoreValue(item);
    }
  }

  return fields;
}

function decodeFirestoreValue(value) {
  if (!value) {
    return null;
  }

  if (Object.prototype.hasOwnProperty.call(value, 'stringValue')) {
    return value.stringValue;
  }

  if (Object.prototype.hasOwnProperty.call(value, 'integerValue')) {
    return Number(value.integerValue);
  }

  if (Object.prototype.hasOwnProperty.call(value, 'doubleValue')) {
    return value.doubleValue;
  }

  if (Object.prototype.hasOwnProperty.call(value, 'booleanValue')) {
    return value.booleanValue;
  }

  if (Object.prototype.hasOwnProperty.call(value, 'timestampValue')) {
    return value.timestampValue;
  }

  if (Object.prototype.hasOwnProperty.call(value, 'nullValue')) {
    return null;
  }

  if (Object.prototype.hasOwnProperty.call(value, 'arrayValue')) {
    return (value.arrayValue.values || []).map(decodeFirestoreValue);
  }

  if (Object.prototype.hasOwnProperty.call(value, 'mapValue')) {
    return decodeFirestoreFields(value.mapValue.fields || {});
  }

  return null;
}

function decodeFirestoreFields(fields) {
  const result = {};

  for (const [key, value] of Object.entries(fields || {})) {
    result[key] = decodeFirestoreValue(value);
  }

  return result;
}

async function restFirestoreContext(env) {
  try {
    const firestoreModule = require('./firestore.js');

    if (typeof firestoreModule.accessToken !== 'function') {
      throw runtimeError(
        'FIRESTORE_CONFIGURATION_ERROR',
        'The existing OVYX Firestore access-token helper is unavailable.'
      );
    }

    const result = await firestoreModule.accessToken(env);

    if (!result || !result.token || !result.projectId) {
      throw runtimeError(
        'FIRESTORE_CONFIGURATION_ERROR',
        'The existing OVYX Firestore server configuration is incomplete.'
      );
    }

    return result;
  } catch (error) {
    if (error?.code) {
      throw error;
    }

    throw runtimeError(
      'FIRESTORE_CONFIGURATION_ERROR',
      error?.message || 'Unable to obtain the OVYX Firestore server credential.'
    );
  }
}

async function restFirestoreGet(env, path) {
  try {
    const { token, projectId } = await restFirestoreContext(env);

    const response = await fetch(
      firestoreRestDocumentUrl(projectId, path),
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json'
        }
      }
    );

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw runtimeError(
        'FIRESTORE_READ_FAILED',
        `Firestore read failed with status ${response.status}.`
      );
    }

    const document = await response.json();

    return decodeFirestoreFields(document.fields || {});
  } catch (error) {
    if (error?.code) {
      throw error;
    }

    throw runtimeError(
      'FIRESTORE_READ_FAILED',
      error?.message || 'Unable to read Firestore.'
    );
  }
}

async function restFirestoreSet(env, path, data) {
  try {
    const { token, projectId } = await restFirestoreContext(env);

    const response = await fetch(
      firestoreRestDocumentUrl(projectId, path),
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          fields: encodeFirestoreFields(data)
        })
      }
    );

    if (!response.ok) {
      throw runtimeError(
        'FIRESTORE_WRITE_FAILED',
        `Firestore write failed with status ${response.status}.`
      );
    }
  } catch (error) {
    if (error?.code) {
      throw error;
    }

    throw runtimeError(
      'FIRESTORE_WRITE_FAILED',
      error?.message || 'Unable to write Firestore.'
    );
  }
}

async function restFirestoreDelete(env, path) {
  try {
    const { token, projectId } = await restFirestoreContext(env);

    const response = await fetch(
      firestoreRestDocumentUrl(projectId, path),
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json'
        }
      }
    );

    if (response.status === 404 || response.ok) {
      return;
    }

    throw runtimeError(
      'FIRESTORE_DELETE_FAILED',
      `Firestore delete failed with status ${response.status}.`
    );
  } catch (error) {
    if (error?.code) {
      throw error;
    }

    throw runtimeError(
      'FIRESTORE_DELETE_FAILED',
      error?.message || 'Unable to delete Firestore document.'
    );
  }
}

async function restFirestoreQuery(env, collectionId, structuredQuery) {
  try {
    const { token, projectId } = await restFirestoreContext(env);

    const url =
      `https://firestore.googleapis.com/v1/projects/` +
      `${encodeURIComponent(projectId)}` +
      `/databases/(default)/documents:runQuery`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId }],
          ...structuredQuery
        }
      })
    });

    if (!response.ok) {
      throw runtimeError(
        'FIRESTORE_QUERY_FAILED',
        `Firestore query failed with status ${response.status}.`
      );
    }

    const rows = await response.json();

    return (Array.isArray(rows) ? rows : [])
      .filter((row) => row && row.document)
      .map((row) => ({
        name: row.document.name,
        data: decodeFirestoreFields(row.document.fields || {})
      }));
  } catch (error) {
    if (error?.code) {
      throw error;
    }

    throw runtimeError(
      'FIRESTORE_QUERY_FAILED',
      error?.message || 'Unable to query Firestore.'
    );
  }
}

function leasePath(uid, projectId) {
  return [
    LEASE_COLLECTION,
    makeDocumentId(uid, projectId)
  ];
}

function sessionPath(uid, projectId, tabId) {
  return [
    SESSION_COLLECTION,
    makeDocumentId(uid, projectId, tabId)
  ];
}

async function getDocument(env, path) {
  try {
    const db = await getFirestoreAdmin(env);

    /*
     * If the existing OVYX firestore.js exposes an Admin SDK-style
     * Firestore object, use it directly.
     */
    if (!db.__ovyxRestFirestore && typeof db.collection === 'function') {
      const collection = db.collection(path[0]);

      let reference = collection.doc(path[1]);

      for (let index = 2; index < path.length; index += 2) {
        reference = reference
          .collection(path[index])
          .doc(path[index + 1]);
      }

      const snapshot = await reference.get();

      if (!snapshot.exists) {
        return null;
      }

      return snapshot.data() || {};
    }

    return restFirestoreGet(env, path);
  } catch (error) {
    if (error?.code) {
      throw error;
    }

    throw runtimeError(
      'FIRESTORE_READ_FAILED',
      error?.message || 'Unable to read Firestore document.'
    );
  }
}

async function setDocument(env, path, data) {
  try {
    const db = await getFirestoreAdmin(env);

    if (!db.__ovyxRestFirestore && typeof db.collection === 'function') {
      const collection = db.collection(path[0]);

      let reference = collection.doc(path[1]);

      for (let index = 2; index < path.length; index += 2) {
        reference = reference
          .collection(path[index])
          .doc(path[index + 1]);
      }

      await reference.set(data, { merge: true });

      return;
    }

    await restFirestoreSet(env, path, data);
  } catch (error) {
    if (error?.code) {
      throw error;
    }

    throw runtimeError(
      'FIRESTORE_WRITE_FAILED',
      error?.message || 'Unable to write Firestore document.'
    );
  }
}

async function deleteDocument(env, path) {
  try {
    const db = await getFirestoreAdmin(env);

    if (!db.__ovyxRestFirestore && typeof db.collection === 'function') {
      const collection = db.collection(path[0]);

      let reference = collection.doc(path[1]);

      for (let index = 2; index < path.length; index += 2) {
        reference = reference
          .collection(path[index])
          .doc(path[index + 1]);
      }

      await reference.delete();

      return;
    }

    await restFirestoreDelete(env, path);
  } catch (error) {
    if (error?.code) {
      throw error;
    }

    throw runtimeError(
      'FIRESTORE_DELETE_FAILED',
      error?.message || 'Unable to delete Firestore document.'
    );
  }
}

async function queryCollection(env, collectionId, structuredQuery) {
  try {
    const db = await getFirestoreAdmin(env);

    if (!db.__ovyxRestFirestore && typeof db.collection === 'function') {
      let query = db.collection(collectionId);

      const where = structuredQuery?.where;

      if (where?.fieldFilter) {
        const filter = where.fieldFilter;

        query = query.where(
          filter.field.fieldPath,
          firestoreOperatorToAdmin(filter.op),
          firestoreAdminValue(filter.value)
        );
      }

      if (where?.compositeFilter) {
        for (const filter of where.compositeFilter.filters || []) {
          const fieldFilter = filter.fieldFilter;

          if (!fieldFilter) {
            continue;
          }

          query = query.where(
            fieldFilter.field.fieldPath,
            firestoreOperatorToAdmin(fieldFilter.op),
            firestoreAdminValue(fieldFilter.value)
          );
        }
      }

      if (structuredQuery?.limit) {
        query = query.limit(Number(structuredQuery.limit));
      }

      const snapshot = await query.get();

      return snapshot.docs.map((document) => ({
        name: document.ref.path,
        data: document.data() || {}
      }));
    }

    return restFirestoreQuery(
      env,
      collectionId,
      structuredQuery
    );
  } catch (error) {
    if (error?.code) {
      throw error;
    }

    throw runtimeError(
      'FIRESTORE_QUERY_FAILED',
      error?.message || 'Unable to query Firestore collection.'
    );
  }
}

function firestoreOperatorToAdmin(operator) {
  const map = {
    EQUAL: '==',
    LESS_THAN: '<',
    LESS_THAN_OR_EQUAL: '<=',
    GREATER_THAN: '>',
    GREATER_THAN_OR_EQUAL: '>='
  };

  const result = map[operator];

  if (!result) {
    throw runtimeError(
      'FIRESTORE_QUERY_OPERATOR_UNSUPPORTED',
      `Unsupported Firestore query operator: ${operator}.`
    );
  }

  return result;
}

function firestoreAdminValue(value) {
  if (!value) {
    return null;
  }

  if (Object.prototype.hasOwnProperty.call(value, 'stringValue')) {
    return value.stringValue;
  }

  if (Object.prototype.hasOwnProperty.call(value, 'integerValue')) {
    return Number(value.integerValue);
  }

  if (Object.prototype.hasOwnProperty.call(value, 'doubleValue')) {
    return value.doubleValue;
  }

  if (Object.prototype.hasOwnProperty.call(value, 'booleanValue')) {
    return value.booleanValue;
  }

  if (Object.prototype.hasOwnProperty.call(value, 'timestampValue')) {
    return new Date(value.timestampValue);
  }

  if (Object.prototype.hasOwnProperty.call(value, 'nullValue')) {
    return null;
  }

  return null;
}

async function getActiveSessions(
  env,
  uid,
  projectId,
  now = Date.now()
) {
  try {
    const rows = await queryCollection(
      env,
      SESSION_COLLECTION,
      {
        where: {
          compositeFilter: {
            op: 'AND',
            filters: [
              {
                fieldFilter: {
                  field: { fieldPath: 'uid' },
                  op: 'EQUAL',
                  value: { stringValue: uid }
                }
              },
              {
                fieldFilter: {
                  field: { fieldPath: 'projectId' },
                  op: 'EQUAL',
                  value: { stringValue: projectId }
                }
              },
              {
                fieldFilter: {
                  field: { fieldPath: 'expiresAt' },
                  op: 'GREATER_THAN',
                  value: { integerValue: String(now) }
                }
              }
            ]
          }
        },
        limit: 100
      }
    );

    return rows;
  } catch (error) {
    if (error?.code) {
      throw error;
    }

    throw runtimeError(
      'RUNTIME_SESSION_QUERY_FAILED',
      error?.message || 'Unable to inspect active OVYX runtime tabs.'
    );
  }
}

async function recordHeartbeat(
  env,
  user,
  {
    projectId,
    containerId,
    tabId,
    reason = 'heartbeat'
  }
) {
  try {
    const uid = assertIdentifier(
      user?.uid,
      'uid'
    );

    const project = assertIdentifier(
      projectId,
      'projectId'
    );

    const tab = assertIdentifier(
      tabId,
      'tabId',
      180
    );

    const container = clean(
      containerId,
      300
    );

    const now = Date.now();

    const sessionExpiresAt =
      now + SESSION_SECONDS * 1000;

    const leaseExpiresAt =
      now + LEASE_SECONDS * 1000;

    const session = {
      version: 1,
      uid,
      projectId: project,
      tabId: tab,
      containerId: container || null,
      lastHeartbeatAt: now,
      expiresAt: sessionExpiresAt,
      updatedAt: now,
      reason: clean(reason, 60) || 'heartbeat',
      status: 'active'
    };

    /*
     * The session document is unique per user/project/tab.
     * Therefore a second tab cannot overwrite the first tab's
     * tracking record.
     */
    await setDocument(
      env,
      sessionPath(uid, project, tab),
      session
    );

    const leaseDocument =
      await getDocument(
        env,
        leasePath(uid, project)
      );

    const existingLeaseUntil =
      Number(
        leaseDocument?.leaseUntilAt || 0
      );

    const existingContainer =
      clean(
        leaseDocument?.containerId,
        300
      );

    await setDocument(
      env,
      leasePath(uid, project),
      {
        version: 2,
        uid,
        projectId: project,
        containerId:
          container ||
          existingContainer ||
          null,
        lastHeartbeatAt: now,
        leaseUntilAt:
          Math.max(
            leaseExpiresAt,
            existingLeaseUntil
          ),
        activeTabHint: tab,
        updatedAt: now,
        status: 'active'
      }
    );

    return {
      projectId: project,
      tabId: tab,
      leaseUntilAt: leaseExpiresAt,
      sessionExpiresAt
    };
  } catch (error) {
    if (error?.code) {
      throw error;
    }

    throw runtimeError(
      'RUNTIME_HEARTBEAT_FAILED',
      error?.message ||
        'Unable to renew the OVYX runtime lease.'
    );
  }
}

async function removeRuntimeDocument(
  env,
  path
) {
  try {
    await deleteDocument(env, path);
  } catch (error) {
    if (error?.code) {
      throw error;
    }

    throw runtimeError(
      'RUNTIME_DOCUMENT_DELETE_FAILED',
      error?.message ||
        'Unable to remove an OVYX runtime document.'
    );
  }
}

async function shutdownContainer(
  env,
  lease
) {
  const url = clean(
    env?.OVYX_CONTAINER_SHUTDOWN_URL,
    2000
  );

  const token = clean(
    env?.OVYX_CONTAINER_SHUTDOWN_TOKEN,
    4000
  );

  /*
   * Missing credentials are explicitly NOT treated as success.
   */
  if (!url || !token) {
    return {
      ok: false,
      code: 'CONTAINER_SHUTDOWN_NOT_CONFIGURED',
      attempts: 0
    };
  }

  const payload = {
    uid: lease.uid,
    projectId: lease.projectId,
    containerId: lease.containerId || null,
    reason: 'OVYX_AUTO_SHUTDOWN_IDLE_5_MINUTES',
  lastHeartbeat: lease.lastHeartbeatAt || 0,
  requestId: Date.now()
}

let lastError = null;
for (let attempt = 1; attempt <= MAX_SHUTDOWN_ATTEMPTS; attempt++) {
  try {
    const response = await fetch(
      url,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      }
    );

    const responseText = await response.text();
    let responseBody = {};
    try {
      responseBody = responseText ? JSON.parse(responseText) : {};
    } catch {
      responseBody = {};
    }

    if (response.ok) {
      return {
        ok: true,
        attempt,
        provider: responseBody.provider || null
      };
    }

    lastError = responseBody.message || responseBody.error || `Shutdown provider returned HTTP ${response.status}: ${responseText}`;

  } catch (error) {
    lastError = error.message || 'Container shutdown request failed.';
  }

  if (attempt < MAX_SHUTDOWN_ATTEMPTS) {
    await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
  }
}

return {
  ok: false,
  code: 'CONTAINER_SHUTDOWN_FAILED',
  attempts: MAX_SHUTDOWN_ATTEMPTS,
  message: lastError
};

async function sweepRuntimeLeases(env, now = Date.now()) {
  const queryCollection = env.LEASE_COLLECTION;
  const SESSION_COLLECTION = env.SESSION_COLLECTION;

  try {
    const expiredLeases = await queryCollection.where({
      fieldFilter: {
        fieldPath: 'leaseUntilAt',
        op: 'LESS_THAN_OR_EQUAL',
        value: {
          integerValue: String(now)
        }
      }
    }).limit(100).get();

    const results = [];

    for (const row of expiredLeases) {
      const lease = row.data || {};
      const data = row.data || {};

      if (!lease.uid || !lease.projectId) continue;

      const lastHeartbeatAt = Number(lease.lastHeartbeatAt) || 0;
      const projectId = lease.projectId;

      // First protection pass: quick check if tab is still alive
      if (now - lastHeartbeatAt < LEASE_SECONDS * 1000) {
        continue;
      }

      // First protection pass: check whether another tab is still alive.
      let sessions = await getActiveSessions(env, lease.uid, lease.projectId);

      if (sessions.length > 0) {
        const latestExpiry = Math.max(...sessions.map(s => s.data?.sessionExpiryAt || 0));
        
        await leaseUpdate(env, {
          leaseExpiry: latestExpiry,
          lastHeartbeatAt,
          latestExpiry: latestExpiry + LEASE_SECONDS * 1000,
          updatedAt: now,
          status: 'active'
        });

        results.push({
          projectId,
          action: 'LEASE_EXTENDED_ACTIVE_TAB',
          activeTabs: sessions.length
        });
        continue;
      }

      // Second protection pass: re-read lease immediately before attempting shutdown
      // This closes the race where a heartbeat arrives while processor is processing the expired document.
      const latestLease = await getDocument(env, leasePath(lease.uid, lease.projectId));

      if (!latestLease) continue;

      if (Number(latestLease.leaseUntilAt) || 0 > Date.now()) {
        continue;
      }

      // Third protection pass: query tabs again immediately before the physical kill
      sessions = await getActiveSessions(env, lease.uid, lease.projectId);
      if (sessions.length > 0) continue;

      const shutdownResult = await shutdownContainer(env, lease);

      if (!shutdownResult.ok) {
        await setDocument(env, leasePath(lease.uid, lease.projectId), {
          lastShutdownError: shutdownResult.message || shutdownResult.code,
          lastShutdownCode: shutdownResult.code,
          lastShutdownAttempts: shutdownResult.attempts || 0,
          updatedAt: Date.now(),
          status: 'shutdown_pending'
        });

        results.push({
          projectId: lease.projectId,
          action: shutdownResult.code,
          ok: false,
          attempts: shutdownResult.attempts || 0
        });
        continue;
      }

      // Only remove the lease after the provider has accepted the shutdown request.
      await removeLeaseDocument(env, lease.uid, lease.projectId);

      // Delete only the stale sessions associated with this project
      // The project was checked immediately before shutdown
      const staleSessions = await queryCollection.where({
        compositeFilter: {
          op: 'AND',
          filters: [
            {
              fieldFilter: {
                fieldPath: 'uid',
                op: 'EQUAL',
                value: { stringValue: lease.uid }
              }
            },
            {
              fieldFilter: {
                fieldPath: 'projectId',
                op: 'EQUAL',
                value: { stringValue: lease.projectId }
              }
            }
          ]
        },
        limit: 100
      }).get();

      for (const session of staleSessions) {
        const sessionName = session.name || '';
        const sessionId = sessionName.split('/').pop();
        if (!sessionId) continue;

        await removeRuntimeDocument(env, SESSION_COLLECTION, sessionId);
      }

      results.push({
        projectId: lease.projectId,
        action: 'CONTAINER_SHUTDOWN',
        attempts: shutdownResult.attempts || 1
      });
    }

    return {
      scanned: expiredLeases.length,
      expiredLeases: results.length,
      results
    };

  } catch (error) {
    if (error.code) throw error;
    throw runtimeError('RUNTIME_SWEEP_FAILED', 'Unable to sweep OVYX runtime leases.');
  }
}

module.exports = {
  LEASE_SECONDS,
  MAX_SHUTDOWN_ATTEMPTS,
  getActiveSessions,
  sweepRuntimeLeases
};

// functions/api/runtime/heartbeat.js
