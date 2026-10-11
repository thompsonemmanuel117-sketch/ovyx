'use strict';

import {
  jsonResponse,
  errorResponse,
  getRequestId,
  getBearerToken,
  enforceSameOrigin
} from '../../_lib/http.js';

import {
  verifyFirebaseIdToken,
  normalizeEmail
} from '../../_lib/auth.js';

import {
  listFirestoreDocuments
} from '../../_lib/firebase-admin.js';

import { QUOTA_PLANS } from '../../_lib/token-quota.js';

const ROOT_EMAIL =
  'ovyxsupportteam@gmail.com';

export async function onRequestGet(context) {
  const request = context.request;
  const requestId =
    getRequestId(request);

  if (!enforceSameOrigin(request)) {
    return errorResponse(
      403,
      'ORIGIN_REJECTED',
      'Cross-origin admin requests are not permitted.',
      requestId
    );
  }

  if (!getBearerToken(request)) {
    return errorResponse(
      401,
      'AUTH_REQUIRED',
      'Authentication is required.',
      requestId
    );
  }

  const auth =
    await verifyFirebaseIdToken(
      request,
      context.env
    );

  if (!auth.ok) {
    return auth.response;
  }

  if (
    normalizeEmail(auth.user.email) !==
    ROOT_EMAIL
  ) {
    return errorResponse(
      403,
      'ADMIN_REQUIRED',
      'Root administrator access is required.',
      requestId
    );
  }

  try {
    const result =
      await listFirestoreDocuments(
        context.env,
        'users',
        100
      );

    const checkedAt = new Date().toISOString();
    const dayKey = checkedAt.slice(0, 10);
    const monthKey = checkedAt.slice(0, 7);
    const users =
      result.documents.map(user => {
        const email = String(user.email || '').trim().toLowerCase();
        const role = String(user.role || 'FREE_USER').trim().toUpperCase();
        const planState = String(user.planTierState || '').trim().toLowerCase();
        const storedPlan = String(
          user.planTier ??
          user.tier ??
          user.plan ??
          'free'
        ).trim().toLowerCase();
        const rootUser = email === ROOT_EMAIL || ['ROOT_SUPERUSER', 'OWNER', 'ADMIN'].includes(role);
        const expiredState = ['expired', 'refunded', 'chargeback', 'suspended', 'canceled'].includes(planState);
        const plan = rootUser ? 'root' : (expiredState ? 'free' : (Object.prototype.hasOwnProperty.call(QUOTA_PLANS, storedPlan) ? storedPlan : 'free'));
        const limits = QUOTA_PLANS[plan === 'root' ? 'max' : plan] || QUOTA_PLANS.free;
        const monthCurrent = String(user._ovyxQuotaMonthKey || '') === monthKey;
        const dayCurrent = String(user._ovyxQuotaDayKey || '') === dayKey;
        const tierCurrent = String(user._ovyxQuotaTier || '').trim().toLowerCase() === (plan === 'root' ? 'max' : plan);
        const monthlyLimit = limits.monthly;
        const dailyPromptLimit = limits.daily;
        const monthlyRemaining = monthCurrent && tierCurrent && Number.isFinite(Number(user.current_monthly_tokens))
          ? Math.max(0, Math.min(monthlyLimit, Number(user.current_monthly_tokens)))
          : monthlyLimit;
        const dailyPromptsRemaining = dayCurrent && tierCurrent && Number.isFinite(Number(user.daily_prompts_allowance))
          ? Math.max(0, Math.min(dailyPromptLimit, Number(user.daily_prompts_allowance)))
          : dailyPromptLimit;
        const monthlyUsed = Math.max(0, monthlyLimit - monthlyRemaining);
        const dailyPromptsUsed = Math.max(0, dailyPromptLimit - dailyPromptsRemaining);
        const monthlyUsagePercent = monthlyLimit > 0 ? Math.min(100, Math.round(monthlyUsed / monthlyLimit * 100)) : 0;
        const dailyPromptUsagePercent = dailyPromptLimit > 0 ? Math.min(100, Math.round(dailyPromptsUsed / dailyPromptLimit * 100)) : 0;
        const boosterTokens = Math.max(0, Number(user.booster_tokens) || 0);
        const monthlyExhausted = monthlyRemaining <= 0 || user.is_monthly_exhausted === true;
        const quota = rootUser
          ? {
              authority: 'SERVER',
              bypass: true,
              plan: 'root',
              mode: 'bypass',
              monthlyLimit: null,
              monthlyRemaining: null,
              monthlyUsed: 0,
              monthlyUsagePercent: 0,
              dailyPromptLimit: null,
              dailyPromptsRemaining: null,
              dailyPromptsUsed: 0,
              dailyPromptUsagePercent: 0,
              monthlyExhausted: false,
              boosterTokens,
              checkedAt
            }
          : {
              authority: 'SERVER',
              bypass: false,
              plan,
              mode: !monthlyExhausted ? 'monthly' : (boosterTokens > 0 ? 'booster' : (dailyPromptsRemaining > 0 ? 'daily' : 'blocked')),
              monthlyLimit,
              monthlyRemaining,
              monthlyUsed,
              monthlyUsagePercent,
              dailyPromptLimit,
              dailyPromptsRemaining,
              dailyPromptsUsed,
              dailyPromptUsagePercent,
              monthlyExhausted,
              boosterTokens,
              checkedAt
            };

        return {
          uid: String(user.id || ''),
          email: String(user.email || ''),
          displayName: String(user.displayName || ''),
          role: String(user.role || 'FREE_USER'),
          plan,
          disabled: user.disabled === true,
          // Both a namespaced object and stable flat aliases are provided so
          // the admin UI can render real server-authoritative meters.
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

    return jsonResponse(
      {
        ok: true,
        authority: 'SERVER',
        users,
        nextPageToken:
          result.nextPageToken || null
      },
      200,
      {
        'X-OVYX-Request-ID': requestId
      }
    );
  } catch (error) {
    console.error(
      `[OVYX ADMIN USERS ${requestId}]`,
      error?.message || error
    );

    return errorResponse(
      503,
      'ADMIN_USERS_UNAVAILABLE',
      'The server could not retrieve the user registry.',
      requestId
    );
  }
}

export async function onRequestPost(context) {
  return errorResponse(
    405,
    'METHOD_NOT_ALLOWED',
    'User administration writes are not enabled by this Phase 2 endpoint.',
    getRequestId(context.request)
  );
      }
