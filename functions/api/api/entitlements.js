'use strict';

const {
  jsonResponse,
  errorResponse,
  getRequestId,
  enforceSameOrigin
} = require('../../_lib/http.js');

const {
  verifyFirebaseIdToken,
  normalizeEmail
} = require('../../_lib/auth.js');

const {
  getFirestoreDocument
} = require('../../_lib/firebase-admin.js');

const ROOT_EMAIL =
  'ovyxsupportteam@gmail.com';

const CAPABILITY_NAMES = Object.freeze([
  'webStudio',
  'advancedWebStudio',
  'appStudio',
  'gameStudio',
  'aiGeneration',
  'github',
  'cloudflareDeploy',
  'teamWorkspace'
]);

const FREE_CAPABILITIES = Object.freeze({
  webStudio: false,
  advancedWebStudio: false,
  appStudio: false,
  gameStudio: false,
  aiGeneration: true,
  github: true,
  cloudflareDeploy: false,
  teamWorkspace: false
});

const PRO_CAPABILITIES = Object.freeze({
  webStudio: true,
  advancedWebStudio: true,
  appStudio: false,
  gameStudio: false,
  aiGeneration: true,
  github: true,
  cloudflareDeploy: true,
  teamWorkspace: false
});

const MAX_CAPABILITIES = Object.freeze({
  webStudio: true,
  advancedWebStudio: true,
  appStudio: true,
  gameStudio: true,
  aiGeneration: true,
  github: true,
  cloudflareDeploy: true,
  teamWorkspace: true
});

const ROOT_CAPABILITIES = Object.freeze({
  webStudio: true,
  advancedWebStudio: true,
  appStudio: true,
  gameStudio: true,
  aiGeneration: true,
  github: true,
  cloudflareDeploy: true,
  teamWorkspace: true
});

function normalizePlan(value) {
  const plan =
    String(value || '')
      .trim()
      .toLowerCase();

  if (
    plan === 'max' ||
    plan === 'maximum' ||
    plan === 'max_user'
  ) {
    return 'max';
  }

  if (
    plan === 'pro' ||
    plan === 'pro_user' ||
    plan === 'professional'
  ) {
    return 'pro';
  }

  return 'free';
}

function normalizeRole(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
}

function cloneCapabilities(source) {
  return CAPABILITY_NAMES.reduce(
    (result, key) => {
      result[key] =
        source[key] === true;
      return result;
    },
    {}
  );
}

function evaluateCapabilities({
  email,
  role,
  plan
}) {
  const normalizedEmail =
    normalizeEmail(email);

  if (normalizedEmail === ROOT_EMAIL) {
    return {
      role: 'ROOT_SUPERUSER',
      plan: 'root',
      capabilities:
        cloneCapabilities(ROOT_CAPABILITIES),
      systemAccess: {
        adminConsole: true,
        providerDiagnostics: true,
        billingAdministration: true,
        userAdministration: true,
        rbacAdministration: true,
        telemetryAdministration: true,
        backendAdministration: true,
        systemOverride: true
      }
    };
  }

  const normalizedRole =
    normalizeRole(role);

  let effectivePlan =
    normalizePlan(plan);

  if (
    normalizedRole === 'MAX_USER' ||
    normalizedRole === 'MAX'
  ) {
    effectivePlan = 'max';
  } else if (
    normalizedRole === 'PRO_USER' ||
    normalizedRole === 'PRO'
  ) {
    if (effectivePlan !== 'max') {
      effectivePlan = 'pro';
    }
  }

  if (effectivePlan === 'max') {
    return {
      role: 'MAX_USER',
      plan: 'max',
      capabilities:
        cloneCapabilities(MAX_CAPABILITIES),
      systemAccess: {
        adminConsole: false,
        providerDiagnostics: false,
        billingAdministration: false,
        userAdministration: false,
        rbacAdministration: false,
        telemetryAdministration: false,
        backendAdministration: false,
        systemOverride: false
      }
    };
  }

  if (effectivePlan === 'pro') {
    return {
      role: 'PRO_USER',
      plan: 'pro',
      capabilities:
        cloneCapabilities(PRO_CAPABILITIES),
      systemAccess: {
        adminConsole: false,
        providerDiagnostics: false,
        billingAdministration: false,
        userAdministration: false,
        rbacAdministration: false,
        telemetryAdministration: false,
        backendAdministration: false,
        systemOverride: false
      }
    };
  }

  return {
    role: 'FREE_USER',
    plan: 'free',
    capabilities:
      cloneCapabilities(FREE_CAPABILITIES),
    systemAccess: {
      adminConsole: false,
      providerDiagnostics: false,
      billingAdministration: false,
      userAdministration: false,
      rbacAdministration: false,
      telemetryAdministration: false,
      backendAdministration: false,
      systemOverride: false
    }
  };
}

async function buildEntitlements(env, authenticatedUser) {
  const email =
    normalizeEmail(authenticatedUser.email);

  if (email === ROOT_EMAIL) {
    return evaluateCapabilities({
      email,
      role: 'ROOT_SUPERUSER',
      plan: 'root'
    });
  }

  let profile = null;

  try {
    profile = await getFirestoreDocument(
      env,
      'users',
      authenticatedUser.uid
    );
  } catch (error) {
    throw new Error(
      `Unable to evaluate account entitlements: ${error.message}`
    );
  }

  const role =
    profile?.role || '';

  const plan =
    profile?.planTier ??
    profile?.tier ??
    profile?.plan ??
    'free';

  return evaluateCapabilities({
    email,
    role,
    plan
  });
}

export async function onRequestPost(context) {
  const request = context.request;
  const requestId = getRequestId(request);

  if (!enforceSameOrigin(request)) {
    return errorResponse(
      403,
      'ORIGIN_REJECTED',
      'Cross-origin entitlement requests are not permitted.',
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

  try {
    const entitlement =
      await buildEntitlements(
        context.env,
        auth.user
      );

    return jsonResponse(
      {
        ok: true,
        authority: 'SERVER',
        subject: {
          uid: auth.user.uid,
          email: auth.user.email
        },
        role: entitlement.role,
        plan: entitlement.plan,
        capabilities:
          entitlement.capabilities,
        systemAccess:
          entitlement.systemAccess,
        evaluatedAt:
          new Date().toISOString()
      },
      200,
      {
        'X-OVYX-Request-ID': requestId
      }
    );
  } catch (error) {
    console.error(
      `[OVYX ENTITLEMENTS ${requestId}]`,
      error?.message || error
    );

    return errorResponse(
      503,
      'ENTITLEMENT_EVALUATION_FAILED',
      'The server could not safely evaluate account entitlements. Access has been denied.',
      requestId
    );
  }
}

export async function onRequestGet(context) {
  return errorResponse(
    405,
    'METHOD_NOT_ALLOWED',
    'Use POST for entitlement evaluation.',
    getRequestId(context.request)
  );
}
