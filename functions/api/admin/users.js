'use strict';

import {
  jsonResponse,
  errorResponse,
  getRequestId,
  getBearerToken,
  enforceSameOrigin,
  readJson
} from '../../_lib/http.js';
import { verifyFirebaseIdToken, normalizeEmail } from '../../_lib/auth.js';
import {
  listFirestoreDocuments,
  getFirestoreData,
  setFirestoreDocument,
  setFirebaseAccountDisabled,
  revokeFirebaseRefreshTokens
} from '../../_lib/firebase-admin.js';
import { QUOTA_PLANS } from '../../_lib/token-quota.js';

const ROOT_EMAIL = 'ovyxsupportteam@gmail.com';
const VALID_TIERS = new Set(['free', 'pro', 'max']);
const clean = (value, max = 300) => String(value ?? '').trim().slice(0, max);

function adminDenied(requestId) {
  return errorResponse(403, 'ADMIN_REQUIRED', 'Root administrator access is required.', requestId);
}

async function authorizeRoot(request, env, id) {
  if (!enforceSameOrigin(request)) {
    return { ok: false, response: errorResponse(403, 'ORIGIN_REJECTED', 'Cross-origin admin requests are not permitted.', id) };
  }
  if (!getBearerToken(request)) {
    return { ok: false, response: errorResponse(401, 'AUTH_REQUIRED', 'Authentication is required.', id) };
  }
  const auth = await verifyFirebaseIdToken(request, env);
  if (!auth.ok) return { ok: false, response: auth.response };
  if (normalizeEmail(auth.user.email) !== ROOT_EMAIL) return { ok: false, response: adminDenied(id) };
  return { ok: true, user: auth.user };
}

function timestampMs(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) return n;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function configuredLimits(config = {}) {
  const result = {};
  for (const tier of ['free', 'pro', 'max']) {
    const tokenValue = Number(config.tokenQuotas?.[tier]);
    const dailyValue = Number(config.dailyPromptQuotas?.[tier]);
    const fallback = QUOTA_PLANS[tier];
    result[tier] = {
      monthly: Number.isSafeInteger(tokenValue) && tokenValue > 0 ? tokenValue : fallback.monthly,
      daily: Number.isSafeInteger(dailyValue) && dailyValue > 0 ? dailyValue : fallback.daily,
      label: fallback.label
    };
  }
  return result;
}

