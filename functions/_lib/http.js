export function getBearerToken(request) {
  const header = request?.headers?.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}

export function getRequestId(request) {
  return request?.headers?.get('x-ovyx-request-id') || crypto.randomUUID();
}

export function methodAllowed(request, methods = []) {
  const allowed = Array.isArray(methods)
    ? methods
    : String(methods).split(',');

  const normalized = allowed
    .map(x => String(x).trim().toUpperCase())
    .filter(Boolean);

  return normalized.includes(
    String(request?.method || '').toUpperCase()
  );
}

/*
 * Backward-compatible aliases.
 * Existing OVYX modules from the previous Agent bundle
 * can continue importing json() and requestId().
 */
export const json = jsonResponse;
export const requestId = getRequestId;

export function errorResponse(
  message,
  status = 400,
  code = 'BAD_REQUEST',
  extra = {}
) {
  return jsonResponse(
    {
      ok: false,
      error: message,
      code,
      ...extra,
    },
    status
  );
}

export async function readJson(
  request,
  maxBytes = 512_000
) {
  const contentLength = Number(
    request.headers.get('content-length') || 0
  );

  if (
    contentLength &&
    contentLength > maxBytes
  ) {
    throw Object.assign(
      new Error(
        `Request body exceeds ${maxBytes} bytes.`
      ),
      {
        status: 413,
        code: 'BODY_TOO_LARGE',
      }
    );
  }

  const text = await request.text();

  if (
    new TextEncoder()
      .encode(text)
      .byteLength > maxBytes
  ) {
    throw Object.assign(
      new Error(
        `Request body exceeds ${maxBytes} bytes.`
      ),
      {
        status: 413,
        code: 'BODY_TOO_LARGE',
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

export function sseResponse(run) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;

      const close = () => {
        if (!closed) {
          closed = true;

          try {
            controller.close();
          } catch {}
        }
      };

      const send = (event, data) => {
        if (closed) {
          return;
        }

        const payload =
          typeof data === 'string'
            ? data
            : JSON.stringify(data);

        controller.enqueue(
          encoder.encode(
            `event: ${event}\ndata: ${payload}\n\n`
          )
        );
      };

      try {
        send('connected', {
          ts: Date.now(),
        });

        await run(send);
      } catch (err) {
        send('error', {
          error:
            err?.message ||
            'Agent failed.',
          code:
            err?.code ||
            'AGENT_FAILED',
        });
      } finally {
        send('done', {
          ts: Date.now(),
        });

        close();
      }
    },

    cancel() {},
  });

  return new Response(stream, {
    headers: {
      'Content-Type':
        'text/event-stream; charset=utf-8',

      'Cache-Control':
        'no-cache, no-store, must-revalidate',

      'Connection':
        'keep-alive',

      'X-Accel-Buffering':
        'no',
    },
  });
}

export function withCors(
  response,
  request
) {
  const origin =
    request.headers.get('origin');

  const allowedOrigin =
    origin &&
    origin ===
      new URL(request.url).origin
      ? origin
      : null;

  const headers =
    new Headers(response.headers);

  if (allowedOrigin) {
    headers.set(
      'Access-Control-Allow-Origin',
      allowedOrigin
    );

    headers.set(
      'Vary',
      'Origin'
    );
  }

  headers.set(
    'Access-Control-Allow-Headers',
    'Authorization, Content-Type, X-OVYX-Signature, X-OVYX-Request-ID'
  );

  headers.set(
    'Access-Control-Allow-Methods',
    'GET, POST, OPTIONS'
  );

  return new Response(
    response.body,
    {
      status:
        response.status,

      statusText:
        response.statusText,

      headers,
    }
  );
}
