'use strict';

import { generate } from '../../_lib/brain/providers.js';

export const PROVIDER_ENV_KEYS = Object.freeze({
  deepseek: 'DEEPSEEK_API_KEY',
  gemini: 'GEMINI_API_KEY',
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
});

const PROVIDER_ALIASES = Object.freeze({
  anthropic: 'claude',
  claude: 'claude',
  deepseek: 'deepseek',
  gemini: 'gemini',
  openai: 'openai',
});

const DEFAULT_ORDER = Object.freeze(['gemini', 'deepseek', 'openai', 'claude']);

function clean(value) {
  return String(value ?? '').trim();
}

function canonicalProvider(value) {
  return PROVIDER_ALIASES[clean(value).toLowerCase()] || '';
}

export function getProviderKey(provider, env) {
  const canonical = canonicalProvider(provider);
  const envName = canonical === 'claude'
    ? 'ANTHROPIC_API_KEY'
    : PROVIDER_ENV_KEYS[canonical];
  return envName ? clean(env?.[envName]) || null : null;
}

export function providerConfigured(provider, env) {
  return Boolean(getProviderKey(provider, env));
}

function providerOrder(env, requested, input = {}) {
  if (requested && requested !== 'automatic') return [requested];

  const configured = clean(env?.OVYX_AI_PROVIDER_ORDER)
    .split(',')
    .map(canonicalProvider)
    .filter(Boolean);
  const candidates = [...new Set([...configured, ...DEFAULT_ORDER])]
    .filter(provider => providerConfigured(provider, env));

  const taskText = [
    input?.prompt,
    input?.user,
    ...(Array.isArray(input?.messages) ? input.messages.map(message => message?.content) : []),
  ].map(value => String(value || '')).join(' ').slice(0, 12000).toLowerCase();

  let preferred = [];
  if (/(debug|bug|fix|code|repository|repo\\b|api|backend|security|test suite|unit test|typescript|javascript|refactor|compile|runtime error|stack trace|ci failure|pull request|database|deploy script|function implementation)/i.test(taskText)) {
    preferred = ['claude', 'deepseek', 'openai', 'gemini'];
  } else if (/(website|web site|landing page|web design|ui\\/ux|\\bui\\b|\\bux\\b|front[- ]end|responsive|css|visual design|layout|brand style|template|colour scheme|color scheme|mobile design)/i.test(taskText)) {
    preferred = ['gemini', 'claude', 'deepseek', 'openai'];
  } else if (/(reasoning|complex analysis|architecture|trade[- ]off|compare|research|investigate|evaluate|strategy|long[- ]term plan|technical plan|multi[- ]step|data analysis)/i.test(taskText)) {
    preferred = ['claude', 'openai', 'deepseek', 'gemini'];
  } else if (/(write|writing|article|blog|email|marketing copy|story|proposal|summari[sz]e|rewrite|proofread|documentation|product description)/i.test(taskText)) {
    preferred = ['claude', 'gemini', 'openai', 'deepseek'];
  }

  return [...new Set([...preferred.filter(provider => candidates.includes(provider)), ...candidates])];
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
  const requested = requestedRaw === 'automatic' || requestedRaw === 'auto' || !requestedRaw
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

  const candidates = providerOrder(env, requested, input);
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

      return {
        text: result.text,
        provider: result.provider,
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

  if (requested === 'automatic') {
    throw Object.assign(
      new Error(candidates.length
        ? 'OVYX Auto could not reach a connected AI Brain for this request. Please try again later, or connect your own AI Brain in Universal Connections to continue building.'
        : 'No AI Brain is connected right now. Please try again later, or connect your own AI Brain in Universal Connections to continue building.'),
      { code: candidates.length ? 'AI_PROVIDER_UNAVAILABLE' : 'AI_PROVIDER_NOT_CONFIGURED', status: 503 }
    );
  }

  throw lastError || Object.assign(
    new Error('The selected AI Brain is not configured.'),
    { code: 'AI_PROVIDER_NOT_CONFIGURED', status: 503 }
  );
}
