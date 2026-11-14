/**
 * OVYX Enterprise Protection Framework
 * ------------------------------------
 * Isolated Cloudflare Pages Functions protection utilities.
 *
 * Safe-by-default controls for rate limiting, timeouts, retries, validation,
 * environment checks, logging, graceful errors, circuit breaking, deduplication,
 * caching, fallbacks, sanitization, pagination and strict CORS.
 *
 * This file is intentionally isolated. It does not modify or depend on the
 * implementation details of any existing OVYX route.
 *
 * Security note:
 * String sanitization is not a universal SQL/command-injection defense.
 * SQL must still use parameterized queries and command execution should avoid
 * shell interpolation. This module adds layered validation and normalization.
 */

export const PROTECTION_VERSION = '1.0.0-enterprise';

export const DEFAULTS = Object.freeze({
  rateLimit: 30,
  rateWindowMs: 60_000,
  timeoutMs: 30_000,
  retryAttempts: 3,
  retryBaseDelayMs: 250,
  retryMaxDelayMs: 2_000,
  dedupeWindowMs: 2_000,
  cacheTtlMs: 15_000,
  cacheMaxEntries: 256,
  circuitFailureThreshold: 5,
  circuitCooldownMs: 30_000,
  maxBodyBytes: 512_000,
  maxPageSize: 100,
  maxStringLength: 30_000,
  requestIdHeader: 'X-OVYX-Request-ID',
});

const rateWindows = new Map();
const dedupeEntries = new Map();
const cacheEntries = new Map();
const circuitStates = new Map();

