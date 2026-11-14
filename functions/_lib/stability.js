```javascript
/**
 * OVYX Stability Middleware
 *
 * Route: Import this in any API endpoint to protect it
 *
 * What this does:
 *   - Rate limiting: stops abuse and spam
 *   - Error catching: prevents white crash screens
 *   - Request validation: checks requests before processing
 *   - Graceful fallback: fails nicely if a service goes down
 *
 * This file is SAFE — it only protects, never changes anything.
 *
 * Usage in your endpoints:
 *   import { withStability } from '../_lib/stability.js';
 *
 *   export const onRequestGet = withStability(async (context) => {
 *     // your normal code here
 *     return new Response('Hello');
 *   });
 */

// =====================================================
// RATE LIMITER
// =====================================================

const requestCounts = new Map();
const RATE_LIMIT_WINDOW_MS = 60_000;  // 1 minute
const RATE_LIMIT_MAX = 60;            // 60 requests per minute per IP

function checkRateLimit(request) {
  const ip = request.headers.get('CF-Connecting-IP') ||
             request.headers.get('X-Forwarded-For') ||
             'unknown';

  const now = Date.now();
  const key = ip;

  // Clean old entries every 5 minutes
  if (requestCounts.size > 10_000) {
    requestCounts.clear();
  }

  const entry = requestCounts.get(key);

  if (!entry) {
    requestCounts.set(key, { count: 1, firstRequest: now });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1 };
  }

  // Reset if window expired
  if (now - entry.firstRequest > RATE_LIMIT_WINDOW_MS) {
    requestCounts.set(key, { count: 1, firstRequest: now });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1 };
  }

  // Check limit
  if (entry.count >= RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0 };
  }

  entry.count += 1;
  return { allowed: true, remaining: RATE_LIMIT_MAX - entry.count };
}

// =====================================================
// ERROR HANDLER
// =====================================================

function safeErrorResponse(error, defaultMessage) {
  // Log the full error server-side (for debugging)
  console.error('[OVYX Stability]', {
    message: error?.message || 'Unknown error',
    stack: error?.stack?.split('\n').slice(0, 3).join(' '),
    timestamp: new Date().toISOString(),
  });

  // Return a clean, safe message to the user
  // Never expose internal details
  return new Response(
    JSON.stringify({
      ok: false,
      error: defaultMessage || 'Something went wrong. Please try again.',
      timestamp: new Date().toISOString(),
    }),
    {
      status: 500,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    }
  );
}

// =====================================================
// REQUEST VALIDATOR
// =====================================================

function validateRequest(request) {
  // Check content length (prevent huge payloads)
  const contentLength = parseInt(request.headers.get('Content-Length') || '0', 10);
  const MAX_BODY_SIZE = 1024 * 1024; // 1MB max

  if (contentLength > MAX_BODY_SIZE) {
    return {
      valid: false,
      error: 'Request body too large. Maximum 1MB allowed.',
    };
  }

  // Check for suspicious patterns in URL
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Block path traversal attempts
  if (pathname.includes('..') || pathname.includes('//')) {
    return {
      valid: false,
      error: 'Invalid request path.',
    };
  }

  return { valid: true };
}

// =====================================================
// SECURITY HEADERS
// =====================================================

function addSecurityHeaders(response) {
  // Clone the response and add security headers
  const newResponse = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });

  newResponse.headers.set('X-Content-Type-Options', 'nosniff');
  newResponse.headers.set('X-Frame-Options', 'DENY');
  newResponse.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  return newResponse;
}

// =====================================================
// MAIN MIDDLEWARE WRAPPER
// =====================================================

export function withStability(handler) {
  return async (context) => {
    const { request, env } = context;

    try {
      // 1. Validate the request
      const validation = validateRequest(request);

      if (!validation.valid) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: validation.error,
            timestamp: new Date().toISOString(),
          }),
          {
            status: 400,
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
              'Cache-Control': 'no-store, no-cache, must-revalidate',
            },
          }
        );
      }

      // 2. Check rate limit
      const rateLimit = checkRateLimit(request);

      if (!rateLimit.allowed) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: 'Too many requests. Please slow down and try again in a minute.',
            timestamp: new Date().toISOString(),
          }),
          {
            status: 429,
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
              'Cache-Control': 'no-store, no-cache, must-revalidate',
              'Retry-After': '60',
            },
          }
        );
      }

      // 3. Run the actual handler
      const response = await handler(context);

      // 4. Add security headers to the response
      return addSecurityHeaders(response);

    } catch (error) {
      // 5. Catch any error and return a clean message
      return safeErrorResponse(error, 'Something went wrong. Please try again.');
    }
  };
}

// =====================================================
// GRACEFUL FETCH HELPER
// =====================================================

/**
 * Use this instead of fetch() when calling external services
 * like GitHub, OPay, or Firebase. If the service is down,
 * it returns a clean error instead of crashing.
 */
export async function safeFetch(url, options = {}, timeoutMs = 10_000) {
  const controller = new AbortController();

  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    clearTimeout(timeout);
    return response;

  } catch (error) {
    clearTimeout(timeout);

    if (error.name === 'AbortError') {
      throw new Error('External service took too long to respond. Please try again.');
    }

    throw new Error('Could not reach external service. Please try again.');
  }
}
```
