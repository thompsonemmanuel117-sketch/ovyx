import { assertAuthenticated } from '../../_lib/firebase.js';
import { errorResponse, requestId } from '../_lib/http.js';

const PROVIDERS = Object.freeze({
  gemini: {
    env: 'GEMINI_API_KEY',
    label: 'Gemini',
    url: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1',
    headers: key => ({ 'x-goog-api-key': key }),
  },
  deepseek: {
    env: 'DEEPSEEK_API_KEY',
    label: 'DeepSeek',
    url: 'https://api.deepseek.com/models',
    headers: key => ({ Authorization: 'Bearer ' + key }),
  },
  anthropic: {
    env: 'ANTHROPIC_API_KEY',
    label: 'Claude',
    url: 'https://api.anthropic.com/v1/models',
    headers: key => ({ 'x-api-key': key, 'anthropic-version': '2023-06-01' }),
  },
  openai: {
    env: 'OPENAI_API_KEY',
    label: 'OpenAI',
    url: 'https://api.openai.com/v1/models',
    headers: key => ({ Authorization: 'Bearer ' + key }),
  },
});

const UNAVAILABLE_MESSAGE =
  ' is not available right now. Please try again later, or connect your own AI Brain in Universal Connections to continue building.';

function jsonStatus(payload, requestIdValue) {
  return Response.json(payload, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'X-Content-Type-Options': 'nosniff',
      'X-OVYX-Request-ID': requestIdValue,
    },
  });
}

async function checkEndpoint(config, key) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(config.url, {
      method: 'GET',
      headers: { Accept: 'application/json', ...config.headers(key) },
      redirect: 'manual',
      signal: controller.signal,
    });
    // Provider response bodies are never needed for the readiness indicator.
    try { await response.body?.cancel(); } catch {}
    return response;
  } finally {
    clearTimeout(timer);
  }
}

export async function onRequestGet(context) {
  const id = requestId(context.request);
  try {
    assertAuthenticated(context.data?.user);

    const url = new URL(context.request.url);
    let provider = String(url.searchParams.get('provider') || '').trim().toLowerCase();
    if (provider === 'claude') provider = 'anthropic';
    const config = PROVIDERS[provider];
    if (!config) {
      return errorResponse(400, 'PROVIDER_REQUIRED', 'Choose Gemini, DeepSeek, Claude, or OpenAI.', id);
    }

    const key = String(context.env?.[config.env] || '').trim();
    if (!key) {
      return jsonStatus({
        ok: false,
        provider,
        label: config.label,
        status: 'NOT_CONFIGURED',
        configured: false,
        connected: false,
        message: config.label + UNAVAILABLE_MESSAGE,
      }, id);
    }

    try {
      const response = await checkEndpoint(config, key);
      const status = response.ok
        ? 'READY'
        : response.status === 401 || response.status === 403
          ? 'AUTH_FAILED'
          : response.status === 402
            ? 'INSUFFICIENT_CREDITS'
            : response.status === 429
              ? 'RATE_LIMITED'
              : 'UNAVAILABLE';

      return jsonStatus({
        ok: response.ok,
        provider,
        label: config.label,
        status,
        configured: true,
        connected: response.ok,
        httpStatus: response.status,
        message: response.ok
          ? config.label + ' is connected and ready.'
          : config.label + UNAVAILABLE_MESSAGE,
      }, id);
    } catch (error) {
      return jsonStatus({
        ok: false,
        provider,
        label: config.label,
        status: error?.name === 'AbortError' ? 'TIMEOUT' : 'UNAVAILABLE',
        configured: true,
        connected: false,
        message: config.label + UNAVAILABLE_MESSAGE,
      }, id);
    }
  } catch (error) {
    return errorResponse(
      error?.status || 500,
      error?.code || 'PROVIDER_AVAILABILITY_FAILED',
      error?.message || 'Provider availability could not be checked.',
      id,
    );
  }
}

export async function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  return errorResponse(405, 'METHOD_NOT_ALLOWED', 'GET is required.', requestId(context.request));
}
