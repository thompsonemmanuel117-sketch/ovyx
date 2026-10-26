import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { createFirestoreDocumentIfAbsent, setFirestoreDocumentIfCurrent } from '../functions/_lib/firebase-admin.js';
import { runCloudflareFreeInference } from '../functions/_lib/cloudflare-free-ai.js';
import { callModel } from '../functions/_lib/providers.js';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, publicExponent: 0x10001 });
const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
const today = new Date().toISOString().slice(0, 10);
const env = {
  FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
    client_email: 'ovyx-budget-ledger-test@example.invalid',
    // Mirror the JSON-escaped private-key representation that /api/health accepts.
    private_key: privateKeyPem.replace(/\n/g, '\\n'),
    project_id: 'ovyx-budget-ledger-test',
  }),
  OVYX_AI_ENGINE_MODE: 'cloudflare-free-only',
};
const LEDGER_ID = 'ovyx-workers-ai-budget';
const documents = new Map();
let modelCalls = 0;
let lastAIOptions = null;
let responseShape = 'legacy-response';
let createCalls = 0;
let ledgerReadFailuresRemaining = 1;
let conflictWritesRemaining = 3;
let conditionalWriteFailureStatus = null;
let exhaustionConflictWritesRemaining = 0;
let oauthFailuresRemaining = 1;
let oauthCalls = 0;
const originalFetch = globalThis.fetch;

function firestoreInt(value) { return { integerValue: String(value) }; }
function firestoreString(value) { return { stringValue: String(value) }; }
function documentKey(path) { return path.split('/').filter(Boolean).slice(-2).join('/'); }
function getDoc(urlPath) {
  const match = urlPath.match(/\/documents\/(system)\/([^/]+)$/);
  return match ? documents.get(match[1] + '/' + decodeURIComponent(match[2])) : null;
}
function makeFirestoreDocument(key, stored) {
  return {
    name: 'projects/ovyx-budget-ledger-test/databases/(default)/documents/' + key,
    fields: stored.fields,
    updateTime: 'v' + stored.version,
  };
}
const legacyKey = 'system/config';
const legacyFields = {
  tokenQuotas: { mapValue: { fields: { free: firestoreInt(50000), pro: firestoreInt(500000) } } },
  _ovyxWorkersAiDayUtc: firestoreString(today),
  _ovyxWorkersAiConsumedNeurons: firestoreInt(42),
  _ovyxWorkersAiReservedNeurons: firestoreInt(0),
  _ovyxWorkersAiRequestCount: firestoreInt(7),
  unrelatedExistingSetting: firestoreString('preserve-this-existing-config'),
};
documents.set(legacyKey, { fields: structuredClone(legacyFields), version: 1 });