async function readRegistryPage(context, id) {
  const url = new URL(context.request.url);
  const rawSize = Number.parseInt(url.searchParams.get('pageSize') || '100', 10);
  const pageSize = Number.isFinite(rawSize) ? Math.min(100, Math.max(1, rawSize)) : 100;
  const pageToken = clean(url.searchParams.get('pageToken'), 4000) || null;
  const result = await listFirestoreDocuments(context.env, 'users', pageSize, pageToken);
  const config = await getFirestoreData(context.env, 'system', 'config') || {};
  const plans = configuredLimits(config);
  const checkedAt = new Date().toISOString();
  const checkedAtMs = Date.now();
  const dayKey = checkedAt.slice(0, 10);
  const monthKey = checkedAt.slice(0, 7);
  const users = result.documents.map(user => {
    const email = normalizeEmail(user.email);
    const role = clean(user.role || 'FREE_USER', 80).toUpperCase();
    const planState = clean(user.planTierState, 80).toLowerCase();
    const storedPlan = clean(user.planTier ?? user.tier ?? user.plan ?? 'free', 30).toLowerCase();
    const expiresAtMs = timestampMs(user.expiresAt);
    // Only the canonical owner email gets root plan/bypass treatment in the registry view.
    const rootUser = email === ROOT_EMAIL;
    const terminalState = ['expired', 'refunded', 'chargeback', 'suspended', 'canceled'].includes(planState);
    const paidAccessActive = VALID_TIERS.has(storedPlan) && storedPlan !== 'free' &&
      ['active', 'trialing'].includes(planState) && expiresAtMs !== null && expiresAtMs > checkedAtMs;
    const plan = rootUser ? 'root' : (paidAccessActive ? storedPlan : 'free');
    const limits = plans[plan === 'root' ? 'max' : plan] || plans.free;
    const monthCurrent = String(user._ovyxQuotaMonthKey || '') === monthKey;
    const dayCurrent = String(user._ovyxQuotaDayKey || '') === dayKey;
    const tierCurrent = String(user._ovyxQuotaTier || '').trim().toLowerCase() === (plan === 'root' ? 'max' : plan);
    const monthlyRemaining = monthCurrent && tierCurrent && Number.isFinite(Number(user.current_monthly_tokens))
      ? Math.max(0, Math.min(limits.monthly, Number(user.current_monthly_tokens))) : limits.monthly;
    const dailyRemaining = dayCurrent && tierCurrent && Number.isFinite(Number(user.daily_prompts_allowance))
      ? Math.max(0, Math.min(limits.daily, Number(user.daily_prompts_allowance))) : limits.daily;
    const monthlyUsed = Math.max(0, limits.monthly - monthlyRemaining);
    const dailyUsed = Math.max(0, limits.daily - dailyRemaining);
    const monthlyExhausted = monthCurrent && tierCurrent && (monthlyRemaining <= 0 || user.is_monthly_exhausted === true);
    const boosterTokens = Math.max(0, Number(user.booster_tokens) || 0);
    const quota = rootUser ? {
      authority: 'SERVER', bypass: true, plan: 'root', mode: 'bypass',
      monthlyLimit: null, monthlyRemaining: null, monthlyUsed: 0, monthlyUsagePercent: 0,
      dailyPromptLimit: null, dailyPromptsRemaining: null, dailyPromptsUsed: 0,
      dailyPromptUsagePercent: 0, monthlyExhausted: false, boosterTokens, checkedAt
    } : {
      authority: 'SERVER', bypass: false, plan,
      mode: !monthlyExhausted ? 'monthly' : (boosterTokens > 0 ? 'booster' : (dailyRemaining > 0 ? 'daily' : 'blocked')),
      monthlyLimit: limits.monthly, monthlyRemaining, monthlyUsed,
      monthlyUsagePercent: limits.monthly > 0 ? Math.min(100, Math.round(monthlyUsed / limits.monthly * 100)) : 0,
      dailyPromptLimit: limits.daily, dailyPromptsRemaining: dailyRemaining, dailyPromptsUsed: dailyUsed,
      dailyPromptUsagePercent: limits.daily > 0 ? Math.min(100, Math.round(dailyUsed / limits.daily * 100)) : 0,
      monthlyExhausted, boosterTokens, checkedAt
    };
    return {
      uid: String(user.id || ''),
      email: String(user.email || ''),
      displayName: String(user.displayName || ''),
      role: String(user.role || 'FREE_USER'),
      plan,
      planState: rootUser ? 'active' : (plan === 'free' && VALID_TIERS.has(storedPlan) && storedPlan !== 'free' && !terminalState ? 'expired' : (planState || 'free')),
      expiresAt: user.expiresAt ?? null,
      disabled: user.disabled === true || String(user.accountStatus || '').toLowerCase() === 'disabled',
      quota,
      aiUsage: quota,
      current_monthly_tokens: quota.monthlyRemaining,
      monthlyTokenLimit: quota.monthlyLimit,
      tokensUsed: quota.monthlyUsed,
      tokenLimit: quota.monthlyLimit,
      tokenUsagePercent: quota.monthlyUsagePercent,
      daily_prompts_allowance: quota.dailyPromptsRemaining,
      dailyPromptLimit: quota.dailyPromptLimit,
      dailyPromptUsagePercent: quota.dailyPromptUsagePercent
    };
  });
  return jsonResponse({ ok: true, authority: 'SERVER', users, pageSize, nextPageToken: result.nextPageToken || null }, 200, {
    'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store, max-age=0'
  });
}

