'use strict';

const { firestoreGet } = require('./firestore.js');
const { isRootUser } = require('./brain/registry.js');

const ROOT_EMAIL = 'ovyxsupportteam@gmail.com';

const PAID_STATES = new Set([
  'trialing',
  'active'
]);

const PAID_TIERS = new Set([
  'pro',
  'max'
]);

const DEFAULT_FREE_CAPABILITIES = Object.freeze({
  webStudio: true,
  advancedWebStudio: false,
  appStudio: true,
  gameStudio: false,
  aiGeneration: false,
  github: false,
  cloudflareDeploy: false,
  teamWorkspace: false
});

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeTimestamp(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = Number(value);

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }

  return numeric;
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
    teamWorkspace: true
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
        (await firestoreGet(env, ['system', 'config'])) || {};
    } catch {
      systemConfig = {};
    }

    const featureRules = normalizeFeatureRules(
      systemConfig.featureRules
    );

    return {
      planTier: 'root',
      planTierState: 'active',
      paidAt: null,
      expiresAt: null,
      accessExpiresAt: null,
      accessActive: true,
      capabilities: applyFeatureRules(
        {
          webStudio: true,
          advancedWebStudio: true,
          appStudio: true,
          gameStudio: true,
          aiGeneration: true,
          github: true,
          cloudflareDeploy: true,
          teamWorkspace: true
        },
        featureRules
      ),
      featureRules
    };
  }

  const profile =
    (await firestoreGet(env, ['users', user.uid])) || {};

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
      (await firestoreGet(env, ['system', 'config'])) || {};
  } catch {
    systemConfig = {};
  }

  const featureRules = normalizeFeatureRules(
    systemConfig.featureRules
  );

  capabilities = applyFeatureRules(
    capabilities,
    featureRules
  );

  return {
    planTier: accessActive ? tier : 'free',
    planTierState: accessActive ? state : 'expired',
    paidAt,
    expiresAt,
    accessExpiresAt: expiresAt,
    accessActive,
    capabilities,
    featureRules
  };
}

module.exports = {
  normalizeEmail,
  normalizeTimestamp,
  isRootIdentity,
  hasValidRollingAccess,
  buildPaidCapabilities,
  normalizeFeatureRules,
  applyFeatureRules,
  resolveEntitlements
};
