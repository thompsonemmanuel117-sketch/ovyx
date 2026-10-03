'use strict';

const { verifyFirebaseIdToken } = require('../_lib/auth.js');
const { errorResponse, jsonResponse } = require('../_lib/http.js');
const {
  getFirestoreDocumentAtPath,
  getFirestoreDataAtPath,
  setFirestoreDocumentAtPath,
  deleteFirestoreDocumentAtPath,
  listFirestoreSubcollectionDocuments
} = require('../_lib/firebase-admin.js');

const ROOT_EMAIL = 'ovyxsupportteam@gmail.com';
const LIMITS = Object.freeze({ free: 3, pro: 5, max: Infinity });
const ALLOWED_TYPES = new Set(['webhook', 'tool', 'database']);

function clean(value, max = 400) {
  return String(value ?? '').trim().slice(0, max);
}

function uidOf(user) {
  return clean(user?.uid || user?.sub, 180);
}

function emailOf(user) {
  return clean(user?.email, 320).toLowerCase();
}

function activeTier(profile, userEmail) {
  if (userEmail === ROOT_EMAIL) return 'max';
  const state = clean(profile?.planTierState, 60).toLowerCase();
  if (['expired', 'refunded', 'chargeback', 'suspended', 'canceled'].includes(state)) return 'free';
  const tier = clean(profile?.planTier || profile?.tier || profile?.plan || 'free', 20).toLowerCase();
  return ['pro', 'max'].includes(tier) ? tier : 'free';
}

function limitFor(tier) {
  return LIMITS[tier] ?? 3;
}

function connectionId(value) {
  const id = clean(value, 100);
  if (!id) return crypto.randomUUID().replace(/-/g, '').slice(0, 28);
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) {
    throw Object.assign(new Error('Connection ID is invalid.'), {
      status: 400,
      code: 'INVALID_CONNECTION_ID'
    });
  }
  return id;
}

function normalizeUrl(value) {
  const raw = clean(value, 1200);
  if (!raw) return '';
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw Object.assign(new Error('Connection endpoint must be a valid URL.'), {
      status: 400,
      code: 'INVALID_CONNECTION_URL'
    });
  }
  if (!['https:', 'http:'].includes(parsed.protocol)) {
    throw Object.assign(new Error('Connection endpoint must use HTTP or HTTPS.'), {
      status: 400,
      code: 'INVALID_CONNECTION_PROTOCOL'
    });
  }
  return parsed.toString();
}

function sanitizeConnection(body, owner) {
  const type = clean(body?.type || 'tool', 30).toLowerCase();
  if (!ALLOWED_TYPES.has(type)) {
    throw Object.assign(new Error('Connection type must be webhook, tool or database.'), {
      status: 400,
      code: 'INVALID_CONNECTION_TYPE'
    });
  }
  const name = clean(body?.name, 120);
  if (!name) throw Object.assign(new Error('Connection name is required.'), { status: 400, code: 'CONNECTION_NAME_REQUIRED' });

  const endpoint = normalizeUrl(body?.endpoint || body?.healthUrl);
  if (!endpoint) {
    throw Object.assign(new Error('A real HTTPS/HTTP connection endpoint is required.'), {
      status: 400,
      code: 'CONNECTION_ENDPOINT_REQUIRED'
    });
  }

  return {
    name,
    type,
    endpoint,
    healthUrl: normalizeUrl(body?.healthUrl || endpoint),
    active: body?.active !== false,
    ownerUid: owner.uid,
    ownerEmail: owner.email,
    updatedAt: new Date().toISOString()
  };
}

async function identity(request, env) {
  const result = await verifyFirebaseIdToken(request, env);
  if (!result.ok) return result;
  const uid = uidOf(result.user);
  const email = emailOf(result.user);
  if (!uid || !email) {
    return {
      ok: false,
      response: errorResponse(401, 'AUTH_IDENTITY_REQUIRED', 'A verified Firebase identity is required.')
    };
  }
  return { ok: true, user: result.user, uid, email };
}

