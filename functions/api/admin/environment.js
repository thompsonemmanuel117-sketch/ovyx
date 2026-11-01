import { assertAuthenticated, hasAdminClaim } from '../../_lib/firebase.js';
import { getCloudflareEnvironmentInventory } from '../../_lib/cloudflare-environment.js';
import { errorResponse, requestId } from '../_lib/http.js';

const ROOT_EMAIL = 'ovyxsupportteam@gmail.com';

function isEnvironmentAdmin(user) {
  return Boolean(user) && (
    String(user.email || '').trim().toLowerCase() === ROOT_EMAIL ||
    hasAdminClaim(user) ||
    user.owner === true ||
    ['ROOT_SUPERUSER', 'OVYX OWNER', 'OWNER', 'ADMIN'].includes(
      String(user.role || '').trim().toUpperCase()
    )
  );
}

export async function onRequestGet(context) {
  const id = requestId(context.request);
  try {
    const user = assertAuthenticated(context.data?.user);
    if (!isEnvironmentAdmin(user)) {
      return errorResponse(403, 'ADMIN_REQUIRED', 'Admin authorization is required.', id);
    }

    const inventory = getCloudflareEnvironmentInventory(context.env);
    return Response.json({ ok: true, ...inventory, checkedAt: new Date().toISOString() }, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'Pragma': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        'X-OVYX-Request-ID': id,
      },
    });
  } catch (error) {
    return errorResponse(
      error?.status || 500,
      error?.code || 'ENVIRONMENT_DIAGNOSTICS_FAILED',
      error?.status === 401 ? 'Authentication is required.' : 'Cloudflare environment diagnostics are unavailable.',
      id,
    );
  }
}

export function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  return errorResponse(405, 'METHOD_NOT_ALLOWED', 'GET is required.', requestId(context.request));
}
