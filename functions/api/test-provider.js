import { assertAuthenticated } from '../_lib/firebase.js';
import { withCloudflareAIOnly, OVYX_CLOUDFLARE_ONLY_PROVIDER } from '../_lib/cloudflare-routing.js';
import { errorResponse, requestId, readJson } from './_lib/http.js';

const ROOT_EMAIL = 'ovyxsupportteam@gmail.com';

function authorized(user) {
  const email = String(user?.email || '').trim().toLowerCase();
  const role = String(user?.role || '').trim().toUpperCase();
  return email === ROOT_EMAIL ||
    ['ROOT_SUPERUSER', 'OVYX OWNER', 'OWNER', 'ADMIN'].includes(role) ||
    user?.admin === true ||
    user?.owner === true;
}

export async function onRequest(context) {
  const id = requestId(context.request);
  try {
    const user = assertAuthenticated(context.data?.user);
    if (!authorized(user)) {
      return errorResponse(403, 'ADMIN_REQUIRED', 'Admin authorization is required.', id);
    }
    if (!['GET', 'POST'].includes(context.request.method)) {
      return errorResponse(405, 'METHOD_NOT_ALLOWED', 'GET or POST is required.', id);
    }

    let requested = 'automatic';
    if (context.request.method === 'GET') {
      requested = String(new URL(context.request.url).searchParams.get('provider') || 'automatic').trim().toLowerCase();
    } else {
      const body = await readJson(context.request, 16 * 1024);
      requested = String(body?.provider || body?.context?.provider || 'automatic').trim().toLowerCase();
    }

    const allowed = ['', 'automatic', 'cloudflare', 'cloudflare-workers-ai', 'workers-ai', 'ovyx-native'];
    if (!allowed.includes(requested)) {
      return errorResponse(409, 'AI_PROVIDER_DISABLED',
        'OVYX uses Cloudflare Workers AI as its only AI model provider. Third-party provider tests are disabled.', id);
    }

    const env = withCloudflareAIOnly(context.env);
    const connected = Boolean(env.AI && typeof env.AI.run === 'function');
    return Response.json({
      ok: connected,
      provider: OVYX_CLOUDFLARE_ONLY_PROVIDER,
      label: 'Cloudflare Workers AI',
      status: connected ? 'READY' : 'NOT_CONFIGURED',
      configured: connected,
      connected,
      engineMode: env.OVYX_AI_ENGINE_MODE,
      routingPolicy: 'cloudflare-only',
      externalApiKeysRequired: false,
      checkedAt: new Date().toISOString(),
      message: connected
        ? 'The Cloudflare Workers AI binding is present. This check does not spend inference quota.'
        : 'The Cloudflare Workers AI binding named AI is missing from this deployment.',
    }, {
      status: 200,
      headers: { 'Cache-Control': 'no-store, max-age=0', 'X-OVYX-Request-ID': id },
    });
  } catch (error) {
    return errorResponse(
      error?.status || 500,
      error?.code || 'TEST_PROVIDER_FAILED',
      error?.message || 'Cloudflare AI binding check failed.',
      id,
    );
  }
}
