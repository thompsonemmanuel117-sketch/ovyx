'use strict';

const {
  errorResponse,
  jsonResponse
} = require('../_lib/http.js');

const {
  sweepRuntimeLeases
} = require('../_lib/runtime-lease.js');

async function onRequest(context) {
  try {
    const request =
      context?.request;

    const env =
      context?.env || {};

    if (!request) {
      return errorResponse(
        500,
        'REQUEST_UNAVAILABLE',
        'OVYX runtime sweeper request context is unavailable.'
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
     * The sweeper is an internal server-to-server operation.
     *
     * It does NOT use a client Firebase token.
     * Cloudflare Cron/Worker calls this endpoint with the private
     * runtime sweeper secret.
     */
    const expectedSecret =
      String(
        env.OVYX_RUNTIME_SWEEPER_SECRET ||
          ''
      ).trim();

    const suppliedSecret =
      String(
        request.headers.get(
          'X-OVYX-Runtime-Sweeper'
        ) || ''
      ).trim();

    if (
      !expectedSecret ||
      !suppliedSecret ||
      suppliedSecret !== expectedSecret
    ) {
      return errorResponse(
        401,
        'RUNTIME_SWEEPER_UNAUTHORIZED',
        'Runtime sweeper authentication failed.'
      );
    }

    /*
     * Never report a successful sweep when Firestore or the container
     * provider is unavailable. sweepRuntimeLeases() itself fails closed
     * when shutdown credentials are missing and records the result as
     * CONTAINER_SHUTDOWN_NOT_CONFIGURED.
     */
    const result =
      await sweepRuntimeLeases(
        env,
        Date.now()
      );

    const failed =
      Array.isArray(result?.results)
        ? result.results.filter(
            (item) =>
              item &&
              item.ok === false
          )
        : [];

    /*
     * A sweep can successfully inspect leases while one or more
     * provider shutdown operations fail. Return 207 so the caller
     * cannot mistake a partial failure for a clean sweep.
     */
    if (failed.length > 0) {
      return new Response(
        JSON.stringify({
          ok: false,
          partial: true,
          ...result,
          serverTime:
            Date.now()
        }),
        {
          status: 207,
          headers: {
            'Content-Type':
              'application/json; charset=utf-8',
            'Cache-Control':
              'no-store'
          }
        }
      );
    }

    return jsonResponse(
      200,
      {
        ok: true,
        ...result,
        serverTime:
          Date.now()
      }
    );
  } catch (error) {
    return errorResponse(
      503,
      error?.code ||
        'RUNTIME_SWEEP_FAILED',
      error?.message ||
        'OVYX runtime sweep failed safely.'
    );
  }
}

module.exports = {
  onRequest
};
