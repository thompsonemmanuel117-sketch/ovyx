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
  executeTool
} = require('../_lib/brain/tools.js');

function requestId(request) {
  return (
    request.headers.get('X-Request-ID') ||
    crypto.randomUUID()
  );
}

function jsonResponse(status, body, id) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        'Content-Type':
          'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Request-ID': id,
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer'
      }
    }
  );
}

async function onRequestPost(context) {
  const request = context.request;
  const id = requestId(request);

  const auth = await verifyFirebaseIdToken(
    request,
    context.env
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
    body = await request.json();
  } catch {
    return jsonResponse(
      400,
      {
        ok: false,
        error: {
          code: 'INVALID_JSON',
          message: 'Invalid JSON request body.'
        }
      },
      id
    );
  }

  const toolName = String(
    body?.tool || ''
  ).trim();

  const action = String(
    body?.action || ''
  ).trim();

  if (!toolName || !action) {
    return jsonResponse(
      400,
      {
        ok: false,
        error: {
          code: 'TOOL_ACTION_REQUIRED',
          message:
            'A tool and action are required.'
        }
      },
      id
    );
  }

  let entitlements;

  try {
    const url = new URL(
      '/api/entitlements',
      request.url
    );

    const response = await fetch(
      url.toString(),
      {
        method: 'GET',
        headers: {
          Authorization:
            `Bearer ${auth.token}`,
          Accept: 'application/json'
        }
      }
    );

    entitlements =
      await response.json();

    if (!response.ok) {
      throw new Error(
        'Entitlement verification failed.'
      );
    }
  } catch {
    return jsonResponse(
      503,
      {
        ok: false,
        error: {
          code: 'ENTITLEMENTS_UNAVAILABLE',
          message:
            'OVYX could not verify server-side permissions.'
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

  try {
    const result =
      await executeTool({
        toolName,
        action,
        input: body.input || {},
        user: auth.user,
        entitlements: {
          ...entitlements,
          capabilities
        }
      });

    return jsonResponse(
      200,
      {
        ok: true,
        requestId: id,
        result
      },
      id
    );
  } catch (error) {
    return jsonResponse(
      error.status || 403,
      {
        ok: false,
        requestId: id,
        error: {
          code:
            error.code ||
            'TOOL_EXECUTION_FAILED',
          message:
            error.message ||
            'OVYX tool execution failed.'
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
