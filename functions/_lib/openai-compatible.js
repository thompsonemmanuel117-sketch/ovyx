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
  // OVYX_AI_BASE_URL is shared by API-key-backed brain choices. OPENAI_BASE_URL
  // remains an override for the OpenAI route only when shared mode is absent.
  const sharedBase = clean(env.OVYX_AI_BASE_URL);
  const configuredBase = sharedBase || clean(env.OPENAI_BASE_URL);
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

  const endpointCandidates = provider === 'groq'
    ? ['GROQ_API_KEY', 'OPENAI_API_KEY']
    : provider === 'openrouter'
      ? ['OPENROUTER_API_KEY', 'OPENAI_API_KEY']
      : provider === 'deepseek'
        ? ['DEEPSEEK_API_KEY', 'OPENAI_API_KEY']
        : ['OPENAI_API_KEY'];

  // For an explicitly configured compatible endpoint, the environment-variable
  // name is not treated as proof of the credential's vendor. The endpoint must
  // still accept the key. Native defaults remain vendor-specific.
  const allProviderKeys = [
    'OPENAI_API_KEY',
    'GROQ_API_KEY',
    'OPENROUTER_API_KEY',
    'DEEPSEEK_API_KEY',
    'GEMINI_API_KEY',
    'ANTHROPIC_API_KEY',
  ];
  const candidates = custom
    ? [
        'OVYX_AI_API_KEY',
        'AI_API_KEY',
        ...endpointCandidates,
        ...allProviderKeys,
      ]
    : ['OPENAI_API_KEY'];

  const uniqueCandidates = [...new Set(candidates)];
  const keySource = uniqueCandidates.find(name => Boolean(clean(env[name]))) || null;
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
    expectedKeyName: custom
      ? 'OVYX_AI_API_KEY or any configured provider API-key variable'
      : 'OPENAI_API_KEY'
  };
}

export function resolveOpenAICompatibleModel(env = {}, target, requested) {
  const sharedModel = clean(env.OVYX_AI_MODEL);
  if (sharedModel && (clean(env.OVYX_AI_BASE_URL) || clean(env.OPENAI_BASE_URL))) {
    return sharedModel;
  }

  // With a shared gateway, do not pass an unrelated native model identifier
  // from the selected UI label to the compatible endpoint.
  if (clean(env.OVYX_AI_BASE_URL)) requested = '';
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
