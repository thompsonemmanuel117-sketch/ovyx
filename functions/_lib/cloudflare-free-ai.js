import { createFirestoreDocumentIfAbsent, getFirestoreDocument, firestoreDocumentToJs, setFirestoreDocumentIfCurrent } from './firebase-admin.js';

export const OVYX_CLOUDFLARE_FREE_MODEL = '@cf/meta/llama-3.1-8b-instruct-fp8-fast';
export const OVYX_CLOUDFLARE_FREE_MAX_OUTPUT_TOKENS = 4096;
export const OVYX_CLOUDFLARE_FREE_DEFAULT_DAILY_BUDGET = 7000;
export const OVYX_CLOUDFLARE_FREE_MAX_DAILY_BUDGET = 8000;
export const OVYX_CLOUDFLARE_PAID_MAX_DAILY_BUDGET = 15000;
export const OVYX_CLOUDFLARE_FREE_USER_REQUESTS_PER_MINUTE = 18;

const INPUT_NEURONS_PER_MILLION = 4119;
const OUTPUT_NEURONS_PER_MILLION = 34868;
const RATE_RETRIES = 6;
const BUDGET_RETRIES = 24;
const DAILY_BUDGET_LEDGER_ID = 'ovyx-workers-ai-budget';

function isRetryableBudgetError(error) {
  const status = Number(error?.status);
  return error?.code === 'FIRESTORE_PRECONDITION_FAILED' ||
    error?.code === 'FIRESTORE_DOCUMENT_ALREADY_EXISTS' ||
    // firebase-admin deliberately wraps a fetch/network exception in a stable
    // code so callers don't need to inspect raw transport errors. Treat this
    // specific read-transport failure as transient and retry within the same
    // bounded ledger loop; never initialize a new ledger or bypass its cap.
    error?.code === 'FIRESTORE_READ_TRANSPORT_FAILED' ||
    status === 409 || status === 412 ||
    [408, 425, 429, 500, 502, 503, 504].includes(status) ||
    error?.name === 'TypeError';
}

async function waitForBudgetRetry(attempt) {
  // Bounded exponential backoff with jitter gives concurrent website batches
  // time to finish updating the shared Firestore ledger without bypassing it.
  const ceilingMs = Math.min(750, 40 * (2 ** Math.min(attempt, 4)));
  // Use full jitter, not a nearly fixed delay. Concurrent website-generation
  // batches otherwise retry in lockstep and repeatedly collide on updateTime.
  const delayMs = Math.floor(Math.random() * (ceilingMs + 1));
  await new Promise(resolve => setTimeout(resolve, delayMs));
}

/*
 * Web Studio can dispatch several Cloudflare AI batches concurrently in one
 * Worker isolate. Serialize only the short budget-ledger/accounting operations
 * in this isolate so they do not all read and conditionally update the same
 * Firestore document at once. Model inference itself remains concurrent.
 *
 * This is not a distributed lock: other isolates still coordinate through
 * Firestore updateTime preconditions and the existing bounded retry loop.
 */
let budgetOperationTail = Promise.resolve();
async function withBudgetOperationLock(operation) {
  const previous = budgetOperationTail;
  let release;
  budgetOperationTail = new Promise(resolve => { release = resolve; });
  await previous;
  try {
    return await operation();
  } finally {
    release();
  }
}

