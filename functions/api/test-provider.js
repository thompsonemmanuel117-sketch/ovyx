'use strict';

import { assertAuthenticated } from '../_lib/firebase.js';
import { errorResponse, requestId } from './_lib/http.js';

const ROOT_EMAIL = 'ovyxsupportteam@gmail.com';
const PROVIDERS = {
  gemini: { env: 'GEMINI_API_KEY', label: 'Gemini', url: key => `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1&key=${encodeURIComponent(key)}` },
  deepseek: { env: 'DEEPSEEK_API_KEY', label: 'DeepSeek', url: () => 'https://api.deepseek.com/models', headers: key => ({ Authorization: `Bearer ${key}` }) },
  openai: { env: 'OPENAI_API_KEY', label: 'OpenAI', url: () => 'https://api.openai.com/v1/models', headers: key => ({ Authorization: `Bearer ${key}` }) },
  anthropic: { env: 'ANTHROPIC_API_KEY', label: 'Anthropic', url: () => 'https://api.anthropic.com/v1/models', headers: key => ({ 'x-api-key': key, 'anthropic-version': '2023-06-01' }) },
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
    if (provider === 'claude') provider = 'anthropic';

    const config = PROVIDERS[provider];
    if (!config) {
      return errorResponse(400, 'PROVIDER_REQUIRED', 'Use gemini, deepseek, openai or anthropic.', id);
    }

    const key = String(context.env?.[config.env] || '').trim();

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
