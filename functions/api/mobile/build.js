import { authenticateRequest } from '../../_lib/firebase.js';
import { setFirestoreDocument } from '../../_lib/firebase-admin.js';
import { readJson, jsonResponse, requestId } from '../_lib/http.js';

const MAX_PAYLOAD_BYTES = 820_000;
const PLATFORMS = new Set(['android', 'ios']);
const PRIVATE_KEY_PATTERN = /(^|_)(api[_-]?key|access[_-]?token|auth[_-]?token|refresh[_-]?token|secret|password|authorization|private[_-]?key|service[_-]?account|credential)(_|$)/i;

function clean(value, max = 240) {
  return String(value ?? '').trim().slice(0, max);
}

function safeBuildValue(value, depth = 0) {
  if (depth > 8 || value == null) return value;
  if (typeof value === 'string') return value.slice(0, 300_000);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 120).map(item => safeBuildValue(item, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (PRIVATE_KEY_PATTERN.test(key)) continue;
      out[key] = safeBuildValue(item, depth + 1);
    }
    return out;
  }
  return null;
}

function normalizePlatforms(value) {
  const raw = Array.isArray(value)
    ? value
    : String(value || '').split(',');
  return [...new Set(raw.map(x => String(x).trim().toLowerCase()).filter(PLATFORMS.has, PLATFORMS))];
}

function slug(value) {
  return clean(value, 64).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 42) || 'ovyx-app';
}

function publicBaseUrl(request, env) {
  return clean(env?.OVYX_PUBLIC_BASE_URL || '', 500) || new URL(request.url).origin;
}

export async function onRequestPost(context) {
  const id = requestId(context.request);

  try {
    const user = context.data?.user || await authenticateRequest(context.request, context.env);
    const userId = clean(user?.sub || user?.uid || '', 180);
    if (!userId) {
      return jsonResponse({ ok: false, error: 'Authentication required.', code: 'AUTH_REQUIRED' }, 401, { 'X-OVYX-Request-ID': id });
    }

    const easToken = clean(context.env.EXPO_TOKEN, 5000);
    const easProjectId = clean(context.env.EXPO_PROJECT_ID, 160);
    const workflowFile = clean(context.env.EXPO_WORKFLOW_FILE || 'ovyx-mobile-build.yml', 160);
    const gitRef = clean(context.env.EXPO_GIT_REF || 'main', 200);
    const payloadSecret = clean(context.env.OVYX_MOBILE_PAYLOAD_SECRET, 5000);

    if (!easToken || !easProjectId || !payloadSecret) {
      return jsonResponse({
        ok: false,
        error: 'The Expo/EAS mobile build service is not configured on the server.',
        code: 'EAS_BUILD_NOT_CONFIGURED'
      }, 503, { 'X-OVYX-Request-ID': id });
    }

    const body = await readJson(context.request, MAX_PAYLOAD_BYTES);
    const appName = clean(body.appName || body.displayName || 'OVYX Mobile App', 60);
    const platforms = normalizePlatforms(body.platforms);
    const iconDataUrl = clean(body.iconDataUrl || '', 220_000);
    const payload = safeBuildValue(body.payload || null);
    const projectId = clean(body.sourceProjectId || payload?.source?.projectId || 'current', 180);

    if (!appName) throw Object.assign(new Error('App display name is required.'), { status: 400, code: 'APP_NAME_REQUIRED' });
    if (!platforms.length) throw Object.assign(new Error('Select at least one build platform.'), { status: 400, code: 'PLATFORM_REQUIRED' });
    if (!/^data:image/png;base64,[A-Za-z0-9+/=]+$/i.test(iconDataUrl)) {
      throw Object.assign(new Error('A PNG app icon is required.'), { status: 400, code: 'PNG_ICON_REQUIRED' });
    }
    if (!payload || typeof payload !== 'object') {
      throw Object.assign(new Error('A Web Studio payload is required before starting a mobile build.'), { status: 400, code: 'WEB_PAYLOAD_REQUIRED' });
    }

    const serialized = JSON.stringify({ payload, iconDataUrl, appName, projectId });
    const payloadBytes = new TextEncoder().encode(serialized).byteLength;
    if (payloadBytes > MAX_PAYLOAD_BYTES) {
      throw Object.assign(new Error('The selected website payload is too large for the mobile build handoff.'), { status: 413, code: 'MOBILE_PAYLOAD_TOO_LARGE' });
    }

    const jobId = crypto.randomUUID();
    const expires = String(Date.now() + 30 * 60 * 1000);
    const payloadSignatureBuffer = await crypto.subtle.sign(
      { name: 'HMAC' },
      await crypto.subtle.importKey('raw', new TextEncoder().encode(payloadSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']),
      new TextEncoder().encode(`${jobId}.${expires}`)
    );
    const payloadSignature = [...new Uint8Array(payloadSignatureBuffer)].map(b => b.toString(16).padStart(2, '0')).join('');

    await setFirestoreDocument(context.env, 'mobile_builds', jobId, {
      jobId,
      userId,
      sourceProjectId: projectId,
      appName,
      appSlug: slug(`${projectId}-${appName}`),
      platforms,
      status: 'queued',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      payload,
      iconDataUrl,
      payloadExpiresAt: expires,
      payloadSignature,
      workflowRunId: null,
      artifacts: {},
      errors: []
    }, { merge: false });

    const response = await fetch('https://api.expo.dev/v2/workflows/dispatch', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${easToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        appId: easProjectId,
        gitRef,
        fileName: workflowFile,
        inputs: {
          job_id: jobId,
          display_name: appName,
          platforms: platforms.join(','),
          payload_expires: expires,
          payload_signature: payloadSignature,
          project_slug: slug(`${projectId}-${appName}`)
        }
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.data?.id) {
      await setFirestoreDocument(context.env, 'mobile_builds', jobId, {
        status: 'failed',
        updatedAt: new Date().toISOString(),
        errors: [{ code: 'EAS_DISPATCH_FAILED', message: `EAS workflow dispatch returned HTTP ${response.status}.` }]
      }, { merge: true });
      throw Object.assign(new Error(data?.message || `EAS workflow dispatch returned HTTP ${response.status}.`), { status: response.status >= 400 && response.status < 500 ? response.status : 503, code: 'EAS_DISPATCH_FAILED' });
    }

    await setFirestoreDocument(context.env, 'mobile_builds', jobId, {
      workflowRunId: String(data.data.id),
      workflowUrl: String(data.data.url || ''),
      status: 'queued',
      updatedAt: new Date().toISOString()
    }, { merge: true });

    return jsonResponse({
      ok: true,
      jobId,
      status: 'queued',
      workflowRunId: String(data.data.id),
      workflowUrl: String(data.data.url || ''),
      statusEndpoint: `/api/mobile/build/status?jobId=${encodeURIComponent(jobId)}`,
      payloadEndpoint: `${publicBaseUrl(context.request, context.env)}/api/mobile/build/payload`
    }, 202, { 'X-OVYX-Request-ID': id });
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: error?.message || 'Unable to start the mobile build.',
      code: error?.code || 'MOBILE_BUILD_START_FAILED'
    }, error?.status || 500, { 'X-OVYX-Request-ID': id });
  }
}

export async function onRequest(context) {
  if (context.request.method === 'POST') return onRequestPost(context);
  return jsonResponse({ ok: false, error: 'POST is required.', code: 'METHOD_NOT_ALLOWED' }, 405);
}
