import { resolveEntitlements } from './entitlements.js';
import { listFirestoreSubcollectionDocumentsAtPath } from '../_lib/firebase-admin.js';

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
  if (!raw || raw.length > 253 || /[\s/:@?#\\]/.test(raw)) throw Object.assign(new Error('Enter a valid domain name, such as example.com.'), { status: 400 });
  let host;
  try {
    const parsed = new URL('https://' + raw);
    if (parsed.username || parsed.password || parsed.port || parsed.pathname !== '/' || parsed.search || parsed.hash) throw new Error('invalid');
    host = parsed.hostname.toLowerCase();
  } catch {
    throw Object.assign(new Error('Enter a valid domain name, such as example.com.'), { status: 400 });
  }
  if (host.length > 253 || !host.includes('.') || host === 'localhost' || host.endsWith('.localhost') ||
      host.endsWith('.pages.dev') || host.endsWith('.workers.dev') || ['.invalid', '.test', '.example', '.local', '.internal', '.onion'].some(suffix => host.endsWith(suffix)) ||
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
function isRollbackEligible(target) {
  const stages = Array.isArray(target?.stages) ? target.stages : [];
  const stage = target?.latest_stage || stages.find(item => item?.status === 'active') || stages.at(-1) || {};
  return target?.environment === 'production' && stage.name === 'deploy' && stage.status === 'success' && target?.is_skipped !== true;
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
const MULTI_LABEL_PUBLIC_SUFFIXES = new Set(['co.uk', 'org.uk', 'me.uk', 'ac.uk', 'com.au', 'net.au', 'org.au', 'co.nz', 'org.nz', 'co.za', 'org.za', 'com.ng', 'org.ng', 'net.ng', 'gov.ng', 'edu.ng', 'com.br', 'com.sg', 'com.in', 'co.in', 'firm.in', 'net.in', 'org.in', 'com.mx', 'com.tr', 'com.cn', 'com.hk', 'co.jp']);
function isApexDomain(name) {
  const labels = String(name || '').split('.');
  if (labels.length < 2) return false;
  return labels.length === (MULTI_LABEL_PUBLIC_SUFFIXES.has(labels.slice(-2).join('.')) ? 3 : 2);
}
function summarizeDomain(item, pagesSubdomain) {
  const status = String(item?.status || 'unknown').toLowerCase();
  const name = String(item?.name || '');
  const apex = isApexDomain(name);
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
async function getPagesProject(pagesName, env) {
  const project = await cf('/pages/projects/' + encodeURIComponent(pagesName), env);
  if (project?.source?.type) {
    throw Object.assign(new Error('This website is connected to a different publishing source. Review the deployment destination before continuing.'), { status: 409 });
  }
  return project;
}
async function ensurePagesProject(pagesName, env) {
  try { return await getPagesProject(pagesName, env); }
  catch (error) {
    if (error.status !== 404) throw error;
    return cf('/pages/projects', env, 'POST', { name: pagesName, production_branch: 'main' });
  }
}
async function getPagesSubdomain(pagesName, env) {
  const project = await getPagesProject(pagesName, env);
  return String(project?.subdomain || (pagesName + '.pages.dev'));
}
function basePath(pagesName) {
  return '/pages/projects/' + encodeURIComponent(pagesName);
}

export function normalizePublishedSiteUrl(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.length > 2048) throw Object.assign(new Error('Paste the HTTPS link of a website published from this OVYX account.'), { status: 400, code: 'INVALID_PUBLISHED_SITE_URL' });
  let parsed;
  try { parsed = new URL(raw); } catch { throw Object.assign(new Error('That website link is not valid. Paste the full HTTPS address.'), { status: 400, code: 'INVALID_PUBLISHED_SITE_URL' }); }
  const host = String(parsed.hostname || '').toLowerCase();
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port || !host || host === 'localhost' ||
      /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(':') || !host.includes('.') ||
      host.endsWith('.workers.dev') || ['.invalid', '.test', '.example', '.local', '.internal', '.onion'].some(suffix => host.endsWith(suffix))) {
    throw Object.assign(new Error('Use the public HTTPS link of your published website. Local addresses and unsupported hosts cannot be updated.'), { status: 400, code: 'INVALID_PUBLISHED_SITE_URL' });
  }
  return { host, canonicalUrl: parsed.origin + (parsed.pathname === '/' ? '' : parsed.pathname) };
}

function projectPublishedHosts(project) {
  const hosts = new Set();
  const addUrl = value => {
    try {
      const parsed = new URL(String(value || ''));
      if (parsed.protocol === 'https:' && !parsed.username && !parsed.password && !parsed.port) hosts.add(parsed.hostname.toLowerCase());
    } catch {}
  };
  addUrl(project?.publishedUrl);
  addUrl(project?.liveUrl);
  addUrl(project?.ovyxPublishedUrl);
  const savedPagesName = String(project?.ovyxPagesProjectName || '').trim().toLowerCase();
  if (/^[a-z0-9-]{1,63}$/.test(savedPagesName)) hosts.add(savedPagesName + '.pages.dev');
  for (const deployment of (Array.isArray(project?.ovyxDeployments) ? project.ovyxDeployments : []).slice(0, 30)) {
    if (deployment && (deployment.status === 'published' || deployment.status === 'success' || deployment.url)) addUrl(deployment.url);
  }
  const customDomain = String(project?.ovyxDeploymentDomain || '').trim();
  if (customDomain) {
    try { hosts.add(normalizeDomain(customDomain)); } catch {}
  }
  return hosts;
}

export async function resolvePublishedSiteFromProjects({ uid, email, host, projects, resolvePagesProject }) {
  const candidates = (Array.isArray(projects) ? projects : []).filter(row => {
    const data = row?.data || {};
    return /^[A-Za-z0-9_-]{1,120}$/.test(String(row?.id || '')) &&
      String(data.ownerUid || '') === String(uid || '') &&
      String(data.ownerEmail || '').trim().toLowerCase() === String(email || '').trim().toLowerCase() &&
      projectPublishedHosts(data).has(String(host || '').toLowerCase());
  });
  if (!candidates.length) throw Object.assign(new Error('OVYX could not find that link among the websites saved in this account. Make sure this website was created and published from this OVYX account.'), { status: 404, code: 'PUBLISHED_SITE_NOT_FOUND' });
  const matches = [];
  for (const row of candidates.slice(0, 8)) {
    const data = row.data || {};
    const remote = await resolvePagesProject(row);
    const pagesSubdomain = String(remote?.project?.subdomain || (remote?.pagesName ? remote.pagesName + '.pages.dev' : '')).toLowerCase();
    const pagesHost = pagesSubdomain || String(remote?.pagesName || '').toLowerCase() + '.pages.dev';
    const domain = (Array.isArray(remote?.domains) ? remote.domains : []).find(item => String(item?.name || '').toLowerCase() === String(host).toLowerCase());
    const activeCustomDomain = !!domain && String(domain.status || '').toLowerCase() === 'active';
    const isPagesHost = String(host).toLowerCase() === pagesHost;
    const hasSuccessfulProduction = (Array.isArray(remote?.deployments) ? remote.deployments : []).some(isRollbackEligible);
    if ((isPagesHost || activeCustomDomain) && hasSuccessfulProduction) {
      matches.push({
        projectId: String(row.id),
        projectName: String(data.name || data.title || 'Website').replace(/[\\u0000-\\u001f\\u007f]/g, ' ').trim().slice(0, 100),
        pagesProjectName: String(remote.pagesName || ''),
        canonicalUrl: 'https://' + String(host).toLowerCase(),
        matchedBy: isPagesHost ? 'pages-hostname' : 'connected-custom-domain',
        domainStatus: domain ? String(domain.status || 'unknown').toLowerCase() : 'active',
      });
    }
  }
  if (matches.length > 1) throw Object.assign(new Error('More than one saved project appears to use this link. Open Manage Website and check the connected domains before updating.'), { status: 409, code: 'PUBLISHED_SITE_AMBIGUOUS' });
  if (!matches.length) throw Object.assign(new Error('OVYX found a saved project with this link, but could not verify an active production website and its domain connection. No changes were made.'), { status: 409, code: 'PUBLISHED_SITE_NOT_VERIFIED' });
  return { ...matches[0], sameProject: true, deploymentTarget: 'existing-pages-project' };
}

async function expectedPagesProjectPrefix(user, projectId, env) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(user.uid + ':' + projectId));
  const hash = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
  return safeSlug(env.CLOUDFLARE_PAGES_PROJECT_PREFIX || 'ovyx') + '-' + hash.slice(0, 10) + '-';
}

async function findExistingPagesProject(user, row, host, env) {
  const projectId = String(row.id);
  const data = row.data || {};
  const prefix = await expectedPagesProjectPrefix(user, projectId, env);
  const hints = new Set();
  const storedName = String(data.ovyxPagesProjectName || '').trim().toLowerCase();
  if (storedName) hints.add(storedName);
  const hostName = String(host || '').toLowerCase().endsWith('.pages.dev') ? String(host).toLowerCase().slice(0, -'.pages.dev'.length) : '';
  if (hostName) hints.add(hostName);
  const current = await resolveProject(user, { projectId, projectName: data.name || data.title || 'site' }, env);
  hints.add(current.pagesName);
  const names = [...hints].filter(name => name.startsWith(prefix) && /^[a-z0-9-]{1,63}$/.test(name));
  let listed = [];
  try {
    const projects = await cf('/pages/projects?per_page=100', env);
    listed = (Array.isArray(projects) ? projects : []).map(item => String(item?.name || '').toLowerCase()).filter(name => name.startsWith(prefix) && /^[a-z0-9-]{1,63}$/.test(name));
  } catch {}
  for (const name of listed) names.push(name);
  const uniqueNames = [...new Set(names)].slice(0, 20);
  const matches = [];
  for (const pagesName of uniqueNames) {
    let project;
    try { project = await getPagesProject(pagesName, env); } catch (error) { if (error.status === 404) continue; throw error; }
    const [domains, deployments] = await Promise.all([cf(basePath(pagesName) + '/domains', env), cf(basePath(pagesName) + '/deployments?env=production&per_page=20', env)]);
    const subdomain = String(project?.subdomain || pagesName + '.pages.dev').toLowerCase();
    const attached = (Array.isArray(domains) ? domains : []).some(item => String(item?.name || '').toLowerCase() === String(host).toLowerCase());
    if (subdomain === String(host).toLowerCase() || attached) matches.push({ pagesName, project, domains, deployments });
  }
  if (matches.length > 1) throw Object.assign(new Error('Several existing hosting projects appear to match this website link. OVYX stopped to avoid updating the wrong website.'), { status: 409, code: 'PUBLISHED_SITE_AMBIGUOUS' });
  return matches[0] || null;
}
async function handleResolvePublishedSite(context, auth) {
  const { host, canonicalUrl } = normalizePublishedSiteUrl(new URL(context.request.url).searchParams.get('resolveUrl'));
  const rows = await listFirestoreSubcollectionDocumentsAtPath(context.env, ['users', auth.user.email], 'projects', 200);
  const projects = rows.filter(row => row && row.data && row.data.ownerUid === auth.user.uid && String(row.data.ownerEmail || '').trim().toLowerCase() === auth.user.email);
  const result = await resolvePublishedSiteFromProjects({
    uid: auth.user.uid,
    email: auth.user.email,
    host,
    projects,
    resolvePagesProject: async row => {
      const existing = await findExistingPagesProject(auth.user, row, host, context.env);
      return existing || {};
    },
  });
  return json({ success: true, authoritative: true, site: { ...result, canonicalUrl } });
}

async function handleGet(context) {
  const auth = await authorize(context);
  if (auth.response) return auth.response;
  const url = new URL(context.request.url);
  if (url.searchParams.has('resolveUrl')) return handleResolvePublishedSite(context, auth);
  const { projectId, projectName, pagesName } = await resolveProject(auth.user, {
    projectId: url.searchParams.get('projectId'),
    projectName: url.searchParams.get('projectName')
  }, context.env);
  let pagesProject;
  try { pagesProject = await getPagesProject(pagesName, context.env); }
  catch (error) {
    if (error.status !== 404) throw error;
    return json({
      success: true,
      authoritative: true,
      project: { id: projectId, name: projectName, pagesSubdomain: pagesName + '.pages.dev' },
      releases: [],
      domains: [],
      requiresFirstDeployment: true
    });
  }
  const [deployments, domains] = await Promise.all([
    cf(basePath(pagesName) + '/deployments?env=production&per_page=20', context.env),
    cf(basePath(pagesName) + '/domains', context.env)
  ]);
  const subdomain = String(pagesProject?.subdomain || (pagesName + '.pages.dev'));
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
    if (!isRollbackEligible(target)) {
      return json({ success: false, authoritative: true, error: 'Only a successfully deployed production release can be restored. Preview releases cannot be rollback targets.' }, 409);
    }
    const result = await cf(root + '/deployments/' + encodeURIComponent(deploymentId) + '/rollback', context.env, 'POST', {});
    return json({ success: true, authoritative: true, action, projectId, deployment: summarizeDeployment(result) });
  }
  if (action === 'add-domain') {
    const domain = normalizeDomain(body.domain);
    await ensurePagesProject(pagesName, context.env);
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

export { normalizeDomain, summarizeDeployment, summarizeDomain, isApexDomain, isRollbackEligible };
