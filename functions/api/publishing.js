import { resolveEntitlements } from './entitlements.js';

const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer'
};
const ROOT_EMAIL = 'ovyxsupportteam@gmail.com';
const MAX_BODY_BYTES = 16 * 1024;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: HEADERS });
}
function bearer(request) {
  const value = request.headers.get('Authorization') || '';
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}
function safeSlug(value, fallback = 'site') {
  const result = String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 36);
  return result || fallback;
}
function validProjectId(value) {
  const id = String(value || '').trim();
  if (!id || id.length > 160 || /[\u0000-\u001f\u007f]/.test(id)) throw Object.assign(new Error('Choose a saved website first.'), { status: 400 });
  return id;
}
function normalizeDomain(value) {
  const raw = String(value || '').trim().replace(/^https?:\/\//i, '').replace(/\/$/, '').toLowerCase();
  if (!raw || raw.length > 253 || /[\s/@?#\\]/.test(raw)) throw Object.assign(new Error('Enter a valid domain name, such as example.com.'), { status: 400 });
  let host;
  try {
    const parsed = new URL('https://' + raw);
    if (parsed.username || parsed.password || parsed.port || parsed.pathname !== '/' || parsed.search || parsed.hash) throw new Error('invalid');
    host = parsed.hostname.toLowerCase();
  } catch {
    throw Object.assign(new Error('Enter a valid domain name, such as example.com.'), { status: 400 });
  }
  if (host.length > 253 || !host.includes('.') || host === 'localhost' || host.endsWith('.localhost') ||
      host.endsWith('.pages.dev') || host.endsWith('.workers.dev') ||
      !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(host)) {
    throw Object.assign(new Error('Use a public domain you control. Cloudflare service hostnames and local addresses cannot be connected here.'), { status: 400 });
  }
  return host;
}
async function verifyIdentity(token, env) {
  if (!token) return { ok: false, status: 401, error: 'Sign in to OVYX before managing publishing.' };
  if (!env.FIREBASE_WEB_API_KEY) return { ok: false, status: 503, error: 'Publishing authentication is not configured.' };
  try {
    const response = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(env.FIREBASE_WEB_API_KEY), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token }),
      signal: AbortSignal.timeout(10000),
      redirect: 'error'
    });
    const body = await response.json().catch(() => ({}));
    const user = Array.isArray(body.users) ? body.users[0] : null;
    if (!response.ok || !user?.localId) return { ok: false, status: 401, error: 'Your sign-in session is invalid or expired.' };
    return { ok: true, user: { uid: String(user.localId), email: String(user.email || '').trim().toLowerCase(), emailVerified: user.emailVerified === true } };
  } catch {
    return { ok: false, status: 503, error: 'Publishing authentication is temporarily unavailable.' };
  }
}
function isOwner(user) {
  return user && (user.email === ROOT_EMAIL || user.owner === true || ['ROOT_SUPERUSER', 'OVYX OWNER', 'OWNER', 'ADMIN'].includes(String(user.role || '').trim().toUpperCase()));
}
async function resolveProject(user, body, env) {
  const projectId = validProjectId(body.projectId);
  const projectName = safeSlug(body.projectName || 'site');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(user.uid + ':' + projectId));
  const hash = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
  const pagesName = safeSlug((env.CLOUDFLARE_PAGES_PROJECT_PREFIX || 'ovyx') + '-' + hash.slice(0, 10) + '-' + projectName);
  return { projectId, projectName, pagesName };
}
async function cf(path, env, method = 'GET', body) {
  if (!env.CLOUDFLARE_API_TOKEN || !env.CLOUDFLARE_ACCOUNT_ID) throw Object.assign(new Error('Cloudflare publishing is not configured.'), { status: 503 });
  const response = await fetch('https://api.cloudflare.com/client/v4/accounts/' + encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID) + path, {
    method,
    headers: { Authorization: 'Bearer ' + env.CLOUDFLARE_API_TOKEN, Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15000),
    redirect: 'error'
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success !== true) {
    const error = new Error('Cloudflare could not complete the publishing request.');
    error.status = response.status >= 400 && response.status <= 599 ? response.status : 502;
    throw error;
  }
  return payload.result;
}
async function authorize(context) {
  const identity = await verifyIdentity(bearer(context.request), context.env);
  if (!identity.ok) return { response: json({ success: false, authoritative: true, error: identity.error }, identity.status) };
  if (!identity.user.emailVerified) return { response: json({ success: false, authoritative: true, error: 'Verify your email before managing publishing.' }, 403) };
  const entitlements = await resolveEntitlements(context.env, identity.user);
  if (!isOwner(identity.user) && entitlements?.capabilities?.cloudflareDeploy !== true) {
    return { response: json({ success: false, authoritative: true, error: 'Your OVYX plan does not include website publishing.' }, 403) };
  }
  return { user: identity.user };
}
function summarizeDeployment(item) {
  const stages = Array.isArray(item?.stages) ? item.stages : [];
  const latest = item?.latest_stage || stages.find(stage => stage.status === 'active') || stages.at(-1) || {};
  const aliases = Array.isArray(item?.aliases) ? item.aliases.filter(value => typeof value === 'string' && value.startsWith('https://')) : [];
  return {
    deploymentId: String(item?.id || ''),
    environment: String(item?.environment || ''),
    status: String(latest.status || item?.status || 'unknown'),
    stage: String(latest.name || ''),
    url: aliases[0] || (typeof item?.url === 'string' && item.url.startsWith('https://') ? item.url : null),
    createdAt: item?.created_on || null,
    modifiedAt: item?.modified_on || null,
    canRollback: String(item?.environment || '') === 'production' && String(latest.name || '') === 'deploy' && String(latest.status || '') === 'success'
  };
}
function summarizeDomain(item, pagesSubdomain) {
  const status = String(item?.status || 'unknown').toLowerCase();
  const name = String(item?.name || '');
  const apex = name.split('.').length === 2;
  return {
    name,
    status,
    httpsReady: status === 'active',
    certificateAuthority: item?.certificate_authority || null,
    validation: {
      method: item?.validation_data?.method || null,
      status: item?.validation_data?.status || null,
      error: item?.validation_data?.error_message || null,
      txtName: item?.validation_data?.txt_name || null,
      txtValue: item?.validation_data?.txt_value || null
    },
    verification: {
      status: item?.verification_data?.status || null,
      error: item?.verification_data?.error_message || null
    },
    dns: apex
      ? { type: 'Nameservers', name: '@', target: 'Use the Cloudflare nameservers assigned to your domain zone. Apex domains must be active Cloudflare zones on this account.' }
      : { type: 'CNAME', name, target: pagesSubdomain || 'your-project.pages.dev' },
    createdAt: item?.created_on || null
  };
}
async function getPagesSubdomain(pagesName, env) {
  const project = await cf('/pages/projects/' + encodeURIComponent(pagesName), env);
  return String(project?.subdomain || (pagesName + '.pages.dev'));
}
function basePath(pagesName) {
  return '/pages/projects/' + encodeURIComponent(pagesName);
}
async function handleGet(context) {
  const auth = await authorize(context);
  if (auth.response) return auth.response;
  const url = new URL(context.request.url);
  const { projectId, projectName, pagesName } = await resolveProject(auth.user, {
    projectId: url.searchParams.get('projectId'),
    projectName: url.searchParams.get('projectName')
  }, context.env);
  const [deployments, domains, subdomain] = await Promise.all([
    cf(basePath(pagesName) + '/deployments?env=production&per_page=20', context.env),
    cf(basePath(pagesName) + '/domains', context.env).catch(error => error.status === 404 ? [] : Promise.reject(error)),
    getPagesSubdomain(pagesName, context.env)
  ]);
  return json({
    success: true,
    authoritative: true,
    project: { id: projectId, name: projectName, pagesSubdomain: subdomain },
    releases: (Array.isArray(deployments) ? deployments : []).map(summarizeDeployment),
    domains: (Array.isArray(domains) ? domains : []).map(item => summarizeDomain(item, subdomain))
  });
}
async function handlePost(context) {
  const auth = await authorize(context);
  if (auth.response) return auth.response;
  const length = Number(context.request.headers.get('Content-Length') || 0);
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) return json({ success: false, authoritative: true, error: 'Publishing request is too large.' }, 413);
  let body;
  try { body = await context.request.json(); } catch { return json({ success: false, authoritative: true, error: 'The publishing request is not valid JSON.' }, 400); }
  const { projectId, pagesName } = await resolveProject(auth.user, body, context.env);
  const action = String(body.action || '').trim().toLowerCase();
  const root = basePath(pagesName);
  if (action === 'rollback') {
    const deploymentId = String(body.deploymentId || '').trim();
    if (!/^[a-f0-9-]{16,64}$/i.test(deploymentId)) return json({ success: false, authoritative: true, error: 'Choose a valid production release to roll back to.' }, 400);
    const target = await cf(root + '/deployments/' + encodeURIComponent(deploymentId), context.env);
    const stage = target?.latest_stage || {};
    if (target?.environment !== 'production' || stage?.name !== 'deploy' || stage?.status !== 'success' || target?.is_skipped === true) {
      return json({ success: false, authoritative: true, error: 'Only a successfully deployed production release can be restored. Preview releases cannot be rollback targets.' }, 409);
    }
    const result = await cf(root + '/deployments/' + encodeURIComponent(deploymentId) + '/rollback', context.env, 'POST', {});
    return json({ success: true, authoritative: true, action, projectId, deployment: summarizeDeployment(result) });
  }
  if (action === 'add-domain') {
    const domain = normalizeDomain(body.domain);
    const result = await cf(root + '/domains', context.env, 'POST', { name: domain });
    const subdomain = await getPagesSubdomain(pagesName, context.env);
    return json({ success: true, authoritative: true, action, domain: summarizeDomain(result, subdomain) }, 201);
  }
  if (action === 'retry-domain') {
    const domain = normalizeDomain(body.domain);
    const result = await cf(root + '/domains/' + encodeURIComponent(domain), context.env, 'PATCH', {});
    const subdomain = await getPagesSubdomain(pagesName, context.env);
    return json({ success: true, authoritative: true, action, domain: summarizeDomain(result, subdomain) });
  }
  if (action === 'remove-domain') {
    const domain = normalizeDomain(body.domain);
    await cf(root + '/domains/' + encodeURIComponent(domain), context.env, 'DELETE');
    return json({ success: true, authoritative: true, action, domain });
  }
  return json({ success: false, authoritative: true, error: 'Choose a supported publishing action.' }, 400);
}
export async function onRequestGet(context) {
  try { return await handleGet(context); }
  catch (error) {
    const status = Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599 ? error.status : 502;
    console.error(JSON.stringify({ event: 'ovyx_publishing_center_failed', method: 'GET', status }));
    return json({ success: false, authoritative: true, error: status >= 500 ? 'Publishing information is temporarily unavailable.' : error.message }, status);
  }
}
export async function onRequestPost(context) {
  try { return await handlePost(context); }
  catch (error) {
    const status = Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599 ? error.status : 502;
    console.error(JSON.stringify({ event: 'ovyx_publishing_action_failed', method: 'POST', status }));
    return json({ success: false, authoritative: true, error: status >= 500 ? 'The publishing action could not be completed. Please try again.' : error.message }, status);
  }
}
export function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  if (context.request.method === 'POST') return onRequestPost(context);
  return json({ success: false, authoritative: true, error: 'GET or POST is required.' }, 405);
}
