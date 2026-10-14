import { verifyFirebaseIdToken } from '../_lib/auth.js';
import { errorResponse, jsonResponse, readJson, getRequestId } from '../_lib/http.js';
import {
  getFirestoreDataAtPath,
  setFirestoreDocumentAtPath,
  deleteFirestoreDocumentAtPath,
} from '../../_lib/firebase-admin.js';
import { isSentinelAdmin } from '../../_lib/ovyx-sentinel.js';
import { prepareGuardianPatch, createGuardianPullRequest, guardianPatchablePath } from '../../_lib/ovyx-guardian-patch.js';

function originAllowed(request) {
  const origin = String(request.headers.get('origin') || '').trim();
  if (!origin) return true;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}

async function requireRootAdmin(context) {
  const auth = await verifyFirebaseIdToken(context.request, context.env || {});
  if (!auth.ok) return { ok: false, response: auth.response };
  if (!isSentinelAdmin(auth.user)) {
    return { ok: false, response: errorResponse(403, 'GUARDIAN_ADMIN_REQUIRED', 'Guardian patch tools are available only to the verified root administrator.') };
  }
  return { ok: true, user: auth.user };
}

function capability(env) {
  const read = typeof env?.OVYX_GUARDIAN_GITHUB_READ_TOKEN === 'string' && env.OVYX_GUARDIAN_GITHUB_READ_TOKEN.trim().length >= 20;
  const write = typeof env?.OVYX_GUARDIAN_GITHUB_WRITE_TOKEN === 'string' && env.OVYX_GUARDIAN_GITHUB_WRITE_TOKEN.trim().length >= 20;
  const ai = !!env?.AI && typeof env.AI.run === 'function';
  return {
    reasoningConfigured: ai,
    repositoryReadConfigured: read,
    repositoryWriteConfigured: write,
    patchPreparationReady: ai && read,
    pullRequestCreationReady: ai && read && write,
    directMainWritesEnabled: false,
    automaticMergeEnabled: false,
    productionDeploymentsEnabled: false,
    message: !ai
      ? 'Guardian patch preparation needs the existing Cloudflare Workers AI binding named AI.'
      : !read
        ? 'Add the separate read-only OVYX_GUARDIAN_GITHUB_READ_TOKEN to prepare source patches.'
        : !write
          ? 'Patch previews can be prepared, but creating a review pull request needs a separate least-privilege OVYX_GUARDIAN_GITHUB_WRITE_TOKEN. Guardian never writes directly to main.'
          : 'Guardian can prepare a patch and create a review pull request on a dedicated branch. It cannot merge or deploy.',
  };
}

function proposalPath(id) {
  return ['ovyx_guardian', 'patches', 'proposals', id];
}

export async function onRequestGet(context) {
  const requestId = getRequestId(context.request);
  if (!originAllowed(context.request)) return errorResponse(403, 'ORIGIN_REJECTED', 'Cross-origin Guardian patch requests are not permitted.', requestId);
  const auth = await requireRootAdmin(context);
  if (!auth.ok) return auth.response;
  return jsonResponse({ ok: true, administratorOnly: true, guardian: capability(context.env || {}) }, 200, {
    'X-OVYX-Request-ID': requestId,
    'Cache-Control': 'no-store',
  });
}

