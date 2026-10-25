import { verifyFirebaseIdToken } from '../_lib/auth.js';
import { errorResponse, jsonResponse } from '../_lib/http.js';
import {
  getFirestoreDocumentAtPath,
  getFirestoreDataAtPath,
  setFirestoreDocumentAtPath,
  deleteFirestoreDocumentAtPath,
  listFirestoreSubcollectionDocuments
} from '../../_lib/firebase-admin.js';
import {
  buildConnectionRecord,
  publicConnection,
  testUserConnection,
  supportsAIProtocol
} from '../../_lib/universal-connections.js';

const ROOT_EMAIL = 'ovyxsupportteam@gmail.com';
export const UNIVERSAL_CONNECTION_LIMITS = Object.freeze({ free: 3, pro: 5, max: Infinity });
const LIMITS = UNIVERSAL_CONNECTION_LIMITS;

function clean(value, max = 400) {
  return String(value ?? '').trim().slice(0, max);
}

function uidOf(user) {
  return clean(user?.uid || user?.sub, 180);
}

function emailOf(user) {
  return clean(user?.email, 320).toLowerCase();
}

export function resolveConnectionTier(profile = {}, userEmail = '', now = Date.now()) {
  const email = clean(userEmail, 320).toLowerCase();
  if (email === ROOT_EMAIL) return 'max';
  const state = clean(profile?.planTierState, 60).toLowerCase();
  if (!['active', 'trialing'].includes(state)) return 'free';
  const rawExpiry = profile?.expiresAt;
  const numericExpiry = Number(rawExpiry);
  const expiresAt = Number.isFinite(numericExpiry) && numericExpiry > 0 ? numericExpiry : (rawExpiry ? Date.parse(String(rawExpiry)) : NaN);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return 'free';
  const tier = clean(profile?.planTier || profile?.tier || profile?.plan || 'free', 20).toLowerCase();
  return ['pro', 'max'].includes(tier) ? tier : 'free';
}
function activeTier(profile, userEmail) { return resolveConnectionTier(profile, userEmail); }

function limitFor(tier) {
  return LIMITS[tier] ?? 3;
}

function connectionId(value) {
  const id = clean(value, 100);
  if (!id) return crypto.randomUUID().replace(/-/g, '').slice(0, 28);
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) {
    throw Object.assign(new Error('The selected connection could not be identified.'), {
      status: 400,
      code: 'INVALID_CONNECTION_ID'
    });
  }
  return id;
}

async function identity(request, env) {
  const result = await verifyFirebaseIdToken(request, env);
  if (!result.ok) return result;
  const uid = uidOf(result.user);
  const email = emailOf(result.user);
  if (!uid || !email) {
    return {
      ok: false,
      response: errorResponse(401, 'AUTH_IDENTITY_REQUIRED', 'Please sign in again to verify your account.')
    };
  }
  return { ok: true, user: result.user, uid, email };
}

async function loadContext(env, uid, email) {
  const profile = await getFirestoreDataAtPath(env, ['users', uid]) || {};
  const tier = activeTier(profile, email);
  const limit = limitFor(tier);
  const rows = await listFirestoreSubcollectionDocuments(env, 'users', email, 'universal_connections', 100);
  const connections = rows.map(row => ({ ...(row.data || {}), id: row.id }));
  const active = connections.filter(item => item.active === true);
  return {
    profile,
    tier,
    limit,
    connections,
    active,
    activeBrainConnectionId: clean(profile?.activeBrainConnectionId, 100) || null,
    activeWebStudioConnectionId: clean(profile?.activeWebStudioConnectionId, 100) || null
  };
}

