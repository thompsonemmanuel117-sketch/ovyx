'use strict';

const {
  verifyFirebaseIdToken
} = require('../_lib/auth.js');

const {
  errorResponse
} = require('../_lib/http.js');

const {
  isRootUser,
  normalizeCapabilities
} = require('../_lib/brain/registry.js');

const {
  run
} = require('../_lib/brain/orchestrator.js');

const MAX_BODY_BYTES = 1024 * 1024;

function jsonResponse(status, body, requestId) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Request-ID': requestId || crypto.randomUUID(),
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer'
      }
    }
  );
}

function requestId(request) {
  return (
    request.headers.get('X-Request-ID') ||
    crypto.randomUUID()
  );
}

async function readJson(request) {
  const contentLength =
    Number(request.headers.get('Content-Length') || 0);

  if (
    contentLength > MAX_BODY_BYTES
  ) {
    const error = new Error(
      'AI request payload is too large.'
    );

    error.code = 'PAYLOAD_TOO_LARGE';
    error.status = 413;

    throw error;
  }

  return request.json();
}

async function loadEntitlements(request, token) {
  const url = new URL(
    '/api/entitlements',
    request.url
  );

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    }
  });

  let payload = {};

  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const error = new Error(
      'The OVYX entitlement service rejected the session.'
    );

    error.code = 'ENTITLEMENTS_UNAVAILABLE';
    error.status =
      response.status >= 500
        ? 503
        : response.status;

    throw error;
  }

  return payload;
}

function configuredProvider(env, provider) {
  const map = {
    gemini: 'GEMINI_API_KEY',
    claude: 'ANTHROPIC_API_KEY',
    deepseek: 'DEEPSEEK_API_KEY',
    openai: 'OPENAI_API_KEY'
  };

  const secretName = map[provider];

  return Boolean(
    secretName &&
    String(env[secretName] || '').trim()
  );
}

async function onRequestPost(context) {
  const request = context.request;
  const env = context.env;
  const id = requestId(request);

  const auth = await verifyFirebaseIdToken(
    request,
    env
  );

  if (!auth.ok) {
    return auth.response;
  }

  if (!auth.user.emailVerified) {
    return errorResponse(
      403,
      'EMAIL_VERIFICATION_REQUIRED',
      'A verified OVYX email address is required.'
    );
  }

  let body;

  try {
    body = await readJson(request);
  } catch (error) {
    return jsonResponse(
      error.status || 400,
      {
        ok: false,
        error: {
          code:
            error.code ||
            'INVALID_REQUEST',
          message:
            error.message ||
            'Invalid AI request.'
        }
      },
      id
    );
  }

  const provider = String(
    body?.provider || ''
  ).trim().toLowerCase();

  if (!configuredProvider(env, provider)) {
    return jsonResponse(
      503,
      {
        ok: false,
        error: {
          code: 'AI_PROVIDER_NOT_CONFIGURED',
          message:
            'The requested AI provider is not configured on the OVYX server.'
        }
      },
      id
    );
  }

  let entitlements;

  try {
    entitlements =
      await loadEntitlements(
        request,
        auth.token
      );
  } catch (error) {
    return jsonResponse(
      error.status || 503,
      {
        ok: false,
        error: {
          code:
            error.code ||
            'ENTITLEMENTS_UNAVAILABLE',
          message:
            error.message ||
            'OVYX entitlement verification failed.'
        }
      },
      id
    );
  }

  const capabilities =
    isRootUser(auth.user)
      ? {
          webStudio: true,
          advancedWebStudio: true,
          appStudio: true,
          gameStudio: true,
          aiGeneration: true,
          github: true,
          cloudflareDeploy: true,
          teamWorkspace: true
        }
      : normalizeCapabilities(
          entitlements
        );

  if (!capabilities.aiGeneration) {
    return jsonResponse(
      403,
      {
        ok: false,
        error: {
          code: 'AI_GENERATION_NOT_ALLOWED',
          message:
            'AI Generation is not enabled for this OVYX account.'
        }
      },
      id
    );
  }

  const messages =
    Array.isArray(body.messages)
      ? body.messages
      : [];

  if (!messages.length) {
    return jsonResponse(
      400,
      {
        ok: false,
        error: {
          code: 'MESSAGES_REQUIRED',
          message:
            'At least one AI message is required.'
        }
      },
      id
    );
  }

  try {
    const result = await run({
      env,
      user: auth.user,
      entitlements: {
        ...entitlements,
        capabilities
      },
      provider,
      model: body.model,
      messages,
      system: body.system,
      temperature:
        typeof body.temperature === 'number'
          ? body.temperature
          : 0.4,
      maxTokens:
        Number(body.maxTokens) || 4096,
      requestedTool:
        body.tool || null,
      toolResult:
        body.toolResult || null
    });

    return jsonResponse(
      200,
      {
        ok: true,
        requestId: id,
        provider: result.provider,
        model: result.model,
        text: result.text,
        tools: result.tools
      },
      id
    );
  } catch (error) {
    return jsonResponse(
      error.status || 502,
      {
        ok: false,
        requestId: id,
        error: {
          code:
            error.code ||
            'AI_GATEWAY_FAILED',
          message:
            error.message ||
            'OVYX AI Gateway failed.'
        }
      },
      id
    );
  }
}

async function onRequest(context) {
  if (context.request.method !== 'POST') {
    return errorResponse(
      405,
      'METHOD_NOT_ALLOWED',
      'Only POST is allowed.'
    );
  }

  return onRequestPost(context);
}

module.exports = {
  onRequest,
  onRequestPost
};