function positiveInt(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function asError(value) {
  return value instanceof Error ? value : new Error(String(value || 'Unknown error.'));
}

function safeMessage(error, max = 300) {
  return String(error?.message || 'Internal server error.').slice(0, max);
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function clientIp(request) {
  return (
    request?.headers?.get('CF-Connecting-IP') ||
    request?.cf?.connectingIP ||
    'unknown'
  );
}

function envOrigins(env, explicit) {
  return [
    ...(Array.isArray(explicit) ? explicit : []),
    ...String(env?.OVYX_ALLOWED_ORIGINS || '')
      .split(',')
      .map(value => value.trim())
      .filter(Boolean),
  ];
}

/* 15. Request ID tracking */
export function getRequestId(request) {
  const inbound =
    request?.headers?.get(DEFAULTS.requestIdHeader) || '';

  if (/^[A-Za-z0-9._:-]{8,128}$/.test(inbound)) {
    return inbound;
  }

  return crypto.randomUUID();
}

/* 2. Timeout protection */
export async function withTimeout(
  operation,
  timeoutMs = DEFAULTS.timeoutMs,
  message = 'Operation timed out.'
) {
  const ms = positiveInt(timeoutMs, DEFAULTS.timeoutMs);
  let timer;

  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(Object.assign(new Error(message), {
        status: 504,
        code: 'REQUEST_TIMEOUT',
        retryable: true,
      }));
    }, ms);
  });

  try {
    return await Promise.race([
      typeof operation === 'function' ? operation() : operation,
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/* 3. Auto-retry logic */
export async function retry(
  operation,
  {
    attempts = DEFAULTS.retryAttempts,
    baseDelayMs = DEFAULTS.retryBaseDelayMs,
    maxDelayMs = DEFAULTS.retryMaxDelayMs,
    shouldRetry = error => {
      const status = Number(error?.status || 0);

      if (
        status >= 400 &&
        status < 500 &&
        ![408, 425, 429].includes(status)
      ) {
        return false;
      }

      return (
        error?.retryable === true ||
        status === 0 ||
        status === 408 ||
        status === 425 ||
        status === 429 ||
        status >= 500
      );
    },
    onRetry,
  } = {}
) {
  const maxAttempts = clamp(
    positiveInt(attempts, 3),
    1,
    3
  );

  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation({
        attempt,
        maxAttempts,
      });
    } catch (error) {
      lastError = asError(error);

      if (
        attempt >= maxAttempts ||
        !shouldRetry(lastError, attempt)
      ) {
        throw lastError;
      }

      const exponential = Math.min(
        maxDelayMs,
        baseDelayMs * (2 ** (attempt - 1))
      );

      const jitter = Math.floor(
        Math.random() * Math.max(1, exponential * 0.35)
      );

      const delayMs = exponential + jitter;

      if (typeof onRetry === 'function') {
        await onRetry({
          error: lastError,
          attempt,
          nextAttempt: attempt + 1,
          delayMs,
        });
      }

      await wait(delayMs);
    }
  }

  throw lastError || new Error('Operation failed.');
}

export async function fetchWithRetry(
  input,
  init = {},
  options = {}
) {
  return retry(
    async ({ attempt }) => {
      const controller = new AbortController();
      const parentSignal = init.signal;

      const parentAbort = () => {
        controller.abort(parentSignal.reason);
      };

      if (parentSignal?.aborted) {
        controller.abort(parentSignal.reason);
      } else if (parentSignal) {
        parentSignal.addEventListener(
          'abort',
          parentAbort,
          { once: true }
        );
      }

      try {
        return await withTimeout(
          () =>
            fetch(input, {
              ...init,
              signal: controller.signal,
              headers: {
                ...(init.headers || {}),
                'X-OVYX-Retry-Attempt': String(attempt),
              },
            }),
          options.timeoutMs || DEFAULTS.timeoutMs,
          'Upstream network request timed out.'
        );
      } finally {
        if (parentSignal) {
          parentSignal.removeEventListener(
            'abort',
            parentAbort
          );
        }
      }
    },
    options
  );
}

/* 4. Input validation */
export function validateInput(
  payload,
  schema,
  { rejectUnknown = false } = {}
) {
  const value =
    payload &&
    typeof payload === 'object'
      ? payload
      : {};

  const ruleset =
    schema &&
    typeof schema === 'object'
      ? schema
      : {};

  const errors = [];

  for (const [field, rulesRaw] of Object.entries(ruleset)) {
    const rules =
      rulesRaw &&
      typeof rulesRaw === 'object'
        ? rulesRaw
        : {};

    const present =
      Object.prototype.hasOwnProperty.call(
        value,
        field
      );

    const fieldValue =
      value[field];

    if (
      rules.required &&
      (
        !present ||
        fieldValue === null ||
        fieldValue === undefined ||
        (
          typeof fieldValue === 'string' &&
          fieldValue.trim() === ''
        )
      )
    ) {
      errors.push(field + ' is required.');
      continue;
    }

    if (
      !present ||
      fieldValue === null ||
      fieldValue === undefined
    ) {
      continue;
    }

    if (
      rules.type &&
      !matchesType(
        fieldValue,
        rules.type
      )
    ) {
      errors.push(
        field + ' has an invalid type.'
      );
      continue;
    }

    if (
      typeof fieldValue === 'string'
    ) {
      const maxLength =
        positiveInt(
          rules.maxLength,
          DEFAULTS.maxStringLength
        );

      if (
        fieldValue.length >
        maxLength
      ) {
        errors.push(
          field + ' exceeds maximum length.'
        );
      }

      if (
        Number.isInteger(
          rules.minLength
        ) &&
        fieldValue.length <
          rules.minLength
      ) {
        errors.push(
          field + ' is shorter than the minimum length.'
        );
      }

      if (
        rules.pattern
      ) {
        const regex =
          rules.pattern instanceof RegExp
            ? rules.pattern
            : new RegExp(
                String(
                  rules.pattern
                )
              );

        if (
          !regex.test(
            fieldValue
          )
        ) {
          errors.push(
            field + ' has an invalid format.'
          );
        }
      }
    }

    if (
      Array.isArray(fieldValue)
    ) {
      const maxItems =
        positiveInt(
          rules.arrayMax,
          10_000
        );

      if (
        fieldValue.length >
        maxItems
      ) {
        errors.push(
          field + ' contains too many items.'
        );
      }
    }

    if (
      typeof fieldValue === 'number' &&
      Number.isFinite(fieldValue)
    ) {
      if (
        Number.isFinite(
          rules.min
        ) &&
        fieldValue <
          rules.min
      ) {
        errors.push(
          field + ' is below the minimum.'
        );
      }

      if (
        Number.isFinite(
          rules.max
        ) &&
        fieldValue >
          rules.max
      ) {
        errors.push(
          field + ' exceeds the maximum.'
        );
      }
    }

    if (
      Array.isArray(
        rules.enum
      ) &&
      !rules.enum.includes(
        fieldValue
      )
    ) {
      errors.push(
        field + ' contains an unsupported value.'
      );
    }

    if (
      typeof rules.custom === 'function'
    ) {
      const result =
        rules.custom(
          fieldValue,
          value
        );

      if (
        result !== true
      ) {
        errors.push(
          typeof result === 'string'
            ? result
            : field + ' failed custom validation.'
        );
      }
    }
  }

  if (
    rejectUnknown
  ) {
    const allowed =
      new Set(
        Object.keys(
          ruleset
        )
      );

    for (const key of Object.keys(value)) {
      if (!allowed.has(key)) {
        errors.push(
          'Unknown field: ' + key + '.'
        );
      }
    }
  }

  if (errors.length) {
    throw Object.assign(
      new Error(
        errors.join(' ')
      ),
      {
        status: 400,
        code: 'INPUT_VALIDATION_FAILED',
        details: errors,
      }
    );
  }

  return value;
}

function matchesType(value, type) {
  switch (String(type).toLowerCase()) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return (
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value)
      );
    default:
      return true;
  }
}

export async function readJsonBody(
  request,
  maxBytes = DEFAULTS.maxBodyBytes
) {
  const limit =
    positiveInt(
      maxBytes,
      DEFAULTS.maxBodyBytes
    );

  const declared =
    Number(
      request?.headers?.get(
        'content-length'
      ) || 0
    );

  if (
    declared &&
    declared > limit
  ) {
    throw Object.assign(
      new Error(
        'Request body is too large.'
      ),
      {
        status: 413,
        code: 'REQUEST_BODY_TOO_LARGE',
      }
    );
  }

  const text =
    await request.text();

  if (
    new TextEncoder()
      .encode(text)
      .byteLength >
      limit
  ) {
    throw Object.assign(
      new Error(
        'Request body is too large.'
      ),
      {
        status: 413,
        code: 'REQUEST_BODY_TOO_LARGE',
      }
    );
  }

  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    throw Object.assign(
      new Error(
        'Request body must be valid JSON.'
      ),
      {
        status: 400,
        code: 'INVALID_JSON',
      }
    );
  }
}

