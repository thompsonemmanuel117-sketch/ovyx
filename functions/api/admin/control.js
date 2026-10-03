import { authenticateRequest, hasAdminClaim } from '../../_lib/firebase.js';
import { getFirestoreData, setFirestoreDocument } from '../../_lib/firebase-admin.js';
import { isRootUser } from '../../_lib/brain/registry.js';
import { readJson, jsonResponse, requestId } from '../_lib/http.js';

const ROOT_EMAIL = 'ovyxsupportteam@gmail.com';
const clean = (v, n = 400) => String(v ?? '').trim().slice(0, n);

function isRootAdmin(user) {
  if (!user) return false;
  const email = clean(user.email, 320).toLowerCase();
  if (email === ROOT_EMAIL.toLowerCase() || isRootUser(user) || hasAdminClaim(user)) return true;
  return ['ROOT_SUPERUSER', 'OVYX OWNER', 'OWNER', 'ADMIN'].includes(clean(user.role, 80).toUpperCase());
}

function positive(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw Object.assign(new Error(label + ' must be a positive number.'), { status: 400, code: 'INVALID_PLAN_VALUE' });
  return n;
}

export async function onRequestPost(context) {
  const id = requestId(context.request);
  try {
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
      const gating = payload.gating && typeof payload.gating === 'object' ? payload.gating : (current.gating || {});
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
  if (context.request.method === 'POST') return onRequestPost(context);
  return jsonResponse({ ok: false, error: 'POST is required.', code: 'METHOD_NOT_ALLOWED' }, 405);
}
