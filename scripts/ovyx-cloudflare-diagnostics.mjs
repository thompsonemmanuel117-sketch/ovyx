#!/usr/bin/env node

const BASE = 'https://api.cloudflare.com/client/v4';
const token = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
const projectName = String(process.env.CLOUDFLARE_PAGES_PROJECT || '').trim();
const environment = String(process.env.CLOUDFLARE_ENV || 'production').trim().toLowerCase();
const requestedDeploymentId = String(process.env.CLOUDFLARE_DEPLOYMENT_ID || '').trim();

if (!token || !accountId || !projectName) {
  console.error('Missing required environment: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_PAGES_PROJECT.');
  process.exit(2);
}

if (!['production', 'preview'].includes(environment)) {
  console.error('CLOUDFLARE_ENV must be production or preview.');
  process.exit(2);
}

const safeProject = encodeURIComponent(projectName);
const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/json',
};

async function cf(path) {
  const response = await fetch(`${BASE}${path}`, { headers });
  const text = await response.text();
  let data = {};
  try { data = JSON.parse(text); } catch {}
  if (!response.ok || data.success === false) {
    const messages = [
      ...(Array.isArray(data.errors) ? data.errors.map(x => x.message) : []),
      ...(Array.isArray(data.messages) ? data.messages.map(x => x.message) : []),
    ].filter(Boolean);
    throw new Error(sanitizeLine(`Cloudflare API HTTP ${response.status}: ${messages.join(' | ') || text.slice(0, 500)}`));
  }
  return data.result;
}

let diagnosticSensitiveValues = [];

function collectEnvironmentValues(value, out = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectEnvironmentValues(item, out);
    return out;
  }
  if (!value || typeof value !== 'object') return out;
  if (['plain_text', 'secret_text'].includes(String(value.type || '').toLowerCase()) && typeof value.value === 'string' && value.value.length) out.push(value.value);
  for (const child of Object.values(value)) collectEnvironmentValues(child, out);
  return out;
}
function redact(value, key = '') {
  const normalizedKey = String(key);
  if (/^(env_vars|deployment_configs|latest_deployment|canonical_deployment)$/i.test(normalizedKey)) return '[OMITTED]';
  const sensitiveKey = /token|secret|password|authorization|private[_-]?key|api[_-]?key|credential|encryption[_-]?key|service[_-]?account/i.test(normalizedKey);
  if (sensitiveKey) return '[REDACTED]';
  if (Array.isArray(value)) return value.map(item => redact(item));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      out[childKey] = redact(childValue, childKey);
    }
    return out;
  }
  return value;
}

function newestFirst(items) {
  return [...items].sort((a, b) => {
    const ad = Date.parse(a.created_on || a.created_at || a.modified_on || '') || 0;
    const bd = Date.parse(b.created_on || b.created_at || b.modified_on || '') || 0;
    return bd - ad;
  });
}

function sanitizeLine(line) {
  let output = String(line ?? '')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .replace(/(api[_-]?key|access[_-]?token|client[_-]?secret|password|private[_-]?key)\s*[:=]\s*[^\s]+/gi, '$1=[REDACTED]');
  for (const value of [...diagnosticSensitiveValues].sort((a, b) => b.length - a.length)) {
    if (value && value.length >= 4) output = output.split(value).join('[REDACTED_VALUE]');
  }
  return output.slice(0, 1200);
}
function errorLines(lines) {
  const patterns = [
    /error/i,
    /failed/i,
    /failure/i,
    /fatal/i,
    /exception/i,
    /unhandled/i,
    /panic/i,
    /crash/i,
    /permission denied/i,
    /module not found/i,
    /build failed/i,
    /deployment failed/i,
  ];
  return lines
    .map(item => sanitizeLine(item.line || item.message || ''))
    .filter(line => patterns.some(pattern => pattern.test(line)))
    .slice(-150);
}

