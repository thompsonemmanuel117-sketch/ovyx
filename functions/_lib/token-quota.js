import {
  getFirestoreData,
  getFirestoreDocument,
  setFirestoreDocument,
  setFirestoreDocumentIfCurrent,
} from './firebase-admin.js';

export const QUOTA_PLANS = Object.freeze({
  free: Object.freeze({ monthly: 50_000, daily: 4, label: 'Free Trial' }),
  pro: Object.freeze({ monthly: 500_000, daily: 20, label: 'Pro Plan' }),
  max: Object.freeze({ monthly: 5_000_000, daily: 100, label: 'Max Plan' }),
});

export const DAILY_RATION_MESSAGE =
  'You have consumed your daily prompt ration. Please wait until midnight for your daily allocation reset or upgrade your subscription tier.';

const ROOT_EMAIL = 'ovyxsupportteam@gmail.com';

function normalizeTier(value) {
  const tier = String(value || '').trim().toLowerCase();
  return ['free', 'pro', 'max'].includes(tier) ? tier : 'free';
}

function userId(user) {
  return String(user?.sub || user?.uid || '').trim();
}

function isAdminUser(user) {
  const email = String(user?.email || '').trim().toLowerCase();
  return Boolean(
    user?.admin === true ||
    user?.owner === true ||
    user?.role === 'admin' ||
    user?.role === 'owner' ||
    email === ROOT_EMAIL
  );
}

function utcDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function utcMonthKey(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

function activeTier(profile = {}) {
  const state = String(profile.planTierState || '').trim().toLowerCase();
  const raw =
    profile.planTier ??
    profile.tier ??
    profile.plan ??
    'free';

  if (state && ['expired', 'refunded', 'chargeback', 'suspended'].includes(state)) {
    return 'free';
  }

  return normalizeTier(raw);
}

function normalizeProfile(profile = {}) {
  const now = new Date();
  const dayKey = utcDayKey(now);
  const monthKey = utcMonthKey(now);
  const tier = activeTier(profile);
  const limits = QUOTA_PLANS[tier];

  const next = { ...profile };
  let changed = false;

  if (profile.current_monthly_tokens === undefined || profile.current_monthly_tokens === null) {
    next.current_monthly_tokens = limits.monthly;
    changed = true;
  }

  if (profile.booster_tokens === undefined || profile.booster_tokens === null) {
    next.booster_tokens = 0;
    changed = true;
  }

  if (profile.daily_prompts_allowance === undefined || profile.daily_prompts_allowance === null) {
    next.daily_prompts_allowance = limits.daily;
    changed = true;
  }

  if (typeof profile.is_monthly_exhausted !== 'boolean') {
    next.is_monthly_exhausted = false;
    changed = true;
  }

  const storedTier = String(profile._ovyxQuotaTier || '').trim().toLowerCase();
  if (storedTier !== tier) {
    next._ovyxQuotaTier = tier;
    next.current_monthly_tokens = limits.monthly;
    next.daily_prompts_allowance = limits.daily;
    next.is_monthly_exhausted = false;
    changed = true;
  }

  if (String(profile._ovyxQuotaMonthKey || '') !== monthKey) {
    next._ovyxQuotaMonthKey = monthKey;
    next.current_monthly_tokens = limits.monthly;
    next.is_monthly_exhausted = false;
    changed = true;
  }

  if (String(profile._ovyxQuotaDayKey || '') !== dayKey) {
    next._ovyxQuotaDayKey = dayKey;
    next.daily_prompts_allowance = limits.daily;
    changed = true;
  }

  next.current_monthly_tokens = Math.max(
    0,
    Number.parseInt(next.current_monthly_tokens, 10) || 0
  );
  next.booster_tokens = Math.max(
    0,
    Number.parseInt(next.booster_tokens, 10) || 0
  );
  next.daily_prompts_allowance = Math.max(
    0,
    Number.parseInt(next.daily_prompts_allowance, 10) || 0
  );
  next.is_monthly_exhausted = Boolean(next.is_monthly_exhausted);

  if (next.current_monthly_tokens <= 0) {
    next.is_monthly_exhausted = true;
  }

  if (profile.current_monthly_tokens !== next.current_monthly_tokens) changed = true;
  if (profile.booster_tokens !== next.booster_tokens) changed = true;
  if (profile.daily_prompts_allowance !== next.daily_prompts_allowance) changed = true;
  if (profile.is_monthly_exhausted !== next.is_monthly_exhausted) changed = true;
  if (profile._ovyxQuotaDayKey !== next._ovyxQuotaDayKey) changed = true;
  if (profile._ovyxQuotaMonthKey !== next._ovyxQuotaMonthKey) changed = true;
  if (profile._ovyxQuotaTier !== next._ovyxQuotaTier) changed = true;

  return {
    profile: next,
    changed,
    tier,
    limits,
    dayKey,
    monthKey,
  };
}

function quotaState(profile, tier, limits) {
  const monthly = Math.max(0, Number.parseInt(profile.current_monthly_tokens, 10) || 0);
  const daily = Math.max(0, Number.parseInt(profile.daily_prompts_allowance, 10) || 0);
  const exhausted = Boolean(profile.is_monthly_exhausted) || monthly <= 0;

  const boosterTokens = Math.max(0, Number.parseInt(profile.booster_tokens, 10) || 0);
  const mode = exhausted ? (boosterTokens > 0 ? 'booster' : 'daily') : 'monthly';

  return {
    plan: tier,
    monthlyLimit: limits.monthly,
    dailyLimit: limits.daily,
    current_monthly_tokens: monthly,
    boosterTokens,
    daily_prompts_allowance: daily,
    is_monthly_exhausted: exhausted,
    mode,
  };
}

async function ensureProfile(env, uid, user) {
  const existingDoc = await getFirestoreDocument(env, 'users', uid);
  const existing = existingDoc
    ? (await getFirestoreData(env, 'users', uid)) || {}
    : {};

  const normalized = normalizeProfile({
    ...existing,
    email: existing.email || user?.email || null,
    displayName: existing.displayName || user?.name || null,
  });

  if (!existingDoc) {
    const payload = {
      email: normalized.profile.email || null,
      displayName: normalized.profile.displayName || null,
      planTier: normalizeTier(existing.planTier || existing.plan || 'free'),
      current_monthly_tokens: normalized.profile.current_monthly_tokens,
      booster_tokens: normalized.profile.booster_tokens,
      daily_prompts_allowance: normalized.profile.daily_prompts_allowance,
      is_monthly_exhausted: normalized.profile.is_monthly_exhausted,
      _ovyxQuotaTier: normalized.profile._ovyxQuotaTier,
      _ovyxQuotaDayKey: normalized.profile._ovyxQuotaDayKey,
      _ovyxQuotaMonthKey: normalized.profile._ovyxQuotaMonthKey,
      quotaSchemaVersion: 1,
    };
    await setFirestoreDocument(env, 'users', uid, payload, { merge: true });
    return payload;
  }

  if (normalized.changed || existing.quotaSchemaVersion !== 1) {
    await setFirestoreDocument(
      env,
      'users',
      uid,
      {
        current_monthly_tokens: normalized.profile.current_monthly_tokens,
        booster_tokens: normalized.profile.booster_tokens,
        daily_prompts_allowance: normalized.profile.daily_prompts_allowance,
        is_monthly_exhausted: normalized.profile.is_monthly_exhausted,
        _ovyxQuotaTier: normalized.profile._ovyxQuotaTier,
        _ovyxQuotaDayKey: normalized.profile._ovyxQuotaDayKey,
        _ovyxQuotaMonthKey: normalized.profile._ovyxQuotaMonthKey,
        quotaSchemaVersion: 1,
      },
      { merge: true }
    );
  }

  return normalized.profile;
}

export async function getQuotaState(env, user) {
  const uid = userId(user);
  if (!uid) throw Object.assign(new Error('Authentication required.'), {
    status: 401,
    code: 'AUTH_REQUIRED',
  });

  if (isAdminUser(user)) {
    const limits = QUOTA_PLANS.max;
    return {
      plan: 'max',
      monthlyLimit: limits.monthly,
      dailyLimit: limits.daily,
      current_monthly_tokens: limits.monthly,
      daily_prompts_allowance: limits.daily,
      is_monthly_exhausted: false,
      boosterTokens: 0,
      mode: 'bypass',
      bypass: true,
    };
  }

  const profile = await ensureProfile(env, uid, user);
  const normalized = normalizeProfile(profile);

  if (normalized.changed) {
    await setFirestoreDocument(
      env,
      'users',
      uid,
      {
        current_monthly_tokens: normalized.profile.current_monthly_tokens,
        daily_prompts_allowance: normalized.profile.daily_prompts_allowance,
        is_monthly_exhausted: normalized.profile.is_monthly_exhausted,
        _ovyxQuotaTier: normalized.profile._ovyxQuotaTier,
        _ovyxQuotaDayKey: normalized.profile._ovyxQuotaDayKey,
        _ovyxQuotaMonthKey: normalized.profile._ovyxQuotaMonthKey,
        quotaSchemaVersion: 1,
      },
      { merge: true }
    );
  }

  return {
    ...quotaState(normalized.profile, normalized.tier, normalized.limits),
    bypass: false,
  };
}

export async function beginAIQuota(env, user) {
  const uid = userId(user);
  if (!uid) {
    throw Object.assign(new Error('Authentication required.'), {
      status: 401,
      code: 'AUTH_REQUIRED',
    });
  }

  if (isAdminUser(user)) {
    const limits = QUOTA_PLANS.max;
    return {
      uid,
      mode: 'bypass',
      plan: 'max',
      monthlyLimit: limits.monthly,
      dailyLimit: limits.daily,
      bypass: true,
      reservedDailyPrompt: false,
    };
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const doc = await getFirestoreDocument(env, 'users', uid);
    const profile = doc
      ? (await getFirestoreData(env, 'users', uid)) || {}
      : {};

    const normalized = normalizeProfile(profile);

    if (!doc) {
      await setFirestoreDocument(
        env,
        'users',
        uid,
        {
          email: profile.email || user?.email || null,
          displayName: profile.displayName || user?.name || null,
          planTier: normalized.tier,
          current_monthly_tokens: normalized.profile.current_monthly_tokens,
          booster_tokens: normalized.profile.booster_tokens,
          daily_prompts_allowance: normalized.profile.daily_prompts_allowance,
          is_monthly_exhausted: normalized.profile.is_monthly_exhausted,
          _ovyxQuotaTier: normalized.profile._ovyxQuotaTier,
          _ovyxQuotaDayKey: normalized.profile._ovyxQuotaDayKey,
          _ovyxQuotaMonthKey: normalized.profile._ovyxQuotaMonthKey,
          quotaSchemaVersion: 1,
        },
        { merge: true }
      );
      continue;
    }

    const base = {
      current_monthly_tokens: normalized.profile.current_monthly_tokens,
      daily_prompts_allowance: normalized.profile.daily_prompts_allowance,
      is_monthly_exhausted: normalized.profile.is_monthly_exhausted,
      _ovyxQuotaTier: normalized.profile._ovyxQuotaTier,
      _ovyxQuotaDayKey: normalized.profile._ovyxQuotaDayKey,
      _ovyxQuotaMonthKey: normalized.profile._ovyxQuotaMonthKey,
      quotaSchemaVersion: 1,
    };

    const current = quotaState(normalized.profile, normalized.tier, normalized.limits);

    if (!current.is_monthly_exhausted) {
      if (normalized.changed) {
        try {
          await setFirestoreDocumentIfCurrent(env, 'users', uid, base, doc.updateTime);
        } catch (error) {
          if (error?.status === 409 || error?.code === 'FIRESTORE_PRECONDITION_FAILED') continue;
          throw error;
        }
      }

      return {
        uid,
        mode: 'monthly',
        plan: normalized.tier,
        monthlyLimit: normalized.limits.monthly,
        dailyLimit: normalized.limits.daily,
        bypass: false,
        reservedDailyPrompt: false,
      };
    }

    if (current.boosterTokens > 0) {
      return {
        uid,
        mode: 'booster',
        plan: normalized.tier,
        monthlyLimit: normalized.limits.monthly,
        dailyLimit: normalized.limits.daily,
        bypass: false,
        reservedDailyPrompt: false,
      };
    }

    if (current.daily_prompts_allowance <= 0) {
      throw Object.assign(new Error(DAILY_RATION_MESSAGE), {
        status: 429,
        code: 'DAILY_RATION_EXHAUSTED',
        quota: current,
      });
    }

    try {
      await setFirestoreDocumentIfCurrent(
        env,
        'users',
        uid,
        {
          ...base,
          daily_prompts_allowance: current.daily_prompts_allowance - 1,
          is_monthly_exhausted: true,
          _ovyxQuotaLastDailyPromptAt: new Date().toISOString(),
        },
        doc.updateTime
      );

      return {
        uid,
        mode: 'daily',
        plan: normalized.tier,
        monthlyLimit: normalized.limits.monthly,
        dailyLimit: normalized.limits.daily,
        bypass: false,
        reservedDailyPrompt: true,
      };
    } catch (error) {
      if (error?.status === 409 || error?.code === 'FIRESTORE_PRECONDITION_FAILED') continue;
      throw error;
    }
  }

  throw Object.assign(new Error('Quota state changed concurrently. Please retry.'), {
    status: 409,
    code: 'QUOTA_STATE_CONFLICT',
  });
}

export function calculateTokenUsage(rawUsage, inputText = '', outputText = '') {
  const usage = rawUsage && typeof rawUsage === 'object' ? rawUsage : {};

  const pick = (...keys) => {
    for (const key of keys) {
      const value = Number(usage?.[key]);
      if (Number.isFinite(value) && value >= 0) return Math.round(value);
    }
    return null;
  };

  const inputTokens = pick(
    'promptTokenCount',
    'prompt_tokens',
    'input_tokens',
    'inputTokenCount',
    'inputTokens'
  );
  const outputTokens = pick(
    'candidatesTokenCount',
    'completion_tokens',
    'output_tokens',
    'outputTokenCount',
    'outputTokens'
  );
  const totalTokens = pick(
    'totalTokenCount',
    'total_tokens',
    'totalTokens'
  );

  const estimatedInput = Math.ceil(String(inputText || '').length / 4);
  const estimatedOutput = Math.ceil(String(outputText || '').length / 4);

  const inCount = inputTokens ?? estimatedInput;
  const outCount = outputTokens ?? estimatedOutput;
  const total = totalTokens ?? (inCount + outCount);

  return {
    inputTokens: inCount,
    outputTokens: outCount,
    totalTokens: Math.max(0, total),
    estimated: inputTokens === null && outputTokens === null && totalTokens === null,
  };
}

export async function finalizeAIQuota(env, reservation, rawUsage, inputText, outputText) {
  if (!reservation || reservation.bypass) {
    return getQuotaState(env, { uid: reservation?.uid });
  }

  const uid = reservation.uid;
  const usage = calculateTokenUsage(rawUsage, inputText, outputText);
  const cost = Math.max(0, Number(usage.totalTokens) || 0);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const doc = await getFirestoreDocument(env, 'users', uid);
    if (!doc) {
      const profile = await ensureProfile(env, uid, { uid });
      return getQuotaState(env, { uid });
    }

    const profile = (await getFirestoreData(env, 'users', uid)) || {};
    const normalized = normalizeProfile(profile);
    const current = Math.max(0, Number(normalized.profile.current_monthly_tokens) || 0);
    const booster = Math.max(0, Number(normalized.profile.booster_tokens) || 0);
    const monthlySpend = Math.min(current, cost);
    const boosterSpend = Math.max(0, cost - monthlySpend);
    const next = Math.max(0, current - monthlySpend);
    const nextBooster = Math.max(0, booster - boosterSpend);
    const nextExhausted = next <= 0;

    try {
      await setFirestoreDocumentIfCurrent(
        env,
        'users',
        uid,
        {
          current_monthly_tokens: next,
          booster_tokens: nextBooster,
          is_monthly_exhausted: nextExhausted,
          _ovyxQuotaTier: normalized.tier,
          _ovyxQuotaDayKey: normalized.profile._ovyxQuotaDayKey,
          _ovyxQuotaMonthKey: normalized.profile._ovyxQuotaMonthKey,
          quotaSchemaVersion: 1,
        },
        doc.updateTime
      );

      return {
        ...quotaState(
          {
            ...normalized.profile,
            current_monthly_tokens: next,
            is_monthly_exhausted: nextExhausted,
          },
          normalized.tier,
          normalized.limits
        ),
        usage,
        bypass: false,
      };
    } catch (error) {
      if (error?.status === 409 || error?.code === 'FIRESTORE_PRECONDITION_FAILED') continue;
      throw error;
    }
  }

  throw Object.assign(new Error('Unable to finalize AI quota safely.'), {
    status: 503,
    code: 'QUOTA_FINALIZE_FAILED',
  });
}

