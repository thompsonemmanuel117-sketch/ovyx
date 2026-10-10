'use strict';

/**
 * OVYX Phase 7
 * Multi-provider AI adapters.
 *
 * SECURITY:
 * - Provider API keys are read ONLY from Cloudflare env.
 * - No provider secret is ever returned to the browser.
 * - No provider secret is accepted from request JSON.
 */

const DEFAULT_TIMEOUT_MS = 60000;

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

function resolveBaseUrl(value, fallback, variableName) {
  const candidate = clean(value) || fallback;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' || url.username || url.password) {
      throw new Error('Invalid URL');
    }
    return url.toString().replace(/\/+$/, '');
  } catch {
    const error = new Error(`${variableName} must be a valid HTTPS base URL.`);
    error.code = 'AI_PROVIDER_CONFIGURATION_INVALID';
    error.status = 503;
    throw error;
  }
}

function resolveOpenRouterModel(inputModel, env) {
  const configured = clean(env?.OPENROUTER_MODEL);
  if (configured) return configured;

  const requested = clean(inputModel);
  if (/^anthropic\//i.test(requested) || /^openrouter\//i.test(requested)) {
    return requested;
  }

  const aliases = {
    'claude-sonnet-4-6': 'anthropic/claude-sonnet-4.6',
    'claude-sonnet-4-5': 'anthropic/claude-sonnet-4.5',
    'claude-opus-4-1': 'anthropic/claude-opus-4.1',
  };
  if (aliases[requested.toLowerCase()]) return aliases[requested.toLowerCase()];

  // An OpenRouter token by itself does not imply a paid Claude subscription.
  // Use OpenRouter's free-model router unless a model is explicitly configured.
  return 'openrouter/free';
}

function requiredSecret(env, name) {
  const value = clean(env && env[name]);

  if (!value) {
    const error = new Error(`Missing server secret: ${name}`);
    error.code = 'AI_PROVIDER_NOT_CONFIGURED';
    throw error;
  }

  return value;
}

function timeoutSignal(ms) {
  if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
    return AbortSignal.timeout(ms);
  }

  const controller = new AbortController();

  setTimeout(function () {
    controller.abort();
  }, ms);

  return controller.signal;
}

async function requestJson(url, options, timeoutMs) {
  const response = await fetch(url, {
    ...options,
    signal: timeoutSignal(timeoutMs || DEFAULT_TIMEOUT_MS)
  });

  let payload = {};

  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const error = new Error(
      payload?.error?.message ||
      payload?.error?.type ||
      `AI provider request failed with HTTP ${response.status}.`
    );

    error.code = 'AI_PROVIDER_REQUEST_FAILED';
    error.status = response.status;
    error.providerPayload = payload;

    throw error;
  }

  return payload;
}

export function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return [];

  return messages
    .filter(Boolean)
    .map(function (message) {
      return {
        role: clean(message.role) || 'user',
        content: clean(message.content)
      };
    })
    .filter(function (message) {
      return message.content.length > 0;
    });
}

function extractText(provider, payload) {
  if (provider === 'gemini') {
    return (
      payload?.candidates?.[0]?.content?.parts
        ?.map(function (part) {
          return part?.text || '';
        })
        .join('') || ''
    );
  }

  if (provider === 'claude') {
    return (
      payload?.content
        ?.filter(function (item) {
          return item?.type === 'text';
        })
        .map(function (item) {
          return item?.text || '';
        })
        .join('') || ''
    );
  }

  if (provider === 'deepseek' || provider === 'openai' || provider === 'groq' || provider === 'openrouter') {
    return clean(payload?.choices?.[0]?.message?.content);
  }

  if (provider === 'cloudflare-workers-ai') {
    return clean(payload?.response || payload?.result || payload?.output_text);
  }

  return '';
}

