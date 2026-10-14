import { verifyFirebaseIdToken } from '../_lib/auth.js';
import { errorResponse, jsonResponse, readJson, getRequestId } from '../_lib/http.js';
import { isSentinelAdmin } from '../../_lib/ovyx-sentinel.js';
import { investigateGuardianRepository } from '../../_lib/ovyx-guardian-repo.js';

function originAllowed(request) {
  const origin = String(request.headers.get('origin') || '').trim();
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

async function requireRootAdmin(context) {
  const auth = await verifyFirebaseIdToken(context.request, context.env || {});
  if (!auth.ok) return { ok: false, response: auth.response };
  if (!isSentinelAdmin(auth.user)) {
    return {
      ok: false,
      response: errorResponse(403, 'GUARDIAN_ADMIN_REQUIRED', 'Repository investigation is available only to the verified root administrator.'),
    };
  }
  return { ok: true, user: auth.user };
}

export async function onRequestGet(context) {
  const id = getRequestId(context.request);
  if (!originAllowed(context.request)) {
    return errorResponse(403, 'ORIGIN_REJECTED', 'Cross-origin Guardian requests are not permitted.', id);
  }
  const auth = await requireRootAdmin(context);
  if (!auth.ok) return auth.response;
  const env = context.env || {};
  const repoReadConfigured = typeof env.OVYX_GUARDIAN_GITHUB_READ_TOKEN === 'string' && env.OVYX_GUARDIAN_GITHUB_READ_TOKEN.trim().length >= 20;
  const reasoningConfigured = !!env.AI && typeof env.AI.run === 'function';
  return jsonResponse({
    ok: true,
    administratorOnly: true,
    guardian: {
      reasoningConfigured,
      repositoryReadConfigured: repoReadConfigured,
      ciMetadataConfigured: typeof env.OVYX_SENTINEL_GITHUB_TOKEN === 'string' && env.OVYX_SENTINEL_GITHUB_TOKEN.trim().length >= 20,
      readOnlyInvestigationReady: reasoningConfigured && repoReadConfigured,
      codeChangesEnabled: false,
      productionDeploymentsEnabled: false,
      message: reasoningConfigured && repoReadConfigured
        ? 'Read-only source investigation is ready. Guardian cannot edit code or deploy from this endpoint.'
        : !reasoningConfigured
          ? 'Add the existing Cloudflare Workers AI binding named AI to enable Guardian reasoning.'
          : 'Configure a dedicated, read-only OVYX_GUARDIAN_GITHUB_READ_TOKEN secret to enable repository source investigation. The Sentinel Actions token and AI provider keys are not reused.',
    },
  }, 200, { 'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store' });
}

export async function onRequestPost(context) {
  const id = getRequestId(context.request);
  if (!originAllowed(context.request)) {
    return errorResponse(403, 'ORIGIN_REJECTED', 'Cross-origin Guardian requests are not permitted.', id);
  }
  const auth = await requireRootAdmin(context);
  if (!auth.ok) return auth.response;

  let body;
  try {
    body = await readJson(context.request, 6000);
  } catch (error) {
    return errorResponse(error?.status || 400, error?.code || 'INVALID_JSON', error?.message || 'Invalid request body.', id);
  }
  if (String(body.action || '') !== 'investigate') {
    return errorResponse(400, 'GUARDIAN_ACTION_REQUIRED', 'Supported action: investigate.', id);
  }

  try {
    const result = await investigateGuardianRepository({
      question: body.question,
      env: context.env || {},
      fetchImpl: fetch,
    });
    return jsonResponse({
      ok: true,
      ...result,
      administratorOnly: true,
      requestId: id,
    }, 200, { 'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store' });
  } catch (error) {
    const status = Number.isInteger(error?.status) ? error.status : 503;
    const code = String(error?.code || 'GUARDIAN_INVESTIGATION_FAILED').slice(0, 100);
    const message = String(error?.message || 'Guardian could not investigate the repository.').slice(0, 360);
    return errorResponse(status, code, message, id);
  }
}

export async function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  if (context.request.method === 'POST') return onRequestPost(context);
  return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Use GET to check Guardian capabilities or POST to investigate the repository.', getRequestId(context.request));
}
