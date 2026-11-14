import { assertAuthenticated } from '../../_lib/firebase.js';
import { withCloudflareAIOnly, OVYX_CLOUDFLARE_ONLY_PROVIDER } from '../../_lib/cloudflare-routing.js';
import { requestId } from '../_lib/http.js';

function response(id, values, status = 200) {
  return Response.json(values, {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      'X-OVYX-Request-ID': String(id || ''),
    },
  });
}

export async function onRequestGet(context) {
  const id = requestId(context.request);
  try {
    assertAuthenticated(context.data?.user);
    const url = new URL(context.request.url);
    const requested = String(url.searchParams.get('provider') || 'automatic').trim().toLowerCase();
    const isCloudflare = [
      '', 'automatic', 'cloudflare', 'cloudflare-workers-ai', 'workers-ai', 'ovyx-native',
    ].includes(requested);

    if (!isCloudflare) {
      return response(id, {
        ok: false,
        error: 'AI_PROVIDER_DISABLED',
        message: 'OVYX uses Cloudflare Workers AI as its only AI model provider. Other provider routes are disabled.',
        requestedProvider: requested.slice(0, 80),
        provider: OVYX_CLOUDFLARE_ONLY_PROVIDER,
        routingPolicy: 'cloudflare-only',
      }, 409);
    }

    const env = withCloudflareAIOnly(context.env);
    const connected = Boolean(env.AI && typeof env.AI.run === 'function');
    return response(id, {
      ok: connected,
      provider: OVYX_CLOUDFLARE_ONLY_PROVIDER,
      label: 'Cloudflare Workers AI',
      status: connected ? 'READY' : 'NOT_CONFIGURED',
      configured: connected,
      connected,
      engineMode: env.OVYX_AI_ENGINE_MODE,
      routingPolicy: 'cloudflare-only',
      externalApiKeysRequired: false,
      message: connected
        ? 'OVYX AI is connected to Cloudflare Workers AI.'
        : 'OVYX is waiting for its Cloudflare Workers AI binding named AI.',
    });
  } catch (error) {
    return response(id, {
      ok: false,
      error: error?.code || 'PROVIDER_AVAILABILITY_FAILED',
      message: error?.message || 'Cloudflare AI availability could not be checked.',
    }, error?.status || 500);
  }
}

export async function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  return response(requestId(context.request), {
    ok: false,
    error: 'METHOD_NOT_ALLOWED',
    message: 'GET is required.',
  }, 405);
}
