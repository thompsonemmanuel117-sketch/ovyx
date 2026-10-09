import {
  callUserUniversalConnection,
  getActiveBrainConnectionId,
} from './universal-connections.js';

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
      ? /^openai\\//i.test(
          requestedText
        )
      : provider ===
        'cloudflare-workers-ai'
      ? /^@cf\\//i.test(
          requestedText
        )
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
    await fetch(
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
    await fetch(
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
  if (
    !env.DEEPSEEK_API_KEY
  ) {
    throw new Error(
      'DeepSeek is not configured.'
    );
  }

  const response =
    await fetch(
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
  if (!env.GROQ_API_KEY) {
    throw new Error(
      'Groq routing is not configured. Set GROQ_API_KEY in Cloudflare secrets.'
    );
  }

  const response = await fetch(
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
  if (
    !env.OPENAI_API_KEY
  ) {
    throw new Error(
      'OpenAI is not configured.'
    );
  }

  const response =
    await fetch(
      'https://api.openai.com/v1/responses',
      {
        method:
          'POST',

        headers: {
          'content-type':
            'application/json',

          Authorization:
            `Bearer ${env.OPENAI_API_KEY}`,
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
        `OpenAI HTTP ${response.status}`
    );
  }

  const text =
    extractText(
      data
    );

  if (!text) {
    throw new Error(
      'OpenAI returned an empty response.'
    );
  }

  return {
    text,
    model,
    provider:
      'openai',
    rawUsage:
      data?.usage ||
      null,
  };
}

function normalizeRequestedProvider(value) {
  const normalized = String(value || 'automatic')
    .trim()
    .toLowerCase();

  if (normalized === 'chatgpt' || normalized === 'openai') {
    return 'groq';
  }

  if (normalized === 'claude' || normalized === 'anthropic') {
    return 'cloudflare-workers-ai';
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
  if (provider === 'chatgpt' || provider === 'gpt') return 'openai';
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

  if (
    requested === 'automatic' &&
    options.authUser
  ) {
    const activeBrainId =
      await getActiveBrainConnectionId(
        env,
        options.authUser
      );

    if (activeBrainId) {
      const result =
        await callUserUniversalConnection(
          env,
          {
            connectionId: activeBrainId,
            authUser: options.authUser,
            system: options.system,
            user: options.user,
            model: options.model,
            maxTokens: options.maxTokens
          }
        );

      return {
        ...result,
        requestedProvider: 'automatic',
        routedProvider: 'universal-connection',
        activeBrainConnectionId: activeBrainId
      };
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

    const result = await callUserUniversalConnection(env, {
      connectionId,
      authUser: options.authUser,
      system: options.system,
      user: options.user,
      model: options.model,
      maxTokens: options.maxTokens
    });

    return {
      ...result,
      requestedProvider: requested,
      routedProvider
    };
  }

  const errors = [];

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
