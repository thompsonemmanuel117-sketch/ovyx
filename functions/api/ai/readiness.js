import { assertAuthenticated } from '../../_lib/firebase.js';
import { errorResponse, requestId } from '../_lib/http.js';

/**
 * Configuration-only readiness for OVYX's single supported model engine.
 * This route never probes a remote provider, calls AI.run, reads a secret,
 * checks a legacy personal Brain, or spends quota. Live inference and quota
 * availability are evaluated only when an authenticated AI request is made.
 */
export function buildOvyxAiReadiness({ workersAiBinding = false } = {}) {
  if (workersAiBinding) {
    return {
      status: 'cloudflare_configured',
      source: 'cloudflare-workers-ai',
      canTry: true,
      liveInferenceTested: false,
    };
  }

  return {
    status: 'not_configured',
    source: 'none',
    canTry: false,
    liveInferenceTested: false,
  };
}

export async function onRequestGet(context) {
  const id = requestId(context.request);

  try {
    assertAuthenticated(context.data?.user);
    const env = context.env || {};
    const workersAiBinding = Boolean(env.AI && typeof env.AI.run === 'function');
    const readiness = buildOvyxAiReadiness({ workersAiBinding });

    return Response.json({
      ok: true,
      ...readiness,
      checkedAt: new Date().toISOString(),
      message: readiness.status === 'cloudflare_configured'
        ? 'Cloudflare Workers AI is configured for OVYX. This check did not send a model request or spend AI usage. A real request can still be stopped by an allowance limit or a temporary service issue.'
        : 'OVYX AI is not configured. Cloudflare Workers AI must be enabled by the platform administrator. Personal or third-party AI providers are not supported.',
      requestId: id,
    }, {
      status: 200,
      headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-OVYX-Request-ID': id },
    });
  } catch (error) {
    return errorResponse(
      error.status || 500,
      error.code || 'AI_READINESS_CHECK_FAILED',
      error.status === 401
        ? 'Sign in to check whether OVYX AI is configured.'
        : 'OVYX could not check AI setup. No AI request was sent.',
      id,
    );
  }
}

export async function onRequest(context) {
  if (context.request.method !== 'GET') {
    return errorResponse(405, 'METHOD_NOT_ALLOWED', 'GET is required to check AI setup.', requestId(context.request));
  }
  return onRequestGet(context);
}