function budgetLedgerUnavailable(error, message, phase = 'unknown') {
  const status = Number(error?.status);
  const safePhase = ['read', 'migration', 'initialize', 'stop', 'reservation'].includes(phase) ? phase : 'unknown';
  let code = 'OVYX_AI_BUDGET_LEDGER_UNAVAILABLE';
  if (status === 401) code = 'OVYX_AI_BUDGET_LEDGER_AUTH_FAILED';
  else if (status === 403) code = 'OVYX_AI_BUDGET_LEDGER_PERMISSION_DENIED';
  else if (status === 400) code = 'OVYX_AI_BUDGET_LEDGER_BAD_REQUEST';
  else if (status === 409 || status === 412 || error?.code === 'FIRESTORE_PRECONDITION_FAILED') {
    code = 'OVYX_AI_BUDGET_LEDGER_CONFLICT_EXHAUSTED';
  } else if (Number.isInteger(status) && status >= 400 && status <= 599) {
    // Preserve any otherwise-unclassified HTTP status (e.g. 404) in the safe
    // operation phase. Do not collapse an actionable Firestore response into
    // the generic ledger error, and never include the response body.
    code = 'OVYX_AI_BUDGET_LEDGER_' + safePhase.toUpperCase() + '_HTTP_' + status;
  } else if (error?.name === 'TypeError') {
    code = 'OVYX_AI_BUDGET_LEDGER_' + safePhase.toUpperCase() + '_NETWORK_ERROR';
  } else if (error?.code === 'FIRESTORE_READ_TRANSPORT_FAILED' &&
      ['dns', 'timeout', 'socket', 'tls', 'network-unreachable', 'invalid-url', 'network'].includes(String(error?.transportClass || ''))) {
    // The bucket is allow-listed by the Firestore helper; expose only a broad
    // class so live acceptance can distinguish DNS/TLS/socket/timeouts without
    // surfacing raw fetch messages, URLs, project ids, or credentials.
    code = 'OVYX_AI_BUDGET_LEDGER_' + safePhase.toUpperCase() + '_TRANSPORT_' +
      String(error.transportClass).replace(/[^a-z-]/g, '').toUpperCase().replace(/-/g, '_');
  } else {
    // Keep a small allowlist of known internal dependency codes. Never pass
    // arbitrary upstream message text into the public acceptance report.
    const safeCauseCodes = new Set([
      'GOOGLE_OAUTH_TOKEN_EXCHANGE_FAILED',
      'GOOGLE_OAUTH_ACCESS_TOKEN_MISSING',
      'GOOGLE_OAUTH_RESPONSE_INVALID',
      'FIREBASE_SERVICE_ACCOUNT_NOT_CONFIGURED',
      'FIREBASE_SERVICE_ACCOUNT_INVALID_JSON',
      'FIREBASE_SERVICE_ACCOUNT_MISSING_FIELDS',
      'FIREBASE_JWT_SIGNING_FAILED',
      'FIREBASE_ACCESS_TOKEN_ACQUISITION_FAILED',
      'FIRESTORE_READ_TRANSPORT_FAILED',
      'FIRESTORE_READ_INVALID_JSON',
      'FIRESTORE_READ_FAILED',
      'FIRESTORE_DOCUMENT_CREATE_FAILED',
      'FIRESTORE_CONDITIONAL_WRITE_FAILED',
      'FIRESTORE_PRECONDITION_REQUIRED',
      'FIRESTORE_DOCUMENT_ALREADY_EXISTS',
      'FIRESTORE_PRECONDITION_FAILED',
    ]);
    const cause = String(error?.code || '').toUpperCase();
    if (safeCauseCodes.has(cause)) {
      code = 'OVYX_AI_BUDGET_LEDGER_' + safePhase.toUpperCase() + '_CAUSE_' + cause;
    } else {
      const safeErrorNames = new Set([
        'ERROR', 'DATAERROR', 'OPERATIONERROR', 'INVALIDACCESSERROR',
        'NOTSUPPORTEDERROR', 'SYNTAXERROR', 'RANGEERROR', 'REFERENCEERROR',
        'DOMEXCEPTION', 'ABORTERROR', 'TIMEOUTERROR'
      ]);
      const name = String(error?.name || 'Error').toUpperCase();
      code = 'OVYX_AI_BUDGET_LEDGER_' + safePhase.toUpperCase() + '_ERROR_' +
        (safeErrorNames.has(name) ? name : 'UNKNOWN');
    }
  }
  // Log only the phase, safe error code/status and error class; never provider
  // output, OAuth assertions, credential values, or connection secrets.
  console.error('[OVYX AI BUDGET LEDGER]', JSON.stringify({
    phase: safePhase,
    status: Number.isInteger(status) && status >= 400 && status <= 599 ? status : null,
    code: String(error?.code || '').slice(0, 80),
    name: String(error?.name || 'Error').slice(0, 40),
  }));
  return fail(503, code, message);
}

