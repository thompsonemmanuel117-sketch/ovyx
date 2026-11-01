import { assertAuthenticated } from '../../_lib/firebase.js';
import { enforceSameOrigin, errorResponse, jsonResponse, readJson } from '../_lib/http.js';

const MAX_BODY_BYTES = 2_200_000;
const MAX_FILES = 140;
const MAX_FILE_BYTES = 280_000;
const ROOT_FILES = new Set([
  'wrangler.jsonc', 'wrangler.json', 'package.json', 'package-lock.json',
  'npm-shrinkwrap.json', 'ovyx-qa-plan.json', '_routes.json', '_headers',
]);
const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\b(?:sk_(?:live|test|proj)_|whsec_|AIza[0-9A-Za-z_-]{30,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_)[A-Za-z0-9_-]{12,}/i,
  /"(?:password|passcode|secret|token|api[_-]?key|authorization|card|cvv|cvc|iban|bank[_-]?account)"\s*:/i,
];

function safePath(raw) {
  const path = String(raw || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!path || path.length > 240 || path.split('/').some(part => !part || part === '.' || part === '..')) return '';
  if (/(?:^|\/)(?:\.git|node_modules|\.wrangler|\.next|coverage)(?:\/|$)/i.test(path)) return '';
  if (/(?:^|\/)(?:\.env(?:\..*)?|\.dev\.vars(?:\..*)?)$/i.test(path)) return '';
  if (ROOT_FILES.has(path) || /^(?:functions|migrations)\//i.test(path)) return path;
  return '';
}

function hex(bytes) {
  return Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, '0')).join('');
}

async function signBody(secret, timestamp, raw) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(timestamp + '.' + raw)));
}

function validateFiles(rawFiles) {
  if (!Array.isArray(rawFiles) || rawFiles.length < 1 || rawFiles.length > MAX_FILES) {
    throw Object.assign(new Error('The backend runtime received an invalid number of project files.'), { status: 400, code: 'BACKEND_RUNTIME_FILE_COUNT_INVALID' });
  }
  const seen = new Set();
  let total = 0;
  const files = [];
  for (const item of rawFiles) {
    const path = safePath(item?.path);
    if (!path || seen.has(path) || typeof item?.content !== 'string') {
      throw Object.assign(new Error('The backend runtime rejected an unsafe or duplicate project file path.'), { status: 400, code: 'BACKEND_RUNTIME_FILE_INVALID' });
    }
    const bytes = new TextEncoder().encode(item.content);
    if (bytes.byteLength > MAX_FILE_BYTES) {
      throw Object.assign(new Error('A project file exceeds the isolated runtime size limit.'), { status: 413, code: 'BACKEND_RUNTIME_FILE_TOO_LARGE' });
    }
    if (SECRET_PATTERNS.some(pattern => pattern.test(item.content))) {
      throw Object.assign(new Error('A secret-like value was found in the submitted source. Remove credentials from project files before running isolated tests.'), { status: 422, code: 'BACKEND_RUNTIME_SECRET_BLOCKED' });
    }
    total += bytes.byteLength;
    if (total > MAX_BODY_BYTES) {
      throw Object.assign(new Error('The submitted backend source exceeds the isolated runtime size limit.'), { status: 413, code: 'BACKEND_RUNTIME_SOURCE_TOO_LARGE' });
    }
    seen.add(path);
    files.push({ path, content: item.content });
  }
  if (!files.some(file => file.path === 'wrangler.jsonc' || file.path === 'wrangler.json')) {
    throw Object.assign(new Error('This backend runtime currently supports Cloudflare Pages projects with a wrangler.json or wrangler.jsonc configuration.'), { status: 422, code: 'BACKEND_RUNTIME_CONFIG_REQUIRED' });
  }
  return files;
}