async function callGemini(env, input) {
  const key = requiredSecret(env, 'GEMINI_API_KEY');

  const model = clean(input.model) || 'gemini-2.5-flash';

  const url =
    'https://generativelanguage.googleapis.com/v1beta/models/' +
    encodeURIComponent(model) +
    ':generateContent?key=' +
    encodeURIComponent(key);

  const contents = normalizeMessages(input.messages).map(function (message) {
    return {
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }]
    };
  });

  if (input.system) {
    contents.unshift({
      role: 'user',
      parts: [{ text: `OVYX SYSTEM INSTRUCTION:\n${input.system}` }]
    });
  }

  const payload = await requestJson(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature:
            typeof input.temperature === 'number'
              ? input.temperature
              : 0.4,
          maxOutputTokens:
            Number(input.maxTokens) > 0
              ? Math.min(Number(input.maxTokens), 8192)
              : 4096
        }
      })
    },
    input.timeoutMs
  );

  return {
    provider: 'gemini',
    model,
    text: extractText('gemini', payload),
    raw: payload
  };
}

async function callClaude(env, input) {
  const key = requiredSecret(env, 'ANTHROPIC_API_KEY');
  const isOpenRouter = isOpenRouterKey(key);

  if (isOpenRouter) {
    const model = resolveOpenRouterModel(input.model, env);
    const baseUrl = resolveBaseUrl(
      env?.OPENROUTER_BASE_URL,
      'https://openrouter.ai/api/v1',
      'OPENROUTER_BASE_URL'
    );
    const messages = normalizeMessages(input.messages);
    if (clean(input.system)) {
      messages.unshift({ role: 'system', content: clean(input.system) });
    }

    const payload = await requestJson(
      `${baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${key}`,
          'X-Title': clean(env?.OVYX_APP_NAME) || 'OVYX'
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: Number(input.maxTokens) > 0
            ? Math.min(Number(input.maxTokens), 8192)
            : 4096,
          temperature: typeof input.temperature === 'number' ? input.temperature : 0.4
        })
      },
      input.timeoutMs
    );

    return {
      provider: 'openrouter',
      model: clean(payload?.model) || model,
      text: extractText('openrouter', payload),
      raw: payload,
      providerLabel: 'OVYX AI'
    };
  }

  const model =
    clean(input.model) ||
    clean(env?.ANTHROPIC_AGENT_MODEL) ||
    clean(env?.ANTHROPIC_MODEL) ||
    'claude-sonnet-4-6';

  const payload = await requestJson(
    'https://api.anthropic.com/v1/messages',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        system: clean(input.system) || undefined,
        messages: normalizeMessages(input.messages).map(function (message) {
          return {
            role: message.role === 'assistant' ? 'assistant' : 'user',
            content: message.content
          };
        }),
        max_tokens:
          Number(input.maxTokens) > 0
            ? Math.min(Number(input.maxTokens), 8192)
            : 4096,
        temperature:
          typeof input.temperature === 'number'
            ? input.temperature
            : 0.4
      })
    },
    input.timeoutMs
  );

  return {
    provider: 'claude',
    model,
    text: extractText('claude', payload),
    raw: payload
  };
}

async function callOpenAICompatible(
  env,
  input,
  provider,
  secretName,
  baseUrl,
  defaultModel,
  keyOverride
) {
  const key = clean(keyOverride) || requiredSecret(env, secretName);

  const model = clean(input.model) || defaultModel;

  const messages = normalizeMessages(input.messages);

  if (input.system) {
    messages.unshift({
      role: 'system',
      content: input.system
    });
  }

  const payload = await requestJson(
    `${baseUrl}/chat/completions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${key}`
      },
      body: JSON.stringify({
        model,
        messages,
        temperature:
          typeof input.temperature === 'number'
            ? input.temperature
            : 0.4,
        max_tokens:
          Number(input.maxTokens) > 0
            ? Math.min(Number(input.maxTokens), 8192)
            : 4096
      })
    },
    input.timeoutMs
  );

  return {
    provider,
    model,
    text: extractText(provider, payload),
    raw: payload
  };
}

async function callDeepSeek(env, input) {
  return callOpenAICompatible(
    env,
    input,
    'deepseek',
    'DEEPSEEK_API_KEY',
    'https://api.deepseek.com',
    'deepseek-chat'
  );
}

