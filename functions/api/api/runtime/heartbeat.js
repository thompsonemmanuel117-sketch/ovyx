'use strict';

const {
  verifyFirebaseIdToken
} = require('../_lib/auth.js');

const {
  errorResponse,
  jsonResponse
} = require('../_lib/http.js');

const {
  recordHeartbeat,
  LEASE_SECONDS
} = require('../_lib/runtime-lease.js');

async function onRequest(context) {
  try {
    const request = context?.request;
    const env = context?.env || {};

    if (!request) {
      return errorResponse(
        500,
        'REQUEST_UNAVAILABLE',
        'OVYX runtime request context is unavailable.'
      );
    }

    if (request.method !== 'POST') {
      return errorResponse(
        405,
        'METHOD_NOT_ALLOWED',
        'Only POST is allowed.'
      );
    }

    /*
     * Firebase ID token is read from the Authorization header by the
     * existing OVYX authentication helper.
     */
    const authentication =
      await verifyFirebaseIdToken(
        request,
        env
      );

    if (!authentication.ok) {
      return authentication.response;
    }

    if (
      authentication.user.emailVerified !== true
    ) {
      return errorResponse(
        403,
        'EMAIL_VERIFICATION_REQUIRED',
        'A verified OVYX account is required for runtime sessions.'
      );
    }

    let body = {};

    try {
      body =
        await request.json();
    } catch {
      return errorResponse(
        400,
        'INVALID_JSON',
        'The runtime heartbeat body must be valid JSON.'
      );
    }

    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body)
    ) {
      return errorResponse(
        400,
        'INVALID_REQUEST_BODY',
        'The runtime heartbeat body is invalid.'
      );
    }

    const projectId =
      String(
        body.projectId || ''
      ).trim();

    const containerId =
      String(
        body.containerId || ''
      ).trim();

    const tabId =
      String(
        body.tabId || ''
      ).trim();

    const reason =
      String(
        body.reason || 'heartbeat'
      )
        .trim()
        .slice(0, 60);

    if (
      !projectId ||
      projectId.length > 300 ||
      /[\u0000-\u001f\u007f]/.test(projectId)
    ) {
      return errorResponse(
        400,
        'INVALID_PROJECT_ID',
        'A valid projectId is required.'
      );
    }

    if (
      !tabId ||
      tabId.length > 180 ||
      /[\u0000-\u001f\u007f]/.test(tabId)
    ) {
      return errorResponse(
        400,
        'INVALID_TAB_ID',
        'A valid unique tabId is required.'
      );
    }

    if (
      containerId.length > 300 ||
      /[\u0000-\u001f\u007f]/.test(containerId)
    ) {
      return errorResponse(
        400,
        'INVALID_CONTAINER_ID',
        'The containerId is invalid.'
      );
    }

    const lease =
      await recordHeartbeat(
        env,
        authentication.user,
        {
          projectId,
          containerId,
          tabId,
          reason
        }
      );

    return jsonResponse(
      200,
      {
        ok: true,
        projectId:
          lease.projectId,
        tabId:
          lease.tabId,
        idleTimeoutSeconds:
          LEASE_SECONDS,
        leaseUntilAt:
          lease.leaseUntilAt,
        sessionExpiresAt:
          lease.sessionExpiresAt,
        serverTime:
          Date.now()
      }
    );
  } catch (error) {
    const code =
      error?.code ||
      'RUNTIME_HEARTBEAT_FAILED';

    const status =
      code === 'AUTH_REQUIRED' ||
      code === 'INVALID_SESSION'
        ? 401
        : code.startsWith('INVALID_')
          ? 400
          : code.startsWith('FIRESTORE_')
            ? 503
            : 500;

    return errorResponse(
      status,
      code,
      error?.message ||
        'Unable to renew the OVYX runtime lease.'
    );
  }
}

module.exports = {
  onRequest
};
