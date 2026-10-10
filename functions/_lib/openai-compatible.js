const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

const GENERIC_MODEL_NAMES = new Set([
  'automatic', 'auto', 'openai', 'chatgpt', 'gpt', 'gpt-3.5',
  'groq', 'openrouter', 'openai-compatible', 'claude', 'anthropic',
  'deepseek', 'gemini', 'llama', 'workers-ai', 'cloudflare'
]);

function clean(value) {
  return String(value ?? '').trim();
}

/**
 * Resolve the server-side target for an OpenAI Chat Completions-compatible API.
 * OPENAI_BASE_URL may be a base URL (for example .../v1) or a full
 * .../chat/completions URL. The secret is never included in a status response.
 */
export function resolveOpenAICompatibleConfig(env = {}) {
  const configuredBase = clean(env.OPENAI_BASE_URL);
  const custom = Boolean(configuredBase);
  const raw = configuredBase || DEFAULT_BASE_URL;

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw Object.assign(
      new Error('OPENAI_BASE_URL must be a valid HTTPS URL.'),
      { code: 'AI_PROVIDER_BASE_URL_INVALID', status: 500 }
    );
  }

  if (parsed.protocol !== 'https:') {
    throw Object.assign(
      new Error('OPENAI_BASE_URL must use HTTPS.'),
      { code: 'AI_PROVIDER_BASE_URL_INVALID', status: 500 }
    );
  }

  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw Object.assign(
      new Error('OPENAI_BASE_URL must not contain credentials, query parameters, or a fragment.'),
      { code: 'AI_PROVIDER_BASE_URL_INVALID', status: 500 }
    );
  }

  const host = parsed.hostname.toLowerCase();
  let path = parsed.pathname.replace(/\/+$/, '');
  path = path.replace(/\/(?:chat\/completions|models|responses)$/i, '').replace(/\/+$/, '');
  const baseUrl = parsed.origin + path;
  const chatCompletionsUrl = baseUrl + '/chat/completions';
  const modelsUrl = baseUrl + '/models';

  let provider = 'openai';
  let label = 'OpenAI';

  if (host === 'api.groq.com' || host.endsWith('.groq.com')) {
    provider = 'groq';
    label = 'Groq';
  } else if (host === 'openrouter.ai' || host.endsWith('.openrouter.ai')) {
    provider = 'openrouter';
    label = 'OpenRouter';
  } else if (host === 'api.deepseek.com' || host.endsWith('.deepseek.com')) {
    provider = 'deepseek';
    label = 'DeepSeek';
  } else if (custom && host !== 'api.openai.com' && !host.endsWith('.openai.com')) {
    provider = 'openai-compatible';
    label = 'OpenAI-compatible provider';
  }

  const candidates = provider === 'groq'
    ? ['GROQ_API_KEY', 'OPENAI_API_KEY']
    : provider === 'openrouter'
      ? ['OPENROUTER_API_KEY', 'OPENAI_API_KEY']
      : provider === 'deepseek'
        ? ['DEEPSEEK_API_KEY', 'OPENAI_API_KEY']
        : ['OPENAI_API_KEY'];

  const keySource = candidates.find(name => Boolean(clean(env[name]))) || null;
  const key = keySource ? clean(env[keySource]) : '';

  return {
    baseUrl,
    chatCompletionsUrl,
    modelsUrl,
    host,
    provider,
    label,
    custom,
    configured: Boolean(key),
    key,
    keySource,
    expectedKeyName: candidates[0]
  };
}

export function resolveOpenAICompatibleModel(env = {}, target, requested) {
  const requestedText = clean(requested);
  if (requestedText && !GENERIC_MODEL_NAMES.has(requestedText.toLowerCase())) {
    return requestedText;
  }

  if (target?.provider === 'groq') {
    return clean(
      env.GROQ_AGENT_MODEL ||
      env.GROQ_MODEL ||
      env.OPENAI_AGENT_MODEL ||
      env.OPENAI_MODEL ||
      'openai/gpt-oss-20b'
    );
  }

  if (target?.provider === 'openrouter') {
    return clean(
      env.OPENROUTER_AGENT_MODEL ||
      env.OPENROUTER_MODEL ||
      env.OPENAI_AGENT_MODEL ||
      env.OPENAI_MODEL
    );
  }

  if (target?.provider === 'deepseek') {
    return clean(
      env.DEEPSEEK_AGENT_MODEL ||
      env.DEEPSEEK_MODEL ||
      env.OPENAI_AGENT_MODEL ||
      env.OPENAI_MODEL
    );
  }

  if (target?.provider === 'openai' && !target.custom) {
    return clean(env.OPENAI_AGENT_MODEL || env.OPENAI_MODEL || 'gpt-5');
  }

  return clean(env.OPENAI_AGENT_MODEL || env.OPENAI_MODEL);
}
