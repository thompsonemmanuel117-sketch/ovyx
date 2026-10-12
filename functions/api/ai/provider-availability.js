import { assertAuthenticated } from '../../_lib/firebase.js';
import { errorResponse, requestId } from '../../_lib/http.js';

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

const NOT_AVAILABLE_SUFFIX =
  ' is not available right now. Please try again later, or connect your own AI Brain in Universal Connections to continue building.';

async function checkEndpoint(config, key) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    return await fetch(config.url, {
      method: 'GET',
      headers: { Accept: 'application/json', ...config.headers(key) },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function statusForHttp(status) {
  if (status === 401 || status === 403) return 'AUTH_FAILED';
  if (status === 402) return 'INSUFFICIENT_CREDITS';
  if (status === 429) return 'RATE_LIMITED';
  return 'UNAVAILABLE';
}

function statusResponse(id, values) {
  return Response.json(values, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      'X-OVYX-Request-ID': id,
    },
  });
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
      return errorResponse(
        400,
        'PROVIDER_REQUIRED',
        'Choose Gemini, DeepSeek, Claude, or OpenAI.',
        id,
      );
    }

    const key = String(context.env?.[config.env] || '').trim();
    if (!key) {
      return statusResponse(id, {
        ok: false,
        provider,
        label: config.label,
        status: 'NOT_CONFIGURED',
        configured: false,
        connected: false,
        message: config.label + NOT_AVAILABLE_SUFFIX,
      });
    }

    try {
      const response = await checkEndpoint(config, key);
      const ready = response.ok;
      const status = ready ? 'READY' : statusForHttp(response.status);
      // Do not consume or return provider response bodies: some providers echo
      // configuration details in error payloads. Only expose a short status.
      try { await response.body?.cancel(); } catch {}
      return statusResponse(id, {
        ok: ready,
        provider,
        label: config.label,
        status,
        configured: true,
        connected: ready,
        httpStatus: response.status,
        message: ready
          ? config.label + ' is connected and ready.'
          : config.label + NOT_AVAILABLE_SUFFIX,
      });
    } catch (error) {
      const timeout = error?.name === 'AbortError';
      return statusResponse(id, {
        ok: false,
        provider,
        label: config.label,
        status: timeout ? 'TIMEOUT' : 'UNAVAILABLE',
        configured: true,
        connected: false,
        message: config.label + NOT_AVAILABLE_SUFFIX,
      });
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
  return errorResponse(
    405,
    'METHOD_NOT_ALLOWED',
    'GET is required.',
    requestId(context.request),
  );
}