function resolveRuntimeTarget(env) {
  if (env.OVYX_BACKEND_RUNTIME && typeof env.OVYX_BACKEND_RUNTIME.fetch === 'function') {
    return {
      fetch: request => env.OVYX_BACKEND_RUNTIME.fetch(request),
      request: new Request('https://ovyx-backend-runtime.internal/evaluate'),
    };
  }
  const raw = String(env.OVYX_BACKEND_RUNTIME_URL || '').trim();
  if (!raw) return null;
  let url;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
      /(?:^|\.)localhost$/i.test(url.hostname) || /\.(?:local|internal)$/i.test(url.hostname)) return null;
  url.pathname = '/evaluate';
  return { fetch: (request, init) => fetch(request, init), request: new Request(url.href) };
}

export async function onRequestPost(context) {
  try {
    if (!enforceSameOrigin(context.request)) {
      return errorResponse('Cross-origin backend runtime requests are not allowed.', 403, 'CORS_DENIED');
    }
    const user = assertAuthenticated(context.data?.user);
    const payload = await readJson(context.request, MAX_BODY_BYTES);
    const projectId = String(payload.projectId || '').trim().slice(0, 160);
    const plan = payload.qaPlan;
    if (!projectId) return errorResponse('A Web Studio project ID is required.', 400, 'PROJECT_ID_REQUIRED');
    if (!plan || plan.version !== 1 || plan.backendRequired !== true ||
        !Array.isArray(plan.backendChecks) || plan.backendChecks.length < 1 || plan.backendChecks.length > 24) {
      return errorResponse('This project has no valid backend runtime test plan.', 422, 'BACKEND_QA_PLAN_INVALID');
    }
    const files = validateFiles(payload.files);
    const target = resolveRuntimeTarget(context.env);
    const secret = String(context.env.OVYX_BACKEND_RUNTIME_SECRET || '');
    if (!target || secret.length < 32) {
      return jsonResponse({
        channel: 'backend',
        status: 'blocked',
        testsRun: 0,
        findings: [{
          severity: 'warning',
          code: 'BACKEND_RUNTIME_NOT_CONFIGURED',
          message: 'The isolated backend runtime service is not connected. Configure the OVYX_BACKEND_RUNTIME service binding (or OVYX_BACKEND_RUNTIME_URL) and the matching OVYX_BACKEND_RUNTIME_SECRET in Cloudflare Pages.',
        }],
      }, 503);
    }
    const body = JSON.stringify({
      version: 1,
      projectId,
      qaPlan: { version: 1, backendRequired: true, backendChecks: plan.backendChecks },
      files,
    });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = await signBody(secret, timestamp, body);
    const request = new Request(target.request.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-ovyx-timestamp': timestamp,
        'x-ovyx-signature': signature,
      },
      body,
    });
    let response;
    try {
      response = await target.fetch(request, { redirect: 'error', signal: AbortSignal.timeout(230_000) });
    } catch {
      return jsonResponse({
        channel: 'backend',
        status: 'blocked',
        testsRun: 0,
        findings: [{ severity: 'warning', code: 'BACKEND_RUNTIME_UNAVAILABLE', message: 'The isolated backend runtime could not be reached. No backend checks were marked as passed.' }],
      }, 503);
    }
    let evidence;
    try { evidence = await response.json(); } catch { evidence = null; }
    if (!evidence || evidence.channel !== 'backend' || !['passed', 'failed', 'blocked', 'not-required'].includes(evidence.status)) {
      return jsonResponse({
        channel: 'backend',
        status: 'blocked',
        testsRun: 0,
        findings: [{ severity: 'warning', code: 'BACKEND_RUNTIME_RESPONSE_INVALID', message: 'The isolated backend runtime returned an invalid evidence report. No backend checks were marked as passed.' }],
      }, 502);
    }
    return jsonResponse({
      ...evidence,
      requestedAt: new Date().toISOString(),
      projectId,
      runtimeService: 'cloudflare-sandbox-pages-d1',
      authenticatedUser: user.uid,
    }, 200);
  } catch (error) {
    return errorResponse(error?.message || 'The isolated backend runtime request failed.', error?.status || 500, error?.code || 'BACKEND_RUNTIME_FAILED');
  }
}
