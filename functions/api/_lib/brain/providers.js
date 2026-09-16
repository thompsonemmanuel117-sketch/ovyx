'use strict';

const PROVIDERS = Object.freeze({
  gemini: Object.freeze({
    id: 'gemini',
    name: 'Google Gemini',
    envKey: 'GEMINI_API_KEY'
  }),

  claude: Object.freeze({
    id: 'claude',
    name: 'Anthropic Claude',
    envKey: 'ANTHROPIC_API_KEY'
  }),

  deepseek: Object.freeze({
    id: 'deepseek',
    name: 'DeepSeek',
    envKey: 'DEEPSEEK_API_KEY'
  }),

  openai: Object.freeze({
    id: 'openai',
    name: 'OpenAI',
    envKey: 'OPENAI_API_KEY'
  })
});

const PROVIDER_TIMEOUT_MS = 45000;

function getProviderConfig(provider) {
  const config = PROVIDERS[String(provider || '').toLowerCase()];

  if (!config) {
    throw new Error('Unsupported AI provider.');
  }

  return config;
}

function getProviderKey(provider, env) {
  const config = getProviderConfig(provider);
  const key = String(env[config.envKey] || '').trim();

  if (!key) {
    throw new Error(`${config.envKey} is not configured.`);
  }

  return key;
}

function createAbortSignal(timeoutMs = PROVIDER_TIMEOUT_MS) {
  return AbortSignal.timeout(timeoutMs);
}

async function readProviderResponse(response) {
  let payload = {};

  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const message =
      payload?.error?.message ||
      payload?.message ||
      `AI provider returned HTTP ${response.status}.`;

    const error = new Error(String(message));
    error.providerStatus = response.status;
    error.providerPayload = payload;

    throw error;
  }

  return payload;
}

async function callGemini({ env, messages, model, temperature, maxTokens }) {
  const key = getProviderKey('gemini', env);

  const selectedModel =
    String(model || '').trim() || 'gemini-2.5-flash';

  const contents = messages
    .filter(message => message && message.content)
    .map(message => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [
        {
          text: String(message.content)
        }
      ]
    }));

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(selectedModel)}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      signal: createAbortSignal(),
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens
        }
      })
    }
  );

  const payload = await readProviderResponse(response);

  const text =
    payload?.candidates?.[0]?.content?.parts
      ?.map(part => part?.text || '')
      .join('') || '';

  return {
    provider: 'gemini',
    model: selectedModel,
    text
  };
}

async function callClaude({ env, messages, model, temperature, maxTokens }) {
  const key = getProviderKey('claude', env);

  const selectedModel =
    String(model || '').trim() || 'claude-sonnet-4-5';

  const systemMessages = messages
    .filter(message => message?.role === 'system')
    .map(message => String(message.content || ''))
    .join('\n\n');

  const conversation = messages
    .filter(
      message =>
        message &&
        message.role !== 'system' &&
        message.content
    )
    .map(message => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: String(message.content)
    }));

  const response = await fetch(
    'https://api.anthropic.com/v1/messages',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      signal: createAbortSignal(),
      body: JSON.stringify({
        model: selectedModel,
        max_tokens: maxTokens,
        temperature,
        ...(systemMessages
          ? { system: systemMessages }
          : {}),
        messages: conversation
      })
    }
  );

  const payload = await readProviderResponse(response);

  const text =
    payload?.content
      ?.filter(block => block?.type === 'text')
      .map(block => block.text || '')
      .join('') || '';

  return {
    provider: 'claude',
    model: selectedModel,
    text
  };
}

async function callDeepSeek({
  env,
  messages,
  model,
  temperature,
  maxTokens
}) {
  const key = getProviderKey('deepseek', env);

  const selectedModel =
    String(model || '').trim() || 'deepseek-chat';

  const response = await fetch(
    'https://api.deepseek.com/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`
      },
      signal: createAbortSignal(),
      body: JSON.stringify({
        model: selectedModel,
        messages,
        temperature,
        max_tokens: maxTokens
      })
    }
  );

  const payload = await readProviderResponse(response);

  return {
    provider: 'deepseek',
    model: selectedModel,
    text:
      payload?.choices?.[0]?.message?.content || ''
  };
}

async function callOpenAI({
  env,
  messages,
  model,
  temperature,
  maxTokens
}) {
  const key = getProviderKey('openai', env);

  const selectedModel =
    String(model || '').trim() || 'gpt-5';

  const response = await fetch(
    'https://api.openai.com/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`
      },
      signal: createAbortSignal(),
      body: JSON.stringify({
        model: selectedModel,
        messages,
        temperature,
        max_tokens: maxTokens
      })
    }
  );

  const payload = await readProviderResponse(response);

  return {
    provider: 'openai',
    model: selectedModel,
    text:
      payload?.choices?.[0]?.message?.content || ''
  };
}

async function generateWithProvider({
  provider,
  env,
  messages,
  model,
  temperature = 0.2,
  maxTokens = 2000
}) {
  const normalizedProvider =
    String(provider || '').trim().toLowerCase();

  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('AI messages are required.');
  }

  if (!Number.isFinite(Number(maxTokens))) {
    throw new Error('Invalid maxTokens value.');
  }

  const safeTemperature = Math.min(
    2,
    Math.max(0, Number(temperature))
  );

  const safeMaxTokens = Math.min(
    8000,
    Math.max(1, Number(maxTokens))
  );

  switch (normalizedProvider) {
    case 'gemini':
      return callGemini({
        env,
        messages,
        model,
        temperature: safeTemperature,
        maxTokens: safeMaxTokens
      });

    case 'claude':
      return callClaude({
        env,
        messages,
        model,
        temperature: safeTemperature,
        maxTokens: safeMaxTokens
      });

    case 'deepseek':
      return callDeepSeek({
        env,
        messages,
        model,
        temperature: safeTemperature,
        maxTokens: safeMaxTokens
      });

    case 'openai':
      return callOpenAI({
        env,
        messages,
        model,
        temperature: safeTemperature,
        maxTokens: safeMaxTokens
      });

    default:
      throw new Error('Unsupported AI provider.');
  }
}

function getConfiguredProviders(env) {
  return Object.values(PROVIDERS)
    .filter(provider =>
      Boolean(String(env[provider.envKey] || '').trim())
    )
    .map(provider => provider.id);
}

module.exports = {
  PROVIDERS,
  generateWithProvider,
  getConfiguredProviders
};
