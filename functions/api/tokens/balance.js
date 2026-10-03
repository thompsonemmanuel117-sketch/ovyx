import { authenticateRequest } from '../../_lib/firebase.js';
import { getQuotaState } from '../../_lib/token-quota.js';
import { jsonResponse, requestId } from '../_lib/http.js';

export async function onRequestGet(context) {
  const id = requestId(context.request);

  try {
    const user =
      context.data?.user ||
      await authenticateRequest(context.request, context.env);

    const quota = await getQuotaState(context.env, user);

    return jsonResponse(
      {
        ok: true,
        ...quota,
        baseRemaining: quota.current_monthly_tokens,
        boosterTokens: Number(quota.boosterTokens || 0),
        checkedAt: new Date().toISOString(),
      },
      200,
      { 'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store, max-age=0' }
    );
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: error?.message || 'Quota balance unavailable.',
        code: error?.code || 'QUOTA_BALANCE_UNAVAILABLE',
      },
      error?.status || 500,
      { 'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store, max-age=0' }
    );
  }
}

export async function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  return jsonResponse({ ok: false, error: 'GET is required.', code: 'METHOD_NOT_ALLOWED' }, 405);
}
