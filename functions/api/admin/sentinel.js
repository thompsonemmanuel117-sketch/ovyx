import { verifyFirebaseIdToken } from '../_lib/auth.js';
import {
  getFirestoreDataAtPath,
  setFirestoreDocumentAtPath,
  listFirestoreSubcollectionDocumentsAtPath,
} from '../../_lib/firebase-admin.js';
import { errorResponse, jsonResponse, readJson, getRequestId } from '../_lib/http.js';
import {
  collectSentinelChecks,
  createSentinelReport,
  createSentinelFixPlan,
  isSentinelAdmin,
  sentinelCronSecretMatches,
} from '../../_lib/ovyx-sentinel.js';

function originAllowed(request) {
  const origin = String(request.headers.get('origin') || '').trim();
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

async function requireAdmin(context) {
  const auth = await verifyFirebaseIdToken(context.request, context.env || {});
  if (!auth.ok) return { ok: false, response: auth.response };
  if (!isSentinelAdmin(auth.user)) {
    return {
      ok: false,
      response: errorResponse(403, 'SENTINEL_ADMIN_REQUIRED', 'OVYX Sentinel is available only to the verified root administrator.'),
    };
  }
  return { ok: true, user: auth.user };
}

async function readState(env) {
  return await getFirestoreDataAtPath(env, ['ovyx_sentinel', 'state']) || {};
}

async function runAndPersist(context, source) {
  const env = context.env || {};
  const startedAt = Date.now();
  const previous = await readState(env);
  const scan = await collectSentinelChecks({
    origin: new URL(context.request.url).origin,
    env,
    fetchImpl: fetch,
  });
  const id = 'run_' + Date.now().toString(36) + '_' + crypto.randomUUID().replace(/-/g, '').slice(0, 10);
  const report = createSentinelReport({
    scan,
    id,
    source,
    previousScheduledAt: previous.lastScheduledAt || null,
  });

  // Reports contain only endpoint paths, HTTP status, bounded durations,
  // approved environment-variable names, and allowlisted error codes. No
  // response bodies, user project content, credentials, or private messages
  // are stored in Sentinel history.
  await setFirestoreDocumentAtPath(
    env,
    ['ovyx_sentinel', 'state', 'runs', id],
    report,
    { merge: false },
  );

  const stateUpdate = {
    latestReport: report,
    lastScanAt: report.finishedAt,
    updatedAt: new Date().toISOString(),
    totalRuns: Math.max(0, Number(previous.totalRuns) || 0) + 1,
  };
  if (source === 'scheduled') stateUpdate.lastScheduledAt = report.finishedAt;

  await setFirestoreDocumentAtPath(env, ['ovyx_sentinel', 'state'], stateUpdate, { merge: true });
  return report;
}

export async function onRequestGet(context) {
  const requestId = getRequestId(context.request);
  if (!originAllowed(context.request)) {
    return errorResponse(403, 'ORIGIN_REJECTED', 'Cross-origin Sentinel requests are not permitted.', requestId);
  }
  const auth = await requireAdmin(context);
  if (!auth.ok) return auth.response;

  try {
    const state = await readState(context.env || {});
    const rows = await listFirestoreSubcollectionDocumentsAtPath(
      context.env || {},
      ['ovyx_sentinel', 'state'],
      'runs',
      20,
    );
    const reports = rows
      .map(row => ({ ...(row.data || {}), id: String(row.id || row.data?.id || '') }))
      .sort((a, b) => String(b.finishedAt || '').localeCompare(String(a.finishedAt || '')))
      .slice(0, 20);

    const latestReport = state.latestReport || reports[0] || null;
    return jsonResponse({
      ok: true,
      administratorOnly: true,
      latestReport,
      fixPlan: createSentinelFixPlan(latestReport),
      lastScanAt: state.lastScanAt || null,
      lastScheduledAt: state.lastScheduledAt || null,
      totalRuns: Math.max(0, Number(state.totalRuns) || 0),
      reports,
    }, 200, { 'X-OVYX-Request-ID': requestId });
  } catch (error) {
    console.error('[OVYX SENTINEL GET ' + requestId + ']', String(error?.code || error?.message || 'state read failed').slice(0, 180));
    return errorResponse(503, 'SENTINEL_STATE_UNAVAILABLE', 'Sentinel could not load its saved report history. Check Firebase/Firestore configuration.', requestId);
  }
}

export async function onRequestPost(context) {
  const requestId = getRequestId(context.request);
  const env = context.env || {};
  const providedCronSecret = String(context.request.headers.get('x-ovyx-sentinel-cron-secret') || '');
  let source = 'manual';

  if (providedCronSecret) {
    const expectedCronSecret = String(env.OVYX_SENTINEL_CRON_SECRET || '');
    if (expectedCronSecret.length < 32 || !sentinelCronSecretMatches(providedCronSecret, expectedCronSecret)) {
      return errorResponse(401, 'SENTINEL_CRON_AUTH_FAILED', 'Scheduled Sentinel authentication failed.', requestId);
    }
    source = 'scheduled';
  } else {
    if (!originAllowed(context.request)) {
      return errorResponse(403, 'ORIGIN_REJECTED', 'Cross-origin Sentinel requests are not permitted.', requestId);
    }
    const auth = await requireAdmin(context);
    if (!auth.ok) return auth.response;
  }

  let body;
  try {
    body = await readJson(context.request, 4000);
  } catch (error) {
    return errorResponse(error?.status || 400, error?.code || 'INVALID_JSON', error?.message || 'Invalid request body.', requestId);
  }
  if (String(body.action || '') !== 'scan') {
    return errorResponse(400, 'SENTINEL_ACTION_REQUIRED', 'Supported action: scan.', requestId);
  }

  try {
    const report = await runAndPersist(context, source);
    return jsonResponse({
      ok: true,
      report,
      fixPlan: createSentinelFixPlan(report),
      message: source === 'scheduled' ? 'Scheduled Sentinel checks completed.' : 'Sentinel checks completed.',
    }, 200, { 'X-OVYX-Request-ID': requestId });
  } catch (error) {
    console.error('[OVYX SENTINEL SCAN ' + requestId + ']', String(error?.code || error?.message || 'scan failed').slice(0, 180));
    return errorResponse(503, 'SENTINEL_SCAN_FAILED', 'Sentinel could not finish and save its scan. Check the platform and Firestore configuration.', requestId);
  }
}

export async function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  if (context.request.method === 'POST') return onRequestPost(context);
  return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Use GET to view reports or POST to run a scan.', getRequestId(context.request));
}
