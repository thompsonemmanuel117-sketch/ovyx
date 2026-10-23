import assert from 'node:assert/strict';
import { callModel, providerOrder } from '../functions/_lib/providers.js';

assert.deepEqual(
  providerOrder({ OVYX_AI_PROVIDER_ORDER: 'gemini,deepseek,claude,openai' }, 'gemini'),
  ['gemini'],
  'An explicitly selected provider must stay exclusive.',
);
assert.deepEqual(
  providerOrder({ OVYX_AI_PROVIDER_ORDER: 'gemini,deepseek,claude,openai' }, 'deepseek'),
  ['deepseek'],
  'An explicit DeepSeek choice must not be rerouted.',
);

assert.deepEqual(providerOrder({}, 'automatic'), [], 'Automatic must skip every provider when no real key or Workers AI binding exists.');
assert.deepEqual(
  providerOrder({ OPENROUTER_API_KEY: 'only-openrouter' }, 'automatic'),
  ['openrouter'],
  'Automatic must recognize the configured OpenRouter key as a real provider.',
);
assert.deepEqual(
  providerOrder({ DEEPSEEK_API_KEY: 'only-deepseek', OVYX_AI_PROVIDER_ORDER: 'gemini,deepseek,claude,openai' }, 'automatic'),
  ['deepseek'],
  'Automatic must skip unconfigured providers rather than making doomed calls first.',
);
assert.deepEqual(
  providerOrder({ GEMINI_API_KEY: 'test-gemini', DEEPSEEK_API_KEY: 'test-deepseek', OVYX_AI_PROVIDER_ORDER: 'gemini,deepseek' }, 'automatic'),
  ['gemini', 'deepseek'],
  'Automatic may use the configured order.',
);

assert.deepEqual(
  providerOrder(
    { GEMINI_API_KEY: 'g', DEEPSEEK_API_KEY: 'd', ANTHROPIC_API_KEY: 'c', OPENAI_API_KEY: 'o', OVYX_AI_PROVIDER_ORDER: 'gemini,deepseek,claude,openai' },
    'automatic',
    'Design a responsive website landing page with a polished visual layout',
  ),
  ['gemini', 'claude', 'openai', 'deepseek'],
  'Automatic should prioritize a configured provider suited to visual web design.',
);
assert.deepEqual(
  providerOrder(
    { GEMINI_API_KEY: 'g', DEEPSEEK_API_KEY: 'd', ANTHROPIC_API_KEY: 'c', OPENAI_API_KEY: 'o', OVYX_AI_PROVIDER_ORDER: 'gemini,deepseek,claude,openai' },
    'automatic',
    'Fix a backend API bug involving security and architecture, then add regression tests',
  ),
  ['claude', 'openai', 'deepseek', 'gemini'],
  'Automatic should prioritize stronger engineering providers for complex backend work.',
);
assert.deepEqual(
  providerOrder(
    { GEMINI_API_KEY: 'g', DEEPSEEK_API_KEY: 'd', ANTHROPIC_API_KEY: 'c', OPENAI_API_KEY: 'o', OVYX_AI_PROVIDER_ORDER: 'gemini,deepseek,claude,openai' },
    'automatic',
    'Summarize this paragraph in two sentences',
  ),
  ['gemini', 'deepseek', 'openai', 'claude'],
  'Automatic should apply the configured task preferences for writing tasks.',
);
assert.deepEqual(
  providerOrder(
    { OVYX_AI_PROVIDER_ORDER: 'gemini,deepseek,claude,openai' },
    'openai',
    'Design a website and debug the backend',
  ),
  ['openai'],
  'Automatic task preferences must never override an explicit provider choice.',
);

assert.deepEqual(
  providerOrder(
    { GEMINI_API_KEY: 'g', DEEPSEEK_API_KEY: 'd', OPENAI_API_KEY: 'o' },
    'automatic',
    'Design a responsive website',
    ['deepseek', 'gemini'],
    'openai',
    'preferred-first'
  ),
  ['openai', 'deepseek', 'gemini'],
  'Preferred-first routing must try a configured personal preference before global provider order.'
);
assert.deepEqual(
  providerOrder(
    { GEMINI_API_KEY: 'g', DEEPSEEK_API_KEY: 'd', OPENAI_API_KEY: 'o' },
    'automatic',
    'Design a responsive website',
    ['deepseek', 'gemini'],
    'openai',
    'automatic'
  ),
  ['deepseek', 'gemini', 'openai'],
  'Automatic routing must keep the global provider order first and use the preferred provider as a fallback.'
);
assert.deepEqual(
  providerOrder(
    { GEMINI_API_KEY: 'g', DEEPSEEK_API_KEY: 'd', OPENAI_API_KEY: 'o' },
    'automatic',
    'Design a responsive website',
    ['deepseek', 'gemini'],
    'openai',
    'provider-priority'
  ),
  ['deepseek', 'gemini', 'openai'],
  'Provider-priority routing must not promote a personal provider over the global owner order.'
);