function fail(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

export function isCloudflareFreeOnlyMode(env) {
  return String(env?.OVYX_AI_ENGINE_MODE || '').trim().toLowerCase() === 'cloudflare-free-only';
}

export function isCloudflarePaidCappedMode(env) {
  return String(env?.OVYX_AI_ENGINE_MODE || '').trim().toLowerCase() === 'cloudflare-paid-capped';
}

export function isCloudflareWorkersAIGuardedMode(env) {
  return isCloudflareFreeOnlyMode(env) || isCloudflarePaidCappedMode(env);
}

export function isLegacyProviderRoutingEnabled(env) {
  return String(env?.OVYX_AI_ENGINE_MODE || '').trim().toLowerCase() === 'legacy-provider-routing' &&
    String(env?.OVYX_ALLOW_PAID_PROVIDER_ROUTING || '').trim().toLowerCase() === 'true';
}

export function hasActivePaidAiEntitlement(entitlements, now = Date.now()) {
  if (entitlements?.role === 'ROOT_SUPERUSER' && entitlements?.bypass === true) return true;
  const tier = String(entitlements?.planTier || '').trim().toLowerCase();
  const state = String(entitlements?.planTierState || '').trim().toLowerCase();
  const value = entitlements?.expiresAt ?? entitlements?.accessExpiresAt;
  const numeric = Number(value);
  const expiry = Number.isFinite(numeric) && numeric > 0 ? numeric : (value ? Date.parse(String(value)) : NaN);
  return ['pro', 'max'].includes(tier) && state === 'active' &&
    entitlements?.accessActive === true && Number.isFinite(expiry) && expiry > now;
}

function truncatePreservingEdges(value, limit, headRatio = 0.68) {
  const text = String(value || '');
  if (text.length <= limit) return text;
  const marker = '\n[…context shortened to protect free AI capacity…]\n';
  const usable = Math.max(0, limit - marker.length);
  const head = Math.floor(usable * headRatio);
  return text.slice(0, head) + marker + text.slice(-(usable - head));
}

export function compactCloudflareFreeMessages(messages, limit = 28000) {
  const source = Array.isArray(messages)
    ? messages.filter(item => item && ['system', 'user', 'assistant'].includes(item.role) &&
        typeof item.content === 'string' && item.content.trim())
    : [];
  if (!source.length) return [];
  const systemIndex = source.findIndex(item => item.role === 'system');
  const systemText = systemIndex >= 0 ? source[systemIndex].content : '';
  const maxSystemChars = Math.min(14000, Math.floor(limit * 0.52));
  const boundedSystem = systemText ? truncatePreservingEdges(systemText, maxSystemChars) : '';
  let remaining = Math.max(0, limit - boundedSystem.length);
  const conversation = source.filter((_, index) => index !== systemIndex);
  const kept = [];
  for (let index = conversation.length - 1; index >= 0 && remaining > 0; index -= 1) {
    const item = conversation[index];
    const take = Math.min(remaining, item.role === 'user' ? 9000 : 2500);
    if (take <= 0) break;
    // Keep the task contract at the beginning and the relevant project/context
    // details at the end. Taking only the tail can discard required JSON schema,
    // target file allowlists, or the user's original instructions in long Web Studio
    // prompts, making a valid provider response unusable downstream.
    kept.push({
      role: item.role,
      content: truncatePreservingEdges(item.content, take, item.role === 'user' ? 0.62 : 0.68),
    });
    remaining -= take;
  }
  kept.reverse();
  return [...(boundedSystem ? [{ role: 'system', content: boundedSystem }] : []), ...kept];
}

function tokenCounts(rawUsage, messages, outputText = '') {
  const usage = rawUsage && typeof rawUsage === 'object' ? rawUsage : {};
  const pick = (...names) => {
    for (const name of names) {
      const candidate = Number(usage[name]);
      if (Number.isFinite(candidate) && candidate >= 0) return Math.ceil(candidate);
    }
    return null;
  };
  const chars = messages.reduce((sum, item) => sum + String(item.content || '').length, 0);
  return {
    input: Math.max(0, pick('prompt_tokens', 'input_tokens', 'promptTokenCount', 'inputTokenCount', 'inputTokens') ?? Math.ceil(chars / 2)),
    output: Math.max(0, pick('completion_tokens', 'output_tokens', 'candidatesTokenCount', 'outputTokenCount', 'outputTokens') ?? Math.ceil(String(outputText || '').length / 2)),
  };
}

function neuronsForTokens(inputTokens, outputTokens) {
  const base = Math.ceil(inputTokens * INPUT_NEURONS_PER_MILLION / 1000000) +
    Math.ceil(outputTokens * OUTPUT_NEURONS_PER_MILLION / 1000000);
  return Math.max(1, Math.ceil(base * 1.15));
}

export function estimateCloudflareFreeNeurons(messages, maxTokens = 1024) {
  const bounded = compactCloudflareFreeMessages(messages);
  const tokens = tokenCounts(null, bounded);
  const output = Math.min(OVYX_CLOUDFLARE_FREE_MAX_OUTPUT_TOKENS, Math.max(1, Math.ceil(Number(maxTokens) || 1024)));
  return neuronsForTokens(tokens.input, output);
}

function utcDayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function getCloudflareWorkersAiDailyNeuronBudget(env) {
  const raw = String(env?.OVYX_WORKERS_AI_DAILY_NEURON_BUDGET ?? '').trim();
  const configured = Number(raw);
  if (isCloudflarePaidCappedMode(env)) {
    if (!raw || !Number.isSafeInteger(configured) || configured < 100) {
      throw fail(503, 'OVYX_AI_PAID_BUDGET_NOT_CONFIGURED',
        'Cloudflare paid-capped AI mode requires an explicit OVYX_WORKERS_AI_DAILY_NEURON_BUDGET of at least 100 neurons.');
    }
    return Math.min(configured, OVYX_CLOUDFLARE_PAID_MAX_DAILY_BUDGET);
  }
  if (!Number.isSafeInteger(configured) || configured < 100) return OVYX_CLOUDFLARE_FREE_DEFAULT_DAILY_BUDGET;
  return Math.min(configured, OVYX_CLOUDFLARE_FREE_MAX_DAILY_BUDGET);
}

function dailyBudget(env) {
  return getCloudflareWorkersAiDailyNeuronBudget(env);
}

function userId(user) {
  return String(user?.uid || user?.sub || '').trim();
}

async function reserveUserMinute(env, user) {
  if (!user) return;
  const uid = userId(user);
  if (!uid) throw fail(401, 'AUTH_REQUIRED', 'Sign in before using OVYX AI.');
  const configured = Number(env?.OVYX_WORKERS_AI_REQUESTS_PER_MINUTE);
  const maximum = Number.isSafeInteger(configured) && configured > 0
    ? Math.min(30, configured)
    : OVYX_CLOUDFLARE_FREE_USER_REQUESTS_PER_MINUTE;
  const minute = Math.floor(Date.now() / 60000);
  for (let attempt = 0; attempt < RATE_RETRIES; attempt += 1) {
    let raw;
    try { raw = await getFirestoreDocument(env, 'users', uid); }
    catch { throw fail(503, 'OVYX_AI_RATE_LIMIT_STATE_UNAVAILABLE', 'OVYX could not safely verify your AI request limit. Please retry.'); }
    if (!raw) throw fail(503, 'OVYX_AI_RATE_LIMIT_STATE_UNAVAILABLE', 'OVYX could not safely verify your AI request limit. Please retry.');
    const profile = firestoreDocumentToJs(raw) || {};
    const oldMinute = Number(profile._ovyxWorkersAiMinuteKey);
    const oldCount = oldMinute === minute ? Math.max(0, Number(profile._ovyxWorkersAiMinuteRequests) || 0) : 0;
    if (oldCount >= maximum) throw fail(429, 'OVYX_AI_RATE_LIMITED', 'OVYX AI is receiving requests too quickly. Please wait a moment and try again.');
    try {
      await setFirestoreDocumentIfCurrent(env, 'users', uid, {
        _ovyxWorkersAiMinuteKey: minute,
        _ovyxWorkersAiMinuteRequests: oldCount + 1,
      }, raw.updateTime);
      return;
    } catch (error) {
      if (error?.status === 409 || error?.code === 'FIRESTORE_PRECONDITION_FAILED') continue;
      throw fail(503, 'OVYX_AI_RATE_LIMIT_STATE_UNAVAILABLE', 'OVYX could not safely reserve your AI request limit. Please retry.');
    }
  }
  throw fail(503, 'OVYX_AI_RATE_LIMIT_STATE_UNAVAILABLE', 'OVYX could not safely reserve your AI request limit. Please retry.');
}

export async function reserveCloudflareFreeUserMinute(env, user) {
  await reserveUserMinute(env, user);
}

/**
 * Keep the high-contention AI usage ledger separate from system/config.
 * system/config also stores plans and general OVYX settings, so writing the
 * usage counter there made independent requests contend on an unrelated global
 * document. The ledger is created atomically and seeded from the existing
 * same-day counters exactly once; all normal OVYX settings remain untouched.
 */
async function getDailyBudgetLedger(env) {
  for (let attempt = 0; attempt < BUDGET_RETRIES; attempt += 1) {
    let raw;
    try {
      raw = await getFirestoreDocument(env, 'system', DAILY_BUDGET_LEDGER_ID);
    } catch (error) {
      if (isRetryableBudgetError(error) && attempt + 1 < BUDGET_RETRIES) {
        await waitForBudgetRetry(attempt);
        continue;
      }
      throw budgetLedgerUnavailable(error, 'OVYX could not safely check its daily free AI allowance. Please retry later.', 'read');
    }
    if (raw) return raw;

    // One-time, read-only migration from the prior ledger fields in system/config.
    // A failed read must not initialize the new counter as zero, because doing
    // so could accidentally grant more than the already-used daily allowance.
    let legacyRaw;
    try {
      legacyRaw = await getFirestoreDocument(env, 'system', 'config');
    } catch (error) {
      if (isRetryableBudgetError(error) && attempt + 1 < BUDGET_RETRIES) {
        await waitForBudgetRetry(attempt);
        continue;
      }
      throw budgetLedgerUnavailable(error, 'OVYX could not safely migrate its existing daily AI allowance. Please retry later.', 'migration');
    }

    const legacy = legacyRaw ? (firestoreDocumentToJs(legacyRaw) || {}) : {};
    const day = utcDayKey();
    const sameDay = String(legacy._ovyxWorkersAiDayUtc || '') === day;
    const initial = {
      _ovyxWorkersAiDayUtc: day,
      _ovyxWorkersAiConsumedNeurons: sameDay ? Math.max(0, Number(legacy._ovyxWorkersAiConsumedNeurons) || 0) : 0,
      _ovyxWorkersAiReservedNeurons: sameDay ? Math.max(0, Number(legacy._ovyxWorkersAiReservedNeurons) || 0) : 0,
      _ovyxWorkersAiRequestCount: sameDay ? Math.max(0, Number(legacy._ovyxWorkersAiRequestCount) || 0) : 0,
    };
    if (sameDay && String(legacy._ovyxWorkersAiCloudflareExhaustedDayUtc || '') === day) {
      initial._ovyxWorkersAiCloudflareExhaustedDayUtc = day;
      if (legacy._ovyxWorkersAiCloudflareExhaustionReason) {
        initial._ovyxWorkersAiCloudflareExhaustionReason = String(legacy._ovyxWorkersAiCloudflareExhaustionReason).slice(0, 80);
      }
      if (legacy._ovyxWorkersAiCloudflareExhaustedAt) {
        initial._ovyxWorkersAiCloudflareExhaustedAt = String(legacy._ovyxWorkersAiCloudflareExhaustedAt).slice(0, 80);
      }
    }

    try {
      await createFirestoreDocumentIfAbsent(env, 'system', DAILY_BUDGET_LEDGER_ID, initial);
    } catch (error) {
      if (isRetryableBudgetError(error) && attempt + 1 < BUDGET_RETRIES) {
        await waitForBudgetRetry(attempt);
        continue;
      }
      throw budgetLedgerUnavailable(error, 'OVYX could not safely initialize its daily free AI allowance. Please retry later.', 'initialize');
    }
  }

  throw fail(503, 'OVYX_AI_BUDGET_LEDGER_CONFLICT_EXHAUSTED', 'OVYX could not safely initialize its daily free AI allowance after bounded retries. Please retry later.');
}

async function reserveDailyBudget(env, estimate, initialLedgerSnapshot = undefined) {
  const day = utcDayKey();
  const cap = dailyBudget(env);
  for (let attempt = 0; attempt < BUDGET_RETRIES; attempt += 1) {
    const raw = attempt === 0 && initialLedgerSnapshot !== undefined
      ? initialLedgerSnapshot
      : await getDailyBudgetLedger(env);
    const config = firestoreDocumentToJs(raw) || {};
    // The same latest snapshot is used for the pre-dispatch exhaustion check
    // and the conditional reservation. On a CAS conflict, re-read and recheck
    // every stop marker before another write; never reserve against stale data.
    if (await isCloudflareFreeAllowanceExhausted(env, raw)) {
      throw fail(429, 'OVYX_AI_CLOUDFLARE_QUOTA_EXHAUSTED',
        isCloudflarePaidCappedMode(env)
          ? 'OVYX has reached its configured daily Cloudflare AI budget. No external AI provider was used.'
          : 'OVYX has reached its protected daily Cloudflare AI capacity. No external AI provider was used.');
    }
    const sameDay = String(config._ovyxWorkersAiDayUtc || '') === day;
    const consumed = sameDay ? Math.max(0, Number(config._ovyxWorkersAiConsumedNeurons) || 0) : 0;
    const reserved = sameDay ? Math.max(0, Number(config._ovyxWorkersAiReservedNeurons) || 0) : 0;
    if (consumed + reserved + estimate > cap) {
      try {
        await setFirestoreDocumentIfCurrent(env, 'system', DAILY_BUDGET_LEDGER_ID, {
          _ovyxWorkersAiCloudflareExhaustedDayUtc: day,
          _ovyxWorkersAiCloudflareExhaustionReason: 'ovyx-safety-budget',
          _ovyxWorkersAiCloudflareExhaustedAt: new Date().toISOString(),
        }, raw.updateTime);
      } catch (error) {
        if (isRetryableBudgetError(error) && attempt + 1 < BUDGET_RETRIES) {
          await waitForBudgetRetry(attempt);
          continue;
        }
        throw budgetLedgerUnavailable(error, 'OVYX could not safely record the daily AI stop. Please retry later.', 'stop');
      }
      throw fail(429, 'OVYX_AI_NEURON_BUDGET_EXHAUSTED', 'OVYX has reached its protected daily AI allowance. Please try again after the daily reset.');
    }
    try {
      await setFirestoreDocumentIfCurrent(env, 'system', DAILY_BUDGET_LEDGER_ID, {
        _ovyxWorkersAiDayUtc: day,
        _ovyxWorkersAiConsumedNeurons: consumed,
        _ovyxWorkersAiReservedNeurons: reserved + estimate,
        _ovyxWorkersAiRequestCount: (sameDay ? Math.max(0, Number(config._ovyxWorkersAiRequestCount) || 0) : 0) + 1,
      }, raw.updateTime);
      return { day, estimate };
    } catch (error) {
      if (isRetryableBudgetError(error) && attempt + 1 < BUDGET_RETRIES) {
        await waitForBudgetRetry(attempt);
        continue;
      }
      throw budgetLedgerUnavailable(error, 'OVYX could not safely reserve its daily free AI allowance. Please retry later.', 'reservation');
    }
  }
  throw fail(503, 'OVYX_AI_BUDGET_LEDGER_CONFLICT_EXHAUSTED', 'OVYX could not safely reserve its daily free AI allowance after bounded concurrent-write retries. Please retry later.');
}

async function settleDailyBudgetUnlocked(env, reservation, actual) {
  if (!reservation) return;
  for (let attempt = 0; attempt < BUDGET_RETRIES; attempt += 1) {
    let raw;
    try {
      raw = await getFirestoreDocument(env, 'system', DAILY_BUDGET_LEDGER_ID);
    } catch (error) {
      if (isRetryableBudgetError(error) && attempt + 1 < BUDGET_RETRIES) {
        await waitForBudgetRetry(attempt);
        continue;
      }
      return;
    }
    if (!raw) return;
    const config = firestoreDocumentToJs(raw) || {};
    if (String(config._ovyxWorkersAiDayUtc || '') !== reservation.day) return;
    const reserved = Math.max(0, Number(config._ovyxWorkersAiReservedNeurons) || 0);
    const consumed = Math.max(0, Number(config._ovyxWorkersAiConsumedNeurons) || 0);
    try {
      await setFirestoreDocumentIfCurrent(env, 'system', DAILY_BUDGET_LEDGER_ID, {
        _ovyxWorkersAiReservedNeurons: Math.max(0, reserved - reservation.estimate),
        _ovyxWorkersAiConsumedNeurons: consumed + Math.max(0, actual),
      }, raw.updateTime);
      return;
    } catch (error) {
      if (isRetryableBudgetError(error) && attempt + 1 < BUDGET_RETRIES) {
        await waitForBudgetRetry(attempt);
        continue;
      }
      return;
    }
  }
}

async function settleDailyBudget(env, reservation, actual) {
  return withBudgetOperationLock(() => settleDailyBudgetUnlocked(env, reservation, actual));
}

function outputText(result) {
  if (typeof result === 'string') return result;
  if (Array.isArray(result)) return result.map(outputText).join('');
  if (!result || typeof result !== 'object') return '';
  if (typeof result.response === 'string') return result.response;
  if (typeof result.output_text === 'string') return result.output_text;
  if (typeof result.text === 'string') return result.text;

  // Current Workers AI chat models return OpenAI-style choices/message/content,
  // while older models may return a top-level response/text field. Accept both
  // shapes so a valid model reply is not mistaken for an empty inference.
  const choice = Array.isArray(result.choices) ? result.choices[0] : null;
  if (choice) {
    const content = choice.message?.content ?? choice.delta?.content ?? choice.text;
    if (typeof content === 'string') return content;
    const nestedContent = outputText(content);
    if (nestedContent) return nestedContent;
  }

  // Some Workers AI adapters wrap the model's result object one level deeper.
  if (result.result && result.result !== result) return outputText(result.result);
  if (result.message && result.message !== result) return outputText(result.message);
  if (result.content && result.content !== result) return outputText(result.content);
  if (result.output && result.output !== result) return outputText(result.output);
  return '';
}


export function isCloudflareDailyFreeLimitError(error) {
  const signature = String(error?.code || '') + ' ' + String(error?.message || '');
  return /\b3036\b|used up your daily free allocation|daily free allocation of 10,000|10,000 neurons/i.test(signature);
}
export function isCloudflareFreeQuotaError(error) {
  return ['OVYX_AI_NEURON_BUDGET_EXHAUSTED', 'OVYX_AI_CLOUDFLARE_QUOTA_EXHAUSTED'].includes(String(error?.code || ''));
}
async function recordCloudflareFreeExhaustionUnlocked(env, reason) {
  const day = utcDayKey();
  for (let attempt = 0; attempt < BUDGET_RETRIES; attempt += 1) {
    const raw = await getDailyBudgetLedger(env);
    const config = firestoreDocumentToJs(raw) || {};
    if (String(config._ovyxWorkersAiCloudflareExhaustedDayUtc || '') === day) return;
    try {
      await setFirestoreDocumentIfCurrent(env, 'system', DAILY_BUDGET_LEDGER_ID, {
        _ovyxWorkersAiCloudflareExhaustedDayUtc: day,
        _ovyxWorkersAiCloudflareExhaustionReason: String(reason || 'free-allowance-exhausted').slice(0, 80),
        _ovyxWorkersAiCloudflareExhaustedAt: new Date().toISOString(),
      }, raw.updateTime);
      return;
    } catch (error) {
      // The provider may already have rejected inference because its daily allocation
      // is exhausted. Use the same retry policy as reservations for Firestore conflicts,
      // rate limits, transient server failures and network errors.
      if (isRetryableBudgetError(error)) {
        if (attempt + 1 < BUDGET_RETRIES) {
          await waitForBudgetRetry(attempt);
          continue;
        }
        if (error?.status === 409 || error?.status === 412 || error?.code === 'FIRESTORE_PRECONDITION_FAILED') {
          throw fail(503, 'OVYX_AI_BUDGET_LEDGER_CONFLICT_EXHAUSTED',
            'OVYX could not safely record the daily AI stop after bounded concurrent-write retries. Please retry later.');
        }
      }
      // Preserve the safe stop-marker phase so live acceptance can distinguish
      // Firestore throttling from model quota, without logging tokens or credentials.
      throw budgetLedgerUnavailable(error, 'OVYX could not safely record the daily AI stop. Please retry later.', 'stop');
    }
  }
  throw fail(503, 'OVYX_AI_BUDGET_LEDGER_CONFLICT_EXHAUSTED', 'OVYX could not safely record the daily AI stop after bounded retries. Please retry later.');
}
async function recordCloudflareFreeExhaustion(env, reason) {
  return withBudgetOperationLock(() => recordCloudflareFreeExhaustionUnlocked(env, reason));
}

export async function isCloudflareFreeAllowanceExhausted(env, ledgerSnapshot = undefined) {
  const raw = ledgerSnapshot === undefined ? await getDailyBudgetLedger(env) : ledgerSnapshot;
  const config = firestoreDocumentToJs(raw) || {};
  const day = utcDayKey();
  const markedExhaustedToday = String(config._ovyxWorkersAiCloudflareExhaustedDayUtc || '') === day;
  const reason = String(config._ovyxWorkersAiCloudflareExhaustionReason || '');
  // Only a stop caused by OVYX's former free-mode cap can be reopened in
  // explicit paid-capped mode. A real Cloudflare account-allocation stop stays
  // fail-closed until the next UTC-day reset.
  const legacySafetyStopCanReopen = isCloudflarePaidCappedMode(env) &&
    reason === 'ovyx-safety-budget' &&
    markedExhaustedToday;
  if (markedExhaustedToday && !legacySafetyStopCanReopen) return true;
  if (String(config._ovyxWorkersAiDayUtc || '') !== day) return false;
  const used = Math.max(0, Number(config._ovyxWorkersAiConsumedNeurons) || 0) +
    Math.max(0, Number(config._ovyxWorkersAiReservedNeurons) || 0);
  return used >= dailyBudget(env);
}

function safeProviderError(error) {
  const status = Number(error?.status);
  const signature = String(error?.code || '') + ' ' + String(error?.message || '');
  if (isCloudflareDailyFreeLimitError(error)) {
    return fail(429, 'OVYX_AI_CLOUDFLARE_QUOTA_EXHAUSTED', 'Cloudflare has rejected this request because its current AI allocation or billing limit was reached. OVYX will not call an external AI provider.');
  }
  if (status === 429) {
    return fail(503, 'OVYX_AI_CLOUDFLARE_RATE_LIMITED', 'Cloudflare AI is temporarily at capacity or rate-limited. Please retry later; OVYX will not switch to a paid AI provider.');
  }
  if (status === 403 && /5035|paid plan|requires.*paid/i.test(signature)) {
    return fail(503, 'OVYX_AI_MODEL_NOT_AVAILABLE_ON_FREE_PLAN', 'The selected OVYX AI model is not available on the free Cloudflare plan. No paid AI provider was used.');
  }
  if (status === 408 || error?.name === 'AbortError' || error?.name === 'TimeoutError') {
    return fail(504, 'OVYX_AI_TIMEOUT', 'OVYX AI took too long to respond. Please try again.');
  }
  return fail(503, 'OVYX_AI_CLOUDFLARE_UNAVAILABLE', 'Cloudflare AI is temporarily unavailable. OVYX will not switch to a paid AI provider.');
}

function emptyOutputFailureCode(result) {
  const candidate = result?.result && typeof result.result === 'object'
    ? result.result
    : result;
  const choices = candidate && typeof candidate === 'object' && Array.isArray(candidate.choices)
    ? candidate.choices
    : null;

  if (choices) {
    if (choices.length === 0) return 'OVYX_AI_CLOUDFLARE_CHOICES_EMPTY';
    const first = choices[0] && typeof choices[0] === 'object' ? choices[0] : {};
    const message = first.message && typeof first.message === 'object'
      ? first.message
      : first.delta && typeof first.delta === 'object' ? first.delta : {};
    const content = message.content ?? first.text ?? message.text;
    if (typeof message.reasoning_content === 'string' && message.reasoning_content.trim() && !content) {
      return 'OVYX_AI_CLOUDFLARE_REASONING_ONLY';
    }
    if (Object.prototype.hasOwnProperty.call(message, 'content')) {
      return 'OVYX_AI_CLOUDFLARE_MESSAGE_CONTENT_UNSUPPORTED';
    }
    return 'OVYX_AI_CLOUDFLARE_CHOICES_NO_TEXT';
  }

  if (candidate && typeof candidate === 'object' &&
      ['response', 'output_text', 'text'].some(key => Object.prototype.hasOwnProperty.call(candidate, key))) {
    return 'OVYX_AI_CLOUDFLARE_EMPTY_RESPONSE';
  }
  return 'OVYX_AI_CLOUDFLARE_RESPONSE_SHAPE_UNSUPPORTED';
}

export async function runCloudflareFreeInference(env, {
  authUser = null, messages = null, system = '', user = '', maxTokens = 1024, timeoutMs = 45000, disableThinking = false,
} = {}) {
  if (!isCloudflareWorkersAIGuardedMode(env)) throw fail(503, 'OVYX_AI_ENGINE_MODE_NOT_CONFIGURED', 'OVYX guarded Cloudflare AI mode is not enabled.');
  if (!env?.AI || typeof env.AI.run !== 'function') throw fail(503, 'OVYX_NATIVE_AI_NOT_CONFIGURED', 'OVYX AI is not connected yet. Please try again later.');
  // Validate and reserve in one isolate-local critical section. This avoids
  // concurrent Web Studio batches stampeding the shared ledger read/CAS path;
  // the Firestore conditional-write contract remains the cross-isolate authority.
  const configuredDailyBudget = dailyBudget(env);
  const budgeted = await withBudgetOperationLock(async () => {
    // Fetch the protected ledger once. Use the exact snapshot for both the
    // pre-dispatch stop check and the conditional reservation, reducing duplicate
    // Firestore reads while preserving cross-isolate compare-and-set protection.
    const initialLedgerSnapshot = await getDailyBudgetLedger(env);
    if (await isCloudflareFreeAllowanceExhausted(env, initialLedgerSnapshot)) {
      throw fail(429, 'OVYX_AI_CLOUDFLARE_QUOTA_EXHAUSTED',
        isCloudflarePaidCappedMode(env)
          ? 'OVYX has reached its configured daily Cloudflare AI budget. No external AI provider was used.'
          : 'OVYX has reached its protected daily Cloudflare AI capacity. No external AI provider was used.');
    }
    const source = Array.isArray(messages)
      ? messages
      : [...(system ? [{ role: 'system', content: String(system) }] : []), { role: 'user', content: String(user || '') }];
    const bounded = compactCloudflareFreeMessages(source);
    if (!bounded.some(item => item.role === 'user' && item.content.trim())) {
      throw fail(400, 'PROMPT_REQUIRED', 'Please enter a message for OVYX AI.');
    }
    const outputTokens = Math.min(OVYX_CLOUDFLARE_FREE_MAX_OUTPUT_TOKENS, Math.max(1, Math.ceil(Number(maxTokens) || 1024)));
    const estimate = estimateCloudflareFreeNeurons(bounded, outputTokens);
    await reserveUserMinute(env, authUser);
    const reservation = await reserveDailyBudget(env, estimate, initialLedgerSnapshot);
    return { bounded, outputTokens, estimate, reservation };
  });
  const { bounded, outputTokens, estimate, reservation } = budgeted;
  let result;
  let inferenceDispatched = false;
  const timeout = Math.max(50, Math.min(60000, Number(timeoutMs) || 45000));
  try {
    const usesQwen3ReasoningControls =
      disableThinking && OVYX_CLOUDFLARE_FREE_MODEL === '@cf/qwen/qwen3-30b-a3b-fp8';
    inferenceDispatched = true;
    const pending = Promise.resolve(env.AI.run(OVYX_CLOUDFLARE_FREE_MODEL, {
      messages: bounded,
      max_tokens: outputTokens,
      temperature: disableThinking ? 0 : 0.2,
      stream: false,
      ...(usesQwen3ReasoningControls ? {
        chat_template_kwargs: { enable_thinking: false },
        reasoning_effort: null,
      } : {}),
    }));
    result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Object.assign(new Error('AI request timed out.'), { name: 'TimeoutError', status: 504 })), timeout);
      pending.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
    });
  } catch (error) {
    // A dispatched request can consume inference even when it errors or times
    // out. Convert the reservation to a conservative consumed amount so it does
    // not remain stuck forever and artificially drain future capacity.
    if (inferenceDispatched) await settleDailyBudget(env, reservation, estimate);
    if (isCloudflareDailyFreeLimitError(error)) {
      await recordCloudflareFreeExhaustion(env, 'cloudflare-daily-free-allocation');
    }
    throw safeProviderError(error);
  }
  const text = outputText(result);
  const rawUsage = result?.usage || result?.result?.usage;
  const usage = tokenCounts(rawUsage, bounded, text);
  const reportedOutputFields = ['completion_tokens', 'output_tokens', 'candidatesTokenCount', 'outputTokenCount', 'outputTokens'];
  const hasReportedOutputUsage = !!rawUsage && reportedOutputFields.some(key => {
    const value = rawUsage[key];
    return value !== undefined && value !== null && Number.isFinite(Number(value)) && Number(value) >= 0;
  });
  // If output text is unusable and output usage is missing, consume the full
  // reservation conservatively rather than releasing it as a zero-token result.
  const settlement = !text && !hasReportedOutputUsage
    ? estimate
    : neuronsForTokens(usage.input, usage.output);
  await settleDailyBudget(env, reservation, settlement);
  if (!text) {
    throw Object.assign(new Error('Cloudflare Workers AI returned no usable final text response.'), {
      status: 503,
      code: emptyOutputFailureCode(result),
    });
  }
  return {
    result, text, model: OVYX_CLOUDFLARE_FREE_MODEL, estimatedNeurons: estimate,
    dailyBudgetNeurons: configuredDailyBudget,
    budgetMode: isCloudflarePaidCappedMode(env) ? 'paid-capped' : 'free-only',
    maxOutputTokens: outputTokens,
  };
}
