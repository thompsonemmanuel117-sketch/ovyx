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
      'gpt',
      'gpt-3.5',
    ]);

  return requested &&
    !generic.has(
      String(
        requested
      ).toLowerCase()
    )
    ? requested
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

export function providerOrder(
  env,
  requested
) {
  if (
    requested &&
    requested !==
      'automatic'
  ) {
    return [
      requested ===
      'anthropic'
        ? 'claude'
        : requested,
    ];
  }

  return String(
    env.AI_PROVIDER_ORDER ||
      'gemini,deepseek,claude,openai'
  )
    .split(',')
    .map(
      x =>
        x
          .trim()
          .toLowerCase()
    )
    .filter(Boolean)
    .map(
      x =>
        x ===
        'anthropic'
          ? 'claude'
          : x
    );
}

export async function callModel(
  env,
  options = {}
) {
  const requested =
    options.provider ||
    'automatic';

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
          : null;

      if (!result) {
        throw new Error(
          `Unsupported provider: ${provider}`
        );
      }

      return result;
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
        code:
          'AI_PROVIDER_UNAVAILABLE',
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