/* 13. Input sanitization */
export function sanitizeInput(
  value,
  {
    maxStringLength =
      DEFAULTS.maxStringLength,
    stripHtml = true,
  } = {}
) {
  if (typeof value === 'string') {
    let output =
      value
        .normalize('NFKC')
        .replace(
          /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,
          ''
        );

    if (
      stripHtml
    ) {
      output =
        output.replace(
          /<[^>]*>/g,
          ''
        );
    }

    output =
      output.replace(
        /(^|\s)(?:javascript|vbscript|data):/gi,
        '$1blocked:'
      );

    return output.slice(
      0,
      positiveInt(
        maxStringLength,
        DEFAULTS.maxStringLength
      )
    );
  }

  if (Array.isArray(value)) {
    return value.map(
      item =>
        sanitizeInput(
          item,
          {
            maxStringLength,
            stripHtml,
          }
        )
    );
  }

  if (
    value &&
    typeof value === 'object'
  ) {
    const clean = {};

    for (const [key, nested] of Object.entries(value)) {
      const safeKey =
        sanitizeInput(
          key,
          {
            maxStringLength: 200,
            stripHtml: true,
          }
        );

      clean[safeKey] =
        sanitizeInput(
          nested,
          {
            maxStringLength,
            stripHtml,
          }
        );
    }

    return clean;
  }

  return value;
}

/* 5. Environment variable checker */
export function checkEnv(
  env,
  requiredKeys = []
) {
  const missing =
    requiredKeys.filter(
      key =>
        !env?.[key] ||
        !String(
          env[key]
        ).trim()
    );

  if (missing.length) {
    throw Object.assign(
      new Error(
        'Required server configuration is missing.'
      ),
      {
        status: 503,
        code: 'ENVIRONMENT_NOT_READY',
        details: {
          missing,
        },
      }
    );
  }

  return true;
}

/* 6. Rate limiting */
export async function rateLimit(
  key,
  {
    limit = DEFAULTS.rateLimit,
    windowMs = DEFAULTS.rateWindowMs,
    store,
  } = {}
) {
  const max =
    positiveInt(
      limit,
      DEFAULTS.rateLimit
    );

  const window =
    positiveInt(
      windowMs,
      DEFAULTS.rateWindowMs
    );

  const normalized =
    String(
      key ||
        'anonymous'
    ).slice(
      0,
      512
    );

  const now =
    Date.now();

  if (
    store?.get &&
    store?.set
  ) {
    const current =
      await store.get(
        normalized
      );

    if (
      !current ||
      now -
        Number(
          current.startedAt ||
            0
        ) >=
        window
    ) {
      const entry = {
        startedAt:
          now,
        count: 1,
      };

      await store.set(
        normalized,
        entry,
        window
      );

      return {
        allowed: true,
        limit: max,
        remaining:
          max - 1,
        resetAt:
          now + window,
      };
    }

    const count =
      Number(
        current.count ||
          0
      ) + 1;

    const startedAt =
      Number(
        current.startedAt
      );

    await store.set(
      normalized,
      {
        startedAt,
        count,
      },
      Math.max(
        1,
        window -
          (
            now -
              startedAt
          )
      )
    );

    return {
      allowed:
        count <= max,
      limit: max,
      remaining:
        Math.max(
          0,
          max - count
        ),
      resetAt:
        startedAt + window,
    };
  }

  const current =
    rateWindows.get(
      normalized
    );

  if (
    !current ||
    now -
      current.startedAt >=
      window
  ) {
    const next = {
      startedAt:
        now,
      count: 1,
    };

    rateWindows.set(
      normalized,
      next
    );

    pruneRateWindows(
      window * 2
    );

    return {
      allowed: true,
      limit: max,
      remaining:
        max - 1,
      resetAt:
        now + window,
    };
  }

  current.count +=
    1;

  return {
    allowed:
      current.count <=
      max,
    limit: max,
    remaining:
      Math.max(
        0,
        max -
          current.count
      ),
    resetAt:
      current.startedAt +
      window,
  };
}

function pruneRateWindows(
  maxAge
) {
  if (
    rateWindows.size <
    256
  ) {
    return;
  }

  const now =
    Date.now();

  for (const [key, value] of rateWindows) {
    if (
      now -
        Number(
          value.startedAt ||
            0
        ) >
      maxAge
    ) {
      rateWindows.delete(
        key
      );
    }
  }
}

