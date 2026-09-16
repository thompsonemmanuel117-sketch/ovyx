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

function normalizeMessages(messages) {
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

  if (provider === 'deepseek' || provider === 'openai') {
    return clean(payload?.choices?.[0]?.message?.content);
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

  const model =
    clean(input.model) || 'claude-3-5-sonnet-latest';

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
  defaultModel
) {
  const key = requiredSecret(env, secretName);

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
  return callOpenAICompatible(
    env,
    input,
    'openai',
    'OPENAI_API_KEY',
    'https://api.openai.com/v1',
    'gpt-4o-mini'
  );
}

const PROVIDERS = Object.freeze({
  gemini: callGemini,
  claude: callClaude,
  deepseek: callDeepSeek,
  openai: callOpenAI
});

async function generate(env, input) {
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

module.exports = {
  PROVIDERS,
  generate,
  normalizeMessages
};