async function probeApplicationHealth(deploymentUrl) {
  const raw = String(deploymentUrl || '').trim();
  if (!raw) {
    return { ok: false, status: 'unavailable', httpStatus: null, error: 'Deployment URL is missing.' };
  }

  let origin;
  try {
    const parsed = new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw);
    if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('Unsupported deployment URL protocol.');
    origin = parsed.origin;
  } catch {
    return { ok: false, status: 'unavailable', httpStatus: null, error: 'Deployment URL is invalid.' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(new URL('/api/health', origin), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    const services = payload?.services || {};
    const providerRows = Array.isArray(services?.ai?.providers) ? services.ai.providers : [];
    const firebaseProjectMatch = services?.firebaseProjectCheck?.clientServerProjectMatch === true;
    const missing = Array.isArray(payload?.missingRequiredEnvironment)
      ? payload.missingRequiredEnvironment
          .map(value => String(value || '').slice(0, 120))
          .filter(Boolean)
      : [];

    // Only record secret names and boolean readiness. Never copy environment
    // values, tokens, keys, response bodies, or credentials into CI artifacts.
    const configuredProviders = providerRows
      .filter(row => row && row.configured === true)
      .map(row => String(row.key || '').slice(0, 100))
      .filter(Boolean);

    const ok = response.ok && payload?.ok === true && firebaseProjectMatch;
    return {
      ok,
      status: ok ? 'healthy' : String(payload?.status || 'degraded').slice(0, 40),
      httpStatus: response.status,
      firebaseProjectMatch,
      firebaseServiceAccountConfigured: Boolean(
        (services?.firebase || []).some(row =>
          ['FIREBASE_SERVICE_ACCOUNT_JSON', 'FIREBASE_SERVICE_ACCOUNT'].includes(row?.key) &&
          row?.configured === true
        )
      ),
      configuredProviderSecretNames: configuredProviders,
      workersAiBindingConfigured: services?.ai?.workersAiBinding?.configured === true,
      connectionEncryptionConfigured: Boolean(
        (services?.universalConnections || []).some(row =>
          row?.key === 'OVYX_CONNECTION_ENCRYPTION_KEY' && row?.configured === true
        )
      ),
      missingRequiredEnvironment: missing
    };
  } catch (error) {
    return {
      ok: false,
      status: 'unavailable',
      httpStatus: null,
      error: error?.name === 'AbortError'
        ? 'Runtime health request timed out.'
        : 'Runtime health request failed.'
    };
  } finally {
    clearTimeout(timer);
  }
}

const result = {
  checkedAt: new Date().toISOString(),
  project: projectName,
  environment,
  status: 'unknown',
  projectInfo: null,
  deployment: null,
  logErrors: [],
  apiErrors: [],
};

try {
  const rawProjectInfo = await cf(`/accounts/${encodeURIComponent(accountId)}/pages/projects/${safeProject}`);
  diagnosticSensitiveValues = collectEnvironmentValues(rawProjectInfo);
  result.projectInfo = redact(rawProjectInfo);

  let deployment;
  if (requestedDeploymentId) {
    deployment = await cf(
      `/accounts/${encodeURIComponent(accountId)}/pages/projects/${safeProject}/deployments/${encodeURIComponent(requestedDeploymentId)}`
    );
  } else {
    const deployments = await cf(
      `/accounts/${encodeURIComponent(accountId)}/pages/projects/${safeProject}/deployments?env=${encodeURIComponent(environment)}&page=1&per_page=10`
    );
    const list = Array.isArray(deployments) ? deployments : [];
    deployment = newestFirst(list)[0];
  }

  if (!deployment) {
    throw new Error(`No ${environment} deployment was returned for project ${projectName}.`);
  }

  diagnosticSensitiveValues.push(...collectEnvironmentValues(deployment));
  result.deployment = {
    id: deployment.id,
    environment: deployment.environment,
    url: deployment.url,
    created_on: deployment.created_on,
    modified_on: deployment.modified_on,
    commit: deployment.deployment_trigger?.metadata?.commit_hash || null,
    branch: deployment.deployment_trigger?.metadata?.branch || null,
    commit_message: deployment.deployment_trigger?.metadata?.commit_message || null,
    latest_stage: deployment.latest_stage || null,
    stages: deployment.stages || [],
    skip_reason: deployment.skip_reason || null,
    build_config: redact(deployment.build_config || null),
  };

  const logs = await cf(
    `/accounts/${encodeURIComponent(accountId)}/pages/projects/${safeProject}/deployments/${encodeURIComponent(deployment.id)}/history/logs`
  );

  const lines = Array.isArray(logs?.data) ? logs.data : [];
  result.logErrors = errorLines(lines);
  result.runtimeHealth = await probeApplicationHealth(deployment.url);
  if (!result.runtimeHealth.ok) {
    result.apiErrors.push(
      'Runtime health probe failed: ' +
      (result.runtimeHealth.error ||
        ('HTTP ' + String(result.runtimeHealth.httpStatus || 'n/a') + ', status ' + result.runtimeHealth.status +
          (result.runtimeHealth.firebaseProjectMatch === false ? ', Firebase client/server project mismatch' : '') +
          (result.runtimeHealth.missingRequiredEnvironment?.length ? ', missing required environment: ' + result.runtimeHealth.missingRequiredEnvironment.join(', ') : '')))
    );
  }

  const stageStatus = String(deployment.latest_stage?.status || '').toLowerCase();
  const hasDeploymentFailure = ['failure', 'canceled'].includes(stageStatus);
  const hasLogErrors = result.logErrors.length > 0;
  const hasApiErrors = result.apiErrors.length > 0;

  if (hasDeploymentFailure || hasLogErrors || hasApiErrors) {
    result.status = 'error';
  } else if (stageStatus === 'success') {
    result.status = 'healthy';
  } else {
    result.status = 'in_progress';
  }

  await import('node:fs/promises').then(fs =>
    fs.writeFile(
      'cloudflare-diagnostics.json',
      JSON.stringify(result, null, 2) + '\n'
    )
  );

  console.log(`OVYX Cloudflare diagnostics: ${result.status}`);
  console.log(`Project: ${projectName}`);
  console.log(`Environment: ${environment}`);
  console.log(`Deployment: ${deployment.id}`);
  console.log(`Stage: ${deployment.latest_stage?.name || 'unknown'} / ${deployment.latest_stage?.status || 'unknown'}`);
  console.log(`URL: ${deployment.url || 'n/a'}`);
  console.log(`Detected log errors: ${result.logErrors.length}`);
  console.log(`Runtime API health: ${result.runtimeHealth?.status || 'unknown'} (HTTP ${result.runtimeHealth?.httpStatus || 'n/a'})`);

  if (result.logErrors.length) {
    console.log('--- Relevant Cloudflare log lines ---');
    for (const line of result.logErrors.slice(-50)) console.log(line);
  }

  if (result.status === 'error') process.exit(1);
} catch (error) {
  result.status = 'api_error';
  result.apiErrors.push(sanitizeLine(error.message || error));
  const fs = await import('node:fs/promises');
  await fs.writeFile('cloudflare-diagnostics.json', JSON.stringify(result, null, 2) + '\n');
  console.error(`OVYX Cloudflare diagnostics failed: ${result.apiErrors[0]}`);
  process.exit(1);
}
