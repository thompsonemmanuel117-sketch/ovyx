import { assertAuthenticated } from '../../_lib/firebase.js';
import { withCloudflareAIOnly, OVYX_CLOUDFLARE_ONLY_PROVIDER } from '../../_lib/cloudflare-routing.js';
import { errorResponse, requestId } from '../_lib/http.js';

const ROOT_EMAIL = 'ovyxsupportteam@gmail.com';

function isAdmin(user) {
  if (!user) return false;
  if (String(user.email || '').trim().toLowerCase() === ROOT_EMAIL) return true;
  if (user.admin === true || user.owner === true) return true;
  const role = String(user.role || '').trim().toUpperCase();
  return ['ROOT_SUPERUSER', 'OVYX OWNER', 'OWNER', 'ADMIN'].includes(role);
}

export async function onRequestGet(context) {
  const id = requestId(context.request);
  try {
    const user = assertAuthenticated(context.data?.user);
    if (!isAdmin(user)) {
      return errorResponse(403, 'ADMIN_REQUIRED', 'Admin authorization is required.', id);
    }

    const env = withCloudflareAIOnly(context.env);
    const workersAi = Boolean(env.AI && typeof env.AI.run === 'function');
    const status = workersAi ? 'READY' : 'DEGRADED';
    const cloudflareProvider = {
      provider: OVYX_CLOUDFLARE_ONLY_PROVIDER,
      label: 'Cloudflare Workers AI',
      status: workersAi ? 'READY' : 'NOT_CONFIGURED',
      configured: workersAi,
      connected: workersAi,
    };

    return Response.json({
      ok: true,
      status,
      authority: 'SERVER',
      engineMode: env.OVYX_AI_ENGINE_MODE,
      routingPolicy: 'cloudflare-only',
      externalApiKeysRequired: false,
      providers: [cloudflareProvider],
      additionalProviders: [],
      cloudflare: {
        workersAiBinding: workersAi,
        edgeRuntime: 'CLOUDFLARE_PAGES_FUNCTION',
      },
      checkedAt: new Date().toISOString(),
    }, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        'X-OVYX-Request-ID': id,
      },
    });
  } catch (error) {
    return errorResponse(
      error?.status || 500,
      error?.code || 'AI_STATUS_FAILED',
      error?.message || 'Cloudflare AI status could not be checked.',
      id,
    );
  }
}

export async function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  return errorResponse(405, 'METHOD_NOT_ALLOWED', 'GET is required.', requestId(context.request));
}
