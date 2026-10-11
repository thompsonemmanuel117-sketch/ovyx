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

function taskProviderPreference(taskContext) {
  const task = String(taskContext || '').slice(0, 18_000).toLowerCase();
  if (!task) return [];

  // Deterministic task routing makes Automatic useful without inventing an API key
  // or pretending that a provider is configured. The configured order breaks ties.
  const design = /\b(design|visual|layout|landing page|website|web studio|html|css|responsive|frontend|front.end|theme|animation|ui|ux|component|prototype)\b/.test(task);
  const engineering = /\b(debug|debugging|bug|fix|refactor|backend|api|database|security|authentication|quota|token|billing|payment|test|testing|deploy|deployment|build|compiler|typescript|python|git|repository|migration|algorithm|architecture|code|implementation|implement)\b/.test(task);
  const reasoning = /\b(complex|analyse|analyze|reason|diagnos|strategy|compare|research|investigate|root cause|multi.step|trade.off)\b/.test(task);
  const writing = /\b(summarize|summarise|rewrite|caption|translate|grammar|format|draft|email|short answer|title|copywriting|proofread)\b/.test(task);

  const hardEngineering = /\b(debug|debugging|bug|fix|refactor|backend|api|database|security|authentication|quota|token|billing|payment|test|testing|deploy|deployment|compiler|typescript|python|git|repository|migration|algorithm|architecture|root cause)\b/.test(task);
  if (design && !hardEngineering) return ['gemini', 'claude', 'openai', 'deepseek', 'groq'];
  if (engineering && (reasoning || /\b(security|architecture|migration|root cause|refactor)\b/.test(task))) {
    return ['claude', 'openai', 'deepseek', 'gemini', 'groq'];
  }
  if (engineering) return ['deepseek', 'claude', 'openai', 'gemini', 'groq'];
  if (reasoning) return ['claude', 'openai', 'gemini', 'deepseek', 'groq'];
  if (writing) return ['gemini', 'deepseek', 'openai', 'claude', 'groq'];
  return [];
}

export function providerOrder(
  env,
  requested,
  taskContext = ''
) {
  if (requested && requested !== 'automatic') {
    return [normalizeRequestedProvider(requested, env)];
  }

  const configured = String(
    env.AI_PROVIDER_ORDER || env.OVYX_AI_PROVIDER_ORDER || 'gemini,deepseek,claude,openai'
  )
    .split(',')
    .map(normalizeConfiguredProvider)
    .filter(provider => ['gemini', 'deepseek', 'claude', 'openai', 'groq', 'cloudflare-workers-ai'].includes(provider));

  /* Keep explicit provider choices exclusive. In Automatic mode, a lightweight
     task classifier prioritizes suitable configured providers; the operator's
     configured order is the tie-breaker and remains the fallback preference. */
  const ordered = [...new Set(configured)];
  const preference = taskProviderPreference(taskContext);
  if (preference.length) {
    const rank = new Map(preference.map((provider, index) => [provider, index]));
    ordered.sort((left, right) => {
      const a = rank.has(left) ? rank.get(left) : Number.MAX_SAFE_INTEGER;
      const b = rank.has(right) ? rank.get(right) : Number.MAX_SAFE_INTEGER;
      return a - b;
    });
  }
  if (env?.AI && typeof env.AI.run === 'function' && !ordered.includes('cloudflare-workers-ai')) {
    ordered.push('cloudflare-workers-ai');
  }
  return ordered;
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

  for (
    const provider of providerOrder(
      env,
      requested,
      String(options.taskPrompt || options.user || '')
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

  if (typeof options.onUsage === 'function') {
    options.onUsage(
      result.rawUsage || null,
      String(options.user || ''),
      String(result.text || ''),
      result.provider || null
    );
  }

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
