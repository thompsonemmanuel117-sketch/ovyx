'use strict';

const {
  verifyFirebaseIdToken
} = require('../_lib/auth.js');

const {
  errorResponse
} = require('../_lib/http.js');

const {
  runBrain
} = require('../_lib/brain/orchestrator.js');

const {
  getConfiguredProviders
} = require('../_lib/brain/providers.js');

const ROOT_EMAIL =
  'ovyxsupportteam@gmail.com';

const CAPABILITY_NAMES = [
  'webStudio',
  'advancedWebStudio',
  'appStudio',
  'gameStudio',
  'aiGeneration',
  'github',
  'cloudflareDeploy',
  'teamWorkspace'
];

function jsonResponse(status, body) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'Content-Security-Policy':
          "default-src 'none'; frame-ancestors 'none'"
      }
    }
  );
}

function normalizeCapabilities(value) {
  const result = {};

  for (const capability of CAPABILITY_NAMES) {
    result[capability] =
      value?.[capability] === true;
  }

  return result;
}

function getRootCapabilities(user) {
  if (
    String(user.email || '').toLowerCase() ===
    ROOT_EMAIL
  ) {
    return CAPABILITY_NAMES.reduce(
      (result, capability) => {
        result[capability] = true;
        return result;
      },
      {}
    );
  }

  return null;
}

/*
 * Phase 2 compatibility adapter.
 *
 * The gateway accepts server-provided capabilities through
 * context.data.entitlements when the existing entitlement
 * middleware populates it.
 *
 * It NEVER trusts a client-supplied capabilities object.
 */
function resolveServerCapabilities(context, user) {
  const rootCapabilities =
    getRootCapabilities(user);

  if (rootCapabilities) {
    return rootCapabilities;
  }

  const serverEntitlements =
    context?.data?.entitlements;

  if (
    serverEntitlements &&
    typeof serverEntitlements === 'object'
  ) {
    return normalizeCapabilities(
      serverEntitlements.capabilities ||
      serverEntitlements
    );
  }

  return normalizeCapabilities({});
}

async function readJson(request) {
  let body;

  try {
    body = await request.json();
  } catch {
    throw new Error('Invalid JSON request body.');
  }

  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body)
  ) {
    throw new Error('Request body must be an object.');
  }

  return body;
}

function validateBody(body) {
  const provider =
    String(body.provider || '')
      .trim()
      .toLowerCase();

  const allowedProviders = new Set([
    'gemini',
    'claude',
    'deepseek',
    'openai'
  ]);

  if (!allowedProviders.has(provider)) {
    throw new Error('Unsupported AI provider.');
  }

  if (!Array.isArray(body.messages)) {
    throw new Error('messages must be an array.');
  }

  if (body.messages.length > 30) {
    throw new Error(
      'Too many messages in one AI request.'
    );
  }

  return {
    provider,
    model: String(body.model || '').trim().slice(0, 150),
    messages: body.messages,
    temperature:
      Number.isFinite(Number(body.temperature))
        ? Number(body.temperature)
        : 0.2,
    maxTokens:
      Number.isFinite(Number(body.maxTokens))
        ? Number(body.maxTokens)
        : 2000,
    toolRequest:
      body.toolRequest &&
      typeof body.toolRequest === 'object'
        ? body.toolRequest
        : null
  };
}

async function onRequestPost(context) {
  const { request, env } = context;

  if (
    String(request.headers.get('content-type') || '')
      .toLowerCase()
      .includes('application/json') === false
  ) {
    return errorResponse(
      415,
      'CONTENT_TYPE_REQUIRED',
      'application/json is required.'
    );
  }

  const bodyLimit =
    Number(env.AI_GATEWAY_MAX_BODY_BYTES || 250000);

  const contentLength =
    Number(request.headers.get('content-length') || 0);

  if (
    Number.isFinite(contentLength) &&
    contentLength > bodyLimit
  ) {
    return errorResponse(
      413,
      'REQUEST_TOO_LARGE',
      'The AI request is too large.'
    );
  }

  const authentication =
    await verifyFirebaseIdToken(request, env);

  if (!authentication.ok) {
    return authentication.response;
  }

  if (
    authentication.user.emailVerified !== true &&
    authentication.user.email !== ROOT_EMAIL
  ) {
    return errorResponse(
      403,
      'EMAIL_VERIFICATION_REQUIRED',
      'A verified OVYX account is required.'
    );
  }

  let body;

  try {
    body = await readJson(request);
  } catch (error) {
    return errorResponse(
      400,
      'INVALID_REQUEST',
      error.message
    );
  }

  let input;

  try {
    input = validateBody(body);
  } catch (error) {
    return errorResponse(
      400,
      'INVALID_AI_REQUEST',
      error.message
    );
  }

  const capabilities =
    resolveServerCapabilities(
      context,
      authentication.user
    );

  if (capabilities.aiGeneration !== true) {
    return errorResponse(
      403,
      'CAPABILITY_DENIED',
      'AI generation is not enabled for this account.'
    );
  }

  const configuredProviders =
    getConfiguredProviders(env);

  if (!configuredProviders.includes(input.provider)) {
    return errorResponse(
      503,
      'AI_PROVIDER_UNAVAILABLE',
      'The requested AI provider is not configured.'
    );
  }

  try {
    const result = await runBrain({
      env,
      user: authentication.user,
      capabilities,
      provider: input.provider,
      model: input.model,
      messages: input.messages,
      temperature: input.temperature,
      maxTokens: input.maxTokens,
      toolRequest: input.toolRequest
    });

    return jsonResponse(200, {
      ok: true,
      data: result
    });
  } catch (error) {
    console.error('OVYX_AI_GATEWAY_ERROR', {
      uid: authentication.user.uid,
      provider: input.provider,
      code: error.code || 'AI_EXECUTION_ERROR'
    });

    if (error.code === 'CAPABILITY_DENIED') {
      return errorResponse(
        403,
        'CAPABILITY_DENIED',
        'The requested AI tool is not enabled for this account.'
      );
    }

    return errorResponse(
      502,
      'AI_PROVIDER_ERROR',
      'The AI provider could not complete the request.'
    );
  }
}

module.exports = {
  onRequestPost
};
