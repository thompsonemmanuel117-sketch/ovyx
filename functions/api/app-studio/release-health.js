import { authenticateRequest } from '../../_lib/firebase.js';
import { resolveEntitlements } from '../entitlements.js';
import { jsonResponse, requestId } from '../_lib/http.js';

const clean = (value, max = 240) => String(value ?? '').trim().slice(0, max);
const slug = (value, fallback = 'site') => clean(value, 100).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 36) || fallback;

async function cloudflareGet(path, env) {
  if (!env.CLOUDFLARE_API_TOKEN || !env.CLOUDFLARE_ACCOUNT_ID) {
    throw Object.assign(new Error('Cloudflare deployment configuration is missing.'), { status: 503, code: 'CLOUDFLARE_NOT_CONFIGURED' });
  }
  const response = await fetch('https://api.cloudflare.com/client/v4' + path, {
    headers: { Accept: 'application/json', Authorization: 'Bearer ' + env.CLOUDFLARE_API_TOKEN },
    cache: 'no-store'
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success !== true) {
    const message = Array.isArray(data.errors) && data.errors[0]?.message ? String(data.errors[0].message) : 'Cloudflare deployment status could not be read.';
    throw Object.assign(new Error(message), { status: response.status >= 400 && response.status < 500 ? response.status : 503, code: 'CLOUDFLARE_STATUS_FAILED' });
  }
  return data.result;
}

async function ownedPagesProjectName(user, projectId, projectName, env) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(user.uid + ':' + projectId));
  const hash = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
  return slug((env.CLOUDFLARE_PAGES_PROJECT_PREFIX || 'ovyx') + '-' + hash.slice(0, 10) + '-' + slug(projectName, 'site'));
}

function deploymentStage(deployment) {
  const stages = Array.isArray(deployment?.stages) ? deployment.stages : [];
  return stages.find(stage => stage?.status === 'active') || stages.at(-1) || null;
}