export async function onRequestGet(context) {
  const id = getRequestId(context.request);
  try {
    const auth = await authorizeRoot(context.request, context.env, id);
    if (!auth.ok) return auth.response;
    return await readRegistryPage(context, id);
  } catch (error) {
    console.error('[OVYX ADMIN USERS ' + id + ']', String(error?.code || error?.message || 'registry read failed').slice(0, 180));
    return errorResponse(error?.status || 503, error?.code || 'ADMIN_USERS_UNAVAILABLE', 'The server could not retrieve the user registry.', id);
  }
}

function validateTargetUid(value) {
  const uid = clean(value, 128);
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) {
    throw Object.assign(new Error('A valid target user ID is required.'), { status: 400, code: 'TARGET_UID_REQUIRED' });
  }
  return uid;
}

function quotaResetFields(tier, plans, now = new Date()) {
  const selected = plans[tier] || plans.free;
  return {
    current_monthly_tokens: selected.monthly,
    daily_prompts_allowance: selected.daily,
    is_monthly_exhausted: false,
    _ovyxQuotaTier: tier,
    _ovyxQuotaDayKey: now.toISOString().slice(0, 10),
    _ovyxQuotaMonthKey: now.toISOString().slice(0, 7),
    _ovyxQuotaMonthlyLimit: selected.monthly,
    _ovyxQuotaDailyLimit: selected.daily,
    quotaSchemaVersion: 1
  };
}

