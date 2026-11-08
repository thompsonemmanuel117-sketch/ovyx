import { assertAuthenticated } from '../../_lib/firebase.js';
import { enforceSameOrigin, errorResponse, jsonResponse, readJson, requestId } from '../_lib/http.js';
import { resolveEntitlements } from '../entitlements.js';
import { getFirestoreDataAtPath } from '../_lib/firebase-admin.js';
import { assertOwnedSavedProject } from '../../_lib/backend-project-ownership.js';
import { createBackendProvisioningPlan } from '../../_lib/backend-provisioning.js';
import { createCloudflareD1Adapter } from '../../_lib/backend-cloudflare-adapter.js';
import { createCloudflarePagesPreviewBindingAdapter } from '../../_lib/backend-pages-preview-binding.js';
import {
  createFirestoreProvisioningRegistry,
  reserveBackendProvisioningOperation,
  transitionBackendProvisioningOperation,
} from '../../_lib/backend-provisioning-registry.js';

const MAX_BODY_BYTES = 32_000_000;
const MAX_FILES = 20_000;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const INTERNAL_FILES = new Set(['ovyx-backend-architecture.json', 'ovyx-qa-plan.json', 'wrangler.jsonc']);
const BACKEND_PATH = /^(?:functions|migrations|server|api|lib|db|src\/server|src\/lib\/server|src\/routes\/api|src\/app\/api|src\/api|src\/prisma|src\/drizzle|src\/db|src\/database|app\/api|pages\/api)\//i;
const PROVISIONABLE_BACKEND_PATH = /^(?:functions|migrations|server|api|lib|src\/server|src\/lib\/server)\//i;
const UNSUPPORTED_BACKEND_PATH = /^(?:app\/api|pages\/api|src\/pages\/api|src\/app\/api|src\/routes\/api|src\/api|src\/prisma|src\/drizzle|src\/db|src\/database|prisma|drizzle|app\/routes)\//i;
const ROOT_BACKEND_FILES = new Set(['package.json', 'package-lock.json', 'npm-shrinkwrap.json', 'tsconfig.json', 'vite.config.js', 'vite.config.ts', 'wrangler.jsonc', 'wrangler.json']);
const encoder = new TextEncoder();
const PAGES_D1_HEALTHCHECK_SOURCE = `const encoder = new TextEncoder();
const json = (status) => new Response(null, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
export async function onRequestGet({ request, env }) {
  try {
    if (!env.DB || typeof env.DB.prepare !== 'function') return json(503);
    const url = new URL(request.url);
    const probeId = url.searchParams.get('probeId') || '';
    const token = request.headers.get('x-ovyx-probe-token') || '';
    if (!/^[a-f0-9-]{36}$/i.test(probeId) || !/^[a-f0-9]{64}$/i.test(token)) return json(404);
    const digest = await crypto.subtle.digest('SHA-256', encoder.encode(token));
    const expected = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    const row = await env.DB.prepare('SELECT nonce_hash FROM _ovyx_health_probes WHERE probe_id = ?').bind(probeId).first();
    if (!row || typeof row.nonce_hash !== 'string' || row.nonce_hash.length !== expected.length) return json(404);
    let mismatch = 0;
    for (let index = 0; index < expected.length; index += 1) mismatch |= expected.charCodeAt(index) ^ row.nonce_hash.toLowerCase().charCodeAt(index);
    if (mismatch !== 0) return json(404);
    await env.DB.prepare('DELETE FROM _ovyx_health_probes WHERE probe_id = ?').bind(probeId).run();
    return json(204);
  } catch {
    return json(503);
  }
}`;
const SECRET_CONTENT_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\b(?:sk_(?:live|test|proj)_|whsec_|AIza[0-9A-Za-z_-]{30,}|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{20,})/i,
  /(?:["'](?:password|secret|token|api[_-]?key|authorization)["']\s*:\s*["'][^"']{16,}["'])/i,
];

function fail(code, message, status = 400) {
  throw Object.assign(new Error(message), { code, status });
}
function clean(value, max = 320) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}
function slug(value, fallback = 'site') {
  const name = clean(value, 100).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 36);
  return name || fallback;
}
function normalizeGraphFiles(project) {
  const graph = project?.ovyxGraph || project?.graph || {};
  const source = graph?.files || project?.files;
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    fail('BACKEND_PROJECT_SOURCE_NOT_SAVED', 'Save the website in Web Studio before provisioning its backend.', 409);
  }
  const result = {};
  for (const [rawPath, value] of Object.entries(source)) {
    const path = String(rawPath || '').replaceAll('\\', '/').trim();
    const record = typeof value === 'string' ? { content: value } : value;
    const text = typeof record?.content === 'string' ? record.content
      : typeof record?.text === 'string' ? record.text : '';
    const segments = path.split('/');
    if (!path || path.length > 500 || path.startsWith('/') || path.includes('..') || path.includes('\0') || path.includes('\r') || path.includes('\n') ||
        segments.some(part => !part || part === '.' || part === '..' ||
        ['.git', 'node_modules', '.wrangler', 'coverage', '.npmrc', '.yarnrc', '.pnp.cjs'].includes(part.toLowerCase())) ||
        segments.some(part => part === '.env' || part.startsWith('.env.') || part === '.dev.vars') ||
        /(?:secret|credential|private-key|service-account)/i.test(path) || ['.npmrc', '.yarnrc', '.pnp.cjs'].includes(path.toLowerCase())) {
      fail('BACKEND_PROJECT_FILE_PATH_INVALID', 'The saved website contains a file path that cannot be provisioned safely.');
    }
    if (text) result[path] = {
      content: text,
      encoding: String(record?.encoding || '').toLowerCase() === 'base64' ? 'base64' : 'text',
      contentType: clean(record?.contentType, 120),
    };
    if (Object.keys(result).length > MAX_FILES) fail('BACKEND_PROJECT_FILE_COUNT_INVALID', 'The saved website contains too many files for the backend build.');
  }
  if (!Object.keys(result).length) fail('BACKEND_PROJECT_SOURCE_EMPTY', 'The saved website source files are empty.', 409);
  return result;
}
function fileText(files, path) {
  const item = files[path];
  return typeof item === 'string' ? item : typeof item?.content === 'string' ? item.content : '';
}
async function projectSourceHash(files) {
  const manifest = Object.keys(files).sort().map(path => [
    path, fileText(files, path), files[path]?.encoding || 'text', files[path]?.contentType || '',
  ]);
  return sha256(encoder.encode(JSON.stringify(manifest)));
}
function parseJsonFile(files, path, code) {
  const source = fileText(files, path);
  if (!source) fail(code, 'The saved website is missing its trusted full-stack build manifest.', 422);
  try { return JSON.parse(source); } catch { fail(code, 'The saved website full-stack build manifest is invalid.', 422); }
}
function backendSourceFiles(files) {
  return Object.entries(files)
    .filter(([path]) => PROVISIONABLE_BACKEND_PATH.test(path) && !/^tests?\/|^__tests__\//i.test(path))
    .map(([path, item]) => ({ path, content: fileText(files, path) }))
    .filter(item => item.content);
}
function staticFiles(files) {
  const output = {};
  for (const [path, item] of Object.entries(files)) {
    if (INTERNAL_FILES.has(path) || ROOT_BACKEND_FILES.has(path) || BACKEND_PATH.test(path) ||
        /^(?:tests?|__tests__|test-results|coverage|\.wrangler|node_modules)\//i.test(path) ||
        path.split('/').some(part => part === '.env' || part.startsWith('.env.') || part === '.dev.vars') ||
        path.split('/').some(part => ['.npmrc', '.yarnrc', '.pnp.cjs'].includes(part.toLowerCase()))) continue;
    const content = fileText(files, path);
    if (!content) continue;
    let bytes;
    try {
      bytes = item?.encoding === 'base64'
        ? Uint8Array.from(atob(content), char => char.charCodeAt(0))
        : encoder.encode(content);
    } catch {
      fail('BACKEND_STATIC_FILE_ENCODING_INVALID', 'A saved website asset has invalid base64 content.', 422);
    }
    const scanText = item?.encoding === 'base64' ? new TextDecoder().decode(bytes) : content;
    if (SECRET_CONTENT_PATTERNS.some(pattern => pattern.test(scanText))) fail('BACKEND_SECRET_IN_STATIC_SOURCE', 'Secret-like content must be moved to a server-side secret binding before publishing.', 422);
    if (bytes.byteLength > MAX_FILE_BYTES) fail('BACKEND_STATIC_FILE_TOO_LARGE', 'A website asset exceeds the Cloudflare Pages file limit.', 413);
    output[path] = { content, encoding: item?.encoding || 'text', contentType: item?.contentType || '' };
  }
  if (!Object.keys(output).length) fail('BACKEND_STATIC_ASSETS_MISSING', 'The website has no static files to publish.', 422);
  return output;
}
async function sha256(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
}
function toBase64(bytes) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}
function mime(path) {
  const name = path.toLowerCase();
  if (name.endsWith('.html')) return 'text/html; charset=utf-8';
  if (name.endsWith('.css')) return 'text/css; charset=utf-8';
  if (name.endsWith('.js') || name.endsWith('.mjs')) return 'text/javascript; charset=utf-8';
  if (name.endsWith('.json')) return 'application/json; charset=utf-8';
  if (name.endsWith('.svg')) return 'image/svg+xml';
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  if (name.endsWith('.webp')) return 'image/webp';
  if (name.endsWith('.gif')) return 'image/gif';
  if (name.endsWith('.woff2')) return 'font/woff2';
  return 'application/octet-stream';
}
async function cloudflareRequest(path, env, init = {}, authToken = env.CLOUDFLARE_API_TOKEN) {
  if (!env.CLOUDFLARE_ACCOUNT_ID || !authToken) fail('BACKEND_CLOUDFLARE_NOT_CONFIGURED', 'Cloudflare provisioning is not configured.', 503);
  let response;
  try {
    response = await fetch('https://api.cloudflare.com/client/v4' + path, {
      ...init,
      headers: {
        Authorization: 'Bearer ' + authToken,
        Accept: 'application/json',
        ...(init.body === undefined || init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(init.headers || {}),
      },
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    fail('BACKEND_CLOUDFLARE_UNAVAILABLE', 'Cloudflare could not be reached. The provisioning operation needs safe recovery.', 503);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success !== true) {
    const error = new Error('Cloudflare rejected a customer backend provisioning operation.');
    error.status = response.status >= 400 && response.status <= 599 ? response.status : 502;
    error.code = 'BACKEND_CLOUDFLARE_REQUEST_FAILED';
    throw error;
  }
  return payload.result;
}

async function ensurePagesProject(env, name) {
  const path = '/accounts/' + encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID) + '/pages/projects/' + encodeURIComponent(name);
  try {
    const existing = await cloudflareRequest(path, env, { method: 'GET' });
    if (existing?.source?.type) fail('BACKEND_PAGES_SOURCE_CONFLICT', 'This Pages project is connected to another publishing source.', 409);
    return existing;
  } catch (error) {
    if (error.status !== 404) throw error;
    return cloudflareRequest('/accounts/' + encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID) + '/pages/projects', env, {
      method: 'POST', body: JSON.stringify({ name, production_branch: 'main' }),
    });
  }
}
async function uploadAssets(env, name, files) {
  const entries = Object.entries(files);
  const prepared = {};
  let total = 0;
  for (const [path, item] of entries) {
    let bytes;
    try {
      bytes = item.encoding === 'base64'
        ? Uint8Array.from(atob(item.content), char => char.charCodeAt(0))
        : encoder.encode(item.content);
    } catch {
      fail('BACKEND_STATIC_FILE_ENCODING_INVALID', 'A saved website asset has invalid base64 content.', 422);
    }
    total += bytes.byteLength;
    if (total > MAX_BODY_BYTES) fail('BACKEND_STATIC_ASSETS_TOO_LARGE', 'The website assets exceed the Preview deployment limit.', 413);
    prepared[path] = { hash: await sha256(bytes), value: toBase64(bytes), contentType: item.contentType || mime(path) };
  }
  const jwtResult = await cloudflareRequest('/accounts/' + encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID) + '/pages/projects/' + encodeURIComponent(name) + '/upload-token', env, { method: 'GET' });
  const jwt = jwtResult?.jwt;
  if (!jwt) fail('BACKEND_PAGES_UPLOAD_TOKEN_MISSING', 'Cloudflare did not issue an asset upload token.', 502);
  const all = Object.values(prepared);
  const checked = await cloudflareRequest('/pages/assets/check-missing', env, {
    method: 'POST', body: JSON.stringify({ hashes: all.map(item => item.hash) }),
  }, jwt);
  const missing = new Set(Array.isArray(checked) ? checked.map(String) : []);
  let batch = [], size = 0;
  const flush = async () => {
    if (!batch.length) return;
    await cloudflareRequest('/pages/assets/upload', env, { method: 'POST', body: JSON.stringify(batch) }, jwt);
    batch = []; size = 0;
  };
  for (const item of all.filter(file => missing.has(file.hash))) {
    const record = { key: item.hash, value: item.value, base64: true, metadata: { content_type: item.contentType } };
    const bytes = JSON.stringify(record).length;
    if (batch.length >= 25 || (size + bytes > 3_500_000 && batch.length)) await flush();
    batch.push(record); size += bytes;
  }
  await flush();
  const manifest = {};
  for (const [path, item] of Object.entries(prepared)) manifest[path] = item.hash;
  return { manifest, uploaded: { missing: missing.size, total: all.length } };
}
async function runtimeFetch(env, path, payload) {
  const secret = String(env.OVYX_BACKEND_RUNTIME_SECRET || '');
  if (secret.length < 32) fail('BACKEND_RUNTIME_NOT_CONFIGURED', 'The isolated backend build service is not configured.', 503);
  const raw = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signatureBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(timestamp + '.' + raw));
  const signature = Array.from(new Uint8Array(signatureBytes), value => value.toString(16).padStart(2, '0')).join('');
  const request = new Request('https://ovyx-backend-runtime.internal' + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-ovyx-timestamp': timestamp, 'x-ovyx-signature': signature },
    body: raw,
  });
  if (env.OVYX_BACKEND_RUNTIME && typeof env.OVYX_BACKEND_RUNTIME.fetch === 'function') {
    return env.OVYX_BACKEND_RUNTIME.fetch(request);
  }
  const rawUrl = String(env.OVYX_BACKEND_RUNTIME_URL || '').trim();
  let target;
  try { target = new URL(rawUrl); } catch { fail('BACKEND_RUNTIME_NOT_CONFIGURED', 'The isolated backend build service is not configured.', 503); }
  if (target.protocol !== 'https:' || target.username || target.password || target.search || target.hash ||
      /(?:^|\.)localhost$/i.test(target.hostname) || /\.(?:local|internal)$/i.test(target.hostname)) {
    fail('BACKEND_RUNTIME_URL_INVALID', 'The isolated backend build service URL is invalid.', 503);
  }
  target.pathname = path;
  return fetch(new Request(target.href, { method: 'POST', headers: request.headers, body: raw, redirect: 'error' }));
}
async function callRuntime(env, path, payload) {
  let response;
  try { response = await runtimeFetch(env, path, payload); }
  catch (error) { throw error; }
  const result = await response.json().catch(() => null);
  if (!response.ok || !result || result.ok === false || result.status === 'blocked' || result.status === 'failed') {
    fail('BACKEND_RUNTIME_' + (result?.status || 'FAILED').toUpperCase(), 'The isolated backend build or acceptance test did not pass. No customer deployment was promoted.', 422);
  }
  return result;
}
function deploymentSummary(item, projectName, environment) {
  const stages = Array.isArray(item?.stages) ? item.stages : [];
  const latest = item?.latest_stage || stages.find(stage => stage.status === 'active') || stages.at(-1) || {};
  const aliases = Array.isArray(item?.aliases) ? item.aliases.filter(value => typeof value === 'string' && value.startsWith('https://')) : [];
  return {
    deploymentId: String(item?.id || ''),
    pagesProjectName: projectName,
    environment: String(item?.environment || 'preview'),
    status: String(latest.status || item?.status || 'queued'),
    stage: String(latest.name || ''),
    url: environment === 'preview'
      ? (typeof item?.url === 'string' && item.url.startsWith('https://') ? item.url : aliases[0] || null)
      : (aliases[0] || (typeof item?.url === 'string' && item.url.startsWith('https://') ? item.url : null)),
    createdAt: item?.created_on || null,
  };
}
export async function onRequestPost(context) {
  const id = requestId(context.request);
  let current = null;
  let store = null;
  let operationId = '';
  let registryKey = '';
  let deploymentAttempted = false;
  try {
    if (!enforceSameOrigin(context.request)) return errorResponse(403, 'CORS_DENIED', 'Cross-origin backend provisioning requests are not allowed.', id);
    const user = assertAuthenticated(context.data?.user);
    if (user.emailVerified !== true) fail('BACKEND_EMAIL_VERIFICATION_REQUIRED', 'Verify your email before provisioning a customer backend.', 403);
    if (!context.env.CLOUDFLARE_ACCOUNT_ID || !context.env.CLOUDFLARE_API_TOKEN) fail('BACKEND_CLOUDFLARE_NOT_CONFIGURED', 'Cloudflare provisioning is not configured.', 503);
    const entitlement = await resolveEntitlements(context.env, user);
    if (entitlement?.capabilities?.cloudflareDeploy !== true || entitlement?.capabilities?.webStudio !== true) {
      fail('BACKEND_PROVISIONING_NOT_ENTITLED', 'Your OVYX plan does not include full-stack website provisioning.', 403);
    }
    const body = await readJson(context.request, MAX_BODY_BYTES);
    if (!body || typeof body !== 'object' || Array.isArray(body)) fail('BACKEND_REQUEST_INVALID', 'The provisioning request body must be a JSON object.');
    const targetEnvironment = body.environment == null || body.environment === 'preview' ? 'preview' : body.environment;
    if (!['preview', 'production'].includes(targetEnvironment)) fail('BACKEND_ENVIRONMENT_INVALID', 'Choose Preview or Production for this deployment.');
    const projectId = clean(body.projectId, 120);
    if (!/^[A-Za-z0-9_-]{1,120}$/.test(projectId)) fail('BACKEND_PROJECT_ID_INVALID', 'Choose a valid saved website first.');
    const email = clean(user.email, 320).toLowerCase();
    const savedProject = await getFirestoreDataAtPath(context.env, ['users', email, 'projects', projectId]);
    assertOwnedSavedProject(savedProject, { uid: user.uid, email, projectId });
    const files = normalizeGraphFiles(savedProject);
    const sourceHash = await projectSourceHash(files);
    const architecture = parseJsonFile(files, 'ovyx-backend-architecture.json', 'BACKEND_ARCHITECTURE_MISSING');
    const qaPlan = parseJsonFile(files, 'ovyx-qa-plan.json', 'BACKEND_QA_PLAN_MISSING');
    if (architecture.engine !== 'ovyx-fullstack-architecture' || architecture.architectureStatus !== 'planned-not-provisioned' ||
        architecture.capabilities?.backend !== true || !Array.isArray(architecture.apiContracts) || architecture.apiContracts.length < 1) {
      fail('BACKEND_ARCHITECTURE_INVALID', 'The saved website does not contain a valid OVYX full-stack architecture contract.', 422);
    }
    const databaseIntegration = Array.isArray(architecture.integrations)
      ? architecture.integrations.find(item => item?.capability === 'database') : null;
    const selectedDatabaseProvider = clean(databaseIntegration?.provider, 120).toLowerCase();
    if (architecture.capabilities.database === true &&
        selectedDatabaseProvider && selectedDatabaseProvider !== 'not-selected-by-architecture-planner' &&
        !/\bd1\b/.test(selectedDatabaseProvider)) {
      fail('BACKEND_DATABASE_PROVIDER_UNSUPPORTED', 'Automatic full-stack provisioning currently supports Cloudflare D1. The selected database provider must be connected through its own adapter before deployment.', 422);
    }
    if (qaPlan.version !== 1 || qaPlan.backendRequired !== true || !Array.isArray(qaPlan.backendChecks) ||
        qaPlan.backendChecks.length < 1 || qaPlan.backendChecks.length > 24) {
      fail('BACKEND_QA_PLAN_INVALID', 'The saved website does not contain an executable backend acceptance plan.', 422);
    }
    const backendFiles = backendSourceFiles(files);
    const unsupportedBackendFiles = Object.keys(files).filter(path => UNSUPPORTED_BACKEND_PATH.test(path));
    if (unsupportedBackendFiles.length) fail('BACKEND_FRAMEWORK_UNSUPPORTED', 'The saved website contains server files for a framework that is not supported by the Pages Functions provisioning adapter.', 422);
    if (!backendFiles.some(item => item.path.startsWith('functions/'))) {
      fail('BACKEND_FRAMEWORK_UNSUPPORTED', 'Automatic full-stack provisioning currently supports Cloudflare Pages Functions projects. Other server frameworks must remain on the manual deployment path.', 422);
    }
    if (backendFiles.length > 137) fail('BACKEND_SOURCE_FILE_COUNT_INVALID', 'The backend source contains too many files for the isolated build.', 422);
    const projectName = slug(savedProject.name || savedProject.title || 'site');
    const pagesIdentity = await pagesIdentityFor(user, projectId, projectName, context.env);
    const plan = await createBackendProvisioningPlan({
      ownerUid: user.uid, projectId, environment: targetEnvironment,
      architecture, files: backendFiles,
    });
    const packageManifest = fileText(files, 'package.json');
    const wranglerConfig = JSON.stringify({
      name: 'ovyx-generated-preview',
      compatibility_date: '2026-11-01',
      compatibility_flags: ['nodejs_compat'],
      ...(architecture.capabilities.database === true ? {
        d1_databases: [{
          binding: plan.resources.databaseBinding || 'DB',
          database_name: plan.resources.database,
          database_id: '00000000-0000-4000-8000-000000000000',
          migrations_dir: 'migrations',
        }],
      } : {}),
    });
    const runtimeFiles = backendFiles.concat([{ path: 'wrangler.jsonc', content: wranglerConfig }]);
    if (packageManifest) runtimeFiles.push({ path: 'package.json', content: packageManifest });
    const packageLock = fileText(files, 'package-lock.json');
    if (packageManifest && packageLock) runtimeFiles.push({ path: 'package-lock.json', content: packageLock });

    const evaluation = await callRuntime(context.env, '/evaluate', {
      version: 1, projectId,
      qaPlan: { version: 1, backendRequired: true, backendChecks: qaPlan.backendChecks },
      files: runtimeFiles,
    });
    if (evaluation.status !== 'passed') fail('BACKEND_ACCEPTANCE_NOT_PASSED', 'The generated backend did not pass its isolated database and API acceptance tests.', 422);
    store = createFirestoreProvisioningRegistry(context.env);
    if (targetEnvironment === 'production') {
      const previewRecord = await store.read(plan.namespace + '-preview');
      const [ownerHash, projectHash] = await Promise.all([
        sha256(encoder.encode(user.uid)), sha256(encoder.encode(projectId)),
      ]);
      if (!previewRecord || previewRecord.data.ownerHash !== ownerHash || previewRecord.data.projectHash !== projectHash ||
          previewRecord.data.state !== 'ready' || previewRecord.data.resourceIds?.sourceHash !== sourceHash ||
          previewRecord.data.resourceIds?.pagesProject !== pagesIdentity.name || !previewRecord.data.deploymentId) {
        fail('BACKEND_PREVIEW_NOT_READY', 'Verify the full-stack Preview successfully before publishing this website to Production.', 409);
      }
    }
    operationId = crypto.randomUUID().replace(/-/g, '');
    const reservation = await reserveBackendProvisioningOperation({
      store, plan, ownerUid: user.uid, projectId, operationId, leaseMs: 600_000,
    });
    registryKey = reservation.key;
    current = { data: reservation.data, updateTime: reservation.updateTime };
    if (reservation.outcome === 'already_ready') {
      return jsonResponse({ success: true, status: 'ready', alreadyProvisioned: true, deploymentId: reservation.data.deploymentId }, 200, { 'X-OVYX-Request-ID': id });
    }
    if (reservation.outcome === 'busy') fail('BACKEND_PROVISIONING_BUSY', 'A provisioning operation is already running for this website. Check its status before retrying.', 409);
    if (reservation.outcome === 'recovery_required') fail('BACKEND_PROVISIONING_RECOVERY_REQUIRED', 'The previous provisioning attempt needs a recovery check before another deployment can run.', 409);

    current = await transitionBackendProvisioningOperation({ store, key: registryKey, current, operationId, nextState: 'provisioning', leaseMs: 600_000 });
    const d1 = architecture.capabilities.database === true
      ? createCloudflareD1Adapter({ accountId: context.env.CLOUDFLARE_ACCOUNT_ID, apiToken: context.env.CLOUDFLARE_API_TOKEN })
      : null;
    let database = null;
    if (d1) {
      database = await d1.ensureDatabase({ name: plan.resources.database });
      current = await transitionBackendProvisioningOperation({
        store, key: registryKey, current, operationId, nextState: 'migrating',
        patch: { resourceIds: { database: database.id } }, leaseMs: 600_000,
      });
      const migrations = backendFiles
        .filter(file => /^migrations\/\d{4,}_[a-z0-9][a-z0-9_-]{0,79}\.sql$/i.test(file.path))
        .map(file => {
          const manifest = plan.migrations.find(item => item.path === file.path);
          return { version: manifest.version, sha256: manifest.sha256, content: file.content };
        });
      await d1.applyMigrations(database.id, migrations);
    }
    const pagesProjectName = await ensurePagesProject(context.env, pagesIdentity.name);
    if (database) {
      const binding = createCloudflarePagesPreviewBindingAdapter({
        accountId: context.env.CLOUDFLARE_ACCOUNT_ID,
        apiToken: context.env.CLOUDFLARE_API_TOKEN,
      });
      const bindEnvironment = targetEnvironment === 'production' ? binding.bindProductionD1 : binding.bindPreviewD1;
      await bindEnvironment({
        projectName: pagesProjectName,
        expectedProjectPrefix: pagesIdentity.prefix,
        databaseId: database.id,
        bindingName: plan.resources.databaseBinding || 'DB',
      });
    }
    if (current.data.state === 'provisioning' || current.data.state === 'migrating') {
      current = await transitionBackendProvisioningOperation({
        store, key: registryKey, current, operationId, nextState: 'building',
        patch: { migrationVersionsApplied: database ? plan.migrations.map(item => item.version) : [] },
        leaseMs: 600_000,
      });
    }
    if (database) runtimeFiles.push({ path: 'functions/api/__ovyx/healthcheck.js', content: PAGES_D1_HEALTHCHECK_SOURCE });
    const build = await callRuntime(context.env, '/build-pages', {
      version: 1, projectId, databaseId: database?.id || '',
      files: runtimeFiles,
    });
    if (!build.bundleBase64 || !build.routes) fail('BACKEND_BUILD_OUTPUT_INVALID', 'The isolated Pages build did not return a valid Worker bundle.', 502);

    const deploymentBranch = targetEnvironment === 'preview' ? 'ovyx-preview-' + operationId.slice(0, 12) : 'main';
    current = await transitionBackendProvisioningOperation({
      store, key: registryKey, current, operationId, nextState: 'deploying',
      patch: { resourceIds: { ...(current.data.resourceIds || {}), pagesProject: pagesProjectName, sourceHash, deploymentBranch, ...(database ? { database: database.id } : {}) } },
      leaseMs: 600_000,
    });
    const assets = staticFiles(files);
    const prepared = await uploadAssets(context.env, pagesProjectName, assets);
    const form = new FormData();
    form.append('manifest', JSON.stringify(prepared.manifest));
    if (targetEnvironment === 'preview') form.append('branch', deploymentBranch);
    form.append('commit_message', 'OVYX full-stack ' + targetEnvironment + ': ' + projectName + ' [OVYX-OP:' + operationId + ']');
    const bundle = Uint8Array.from(atob(build.bundleBase64), char => char.charCodeAt(0));
    if (!bundle.byteLength || bundle.byteLength > 25 * 1024 * 1024) fail('BACKEND_BUILD_BUNDLE_SIZE_INVALID', 'The generated Worker bundle exceeds the Pages upload limit.', 413);
    form.append('_worker.bundle', new Blob([bundle], { type: 'application/javascript' }), '_worker.bundle');
    form.append('_routes.json', new Blob([JSON.stringify(build.routes)], { type: 'application/json' }), '_routes.json');
    deploymentAttempted = true;
    const deployment = await cloudflareRequest(
      '/accounts/' + encodeURIComponent(context.env.CLOUDFLARE_ACCOUNT_ID) + '/pages/projects/' + encodeURIComponent(pagesProjectName) + '/deployments',
      context.env, { method: 'POST', body: form },
    );
    const summary = deploymentSummary(deployment, pagesProjectName, targetEnvironment);
    if (!summary.deploymentId) fail('BACKEND_DEPLOYMENT_ID_MISSING', 'Cloudflare did not return a Preview deployment ID.', 502);
    current = await transitionBackendProvisioningOperation({
      store, key: registryKey, current, operationId, nextState: 'verifying',
      patch: { deploymentId: summary.deploymentId },
      leaseMs: 600_000,
    });
    return jsonResponse({
      success: true, status: 'verifying', requestId: id, environment: targetEnvironment,
      projectId, pagesProjectName, database: database ? { name: database.name, id: database.id } : null,
      deployment: summary,
      acceptance: { status: evaluation.status, testsRun: evaluation.testsRun },
      next: 'Poll /api/backend/status?projectId=' + encodeURIComponent(projectId) + '&environment=' + targetEnvironment + ' until the deployment is verified.',
    }, 202, { 'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store' });
  } catch (error) {
    if (store && current?.data && current.updateTime && operationId && registryKey) {
      const providerRejectedWithoutDeployment = deploymentAttempted && Number.isInteger(error?.status) && error.status >= 400 && error.status < 500;
      const nextState = deploymentAttempted && !providerRejectedWithoutDeployment ? 'recovery_required' : 'failed';
      try {
        if (['reserved', 'provisioning', 'migrating', 'building', 'deploying'].includes(current.data.state)) {
          current = await transitionBackendProvisioningOperation({
            store, key: registryKey, current, operationId, nextState,
            patch: { lastErrorCode: clean(error?.code || 'BACKEND_PROVISIONING_FAILED', 80).toUpperCase().replace(/[^A-Z0-9_]/g, '_'), lastErrorAt: new Date().toISOString() },
            leaseMs: 600_000,
          });
        }
      } catch {}
    }
    const status = Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599 ? error.status : 502;
    return errorResponse(status, error?.code || 'BACKEND_PROVISIONING_FAILED', error?.message || 'The customer backend could not be provisioned safely.', id);
  }
}
async function pagesIdentityFor(user, projectId, projectName, env) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(user.uid + ':' + projectId));
  const hash = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
  const prefix = slug(env.CLOUDFLARE_PAGES_PROJECT_PREFIX || 'ovyx', 'ovyx') + '-' + hash.slice(0, 10) + '-';
  const name = slug(prefix + projectName);
  if (!name.startsWith(prefix)) fail('BACKEND_PAGES_PROJECT_NAME_INVALID', 'The customer Pages project identity is invalid.');
  return { prefix, name };
}