async function probePagesUrl(urlValue) {
  let url;
  try { url = new URL(String(urlValue || '')); } catch { return { checked: false, reachable: false, httpStatus: null, message: 'Cloudflare did not return a valid deployment URL.' }; }
  // Never accept a probe destination from the caller. Only probe HTTPS aliases returned
  // by the authenticated Cloudflare deployment API, and only on Cloudflare Pages hosts.
  if (url.protocol !== 'https:' || !url.hostname.toLowerCase().endsWith('.pages.dev') || url.username || url.password) {
    return { checked: false, reachable: false, httpStatus: null, message: 'No safe Cloudflare Pages URL was available for the public reachability check.' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url.href, {
      method: 'GET',
      redirect: 'manual',
      cache: 'no-store',
      headers: { Range: 'bytes=0-0', Accept: 'text/html,*/*;q=0.5' },
      signal: controller.signal
    });
    try { await response.body?.cancel(); } catch {}
    const ok = response.status >= 200 && response.status < 300;
    return {
      checked: true,
      reachable: ok,
      httpStatus: response.status,
      contentType: String(response.headers.get('content-type') || '').slice(0, 120),
      message: ok
        ? 'The published Pages URL returned a successful HTTP response.'
        : response.status >= 300 && response.status < 400
          ? 'The published URL returned a redirect; the health probe did not follow it.'
          : 'The published URL responded with HTTP ' + response.status + '.'
    };
  } catch (error) {
    return {
      checked: true,
      reachable: false,
      httpStatus: null,
      message: error?.name === 'AbortError'
        ? 'The public URL probe timed out after 8 seconds.'
        : 'The deployment was found, but the public URL could not be reached from the health checker.'
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function onRequestGet(context) {
  const id = requestId(context.request);
  try {
    const user = context.data?.user || await authenticateRequest(context.request, context.env);
    if (!user) return jsonResponse({ ok: false, error: 'Authentication required.', code: 'AUTH_REQUIRED' }, 401, { 'X-OVYX-Request-ID': id });
    if (!user.email || !user.uid || user.emailVerified !== true) {
      return jsonResponse({ ok: false, error: 'A signed-in, email-verified OVYX account is required for release diagnostics.', code: 'EMAIL_VERIFIED_ACCOUNT_REQUIRED' }, 403, { 'X-OVYX-Request-ID': id });
    }
    const entitlements = context.data?.entitlements || await resolveEntitlements(context.env, user);
    if (entitlements?.capabilities?.cloudflareDeploy !== true) {
      return jsonResponse({ ok: false, error: 'Your OVYX account is not authorized to inspect Cloudflare releases.', code: 'CLOUDFLARE_DEPLOY_NOT_INCLUDED' }, 403, { 'X-OVYX-Request-ID': id });
    }

    const query = new URL(context.request.url).searchParams;
    const projectId = clean(query.get('projectId'), 160);
    const deploymentId = clean(query.get('deploymentId'), 180);
    const projectName = clean(query.get('projectName'), 100);
    if (!/^[A-Za-z0-9_-]{1,160}$/.test(projectId) || !/^[A-Za-z0-9_-]{1,180}$/.test(deploymentId) || !projectName) {
      return jsonResponse({ ok: false, error: 'Valid projectId, deploymentId and projectName are required.', code: 'RELEASE_IDENTIFIERS_REQUIRED' }, 400, { 'X-OVYX-Request-ID': id });
    }

    const pagesProjectName = await ownedPagesProjectName(user, projectId, projectName, context.env);
    const deployment = await cloudflareGet(
      '/accounts/' + encodeURIComponent(context.env.CLOUDFLARE_ACCOUNT_ID) +
      '/pages/projects/' + encodeURIComponent(pagesProjectName) +
      '/deployments/' + encodeURIComponent(deploymentId),
      context.env
    );
    const aliases = Array.isArray(deployment?.aliases) ? deployment.aliases.filter(value => typeof value === 'string') : [];
    const pagesUrl = aliases.find(value => {
      try { const url = new URL(value); return url.protocol === 'https:' && url.hostname.toLowerCase().endsWith('.pages.dev'); } catch { return false; }
    }) || '';
    const stage = deploymentStage(deployment);
    const health = pagesUrl
      ? await probePagesUrl(pagesUrl)
      : { checked: false, reachable: false, httpStatus: null, message: 'Cloudflare returned no pages.dev alias, so the public URL probe was skipped.' };

    const active = stage?.status === 'active';
    const released = String(deployment?.environment || '').toLowerCase() === 'production';
    const status = active && released && health.reachable ? 'healthy' : active && released ? 'needs-attention' : 'deployment-pending';
    return jsonResponse({
      ok: true,
      authoritative: true,
      requestId: id,
      checkedAt: new Date().toISOString(),
      projectId,
      deployment: {
        deploymentId: String(deployment?.id || deploymentId),
        pagesProjectName,
        status: stage?.status || deployment?.status || 'unknown',
        stage: stage?.name || null,
        environment: deployment?.environment || 'unknown',
        url: pagesUrl || aliases[0] || deployment?.url || null,
        aliases,
        createdAt: deployment?.created_on || null,
        modifiedAt: deployment?.modified_on || null
      },
      health: {
        status,
        checked: health.checked,
        reachable: health.reachable,
        httpStatus: health.httpStatus,
        contentType: health.contentType || '',
        message: health.message
      }
    }, 200, { 'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store, max-age=0' });
  } catch (error) {
    const status = Number.isInteger(error?.status) ? error.status : 503;
    return jsonResponse({
      ok: false,
      error: status >= 500 ? 'Release diagnostics service is temporarily unavailable.' : error?.message || 'Release diagnostics failed.',
      code: error?.code || 'RELEASE_DIAGNOSTICS_FAILED',
      requestId: id
    }, status, { 'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store, max-age=0' });
  }
}

export async function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  return jsonResponse({ ok: false, error: 'GET is required.', code: 'METHOD_NOT_ALLOWED' }, 405, { 'Allow': 'GET', 'X-OVYX-Request-ID': requestId(context.request) });
}