async function changeActiveCount(
  env,
  uid,
  email,
  delta,
  limit
) {
  if (limit === Infinity || delta === 0) {
    return {
      ok: true,
      count: null,
      changed: false
    };
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const userDoc =
      await getFirestoreDocumentAtPath(
        env,
        ['users', uid]
      );

    if (!userDoc) {
      throw Object.assign(
        new Error('Your OVYX workspace profile is not ready yet. Refresh the page and try again.'),
        {
          status: 409,
          code: 'WORKSPACE_PROFILE_REQUIRED'
        }
      );
    }

    const profile =
      await getFirestoreDataAtPath(
        env,
        ['users', uid]
      ) || {};

    let current =
      Number.isSafeInteger(
        Number(profile.universalConnectionsActiveCount)
      )
        ? Number(profile.universalConnectionsActiveCount)
        : null;

    if (current === null || current < 0) {
      const rows =
        await listFirestoreSubcollectionDocuments(
          env,
          'users',
          email,
          'universal_connections',
          100
        );

      current = rows.filter(
        row => row?.data?.active === true
      ).length;
    }

    const next =
      Math.max(
        0,
        current + delta
      );

    if (
      delta > 0 &&
      next > limit
    ) {
      return {
        ok: false,
        count: current,
        changed: false
      };
    }

    try {
      await setFirestoreDocumentAtPath(
        env,
        ['users', uid],
        {
          universalConnectionsActiveCount:
            next
        },
        {
          merge: true,
          expectedUpdateTime:
            userDoc.updateTime
        }
      );

      return {
        ok: true,
        count: next,
        changed: true
      };
    } catch (error) {
      if (
        error?.status === 409 ||
        error?.code ===
          'FIRESTORE_PRECONDITION_FAILED'
      ) {
        continue;
      }
      throw error;
    }
  }

  throw Object.assign(
    new Error(
      'The universal connection limit changed concurrently. Please retry.'
    ),
    {
      status: 409,
      code: 'CONNECTION_LIMIT_CONFLICT'
    }
  );
}