/* 7. Error logging */
export function logError(
  error,
  {
    requestId = 'unknown',
    request,
    context,
    code,
    service,
    sink,
  } = {}
) {
  const normalized =
    asError(
      error
    );

  const record = {
    timestamp:
      new Date().toISOString(),
    requestId,
    method:
      request?.method ||
      null,
    url:
      request?.url ||
      null,
    service:
      service ||
      null,
    code:
      code ||
      normalized.code ||
      'INTERNAL_ERROR',
    name:
      normalized.name ||
      'Error',
    message:
      safeMessage(
        normalized
      ),
    stack:
      String(
        normalized.stack ||
          ''
      ).slice(
        0,
        12_000
      ),
  };

  console.error(
    '[OVYX PROTECTION ERROR]',
    JSON.stringify(
      record
    )
  );

  if (
    typeof sink === 'function'
  ) {
    const task =
      Promise.resolve()
        .then(
          () =>
            sink(record)
        )
        .catch(
          sinkError =>
            console.error(
              '[OVYX PROTECTION LOGGER FAILURE]',
              safeMessage(
                sinkError
              )
            )
        );

    if (
      context?.waitUntil
    ) {
      context.waitUntil(
        task
      );
    }
  }

  return record;
}

/* 8. Graceful error response */
export function errorResponse(
  error,
  {
    requestId = 'unknown',
    status,
    includeDetails = false,
  } = {}
) {
  const normalized =
    asError(
      error
    );

  const chosenStatus =
    clamp(
      Number.isInteger(
        status ||
          normalized.status
      )
        ? Number(
            status ||
              normalized.status
          )
        : 500,
      400,
      599
    );

  const body = {
    ok: false,
    error:
      normalized.code ||
      'INTERNAL_ERROR',
    message:
      chosenStatus >= 500
        ? 'The server could not complete the request.'
        : safeMessage(
            normalized
          ),
    requestId,
  };

  if (
    includeDetails &&
    normalized.details
  ) {
    body.details =
      normalized.details;
  }

  return new Response(
    JSON.stringify(
      body
    ),
    {
      status:
        chosenStatus,
      headers: {
        'Content-Type':
          'application/json; charset=utf-8',
        'Cache-Control':
          'no-store, no-cache, must-revalidate, private',
      },
    }
  );
}

/* 9. Circuit breaker */
export function circuitBreaker(
  name,
  {
    failureThreshold =
      DEFAULTS.circuitFailureThreshold,
    cooldownMs =
      DEFAULTS.circuitCooldownMs,
  } = {}
) {
  const key =
    String(
      name ||
        'default'
    ).slice(
      0,
      200
    );

  const threshold =
    positiveInt(
      failureThreshold,
      DEFAULTS.circuitFailureThreshold
    );

  const cooldown =
    positiveInt(
      cooldownMs,
      DEFAULTS.circuitCooldownMs
    );

  const now =
    Date.now();

  let state =
    circuitStates.get(
      key
    );

  if (!state) {
    state = {
      status:
        'CLOSED',
      failures: 0,
      openedAt: 0,
      halfOpenInFlight:
        false,
    };

    circuitStates.set(
      key,
      state
    );
  }

  if (
    state.status ===
      'OPEN' &&
    now -
      state.openedAt >=
      cooldown
  ) {
    state.status =
      'HALF_OPEN';

    state.halfOpenInFlight =
      false;
  }

  if (
    state.status ===
    'OPEN'
  ) {
    return {
      allowed:
        false,
      state:
        state.status,
      retryAt:
        state.openedAt +
        cooldown,
    };
  }

  if (
    state.status ===
      'HALF_OPEN' &&
    state.halfOpenInFlight
  ) {
    return {
      allowed:
        false,
      state:
        state.status,
      retryAt:
        now + 1_000,
    };
  }

  if (
    state.status ===
    'HALF_OPEN'
  ) {
    state.halfOpenInFlight =
      true;
  }

  return {
    allowed:
      true,
    state:
      state.status,
    failures:
      state.failures,
  };
}

export function circuitSuccess(
  name
) {
  const state =
    circuitStates.get(
      String(
        name ||
          'default'
      )
    );

  if (!state) {
    return;
  }

  state.status =
    'CLOSED';

  state.failures =
    0;

  state.openedAt =
    0;

  state.halfOpenInFlight =
    false;
}

export function circuitFailure(
  name,
  {
    failureThreshold =
      DEFAULTS.circuitFailureThreshold,
  } = {}
) {
  const key =
    String(
      name ||
        'default'
    );

  let state =
    circuitStates.get(
      key
    );

  if (!state) {
    state = {
      status:
        'CLOSED',
      failures: 0,
      openedAt: 0,
      halfOpenInFlight:
        false,
    };

    circuitStates.set(
      key,
      state
    );
  }

  state.failures +=
    1;

  if (
    state.failures >=
      positiveInt(
        failureThreshold,
        DEFAULTS.circuitFailureThreshold
      ) ||
    state.status ===
      'HALF_OPEN'
  ) {
    state.status =
      'OPEN';

    state.openedAt =
      Date.now();

    state.halfOpenInFlight =
      false;
  }

  return {
    state:
      state.status,
    failures:
      state.failures,
  };
}

export async function withCircuitBreaker(
  name,
  operation,
  options = {}
) {
  const gate =
    circuitBreaker(
      name,
      options
    );

  if (!gate.allowed) {
    throw Object.assign(
      new Error(
        'Upstream service is temporarily protected by a circuit breaker.'
      ),
      {
        status: 503,
        code: 'CIRCUIT_OPEN',
        retryable: true,
        retryAt:
          gate.retryAt,
      }
    );
  }

  try {
    const result =
      await operation();

    circuitSuccess(
      name
    );

    return result;
  } catch (error) {
    circuitFailure(
      name,
      options
    );

    throw error;
  }
}

