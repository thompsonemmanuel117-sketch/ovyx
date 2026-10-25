import { isCloudflareFreeAllowanceExhausted, isCloudflareFreeOnlyMode, isLegacyProviderRoutingEnabled, runCloudflareFreeInference, OVYX_CLOUDFLARE_FREE_MODEL } from './cloudflare-free-ai.js';
import {
  callUserUniversalConnection,
  getActiveBrainConnectionId,
} from './universal-connections.js';
import { getFirestoreData } from './firebase-admin.js';

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


const GEMINI_RETRYABLE_HTTP_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
async function fetchGeminiWithRetry(url, options = {}) {
  const maxAttempts = 3;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let response;
    try {
      response = await fetchWithTimeout(url, options);
    } catch (error) {
      const transient = error?.code === 'AI_PROVIDER_TIMEOUT' ||
        error?.name === 'AbortError' ||
        error?.name === 'TypeError';
      if (!transient || attempt >= maxAttempts - 1) throw error;
    }
    if (response) {
      if (!GEMINI_RETRYABLE_HTTP_STATUSES.has(response.status) || attempt >= maxAttempts - 1) {
        return response;
      }
      // Discard the transient response body before the bounded retry.
      try { await response.body?.cancel(); } catch {}
    }
    // Google's direct REST guidance recommends bounded exponential backoff
    // for 429/5xx. Never retry auth, billing, permission, or malformed-request
    // failures, and never loop indefinitely on an unhealthy provider.
    const baseDelay = 750 * (2 ** attempt);
    const jitter = Math.floor(Math.random() * 250);
    await new Promise(resolve => setTimeout(resolve, baseDelay + jitter));
  }
  throw Object.assign(new Error('Gemini retry budget was exhausted.'), {
    status: 503,
    code: 'AI_PROVIDER_UNAVAILABLE',
  });
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
      'gemini-3.8-flash',

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
      'gpt-6.1-sol',

    groq:
      env.GROQ_AGENT_MODEL ||
      env.GROQ_MODEL ||
      'openai/gpt-oss-20b',

    // If no OpenRouter model is pinned, let the account's configured default decide.
    openrouter:
      env.OPENROUTER_AGENT_MODEL ||
      env.OPENROUTER_MODEL ||
      '',

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
      'openrouter',
      'llama',
      'workers-ai',
      'cloudflare',
    ]);

  const requestedText = String(
    requested || ''
  ).trim();

  const requestedLower =
    requestedText.toLowerCase();

  // A single OVYX_EVAL_MODEL value may be Cloudflare-specific (for example
  // "@cf/meta/llama-3.3-70b-instruct-fp8-fast"). Automatic routing must not send
  // that vendor's model ID to Gemini, Claude, OpenAI or DeepSeek. Use an override
  // only when its model family is compatible with the provider being attempted.
  const compatibleWithRoute = (() => {
    switch (provider) {
      case 'gemini':
        return /^gemini(?:[-/])/i.test(requestedText);
      case 'claude':
        return /^claude(?:[-/])/i.test(requestedText);
      case 'deepseek':
        return /^deepseek(?:[-/])/i.test(requestedText);
      case 'openai':
        return /^(?:gpt[-/]|o[134](?:[-/]|$)|codex[-/]|chatgpt[-/])/i.test(requestedText);
      case 'groq':
        return requestedText.toLowerCase().startsWith('openai/');
      case 'openrouter':
        // OpenRouter model IDs use the provider/model form; Cloudflare binding
        // IDs are not OpenRouter model IDs.
        return /^[a-z0-9._-]+\/[a-z0-9._:/-]+$/i.test(requestedText);
      case 'cloudflare-workers-ai':
        return /^@cf\/[a-z0-9._/-]+$/i.test(requestedText);
      default:
        return false;
    }
  })();

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
    await fetchGeminiWithRetry(
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

  if (!response.ok) {
    throw Object.assign(
      new Error(data?.error?.message || `Gemini HTTP ${response.status}`),
      { status: response.status, code: 'AI_PROVIDER_REQUEST_FAILED' }
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

  if (!response.ok) {
    throw Object.assign(
      new Error(data?.error?.message || `Anthropic HTTP ${response.status}`),
      { status: response.status, code: 'AI_PROVIDER_REQUEST_FAILED' }
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
    throw Object.assign(
      new Error(data?.error?.message || ('Groq HTTP ' + response.status)),
      { status: response.status, code: 'AI_PROVIDER_REQUEST_FAILED' }
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

async function callOpenRouter(
  env,
  { system, user, model, maxTokens }
) {
  const key = String(env?.OPENROUTER_API_KEY || '').trim();
  if (!key) {
    throw Object.assign(
      new Error('OpenRouter is not configured.'),
      { status: 503, code: 'AI_PROVIDER_NOT_CONFIGURED' }
    );
  }

  const requestBody = {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    max_tokens: Math.max(1, Math.min(Number(maxTokens) || 4096, 24000)),
    temperature: 0.2,
    stream: false,
  };
  if (String(model || '').trim()) requestBody.model = String(model).trim();

  const response = await fetchWithTimeout(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: 'Bearer ' + key,
      },
      body: JSON.stringify(requestBody),
    }
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(
      new Error(data?.error?.message || data?.message || 'OpenRouter HTTP ' + response.status),
      { status: response.status, code: 'AI_PROVIDER_REQUEST_FAILED' }
    );
  }
  const text = extractText(data?.choices?.[0]?.message?.content || data);
  if (!text) {
    throw Object.assign(
      new Error('OpenRouter returned an empty response.'),
      { status: 502, code: 'AI_PROVIDER_EMPTY_RESPONSE' }
    );
  }
  return {
    text,
    model: String(data?.model || model || 'account-default'),
    provider: 'openrouter',
    rawUsage: data?.usage || null,
  };
}

function collectCloudflareWorkersAiFailureEvidence(root) {
  const messages = [];
  const codes = [];
  const statuses = [];
  const names = [];
  const queue = [{ value: root, key: 'root', depth: 0 }];
  const seen = new Set();
  const messageKeys = new Set(['message', 'detail', 'reason', 'statusText', 'error_description', 'cause', 'error', 'errors']);
  const nestedKeys = new Set([
    'cause', 'error', 'errors', 'response', 'data', 'body', 'details',
    'metadata', 'originalError', 'upstreamError', 'info',
  ]);
  const codeKeys = new Set(['code', 'errorCode', 'internalCode']);
  const statusKeys = new Set(['status', 'statusCode', 'httpStatus']);
  let visited = 0;

  while (queue.length && visited < 36) {
    const item = queue.shift();
    const value = item.value;
    const key = String(item.key || '');
    const depth = Number(item.depth || 0);
    visited += 1;

    if (typeof value === 'string') {
      if (messageKeys.has(key) && value.length) messages.push(value.slice(0, 1600));
      if (key === 'body' && value.length <= 12_000 && /^[\s]*[\[{]/.test(value)) {
        try { queue.push({ value: JSON.parse(value), key: 'body', depth: depth + 1 }); } catch {}
      }
      continue;
    }
    if (!value || typeof value !== 'object' || seen.has(value) || depth > 4) continue;
    seen.add(value);

    for (const field of ['name', 'message', 'detail', 'reason', 'statusText', 'error_description']) {
      try {
        const text = value[field];
        if (field === 'name' && typeof text === 'string' && text.length <= 100) names.push(text);
        if (field !== 'name' && typeof text === 'string' && text.length) messages.push(text.slice(0, 1600));
      } catch {}
    }
    for (const field of statusKeys) {
      try {
        const candidate = Number(value[field]);
        if (Number.isInteger(candidate) && candidate >= 400 && candidate <= 599) statuses.push(candidate);
      } catch {}
    }
    for (const field of codeKeys) {
      try {
        const candidate = String(value[field] ?? '').trim();
        if (candidate && candidate.length <= 80) codes.push(candidate.toUpperCase());
      } catch {}
    }

    if (depth >= 4) continue;
    for (const field of nestedKeys) {
      let child;
      try { child = value[field]; } catch { continue; }
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) {
        for (const entry of child.slice(0, 5)) queue.push({ value: entry, key: field, depth: depth + 1 });
      } else if (typeof child === 'object' || typeof child === 'string') {
        queue.push({ value: child, key: field, depth: depth + 1 });
      }
    }
  }

  return { message: messages.join(' ').slice(0, 8000).toLowerCase(), codes, statuses, names };
}

function classifyCloudflareWorkersAiFailure(error) {
  // Cloudflare's binding can wrap its code/status/message in nested error
  // objects. Inspect a bounded set of known fields for classification only.
  // Never return or log raw messages, bodies, request data or credentials.
  const evidence = collectCloudflareWorkersAiFailureEvidence(error);
  const message = evidence.message;
  const knownInternalCodes = new Set([
    '5007', '5004', '3039', '3003', '5018', '5016', '3023', '3041',
    '5035', '5019', '5005', '3042', '3006', '3007', '3008', '3036', '3040',
  ]);
  const internalCode = evidence.codes.find(value => knownInternalCodes.has(value)) ||
    (message.match(/\b(5007|5004|3039|3003|5018|5016|3023|3041|5035|5019|5005|3042|3006|3007|3008|3036|3040)\b/) || [])[1] ||
    '';
  const documentedCodes = {
    '5007': { status: 400, code: 'AI_PROVIDER_UNSUPPORTED' },
    '5004': { status: 400, code: 'AI_PROVIDER_REQUEST_FAILED' },
    '3039': { status: 400, code: 'AI_PROVIDER_REQUEST_FAILED' },
    '3003': { status: 400, code: 'AI_PROVIDER_REQUEST_FAILED' },
    '5018': { status: 403, code: 'AI_PROVIDER_PERMISSION_DENIED' },
    '5016': { status: 403, code: 'AI_PROVIDER_PERMISSION_DENIED' },
    '3023': { status: 403, code: 'AI_PROVIDER_PERMISSION_DENIED' },
    '3041': { status: 403, code: 'AI_PROVIDER_PERMISSION_DENIED' },
    '5035': { status: 403, code: 'AI_PROVIDER_PLAN_REQUIRED' },
    '5019': { status: 405, code: 'AI_PROVIDER_REQUEST_FAILED' },
    '5005': { status: 405, code: 'AI_PROVIDER_UNSUPPORTED' },
    '3042': { status: 404, code: 'AI_PROVIDER_UNSUPPORTED' },
    '3006': { status: 413, code: 'AI_PROVIDER_REQUEST_FAILED' },
    '3007': { status: 408, code: 'AI_PROVIDER_TIMEOUT' },
    '3008': { status: 408, code: 'AI_PROVIDER_TIMEOUT' },
    '3036': { status: 429, code: 'AI_PROVIDER_RATE_LIMITED' },
    '3040': { status: 429, code: 'AI_PROVIDER_RATE_LIMITED' },
  };
  const documented = documentedCodes[internalCode];
  let status = evidence.statuses[0] ?? null;
  const code = evidence.codes.find(value => /^AI_PROVIDER_[A-Z0-9_]+$/.test(value)) || '';
  const modelFailure = /(?:invalid|unknown|unsupported|not found|does not exist).{0,60}model|model.{0,60}(?:invalid|unknown|unsupported|not found|does not exist)/i.test(message);
  const billingFailure = /payment required|billing|insufficient (?:credits?|balance)|credits? exhausted|payment method/i.test(message);
  const authFailure = /unauthori[sz]ed|invalid (?:api )?key|authentication failed|invalid token/i.test(message);
  const permissionFailure = /forbidden|permission denied|not authorized|access denied|account is not allowed/i.test(message);
  const quotaFailure = /rate.?limit|too many requests|quota|resource exhausted|limit exceeded|daily free allocation|out of capacity/i.test(message);
  const timeoutFailure = /timed?\s*out|timeout|deadline exceeded/i.test(message);
  const networkFailure = /failed to fetch|network error|connection reset|socket hang up|connection refused/i.test(message);
  const errorNames = evidence.names.map(value => value.toLowerCase());

  if (documented) status = documented.status;
  if (status === null) {
    if (code === 'AI_PROVIDER_TIMEOUT' || timeoutFailure || errorNames.includes('timeouterror') || errorNames.includes('aborterror')) status = 504;
    else if (billingFailure) status = 402;
    else if (authFailure) status = 401;
    else if (permissionFailure) status = 403;
    else if (modelFailure) status = /not found|does not exist|unknown model/i.test(message) ? 404 : 400;
    else if (quotaFailure) status = 429;
    else if (/overload|temporarily unavailable|service unavailable|internal server error/i.test(message)) status = 503;
    else if (/bad request|invalid request|invalid argument|invalid parameter/i.test(message)) status = 400;
  }

  if (documented?.code === 'AI_PROVIDER_PLAN_REQUIRED' || code === 'AI_PROVIDER_PLAN_REQUIRED') return { status: status ?? 403, code: 'AI_PROVIDER_PLAN_REQUIRED' };
  if (documented?.code === 'AI_PROVIDER_UNSUPPORTED' || modelFailure || code === 'AI_PROVIDER_UNSUPPORTED' || status === 404) {
    return { status: status ?? 404, code: 'AI_PROVIDER_UNSUPPORTED' };
  }
  if (billingFailure || code === 'AI_PROVIDER_BILLING_REQUIRED' || status === 402) return { status: 402, code: 'AI_PROVIDER_BILLING_REQUIRED' };
  if (authFailure || code === 'AI_PROVIDER_AUTH_FAILED' || status === 401) return { status: 401, code: 'AI_PROVIDER_AUTH_FAILED' };
  if (permissionFailure || code === 'AI_PROVIDER_PERMISSION_DENIED' || status === 403) return { status: 403, code: 'AI_PROVIDER_PERMISSION_DENIED' };
  if (quotaFailure || code === 'AI_PROVIDER_RATE_LIMITED' || status === 429) return { status: 429, code: 'AI_PROVIDER_RATE_LIMITED' };
  if (timeoutFailure || code === 'AI_PROVIDER_TIMEOUT' || status === 408 || status === 504 || errorNames.includes('timeouterror') || errorNames.includes('aborterror')) {
    return { status: status ?? 504, code: 'AI_PROVIDER_TIMEOUT' };
  }
  if (status !== null) return { status, code: documented?.code || 'AI_PROVIDER_REQUEST_FAILED' };
  if (networkFailure || code === 'AI_PROVIDER_NETWORK_ERROR' || errorNames.includes('typeerror')) return { status: null, code: 'AI_PROVIDER_NETWORK_ERROR' };
  return { status: null, code: 'AI_PROVIDER_UNKNOWN_ERROR' };
}


// The selected Cloudflare model has a 24k-token context window. Reserve ample
// room for its generated files and provider/template overhead by bounding both
// inputs together and capping output lower than the former 8,192-token ceiling.
const CLOUDFLARE_WORKERS_AI_SYSTEM_CHAR_BUDGET = 8_000;
const CLOUDFLARE_WORKERS_AI_USER_CHAR_BUDGET = 14_000;
const CLOUDFLARE_WORKERS_AI_OUTPUT_TOKEN_BUDGET = 6_144;

const CLOUDFLARE_WORKERS_AI_WEB_STUDIO_PRIORITY_CONTRACT = [
  'OPEN-ENDED BRIEF: Treat the original user brief as the source of truth. Support arbitrary concepts, industries and countries; never force a category or market, nor replace a novel request with a familiar template. Preserve every explicit page, feature, exclusion and workflow.',
  'DISTINCT ART DIRECTION: Choose a visual idea for the real audience and use case. Use deliberate composition, hierarchy, typography, spacing rhythm, surface treatment, colour and relevant imagery/graphics. Build a cohesive, complete experience; avoid generic hero-plus-three-cards layouts, excessive blank space, arbitrary decoration and repeated template sections.',
  'EDITORIAL COPY: Write mature, natural, proofread and audience-specific copy. Use useful headings, concise labels, specific CTAs, correct spelling/grammar, descriptive document titles and meaningful meta descriptions. Remove AI filler, repeated slogans, empty superlatives, placeholders, TODOs and unsupported claims. Do not invent prices, testimonials, addresses, availability, credentials or business facts.',
  'VISUAL ASSETS AND RESPONSIVE QUALITY: Use supplied/project-owned assets first. Never fabricate remote image URLs or leave broken references. Keep local links to CSS/JS/assets correct relative to every HTML file path; ensure shared styles and scripts actually load. Design and review 320, 390, 768, 1024 and 1440 pixel widths; prevent overflow, clipping and overlap. Use keyboard-visible focus, accessible labels, readable contrast and prefers-reduced-motion support.',
  'FUNCTIONAL COMPLETENESS: Build the full user journey, not just a hero. Every visible button, link, form, navigation item, menu, filter, tab and toggle must have a real destination or behavior with observable state/feedback. Keep HTML semantic and controls keyboard-usable. Include useful empty, loading, validation and error states. Do not leave inert controls or fake success states.',
  'TRUTHFUL INTEGRATIONS: Never claim live listings, inventory, bookings, payment, data persistence, email/message delivery or external connections unless supplied/configured and actually verified. Without a real listing feed, use an honest empty state or clearly labelled illustrative samples. Without a confirmed enquiry endpoint, state the true setup boundary. Never invent endpoints, recipients or credentials and never expose secrets in browser code.',
  'QUALITY AND OUTPUT: Preserve the approved sitemap and every explicit requirement. Generate complete, non-empty files with valid JSON matching the existing output contract. Audit routes, fragments, local assets, page metadata, interactions and responsive behavior before returning. If a requirement cannot be truthfully met, report it as pending rather than claiming success.',
].join('\n');

function compactWorkersAiSystemPrompt(value, limit) {
  const text = String(value ?? '');
  if (text.length <= limit) return text;

  const webStudioMarkers = [
    'ART DIRECTION AND DISTINCTIVENESS:',
    'EDITORIAL COPY AND TYPOGRAPHY QUALITY GATE:',
    'FUNCTIONAL COMPLETENESS AND TRUTHFULNESS:',
    'INTERACTION LEDGER AND ACCEPTANCE CHECKS:',
  ];
  const isWebStudioQualityContract = webStudioMarkers.every(marker => text.includes(marker));
  if (!isWebStudioQualityContract) {
    return truncatePromptPreservingEdges(text, limit, 0.56);
  }

  // A blind first/last slice removes the middle editorial and visual standards
  // from OVYX's 21k-character design contract. Keep the role/open-ended brief,
  // a compact summary of each acceptance-critical section, and the final QA
  // instructions. This protects output quality within the model's context cap.
  const notice = '\n\n[The long Web Studio contract was compacted; the priority-preserved requirements below remain mandatory.]\n\n';
  const tailNotice = '\n\n[Original final system/QA instructions preserved below.]\n\n';
  const tailBudget = Math.min(1_200, Math.floor(limit * 0.12));
  const tail = text.slice(-tailBudget);
  const prefixBudget = Math.max(
    1_000,
    Math.min(5_200, limit - notice.length - CLOUDFLARE_WORKERS_AI_WEB_STUDIO_PRIORITY_CONTRACT.length - tailNotice.length - tail.length),
  );
  const prefix = text.slice(0, prefixBudget);
  let compact = prefix + notice + CLOUDFLARE_WORKERS_AI_WEB_STUDIO_PRIORITY_CONTRACT + tailNotice + tail;
  if (compact.length > limit) {
    const excess = compact.length - limit;
    const safePrefix = text.slice(0, Math.max(1_000, prefixBudget - excess));
    compact = safePrefix + notice + CLOUDFLARE_WORKERS_AI_WEB_STUDIO_PRIORITY_CONTRACT + tailNotice + tail;
  }
  if (compact.length > limit) {
    throw new Error('Cloudflare Workers AI Web Studio system prompt could not fit its configured context budget.');
  }
  return compact;
}

function truncatePromptPreservingEdges(value, limit, headRatio = 0.68) {
  const text = String(value ?? '');
  if (text.length <= limit) return text;
  const notice = '\n\n[Middle of prompt abbreviated to fit the selected AI model context window.]\n\n';
  const available = Math.max(0, limit - notice.length);
  const headSize = Math.min(available, Math.floor(available * headRatio));
  const tailSize = Math.max(0, available - headSize);
  return text.slice(0, headSize) + notice + (tailSize ? text.slice(-tailSize) : '');
}

function compactWorkersAiUserPrompt(value, limit) {
  const text = String(value ?? '');
  if (text.length <= limit) return text;

  const briefMarker = /ORIGINAL USER BRIEF(?:\s*\([^)]{0,180}\))?\s*:/i.exec(text);
  if (!briefMarker) return truncatePromptPreservingEdges(text, limit, 0.58);

  const briefStart = briefMarker.index + briefMarker[0].length;
  const routeIndex = text.toLowerCase().indexOf('full website route manifest', briefStart);
  const briefEnd = routeIndex >= 0 ? routeIndex : Math.min(text.length, briefStart + 9000);
  const brief = text.slice(briefStart, briefEnd).trim();
  const briefBudget = Math.min(6_000, Math.floor(limit * 0.31));
  const keptBrief = truncatePromptPreservingEdges(brief, briefBudget, 0.75);
  const label = text.slice(briefMarker.index, briefStart);
  const routeSection = routeIndex >= 0
    ? text.slice(routeIndex, Math.min(text.length, routeIndex + 2_000))
    : '';
  const noteBefore = '\n\n[Other prompt context abbreviated; the original user brief is retained below.]\n';
  const noteAfter = '\n\n[Additional intermediate context omitted; the final staged-file context is retained below.]\n';
  const suffixBudget = Math.min(6_500, Math.floor(limit * 0.33));
  const reserved = noteBefore.length + noteAfter.length + label.length + keptBrief.length + routeSection.length + suffixBudget;
  const prefixBudget = Math.max(0, limit - reserved);
  const prefix = text.slice(0, Math.min(5_000, prefixBudget, briefMarker.index));
  const suffix = suffixBudget ? text.slice(-suffixBudget) : '';
  let compact = prefix + noteBefore + label + keptBrief +
    (routeSection ? '\n\n' + routeSection : '') + noteAfter + suffix;

  // Extremely long/custom marker labels are not expected, but the final guard
  // keeps the runtime request within budget even if the prompt format changes.
  if (compact.length > limit) {
    compact = truncatePromptPreservingEdges(compact, limit, 0.58);
  }
  return compact;
}

function prepareWorkersAiRequest(options = {}) {
  const requestedTokens = Number(options.maxTokens);
  const safeRequestedTokens = Number.isFinite(requestedTokens) && requestedTokens > 0
    ? Math.floor(requestedTokens)
    : CLOUDFLARE_WORKERS_AI_OUTPUT_TOKEN_BUDGET;
  return {
    ...options,
    system: compactWorkersAiSystemPrompt(
      options.system,
      CLOUDFLARE_WORKERS_AI_SYSTEM_CHAR_BUDGET,
    ),
    user: compactWorkersAiUserPrompt(
      options.user,
      CLOUDFLARE_WORKERS_AI_USER_CHAR_BUDGET,
    ),
    maxTokens: Math.min(safeRequestedTokens, CLOUDFLARE_WORKERS_AI_OUTPUT_TOKEN_BUDGET),
  };
}

async function callCloudflareWorkersAI(
  env,
  {
    system,
    user,
    model,
    maxTokens,
    authUser,
  }
) {
  if (!env.AI || typeof env.AI.run !== 'function') {
    throw Object.assign(new Error('OVYX AI is not connected yet. Please try again later.'), {
      status: 503, code: 'OVYX_NATIVE_AI_NOT_CONFIGURED',
    });
  }

  const freeOnly = isCloudflareFreeOnlyMode(env);
  const selectedModel = freeOnly ? OVYX_CLOUDFLARE_FREE_MODEL : model;
  let result;
  const configuredTimeout = Number(env?.OVYX_WORKERS_AI_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout >= 50
    ? Math.min(60_000, configuredTimeout)
    : 45_000;
  try {
    if (freeOnly) {
      const guarded = await runCloudflareFreeInference(env, { authUser, system, user, maxTokens, timeoutMs });
      result = guarded.result;
    } else {
      result = await withTimeout(
        env.AI.run(
          selectedModel,
          {
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
            max_tokens: maxTokens,
            temperature: 0.2,
            stream: false,
          }
        ),
        timeoutMs,
        'Cloudflare Workers AI'
      );
    }
  } catch (error) {
    if (freeOnly && String(error?.code || '').startsWith('OVYX_AI_')) throw error;
    const classification = classifyCloudflareWorkersAiFailure(error);
    const safeError = new Error('Cloudflare Workers AI request failed.');
    if (classification.status !== null) safeError.status = classification.status;
    safeError.code = classification.code;
    if (classification.code === 'AI_PROVIDER_NETWORK_ERROR' || error?.name === 'TypeError') safeError.name = 'TypeError';
    if (classification.code === 'AI_PROVIDER_TIMEOUT' || error?.name === 'AbortError' || error?.name === 'TimeoutError') safeError.name = 'TimeoutError';
    throw safeError;
  }

  const text = extractText(result);

  if (!text) {
    throw new Error(
      'Cloudflare Workers AI returned an empty response.'
    );
  }

  return {
    text,
    model: selectedModel,
    provider: 'cloudflare-workers-ai',
    rawUsage: result?.usage || result?.result?.usage || null,
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
    throw Object.assign(
      new Error(data?.error?.message || 'OpenAI HTTP ' + response.status),
      { status: response.status, code: 'AI_PROVIDER_REQUEST_FAILED' }
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

const SUPPORTED_PROVIDERS = Object.freeze([
  'gemini', 'deepseek', 'claude', 'openai', 'groq', 'openrouter', 'cloudflare-workers-ai',
]);

function isProviderConfigured(env, provider) {
  switch (provider) {
    case 'gemini': return Boolean(String(env?.GEMINI_API_KEY || '').trim());
    case 'deepseek': return Boolean(String(env?.DEEPSEEK_API_KEY || '').trim());
    case 'claude': return Boolean(String(env?.ANTHROPIC_API_KEY || '').trim());
    case 'openai': return Boolean(String(env?.OPENAI_API_KEY || '').trim());
    case 'groq': return Boolean(String(env?.GROQ_API_KEY || '').trim());
    case 'openrouter': return Boolean(String(env?.OPENROUTER_API_KEY || '').trim());
    case 'cloudflare-workers-ai': return Boolean(env?.AI && typeof env.AI.run === 'function');
    default: return false;
  }
}


let globalProviderOrderCache = null;
let globalProviderOrderCheckedAt = 0;
async function readGlobalProviderOrder(env) {
  const now = Date.now();
  if (globalProviderOrderCache && now - globalProviderOrderCheckedAt < 4000) {
    return [...globalProviderOrderCache];
  }
  const config = (await getFirestoreData(env, 'system', 'config')) || {};
  const value = config.aiConfig?.providerOrder;
  const normalized = Array.isArray(value)
    ? value.map(normalizeConfiguredProvider).filter(provider => SUPPORTED_PROVIDERS.includes(provider) && provider !== 'cloudflare-workers-ai')
      .filter((provider, index, all) => all.indexOf(provider) === index)
    : [];
  globalProviderOrderCache = normalized;
  globalProviderOrderCheckedAt = now;
  return [...normalized];
}

export function providerOrder(env, requested, taskContext = '', globalOrder = null, preferredProvider = '', providerRouting = 'automatic', fallback = 'automatic') {
  const selection = String(requested || 'automatic').trim().toLowerCase();
  if (selection && selection !== 'automatic') {
    // An explicit choice is exclusive even when its key is missing.
    return [normalizeRequestedProvider(selection, env)];
  }

  const configuredOrder = String(
    env?.AI_PROVIDER_ORDER || env?.OVYX_AI_PROVIDER_ORDER || 'gemini,deepseek,claude,openai,groq,openrouter'
  )
    .split(',')
    .map(normalizeConfiguredProvider)
    .filter(provider => SUPPORTED_PROVIDERS.includes(provider) && provider !== 'cloudflare-workers-ai');

  // Use the existing task classifier, then the configured order as fallback.
  // Unlike the historical implementation, never try an unconfigured provider.
  const preferred = normalizeConfiguredProvider(preferredProvider);
  const userPreferred = SUPPORTED_PROVIDERS.includes(preferred) && preferred !== 'cloudflare-workers-ai' ? [preferred] : [];
  const routing = String(providerRouting || 'automatic').trim().toLowerCase();
  const preferredFirst = routing === 'preferred-first' ? userPreferred : [];
  const preferredFallback = routing === 'provider-priority' || routing === 'preferred-first' ? [] : userPreferred;
  const priorities = [
    ...preferredFirst,
    ...(Array.isArray(globalOrder) && globalOrder.length ? globalOrder : taskProviderPreference(taskContext)),
    ...preferredFallback,
    ...configuredOrder,
    'gemini', 'deepseek', 'claude', 'openai', 'groq', 'openrouter',
  ];
  const ordered = [...new Set(priorities)].filter(provider => isProviderConfigured(env, provider));

  // Stop mode means the user's preferred provider is exclusive for automatic
  // requests, even if its secret is missing. Let the normal adapter produce the
  // existing safe not-configured error instead of silently selecting another vendor.
  const stopOnFailure = String(fallback || 'automatic').trim().toLowerCase() === 'stop';
  if (stopOnFailure && userPreferred.length && routing !== 'provider-priority') {
    return userPreferred.slice(0, 1);
  }
  if (stopOnFailure && ordered.length) {
    return ordered.slice(0, 1);
  }

  // Workers AI is an optional final fallback and requires a real binding.
  if (env?.AI && typeof env.AI.run === 'function' && !ordered.includes('cloudflare-workers-ai')) {
    ordered.push('cloudflare-workers-ai');
  }
  return ordered;
}

function summarizeProviderFailure(error) {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '');
  const statusValue = Number(error?.status);
  const match = message.match(/\bHTTP\s+(\d{3})\b/i);
  const parsedStatus = match ? Number(match[1]) : NaN;
  const status = Number.isInteger(statusValue) && statusValue >= 400 && statusValue <= 599
    ? statusValue
    : Number.isInteger(parsedStatus) && parsedStatus >= 400 && parsedStatus <= 599 ? parsedStatus : null;
  let kind = 'provider-error';
  if (code === 'AI_PROVIDER_NOT_CONFIGURED' || /not configured|missing server secret|binding is not configured/i.test(message)) kind = 'not-configured';
  else if (code === 'AI_PROVIDER_TIMEOUT' || error?.name === 'AbortError' || error?.name === 'TimeoutError' || status === 408 || status === 504) kind = 'timeout';
  else if (code === 'AI_PROVIDER_EMPTY_RESPONSE' || /returned an empty response/i.test(message)) kind = 'empty-response';
  else if (code === 'AI_INVALID_JSON' || /invalid structured json/i.test(message)) kind = 'invalid-response';
  else if (code === 'AI_PROVIDER_BILLING_REQUIRED' || status === 402) kind = 'payment-or-billing-required';
  else if (code === 'AI_PROVIDER_PLAN_REQUIRED') kind = 'plan-required';
  else if (code === 'AI_PROVIDER_AUTH_FAILED' || status === 401 || /invalid api key|unauthorized|authentication failed/i.test(message)) kind = 'authentication-rejected';
  else if (code === 'AI_PROVIDER_PERMISSION_DENIED' || status === 403 || /permission denied|access denied|not authorized/i.test(message)) kind = 'permission-denied';
  else if (code === 'AI_PROVIDER_UNSUPPORTED' || status === 404 || /model .* not found|model not found|endpoint not found|no such model/i.test(message)) kind = 'model-or-endpoint-not-found';
  else if (code === 'AI_PROVIDER_RATE_LIMITED' || status === 429 || /quota|rate.?limit|resource exhausted/i.test(message)) kind = 'rate-limited-or-quota';
  else if (status !== null && status >= 500) kind = 'provider-server-error';
  else if (status !== null && status >= 400) kind = 'request-rejected';
  else if (code === 'AI_PROVIDER_NETWORK_ERROR' || error?.name === 'TypeError') kind = 'network-error';
  return { kind, status };
}

export async function callModel(
  env,
  options = {}
) {
  const requestedRaw = String(options.provider || 'automatic').trim();
  const requested = requestedRaw.toLowerCase();

  // Production routing is fail-closed. In free-only mode, ignore browser-supplied
  // provider/model selections and route exclusively through the guarded CF engine.
  if (isCloudflareFreeOnlyMode(env)) {
    if (options.webStudioRequest === true && options.useUniversalConnectionAfterCloudflareLimit === true) {
      if (!options.authUser) throw Object.assign(new Error('Sign in before using your Universal Connection.'), { status: 401, code: 'AUTH_REQUIRED' });
      if (!(await isCloudflareFreeAllowanceExhausted(env))) {
        const result = await callCloudflareWorkersAI(env, {
          ...options,
          model: OVYX_CLOUDFLARE_FREE_MODEL,
          authUser: options.authUser,
        });
        return { ...result, requestedProvider: 'cloudflare-workers-ai', routedProvider: 'cloudflare-workers-ai' };
      }
      let connectionId = null;
      try {
        connectionId = await withTimeout(getActiveBrainConnectionId(env, options.authUser), UNIVERSAL_LOOKUP_TIMEOUT_MS, 'Universal Connection lookup');
      } catch {
        throw Object.assign(new Error('OVYX could not verify your selected Universal Connection. Open Settings & connections and retry.'), { status: 503, code: 'OVYX_WEBSTUDIO_UNIVERSAL_CONNECTION_NOT_READY' });
      }
      if (!connectionId) {
        throw Object.assign(new Error('No active Universal Connection AI Brain is selected. Open Settings & connections, add your own provider key, test it, and select “Use for AI requests”.'), { status: 409, code: 'OVYX_WEBSTUDIO_UNIVERSAL_CONNECTION_NOT_READY' });
      }
      const result = await withTimeout(
        callUserUniversalConnection(env, {
          connectionId,
          authUser: options.authUser,
          system: options.system,
          user: options.user,
          model: options.model,
          maxTokens: options.maxTokens,
          requireAIProtocol: true,
        }),
        PROVIDER_REQUEST_TIMEOUT_MS,
        'Your Universal Connection'
      );
      return { ...result, requestedProvider: 'universal-connection', routedProvider: 'universal-connection', webStudioUserConnectionFallback: true };
    }
    const result = await callCloudflareWorkersAI(env, {
      ...options,
      model: OVYX_CLOUDFLARE_FREE_MODEL,
      authUser: options.authUser || null,
    });
    return { ...result, requestedProvider: 'cloudflare-workers-ai', routedProvider: 'cloudflare-workers-ai' };
  }
  if (!isLegacyProviderRoutingEnabled(env)) {
    throw Object.assign(new Error('OVYX AI engine mode is not configured. No AI provider was called.'), {
      status: 503, code: 'OVYX_AI_ENGINE_MODE_NOT_CONFIGURED',
    });
  }

  // An account-selected Universal Connection is exclusive. Never silently bill a
  // platform provider after a user's own connection failed or could not be verified.
  const errors = [];
  const providerAttempts = [];
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

  let globalOrder = null;
  if (requested === 'automatic') {
    try {
      globalOrder = await readGlobalProviderOrder(env);
    } catch {
      /* The routing preference is not an access-control secret. Preserve AI availability by using the existing server/env fallback if Firestore is temporarily unavailable. */
      globalOrder = null;
    }
  }
  const availableProviders = providerOrder(
    env,
    requested,
    String(options.taskPrompt || options.user || ''),
    globalOrder,
    options.preferredProvider,
    options.providerRouting,
    options.fallback
  );
  if (requested === 'automatic' && availableProviders.length === 0) {
    throw Object.assign(
      new Error('No AI option is available right now. Try again later or choose another available AI option.'),
      { status: 503, code: 'AI_PROVIDER_NOT_CONFIGURED' }
    );
  }

  for (const provider of availableProviders) {
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
            'openrouter'
          ? await callOpenRouter(
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
              prepareWorkersAiRequest({
                ...options,
                model,
              })
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
      const summary = summarizeProviderFailure(err);
      providerAttempts.push({
        provider,
        kind: summary.kind,
        ...(summary.status === null ? {} : { status: summary.status }),
      });
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
      openrouter: 'OpenRouter',
      'cloudflare-workers-ai': 'Cloudflare Workers AI',
    };
    const providerLabel = labels[requested] || requested.replace(/[-_]+/g, ' ').replace(/^./, letter => letter.toUpperCase());
    const notConfigured = errors.some(item => /not configured|missing server secret|binding is not configured/i.test(item));
    throw Object.assign(
      new Error(providerLabel + ' is not available right now. Try OVYX Auto or choose another available AI option.'),
      {
        status: 503,
        code: notConfigured ? 'AI_PROVIDER_NOT_CONFIGURED' : 'AI_PROVIDER_UNAVAILABLE',
        provider: normalizeRequestedProvider(requested, env),
        providerAttempts,
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
        providerAttempts,
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