async function onRequest(context) {
  const request = context.request;
  const auth = await identity(request, context.env);
  if (!auth.ok) return auth.response;

  const base = ['users', auth.email, 'universal_connections'];

  try {
    const state = await loadContext(context.env, auth.uid, auth.email);

    if (request.method === 'GET') {
      return jsonResponse({
        ok: true,
        tier: state.tier,
        limit: state.limit === Infinity ? null : state.limit,
        activeCount: state.active.length,
        totalCount: state.connections.length,
        activeBrainConnectionId: state.activeBrainConnectionId,
        activeWebStudioConnectionId: state.activeWebStudioConnectionId,
        connections: state.connections.map(item => publicConnection(item, item.id))
      });
    }

    if (request.method === 'DELETE') {
      const id = connectionId(new URL(request.url).searchParams.get('id'));
      const current = await getFirestoreDocumentAtPath(context.env, [...base, id]);
      if (!current) return errorResponse(404, 'CONNECTION_NOT_FOUND', 'This connection is no longer available.');
      const record = await getFirestoreDataAtPath(context.env, [...base, id]);
      if (record?.ownerUid !== auth.uid || record?.ownerEmail !== auth.email) {
        return errorResponse(403, 'CONNECTION_ACCESS_DENIED', 'This connection is not available for the current account.');
      }
      const currentWasActive = record?.active === true;
      let reservation = null;

      if (currentWasActive) {
        reservation = await changeActiveCount(
          context.env,
          auth.uid,
          auth.email,
          -1,
          state.limit
        );

        if (!reservation.ok) {
          return errorResponse(
            409,
            'CONNECTION_LIMIT_CONFLICT',
            'The universal connection state changed concurrently. Please retry.'
          );
        }
      }

      try {
        await deleteFirestoreDocumentAtPath(
          context.env,
          [...base, id],
          current.updateTime
        );
      } catch (error) {
        if (currentWasActive && reservation?.changed) {
          try {
            await changeActiveCount(
              context.env,
              auth.uid,
              auth.email,
              1,
              state.limit
            );
          } catch {}
        }
        throw error;
      }

      const clearSelections = {};
      if (state.activeBrainConnectionId === id) clearSelections.activeBrainConnectionId = null;
      if (state.activeWebStudioConnectionId === id) clearSelections.activeWebStudioConnectionId = null;
      if (Object.keys(clearSelections).length) {
        await setFirestoreDocumentAtPath(
          context.env,
          ['users', auth.uid],
          clearSelections,
          { merge: true }
        );
      }

      return jsonResponse({
        ok: true,
        deleted: true,
        id,
        activeBrainConnectionId:
          state.activeBrainConnectionId === id ? null : state.activeBrainConnectionId,
        activeWebStudioConnectionId:
          state.activeWebStudioConnectionId === id ? null : state.activeWebStudioConnectionId,
        activeCount:
          reservation?.count ??
          state.active.length
      });
    }

    if (request.method !== 'POST' && request.method !== 'PUT') {
      return errorResponse(405, 'METHOD_NOT_ALLOWED', 'This action is not supported.');
    }

    const body = await request.json();

    const action = clean(body?.action, 20).toLowerCase();

    if (action === 'use-ai' || action === 'clear-ai') {
      if (action === 'clear-ai') {
        await setFirestoreDocumentAtPath(
          context.env,
          ['users', auth.uid],
          { activeBrainConnectionId: null },
          { merge: true }
        );

        return jsonResponse({
          ok: true,
          activeBrainConnectionId: null
        });
      }

      const id = connectionId(body?.id);
      const record = await getFirestoreDataAtPath(context.env, [...base, id]);

      if (!record || record.ownerUid !== auth.uid || record.ownerEmail !== auth.email) {
        return errorResponse(404, 'CONNECTION_NOT_FOUND', 'This connection is no longer available.');
      }
      if (record.active !== true) {
        return errorResponse(409, 'CONNECTION_INACTIVE', 'Activate this connection before using it as the AI Brain.');
      }
      if (!supportsAIProtocol(record.protocol)) {
        return errorResponse(
          400,
          'CONNECTION_NOT_AI_PROTOCOL',
          'Choose an OpenAI-compatible, Anthropic Messages, or Gemini Generate Content AI protocol to use this as the AI Brain.'
        );
      }

      await setFirestoreDocumentAtPath(
        context.env,
        ['users', auth.uid],
        { activeBrainConnectionId: id },
        { merge: true }
      );
      return jsonResponse({
        ok: true,
        activeBrainConnectionId: id,
        connection: publicConnection(record, id)
      });
    }

    if (action === 'use-webstudio' || action === 'clear-webstudio') {
      if (action === 'clear-webstudio') {
        await setFirestoreDocumentAtPath(
          context.env,
          ['users', auth.uid],
          { activeWebStudioConnectionId: null },
          { merge: true }
        );
        return jsonResponse({ ok: true, activeWebStudioConnectionId: null });
      }

      const id = connectionId(body?.id);
      const record = await getFirestoreDataAtPath(context.env, [...base, id]);
      if (!record || record.ownerUid !== auth.uid || record.ownerEmail !== auth.email) {
        return errorResponse(404, 'CONNECTION_NOT_FOUND', 'This connection is no longer available.');
      }
      if (record.active !== true) {
        return errorResponse(409, 'CONNECTION_INACTIVE', 'Activate this connection before assigning it to Web Studio.');
      }
      if (!supportsAIProtocol(record.protocol)) {
        return errorResponse(
          400,
          'CONNECTION_NOT_AI_PROTOCOL',
          'Choose an active connection using a supported AI chat protocol to assign it to Web Studio.'
        );
      }

      await setFirestoreDocumentAtPath(
        context.env,
        ['users', auth.uid],
        { activeWebStudioConnectionId: id },
        { merge: true }
      );
      return jsonResponse({
        ok: true,
        activeWebStudioConnectionId: id,
        connection: publicConnection(record, id)
      });
    }

    if (action === 'test') {
      const id = connectionId(body?.id);
      const record = await getFirestoreDataAtPath(context.env, [...base, id]);
      if (!record || record.ownerUid !== auth.uid || record.ownerEmail !== auth.email) {
        return errorResponse(404, 'CONNECTION_NOT_FOUND', 'This connection is no longer available.');
      }
      const result = await testUserConnection(
        context.env,
        auth.user,
        id
      );
      await setFirestoreDocumentAtPath(
        context.env,
        [...base, id],
        {
          lastTestAt: new Date().toISOString(),
          lastTestStatus: result.ok ? 'reachable' : 'unreachable',
          lastTestHttpStatus: result.status,
          lastTestLatencyMs: result.latencyMs,
          lastTestError: result.error || null
        },
        { merge: true }
      );
      return jsonResponse({
        ok: result.ok,
        test: result,
        id
      }, result.ok ? 200 : 502);
    }

    const id = connectionId(body?.id);
    const currentDoc = await getFirestoreDocumentAtPath(context.env, [...base, id]);
    const currentRecord = currentDoc ? await getFirestoreDataAtPath(context.env, [...base, id]) : null;
    const record = await buildConnectionRecord(
      context.env,
      body,
      { uid: auth.uid, email: auth.email },
      currentRecord || {}
    );
    const currentWasActive = currentRecord?.active === true;
    const requestedActive = record.active === true;
    const limit = state.limit;

    let reservation = null;

    if (
      requestedActive &&
      !currentWasActive
    ) {
      reservation = await changeActiveCount(
        context.env,
        auth.uid,
        auth.email,
        1,
        limit
      );

      if (!reservation.ok) {
        return jsonResponse({
          ok: false,
          error: 'CONNECTION_LIMIT_REACHED',
          message: `Your ${state.tier === 'free' ? 'Free Trial' : state.tier === 'pro' ? 'Pro Plan' : 'Max Plan'} allows ${limit === Infinity ? 'unlimited' : limit} active universal connections.`,
          tier: state.tier,
          limit: limit === Infinity ? null : limit,
          activeCount: reservation.count,
          upgradeRequired: state.tier !== 'max'
        }, 409);
      }
    } else if (
      !requestedActive &&
      currentWasActive
    ) {
      reservation = await changeActiveCount(
        context.env,
        auth.uid,
        auth.email,
        -1,
        limit
      );
    }

    try {
      await setFirestoreDocumentAtPath(
        context.env,
        [...base, id],
        {
          ...record,
          createdAt:
            currentRecord?.createdAt ||
            new Date().toISOString()
        },
        {
          merge: true,
          expectedUpdateTime:
            currentDoc?.updateTime ||
            null
        }
      );
    } catch (error) {
      if (
        reservation?.changed
      ) {
        try {
          await changeActiveCount(
            context.env,
            auth.uid,
            auth.email,
            requestedActive &&
              !currentWasActive
              ? -1
              : 1,
            limit
          );
        } catch {}
      }
      throw error;
    }

    const latest =
      await getFirestoreDataAtPath(
        context.env,
        [...base, id]
      );

    let activeBrainConnectionId = state.activeBrainConnectionId;
    let activeWebStudioConnectionId = state.activeWebStudioConnectionId;
    const clearInvalidSelections = {};
    if (activeBrainConnectionId === id && (!record.active || !supportsAIProtocol(record.protocol))) {
      activeBrainConnectionId = null;
      clearInvalidSelections.activeBrainConnectionId = null;
    }
    if (activeWebStudioConnectionId === id && (!record.active || !supportsAIProtocol(record.protocol))) {
      activeWebStudioConnectionId = null;
      clearInvalidSelections.activeWebStudioConnectionId = null;
    }
    if (Object.keys(clearInvalidSelections).length) {
      await setFirestoreDocumentAtPath(context.env, ['users', auth.uid], clearInvalidSelections, { merge: true });
    }

    if (body?.useAsBrain === true && record.active === true && supportsAIProtocol(record.protocol)) {
      activeBrainConnectionId = id;
      await setFirestoreDocumentAtPath(context.env, ['users', auth.uid], { activeBrainConnectionId: id }, { merge: true });
    }
    if (body?.useForWebStudio === true && record.active === true && supportsAIProtocol(record.protocol)) {
      activeWebStudioConnectionId = id;
      await setFirestoreDocumentAtPath(context.env, ['users', auth.uid], { activeWebStudioConnectionId: id }, { merge: true });
    }

    return jsonResponse({
      ok: true,
      connection: {
        ...publicConnection(latest || record, id)
      },
      tier: state.tier,
      limit:
        limit === Infinity
          ? null
          : limit,
      activeBrainConnectionId,
      activeWebStudioConnectionId,
      activeCount:
        reservation?.count ??
        state.active.length
    });
  } catch (error) {
    return errorResponse(
      error?.status || 500,
      error?.code || 'UNIVERSAL_CONNECTIONS_FAILED',
      error?.message || 'Universal connection operation failed.'
    );
  }
}

export { onRequest };