export async function refundDailyPrompt(env, reservation) {
  if (!reservation || reservation.bypass || reservation.mode !== 'daily' || !reservation.reservedDailyPrompt) {
    return;
  }

  const uid = String(reservation.uid || '').trim();
  if (!uid) return;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const doc = await getFirestoreDocument(env, 'users', uid);
    if (!doc) return;

    const profile = (await getFirestoreData(env, 'users', uid)) || {};
    const normalized = normalizeProfile(profile);
    const cap = normalized.limits.daily;
    const current = Math.max(0, Number.parseInt(normalized.profile.daily_prompts_allowance, 10) || 0);
    const restored = Math.min(cap, current + 1);

    try {
      await setFirestoreDocumentIfCurrent(
        env,
        'users',
        uid,
        {
          daily_prompts_allowance: restored,
          is_monthly_exhausted: true,
          _ovyxQuotaDayKey: normalized.profile._ovyxQuotaDayKey,
          _ovyxQuotaMonthKey: normalized.profile._ovyxQuotaMonthKey,
          _ovyxQuotaTier: normalized.tier,
          quotaSchemaVersion: 1,
        },
        doc.updateTime
      );
      return;
    } catch (error) {
      if (error?.status === 409 || error?.code === 'FIRESTORE_PRECONDITION_FAILED') continue;
      return;
    }
  }
}

