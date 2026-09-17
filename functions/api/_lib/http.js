export const SECURITY_HEADERS = Object.freeze({
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
  'Pragma': 'no-cache',
  'Expires': '0',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Robots-Tag': 'noindex, nofollow, noarchive'
});

export function jsonResponse(payload, status = 200, extraHeaders = {}) {
  const headers = new Headers(SECURITY_HEADERS);

  Object.entries(extraHeaders).forEach(([key, value]) => {
    headers.set(key, String(value));
  });

  return new Response(JSON.stringify(payload), {
    status,
    headers
  });
}

export function errorResponse(status, code, message, requestId) {
  return jsonResponse(
    {
      ok: false,
      error: code,
      message,
      requestId: requestId || null
    },
    status
  );
}

export function getRequestId(request) {
  const incoming = request.headers.get('CF-Ray');

  if (incoming && /^[A-Za-z0-9._:-]{1,160}$/.test(incoming)) {
    return incoming;
  }

  return crypto.randomUUID();
}

export function getBearerToken(request) {
  const value = request.headers.get('Authorization') || '';

  if (!value.startsWith('Bearer ')) {
    return null;
  }

  const token = value.slice(7).trim();

  if (!token || token.length > 8192) {
    return null;
  }

  return token;
}

export function enforceSameOrigin(request) {
  const origin = request.headers.get('Origin');

  if (!origin) {
    return true;
  }

  try {
    const requestOrigin = new URL(request.url).origin;
    return origin === requestOrigin;
  } catch {
    return false;
  }
}

export function methodAllowed(request, methods) {
  return methods.includes(request.method.toUpperCase());
}

export function isValidCapabilityName(value) {
  return [
    'webStudio',
    'advancedWebStudio',
    'appStudio',
    'gameStudio',
    'aiGeneration',
    'github',
    'cloudflareDeploy',
    'teamWorkspace'
  ].includes(String(value || ''));
    }
