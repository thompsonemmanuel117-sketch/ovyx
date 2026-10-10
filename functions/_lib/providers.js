import {
  callUserUniversalConnection,
  getActiveBrainConnectionId,
} from './universal-connections.js';
import {
  resolveOpenAICompatibleConfig,
  resolveOpenAICompatibleModel,
} from './openai-compatible.js';

const PROVIDER_REQUEST_TIMEOUT_MS = 60_000;
const UNIVERSAL_LOOKUP_TIMEOUT_MS = 5_000;

function withTimeout(promise, timeoutMs, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(Object.assign(
        new Error(label + ' timed out after ' + Math.ceil(timeoutMs / 1000) + ' seconds.'),
        { status: 504, code: 'AI_PROVIDER_TIMEOUT' }
      ));
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function fetchWithTimeout(url, options = {}, timeoutMs = PROVIDER_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw Object.assign(
        new Error('AI provider request timed out after ' + Math.ceil(timeoutMs / 1000) + ' seconds.'),
        { status: 504, code: 'AI_PROVIDER_TIMEOUT' }
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}


function getConfiguredModel(
  env,
  provider,
  requested
) {
  if (provider === 'openai' && String(env?.OPENAI_BASE_URL || '').trim()) {
    const target = resolveOpenAICompatibleConfig(env);
    return resolveOpenAICompatibleModel(env, target, requested);
  }

  const map = {
    gemini:
      env.GEMINI_AGENT_MODEL ||
      env.GEMINI_MODEL ||
      'gemini-2.5-pro',

    claude:
      env.ANTHROPIC_AGENT_MODEL ||
      env.ANTHROPIC_MODEL ||
      'claude-opus-5',

    deepseek:
      env.DEEPSEEK_AGENT_MODEL ||
      env.DEEPSEEK_MODEL ||
      'deepseek-flash',

    openai:
      env.OPENAI_AGENT_MODEL ||
      env.OPENAI_MODEL ||
      'gpt-5',

    groq:
      env.GROQ_AGENT_MODEL ||
      env.GROQ_MODEL ||
      'openai/gpt-oss-20b',

    'cloudflare-workers-ai':
      env.CLOUDFLARE_AI_MODEL ||
      '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  };

  const generic =
    new Set([
      'automatic',
      'auto',
      'gemini',
      'claude',
      'anthropic',
      'deepseek',
      'openai',
      'chatgpt',
      'gpt',
      'gpt-3.5',
      'groq',
      'llama',
      'workers-ai',
      'cloudflare',
    ]);

  const requestedText = String(
    requested || ''
  ).trim();

  const requestedLower =
    requestedText.toLowerCase();

  const compatibleWithRoute =
    provider === 'groq'
      ? requestedText.toLowerCase().startsWith('openai/')
      : provider === 'cloudflare-workers-ai'
      ? requestedText.toLowerCase().startsWith('@cf/')
      : true;

  return requestedText &&
    !generic.has(
      requestedLower
    ) &&
    compatibleWithRoute
    ? requestedText
    : map[provider];
}

function extractText(
  value
) {
  if (
    value ==
    null
  ) {
    return '';
  }

  if (
    typeof value ===
    'string'
  ) {
    return value;
  }

  if (
    Array.isArray(value)
  ) {
    return value
      .map(
        extractText
      )
      .join('');
  }

  if (
    typeof value ===
    'object'
  ) {
    if (
      typeof value.text ===
      'string'
    ) {
      return value.text;
    }

    if (
      typeof value.output_text ===
      'string'
    ) {
      return value.output_text;
    }

    for (
      const key of [
        'output',
        'response',
        'content',
        'parts',
        'message',
        'choices',
      ]
    ) {
      if (
        key in value
      ) {
        const text =
          extractText(
            value[key]
          );

        if (text) {
          return text;
        }
      }
    }
  }

  return '';
}

export function extractJsonObject(
  text
) {
  let cleaned =
    String(
      text || ''
    ).trim();

  cleaned =
    cleaned
      .replace(
        /^```(?:json)?/i,
        ''
      )
      .replace(
        /```$/i,
        ''
      )
      .trim();

  try {
    return JSON.parse(
      cleaned
    );
  } catch {}

  const start =
    cleaned.indexOf(
      '{'
    );

  const end =
    cleaned.lastIndexOf(
      '}'
    );

  if (
    start >= 0 &&
    end > start
  ) {
    try {
      return JSON.parse(
        cleaned.slice(
          start,
          end + 1
        )
      );
    } catch {}
  }

  throw Object.assign(
    new Error(
      'AI returned invalid structured JSON.'
    ),
    {
      code:
        'AI_INVALID_JSON',
    }
  );
}

async function callGemini(
  env,
  {
    system,
    user,
    model,
    maxTokens,
  }
) {
  if (
    !env.GEMINI_API_KEY
  ) {
    throw new Error(
      'Gemini is not configured.'
    );
  }

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model
    )}:generateContent?key=${encodeURIComponent(
      env.GEMINI_API_KEY
    )}`;

  const body = {
    systemInstruction: {
      parts: [
        {
          text: system,
        },
      ],
    },

    contents: [
      {
        role:
          'user',
        parts: [
          {
            text: user,
          },
        ],
      },
    ],

    generationConfig: {
      temperature:
        0.15,

      maxOutputTokens:
        maxTokens,

      responseMimeType:
        'application/json',
    },
  };

  const response =
    await fetchWithTimeout(
      url,
      {
        method:
          'POST',

        headers: {
          'Content-Type':
            'application/json',
        },

        body:
          JSON.stringify(
            body
          ),
      }
    );

  const data =
    await response
      .json()
      .catch(
        () => ({})
      );

  if (
    !response.ok
  ) {
    throw new Error(
      data?.error
        ?.message ||
        `Gemini HTTP ${response.status}`
    );
  }

  const text =
    extractText(
      data?.candidates?.[0]
        ?.content?.parts ||
        data
    );

  if (!text) {
    throw new Error(
      'Gemini returned an empty response.'
    );
  }

  return {
    text,
    model,
    provider:
      'gemini',
    rawUsage:
      data?.usageMetadata ||
      null,
  };
}

async function callClaude(
  env,
  {
    system,
    user,
    model,
    maxTokens,
  }
) {
  if (
    !env.ANTHROPIC_API_KEY
  ) {
    throw new Error(
      'Anthropic is not configured.'
    );
  }

  const response =
    await fetchWithTimeout(
      'https://api.anthropic.com/v1/messages',
      {
        method:
          'POST',

        headers: {
          'content-type':
            'application/json',

          'x-api-key':
            env.ANTHROPIC_API_KEY,

          'anthropic-version':
            '2023-06-01',
        },

        body:
          JSON.stringify({
            model,
            max_tokens:
              maxTokens,
            system,
            messages: [
              {
                role:
                  'user',
                content:
                  user,
              },
            ],
          }),
      }
    );

  const data =
    await response
      .json()
      .catch(
        () => ({})
      );

  if (
    !response.ok
  ) {
    throw new Error(
      data?.error
        ?.message ||
        `Anthropic HTTP ${response.status}`
    );
  }

  const text =
    extractText(
      data?.content ||
        data
    );

  if (!text) {
    throw new Error(
      'Anthropic returned an empty response.'
    );
  }

  return {
    text,
    model,
    provider:
      'claude',
    rawUsage:
      data?.usage ||
      null,
  };
}

async function callDeepSeek(
  env,
  {
    system,
    user,
    model,
    maxTokens,
  }
) {
  if (!env.DEEPSEEK_API_KEY) {
    throw Object.assign(
      new Error('DeepSeek is not configured.'),
      { status: 503, code: 'AI_PROVIDER_NOT_CONFIGURED' }
    );
  }

  const response = await fetchWithTimeout(
    'https://api.deepseek.com/chat/completions',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: 'Bearer ' + env.DEEPSEEK_API_KEY,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        max_tokens: Math.max(1, Math.min(Number(maxTokens) || 4096, 24000)),
        temperature: 0.2,
        stream: false,
      }),
    }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(
      new Error(data?.error?.message || data?.message || 'DeepSeek HTTP ' + response.status),
      { status: response.status, code: 'AI_PROVIDER_REQUEST_FAILED' }
    );
  }

  const text = extractText(data?.choices?.[0]?.message?.content || data);
  if (!text) {
    throw Object.assign(
      new Error('DeepSeek returned an empty response.'),
      { status: 502, code: 'AI_PROVIDER_EMPTY_RESPONSE' }
    );
  }

  return {
    text,
    model,
    provider: 'deepseek',
    rawUsage: data?.usage || null,
  };
}

async function callGroq(
  env,
  {
    system,
    user,
    model,
    maxTokens,
  }
) {
  if (!env.GROQ_API_KEY) {
    throw new Error(
      'Groq routing is not configured. Set GROQ_API_KEY in Cloudflare secrets.'
    );
  }

  const response = await fetchWithTimeout(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: 'Bearer ' + env.GROQ_API_KEY,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        max_tokens: maxTokens,
        temperature: 0.2,
      }),
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
        ('Groq HTTP ' + response.status)
    );
  }

  const text = extractText(
    data?.choices?.[0]?.message?.content || data
  );

  if (!text) {
    throw new Error('Groq returned an empty response.');
  }

  return {
    text,
    model,
    provider: 'groq',
    rawUsage: data?.usage || null,
  };
}

async function callCloudflareWorkersAI(
  env,
  {
    system,
    user,
    model,
    maxTokens,
  }
) {
  if (!env.AI || typeof env.AI.run !== 'function') {
    throw new Error(
      'Cloudflare Workers AI binding is not configured. Bind a Pages Functions AI resource as AI.'
    );
  }

  const result = await env.AI.run(
    model,
    {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: maxTokens,
      temperature: 0.2,
      stream: false,
    }
  );

  const text = extractText(result);

  if (!text) {
    throw new Error(
      'Cloudflare Workers AI returned an empty response.'
    );
  }

  return {
    text,
    model,
    provider: 'cloudflare-workers-ai',
    rawUsage: result?.usage || null,
  };
}
async function callOpenAI(
  env,
  {
    system,
    user,
    model,
    maxTokens,
  }
) {
  const customBase = String(env.OPENAI_BASE_URL || '').trim();

  if (customBase) {
    const target = resolveOpenAICompatibleConfig(env);
    if (!target.key) {
      throw Object.assign(
        new Error(
          'The configured ' + target.label + ' endpoint has no API key. Set ' +
          target.expectedKeyName + ' (or the endpoint-specific secret) in Cloudflare.'
        ),
        { code: 'AI_PROVIDER_NOT_CONFIGURED', status: 503 }
      );
    }

    const selectedModel = String(model || '').trim() ||
      resolveOpenAICompatibleModel(env, target, '');
    if (!selectedModel) {
      throw Object.assign(
        new Error(
          'An OpenAI-compatible endpoint is configured, but its model is not. Set OPENAI_MODEL or the model variable for the actual provider.'
        ),
        { code: 'AI_MODEL_NOT_CONFIGURED', status: 503 }
      );
    }

    const response = await fetchWithTimeout(
      target.chatCompletionsUrl,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: 'Bearer ' + target.key,
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          max_tokens: maxTokens,
          temperature: 0.2,
        }),
      }
    );

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        data?.error?.message ||
        data?.message ||
        (target.label + ' HTTP ' + response.status)
      );
    }

    const text = extractText(data?.choices?.[0]?.message?.content || data);
    if (!text) {
      throw new Error(target.label + ' returned an empty response.');
    }

    return {
      text,
      model: selectedModel,
      provider: target.provider,
      rawUsage: data?.usage || null,
    };
  }

  if (!env.OPENAI_API_KEY) {
    throw new Error('OpenAI is not configured.');
  }

  const response = await fetchWithTimeout(
    'https://api.openai.com/v1/responses',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: 'Bearer ' + env.OPENAI_API_KEY,
      },
      body: JSON.stringify({
        model,
        instructions: system,
        input: user,
        max_output_tokens: maxTokens,
      }),
    }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
      'OpenAI HTTP ' + response.status
    );
  }

  const text = extractText(data);
  if (!text) {
    throw new Error('OpenAI returned an empty response.');
  }

  return {
    text,
    model,
    provider: 'openai',
    rawUsage: data?.usage || null,
  };
}

function normalizeRequestedProvider(value, env = {}) {
  const normalized = String(value || 'automatic')
    .trim()
    .toLowerCase();

  if (normalized === 'chatgpt' || normalized === 'openai') {
    // A configured base URL is authoritative: use that compatible endpoint
    // instead of silently replacing it with the hard-coded Groq endpoint.
    return String(env?.OPENAI_BASE_URL || '').trim() ? 'openai' : 'groq';
  }

  if (normalized === 'claude' || normalized === 'anthropic') {
    return 'claude';
  }

  if (
    normalized === 'cloudflare' ||
    normalized === 'workers-ai' ||
    normalized === 'cloudflare-workers-ai'
  ) {
    return 'cloudflare-workers-ai';
  }

  return normalized;
}

function normalizeConfiguredProvider(value, env = {}) {
  const provider = String(value || '').trim().toLowerCase();

  // If OPENAI_BASE_URL is set, the "groq" slot in an existing order can use
  // the configured compatible endpoint even when GROQ_API_KEY is not defined.
  if (String(env?.OPENAI_BASE_URL || '').trim() && ['groq', 'chatgpt', 'gpt'].includes(provider)) {
    return 'openai';
  }

  if (provider === 'anthropic') return 'claude';
  if (provider === 'chatgpt' || provider === 'gpt') return 'openai';
  if (provider === 'cloudflare' || provider === 'workers-ai') return 'cloudflare-workers-ai';
  return provider;
}

export function providerOrder(
  env,
  requested
) {
  if (requested && requested !== 'automatic') {
    return [normalizeRequestedProvider(requested, env)];
  }

  const configured = String(
    env.AI_PROVIDER_ORDER || env.OVYX_AI_PROVIDER_ORDER || 'gemini,deepseek,claude,openai'
  )
    .split(',')
    .map(provider => normalizeConfiguredProvider(provider, env))
    .filter(provider => ['gemini', 'deepseek', 'claude', 'openai', 'groq', 'cloudflare-workers-ai'].includes(provider));

  /* Keep the configured preference order. Workers AI is an optional, private
     final fallback in Automatic mode; explicit provider choices stay exclusive. */
  const ordered = [...new Set(configured)];
  if (env?.AI && typeof env.AI.run === 'function' && !ordered.includes('cloudflare-workers-ai')) {
    ordered.push('cloudflare-workers-ai');
  }
  return ordered;
}

export async function callModel(
  env,
  options = {}
) {
  const requested = String(
    options.provider ||
      'automatic'
  )
    .trim()
    .toLowerCase();

  // An account-selected Universal Connection is exclusive. Never silently bill a
  // platform provider after a user's own connection failed or could not be verified.
  const errors = [];
  if (requested === 'automatic' && options.authUser) {
    let activeBrainId = null;
    try {
      activeBrainId = await withTimeout(
        getActiveBrainConnectionId(env, options.authUser),
        UNIVERSAL_LOOKUP_TIMEOUT_MS,
        'Universal Connection lookup'
      );
    } catch {
      throw Object.assign(
        new Error('OVYX could not verify your selected AI Brain. No other AI provider was used; retry after your connection settings are available.'),
        { status: 503, code: 'UNIVERSAL_CONNECTION_SELECTION_FAILED' }
      );
    }

    if (activeBrainId) {
      try {
        const result = await withTimeout(
          callUserUniversalConnection(env, {
            connectionId: activeBrainId,
            authUser: options.authUser,
            system: options.system,
            user: options.user,
            model: options.model,
            maxTokens: options.maxTokens
          }),
          PROVIDER_REQUEST_TIMEOUT_MS,
          'Universal Connection'
        );
        return {
          ...result,
          requestedProvider: 'automatic',
          routedProvider: 'universal-connection',
          activeBrainConnectionId: activeBrainId
        };
      } catch (err) {
        throw Object.assign(
          new Error('Your selected Universal Connection AI Brain failed. OVYX did not switch to another AI provider. ' + String(err?.message || 'Connection request failed.').slice(0, 260)),
          { status: err?.status || 503, code: err?.code || 'UNIVERSAL_CONNECTION_FAILED' }
        );
      }
    }
  }

  const routedProvider = requested.startsWith('connection:')
    ? 'universal-connection'
    : normalizeRequestedProvider(requested, env);

  if (requested.startsWith('connection:')) {
    const connectionId = requested.slice('connection:'.length).trim();
    if (!connectionId) {
      throw Object.assign(
        new Error('Universal Connection ID is required.'),
        { code: 'CONNECTION_ID_REQUIRED', status: 400 }
      );
    }

    const result = await withTimeout(
      callUserUniversalConnection(env, {
        connectionId,
        authUser: options.authUser,
        system: options.system,
        user: options.user,
        model: options.model,
        maxTokens: options.maxTokens
      }),
      PROVIDER_REQUEST_TIMEOUT_MS,
      'Universal Connection'
    );

    return {
      ...result,
      requestedProvider: requested,
      routedProvider
    };
  }

  for (
    const provider of providerOrder(
      env,
      requested
    )
  ) {
    try {
      const model =
        getConfiguredModel(
          env,
          provider,
          options.model
        );

      const result =
        provider ===
        'gemini'
          ? await callGemini(
              env,
              {
                ...options,
                model,
              }
            )
          : provider ===
            'claude'
          ? await callClaude(
              env,
              {
                ...options,
                model,
              }
            )
          : provider ===
            'deepseek'
          ? await callDeepSeek(
              env,
              {
                ...options,
                model,
              }
            )
          : provider ===
            'openai'
          ? await callOpenAI(
              env,
              {
                ...options,
                model,
              }
            )
          : provider ===
            'groq'
          ? await callGroq(
              env,
              {
                ...options,
                model,
              }
            )
          : provider ===
            'cloudflare-workers-ai'
          ? await callCloudflareWorkersAI(
              env,
              {
                ...options,
                model,
              }
            )
          : null;

      if (!result) {
        throw new Error(
          `Unsupported provider: ${provider}`
        );
      }

      return {
        ...result,
        requestedProvider: requested,
        routedProvider: requested === 'automatic' ? result.provider : routedProvider,
      };
    } catch (err) {
      errors.push(
        `${provider}: ${
          err?.message ||
          err
        }`
      );
    }
  }

  const error =
    Object.assign(
      new Error(
        `No configured AI provider succeeded. ${errors.join(
          ' | '
        )}`
      ),
      {
        status: 503,
        code: 'AI_PROVIDER_UNAVAILABLE',
      }
    );

  throw error;
}

export async function callJsonModel(
  env,
  options = {}
) {
  const result =
    await callModel(
      env,
      options
    );

  const value =
    extractJsonObject(
      result.text
    );

  return {
    ...result,
    json:
      value,
  };
}