const originalFetch = globalThis.fetch;
const requests = [];
let rejectGemini = false;
let geminiTransientStatuses = [];
globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  const headers = new Headers(init.headers || {});
  requests.push({
    url,
    authorization: headers.get('Authorization'),
    anthropicKey: headers.get('x-api-key'),
    geminiKey: headers.get('x-goog-api-key'),
    body: JSON.parse(String(init.body || '{}')),
  });

  if (url.includes('generativelanguage.googleapis.com')) {
    if (rejectGemini) {
      return new Response(JSON.stringify({ error: { message: 'test credential rejected' } }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (geminiTransientStatuses.length) {
      const status = geminiTransientStatuses.shift();
      return new Response(JSON.stringify({ error: { message: 'temporary test service failure' } }), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'Gemini test passed' }] } }],
      usageMetadata: { promptTokenCount: 2, candidatesTokenCount: 2 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (url.includes('api.anthropic.com')) {
    return new Response(JSON.stringify({
      content: [{ type: 'text', text: 'Claude test passed' }],
      usage: { input_tokens: 2, output_tokens: 2 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (url.includes('api.openai.com')) {
    return new Response(JSON.stringify({
      output_text: 'OpenAI test passed',
      usage: { input_tokens: 2, output_tokens: 2 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (url.includes('api.deepseek.com')) {
    return new Response(JSON.stringify({
      choices: [{ message: { content: 'DeepSeek test passed' } }],
      usage: { prompt_tokens: 2, completion_tokens: 2 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (url.includes('openrouter.ai/api/v1/chat/completions')) {
    return new Response(JSON.stringify({
      model: 'openai/gpt-4o-mini',
      choices: [{ message: { content: 'OpenRouter test passed' } }],
      usage: { prompt_tokens: 2, completion_tokens: 2, total_tokens: 4 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  return new Response(JSON.stringify({ error: { message: 'Unexpected test URL' } }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  });
};

try {
  // Each provider calls only its own official endpoint and uses only its own key.
  let result = await callModel(
    { GEMINI_API_KEY: 'test-gemini-key' },
    { provider: 'gemini', model: 'gemini-2.5-flash', system: 'test', user: 'hello', maxTokens: 32 },
  );
  assert.equal(result.provider, 'gemini');
  assert.equal(result.text, 'Gemini test passed');
  assert.equal(requests.at(-1).geminiKey, 'test-gemini-key');
  assert.equal(requests.at(-1).url.includes('test-gemini-key'), false);

  // A transient Gemini 503 is retried once and recovers without switching providers.
  requests.length = 0;
  geminiTransientStatuses = [503];
  result = await callModel(
    { GEMINI_API_KEY: 'test-gemini-key' },
    { provider: 'gemini', model: 'gemini-3.8-flash', system: 'test', user: 'hello', maxTokens: 32 },
  );
  assert.equal(result.provider, 'gemini');
  assert.equal(result.text, 'Gemini test passed');
  assert.equal(requests.length, 2, 'one transient 503 should cause exactly one bounded retry');
  assert.ok(requests.every(item => item.url.includes('generativelanguage.googleapis.com')));
  assert.deepEqual(geminiTransientStatuses, []);

  // Repeated transient server errors stop after the bounded third attempt.
  requests.length = 0;
  geminiTransientStatuses = [503, 503, 503];
  await assert.rejects(
    () => callModel(
      { GEMINI_API_KEY: 'test-gemini-key' },
      { provider: 'gemini', model: 'gemini-3.8-flash', system: 'test', user: 'hello', maxTokens: 32 },
    ),
    error => {
      assert.equal(error.code, 'AI_PROVIDER_UNAVAILABLE');
      assert.deepEqual(error.providerAttempts, [{ provider: 'gemini', kind: 'provider-server-error', status: 503 }]);
      return true;
    },
  );
  assert.equal(requests.length, 3, 'transient retries must stop after three total attempts');
  geminiTransientStatuses = [];

  // Verify the current Gemini fallback when no model environment variable is set.
  result = await callModel(
    { GEMINI_API_KEY: 'test-gemini-key' },
    { provider: 'gemini', model: 'automatic', system: 'test', user: 'hello', maxTokens: 32 },
  );
  assert.equal(result.provider, 'gemini');
  assert.match(requests.at(-1).url, /models\/gemini-3\.8-flash:generateContent$/,
    'Gemini fallback must use the current stable model.');

  result = await callModel(
    { DEEPSEEK_API_KEY: 'test-deepseek-key' },
    { provider: 'deepseek', model: 'deepseek-flash', system: 'test', user: 'hello', maxTokens: 32 },
  );
  assert.equal(result.provider, 'deepseek');
  assert.equal(result.text, 'DeepSeek test passed');
  assert.equal(requests.at(-1).url, 'https://api.deepseek.com/chat/completions');
  assert.equal(requests.at(-1).authorization, 'Bearer test-deepseek-key');

  result = await callModel(
    { OPENROUTER_API_KEY: 'test-openrouter-key', OPENROUTER_MODEL: 'openai/gpt-4o-mini' },
    { provider: 'openrouter', model: 'automatic', system: 'test', user: 'hello', maxTokens: 32 },
  );
  assert.equal(result.provider, 'openrouter');
  assert.equal(result.text, 'OpenRouter test passed');
  assert.equal(requests.at(-1).url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(requests.at(-1).authorization, 'Bearer test-openrouter-key');
  assert.equal(requests.at(-1).url.includes('test-openrouter-key'), false);

  result = await callModel(
    { ANTHROPIC_API_KEY: 'test-anthropic-key' },
    { provider: 'anthropic', model: 'claude-sonnet-4-6', system: 'test', user: 'hello', maxTokens: 32 },
  );
  assert.equal(result.provider, 'claude');
  assert.equal(result.text, 'Claude test passed');
  assert.equal(requests.at(-1).url, 'https://api.anthropic.com/v1/messages');
  assert.equal(requests.at(-1).anthropicKey, 'test-anthropic-key');

  result = await callModel(
    { OPENAI_API_KEY: 'test-openai-key' },
    { provider: 'openai', model: 'automatic', system: 'test', user: 'hello', maxTokens: 32 },
  );
  assert.equal(result.provider, 'openai');
  assert.equal(result.text, 'OpenAI test passed');
  assert.equal(requests.at(-1).url, 'https://api.openai.com/v1/responses');
  assert.equal(requests.at(-1).authorization, 'Bearer test-openai-key');
  assert.equal(requests.at(-1).body.model, 'gpt-6.1-sol', 'OpenAI fallback must use the supported cost-balanced model.');

  requests.length = 0;
  await assert.rejects(
    () => callModel({}, { provider: 'automatic', model: 'automatic', system: 'test', user: 'Build a website', maxTokens: 32 }),
    error => {
      assert.equal(error.code, 'AI_PROVIDER_NOT_CONFIGURED');
      assert.match(error.message, /No AI option is available/i);
      assert.match(error.message, /choose another available AI option/i);
      return true;
    },
    'Automatic must report a helpful error before trying any unconfigured provider.',
  );
  assert.equal(requests.length, 0, 'Automatic with no configured provider must make no doomed network calls.');

  // Missing Gemini must not use another provider's key, even if one is available.
  requests.length = 0;
  await assert.rejects(
    () => callModel(
      { DEEPSEEK_API_KEY: 'test-deepseek-key', OVYX_AI_API_KEY: 'unused-shared-key', OVYX_AI_BASE_URL: 'https://api.groq.com/openai/v1' },
      { provider: 'gemini', model: 'gemini-2.5-flash', system: 'test', user: 'hello', maxTokens: 32 },
    ),
    error => {
      assert.equal(error.code, 'AI_PROVIDER_NOT_CONFIGURED');
      assert.match(error.message, /Gemini is not available right now/i);
      assert.match(error.message, /Try OVYX Auto/i);
      assert.match(error.message, /choose another available AI option/i);
      return true;
    },
  );
  assert.equal(requests.length, 0, 'Missing provider must stop without making a request or trying another key.');

  // A configured but rejected Gemini key must not fall back to a working DeepSeek key.
  requests.length = 0;
  rejectGemini = true;
  await assert.rejects(
    () => callModel(
      { GEMINI_API_KEY: 'test-invalid-gemini-key', DEEPSEEK_API_KEY: 'test-deepseek-key' },
      { provider: 'gemini', model: 'gemini-2.5-flash', system: 'test', user: 'hello', maxTokens: 32 },
    ),
    error => {
      assert.equal(error.code, 'AI_PROVIDER_UNAVAILABLE');
      assert.match(error.message, /Gemini is not available right now/i);
      return true;
    },
  );
  assert.equal(requests.length, 1, 'Rejected Gemini must not trigger a DeepSeek request.');
  assert.match(requests[0].url, /generativelanguage\.googleapis\.com/);
  rejectGemini = false;

  // Automatic is intentionally different: it can skip missing keys and use the next configured provider.
  requests.length = 0;
  result = await callModel(
    { DEEPSEEK_API_KEY: 'test-deepseek-key', OVYX_AI_PROVIDER_ORDER: 'gemini,deepseek' },
    { provider: 'automatic', model: 'automatic', system: 'test', user: 'hello', maxTokens: 32 },
  );
  assert.equal(result.provider, 'deepseek');
  assert.equal(result.text, 'DeepSeek test passed');
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /api\.deepseek\.com/);

  // Cloudflare Workers AI can be Automatic's final fallback when the binding exists.
  requests.length = 0;
  const workersAI = {
    run: async (model, payload) => ({ response: 'Cloudflare Workers AI test passed', usage: { prompt_tokens: 1, completion_tokens: 1 } }),
  };
  result = await callModel(
    { AI: workersAI, OVYX_AI_PROVIDER_ORDER: 'gemini,deepseek,claude,openai' },
    { provider: 'automatic', model: 'automatic', system: 'test', user: 'hello', maxTokens: 32 },
  );
  assert.equal(result.provider, 'cloudflare-workers-ai');
  assert.equal(result.text, 'Cloudflare Workers AI test passed');
  assert.equal(requests.length, 0, 'Workers AI binding should be called without a vendor HTTP key.');

  // Preserve a safe HTTP status from a failing Workers AI binding for diagnostics.
  const throttledWorkersAI = {
    run: async () => { throw Object.assign(new Error('private provider payload must not leak'), { status: 429 }); },
  };
  await assert.rejects(
    () => callModel(
      { AI: throttledWorkersAI },
      { provider: 'automatic', model: 'automatic', system: 'test', user: 'hello', maxTokens: 32 },
    ),
    error => {
      assert.equal(error.code, 'AI_PROVIDER_UNAVAILABLE');
      assert.deepEqual(error.providerAttempts, [
        { provider: 'cloudflare-workers-ai', kind: 'rate-limited-or-quota', status: 429 },
      ]);
      assert.equal(error.message.includes('private provider payload'), false);
      return true;
    },
    'Workers AI failures should expose only safe classification and status metadata',
  );

  // Workers AI SDK errors are reduced to allow-listed categories and status only.
  const workersAiFailureCases = [
    ['Payment required: account credits exhausted; secret=NEVER_PRINT', 'payment-or-billing-required', 402],
    ['Authentication failed: API key invalid; secret=NEVER_PRINT', 'authentication-rejected', 401],
    ['Invalid model name: model was not found; secret=NEVER_PRINT', 'model-or-endpoint-not-found', 404],
    ['Rate limit exceeded; secret=NEVER_PRINT', 'rate-limited-or-quota', 429],
    ['Service temporarily unavailable; secret=NEVER_PRINT', 'provider-server-error', 503],
  ];
  for (const [privateMessage, kind, status] of workersAiFailureCases) {
    await assert.rejects(
      () => callModel(
        { AI: { run: async () => { throw new Error(privateMessage); } } },
        { provider: 'automatic', model: 'automatic', system: 'test', user: 'hello', maxTokens: 32 },
      ),
      error => {
        assert.equal(error.code, 'AI_PROVIDER_UNAVAILABLE');
        assert.deepEqual(error.providerAttempts, [
          { provider: 'cloudflare-workers-ai', kind, status },
        ]);
        assert.equal(error.message.includes('NEVER_PRINT'), false);
        assert.equal(error.message.includes(privateMessage), false);
        return true;
      },
      'Workers AI failures must map to safe categories without disclosing provider messages',
    );
  }

  // Cover documented numeric Workers AI binding codes as well as readable messages.
  const workersAiInternalCodeCases = [
    [{ code: 5007, message: 'Workers AI internal failure' }, 'model-or-endpoint-not-found', 400],
    [{ code: 3042, message: 'Workers AI internal failure' }, 'model-or-endpoint-not-found', 404],
    [{ code: 5035, message: 'Workers AI internal failure' }, 'plan-required', 403],
    [{ code: 3036, message: 'Workers AI internal failure' }, 'rate-limited-or-quota', 429],
    [{ code: 3040, message: 'Workers AI internal failure' }, 'rate-limited-or-quota', 429],
    [{ message: 'Cloudflare Workers AI returned code 3007: unrelated private text' }, 'timeout', 408],
  ];
  for (const [privateError, kind, status] of workersAiInternalCodeCases) {
    await assert.rejects(
      () => callModel(
        { AI: { run: async () => { throw Object.assign(new Error('private error must not leak'), privateError); } } },
        { provider: 'automatic', model: 'automatic', system: 'test', user: 'hello', maxTokens: 32 },
      ),
      error => {
        assert.equal(error.code, 'AI_PROVIDER_UNAVAILABLE');
        assert.deepEqual(error.providerAttempts, [
          { provider: 'cloudflare-workers-ai', kind, status },
        ]);
        assert.equal(error.message.includes('private error must not leak'), false);
        assert.equal(error.message.includes('unrelated private text'), false);
        return true;
      },
      'documented Workers AI internal codes must map to safe diagnostic categories',
    );
  }

  // Cloudflare SDK/runtime wrappers may nest documented status/codes.
  const nestedWorkersAiFailureCases = [
    [{ code: 'WRAPPER_ERROR', response: { data: { errors: [{ code: 5035, message: 'Workers AI model requires a paid plan' }] } } }, 'plan-required', 403],
    [{ response: { status: 503, data: { errors: [{ code: 3036, message: 'Daily free allocation has been used' }] } } }, 'rate-limited-or-quota', 429],
    [{ cause: { errors: [{ code: 5007, message: 'No such model' }] } }, 'model-or-endpoint-not-found', 400],
    [{ response: { status: 408, statusText: 'Request timed out' } }, 'timeout', 408],
  ];
  for (const [privateError, kind, status] of nestedWorkersAiFailureCases) {
    await assert.rejects(
      () => callModel(
        { AI: { run: async () => { throw Object.assign(new Error('wrapper error; SECRET_NEVER_LEAK'), privateError); } } },
        { provider: 'automatic', model: 'automatic', system: 'test', user: 'hello', maxTokens: 32 },
      ),
      error => {
        assert.equal(error.code, 'AI_PROVIDER_UNAVAILABLE');
        assert.deepEqual(error.providerAttempts, [
          { provider: 'cloudflare-workers-ai', kind, status },
        ]);
        assert.equal(error.message.includes('SECRET_NEVER_LEAK'), false);
        assert.equal(error.message.includes('paid plan'), false);
        return true;
      },
      'nested Workers AI error structures must map to safe categories without exposing raw data',
    );
  }

  // A stuck Workers AI binding must fail within its configured server-side budget,
  // not hold the entire live generation request until the edge closes the socket.
  await assert.rejects(
    () => callModel(
      { AI: { run: async () => new Promise(() => {}) }, OVYX_WORKERS_AI_TIMEOUT_MS: '100' },
      { provider: 'automatic', model: 'automatic', system: 'test', user: 'hello', maxTokens: 32 },
    ),
    error => {
      assert.equal(error.code, 'AI_PROVIDER_UNAVAILABLE');
      assert.deepEqual(error.providerAttempts, [
        { provider: 'cloudflare-workers-ai', kind: 'timeout', status: 504 },
      ]);
      assert.equal(error.message.includes('DO_NOT_LEAK'), false);
      return true;
    },
    'Workers AI hanging calls should time out and expose only a safe timeout category',
  );
} finally {
  globalThis.fetch = originalFetch;
}

console.log('Provider-specific routing tests passed.');
