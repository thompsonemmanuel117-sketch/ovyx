'use strict';

import { assertAuthenticated } from '../_lib/firebase.js';
import { errorResponse, requestId, readJson } from './_lib/http.js';

const ROOT_EMAIL = 'ovyxsupportteam@gmail.com';

function clean(value) {
  return String(value || '').trim();
}

function isOpenRouterKey(value) {
  return /^sk-or-v1-/i.test(clean(value));
}

function isGroqBaseUrl(value) {
  try {
    return new URL(clean(value)).hostname.toLowerCase() === 'api.groq.com';
  } catch {
    return false;
  }
}

function resolveBase(value, fallback) {
  const candidate = clean(value) || fallback;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid URL');
    return url.toString().replace(/\/+$/, '');
  } catch {
    return fallback;
  }
}

const PROVIDERS = {
  gemini: {
    env: 'GEMINI_API_KEY',
    label: 'Gemini',
    url: key => `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1&key=${encodeURIComponent(key)}`,
  },
  deepseek: {
    env: 'DEEPSEEK_API_KEY',
    label: 'DeepSeek',
    url: () => 'https://api.deepseek.com/models',
    headers: key => ({ Authorization: `Bearer ${key}` }),
  },
  openai: {
    env: 'OPENAI_API_KEY',
    label: 'OVYX AI',
    url: (_key, env) => `${resolveBase(env?.OPENAI_BASE_URL, 'https://api.openai.com/v1')}/models`,
    headers: key => ({ Authorization: `Bearer ${key}` }),
  },
  groq: {
    env: 'GROQ_API_KEY',
    label: 'OVYX AI',
    getKey: env => clean(env?.GROQ_API_KEY) ||
      (isGroqBaseUrl(env?.OPENAI_BASE_URL) ? clean(env?.OPENAI_API_KEY) : ''),
    url: (_key, env) => `${resolveBase(env?.GROQ_BASE_URL || (isGroqBaseUrl(env?.OPENAI_BASE_URL) ? env.OPENAI_BASE_URL : ''), 'https://api.groq.com/openai/v1')}/models`,
    headers: key => ({ Authorization: `Bearer ${key}` }),
  },
  anthropic: {
    env: 'ANTHROPIC_API_KEY',
    label: 'Claude',
    url: (key, env) => isOpenRouterKey(key)
      ? `${resolveBase(env?.OPENROUTER_BASE_URL, 'https://openrouter.ai/api/v1')}/models`
      : 'https://api.anthropic.com/v1/models',
    headers: key => isOpenRouterKey(key)
      ? { Authorization: `Bearer ${key}` }
      : { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
  },
};

async function checkedFetch(url, init = {}, ms = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
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

function authorized(user) {
  const email = String(user?.email || '').trim().toLowerCase();
  const role = String(user?.role || '').trim().toUpperCase();
  return email === ROOT_EMAIL ||
    ['ROOT_SUPERUSER', 'OVYX OWNER', 'OWNER', 'ADMIN'].includes(role) ||
    user?.admin === true ||
    user?.owner === true;
}

export async function onRequest(context) {
  const id = requestId(context.request);

  try {
    const user = assertAuthenticated(context.data?.user);
    if (!authorized(user)) {
      return errorResponse(403, 'ADMIN_REQUIRED', 'Admin authorization is required.', id);
    }

    const url = new URL(context.request.url);
    let provider = String(url.searchParams.get('provider') || '').trim().toLowerCase();
    if (context.request.method === 'POST') {
      const body = await readJson(context.request, 16 * 1024);
      provider = String(body?.provider || body?.context?.provider || provider).trim().toLowerCase();
    }
    if (provider === 'claude') provider = 'anthropic';

    const config = PROVIDERS[provider];
    if (!config) {
      return errorResponse(400, 'PROVIDER_REQUIRED', 'Use gemini, deepseek, groq, openai or anthropic.', id);
    }

    const key = clean(config.getKey ? config.getKey(context.env) : context.env?.[config.env]);

    if (!key) {
      return Response.json({
        ok: false,
        provider,
        label: config.label,
        status: 'NOT_CONFIGURED',
        configured: false,
        connected: false,
      }, {
        status: 200,
        headers: { 'Cache-Control': 'no-store', 'X-OVYX-Request-ID': id },
      });
    }

    try {
      const response = await checkedFetch(
        config.url(key),
        {
          headers: {
            Accept: 'application/json',
            ...(config.headers?.(key) || {}),
          },
        },
      );

      return Response.json({
        ok: response.ok,
        provider,
        label: config.label,
        status: response.ok
          ? 'READY'
          : response.status === 401 || response.status === 403
            ? 'AUTH_FAILED'
            : 'UNAVAILABLE',
        configured: true,
        connected: response.ok,
        httpStatus: response.status,
        checkedAt: new Date().toISOString(),
      }, {
        status: 200,
        headers: { 'Cache-Control': 'no-store', 'X-OVYX-Request-ID': id },
      });
    } catch (error) {
      return Response.json({
        ok: false,
        provider,
        label: config.label,
        status: error?.name === 'AbortError' ? 'TIMEOUT' : 'UNAVAILABLE',
        configured: true,
        connected: false,
        error: String(error?.message || error).slice(0, 240),
      }, {
        status: 200,
        headers: { 'Cache-Control': 'no-store', 'X-OVYX-Request-ID': id },
      });
    }
  } catch (error) {
    return errorResponse(
      error?.status || 500,
      error?.code || 'TEST_PROVIDER_FAILED',
      error?.message || 'Provider test failed.',
      id,
    );
  }
}

