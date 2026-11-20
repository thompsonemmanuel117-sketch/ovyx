'use strict';

import { getFirestoreData } from '../_lib/firebase-admin.js';
import { authenticateRequest } from '../_lib/firebase.js';
import { jsonResponse, errorResponse, requestId } from './_lib/http.js';
import { ROOT_EMAIL } from '../_lib/brain/registry.js';

const PAID_STATES = new Set([
  'trialing',
  'active'
]);

const PAID_TIERS = new Set([
  'pro',
  'max'
]);

const DEFAULT_FREE_CAPABILITIES = Object.freeze({
  // Product capabilities are currently open to every account. Plan tiers
  // describe billing and usage allowances, not feature availability.
  webStudio: true,
  advancedWebStudio: true,
  appStudio: true,
  gameStudio: true,
  aiGeneration: true,
  github: true,
  cloudflareDeploy: true,
  teamWorkspace: true,
  templates: true
});

function buildAvailableCapabilities() {
  return { ...DEFAULT_FREE_CAPABILITIES };
}

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
  // Only the canonical, Firebase-verified account email grants root bypass.
  // Firestore profile roles, plan flags, and browser state are never root authority.
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

function buildPaidCapabilities() {
  return buildAvailableCapabilities();
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
      capabilities: buildAvailableCapabilities(),
      featureRules: [],
      gating: {},
      planFeatures: {},
      planFeaturesManaged: false
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

  // Do not apply speculative feature locks from old plan configuration.
  // Every currently shipped capability stays available to every signed-in
  // account; actual usage quotas and paid subscription records remain intact.
  const capabilities = buildAvailableCapabilities();

  // Feature-gate configuration is intentionally not consulted until OVYX
  // explicitly introduces plan-based feature restrictions.
  const effectiveTier = accessActive ? tier : 'free';

  return {
    planTier: effectiveTier,
    planTierState: accessActive ? state : 'expired',
    paidAt,
    expiresAt,
    accessExpiresAt: expiresAt,
    accessActive,
    capabilities,
    featureRules: [],
    gating: {},
    planFeatures: {},
    planFeaturesManaged: false
  };
}

export {
  normalizeEmail,
  normalizeTimestamp,
  isRootIdentity,
  hasValidRollingAccess,
  buildPaidCapabilities,
  buildAvailableCapabilities,
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
