'use strict';

const {
  verifyFirebaseIdToken
} = require('../_lib/auth.js');

const {
  errorResponse
} = require('../_lib/http.js');

const {
  executeTool
} = require('../_lib/brain/tools.js');

const ROOT_EMAIL =
  'ovyxsupportteam@gmail.com';

const CAPABILITIES = [
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
        'Referrer-Policy': 'no-referrer'
      }
    }
  );
}

function getCapabilities(context, user) {
  if (
    String(user.email || '').toLowerCase() ===
    ROOT_EMAIL
  ) {
    return CAPABILITIES.reduce(
      (result, capability) => {
        result[capability] = true;
        return result;
      },
      {}
    );
  }

  const entitlements =
    context?.data?.entitlements;

  if (
    entitlements &&
    typeof entitlements === 'object'
  ) {
    return entitlements.capabilities ||
      entitlements;
  }

  return {};
}

async function onRequestPost(context) {
  const authentication =
    await verifyFirebaseIdToken(
      context.request,
      context.env
    );

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
    body = await context.request.json();
  } catch {
    return errorResponse(
      400,
      'INVALID_JSON',
      'Invalid JSON request body.'
    );
  }

  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body)
  ) {
    return errorResponse(
      400,
      'INVALID_REQUEST',
      'Request body must be an object.'
    );
  }

  const capabilities =
    getCapabilities(
      context,
      authentication.user
    );

  try {
    const result = await executeTool({
      tool: body.tool,
      action: body.action,
      input: body.input || {},
      capabilities
    });

    return jsonResponse(200, {
      ok: true,
      data: result
    });
  } catch (error) {
    if (error.code === 'CAPABILITY_DENIED') {
      return errorResponse(
        403,
        'CAPABILITY_DENIED',
        'This tool is not enabled for your OVYX account.'
      );
    }

    return errorResponse(
      400,
      'TOOL_REQUEST_REJECTED',
      error.message || 'Tool request rejected.'
    );
  }
}

module.exports = {
  onRequestPost
};
