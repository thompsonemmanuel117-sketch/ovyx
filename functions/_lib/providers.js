import {
  callUserUniversalConnection,
  getActiveBrainConnectionId,
} from './universal-connections.js';

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


function apiHost(value) {
  try {
    return new URL(String(value || '')).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function openAICompatibleBase(env) {
  return String(
    env?.OVYX_AI_BASE_URL ||
    env?.OPENAI_BASE_URL ||
    'https://api.openai.com/v1'
  ).trim();
}

function isGroqEndpoint(value) {
  return apiHost(value) === 'api.groq.com';
}

function isOpenRouterEndpoint(value) {
  const host = apiHost(value);
  return host === 'openrouter.ai' || host.endsWith('.openrouter.ai');
}

function isOpenAIFirstPartyEndpoint(value) {
  return apiHost(value) === 'api.openai.com';
}

function safeApiBaseUrl(value, fallback, label) {
  const raw = String(value || fallback || '').trim();
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw Object.assign(
      new Error(label + ' API base URL is invalid.'),
      { status: 500, code: 'AI_BASE_URL_INVALID' }
    );
  }

  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw Object.assign(
      new Error(label + ' API base URL must be HTTPS and must not contain embedded credentials.'),
      { status: 500, code: 'AI_BASE_URL_INVALID' }
    );
  }

  return parsed.toString().replace(/\\/+$/, '');
}

