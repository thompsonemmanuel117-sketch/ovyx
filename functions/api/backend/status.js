import { assertAuthenticated } from '../../_lib/firebase.js';
import { enforceSameOrigin, errorResponse, jsonResponse } from '../_lib/http.js';
import { getFirestoreDataAtPath } from '../_lib/firebase-admin.js';
import { assertOwnedSavedProject } from '../../_lib/backend-project-ownership.js';
import { createBackendProvisioningPlan } from '../../_lib/backend-provisioning.js';
import { createCloudflareD1Adapter } from '../../_lib/backend-cloudflare-adapter.js';
import {
  createFirestoreProvisioningRegistry,
  transitionBackendProvisioningOperation,
} from '../../_lib/backend-provisioning-registry.js';

const encoder = new TextEncoder();
const PROVISIONABLE_BACKEND_PATH = /^(?:functions|migrations|server|api|lib|src\/server|src\/lib\/server)\//i;
const UNSUPPORTED_BACKEND_PATH = /^(?:app\/api|pages\/api|src\/pages\/api|src\/app\/api|src\/routes\/api|src\/api|src\/prisma|src\/drizzle|src\/db|src\/database|prisma|drizzle|db|database|app\/routes)\//i;
const clean = (value, max = 320) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
function fail(code, message, status = 400) { throw Object.assign(new Error(message), { code, status }); }
function slug(value, fallback = 'site') {
  const name = clean(value, 100).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 36);
  return name || fallback;
}
function graphFiles(project) {
  const source = (project?.ovyxGraph || project?.graph || {})?.files || project?.files;
  if (!source || typeof source !== 'object' || Array.isArray(source)) fail('BACKEND_PROJECT_SOURCE_NOT_SAVED', 'Save the website in Web Studio before checking its backend.', 409);
  const output = {};
  for (const [rawPath, value] of Object.entries(source)) {
    const path = String(rawPath || '').replace(/\\\\/g, '/').trim();
    const segments = path.split('/');
    const item = typeof value === 'string' ? { content: value } : value;
    const content = typeof item?.content === 'string' ? item.content : typeof item?.text === 'string' ? item.text : '';
    if (!path || path.startsWith('/') || segments.some(part => !part || part === '.' || part === '..' ||
        ['.git', 'node_modules', '.wrangler', 'coverage'].includes(part.toLowerCase())) ||
        /(?:^|\\/)\\.env(?:\\..*)?$/i.test(path) || /(?:^|\\/)\\.dev\\.vars(?:\\..*)?$/i.test(path) ||
        /(?:secret|credential|private-key|service-account)/i.test(path)) {
      fail('BACKEND_PROJECT_FILE_PATH_INVALID', 'The saved website contains a file path that cannot be checked safely.');
    }
    if (content) output[path] = content;
  }
  return output;
}
function parseFile(files, path, code) {
  if (!files[path]) fail(code, 'The saved website is missing its backend build manifest.', 422);
  try { return JSON.parse(files[path]); } catch { fail(code, 'The saved website backend build manifest is invalid.', 422); }
}
function backendFiles(files) {
  return Object.entries(files)
    .filter(([path]) => PROVISIONABLE_BACKEND_PATH.test(path))
    .map(([path, content]) => ({ path, content }));
}
async function hash(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(String(value)));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
async function cf(path, env) {
  if (!env.CLOUDFLARE_API_TOKEN || !env.CLOUDFLARE_ACCOUNT_ID) fail('BACKEND_CLOUDFLARE_NOT_CONFIGURED', 'Cloudflare provisioning is not configured.', 503);
  const response = await fetch('https://api.cloudflare.com/client/v4' + path, {
    headers: { Authorization: 'Bearer ' + env.CLOUDFLARE_API_TOKEN, Accept: 'application/json' },
    redirect: 'error', signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success !== true) {
    const error = new Error('Cloudflare could not verify the customer Preview deployment.');
    error.status = response.status >= 400 && response.status <= 599 ? response.status : 502;
    error.code = 'BACKEND_DEPLOYMENT_STATUS_FAILED';
    throw error;
  }
  return payload.result;
}
async function pagesIdentity(user, projectId, projectName, env) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(user.uid + ':' + projectId));
  const hashValue = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
  const prefix = slug(env.CLOUDFLARE_PAGES_PROJECT_PREFIX || 'ovyx', 'ovyx') + '-' + hashValue.slice(0, 10) + '-';
  const name = slug(prefix + projectName);
  return { prefix, name };
}
export async function onRequestGet(context) {
  const request = context.request;
  try {
    if (!enforceSameOrigin(request)) return errorResponse(403, 'CORS_DENIED', 'Cross-origin backend status requests are not allowed.');
    const user = assertAuthenticated(context.data?.user);
    const urlParams = new URL(request.url).searchParams;
    const projectId = clean(urlParams.get('projectId'), 120);
    const targetEnvironment = urlParams.get('environment') || 'preview';
    if (!['preview', 'production'].includes(targetEnvironment)) fail('BACKEND_ENVIRONMENT_INVALID', 'Choose Preview or Production to check its backend status.');
    if (!/^[A-Za-z0-9_-]{1,120}$/.test(projectId)) fail('BACKEND_PROJECT_ID_INVALID', 'Choose a valid saved website first.');
    const email = clean(user.email, 320).toLowerCase();
    const project = await getFirestoreDataAtPath(context.env, ['users', email, 'projects', projectId]);
    assertOwnedSavedProject(project, { uid: user.uid, email, projectId });
    const files = graphFiles(project);
    const sourceHash = await hash(JSON.stringify(Object.keys(files).sort().map(path => [path, files[path]])));
    const architecture = parseFile(files, 'ovyx-backend-architecture.json', 'BACKEND_ARCHITECTURE_MISSING');
    const sources = backendFiles(files);
    if (Object.keys(files).some(path => UNSUPPORTED_BACKEND_PATH.test(path))) fail('BACKEND_FRAMEWORK_UNSUPPORTED', 'The saved website contains a server framework that is not supported by this provisioning adapter.', 422);
    const plan = await createBackendProvisioningPlan({ ownerUid: user.uid, projectId, environment: targetEnvironment, architecture, files: sources });
    const store = createFirestoreProvisioningRegistry(context.env);
    const key = plan.namespace + '-' + targetEnvironment;
    const current = await store.read(key);
    if (!current) fail('BACKEND_PROVISIONING_NOT_FOUND', 'This website does not have a Preview backend provisioning record yet.', 404);
    const [ownerHash, projectHash] = await Promise.all([hash(user.uid), hash(projectId)]);
    if (current.data.ownerHash !== ownerHash || current.data.projectHash !== projectHash) {
      fail('BACKEND_PROVISIONING_OWNERSHIP_CONFLICT', 'The backend provisioning record does not belong to this saved website.', 404);
    }
    if (current.data.resourceIds?.sourceHash !== sourceHash) {
      fail('BACKEND_PROJECT_CHANGED_SINCE_PREVIEW', 'The saved website changed after this deployment. Create a fresh Preview before marking this version ready or promoting it.', 409);
    }
    if (current.data.state === 'failed' || current.data.state === 'recovery_required' || current.data.state === 'rolled_back') {
      return jsonResponse({ success: false, status: current.data.state, errorCode: current.data.lastErrorCode || null }, 409);
    }
    const pagesProjectName = String(current.data.resourceIds?.pagesProject || '');
    const deploymentId = String(current.data.deploymentId || '');
    if (!pagesProjectName || !deploymentId) fail('BACKEND_PROVISIONING_RECORD_INCOMPLETE', 'The Preview provisioning record is missing its deployment identity.', 409);
    const expected = await pagesIdentity(user, projectId, slug(project.name || project.title || 'site'), context.env);
    if (!pagesProjectName.startsWith(expected.prefix)) fail('BACKEND_PAGES_PROJECT_OWNERSHIP_INVALID', 'The Pages project does not match this saved website.', 403);
    if (String(current.data.environment || '') !== targetEnvironment) fail('BACKEND_DEPLOYMENT_ENVIRONMENT_INVALID', 'The saved deployment environment does not match this status request.', 409);
    const deployment = await cf(
      '/accounts/' + encodeURIComponent(context.env.CLOUDFLARE_ACCOUNT_ID) +
      '/pages/projects/' + encodeURIComponent(pagesProjectName) +
      '/deployments/' + encodeURIComponent(deploymentId),
      context.env,
    );
    const stage = deployment?.latest_stage || (Array.isArray(deployment?.stages) ? deployment.stages.at(-1) : null) || {};
    if (deployment?.environment && String(deployment.environment).toLowerCase() !== targetEnvironment) {
      fail('BACKEND_DEPLOYMENT_ENVIRONMENT_INVALID', 'Cloudflare returned a deployment for a different environment.', 409);
    }
    const stageStatus = String(stage.status || deployment?.status || '').toLowerCase();
    if (stageStatus === 'failure' || stageStatus === 'failed' || stageStatus === 'canceled') {
      const updated = await transitionBackendProvisioningOperation({
        store, key, current, operationId: current.data.operationId, nextState: 'failed',
        patch: { lastErrorCode: 'PAGES_DEPLOYMENT_FAILED', lastErrorAt: new Date().toISOString() },
      });
      return jsonResponse({ success: false, status: updated.data.state, errorCode: updated.data.lastErrorCode }, 409);
    }
    if (stageStatus !== 'success') {
      return jsonResponse({ success: true, status: 'verifying', deploymentStatus: stageStatus || 'pending', deploymentId }, 202, { 'Cache-Control': 'no-store' });
    }
    const aliases = Array.isArray(deployment.aliases) ? deployment.aliases.filter(value => typeof value === 'string' && value.startsWith('https://')) : [];
    const url = aliases[0] || (typeof deployment.url === 'string' && deployment.url.startsWith('https://') ? deployment.url : '');
    if (!url) fail('BACKEND_DEPLOYMENT_URL_MISSING', 'Cloudflare completed the deployment but did not return a Preview URL.', 502);
    let smoke;
    try { smoke = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10_000) }); }
    catch { fail('BACKEND_PREVIEW_SMOKE_TEST_FAILED', 'The Preview URL did not respond to the final availability check.', 502); }
    if (smoke.status < 200 || smoke.status >= 400) fail('BACKEND_PREVIEW_SMOKE_TEST_FAILED', 'The Preview website did not return a successful response.', 502);
    const databaseId = String(current.data.resourceIds?.database || '');
    if (databaseId) {
      const d1 = createCloudflareD1Adapter({ accountId: context.env.CLOUDFLARE_ACCOUNT_ID, apiToken: context.env.CLOUDFLARE_API_TOKEN });
      const migrations = sources.filter(file => /^migrations\/\d{4,}_[a-z0-9][a-z0-9_-]{0,79}\.sql$/i.test(file.path))
        .map(file => ({ version: Number(file.path.match(/migrations\/(\d{4,})_/i)[1]), content: file.content, sha256: plan.migrations.find(item => item.path === file.path)?.sha256 }));
      await d1.applyMigrations(databaseId, migrations);
    }
    const ready = current.data.state === 'ready' ? current : await transitionBackendProvisioningOperation({
      store, key, current, operationId: current.data.operationId, nextState: 'ready',
      patch: { deploymentId },
    });
    return jsonResponse({
      success: true, status: ready.data.state, environment: targetEnvironment, projectId, pagesProjectName,
      deployment: { deploymentId, url, environment: targetEnvironment, status: stageStatus },
      database: databaseId ? { id: databaseId, migrationsVerified: plan.migrations.length } : null,
      smokeTest: { status: smoke.status, passed: true },
    }, 200, { 'Cache-Control': 'no-store' });
  } catch (error) {
    const status = Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599 ? error.status : 502;
    return errorResponse(status, error?.code || 'BACKEND_STATUS_FAILED', error?.message || 'The Preview backend status could not be verified.');
  }
}