export async function syncTierQuota(env, uid, tierValue) {
  const id = String(uid || '').trim();
  if (!id) return;

  const tier = normalizeTier(tierValue);
  const limits = QUOTA_PLANS[tier];

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const doc = await getFirestoreDocument(env, 'users', id);
    const current = doc ? (await getFirestoreData(env, 'users', id)) || {} : {};

    if (
      String(current._ovyxQuotaTier || '').trim().toLowerCase() === tier &&
      typeof current.current_monthly_tokens === 'number' &&
      typeof current.daily_prompts_allowance === 'number'
    ) {
      return;
    }

    const fields = {
      current_monthly_tokens: limits.monthly,
      daily_prompts_allowance: limits.daily,
      is_monthly_exhausted: false,
      _ovyxQuotaTier: tier,
      _ovyxQuotaDayKey: utcDayKey(),
      _ovyxQuotaMonthKey: utcMonthKey(),
      quotaSchemaVersion: 1,
    };

    if (!doc) {
      await setFirestoreDocument(env, 'users', id, {
        planTier: tier,
        ...fields,
      }, { merge: true });
      return;
    }

    try {
      await setFirestoreDocumentIfCurrent(env, 'users', id, fields, doc.updateTime);
      return;
    } catch (error) {
      if (error?.status === 409 || error?.code === 'FIRESTORE_PRECONDITION_FAILED') continue;
      throw error;
    }
  }

  throw Object.assign(new Error('Unable to scale plan quota safely.'), {
    status: 503,
    code: 'QUOTA_TIER_SYNC_FAILED',
  });
}

export async function initializeQuotaProfile(env, uid, tier = 'free') {
  await syncTierQuota(env, uid, normalizeTier(tier));
}
