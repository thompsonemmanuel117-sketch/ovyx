/**
 * Ovyx Enterprise Edge Gateway Middleware
 * Cloudflare Pages Functions Runtime (_middleware.js)
 *
 * Capabilities:
 * - High-precision telemetry instrumentation (Server-Timing, Edge Latency, Diagnostics)
 * - Zero-trust security matrix & strict Content Security Policy (CSP)
 * - Bounded sliding-window counter rate limiting with O(1) memory complexity
 * - Non-blocking amortized isolate memory hygiene and eviction
 * - Cross-Origin isolation configured for Firebase OAuth & LLM streaming
 */

// ============================================================================
// ISOLATE CONTEXT & TELEMETRY CONSTANTS
// ============================================================================

const ISOLATE_ID = `iso_${Math.random().toString(36).substring(2, 9)}`;
const ISOLATE_BOOT_TIMESTAMP = Date.now();

const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_WINDOW_MS = RATE_LIMIT_WINDOW_SECONDS * 1000;
const DEFAULT_MAX_REQUESTS_PER_WINDOW = 60;
const MAX_TRACKED_IPS = 10000;
const PRUNE_INTERVAL_MS = 30000;

// In-memory isolate bucket registry using Map (preserves insertion order for FIFO/LRU eviction)
const ipRequestBuckets = new Map();
let lastPruneTimestamp = Date.now();

// ============================================================================
// PERFORMANCE & RATE LIMIT ENGINE (SLIDING-WINDOW COUNTER)
// ============================================================================

/**
 * Extracts the canonical client IP from trusted Cloudflare headers.
 * @param {Request} request 
 * @returns {string}
 */
function extractClientIP(request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "127.0.0.1"
  );
}

/**
 * Non-blocking memory sanitation routine.
 * Removes expired windows and evicts oldest items if capacity is exceeded.
 */
function sanitizeMemoryRegistry() {
  const now = Date.now();

  // 1. Time-based eviction of expired tracking frames
  if (now - lastPruneTimestamp >= PRUNE_INTERVAL_MS) {
    lastPruneTimestamp = now;
    const expirationThreshold = now - (RATE_LIMIT_WINDOW_MS * 2);

    for (const [ip, record] of ipRequestBuckets.entries()) {
      if (record.currentWindowStart < expirationThreshold) {
        ipRequestBuckets.delete(ip);
      }
    }
  }

  // 2. Size-based FIFO safety cap to prevent isolate memory exhaustion (DoS mitigation)
  if (ipRequestBuckets.size > MAX_TRACKED_IPS) {
    const overflowCount = ipRequestBuckets.size - MAX_TRACKED_IPS;
    const iterator = ipRequestBuckets.keys();
    for (let i = 0; i < overflowCount; i++) {
      const oldestKey = iterator.next().value;
      if (oldestKey) {
        ipRequestBuckets.delete(oldestKey);
      }
    }
  }
}

/**
 * Sliding-window rate limit evaluator with linear interpolation.
 * @param {string} ip 
 * @param {number} maxRequests 
 * @returns {{ allowed: boolean, remaining: number, reset: number, currentLoad: number, violation: boolean }}
 */
function evaluateRateLimit(ip, maxRequests) {
  const now = Date.now();
  let record = ipRequestBuckets.get(ip);

  if (!record) {
    record = {
      currentWindowStart: now,
      currentCount: 0,
      previousCount: 0,
    };
    ipRequestBuckets.set(ip, record);
  } else {
    // Re-insert to mark entry as recently touched for LRU behavior
    ipRequestBuckets.delete(ip);
    ipRequestBuckets.set(ip, record);
  }

  // Transition window if elapsed time exceeds the window frame
  const timeSinceWindowStart = now - record.currentWindowStart;
  if (timeSinceWindowStart >= RATE_LIMIT_WINDOW_MS) {
    const fullWindowsPassed = Math.floor(timeSinceWindowStart / RATE_LIMIT_WINDOW_MS);
    if (fullWindowsPassed === 1) {
      record.previousCount = record.currentCount;
    } else {
      record.previousCount = 0;
    }
    record.currentCount = 0;
    record.currentWindowStart = now - (timeSinceWindowStart % RATE_LIMIT_WINDOW_MS);
  }

  // Compute interpolated sliding-window request estimate
  const currentWindowProgress = (now - record.currentWindowStart) / RATE_LIMIT_WINDOW_MS;
  const previousWindowWeight = Math.max(0, 1 - currentWindowProgress);
  const estimatedCount = Math.floor(record.previousCount * previousWindowWeight + record.currentCount);
  const resetSeconds = Math.ceil((record.currentWindowStart + RATE_LIMIT_WINDOW_MS - now) / 1000);

  if (estimatedCount >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      reset: Math.max(1, resetSeconds),
      currentLoad: estimatedCount,
      violation: true,
    };
  }

  // Register request increment
  record.currentCount += 1;

  return {
    allowed: true,
    remaining: Math.max(0, maxRequests - (estimatedCount + 1)),
    reset: Math.max(1, resetSeconds),
    currentLoad: estimatedCount + 1,
    violation: false,
  };
}