export async function onRequestPost(context) {
  const requestId = getRequestId(context.request);
  if (!originAllowed(context.request)) return errorResponse(403, 'ORIGIN_REJECTED', 'Cross-origin Guardian patch requests are not permitted.', requestId);
  const auth = await requireRootAdmin(context);
  if (!auth.ok) return auth.response;

  let body;
  try { body = await readJson(context.request, 6000); }
  catch (error) {
    return errorResponse(error?.status || 400, error?.code || 'INVALID_JSON', error?.message || 'Invalid request body.', requestId);
  }

  const env = context.env || {};
  const action = String(body.action || '');
  if (action === 'prepare') {
    let proposal;
    try {
      proposal = await prepareGuardianPatch({
        path: body.path,
        task: body.task,
        env,
        fetchImpl: fetch,
      });
      const stored = {
        id: proposal.proposalId,
        proposalId: proposal.proposalId,
        userId: String(auth.user.uid || auth.user.sub || ''),
        path: proposal.path,
        baseSha: proposal.baseSha,
        summary: proposal.summary,
        content: proposal.content,
        preview: proposal.preview,
        createdAt: proposal.createdAt,
        expiresAt: proposal.expiresAt,
        status: 'pending',
      };
      await setFirestoreDocumentAtPath(env, proposalPath(proposal.proposalId), stored, { merge: false });
      return jsonResponse({
        ok: true,
        proposalId: proposal.proposalId,
        path: proposal.path,
        summary: proposal.summary,
        preview: proposal.preview,
        expiresAt: proposal.expiresAt,
        changesApplied: false,
        pullRequestCreated: false,
      }, 200, { 'X-OVYX-Request-ID': requestId, 'Cache-Control': 'no-store' });
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : 503;
      return errorResponse(status, String(error?.code || 'GUARDIAN_PATCH_PREPARE_FAILED').slice(0, 100),
        String(error?.message || 'Guardian could not prepare a patch preview.').slice(0, 420), requestId);
    }
  }

  if (action === 'apply') {
    const proposalId = String(body.proposalId || '').trim();
    if (!/^[a-f0-9]{32}$/i.test(proposalId)) {
      return errorResponse(400, 'GUARDIAN_PATCH_ID_INVALID', 'The patch proposal ID is invalid.', requestId);
    }
    if (String(body.confirmation || '') !== 'CREATE_PULL_REQUEST') {
      return errorResponse(400, 'GUARDIAN_PATCH_CONFIRMATION_REQUIRED', 'Review the proposed diff and type CREATE_PULL_REQUEST to create a review pull request. No code has been changed.', requestId);
    }
    let proposal;
    try { proposal = await getFirestoreDataAtPath(env, proposalPath(proposalId)); }
    catch {
      return errorResponse(503, 'GUARDIAN_PATCH_STORE_UNAVAILABLE', 'Guardian could not load the private patch proposal. No GitHub changes were made.', requestId);
    }
    if (!proposal) return errorResponse(404, 'GUARDIAN_PATCH_NOT_FOUND', 'The patch proposal was not found or has expired.', requestId);
    const proposalExpiry = Date.parse(String(proposal.expiresAt || ''));
    if (!Number.isFinite(proposalExpiry) || proposalExpiry <= Date.now()) {
      try { await deleteFirestoreDocumentAtPath(env, proposalPath(proposalId)); } catch {}
      return errorResponse(410, 'GUARDIAN_PATCH_EXPIRED', 'This patch proposal expired. Prepare a fresh proposal before creating a pull request.', requestId);
    }
    if (!guardianPatchablePath(proposal.path)) return errorResponse(400, 'GUARDIAN_PATCH_PATH_REJECTED', 'This proposal targets a path Guardian is not allowed to modify.', requestId);

    let result;
    try {
      result = await createGuardianPullRequest({
        proposal: { ...proposal, id: proposalId },
        userId: String(auth.user.uid || auth.user.sub || ''),
        env,
        fetchImpl: fetch,
      });
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : 503;
      return errorResponse(status, String(error?.code || 'GUARDIAN_PATCH_APPLY_FAILED').slice(0, 100),
        String(error?.message || 'Guardian could not create the review pull request.').slice(0, 420), requestId);
    }

    let historySaved = false;
    try {
      await setFirestoreDocumentAtPath(env, proposalPath(proposalId), {
        status: 'submitted',
        submittedAt: new Date().toISOString(),
        pullRequestUrl: result.pullRequestUrl,
        pullRequestNumber: result.pullRequestNumber,
      }, { merge: true });
      historySaved = true;
    } catch {}
    return jsonResponse({
      ok: true,
      ...result,
      historySaved,
      message: 'Review pull request created. Guardian did not merge the change or deploy production.',
      requestId,
    }, 200, { 'X-OVYX-Request-ID': requestId, 'Cache-Control': 'no-store' });
  }

  return errorResponse(400, 'GUARDIAN_PATCH_ACTION_INVALID', 'Supported actions are prepare and apply.', requestId);
}

export async function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  if (context.request.method === 'POST') return onRequestPost(context);
  return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Use GET to inspect Guardian patch capabilities or POST to prepare/apply a reviewed patch.', getRequestId(context.request));
}