/* 10. Request deduplication */
export async function deduplicate(
  key,
  operation,
  {
    windowMs =
      DEFAULTS.dedupeWindowMs,
  } = {}
) {
  const normalized =
    String(
      key ||
        ''
    ).slice(
      0,
      512
    );

  const now =
    Date.now();

  const existing =
    dedupeEntries.get(
      normalized
    );

  if (
    existing &&
    now -
      existing.createdAt <
      windowMs
  ) {
    throw Object.assign(
      new Error(
        'Duplicate request suppressed.'
      ),
      {
        status: 409,
        code:
          'DUPLICATE_REQUEST',
      }
    );
  }

  dedupeEntries.set(
    normalized,
    {
      createdAt:
        now,
    }
  );

  pruneDedupe(
    windowMs * 2
  );

  try {
    return await operation();
  } catch (error) {
    dedupeEntries.delete(
      normalized
    );

    throw error;
  }
}

function pruneDedupe(
  maxAge
) {
  if (
    dedupeEntries.size <
    256
  ) {
    return;
  }

  const now =
    Date.now();

  for (const [key, value] of dedupeEntries) {
    if (
      now -
        value.createdAt >
      maxAge
    ) {
      dedupeEntries.delete(
        key
      );
    }
  }
}

/* 11. Cache layer */
export async function cacheGetOrSet(
  key,
  producer,
  {
    ttlMs =
      DEFAULTS.cacheTtlMs,
    maxEntries =
      DEFAULTS.cacheMaxEntries,
  } = {}
) {
  const normalized =
    String(
      key ||
        ''
    ).slice(
      0,
      512
    );

  const now =
    Date.now();

  const existing =
    cacheEntries.get(
      normalized
    );

  if (
    existing &&
    now <
      existing.expiresAt
  ) {
    existing.usedAt =
      now;

    return {
      value:
        responseFromSnapshot(
          existing.snapshot
        ),
      cached:
        true,
    };
  }

  cacheEntries.delete(
    normalized
  );

  const response =
    await producer();

  if (
    !(response instanceof Response)
  ) {
    return {
      value:
        response,
      cached:
        false,
    };
  }

  const snapshot =
    await snapshotResponse(
      response
    );

  if (!snapshot) {
    return {
      value:
        response,
      cached:
        false,
    };
  }

  cacheEntries.set(
    normalized,
    {
      snapshot,
      expiresAt:
        now +
        positiveInt(
          ttlMs,
          DEFAULTS.cacheTtlMs
        ),
      usedAt:
        now,
    }
  );

  trimCache(
    positiveInt(
      maxEntries,
      DEFAULTS.cacheMaxEntries
    )
  );

  return {
    value:
      response,
    cached:
      false,
  };
}

async function snapshotResponse(
  response,
  maxBytes =
    DEFAULTS.maxBodyBytes
) {
  const contentType =
    response.headers.get(
      'content-type'
    ) || '';

  if (
    !/application\/json|text\//i.test(
      contentType
    )
  ) {
    return null;
  }

  const body =
    await response.clone().text();

  if (
    new TextEncoder()
      .encode(body)
      .byteLength >
      maxBytes
  ) {
    return null;
  }

  const headers =
    {};

  for (const [key, value] of response.headers) {
    headers[key] =
      value;
  }

  return {
    body,
    status:
      response.status,
    statusText:
      response.statusText,
    headers,
  };
}

function responseFromSnapshot(
  snapshot
) {
  return new Response(
    snapshot.body,
    {
      status:
        snapshot.status,
      statusText:
        snapshot.statusText,
      headers:
        snapshot.headers,
    }
  );
}

function trimCache(
  maxEntries
) {
  while (
    cacheEntries.size >
    maxEntries
  ) {
    let oldestKey =
      null;

    let oldestAt =
      Infinity;

    for (const [key, entry] of cacheEntries) {
      if (
        entry.usedAt <
        oldestAt
      ) {
        oldestAt =
          entry.usedAt;

        oldestKey =
          key;
      }
    }

    if (
      oldestKey ===
      null
    ) {
      break;
    }

    cacheEntries.delete(
      oldestKey
    );
  }
}

/* 12. Fallback responses */
export async function fallbackResponse(
  error,
  fallback
) {
  if (
    typeof fallback ===
    'function'
  ) {
    return normalizeResponse(
      await fallback(
        error
      )
    );
  }

  return normalizeResponse(
    fallback
  );
}

function normalizeResponse(
  value
) {
  if (
    value instanceof Response
  ) {
    return value;
  }

  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  if (
    typeof value ===
    'object'
  ) {
    return new Response(
      JSON.stringify(
        value
      ),
      {
        status:
          200,
        headers: {
          'Content-Type':
            'application/json; charset=utf-8',
        },
      }
    );
  }

  return new Response(
    String(
      value
    ),
    {
      status:
        200,
      headers: {
        'Content-Type':
          'text/plain; charset=utf-8',
      },
    }
  );
}