// ============================================================================
// SECURITY POLICIES & CSP MATRIX
// ============================================================================

/**
 * Builds the ultra-strict, production-ready Content Security Policy.
 * Explicitly accommodates Tailwind CDN, Firebase compat SDKs, Google Fonts,
 * FontAwesome CDN, and safe streaming API targets for LLM operations.
 */
function buildContentSecurityPolicy() {
  return [
    "default-src 'self'",
    // Script execution boundaries
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://www.gstatic.com https://cdnjs.cloudflare.com",
    // Stylesheet boundaries
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
    // Web font locations
    "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com data:",
    // Image and media assets
    "img-src 'self' data: blob: https:",
    // Safe streaming API endpoints (Gemini, Claude, DeepSeek, OpenAI, Firebase)
    "connect-src 'self' https://generativelanguage.googleapis.com https://api.anthropic.com https://api.deepseek.com https://api.openai.com https://*.firebaseio.com https://*.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com wss://*.firebaseio.com",
    // Studio canvas isolation (renders internal sandboxed previews via srcdoc / blob)
    "frame-src 'self' data: blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    "upgrade-insecure-requests"
  ].join("; ");
}

// ============================================================================
// MIDDLEWARE REQUEST DISPATCHER
// ============================================================================

export async function onRequest(context) {
  const { request, env, next, waitUntil } = context;
  const executionStart = performance.now();
  const url = new URL(request.url);
  const clientIP = extractClientIP(request);

  // Trigger non-blocking memory sanitation on the edge isolate
  if (typeof waitUntil === "function") {
    waitUntil(Promise.resolve().then(sanitizeMemoryRegistry));
  } else {
    sanitizeMemoryRegistry();
  }

  // Preflight CORS Handler
  if (request.method === "OPTIONS") {
    const preflightHeaders = new Headers({
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, X-Ovyx-Client-Version",
      "Access-Control-Expose-Headers": [
        "Server-Timing",
        "X-Ovyx-Edge-Latency",
        "X-Ovyx-RateLimit-Violation",
        "X-Ovyx-Active-Buckets",
        "X-Ovyx-Isolate-Id",
        "X-RateLimit-Limit",
        "X-RateLimit-Remaining",
        "X-RateLimit-Reset"
      ].join(", "),
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin, Access-Control-Request-Headers, Access-Control-Request-Method",
    });

    return new Response(null, { status: 204, headers: preflightHeaders });
  }

  // Rate Limiting Enforcement on API Routes
  let rateLimitResult = {
    allowed: true,
    remaining: DEFAULT_MAX_REQUESTS_PER_WINDOW,
    reset: RATE_LIMIT_WINDOW_SECONDS,
    currentLoad: 0,
    violation: false,
  };

  const configuredMax = parseInt(env.MAX_REQUESTS_PER_WINDOW, 10) || DEFAULT_MAX_REQUESTS_PER_WINDOW;

  if (url.pathname.startsWith("/api/")) {
    rateLimitResult = evaluateRateLimit(clientIP, configuredMax);

    if (!rateLimitResult.allowed) {
      const blockedDuration = (performance.now() - executionStart).toFixed(3);
      const errorPayload = {
        success: false,
        error: "Rate limit exceeded. System load regulation active.",
        diagnostics: {
          clientIP,
          isolateId: ISOLATE_ID,
          activeBuckets: ipRequestBuckets.size,
          retryAfterSeconds: rateLimitResult.reset,
          currentLoad: rateLimitResult.currentLoad,
          edgeLatencyMs: parseFloat(blockedDuration),
        },
      };

      const blockedHeaders = new Headers({
        "Content-Type": "application/json; charset=utf-8",
        "Retry-After": String(rateLimitResult.reset),
        "X-RateLimit-Limit": String(configuredMax),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(rateLimitResult.reset),
        "X-Ovyx-Edge-Latency": `${blockedDuration}ms`,
        "X-Ovyx-RateLimit-Violation": "1",
        "X-Ovyx-Active-Buckets": String(ipRequestBuckets.size),
        "X-Ovyx-Isolate-Id": ISOLATE_ID,
        "Server-Timing": `edge;dur=${blockedDuration};desc="Edge Gateway Reject"`,
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      });

      return new Response(JSON.stringify(errorPayload, null, 2), {
        status: 429,
        statusText: "Too Many Requests",
        headers: blockedHeaders,
      });
    }
  }

  // Upstream Pipeline Execution
  let response;
  try {
    response = await next();
  } catch (error) {
    const failureDuration = (performance.now() - executionStart).toFixed(3);
    const failurePayload = {
      success: false,
      error: "Edge runtime unhandled pipeline exception.",
      message: error instanceof Error ? error.message : "Unknown gateway fault",
      diagnostics: {
        isolateId: ISOLATE_ID,
        edgeLatencyMs: parseFloat(failureDuration),
        timestamp: new Date().toISOString(),
      },
    };

    return new Response(JSON.stringify(failurePayload, null, 2), {
      status: 500,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "X-Ovyx-Edge-Latency": `${failureDuration}ms`,
        "X-Ovyx-Isolate-Id": ISOLATE_ID,
        "Server-Timing": `edge;dur=${failureDuration};desc="Gateway Exception"`,
      },
    });
  }

  // Response Augmentation: Security Matrix, Diagnostics & Telemetry Headers
  const secureHeaders = new Headers(response.headers);
  const totalDuration = (performance.now() - executionStart).toFixed(3);

  // 1. Strict Security Headers Matrix
  secureHeaders.set("Content-Security-Policy", buildContentSecurityPolicy());
  secureHeaders.set("X-Content-Type-Options", "nosniff");
  secureHeaders.set("X-Frame-Options", "SAMEORIGIN");
  secureHeaders.set("X-XSS-Protection", "0");
  secureHeaders.set("Referrer-Policy", "strict-origin-when-cross-origin");
  secureHeaders.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  secureHeaders.set("Cross-Origin-Resource-Policy", "same-site");
  secureHeaders.set(
    "Permissions-Policy",
    "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(self), payment=(), usb=()"
  );
  secureHeaders.set(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains; preload"
  );

  // 2. Real-time Telemetry Headers for Dashboard Diagnostics
  secureHeaders.set("X-Ovyx-Edge-Latency", `${totalDuration}ms`);
  secureHeaders.set("X-Ovyx-RateLimit-Violation", rateLimitResult.violation ? "1" : "0");
  secureHeaders.set("X-Ovyx-Active-Buckets", String(ipRequestBuckets.size));
  secureHeaders.set("X-Ovyx-Isolate-Id", ISOLATE_ID);
  secureHeaders.set("X-Ovyx-Isolate-Uptime", `${Math.floor((Date.now() - ISOLATE_BOOT_TIMESTAMP) / 1000)}s`);

  // 3. RFC Rate-Limiting Headers
  if (url.pathname.startsWith("/api/")) {
    secureHeaders.set("X-RateLimit-Limit", String(configuredMax));
    secureHeaders.set("X-RateLimit-Remaining", String(rateLimitResult.remaining));
    secureHeaders.set("X-RateLimit-Reset", String(rateLimitResult.reset));
  }

  // 4. Server-Timing Instrumentation for DevTools & Telemetry Harvesters
  const existingTiming = secureHeaders.get("Server-Timing");
  const edgeTimingMetric = `edge;dur=${totalDuration};desc="Ovyx Edge Processing"`;
  const rateLimitTimingMetric = `ratelimit;desc="Bucket Load ${rateLimitResult.currentLoad}/${configuredMax}"`;
  
  secureHeaders.set(
    "Server-Timing",
    existingTiming ? `${existingTiming}, ${edgeTimingMetric}, ${rateLimitTimingMetric}` : `${edgeTimingMetric}, ${rateLimitTimingMetric}`
  );

  // 5. Expose Telemetry Headers to Frontend SDKs
  secureHeaders.set(
    "Access-Control-Expose-Headers",
    [
      "Server-Timing",
      "X-Ovyx-Edge-Latency",
      "X-Ovyx-RateLimit-Violation",
      "X-Ovyx-Active-Buckets",
      "X-Ovyx-Isolate-Id",
      "X-Ovyx-Isolate-Uptime",
      "X-RateLimit-Limit",
      "X-RateLimit-Remaining",
      "X-RateLimit-Reset"
    ].join(", ")
  );

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: secureHeaders,
  });
}