env.AI = {
  run: async (_model, options) => {
    modelCalls += 1;
    lastAIOptions = options;
    if (responseShape === 'quota-exhausted') {
      // Simulate Cloudflare's account-level free allocation rejection. The
      // production error path must persist a shared stop marker even when
      // other requests are updating the same Firestore ledger concurrently.
      exhaustionConflictWritesRemaining = 18;
      throw Object.assign(
        new Error('Cloudflare has used up your daily free allocation of 10,000 neurons.'),
        { status: 429, code: 'CLOUDFLARE_AI_QUOTA_EXHAUSTED' },
      );
    }
    if (responseShape === 'reasoning-only') {
      return {
        choices: [{ message: { role: 'assistant', content: null, reasoning_content: 'private reasoning text must not leak' } }],
        usage: { prompt_tokens: 1, completion_tokens: 64, total_tokens: 65 },
      };
    }
    if (responseShape === 'nested-chat-completion') {
      return {
        result: { choices: [{ message: { role: 'assistant', content: 'OVYX_NESTED_CHOICES_READY' } }] },
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      };
    }
    if (responseShape === 'chat-completion') {
      return {
        choices: [{ message: { role: 'assistant', content: 'OVYX_CHOICES_READY' } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      };
    }
    return { response: 'OVYX_PROVIDER_READY', usage: { input_tokens: 1, output_tokens: 1 } };
  },
};

function okJson(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

try {
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));

    if (url.origin === 'https://oauth2.googleapis.com' && url.pathname === '/token') {
      oauthCalls += 1;
      if (oauthFailuresRemaining > 0) {
        oauthFailuresRemaining -= 1;
        return okJson({ error: { error: 'temporarily_unavailable' } }, 503);
      }
      return okJson({ access_token: 'test-only-fake-access-token', expires_in: 3600 });
    }

    assert.equal(url.origin, 'https://firestore.googleapis.com');
    assert.match(url.pathname, /\/projects\/ovyx-budget-ledger-test\/databases\/\(default\)\/documents/);

    if (init.method === 'GET' && /\/documents\/system\/[^/]+$/.test(url.pathname)) {
      const key = documentKey(url.pathname);
      if (key === 'system/' + LEDGER_ID && ledgerReadFailuresRemaining > 0) {
        ledgerReadFailuresRemaining -= 1;
        return okJson({ error: { status: 'UNAVAILABLE' } }, 503);
      }
      const stored = getDoc(url.pathname);
      return stored ? okJson(makeFirestoreDocument(key, stored)) : new Response(null, { status: 404 });
    }

    if (init.method === 'POST' && url.pathname.endsWith('/documents/system') && url.searchParams.has('documentId')) {
      const id = String(url.searchParams.get('documentId'));
      const key = 'system/' + id;
      createCalls += 1;
      if (documents.has(key)) return okJson({ error: { status: 'ALREADY_EXISTS' } }, 409);
      const stored = { fields: JSON.parse(init.body).fields || {}, version: 1 };
      documents.set(key, stored);
      return okJson(makeFirestoreDocument(key, stored));
    }

    if (init.method === 'PATCH' && /\/documents\/system\/[^/]+$/.test(url.pathname)) {
      const key = documentKey(url.pathname);
      const stored = documents.get(key);
      if (key === 'system/' + LEDGER_ID && conditionalWriteFailureStatus !== null) {
        const status = conditionalWriteFailureStatus;
        conditionalWriteFailureStatus = null;
        return okJson({ error: { status: 'PERMISSION_DENIED' } }, status);
      }
      if (!stored || url.searchParams.get('currentDocument.updateTime') !== 'v' + stored.version) {
        return okJson({ error: { status: 'ABORTED' } }, 409);
      }
      const patch = JSON.parse(init.body).fields || {};
      if (key === 'system/' + LEDGER_ID &&
          Object.prototype.hasOwnProperty.call(patch, '_ovyxWorkersAiCloudflareExhaustedDayUtc') &&
          exhaustionConflictWritesRemaining > 0) {
        exhaustionConflictWritesRemaining -= 1;
        stored.version += 1; // Simulate competing owners of the exhausted-day marker.
        return okJson({ error: { status: 'ABORTED' } }, 409);
      }
      if (key === 'system/' + LEDGER_ID && conflictWritesRemaining > 0) {
        conflictWritesRemaining -= 1;
        stored.version += 1; // Simulate another ledger-only writer, without touching system/config.
        return okJson({ error: { status: 'ABORTED' } }, 409);
      }
      for (const fieldPath of url.searchParams.getAll('updateMask.fieldPaths')) {
        if (Object.prototype.hasOwnProperty.call(patch, fieldPath)) stored.fields[fieldPath] = patch[fieldPath];
        else delete stored.fields[fieldPath];
      }
      stored.version += 1;
      return okJson(makeFirestoreDocument(key, stored));
    }

    throw new Error('Unexpected mocked request: ' + init.method + ' ' + url.pathname);
  };

  const result = await runCloudflareFreeInference(env, {
    messages: [{ role: 'user', content: 'Reply with exactly OVYX_PROVIDER_READY.' }],
    maxTokens: 32,
    timeoutMs: 2000,
    disableThinking: true,
  });

  assert.equal(result.model, '@cf/meta/llama-3.1-8b-instruct-fp8-fast');
  assert.equal(result.result.response, 'OVYX_PROVIDER_READY');
  assert.equal(lastAIOptions.max_tokens, 32, 'the non-reasoning readiness call should stay inexpensive and bounded');
  assert.equal(lastAIOptions.chat_template_kwargs, undefined, 'do not pass Qwen-specific parameters to the selected non-reasoning model');
  assert.equal(lastAIOptions.reasoning_effort, undefined, 'do not pass model-specific reasoning fields to the selected non-reasoning model');
  assert.equal(lastAIOptions.temperature, 0, 'the bounded readiness probe should be deterministic');
  assert.equal(modelCalls, 1, 'a single successful guarded model inference should run after reservation');

  const ledgerKey = 'system/' + LEDGER_ID;
  const ledger = documents.get(ledgerKey);
  assert.ok(ledger, 'the dedicated usage ledger should be created atomically');
  assert.equal(ledgerReadFailuresRemaining, 0, 'a transient ledger read failure should be retried safely');
  assert.equal(oauthFailuresRemaining, 0, 'a transient Google OAuth token failure should be retried safely');
  assert.ok(oauthCalls >= 2, 'the OAuth regression must prove a retry after the first HTTP 503');
  assert.equal(conflictWritesRemaining, 0, 'concurrent ledger update conflicts should be retried with bounded backoff');
  assert.equal(ledger.fields._ovyxWorkersAiDayUtc.stringValue, today);
  assert.equal(Number(ledger.fields._ovyxWorkersAiConsumedNeurons.integerValue) > 42, true,
    'the new ledger should preserve the previous same-day usage before adding current inference');
  assert.equal(ledger.fields._ovyxWorkersAiReservedNeurons.integerValue, '0');
  assert.equal(ledger.fields._ovyxWorkersAiRequestCount.integerValue, '8',
    'the migration should carry forward the existing same-day request count');
  assert.equal(createCalls, 1, 'the dedicated ledger should only be initialized once');
  assert.deepEqual(documents.get(legacyKey).fields, legacyFields,
    'migration and AI accounting must not mutate shared system/config or its existing quota settings');

  // Exercise model response shapes through the production provider router.
  responseShape = 'chat-completion';
  const chatResult = await callModel(env, {
    provider: 'automatic',
    system: 'Reply with exactly OVYX_CHOICES_READY.',
    user: 'Reply with exactly OVYX_CHOICES_READY.',
    maxTokens: 8,
  });
  assert.equal(chatResult.text, 'OVYX_CHOICES_READY');
  assert.equal(chatResult.provider, 'cloudflare-workers-ai');
  assert.equal(modelCalls, 2, 'top-level chat-completion output should be consumed');

  responseShape = 'nested-chat-completion';
  const nestedChatResult = await callModel(env, {
    provider: 'automatic',
    system: 'Reply with exactly OVYX_NESTED_CHOICES_READY.',
    user: 'Reply with exactly OVYX_NESTED_CHOICES_READY.',
    maxTokens: 8,
  });
  assert.equal(nestedChatResult.text, 'OVYX_NESTED_CHOICES_READY');
  assert.equal(nestedChatResult.provider, 'cloudflare-workers-ai');
  assert.equal(modelCalls, 3, 'nested chat-completion output should be consumed');

  // A full site build can launch more simultaneous model batches than the
  // original short retry window tolerated. Simulate 18 concurrent ledger CAS
  // conflicts and prove a later bounded retry can reserve without bypassing
  // the shared budget or touching system/config.
  conflictWritesRemaining = 18;
  responseShape = 'legacy-response';
  const contendedResult = await callModel(env, {
    provider: 'automatic',
    system: 'Reply with exactly OVYX_PROVIDER_READY.',
    user: 'Reply with exactly OVYX_PROVIDER_READY.',
    maxTokens: 8,
  });
  assert.equal(contendedResult.text, 'OVYX_PROVIDER_READY');
  assert.equal(contendedResult.provider, 'cloudflare-workers-ai');
  assert.equal(conflictWritesRemaining, 0, 'the budget reservation should recover from 18 bounded conditional-write conflicts');
  assert.equal(modelCalls, 4, 'the model should run once after the shared reservation succeeds');
  assert.deepEqual(documents.get(legacyKey).fields, legacyFields,
    'contention retries must leave shared OVYX configuration unchanged');

  responseShape = 'reasoning-only';
  const beforeReasoningUsage = {
    consumed: Number(ledger.fields._ovyxWorkersAiConsumedNeurons.integerValue),
    reserved: Number(ledger.fields._ovyxWorkersAiReservedNeurons.integerValue),
  };
  await assert.rejects(
    () => runCloudflareFreeInference(env, {
      messages: [{ role: 'user', content: 'Reply with exactly OVYX_PROVIDER_READY.' }],
      maxTokens: 32,
      timeoutMs: 2000,
      disableThinking: true,
    }),
    error => error?.code === 'OVYX_AI_CLOUDFLARE_REASONING_ONLY',
  );
  assert.equal(
    Number(ledger.fields._ovyxWorkersAiReservedNeurons.integerValue),
    beforeReasoningUsage.reserved,
    'an unusable model response must release its reservation rather than draining future requests',
  );
  assert.ok(
    Number(ledger.fields._ovyxWorkersAiConsumedNeurons.integerValue) > beforeReasoningUsage.consumed,
    'an unusable response with reported token usage must still account for incurred inference',
  );

  // Paid-capped mode is opt-in and may reopen a same-day stop created only by
  // OVYX's old free-mode guard when a larger explicit budget is configured.
  env.OVYX_AI_ENGINE_MODE = 'cloudflare-paid-capped';
  const previousBudget = env.OVYX_WORKERS_AI_DAILY_NEURON_BUDGET;
  delete env.OVYX_WORKERS_AI_DAILY_NEURON_BUDGET;
  const callsBeforeMissingBudget = modelCalls;
  await assert.rejects(
    () => runCloudflareFreeInference(env, {
      messages: [{ role: 'user', content: 'Do not dispatch without a budget.' }],
      maxTokens: 32,
      timeoutMs: 2000,
    }),
    error => error?.code === 'OVYX_AI_PAID_BUDGET_NOT_CONFIGURED',
  );
  assert.equal(modelCalls, callsBeforeMissingBudget, 'paid-capped mode must not call a model until an explicit daily cap is set');
  env.OVYX_WORKERS_AI_DAILY_NEURON_BUDGET = '12000';
  ledger.fields._ovyxWorkersAiCloudflareExhaustedDayUtc = firestoreString(today);
  ledger.fields._ovyxWorkersAiCloudflareExhaustionReason = firestoreString('ovyx-safety-budget');
  ledger.version += 1;
  responseShape = 'legacy-response';
  const paidCappedResult = await runCloudflareFreeInference(env, {
    messages: [{ role: 'user', content: 'Reply with exactly OVYX_PROVIDER_READY.' }],
    maxTokens: 32,
    timeoutMs: 2000,
    disableThinking: true,
  });
  assert.equal(paidCappedResult.text, 'OVYX_PROVIDER_READY');
  assert.equal(paidCappedResult.dailyBudgetNeurons, 12000);
  assert.equal(paidCappedResult.budgetMode, 'paid-capped');
  assert.equal(modelCalls, callsBeforeMissingBudget + 1, 'paid-capped mode should make one guarded Cloudflare request under the explicit cap');
  env.OVYX_AI_ENGINE_MODE = 'cloudflare-free-only';
  if (previousBudget === undefined) delete env.OVYX_WORKERS_AI_DAILY_NEURON_BUDGET;
  else env.OVYX_WORKERS_AI_DAILY_NEURON_BUDGET = previousBudget;

  // Reproduce the production case: Cloudflare rejects a site-generation call
  // with its daily free allocation message while concurrent calls collide on
  // recording the one-per-day stop marker. The quota response must stay truthful
  // and the marker must eventually persist after bounded jittered retries.
  const savedLedgerFields = structuredClone(ledger.fields);
  const savedLedgerVersion = ledger.version;
  delete ledger.fields._ovyxWorkersAiCloudflareExhaustedDayUtc;
  delete ledger.fields._ovyxWorkersAiCloudflareExhaustionReason;
  delete ledger.fields._ovyxWorkersAiCloudflareExhaustedAt;
  ledger.version += 1;
  responseShape = 'quota-exhausted';
  await assert.rejects(
    () => runCloudflareFreeInference(env, {
      messages: [{ role: 'user', content: 'This request simulates a Cloudflare free-allocation rejection.' }],
      maxTokens: 32,
      timeoutMs: 2000,
      disableThinking: true,
    }),
    error => error?.code === 'OVYX_AI_CLOUDFLARE_QUOTA_EXHAUSTED',
    'the quota error must not be replaced by a generic budget-ledger unavailable response when recording the stop succeeds',
  );
  assert.equal(exhaustionConflictWritesRemaining, 0, 'the exhausted-day marker writer must recover from 18 bounded conditional-write conflicts');
  assert.equal(ledger.fields._ovyxWorkersAiCloudflareExhaustedDayUtc.stringValue, today);
  assert.equal(ledger.fields._ovyxWorkersAiCloudflareExhaustionReason.stringValue, 'cloudflare-daily-free-allocation');
  ledger.fields = savedLedgerFields;
  ledger.version = savedLedgerVersion;
  responseShape = 'legacy-response';

  await assert.rejects(
    () => createFirestoreDocumentIfAbsent(env, 'system', LEDGER_ID, {
      _ovyxWorkersAiDayUtc: today,
      _ovyxWorkersAiConsumedNeurons: 0,
      _ovyxWorkersAiReservedNeurons: 0,
      _ovyxWorkersAiRequestCount: 0,
    }),
    error => error?.code === 'FIRESTORE_DOCUMENT_ALREADY_EXISTS' && error?.status === 409,
  );
  assert.equal(createCalls, 2);

  conditionalWriteFailureStatus = 403;
  const beforeDeniedWrite = structuredClone(ledger.fields);
  await assert.rejects(
    () => setFirestoreDocumentIfCurrent(env, 'system', LEDGER_ID, { _ovyxLedgerTestField: 'not-written' }, 'v' + ledger.version),
    error => error?.code === 'FIRESTORE_CONDITIONAL_WRITE_FAILED' && error?.status === 403,
    'Firestore permission failures must preserve their safe HTTP status instead of looking retryable',
  );
  assert.deepEqual(ledger.fields, beforeDeniedWrite, 'a denied ledger write must not mutate the dedicated ledger fields');
  console.log('OVYX Cloudflare AI isolated budget-ledger initialization test passed.');
} finally {
  globalThis.fetch = originalFetch;
}