/* 14. Pagination protection */
export function enforcePagination(
  input,
  {
    defaultPageSize = 20,
    maxPageSize =
      DEFAULTS.maxPageSize,
    pageParam =
      'page',
    pageSizeParam =
      'pageSize',
    cursorParam =
      'cursor',
  } = {}
) {
  const params =
    input instanceof URL
      ? input.searchParams
      : input instanceof URLSearchParams
        ? input
        : input?.searchParams instanceof URLSearchParams
          ? input.searchParams
          : new URLSearchParams(
              String(
                input ||
                  ''
              )
            );

  const max =
    positiveInt(
      maxPageSize,
      DEFAULTS.maxPageSize
    );

  const defaultSize =
    clamp(
      positiveInt(
        defaultPageSize,
        20
      ),
      1,
      max
    );

  const rawSize =
    params.get(
      pageSizeParam
    );

  const pageSize =
    rawSize === null ||
    rawSize === ''
      ? defaultSize
      : Number(
          rawSize
        );

  if (
    !Number.isInteger(
      pageSize
    ) ||
    pageSize < 1
  ) {
    throw Object.assign(
      new Error(
        'pageSize must be a positive integer.'
      ),
      {
        status: 400,
        code: 'INVALID_PAGE_SIZE',
      }
    );
  }

  if (
    pageSize >
    max
  ) {
    throw Object.assign(
      new Error(
        'pageSize cannot exceed ' +
          max +
          '.'
      ),
      {
        status: 400,
        code:
          'PAGE_SIZE_EXCEEDED',
        details: {
          maxPageSize:
            max,
        },
      }
    );
  }

  const rawPage =
    params.get(
      pageParam
    );

  const page =
    rawPage === null ||
    rawPage === ''
      ? 1
      : Number(
          rawPage
        );

  if (
    !Number.isInteger(
      page
    ) ||
    page < 1
  ) {
    throw Object.assign(
      new Error(
        'page must be a positive integer.'
      ),
      {
        status: 400,
        code:
          'INVALID_PAGE',
      }
    );
  }

  return {
    page,
    pageSize,
    limit:
      pageSize,
    cursor:
      params.get(
        cursorParam
      ) || null,
  };
}

/* 16. CORS hardening */
export function assertTrustedOrigin(
  request,
  env,
  {
    allowedOrigins,
    allowNoOrigin = true,
  } = {}
) {
  const origin =
    request?.headers?.get(
      'Origin'
    );

  if (!origin) {
    if (
      allowNoOrigin
    ) {
      return true;
    }

    throw Object.assign(
      new Error(
        'Origin header is required.'
      ),
      {
        status: 403,
        code:
          'ORIGIN_REQUIRED',
      }
    );
  }

  const allowList =
    envOrigins(
      env,
      allowedOrigins
    );

  if (
    allowList.length
  ) {
    if (
      allowList.includes(
        origin
      )
    ) {
      return true;
    }

    throw Object.assign(
      new Error(
        'Request origin is not trusted.'
      ),
      {
        status: 403,
        code:
          'ORIGIN_REJECTED',
      }
    );
  }

  try {
    if (
      origin ===
      new URL(
        request.url
      ).origin
    ) {
      return true;
    }
  } catch {}

  throw Object.assign(
    new Error(
      'Request origin is not trusted.'
    ),
    {
      status: 403,
      code:
        'ORIGIN_REJECTED',
    }
  );
}

export function applyCors(
  response,
  request,
  env,
  {
    allowedOrigins,
    allowMethods = [
      'GET',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'OPTIONS',
    ],
    allowHeaders = [
      'Authorization',
      'Content-Type',
      DEFAULTS.requestIdHeader,
      'X-OVYX-Idempotency-Key',
    ],
  } = {}
) {
  const origin =
    request?.headers?.get(
      'Origin'
    );

  const allowList =
    envOrigins(
      env,
      allowedOrigins
    );

  const trusted =
    !origin ||
    (
      allowList.length
        ? allowList.includes(
            origin
          )
        : sameOrigin(
            request,
            origin
          )
    );

  const headers =
    new Headers(
      response?.headers ||
        {}
    );

  if (
    origin &&
    trusted
  ) {
    headers.set(
      'Access-Control-Allow-Origin',
      origin
    );

    headers.set(
      'Vary',
      'Origin'
    );
  }

  headers.set(
    'Access-Control-Allow-Methods',
    allowMethods.join(
      ', '
    )
  );

  headers.set(
    'Access-Control-Allow-Headers',
    allowHeaders.join(
      ', '
    )
  );

  headers.set(
    'Access-Control-Max-Age',
    '600'
  );

  return new Response(
    response?.body ??
      null,
    {
      status:
        response?.status ||
        200,
      statusText:
        response?.statusText ||
        '',
      headers,
    }
  );
}

function sameOrigin(
  request,
  origin
) {
  try {
    return (
      origin ===
      new URL(
        request.url
      ).origin
    );
  } catch {
    return false;
  }
}

