'use strict';

import { generate } from '../../_lib/brain/providers.js';

export const PROVIDER_ENV_KEYS = Object.freeze({
  deepseek: 'DEEPSEEK_API_KEY',
  gemini: 'GEMINI_API_KEY',
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  groq: 'GROQ_API_KEY',
});

const PROVIDER_ALIASES = Object.freeze({
  anthropic: 'claude',
  claude: 'claude',
  deepseek: 'deepseek',
  gemini: 'gemini',
  openai: 'openai',
  groq: 'groq',
  cloudflare: 'cloudflare-workers-ai',
  'workers-ai': 'cloudflare-workers-ai',
  'cloudflare-workers-ai': 'cloudflare-workers-ai',
});

const DEFAULT_ORDER = Object.freeze([
  'gemini',
  'deepseek',
  'cloudflare-workers-ai',
  'groq',
  'openai',
  'claude',
]);

function clean(value) {
  return String(value ?? '').trim();
}

function isGroqBaseUrl(value) {
  try {
    return new URL(clean(value)).hostname.toLowerCase() === 'api.groq.com';
  } catch {
    return false;
  }
}

function canonicalProvider(value) {
  return PROVIDER_ALIASES[clean(value).toLowerCase()] || '';
}

export function getProviderKey(provider, env) {
  const canonical = canonicalProvider(provider);
  if (canonical === 'cloudflare-workers-ai') {
    return env?.AI && typeof env.AI.run === 'function' ? 'AI_BINDING' : null;
  }
  if (canonical === 'groq') {
    return clean(env?.GROQ_API_KEY) ||
      (isGroqBaseUrl(env?.OPENAI_BASE_URL) ? clean(env?.OPENAI_API_KEY) : '') ||
      null;
  }
  const envName = canonical === 'claude'
    ? 'ANTHROPIC_API_KEY'
    : PROVIDER_ENV_KEYS[canonical];
  return envName ? clean(env?.[envName]) || null : null;
}

export function providerConfigured(provider, env) {
  return Boolean(getProviderKey(provider, env));
}

function providerOrder(env, requested) {
  if (requested && requested !== 'automatic') return [requested];

  const configured = clean(env?.OVYX_AI_PROVIDER_ORDER)
    .split(',')
    .map(canonicalProvider)
    .filter(Boolean);

  let candidates = [...new Set([...configured, ...DEFAULT_ORDER])];

  // If OPENAI_BASE_URL points at Groq and the order already includes Groq,
  // avoid retrying the same upstream with the same key under a second name.
  if (isGroqBaseUrl(env?.OPENAI_BASE_URL) && candidates.includes('groq')) {
    candidates = candidates.filter(provider => provider !== 'openai');
  }

  return candidates;
}

function normalizeMessages(input) {
  if (Array.isArray(input?.messages) && input.messages.length) {
    return input.messages
      .filter(Boolean)
      .map(message => ({
        role: clean(message.role) === 'assistant' ? 'assistant' : 'user',
        content: clean(message.content),
      }))
      .filter(message => message.content);
  }

  const user = clean(input?.user || input?.prompt || input?.message);
  return user ? [{ role: 'user', content: user }] : [];
}

function isConfigurationError(error) {
  return error?.code === 'AI_PROVIDER_NOT_CONFIGURED' ||
    /Missing server secret/i.test(String(error?.message || ''));
}

export async function callModel(env, input = {}) {
  const requestedRaw = clean(input.provider || input.requestedProvider).toLowerCase();
  const requested = requestedRaw === 'automatic' || !requestedRaw
    ? 'automatic'
    : canonicalProvider(requestedRaw);

  if (requestedRaw && requestedRaw !== 'automatic' && !requested) {
    throw Object.assign(
      new Error(`Unsupported AI provider: ${requestedRaw}.`),
      { code: 'AI_PROVIDER_UNSUPPORTED', status: 400 }
    );
  }

  const messages = normalizeMessages(input);
  if (!messages.length) {
    throw Object.assign(
      new Error('AI prompt is required.'),
      { code: 'PROMPT_REQUIRED', status: 400 }
    );
  }

  const candidates = providerOrder(env, requested);
  let lastError = null;

  for (const provider of candidates) {
    if (!providerConfigured(provider, env)) {
      lastError = Object.assign(
        new Error(`Provider not configured: ${provider}.`),
        { code: 'AI_PROVIDER_NOT_CONFIGURED', status: 400 }
      );
      if (requested !== 'automatic') throw lastError;
      continue;
    }

    try {
      const result = await generate(env, {
        provider,
        model: input.model,
        messages,
        system: clean(input.system),
        temperature: typeof input.temperature === 'number' ? input.temperature : 0.4,
        maxTokens: Number(input.maxTokens) > 0 ? Number(input.maxTokens) : undefined,
        timeoutMs: Number(input.timeoutMs) > 0 ? Number(input.timeoutMs) : undefined,
      });

      const providerLabel = result.providerLabel ||
        (['openai', 'groq', 'openrouter'].includes(result.provider) ? 'OVYX AI' : result.provider);

      return {
        text: result.text,
        provider: result.provider,
        providerLabel,
        model: result.model,
        requestedProvider: requestedRaw || 'automatic',
        routedProvider: result.provider,
        rawUsage: result.raw?.usage || null,
        raw: result.raw || null,
      };
    } catch (error) {
      lastError = error;
      if (requested !== 'automatic') throw error;
      if (!isConfigurationError(error)) continue;
    }
  }

  throw lastError || Object.assign(
    new Error('No configured AI provider is available.'),
    { code: 'AI_PROVIDER_UNAVAILABLE', status: 503 }
  );
}