function getConfiguredModel(
  env,
  provider,
  requested
) {
  const compatibleBase = openAICompatibleBase(env);
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
      env.OVYX_AI_AGENT_MODEL ||
      env.OVYX_AI_MODEL ||
      env.OPENAI_AGENT_MODEL ||
      env.OPENAI_MODEL ||
      (isGroqEndpoint(compatibleBase)
        ? (env.GROQ_AGENT_MODEL || env.GROQ_MODEL || 'openai/gpt-oss-20b')
        : isOpenRouterEndpoint(compatibleBase)
          ? (env.OPENROUTER_MODEL || 'anthropic/claude-sonnet-4.6')
          : 'gpt-5'),

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
      'ovyx',
      'ovyx-ai',
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
      ? /^openai\\//i.test(requestedText)
      : provider ===
        'cloudflare-workers-ai'
      ? /^@cf\\//i.test(requestedText)
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

async function callOpenAICompatible({
  apiKey,
  baseUrl,
  model,
  system,
  user,
  maxTokens,
  provider,
  displayProvider = 'OVYX AI',
  endpointLabel = 'OVYX AI gateway',
}) {
  const key = String(apiKey || '').trim();
  if (!key) {
    throw new Error(endpointLabel + ' is not configured.');
  }

  const base = safeApiBaseUrl(baseUrl, 'https://api.openai.com/v1', endpointLabel);
  const endpoint = /\\/chat\\/completions$/i.test(base)
    ? base
    : base + '/chat/completions';

  const response = await fetchWithTimeout(
    endpoint,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: 'Bearer ' + key,
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
    const detail = String(data?.error?.message || ('HTTP ' + response.status)).slice(0, 400);
    throw new Error(endpointLabel + ' request failed: ' + detail);
  }

  const text = extractText(data?.choices?.[0]?.message?.content || data);
  if (!text) {
    throw new Error(endpointLabel + ' returned an empty response.');
  }

  const host = apiHost(base);
  const upstreamProvider = isGroqEndpoint(base)
    ? 'Groq'
    : isOpenRouterEndpoint(base)
      ? 'OpenRouter'
      : isOpenAIFirstPartyEndpoint(base)
        ? 'OpenAI'
        : 'custom compatible endpoint';

  return {
    text,
    model,
    provider,
    displayProvider,
    upstreamProvider,
    rawUsage: data?.usage || null,
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
  const apiKey = String(env.ANTHROPIC_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('Anthropic or its configured compatible gateway is not configured.');
  }

  const configuredBase = String(
    env.ANTHROPIC_BASE_URL ||
    env.ANTHROPIC_API_BASE_URL ||
    ''
  ).trim();
  const openRouterKey = /^sk-or-/i.test(apiKey);
  const base = configuredBase || (openRouterKey
    ? 'https://openrouter.ai/api/v1'
    : 'https://api.anthropic.com/v1');
  const compatibleEndpoint = openRouterKey ||
    (!!configuredBase && apiHost(configuredBase) !== 'api.anthropic.com');

  if (compatibleEndpoint) {
    const compatibleModel =
      env.OPENROUTER_MODEL ||
      env.ANTHROPIC_AGENT_MODEL ||
      env.ANTHROPIC_MODEL ||
      (isOpenRouterEndpoint(base) ? 'anthropic/claude-sonnet-4.6' : model);

    return callOpenAICompatible({
      apiKey,
      baseUrl: base,
      model: compatibleModel,
      system,
      user,
      maxTokens,
      provider: 'claude',
      displayProvider: 'OVYX AI',
      endpointLabel: isOpenRouterEndpoint(base) ? 'OpenRouter gateway' : 'Anthropic-compatible gateway',
    });
  }

  const nativeBase = safeApiBaseUrl(base, 'https://api.anthropic.com/v1', 'Anthropic');
  const response = await fetchWithTimeout(
    nativeBase + '/messages',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system,
        messages: [
          {
            role: 'user',
            content: user,
          },
        ],
      }),
    }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      String(data?.error?.message || ('Anthropic HTTP ' + response.status)).slice(0, 400)
    );
  }

  const text = extractText(data?.content || data);
  if (!text) {
    throw new Error('Anthropic returned an empty response.');
  }

  return {
    text,
    model,
    provider: 'claude',
    displayProvider: 'Claude',
    upstreamProvider: 'Anthropic',
    rawUsage: data?.usage || null,
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
  if (
    !env.DEEPSEEK_API_KEY
  ) {
    throw new Error(
      'DeepSeek is not configured.'
    );
  }

  const response =
    await fetchWithTimeout(
      'https://api.deepseek.com/responses',
      {
        method:
          'POST',

        headers: {
          'content-type':
            'application/json',

          Authorization:
            `Bearer ${env.DEEPSEEK_API_KEY}`,
        },

        body:
          JSON.stringify({
            model,
            instructions:
              system,

            input:
              user,

            max_output_tokens:
              maxTokens,

            stream:
              false,
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
        `DeepSeek HTTP ${response.status}`
    );
  }

  const text =
    extractText(
      data
    );

  if (!text) {
    throw new Error(
      'DeepSeek returned an empty response.'
    );
  }

  return {
    text,
    model,
    provider:
      'deepseek',
    rawUsage:
      data?.usage ||
      null,
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
  const configuredBase = openAICompatibleBase(env);
  const key = String(
    env.GROQ_API_KEY ||
    (isGroqEndpoint(configuredBase)
      ? (env.OVYX_AI_API_KEY || env.OPENAI_API_KEY)
      : '') ||
    ''
  ).trim();

  if (!key) {
    throw new Error(
      'Groq is not configured. Set GROQ_API_KEY, or pair OPENAI_API_KEY with OPENAI_BASE_URL=https://api.groq.com/openai/v1.'
    );
  }

  const response = await fetchWithTimeout(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: 'Bearer ' + key,
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
      String(data?.error?.message || ('Groq HTTP ' + response.status)).slice(0, 400)
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
    displayProvider: 'OVYX AI',
    upstreamProvider: 'Groq',
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
  const apiKey = String(
    env.OVYX_AI_API_KEY ||
    env.OPENAI_API_KEY ||
    ''
  ).trim();

  if (!apiKey) {
    throw new Error(
      'OVYX AI is not configured. Set OVYX_AI_API_KEY or OPENAI_API_KEY in Cloudflare secrets.'
    );
  }

  const configuredBase = String(
    env.OVYX_AI_BASE_URL ||
    env.OPENAI_BASE_URL ||
    ''
  ).trim();
  const base = configuredBase || 'https://api.openai.com/v1';

  // OVYX AI can use any HTTPS endpoint that implements the OpenAI Chat
  // Completions protocol (for example Groq or OpenRouter). A first-party
  // OpenAI endpoint keeps its existing Responses API behavior.
  if (configuredBase && !isOpenAIFirstPartyEndpoint(base)) {
    return callOpenAICompatible({
      apiKey,
      baseUrl: base,
      model,
      system,
      user,
      maxTokens,
      provider: 'openai',
      displayProvider: 'OVYX AI',
      endpointLabel: 'OVYX AI gateway',
    });
  }

  const response = await fetchWithTimeout(
    'https://api.openai.com/v1/responses',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: 'Bearer ' + apiKey,
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
      String(data?.error?.message || ('OpenAI-compatible gateway HTTP ' + response.status)).slice(0, 400)
    );
  }

  const text = extractText(data);
  if (!text) {
    throw new Error('OVYX AI returned an empty response.');
  }

  return {
    text,
    model,
    provider: 'openai',
    displayProvider: 'OVYX AI',
    upstreamProvider: 'OpenAI',
    rawUsage: data?.usage || null,
  };
}

function normalizeRequestedProvider(value) {
  const normalized = String(value || 'automatic')
    .trim()
    .toLowerCase();

  if (['chatgpt', 'openai', 'gpt', 'ovyx', 'ovyx-ai', 'openai-compatible'].includes(normalized)) {
    return 'openai';
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

function normalizeConfiguredProvider(value) {
  const provider = String(value || '').trim().toLowerCase();
  /*
   * An automatic fallback list names the actual server provider whose
   * secret is configured. Do not silently turn the canonical "claude"
   * provider into Workers AI or "openai" into Groq: that skips
   * ANTHROPIC_API_KEY / OPENAI_API_KEY and can make an otherwise configured
   * stack fail with AI_PROVIDER_UNAVAILABLE. Explicit frontend selections
   * still use normalizeRequestedProvider() and retain the documented aliases.
   */
  if (provider === 'anthropic') return 'claude';
  if (provider === 'chatgpt' || provider === 'gpt' || provider === 'ovyx' || provider === 'ovyx-ai' || provider === 'openai-compatible') return 'openai';
  if (provider === 'cloudflare' || provider === 'workers-ai') return 'cloudflare-workers-ai';
  return provider;
}

export function providerOrder(
  env,
  requested
) {
  if (requested && requested !== 'automatic') {
    return [normalizeRequestedProvider(requested)];
  }

  const configured = String(
    env.AI_PROVIDER_ORDER || env.OVYX_AI_PROVIDER_ORDER || 'gemini,deepseek,claude,openai'
  )
    .split(',')
    .map(normalizeConfiguredProvider)
    .filter(provider => ['gemini', 'deepseek', 'claude', 'openai', 'groq', 'cloudflare-workers-ai'].includes(provider));

  /* Preserve order while removing duplicates and empty/unsupported values. */
  return [...new Set(configured)];
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

  // Prefer the saved Universal Connection Brain, but do not let an offline
  // or stale connection block the other configured AI providers.
  const errors = [];
  if (requested === 'automatic' && options.authUser) {
    let activeBrainId = null;
    try {
      activeBrainId = await withTimeout(
        getActiveBrainConnectionId(env, options.authUser),
        UNIVERSAL_LOOKUP_TIMEOUT_MS,
        'Universal Connection lookup'
      );
    } catch (err) {
      errors.push('universal-connection-selection: ' + (err?.message || err));
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
        errors.push('universal-connection (' + activeBrainId + '): ' + (err?.message || err));
      }
    }
  }

  const routedProvider = requested.startsWith('connection:')
    ? 'universal-connection'
    : normalizeRequestedProvider(requested);

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