/* Extra hardening: methods + security headers + fingerprints */
export function assertMethod(
  request,
  methods = []
) {
  const allowed =
    Array.isArray(
      methods
    )
      ? methods.map(
          value =>
            String(
              value
            ).toUpperCase()
        )
      : [];

  if (
    !allowed.length
  ) {
    return true;
  }

  const method =
    String(
      request?.method ||
        ''
    ).toUpperCase();

  if (
    !allowed.includes(
      method
    )
  ) {
    throw Object.assign(
      new Error(
        'HTTP method is not allowed.'
      ),
      {
        status: 405,
        code:
          'METHOD_NOT_ALLOWED',
        allowed,
      }
    );
  }

  return true;
}

export function applySecurityHeaders(
  response,
  requestId
) {
  const headers =
    new Headers(
      response?.headers ||
        {}
    );

  const baseline = {
    'X-Content-Type-Options':
      'nosniff',
    'X-Frame-Options':
      'DENY',
    'Referrer-Policy':
      'strict-origin-when-cross-origin',
    'Permissions-Policy':
      'camera=(), microphone=(), geolocation=(), payment=()',
    'Cross-Origin-Resource-Policy':
      'same-origin',
    'Cross-Origin-Opener-Policy':
      'same-origin',
    'Cache-Control':
      'no-store, no-cache, must-revalidate, private',
  };

  for (
    const [key, value] of Object.entries(
      baseline
    )
  ) {
    if (
      !headers.has(
        key
      )
    ) {
      headers.set(
        key,
        value
      );
    }
  }

  headers.set(
    DEFAULTS.requestIdHeader,
    requestId
  );

  return new Response(
    response?.body ??
      null,
    {
      status:
        response?.status ||
        200,
      statusText:
        response?.statusText ||
        '',
      headers,
    }
  );
}

export async function requestFingerprint(
  request,
  identity = ''
) {
  const url =
    new URL(
      request.url
    );

  let bodyDigest =
    '';

  if (
    !['GET', 'HEAD'].includes(
      String(
        request.method
      ).toUpperCase()
    )
  ) {
    try {
      bodyDigest =
        await sha256Hex(
          await request
            .clone()
            .text()
        );
    } catch {
      bodyDigest =
        'body-unavailable';
    }
  }

  const idempotencyKey =
    request.headers.get(
      'X-OVYX-Idempotency-Key'
    ) || '';

  return sha256Hex(
    [
      identity,
      request.method,
      url.origin,
      url.pathname,
      url.search,
      bodyDigest,
      idempotencyKey,
    ].join(
      '|'
    )
  );
}

async function sha256Hex(
  value
) {
  const data =
    typeof value === 'string'
      ? new TextEncoder().encode(
          value
        )
      : value instanceof Uint8Array
        ? value
        : new TextEncoder().encode(
            JSON.stringify(
              value
            )
          );

  const digest =
    await crypto.subtle.digest(
      'SHA-256',
      data
    );

  return Array.from(
    new Uint8Array(
      digest
    )
  )
    .map(
      byte =>
        byte
          .toString(
            16
          )
          .padStart(
            2,
            '0'
          )
    )
    .join('');
}

