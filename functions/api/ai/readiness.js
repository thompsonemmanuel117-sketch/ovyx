import { assertAuthenticated } from '../../_lib/firebase.js';
import { getActiveBrainConnectionId } from '../../_lib/universal-connections.js';
import { errorResponse, requestId } from '../_lib/http.js';

/**
 * Safe, no-inference readiness probe for signed-in users.
 *
 * This route deliberately does not call AI.run, touch the daily neuron ledger,
 * send a provider request, inspect secrets, or expose a connection ID. It only
 * confirms whether the request has a selected AI Brain or a Cloudflare AI
 * binding available. Actual model reachability and quota are checked when the
 * user makes a real request.
 */
export function buildOvyxAiReadiness({ workersAiBinding = false, selectedBrainId = '', selectionCheckFailed = false } = {}) {
  if (selectionCheckFailed) {
    return {
      status: 'check_failed',
      source: 'unknown',
      canTry: false,
      liveInferenceTested: false,
    };
  }

  if (String(selectedBrainId || '').trim()) {
    return {
      status: 'selected_brain_configured',
      source: 'selected-ai-brain',
      canTry: true,
      liveInferenceTested: false,
    };
  }

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

export async function onRequestGet(context, dependencies = {}) {
  const id = requestId(context.request);

  try {
    const user = assertAuthenticated(context.data?.user);
    const env = context.env || {};
    const getSelectedBrain = dependencies.getActiveBrainConnectionId || getActiveBrainConnectionId;

    let selectedBrainId = '';
    try {
      selectedBrainId = await getSelectedBrain(env, user) || '';
    } catch (error) {
      // Do not claim that Cloudflare is ready if we cannot read the active Brain
      // selection: ordinary assistant chat fails closed when that lookup fails.
      console.warn('[OVYX AI READINESS] AI Brain selection could not be verified.', {
        code: String(error?.code || 'SELECTION_LOOKUP_FAILED').slice(0, 80),
      });
      const readiness = buildOvyxAiReadiness({ selectionCheckFailed: true });
      return Response.json({
        ok: false,
        ...readiness,
        code: 'AI_READINESS_CHECK_FAILED',
        message: 'OVYX could not verify your AI setup. Nothing was sent to an AI model and no AI usage was spent. Check your connection, then try again.',
        requestId: id,
      }, {
        status: 503,
        headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-OVYX-Request-ID': id },
      });
    }

    const workersAiBinding = Boolean(env.AI && typeof env.AI.run === 'function');
    const readiness = buildOvyxAiReadiness({ workersAiBinding, selectedBrainId });

    return Response.json({
      ok: true,
      ...readiness,
      checkedAt: new Date().toISOString(),
      message: readiness.status === 'selected_brain_configured'
        ? 'An AI Brain is selected for your account. This check did not send a model request or verify that the connection is currently reachable. If the selected connection fails, OVYX will show the problem instead of silently switching providers.'
        : readiness.status === 'cloudflare_configured'
          ? 'Cloudflare Workers AI is configured for OVYX. This check did not send a model request or spend AI usage. A real request can still be stopped by an allowance limit or a temporary service issue.'
          : 'OVYX could not find an AI engine. Ask the platform administrator to configure the Cloudflare Workers AI binding named AI, or select a supported AI Brain in Settings → External Services & Plan Limits.',
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
