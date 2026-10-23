import { authenticateRequest } from '../../_lib/firebase.js';
import { getFirestoreData, setFirestoreDocument } from '../../_lib/firebase-admin.js';
import { ROOT_EMAIL } from '../../_lib/brain/registry.js';
import { readJson, jsonResponse, requestId, enforceSameOrigin } from '../_lib/http.js';

const clean = (v, n = 400) => String(v ?? '').trim().slice(0, n);

function isRootAdmin(user) {
  if (!user) return false;
  // Root operations are bound to the authenticated canonical owner account.
  // A token/profile role string alone must not grant owner-level access.
  const email = clean(user.email, 320).toLowerCase();
  return email === ROOT_EMAIL.toLowerCase();
}

function positive(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw Object.assign(new Error(label + ' must be a positive number.'), { status: 400, code: 'INVALID_PLAN_VALUE' });
  return n;
}

export async function onRequestGet(context) {
  const id = requestId(context.request);
  try {
    if (!enforceSameOrigin(context.request)) return jsonResponse({ ok: false, error: 'Cross-origin admin requests are not permitted.', code: 'ORIGIN_REJECTED' }, 403, { 'X-OVYX-Request-ID': id });
    const user = context.data?.user || await authenticateRequest(context.request, context.env);
    if (!isRootAdmin(user)) return jsonResponse({ ok: false, error: 'Root administrator authorization is required.', code: 'ROOT_REQUIRED' }, 403, { 'X-OVYX-Request-ID': id });
    const current = (await getFirestoreData(context.env, 'system', 'config')) || {};
    return jsonResponse({
      ok: true,
      config: {
        pricing: current.pricing || null,
        gating: current.gating || {},
        masterAdminOverride: current.masterAdminOverride === true,
        liveDeploy: typeof current.liveDeploy === 'boolean' ? current.liveDeploy : (typeof current.productionLive === 'boolean' ? current.productionLive : true),
        productionLive: typeof current.productionLive === 'boolean' ? current.productionLive : (typeof current.liveDeploy === 'boolean' ? current.liveDeploy : true),
        environment: current.environment || (current.liveDeploy === false || current.productionLive === false ? 'sandbox' : 'live'),
        updatedAt: current.updatedAt || null,
        updatedBy: current.updatedBy || null
      },
      authority: 'SERVER_ADMIN'
    }, 200, { 'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store, max-age=0' });
  } catch (error) {
    return jsonResponse({ ok: false, error: error?.message || 'Administrative configuration could not be loaded.', code: error?.code || 'ADMIN_CONTROL_READ_FAILED' }, error?.status || 503, { 'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store, max-age=0' });
  }
}

export async function onRequestPost(context) {
  const id = requestId(context.request);
  try {
    if (!enforceSameOrigin(context.request)) return jsonResponse({ ok: false, error: 'Cross-origin admin requests are not permitted.', code: 'ORIGIN_REJECTED' }, 403, { 'X-OVYX-Request-ID': id });
    const user = context.data?.user || await authenticateRequest(context.request, context.env);
    if (!isRootAdmin(user)) return jsonResponse({ ok: false, error: 'Root administrator authorization is required.', code: 'ROOT_REQUIRED' }, 403, { 'X-OVYX-Request-ID': id });

    const payload = await readJson(context.request, 128000);
    const action = clean(payload.action, 80);
    const current = (await getFirestoreData(context.env, 'system', 'config')) || {};

    if (action === 'saveSettings') {
      const pricing = {
        pro: {
          ngn: positive(payload.pricing?.pro?.ngn, 'Pro NGN price'),
          usd: positive(payload.pricing?.pro?.usd, 'Pro USD price')
        },
        max: {
          ngn: positive(payload.pricing?.max?.ngn, 'Max NGN price'),
          usd: positive(payload.pricing?.max?.usd, 'Max USD price')
        }
      };
      const gatingSource = payload.gating && typeof payload.gating === 'object' ? payload.gating : (current.gating || {});
      const gating = {};
      const allowedGates = new Set(['webstudio','advancedwebstudio','appstudio','gamestudio','aigeneration','github','cloudflaredeploy','teamworkspace','workspace','templates','admin-identity']);
      for (const [key, value] of Object.entries(gatingSource).slice(0, 40)) {
        if (!allowedGates.has(clean(key, 80).toLowerCase())) continue;
        const requiredTier = clean(value, 20).toLowerCase();
        if (!['free','pro','max','root'].includes(requiredTier)) {
          throw Object.assign(new Error('Every feature gate must use Free, Pro, Max or Root.'), { status: 400, code: 'INVALID_FEATURE_GATE' });
        }
        gating[clean(key, 80)] = requiredTier;
      }
      const updatedAt = new Date().toISOString();
      const updatedBy = clean(user.sub || user.email, 200);

      await setFirestoreDocument(context.env, 'system', 'config', {
        pricing,
        gating,
        environment: clean(payload.environment || current.environment || 'sandbox', 40),
        updatedAt,
        updatedBy
      }, { merge: true });

      await setFirestoreDocument(context.env, 'plans', 'pro', {
        tier: 'pro',
        pricing: pricing.pro,
        updatedAt,
        updatedBy
      }, { merge: true });

      await setFirestoreDocument(context.env, 'plans', 'max', {
        tier: 'max',
        pricing: pricing.max,
        updatedAt,
        updatedBy
      }, { merge: true });

      return jsonResponse({
        ok: true,
        config: { ...current, pricing, gating, environment: clean(payload.environment || current.environment || 'sandbox', 40), updatedAt, updatedBy },
        authority: 'SERVER_ADMIN'
      }, 200, { 'X-OVYX-Request-ID': id });
    }

    if (action === 'setAdminOverride') {
      const enabled = payload.enabled === true;
      await setFirestoreDocument(context.env, 'system', 'config', {
        masterAdminOverride: enabled,
        updatedAt: new Date().toISOString(),
        updatedBy: clean(user.sub || user.email, 200)
      }, { merge: true });
      return jsonResponse({ ok: true, config: { ...current, masterAdminOverride: enabled } }, 200, { 'X-OVYX-Request-ID': id });
    }

    if (action === 'setProductionState') {
      const live = payload.live === true;
      await setFirestoreDocument(context.env, 'system', 'config', {
        liveDeploy: live,
        productionLive: live,
        updatedAt: new Date().toISOString(),
        updatedBy: clean(user.sub || user.email, 200)
      }, { merge: true });
      return jsonResponse({ ok: true, config: { ...current, liveDeploy: live, productionLive: live } }, 200, { 'X-OVYX-Request-ID': id });
    }

    return jsonResponse({ ok: false, error: 'This administrative control is not registered.', code: 'ADMIN_ACTION_NOT_ALLOWED' }, 400, { 'X-OVYX-Request-ID': id });
  } catch (error) {
    return jsonResponse({ ok: false, error: error?.message || 'Administrative control update failed.', code: error?.code || 'ADMIN_CONTROL_FAILED' }, error?.status || 500, { 'X-OVYX-Request-ID': id });
  }
}

export async function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  if (context.request.method === 'POST') return onRequestPost(context);
  return jsonResponse({ ok: false, error: 'GET or POST is required.', code: 'METHOD_NOT_ALLOWED' }, 405);
}