/* 1. Safe Handler Wrapper / master shield */
export async function safeHandler(
  context,
  handler,
  options = {}
) {
  const request =
    context?.request;

  if (!request) {
    return errorResponse(
      new Error(
        'Request context is missing.'
      ),
      {
        requestId:
          'unknown',
      }
    );
  }

  const requestId =
    getRequestId(
      request
    );

  const method =
    String(
      request.method ||
        'GET'
    ).toUpperCase();

  const routeKey =
    String(
      options.circuitKey ||
        new URL(
          request.url
        ).pathname
    ).slice(
      0,
      200
    );

  let limiter;

  const finish =
    response => {
      const rateHeaders =
        new Headers(
          response?.headers ||
            {}
        );

      if (
        limiter
      ) {
        rateHeaders.set(
          'X-OVYX-RateLimit-Limit',
          String(
            limiter.limit
          )
        );

        rateHeaders.set(
          'X-OVYX-RateLimit-Remaining',
          String(
            limiter.remaining
          )
        );

        rateHeaders.set(
          'X-OVYX-RateLimit-Reset',
          String(
            limiter.resetAt
          )
        );
      }

      const rateResponse =
        new Response(
          response?.body ??
            null,
          {
            status:
              response?.status ||
              200,
            statusText:
              response?.statusText ||
              '',
            headers:
              rateHeaders,
          }
        );

      return applySecurityHeaders(
        applyCors(
          rateResponse,
          request,
          context.env,
          {
            allowedOrigins:
              options.allowedOrigins,
          }
        ),
        requestId
      );
    };

  try {
    assertTrustedOrigin(
      request,
      context.env,
      {
        allowedOrigins:
          options.allowedOrigins,
        allowNoOrigin:
          options.allowNoOrigin !==
          false,
      }
    );

    assertMethod(
      request,
      options.methods ||
        []
    );

    checkEnv(
      context.env,
      options.requiredEnv ||
        []
    );

    limiter =
      await rateLimit(
        [
          clientIp(
            request
          ),
          routeKey,
        ].join(
          ':'
        ),
        {
          limit:
            options.rateLimit?.limit ??
            DEFAULTS.rateLimit,
          windowMs:
            options.rateLimit?.windowMs ??
            DEFAULTS.rateWindowMs,
          store:
            options.rateLimit?.store,
        }
      );

    if (
      !limiter.allowed
    ) {
      throw Object.assign(
        new Error(
          'Too many requests. Please try again shortly.'
        ),
        {
          status: 429,
          code:
            'RATE_LIMITED',
          details: {
            retryAt:
              limiter.resetAt,
          },
        }
      );
    }

    if (
      typeof options.validate ===
      'function'
    ) {
      context.data =
        context.data ||
        {};

      let input =
        context.data.input;

      if (
        input === undefined &&
        ['POST', 'PUT', 'PATCH', 'DELETE'].includes(
          method
        ) &&
        /application\/json/i.test(
          request.headers.get(
            'content-type'
          ) || ''
        )
      ) {
        input =
          await readJsonBody(
            request.clone(),
            options.maxBodyBytes ||
              DEFAULTS.maxBodyBytes
          );
      }

      if (
        options.sanitize
      ) {
        input =
          sanitizeInput(
            input,
            options.sanitizeOptions ||
              {}
          );
      }

      context.data.input =
        options.validate(
          input
        );
    } else if (
      options.sanitize &&
      context.data?.input !==
        undefined
    ) {
      context.data.input =
        sanitizeInput(
          context.data.input,
          options.sanitizeOptions ||
            {}
        );
    }

    if (
      options.pagination &&
      ['GET', 'HEAD'].includes(
        method
      )
    ) {
      context.data =
        context.data ||
        {};

      context.data.pagination =
        enforcePagination(
          request,
          options.pagination
        );
    }

    const execute =
      async () =>
        withCircuitBreaker(
          routeKey,
          () =>
            withTimeout(
              () =>
                handler(
                  context,
                  {
                    requestId,
                    retryAttempts:
                      clamp(
                        positiveInt(
                          options.retryAttempts,
                          DEFAULTS.retryAttempts
                        ),
                        1,
                        3
                      ),
                  }
                ),
              options.timeoutMs ||
                DEFAULTS.timeoutMs,
              'Request processing timed out.'
            ),
          options.circuitOptions ||
            {}
        ).then(
          result =>
            result instanceof Response
              ? result
              : normalizeResponse(
                  result
                ) ||
                new Response(
                  null,
                  {
                    status:
                      204,
                  }
                )
        );

    let response;

    const cacheable =
      options.cache ===
      true &&
      ['GET', 'HEAD'].includes(
        method
      );

    if (
      cacheable
    ) {
      const key =
        await requestFingerprint(
          request,
          routeKey
        );

      const cached =
        await cacheGetOrSet(
          key,
          execute,
          {
            ttlMs:
              options.cacheTtlMs ||
              DEFAULTS.cacheTtlMs,
            maxEntries:
              options.cacheMaxEntries ||
              DEFAULTS.cacheMaxEntries,
          }
        );

      response =
        cached.value;
    } else if (
      options.enableDedupe !==
        false &&
      ![
        'GET',
        'HEAD',
        'OPTIONS',
      ].includes(
        method
      )
    ) {
      const fingerprint =
        await requestFingerprint(
          request,
          context.data?.user?.sub ||
            context.data?.user?.uid ||
            ''
        );

      response =
        await deduplicate(
          fingerprint,
          execute,
          {
            windowMs:
              options.dedupeWindowMs ||
              DEFAULTS.dedupeWindowMs,
          }
        );
    } else {
      response =
        await execute();
    }

    return finish(
      response
    );
  } catch (error) {
    const normalized =
      asError(
        error
      );

    logError(
      normalized,
      {
        requestId,
        request,
        context,
        code:
          normalized.code,
        service:
          routeKey,
        sink:
          options.logger,
      }
    );

    if (
      options.fallback !==
      undefined
    ) {
      try {
        const value =
          await fallbackResponse(
            normalized,
            options.fallback
          );

        if (
          value
        ) {
          return finish(
            value
          );
        }
      } catch (
        fallbackError
      ) {
        logError(
          fallbackError,
          {
            requestId,
            request,
            context,
            code:
              'FALLBACK_FAILED',
            service:
              routeKey,
          }
        );
      }
    }

    return finish(
      errorResponse(
        normalized,
        {
          requestId,
          includeDetails:
            options.includeErrorDetails ===
            true,
        }
      )
    );
  }
}

/* Cloudflare Pages Functions middleware adapter */
export function createProtectionMiddleware(
  options = {}
) {
  return context =>
    safeHandler(
      context,
      currentContext =>
        currentContext.next(),
      options
    );
}

/* Route adapter */
export function protectRoute(
  routeHandler,
  options = {}
) {
  return context =>
    safeHandler(
      context,
      routeHandler,
      options
    );
}

/* Operational diagnostics */
export function protectionStats() {
  return {
    version:
      PROTECTION_VERSION,
    rateLimitEntries:
      rateWindows.size,
    dedupeEntries:
      dedupeEntries.size,
    cacheEntries:
      cacheEntries.size,
    circuitEntries:
      circuitStates.size,
  };
}

export function resetProtectionState() {
  rateWindows.clear();
  dedupeEntries.clear();
  cacheEntries.clear();
  circuitStates.clear();
}