async function callOpenAI(env, input) {
  const baseUrl = resolveBaseUrl(
    env?.OPENAI_BASE_URL,
    'https://api.openai.com/v1',
    'OPENAI_BASE_URL'
  );
  const usesGroq = isGroqBaseUrl(baseUrl);
  const key = clean(env?.OPENAI_API_KEY) || (usesGroq ? clean(env?.GROQ_API_KEY) : '');
  if (!key) requiredSecret(env, usesGroq ? 'GROQ_API_KEY or OPENAI_API_KEY' : 'OPENAI_API_KEY');

  const groqDefaultModel =
    clean(env?.GROQ_AGENT_MODEL) ||
    clean(env?.GROQ_MODEL) ||
    'openai/gpt-oss-20b';
  const suppliedModel = clean(input.model);
  const model = usesGroq && /^(gpt(?:-|$)|chatgpt\b)/i.test(suppliedModel)
    ? groqDefaultModel
    : suppliedModel || clean(env?.OPENAI_AGENT_MODEL) || clean(env?.OPENAI_MODEL) ||
      (usesGroq ? groqDefaultModel : 'gpt-4o-mini');

  const result = await callOpenAICompatible(
    env,
    { ...input, model },
    'openai',
    'OPENAI_API_KEY',
    baseUrl,
    model,
    key
  );
  return {
    ...result,
    providerLabel: 'OVYX AI',
    upstream: usesGroq ? 'groq-compatible' : 'openai-compatible'
  };
}

async function callGroq(env, input) {
  const configuredGroqBase = clean(env?.GROQ_BASE_URL) ||
    (isGroqBaseUrl(env?.OPENAI_BASE_URL) ? clean(env?.OPENAI_BASE_URL) : '') ||
    'https://api.groq.com/openai/v1';
  const baseUrl = resolveBaseUrl(configuredGroqBase, 'https://api.groq.com/openai/v1', 'GROQ_BASE_URL');
  const key = clean(env?.GROQ_API_KEY) ||
    (isGroqBaseUrl(env?.OPENAI_BASE_URL) ? clean(env?.OPENAI_API_KEY) : '');
  if (!key) requiredSecret(env, 'GROQ_API_KEY');

  const defaultModel = clean(env?.GROQ_AGENT_MODEL) || clean(env?.GROQ_MODEL) || 'openai/gpt-oss-20b';
  const suppliedModel = clean(input.model);
  const model = /^(gpt(?:-|$)|chatgpt\b)/i.test(suppliedModel) ? defaultModel : suppliedModel || defaultModel;

  return callOpenAICompatible(
    env,
    { ...input, model },
    'groq',
    'GROQ_API_KEY',
    baseUrl,
    defaultModel,
    key
  );
}

async function callCloudflareWorkersAI(env, input) {
  if (!env?.AI || typeof env.AI.run !== 'function') {
    const error = new Error('Cloudflare Workers AI binding is not configured.');
    error.code = 'AI_PROVIDER_NOT_CONFIGURED';
    error.status = 503;
    throw error;
  }

  const model = clean(input.model) || clean(env?.CLOUDFLARE_AI_MODEL) || '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
  const messages = normalizeMessages(input.messages);
  if (clean(input.system)) messages.unshift({ role: 'system', content: clean(input.system) });
  const result = await env.AI.run(model, {
    messages,
    max_tokens: Number(input.maxTokens) > 0 ? Math.min(Number(input.maxTokens), 8192) : 4096,
    temperature: typeof input.temperature === 'number' ? input.temperature : 0.4,
    stream: false
  });
  const text = extractText('cloudflare-workers-ai', result);
  if (!text) {
    const error = new Error('Cloudflare Workers AI returned an empty response.');
    error.code = 'AI_PROVIDER_EMPTY_RESPONSE';
    error.status = 502;
    throw error;
  }
  return { provider: 'cloudflare-workers-ai', model, text, raw: result };
}

export const PROVIDERS = Object.freeze({
  gemini: callGemini,
  claude: callClaude,
  deepseek: callDeepSeek,
  openai: callOpenAI,
  groq: callGroq,
  'cloudflare-workers-ai': callCloudflareWorkersAI
});

export async function generate(env, input) {
  const provider = clean(input && input.provider).toLowerCase();

  if (!PROVIDERS[provider]) {
    const error = new Error(
      `Unsupported AI provider: ${provider || 'none'}.`
    );

    error.code = 'AI_PROVIDER_UNSUPPORTED';
    throw error;
  }

  return PROVIDERS[provider](env, input);
        }
