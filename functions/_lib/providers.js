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


function getConfiguredModel(
  env,
  provider,
  requested
) {
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
    )}:generateContent`;

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
          'x-goog-api-key':
            env.GEMINI_API_KEY,
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
    // OpenAI is a distinct provider. Never divert its key/choice to Groq.
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

function normalizeConfiguredProvider(value, env = {}) {
  const provider = String(value || '').trim().toLowerCase();

  if (provider === 'anthropic') return 'claude';
  if (provider === 'chatgpt' || provider === 'gpt') return 'openai';
  if (provider === 'cloudflare' || provider === 'workers-ai') return 'cloudflare-workers-ai';
  return provider;
}

const SUPPORTED_PROVIDERS = Object.freeze([
  'gemini',
  'deepseek',
  'claude',
  'openai',
  'groq',
  'cloudflare-workers-ai',
]);

function isProviderConfigured(env, provider) {
  switch (provider) {
    case 'gemini':
      return Boolean(String(env?.GEMINI_API_KEY || '').trim());
    case 'deepseek':
      return Boolean(String(env?.DEEPSEEK_API_KEY || '').trim());
    case 'claude':
      return Boolean(String(env?.ANTHROPIC_API_KEY || '').trim());
    case 'openai':
      return Boolean(String(env?.OPENAI_API_KEY || '').trim());
    case 'groq':
      return Boolean(String(env?.GROQ_API_KEY || '').trim());
    case 'cloudflare-workers-ai':
      return Boolean(env?.AI && typeof env.AI.run === 'function');
    default:
      return false;
  }
}

function automaticTaskPreference(options = {}) {
  const text = String(options.user || options.prompt || '').toLowerCase();

  // Web Studio and engineering tasks benefit from code-focused models first.
  if (/\b(website|web site|web studio|landing page|html|css|javascript|typescript|react|component|frontend|backend|api|code|coding|debug|debugging|bug|fix|refactor|deploy|build a site|build a website)\b/.test(text)) {
    return ['claude', 'deepseek', 'openai', 'gemini', 'groq', 'cloudflare-workers-ai'];
  }

  // Heavy reasoning, investigation and architecture work.
  if (/\b(reason|reasoning|logic|algorithm|architecture|diagnose|diagnosis|analy[sz]e|research|compare|math|calculate|complex|performance|security audit)\b/.test(text)) {
    return ['deepseek', 'claude', 'openai', 'gemini', 'groq', 'cloudflare-workers-ai'];
  }

  // Writing and everyday creative tasks favor a fast general-purpose model.
  if (/\b(write|rewrite|blog|article|headline|marketing|copywriting|seo|brand|story|translate|summari[sz]e|email|caption|product description)\b/.test(text)) {
    return ['gemini', 'claude', 'openai', 'deepseek', 'groq', 'cloudflare-workers-ai'];
  }

  return ['gemini', 'deepseek', 'claude', 'openai', 'groq', 'cloudflare-workers-ai'];
}

export function providerOrder(env, requested, options = {}) {
  const selection = String(requested || 'automatic').trim().toLowerCase();
  if (selection && selection !== 'automatic') {
    // An explicitly selected provider remains exclusive. Missing credentials
    // are reported to the user; no different vendor is substituted.
    return [normalizeRequestedProvider(selection, env)];
  }

  // When an administrator configures a preference order, keep it as the
  // fallback order behind the task-specific first choices.
  const configuredOrder = String(
    env?.AI_PROVIDER_ORDER || env?.OVYX_AI_PROVIDER_ORDER || ''
  )
    .split(',')
    .map(normalizeConfiguredProvider)
    .filter(provider => SUPPORTED_PROVIDERS.includes(provider));

  const priorities = [
    ...automaticTaskPreference(options),
    ...configuredOrder,
    'gemini',
    'deepseek',
    'claude',
    'openai',
    'groq',
  ];
  const unique = [...new Set(priorities)].filter(provider =>
    isProviderConfigured(env, provider)
  );

  // Cloudflare Workers AI stays a last-resort Automatic fallback only.
  if (
    env?.AI &&
    typeof env.AI.run === 'function' &&
    !unique.includes('cloudflare-workers-ai')
  ) {
    unique.push('cloudflare-workers-ai');
  }

  return unique;
}

export async function callModel(
  env,
  options = {}
) {
  const requestedRaw = String(options.provider || 'automatic').trim();
  const requested = requestedRaw.toLowerCase();

  // An account-selected Universal Connection is exclusive. Never silently bill a
  // platform provider after a user's own connection failed or could not be verified.
  const errors = [];
  if (options.authUser && !/^connection:/i.test(requestedRaw)) {
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
          requestedProvider: requested || 'automatic',
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

  if (/^connection:/i.test(requestedRaw)) {
    const connectionId = requestedRaw.slice('connection:'.length).trim();
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

  const availableOrder = providerOrder(env, requested, options);
  if (requested === 'automatic' && availableOrder.length === 0) {
    throw Object.assign(
      new Error('No AI provider is connected right now. Please try again later, or connect your own AI Brain in Universal Connections to continue building.'),
      { status: 503, code: 'AI_PROVIDER_NOT_CONFIGURED' }
    );
  }

  for (const provider of availableOrder) {
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

  if (requested !== 'automatic' && !requested.startsWith('connection:')) {
    const labels = {
      gemini: 'Gemini',
      deepseek: 'DeepSeek',
      claude: 'Claude',
      anthropic: 'Claude',
      openai: 'OpenAI',
      chatgpt: 'OpenAI',
      groq: 'Groq',
      'cloudflare-workers-ai': 'Cloudflare Workers AI',
    };
    const providerLabel = labels[requested] || requested.replace(/[-_]+/g, ' ').replace(/^./, letter => letter.toUpperCase());
    const notConfigured = errors.some(item => /not configured|missing server secret|binding is not configured/i.test(item));
    throw Object.assign(
      new Error(providerLabel + ' is not available right now. Please try again later, or connect your own AI Brain in Universal Connections to continue building.'),
      {
        status: 503,
        code: notConfigured ? 'AI_PROVIDER_NOT_CONFIGURED' : 'AI_PROVIDER_UNAVAILABLE',
        provider: normalizeRequestedProvider(requested, env),
      }
    );
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
