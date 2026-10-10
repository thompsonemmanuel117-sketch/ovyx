import { assertAuthenticated } from '../../_lib/firebase.js';
import { errorResponse, requestId } from '../_lib/http.js';
import { resolveOpenAICompatibleConfig } from '../../_lib/openai-compatible.js';

const ROOT_EMAIL = 'ovyxsupportteam@gmail.com';

const PROVIDERS = Object.freeze({
  gemini: {
    env: 'GEMINI_API_KEY',
    label: 'Gemini',
    check: key => fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1&key=${encodeURIComponent(key)}`,
      { headers: { Accept: 'application/json' } },
    ),
  },
  deepseek: {
    env: 'DEEPSEEK_API_KEY',
    label: 'DeepSeek',
    check: key => fetchWithTimeout(
      'https://api.deepseek.com/models',
      { headers: { Accept: 'application/json', Authorization: `Bearer ${key}` } },
    ),
  },
  openai: {
    env: 'OPENAI_API_KEY',
    label: 'OpenAI',
    check: key => fetchWithTimeout(
      'https://api.openai.com/v1/models',
      { headers: { Accept: 'application/json', Authorization: `Bearer ${key}` } },
    ),
  },
  anthropic: {
    env: 'ANTHROPIC_API_KEY',
    label: 'Anthropic',
    check: key => fetchWithTimeout(
      'https://api.anthropic.com/v1/models',
      {
        headers: {
          Accept: 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
      },
    ),
  },
});

async function fetchWithTimeout(url, init = {}, timeoutMs = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      method: 'GET',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function isAdmin(user) {
  if (!user) return false;
  if (String(user.email || '').trim().toLowerCase() === ROOT_EMAIL) return true;
  if (user.admin === true || user.owner === true) return true;

  const role = String(user.role || '').trim().toUpperCase();
  return ['ROOT_SUPERUSER', 'OVYX OWNER', 'OWNER', 'ADMIN'].includes(role);
}

async function checkProvider(id, config, env) {
  if (id === 'openai') {
    let target;
    try {
      target = resolveOpenAICompatibleConfig(env);
    } catch (error) {
      return {
        provider: 'openai',
        actualProvider: 'openai-compatible',
        label: 'Invalid OpenAI-compatible endpoint',
        status: 'INVALID_CONFIGURATION',
        configured: false,
        connected: false,
        error: String(error?.message || 'Endpoint configuration is invalid.').slice(0, 240),
      };
    }

    const label = target.custom
      ? target.label + ' (OpenAI-compatible endpoint)'
      : target.label;

    if (!target.key) {
      return {
        provider: 'openai',
        actualProvider: target.provider,
        label,
        endpointHost: target.host,
        status: 'NOT_CONFIGURED',
        configured: false,
        connected: false,
      };
    }

    try {
      const response = await fetchWithTimeout(
        target.modelsUrl,
        {
          headers: {
            Accept: 'application/json',
            Authorization: 'Bearer ' + target.key,
          },
        },
      );
      const status = response.ok
        ? 'READY'
        : response.status === 401 || response.status === 403
          ? 'AUTH_FAILED'
          : response.status === 402
            ? 'INSUFFICIENT_CREDITS'
            : response.status === 429
              ? 'RATE_LIMITED'
              : 'UNAVAILABLE';

      return {
        provider: 'openai',
        actualProvider: target.provider,
        label,
        endpointHost: target.host,
        status,
        configured: true,
        connected: response.ok,
        httpStatus: response.status,
      };
    } catch (error) {
      return {
        provider: 'openai',
        actualProvider: target.provider,
        label,
        endpointHost: target.host,
        status: error?.name === 'AbortError' ? 'TIMEOUT' : 'UNAVAILABLE',
        configured: true,
        connected: false,
        error: String(error?.name === 'AbortError' ? 'Endpoint health check timed out.' : 'Endpoint health check failed.').slice(0, 240),
      };
    }
  }

  const key = String(env?.[config.env] || '').trim();

  if (!key) {
    return {
      provider: id,
      label: config.label,
      status: 'NOT_CONFIGURED',
      configured: false,
      connected: false,
    };
  }

  try {
    const response = await config.check(key);

    if (response.ok) {
      return {
        provider: id,
        label: config.label,
        status: 'READY',
        configured: true,
        connected: true,
        httpStatus: response.status,
      };
    }

    return {
      provider: id,
      label: config.label,
      status: response.status === 401 || response.status === 403
        ? 'AUTH_FAILED'
        : 'UNAVAILABLE',
      configured: true,
      connected: false,
      httpStatus: response.status,
    };
  } catch (error) {
    return {
      provider: id,
      label: config.label,
      status: error?.name === 'AbortError' ? 'TIMEOUT' : 'UNAVAILABLE',
      configured: true,
      connected: false,
      error: String(error?.message || error).slice(0, 240),
    };
  }
}

export async function onRequestGet(context) {
  const id = requestId(context.request);

  try {
    const user = assertAuthenticated(context.data?.user);

    if (!isAdmin(user)) {
      return errorResponse(
        403,
        'ADMIN_REQUIRED',
        'Admin authorization is required.',
        id,
      );
    }

    const results = await Promise.all(
      Object.entries(PROVIDERS).map(([name, config]) =>
        checkProvider(name, config, context.env)
      ),
    );

    const workersAi = Boolean(
      context.env?.AI &&
      typeof context.env.AI.run === 'function'
    );

    const ready = results.filter(item => item.connected).length;

    return Response.json({
      ok: true,
      status: ready > 0 || workersAi ? 'READY' : 'DEGRADED',
      authority: 'SERVER',
      providers: results,
      cloudflare: {
        workersAiBinding: workersAi,
        edgeRuntime: 'CLOUDFLARE_PAGES_FUNCTION',
      },
      checkedAt: new Date().toISOString(),
    }, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
        'X-OVYX-Request-ID': id,
      },
    });
  } catch (error) {
    return errorResponse(
      error.status || 500,
      error.code || 'AI_STATUS_FAILED',
      error.message || 'AI provider status check failed.',
      id,
    );
  }
}

export async function onRequest(context) {
  if (context.request.method === 'GET') {
    return onRequestGet(context);
  }

  return errorResponse(
    405,
    'METHOD_NOT_ALLOWED',
    'GET is required.',
    requestId(context.request),
  );
}