async function loadContext(env, email) {
  const profile = await getFirestoreDataAtPath(env, ['users', email]) || {};
  const tier = activeTier(profile, email);
  const limit = limitFor(tier);
  const rows = await listFirestoreSubcollectionDocuments(env, 'users', email, 'universal_connections', 100);
  const connections = rows.map(row => ({ ...(row.data || {}), id: row.id }));
  const active = connections.filter(item => item.active === true);
  return { profile, tier, limit, connections, active };
}

async function testEndpoint(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  const started = Date.now();
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'manual',
      signal: controller.signal,
      headers: { 'User-Agent': 'OVYX-Connection-Check/1.0' }
    });
    return {
      ok: response.status >= 200 && response.status < 500,
      status: response.status,
      latencyMs: Date.now() - started
    };
  } finally {
    clearTimeout(timer);
  }
}

async function onRequest(context) {
  const request = context.request;
  const auth = await identity(request, context.env);
  if (!auth.ok) return auth.response;

  const base = ['users', auth.email, 'universal_connections'];

  try {
    const state = await loadContext(context.env, auth.email);

    if (request.method === 'GET') {
      return jsonResponse({
        ok: true,
        tier: state.tier,
        limit: state.limit === Infinity ? null : state.limit,
        activeCount: state.active.length,
        totalCount: state.connections.length,
        connections: state.connections
      });
    }

    if (request.method === 'DELETE') {
      const id = connectionId(new URL(request.url).searchParams.get('id'));
      const current = await getFirestoreDocumentAtPath(context.env, [...base, id]);
      if (!current) return errorResponse(404, 'CONNECTION_NOT_FOUND', 'Connection not found.');
      const record = await getFirestoreDataAtPath(context.env, [...base, id]);
      if (record?.ownerUid !== auth.uid || record?.ownerEmail !== auth.email) {
        return errorResponse(403, 'CONNECTION_ACCESS_DENIED', 'Connection does not belong to this account.');
      }
      await deleteFirestoreDocumentAtPath(context.env, [...base, id], current.updateTime);
      return jsonResponse({ ok: true, deleted: true, id });
    }

    if (request.method !== 'POST' && request.method !== 'PUT') {
      return errorResponse(405, 'METHOD_NOT_ALLOWED', 'GET, POST, PUT or DELETE is required.');
    }

    const body = await request.json();
    const id = connectionId(body?.id);
    const record = sanitizeConnection(body, { uid: auth.uid, email: auth.email });
    const currentDoc = await getFirestoreDocumentAtPath(context.env, [...base, id]);
    const currentRecord = currentDoc ? await getFirestoreDataAtPath(context.env, [...base, id]) : null;
    const currentWasActive = currentRecord?.active === true;
    const requestedActive = record.active === true;
    const limit = state.limit;

    if (requestedActive && !currentWasActive && state.active.length >= limit) {
      return jsonResponse({
        ok: false,
        error: 'CONNECTION_LIMIT_REACHED',
        message: `Your ${state.tier === 'free' ? 'Free Trial' : state.tier === 'pro' ? 'Pro Plan' : 'Max Plan'} allows ${limit === Infinity ? 'unlimited' : limit} active universal connections.`,
        tier: state.tier,
        limit: limit === Infinity ? null : limit,
        activeCount: state.active.length,
        upgradeRequired: state.tier !== 'max'
      }, 409);
    }

    await setFirestoreDocumentAtPath(
      context.env,
      [...base, id],
      {
        ...record,
        createdAt: currentRecord?.createdAt || new Date().toISOString()
      },
      {
        merge: true,
        expectedUpdateTime: currentDoc?.updateTime || null
      }
    );

    const latest = await getFirestoreDataAtPath(context.env, [...base, id]);
    return jsonResponse({
      ok: true,
      connection: { ...(latest || record), id },
      tier: state.tier,
      limit: limit === Infinity ? null : limit,
      activeCount: requestedActive
        ? state.active.length + (currentWasActive ? 0 : 1)
        : Math.max(0, state.active.length - (currentWasActive ? 1 : 0))
    });
  } catch (error) {
    return errorResponse(
      error?.status || 500,
      error?.code || 'UNIVERSAL_CONNECTIONS_FAILED',
      error?.message || 'Universal connection operation failed.'
    );
  }
}

module.exports = { onRequest };