export async function onRequestPost(context) {
  const id = getRequestId(context.request);
  try {
    const auth = await authorizeRoot(context.request, context.env, id);
    if (!auth.ok) return auth.response;
    const body = await readJson(context.request, 16000);
    const action = clean(body.action, 60);
    const uid = validateTargetUid(body.uid || body.targetUid);
    const target = await getFirestoreData(context.env, 'users', uid);
    if (!target) return errorResponse(404, 'USER_NOT_FOUND', 'The selected account was not found in the OVYX user registry.', id);
    const targetEmail = normalizeEmail(target.email);
    const targetRole = clean(target.role, 80).toUpperCase();
    if (targetEmail === ROOT_EMAIL || ['ROOT_SUPERUSER', 'OVYX OWNER', 'OWNER', 'ADMIN'].includes(targetRole)) {
      return errorResponse(403, 'ROOT_ACCOUNT_PROTECTED', 'The root owner account cannot be changed from the user registry.', id);
    }

    const config = await getFirestoreData(context.env, 'system', 'config') || {};
    const plans = configuredLimits(config);
    const now = new Date();
    const actor = { uid: String(auth.user.uid || ''), email: normalizeEmail(auth.user.email) };
    const audit = { adminAction: action, adminActionAt: now.toISOString(), adminActionBy: actor };

    if (action === 'setPlan') {
      const tier = clean(body.plan, 20).toLowerCase();
      if (!VALID_TIERS.has(tier)) return errorResponse(400, 'INVALID_PLAN', 'Choose Free, Pro or Max.', id);
      const durationDaysRaw = Number(body.durationDays ?? 30);
      const durationDays = Number.isInteger(durationDaysRaw) ? durationDaysRaw : 0;
      if (tier !== 'free' && (durationDays < 1 || durationDays > 3650)) {
        return errorResponse(400, 'INVALID_PLAN_DURATION', 'Paid plan duration must be between 1 and 3650 days.', id);
      }
      const expiresAt = tier === 'free' ? null : now.getTime() + durationDays * 86400000;
      await setFirestoreDocument(context.env, 'users', uid, {
        planTier: tier,
        tier,
        planTierState: tier === 'free' ? 'expired' : 'active',
        subscriptionStatus: tier === 'free' ? 'expired' : 'active',
        expiresAt,
        adminManagedPlan: true,
        adminManagedPlanAt: now.toISOString(),
        adminManagedPlanBy: actor,
        ...quotaResetFields(tier, plans, now),
        ...audit
      }, { merge: true });
      try {
        await setFirestoreDocument(context.env, 'plans', tier, {
          tier,
          lastUserAssignmentAt: now.toISOString(),
          lastUserAssignmentBy: actor
        }, { merge: true });
      } catch (error) {
        console.warn('[OVYX ADMIN USERS ' + id + '] plan audit record unavailable');
      }
      return jsonResponse({
        ok: true, action, uid, plan: tier, planState: tier === 'free' ? 'expired' : 'active',
        expiresAt, quota: plans[tier], updatedAt: now.toISOString(), authority: 'SERVER'
      }, 200, { 'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store, max-age=0' });
    }

    if (action === 'setAccountStatus') {
      const disabled = body.disabled === true;
      const oldDisabled = target.disabled === true || String(target.accountStatus || '').toLowerCase() === 'disabled';
      await setFirestoreDocument(context.env, 'users', uid, {
        disabled,
        accountStatus: disabled ? 'disabled' : 'active',
        accountStatusUpdatedAt: now.toISOString(),
        accountStatusUpdatedBy: actor,
        ...audit
      }, { merge: true });
      try {
        await setFirebaseAccountDisabled(context.env, uid, disabled);
      } catch (error) {
        await setFirestoreDocument(context.env, 'users', uid, {
          disabled: oldDisabled,
          accountStatus: oldDisabled ? 'disabled' : 'active',
          accountStatusUpdateFailedAt: new Date().toISOString()
        }, { merge: true }).catch(() => {});
        throw error;
      }
      let refreshTokensRevoked = false;
      if (disabled) {
        try {
          await revokeFirebaseRefreshTokens(context.env, uid);
          refreshTokensRevoked = true;
        } catch (error) {
          console.warn('[OVYX ADMIN USERS ' + id + '] account disabled; token revocation unavailable');
        }
      }
      return jsonResponse({
        ok: true, action, uid, disabled, accountStatus: disabled ? 'disabled' : 'active',
        refreshTokensRevoked, updatedAt: now.toISOString(), authority: 'FIREBASE_AUTH_AND_SERVER'
      }, 200, { 'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store, max-age=0' });
    }

    if (action === 'resetQuota') {
      const currentTier = clean(target.planTier ?? target.tier ?? target.plan ?? 'free', 20).toLowerCase();
      const targetExpiryMs = timestampMs(target.expiresAt);
      const activeTier = ['pro', 'max'].includes(currentTier) &&
        ['active', 'trialing'].includes(clean(target.planTierState, 40).toLowerCase()) &&
        targetExpiryMs !== null && targetExpiryMs > now.getTime()
        ? currentTier : 'free';
      const fields = quotaResetFields(activeTier, plans, now);
      await setFirestoreDocument(context.env, 'users', uid, { ...fields, ...audit }, { merge: true });
      return jsonResponse({
        ok: true, action, uid, plan: activeTier, quota: plans[activeTier],
        updatedAt: now.toISOString(), authority: 'SERVER'
      }, 200, { 'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store, max-age=0' });
    }

    return errorResponse(400, 'ADMIN_USER_ACTION_NOT_ALLOWED', 'Supported actions are setPlan, setAccountStatus and resetQuota.', id);
  } catch (error) {
    console.error('[OVYX ADMIN USERS WRITE ' + id + ']', String(error?.code || error?.message || 'user write failed').slice(0, 180));
    return errorResponse(error?.status || 500, error?.code || 'ADMIN_USER_UPDATE_FAILED', error?.message || 'The user account could not be updated.', id);
  }
}

export async function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  if (context.request.method === 'POST') return onRequestPost(context);
  return errorResponse(405, 'METHOD_NOT_ALLOWED', 'GET or POST is required.', getRequestId(context.request));
}
