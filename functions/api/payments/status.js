'use strict';

const {
  verifyFirebaseIdToken
} = require('../_lib/auth.js');

const {
  errorResponse,
  jsonResponse
} = require('../_lib/http.js');

const {
  firestoreGet
} = require('../_lib/firestore.js');

const {
  resolveEntitlements
} = require('../_lib/entitlements.js');

const ALLOWED_METHODS = Object.freeze([
  'GET',
  'OPTIONS'
]);

const ROOT_EMAIL =
  'ovyxsupportteam@gmail.com';

function cleanString(
  value,
  max = 256
) {
  return String(value || '')
    .trim()
    .slice(0, max);
}

function requestId(request) {
  return (
    request.headers.get('CF-Ray') ||
    request.headers.get('X-Request-ID') ||
    crypto.randomUUID()
  );
}

function normalizeState(
  value
) {
  const state =
    cleanString(
      value,
      64
    ).toLowerCase();

  const allowed = new Set([
    'trialing',
    'active',
    'past_due',
    'canceled',
    'expired',
    'refunded',
    'chargeback',
    'suspended',
    'free'
  ]);

  return allowed.has(state)
    ? state
    : 'free';
}

function normalizeTier(
  value
) {
  const tier =
    cleanString(
      value,
      32
    ).toLowerCase();

  if (
    tier === 'root' ||
    tier === 'max' ||
    tier === 'pro'
  ) {
    return tier;
  }

  return 'free';
}

function isRootEmail(
  email
) {
  return (
    cleanString(
      email,
      160
    ).toLowerCase() ===
    ROOT_EMAIL
  );
}

function sanitizeCapabilities(
  value
) {
  const input =
    value &&
    typeof value === 'object'
      ? value
      : {};

  return {
    webStudio:
      input.webStudio === true,

    advancedWebStudio:
      input.advancedWebStudio === true,

    appStudio:
      input.appStudio === true,

    gameStudio:
      input.gameStudio === true,

    aiGeneration:
      input.aiGeneration === true,

    github:
      input.github === true,

    cloudflareDeploy:
      input.cloudflareDeploy === true,

    teamWorkspace:
      input.teamWorkspace === true
  };
}

function sanitizeFeatureRules(
  value
) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      rule =>
        rule &&
        typeof rule === 'object'
    )
    .slice(0, 100)
    .map(
      rule => ({
        feature:
          cleanString(
            rule.feature ||
            rule.id ||
            rule.name,
            160
          ),

        tier:
          cleanString(
            rule.tier ||
            rule.requiredTier,
            32
          ).toLowerCase(),

        locked:
          rule.locked === true,

        enabled:
          rule.enabled !== false
      })
    )
    .filter(
      rule =>
        rule.feature
    );
}

async function handleGet(
  request,
  env
) {
  const id =
    requestId(request);

  const identity =
    await verifyFirebaseIdToken(
      request,
      env
    );

  if (!identity.ok) {
    return identity.response;
  }

  let profile;

  try {
    profile =
      await firestoreGet(
        env,
        [
          'users',
          identity.user.uid
        ]
      ) || {};
  } catch {
    return errorResponse(
      503,
      'SUBSCRIPTION_STATE_UNAVAILABLE',
      'Your subscription state could not be loaded.'
    );
  }

  let entitlements;

  try {
    entitlements =
      await resolveEntitlements(
        env,
        identity.user
      );
  } catch {
    return errorResponse(
      503,
      'ENTITLEMENTS_UNAVAILABLE',
      'Your OVYX entitlements could not be resolved.'
    );
  }

  const root =
    isRootEmail(
      identity.user.email
    );

  const planTier =
    root
      ? 'root'
      : normalizeTier(
          profile.planTier ||
          entitlements.planTier
        );

  const planTierState =
    root
      ? 'active'
      : normalizeState(
          profile.planTierState ||
          profile.subscriptionStatus ||
          entitlements.planTierState
        );

  const subscriptionStatus =
    root
      ? 'active'
      : normalizeState(
          profile.subscriptionStatus ||
          profile.planTierState
        );

  const response = {
    ok:
      true,

    user: {
      uid:
        identity.user.uid,

      email:
        identity.user.email,

      emailVerified:
        identity.user.emailVerified === true
    },

    subscription: {
      planTier,

      planTierState,

      status:
        subscriptionStatus,

      provider:
        root
          ? null
          : cleanString(
              profile.subscriptionProvider ||
              profile.paymentProvider,
              64
            ) || null,

      subscriptionId:
        root
          ? null
          : cleanString(
              profile.subscriptionId,
              160
            ) || null,

      activatedAt:
        root
          ? null
          : profile.subscriptionActivatedAt ||
            null,

      lastPaymentAt:
        root
          ? null
          : profile.lastPaymentAt ||
            null,

      currency:
        root
          ? null
          : cleanString(
              profile.paymentCurrency,
              8
            ).toUpperCase() || null,

      amount:
        root
          ? null
          : Number.isFinite(
              Number(
                profile.paymentAmount
              )
            )
              ? Number(
                  profile.paymentAmount
                )
              : null
    },

    entitlements: {
      capabilities:
        sanitizeCapabilities(
          entitlements.capabilities
        ),

      featureRules:
        sanitizeFeatureRules(
          entitlements.featureRules
        )
    },

    serverAuthoritative:
      true,

    browserPlanStateTrusted:
      false,

    requestId:
      id
  };

  return jsonResponse(
    response,
    200,
    {
      'Cache-Control':
        'no-store, max-age=0',

      Pragma:
        'no-cache',

      'X-OVYX-Request-ID':
        id
    }
  );
}

async function onRequest(
  context
) {
  const {
    request,
    env
  } = context;

  if (
    !ALLOWED_METHODS.includes(
      request.method
    )
  ) {
    return errorResponse(
      405,
      'METHOD_NOT_ALLOWED',
      'Only GET is supported for this endpoint.',
      {
        Allow:
          'GET, OPTIONS'
      }
    );
  }

  if (
    request.method ===
    'OPTIONS'
  ) {
    return new Response(
      null,
      {
        status:
          204,

        headers: {
          Allow:
            'GET, OPTIONS'
        }
      }
    );
  }

  return handleGet(
    request,
    env
  );
}

module.exports = {
  onRequest
};
