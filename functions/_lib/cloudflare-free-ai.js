import { getFirestoreDocument, firestoreDocumentToJs, setFirestoreDocumentIfCurrent } from './firebase-admin.js';

export const OVYX_CLOUDFLARE_FREE_MODEL = '@cf/qwen/qwen3-30b-a3b-fp8';
export const OVYX_CLOUDFLARE_FREE_MAX_OUTPUT_TOKENS = 4096;
export const OVYX_CLOUDFLARE_FREE_DEFAULT_DAILY_BUDGET = 7000;
export const OVYX_CLOUDFLARE_FREE_MAX_DAILY_BUDGET = 8000;
export const OVYX_CLOUDFLARE_FREE_USER_REQUESTS_PER_MINUTE = 18;

const INPUT_NEURONS_PER_MILLION = 4625;
const OUTPUT_NEURONS_PER_MILLION = 30475;
const RATE_RETRIES = 6;
const BUDGET_RETRIES = 8;

function fail(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

export function isCloudflareFreeOnlyMode(env) {
  return String(env?.OVYX_AI_ENGINE_MODE || '').trim().toLowerCase() === 'cloudflare-free-only';
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
    kept.push({ role: item.role, content: item.content.slice(-take) });
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

function dailyBudget(env) {
  const configured = Number(env?.OVYX_WORKERS_AI_DAILY_NEURON_BUDGET);
  if (!Number.isSafeInteger(configured) || configured < 100) return OVYX_CLOUDFLARE_FREE_DEFAULT_DAILY_BUDGET;
  return Math.min(configured, OVYX_CLOUDFLARE_FREE_MAX_DAILY_BUDGET);
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

async function reserveDailyBudget(env, estimate) {
  const day = utcDayKey();
  const cap = dailyBudget(env);
  for (let attempt = 0; attempt < BUDGET_RETRIES; attempt += 1) {
    let raw;
    try { raw = await getFirestoreDocument(env, 'system', 'config'); }
    catch { throw fail(503, 'OVYX_AI_BUDGET_LEDGER_UNAVAILABLE', 'OVYX could not safely check its daily free AI allowance. Please retry later.'); }
    if (!raw) throw fail(503, 'OVYX_AI_BUDGET_LEDGER_UNAVAILABLE', 'OVYX daily AI budget storage is not initialized. AI generation is paused until the account configuration is available.');
    const config = firestoreDocumentToJs(raw) || {};
    const sameDay = String(config._ovyxWorkersAiDayUtc || '') === day;
    const consumed = sameDay ? Math.max(0, Number(config._ovyxWorkersAiConsumedNeurons) || 0) : 0;
    const reserved = sameDay ? Math.max(0, Number(config._ovyxWorkersAiReservedNeurons) || 0) : 0;
    if (consumed + reserved + estimate > cap) {
      try {
        await setFirestoreDocumentIfCurrent(env, 'system', 'config', {
          _ovyxWorkersAiCloudflareExhaustedDayUtc: day,
          _ovyxWorkersAiCloudflareExhaustionReason: 'ovyx-safety-budget',
          _ovyxWorkersAiCloudflareExhaustedAt: new Date().toISOString(),
        }, raw.updateTime);
      } catch (error) {
        if (error?.status === 409 || error?.code === 'FIRESTORE_PRECONDITION_FAILED') continue;
        throw fail(503, 'OVYX_AI_BUDGET_LEDGER_UNAVAILABLE', 'OVYX could not safely record the daily AI stop. Please retry later.');
      }
      throw fail(429, 'OVYX_AI_NEURON_BUDGET_EXHAUSTED', 'OVYX has reached its protected daily AI allowance. Please try again after the daily reset.');
    }
    try {
      await setFirestoreDocumentIfCurrent(env, 'system', 'config', {
        _ovyxWorkersAiDayUtc: day,
        _ovyxWorkersAiConsumedNeurons: consumed,
        _ovyxWorkersAiReservedNeurons: reserved + estimate,
        _ovyxWorkersAiRequestCount: (sameDay ? Math.max(0, Number(config._ovyxWorkersAiRequestCount) || 0) : 0) + 1,
      }, raw.updateTime);
      return { day, estimate };
    } catch (error) {
      if (error?.status === 409 || error?.code === 'FIRESTORE_PRECONDITION_FAILED') continue;
      throw fail(503, 'OVYX_AI_BUDGET_LEDGER_UNAVAILABLE', 'OVYX could not safely reserve its daily free AI allowance. Please retry later.');
    }
  }
  throw fail(503, 'OVYX_AI_BUDGET_LEDGER_UNAVAILABLE', 'OVYX could not safely reserve its daily free AI allowance. Please retry later.');
}

async function settleDailyBudget(env, reservation, actual) {
  if (!reservation) return;
  for (let attempt = 0; attempt < BUDGET_RETRIES; attempt += 1) {
    let raw;
    try { raw = await getFirestoreDocument(env, 'system', 'config'); } catch { return; }
    if (!raw) return;
    const config = firestoreDocumentToJs(raw) || {};
    if (String(config._ovyxWorkersAiDayUtc || '') !== reservation.day) return;
    const reserved = Math.max(0, Number(config._ovyxWorkersAiReservedNeurons) || 0);
    const consumed = Math.max(0, Number(config._ovyxWorkersAiConsumedNeurons) || 0);
    try {
      await setFirestoreDocumentIfCurrent(env, 'system', 'config', {
        _ovyxWorkersAiReservedNeurons: Math.max(0, reserved - reservation.estimate),
        _ovyxWorkersAiConsumedNeurons: consumed + Math.max(0, actual),
      }, raw.updateTime);
      return;
    } catch (error) {
      if (error?.status === 409 || error?.code === 'FIRESTORE_PRECONDITION_FAILED') continue;
      return;
    }
  }
}

function outputText(result) {
  if (typeof result === 'string') return result;
  if (typeof result?.response === 'string') return result.response;
  if (typeof result?.output_text === 'string') return result.output_text;
  if (typeof result?.text === 'string') return result.text;
  return '';
}


export function isCloudflareDailyFreeLimitError(error) {
  const signature = String(error?.code || '') + ' ' + String(error?.message || '');
  return /\b3036\b|used up your daily free allocation|daily free allocation of 10,000|10,000 neurons/i.test(signature);
}
export function isCloudflareFreeQuotaError(error) {
  return ['OVYX_AI_NEURON_BUDGET_EXHAUSTED', 'OVYX_AI_CLOUDFLARE_QUOTA_EXHAUSTED'].includes(String(error?.code || ''));
}
export function isWebStudioUniversalConnectionFallbackTrigger(error) {
  return isCloudflareFreeQuotaError(error) || String(error?.code || '') === 'DAILY_RATION_EXHAUSTED';
}
async function recordCloudflareFreeExhaustion(env, reason) {
  const day = utcDayKey();
  for (let attempt = 0; attempt < BUDGET_RETRIES; attempt += 1) {
    let raw;
    try { raw = await getFirestoreDocument(env, 'system', 'config'); }
    catch { throw fail(503, 'OVYX_AI_BUDGET_LEDGER_UNAVAILABLE', 'OVYX could not safely record the daily AI stop. Please retry later.'); }
    if (!raw) throw fail(503, 'OVYX_AI_BUDGET_LEDGER_UNAVAILABLE', 'OVYX daily AI budget storage is not initialized. AI generation is paused until the account configuration is available.');
    const config = firestoreDocumentToJs(raw) || {};
    if (String(config._ovyxWorkersAiCloudflareExhaustedDayUtc || '') === day) return;
    try {
      await setFirestoreDocumentIfCurrent(env, 'system', 'config', {
        _ovyxWorkersAiCloudflareExhaustedDayUtc: day,
        _ovyxWorkersAiCloudflareExhaustionReason: String(reason || 'free-allowance-exhausted').slice(0, 80),
        _ovyxWorkersAiCloudflareExhaustedAt: new Date().toISOString(),
      }, raw.updateTime);
      return;
    } catch (error) {
      if (error?.status === 409 || error?.code === 'FIRESTORE_PRECONDITION_FAILED') continue;
      throw fail(503, 'OVYX_AI_BUDGET_LEDGER_UNAVAILABLE', 'OVYX could not safely record the daily AI stop. Please retry later.');
    }
  }
  throw fail(503, 'OVYX_AI_BUDGET_LEDGER_UNAVAILABLE', 'OVYX could not safely record the daily AI stop. Please retry later.');
}
export async function isCloudflareFreeAllowanceExhausted(env) {
  let raw;
  try { raw = await getFirestoreDocument(env, 'system', 'config'); }
  catch { throw fail(503, 'OVYX_AI_BUDGET_LEDGER_UNAVAILABLE', 'OVYX could not verify the daily Cloudflare AI stop. Please retry later.'); }
  if (!raw) throw fail(503, 'OVYX_AI_BUDGET_LEDGER_UNAVAILABLE', 'OVYX daily AI budget storage is not initialized. Please retry later.');
  const config = firestoreDocumentToJs(raw) || {};
  const day = utcDayKey();
  if (String(config._ovyxWorkersAiCloudflareExhaustedDayUtc || '') === day) return true;
  if (String(config._ovyxWorkersAiDayUtc || '') !== day) return false;
  const used = Math.max(0, Number(config._ovyxWorkersAiConsumedNeurons) || 0) +
    Math.max(0, Number(config._ovyxWorkersAiReservedNeurons) || 0);
  return used >= dailyBudget(env);
}

function safeProviderError(error) {
  const status = Number(error?.status);
  const signature = String(error?.code || '') + ' ' + String(error?.message || '');
  if (isCloudflareDailyFreeLimitError(error)) {
    return fail(429, 'OVYX_AI_CLOUDFLARE_QUOTA_EXHAUSTED', 'Cloudflare has reached its daily free AI allowance. OVYX will not switch to a paid AI provider.');
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

export async function runCloudflareFreeInference(env, {
  authUser = null, messages = null, system = '', user = '', maxTokens = 1024, timeoutMs = 45000,
} = {}) {
  if (!isCloudflareFreeOnlyMode(env)) throw fail(503, 'OVYX_AI_ENGINE_MODE_NOT_CONFIGURED', 'OVYX free-only AI mode is not enabled.');
  if (!env?.AI || typeof env.AI.run !== 'function') throw fail(503, 'OVYX_NATIVE_AI_NOT_CONFIGURED', 'OVYX AI is not connected yet. Please try again later.');
  if (await isCloudflareFreeAllowanceExhausted(env)) {
    throw fail(429, 'OVYX_AI_CLOUDFLARE_QUOTA_EXHAUSTED', 'OVYX has reached its protected daily Cloudflare AI capacity. No platform-paid provider was used.');
  }
  const source = Array.isArray(messages)
    ? messages
    : [...(system ? [{ role: 'system', content: String(system) }] : []), { role: 'user', content: String(user || '') }];
  const bounded = compactCloudflareFreeMessages(source);
  if (!bounded.some(item => item.role === 'user' && item.content.trim())) throw fail(400, 'PROMPT_REQUIRED', 'Please enter a message for OVYX AI.');
  const outputTokens = Math.min(OVYX_CLOUDFLARE_FREE_MAX_OUTPUT_TOKENS, Math.max(1, Math.ceil(Number(maxTokens) || 1024)));
  const estimate = estimateCloudflareFreeNeurons(bounded, outputTokens);
  await reserveUserMinute(env, authUser);
  const reservation = await reserveDailyBudget(env, estimate);
  let result;
  const timeout = Math.max(50, Math.min(60000, Number(timeoutMs) || 45000));
  try {
    const pending = Promise.resolve(env.AI.run(OVYX_CLOUDFLARE_FREE_MODEL, {
      messages: bounded, max_tokens: outputTokens, temperature: 0.2, stream: false,
    }));
    result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Object.assign(new Error('AI request timed out.'), { name: 'TimeoutError', status: 504 })), timeout);
      pending.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
    });
  } catch (error) {
    if (isCloudflareDailyFreeLimitError(error)) {
      await recordCloudflareFreeExhaustion(env, 'cloudflare-daily-free-allocation');
    }
    // A dispatched request may consume inference even if a timeout is observed.
    throw safeProviderError(error);
  }
  const text = outputText(result);
  const usage = tokenCounts(result?.usage || result?.result?.usage, bounded, text);
  await settleDailyBudget(env, reservation, neuronsForTokens(usage.input, usage.output));
  return { result, model: OVYX_CLOUDFLARE_FREE_MODEL, estimatedNeurons: estimate, dailyBudgetNeurons: dailyBudget(env), maxOutputTokens: outputTokens };
}
