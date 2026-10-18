'use strict';

import { getFirestoreData } from '../_lib/firebase-admin.js';
import { authenticateRequest } from '../_lib/firebase.js';
import { jsonResponse, errorResponse, requestId } from './_lib/http.js';
import { isRootUser } from '../_lib/brain/registry.js';

const ROOT_EMAIL = 'ovyxsupportteam@gmail.com';

const PAID_STATES = new Set([
  'trialing',
  'active'
]);

const PAID_TIERS = new Set([
  'pro',
  'max'
]);

const TIER_RANK = Object.freeze({
  free: 0,
  pro: 1,
  max: 2,
  root: 3
});

const DEFAULT_FREE_CAPABILITIES = Object.freeze({
  webStudio: true,
  advancedWebStudio: false,
  appStudio: true,
  gameStudio: false,
  // Free includes a small AI allowance; the server quota engine enforces its limits.
  aiGeneration: true,
  github: false,
  cloudflareDeploy: true,
  teamWorkspace: false,
  templates: true
});

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeTimestamp(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;

  /* Payment webhooks persist ISO-8601 expiry strings; admin assignments use milliseconds. */
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function isRootIdentity(user) {
  if (isRootUser(user)) {
    return true;
  }

  return normalizeEmail(user?.email) === ROOT_EMAIL;
}

function hasValidRollingAccess(profile, now) {
  const tier = String(profile?.planTier || 'free')
    .trim()
    .toLowerCase();

  const state = String(profile?.planTierState || 'free')
    .trim()
    .toLowerCase();

  const expiresAt = normalizeTimestamp(profile?.expiresAt);

  return (
    PAID_TIERS.has(tier) &&
    PAID_STATES.has(state) &&
    expiresAt !== null &&
    expiresAt > now
  );
}

function buildPaidCapabilities(tier) {
  return {
    webStudio: true,
    advancedWebStudio: tier === 'max',
    appStudio: true,
    gameStudio: false,
    aiGeneration: true,
    github: true,
    cloudflareDeploy: true,
    teamWorkspace: true,
    templates: true
  };
}

function normalizeFeatureRules(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(rule => rule && typeof rule === 'object')
    .map(rule => ({
      feature: String(rule.feature || '').trim(),
      tier: String(rule.tier || 'free').trim().toLowerCase(),
      locked: rule.locked === true
    }))
    .filter(rule => rule.feature);
}

function canonicalCapabilityName(value, capabilities) {
  const normalized = String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const aliases = {
    webstudio: 'webStudio',
    advancedwebstudio: 'advancedWebStudio',
    appstudio: 'appStudio',
    gamestudio: 'gameStudio',
    aigeneration: 'aiGeneration',
    github: 'github',
    cloudflaredeploy: 'cloudflareDeploy',
    teamworkspace: 'teamWorkspace',
    workspace: 'teamWorkspace',
    templates: 'templates'
  };
  const candidate = aliases[normalized] || value;
  return Object.prototype.hasOwnProperty.call(capabilities, candidate) ? candidate : null;
}

function applyPlanFeatures(capabilities, planFeatures, tier, managed) {
  const result = { ...capabilities };
  if (!managed || !['pro', 'max'].includes(String(tier || '').toLowerCase())) return result;
  const source = planFeatures && planFeatures[String(tier).toLowerCase()];
  if (!Array.isArray(source)) return result;
  const allowed = new Set(source.map(item => String(typeof item === 'string' ? item : (item?.id || item?.key || '')).trim()).filter(Boolean));
  // Once the owner explicitly manages a paid tier, the saved list is the
  // capability allowlist for that tier. Do not intersect with defaults here:
  // doing so would make it impossible for the owner to enable a new capability.
  for (const feature of ['webStudio', 'advancedWebStudio', 'appStudio', 'gameStudio', 'aiGeneration', 'github', 'cloudflareDeploy', 'teamWorkspace', 'templates']) {
    result[feature] = allowed.has(feature);
  }
  return result;
}

function applyGlobalGating(capabilities, gating, tier) {
  const result = {
    ...capabilities
  };

  if (!gating || typeof gating !== 'object') {
    return result;
  }

  const currentRank = TIER_RANK[String(tier || 'free').trim().toLowerCase()] ?? 0;

  for (const [feature, requiredTierValue] of Object.entries(gating)) {
    const canonicalFeature = canonicalCapabilityName(feature, result);
    if (!canonicalFeature) continue;

    const requiredTier = String(requiredTierValue || 'free').trim().toLowerCase();
    const requiredRank = TIER_RANK[requiredTier];

    if (requiredRank === undefined) {
      continue;
    }

    if (currentRank < requiredRank) {
      result[canonicalFeature] = false;
    }
  }

  return result;
}

function applyFeatureRules(capabilities, featureRules) {
  const result = {
    ...capabilities
  };

  for (const rule of featureRules) {
    if (rule.locked !== true) {
      continue;
    }

    const feature = rule.feature;

    if (Object.prototype.hasOwnProperty.call(result, feature)) {
      result[feature] = false;
    }
  }

  return result;
}


async function resolveEntitlements(env, user) {
  const now = Date.now();

  /*
   * ROOT OVYX SUPPORT ACCOUNT
   *
   * Root access is deliberately independent of normal subscription
   * expiration. This is the server-side emergency/admin identity.
   */
  if (isRootIdentity(user)) {
    let systemConfig = {};

    try {
      systemConfig =
        (await getFirestoreData(env, 'system', 'config')) || {};
    } catch {
      systemConfig = {};
    }

    const featureRules = normalizeFeatureRules(
      systemConfig.featureRules
    );

    const gating =
      systemConfig.gating &&
      typeof systemConfig.gating === 'object'
        ? systemConfig.gating
        : {};

    return {
      planTier: 'root',
      planTierState: 'active',
      role: 'ROOT_SUPERUSER',
      owner: true,
      admin: true,
      bypass: true,
      paidAt: null,
      expiresAt: null,
      accessExpiresAt: null,
      accessActive: true,
      /* Root owner access is intentionally outside subscription and feature gating. */
      capabilities: {
        webStudio: true,
        advancedWebStudio: true,
        appStudio: true,
        gameStudio: true,
        aiGeneration: true,
        github: true,
        cloudflareDeploy: true,
        teamWorkspace: true,
        templates: true
      },
      featureRules,
      gating,
      planFeatures: systemConfig.planFeatures || {},
      planFeaturesManaged: systemConfig.planFeaturesManaged === true
    };
  }

  const profile =
    (await getFirestoreData(env, 'users', user.uid)) || {};

  const tier = String(profile.planTier || 'free')
    .trim()
    .toLowerCase();

  const state = String(profile.planTierState || 'free')
    .trim()
    .toLowerCase();

  const paidAt = normalizeTimestamp(profile.paidAt);
  const expiresAt = normalizeTimestamp(profile.expiresAt);

  /*
   * CRITICAL SECURITY RULE:
   *
   * Paid access exists only while:
   *
   *   expiresAt > Date.now()
   *
   * This is evaluated on the server for every entitlement resolution.
   *
   * Browser values such as:
   *
   *   user.plan
   *   localStorage
   *   window.KernelState
   *
   * have no authority here.
   */
  const accessActive =
    PAID_TIERS.has(tier) &&
    PAID_STATES.has(state) &&
    expiresAt !== null &&
    expiresAt > now;

  let capabilities;

  if (accessActive) {
    capabilities = buildPaidCapabilities(tier);
  } else {
    capabilities = {
      ...DEFAULT_FREE_CAPABILITIES
    };
  }

  /*
   * Feature locks are also server-side.
   *
   * /system/config is not client-writable under Phase 8 rules.
   */
  let systemConfig = {};

  try {
    systemConfig =
      (await getFirestoreData(env, 'system', 'config')) || {};
  } catch {
    systemConfig = {};
  }

  const featureRules = normalizeFeatureRules(
    systemConfig.featureRules
  );

  const gating =
    systemConfig.gating &&
    typeof systemConfig.gating === 'object'
      ? systemConfig.gating
      : {};

  const effectiveTier = accessActive ? tier : 'free';

  capabilities = applyPlanFeatures(capabilities, systemConfig.planFeatures, effectiveTier, systemConfig.planFeaturesManaged === true);
  capabilities = applyGlobalGating(
    capabilities,
    gating,
    effectiveTier
  );

  capabilities = applyFeatureRules(
    capabilities,
    featureRules
  );

  return {
    planTier: effectiveTier,
    planTierState: accessActive ? state : 'expired',
    paidAt,
    expiresAt,
    accessExpiresAt: expiresAt,
    accessActive,
    capabilities,
    featureRules,
    gating,
    planFeatures: systemConfig.planFeatures || {},
    planFeaturesManaged: systemConfig.planFeaturesManaged === true
  };
}

export {
  normalizeEmail,
  normalizeTimestamp,
  isRootIdentity,
  hasValidRollingAccess,
  buildPaidCapabilities,
  normalizeFeatureRules,
  applyFeatureRules,
  applyGlobalGating,
  applyPlanFeatures,
  resolveEntitlements
};


/*
 * This file is also the deployed GET /api/entitlements route.
 * The resolver above is deliberately server-authoritative; the handler
 * authenticates the caller and returns the role in the top-level shape
 * consumed by the existing OVYX frontend.
 */
export async function onRequestGet(context) {
  const id = requestId(context.request);
  try {
    const user = context.data?.user || await authenticateRequest(context.request, context.env);
    if (!user) {
      return errorResponse(401, 'AUTH_REQUIRED', 'Sign in to view your account permissions.', id);
    }

    const identity = {
      ...user,
      uid: String(user.uid || user.sub || '').trim(),
      sub: String(user.sub || user.uid || '').trim(),
      email: normalizeEmail(user.email)
    };
    if (!identity.uid || !identity.email) {
      return errorResponse(401, 'AUTH_IDENTITY_REQUIRED', 'Please sign in again to verify your account.', id);
    }

    const resolved = await resolveEntitlements(context.env, identity);
    const root = isRootIdentity(identity);
    const tier = String(resolved.planTier || 'free').trim().toLowerCase();
    const role = root ? 'ROOT_SUPERUSER' : tier === 'max' ? 'MAX_USER' : tier === 'pro' ? 'PRO_USER' : 'FREE_USER';

    return jsonResponse({
      ok: true,
      uid: identity.uid,
      email: identity.email,
      ...resolved,
      role,
      owner: root,
      admin: root,
      bypass: root,
      isRoot: root,
      entitlements: {
        ...resolved,
        role,
        owner: root,
        admin: root,
        bypass: root
      }
    }, 200, {
      'X-OVYX-Request-ID': id,
      'Cache-Control': 'no-store, max-age=0'
    });
  } catch (error) {
    return errorResponse(
      Number.isInteger(error?.status) ? error.status : 503,
      error?.code || 'ENTITLEMENTS_UNAVAILABLE',
      error?.message || 'OVYX account permissions could not be loaded safely.',
      id
    );
  }
}

export async function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  return errorResponse(405, 'METHOD_NOT_ALLOWED', 'GET is required.', requestId(context.request));
}
