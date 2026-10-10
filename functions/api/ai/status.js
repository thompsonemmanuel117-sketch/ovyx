import { assertAuthenticated } from '../../_lib/firebase.js';
import { errorResponse, requestId } from '../_lib/http.js';

const ROOT_EMAIL = 'ovyxsupportteam@gmail.com';

function apiHost(value) {
  try { return new URL(String(value || '')).hostname.toLowerCase(); } catch { return ''; }
}

function trimBase(value, fallback) {
  return String(value || fallback || '').trim()
    .replace(/\/chat\/completions$/i, '')
    .replace(/\/models$/i, '')
    .replace(/\/+$/, '');
}

function modelListUrl(base) {
  return trimBase(base, 'https://api.openai.com/v1') + '/models';
}

function isOpenRouterKey(key) {
  return /^sk-or-/i.test(String(key || '').trim());
}

function compatibleProviderLabel(base) {
  const host = apiHost(base);
  if (host === 'api.groq.com') return 'Groq';
  if (host === 'openrouter.ai' || host.endsWith('.openrouter.ai')) return 'OpenRouter';
  if (host === 'api.openai.com') return 'OpenAI';
  if (host === 'api.anthropic.com') return 'Anthropic';
  return 'Custom compatible API';
}

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
    envKeys: ['OVYX_AI_API_KEY', 'OPENAI_API_KEY'],
    label: 'OVYX AI',
    upstream: env => compatibleProviderLabel(env?.OVYX_AI_BASE_URL || env?.OPENAI_BASE_URL || 'https://api.openai.com/v1'),
    check: (key, env) => fetchWithTimeout(
      modelListUrl(env?.OVYX_AI_BASE_URL || env?.OPENAI_BASE_URL || 'https://api.openai.com/v1'),
      { headers: { Accept: 'application/json', Authorization: `Bearer ${key}` } },
    ),
  },
  anthropic: {
    env: 'ANTHROPIC_API_KEY',
    label: 'Claude / OVYX AI',
    upstream: (env, key) => isOpenRouterKey(key)
      ? 'OpenRouter'
      : compatibleProviderLabel(env?.ANTHROPIC_BASE_URL || env?.ANTHROPIC_API_BASE_URL || 'https://api.anthropic.com/v1'),
    check: (key, env) => {
      const configuredBase = String(env?.ANTHROPIC_BASE_URL || env?.ANTHROPIC_API_BASE_URL || '').trim();
      const openRouter = isOpenRouterKey(key);
      const base = configuredBase || (openRouter ? 'https://openrouter.ai/api/v1' : 'https://api.anthropic.com/v1');
      if (openRouter || (configuredBase && apiHost(configuredBase) !== 'api.anthropic.com')) {
        return fetchWithTimeout(
          modelListUrl(base),
          { headers: { Accept: 'application/json', Authorization: `Bearer ${key}` } },
        );
      }
      return fetchWithTimeout(
        'https://api.anthropic.com/v1/models',
        {
          headers: {
            Accept: 'application/json',
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
          },
        },
      );
    },
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
  const key = String(
    (Array.isArray(config.envKeys)
      ? config.envKeys.map(name => env?.[name]).find(value => String(value || '').trim())
      : env?.[config.env]) || ''
  ).trim();

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
    const response = await config.check(key, env);

    if (response.ok) {
      return {
        provider: id,
        label: config.label,
        status: 'READY',
        configured: true,
        connected: true,
        upstreamProvider: typeof config.upstream === 'function' ? config.upstream(env, key) : config.label,
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
