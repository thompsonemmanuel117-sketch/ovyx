#!/usr/bin/env node

import { findCloudflareLogErrors } from './cloudflare-diagnostics-log-filter.mjs';
import { probeApplicationShell } from './cloudflare-application-shell.mjs';

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
    const detail = messages.join(' | ') || text.slice(0, 500);
    const authHint = response.status === 401 || response.status === 403
      ? ' Verify CLOUDFLARE_API_TOKEN is the full current token, has not expired, and has permission to read the configured account and Pages project.'
      : '';
    throw new Error(sanitizeLine(`Cloudflare API HTTP ${response.status}: ${detail}.${authHint}`));
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

  const applicationShellPromise = probeApplicationShell(origin).catch(() => ({
    ok: false, status: 'unavailable', httpStatus: null,
    qualityRuntimeInjected: false, qualityRuntimeAssetOk: false,
    error: 'Application shell request failed.',
  }));
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
    const readKeyList = (key) => Array.isArray(payload?.[key])
      ? payload[key].map(value => String(value || '').slice(0, 120)).filter(Boolean)
      : [];
    const missing = readKeyList('missingRequiredEnvironment');
    const empty = readKeyList('emptyRequiredEnvironment');
    const unavailable = readKeyList('unavailableRequiredEnvironment');
    const invalid = Array.isArray(payload?.invalidRequiredEnvironment)
      ? payload.invalidRequiredEnvironment.map(item => ({
          key: String(item?.key || '').slice(0, 120),
          state: String(item?.state || 'invalid').slice(0, 60),
          reason: String(item?.reason || 'value_failed_validation').slice(0, 160),
        })).filter(item => item.key)
      : [];

    // Only record secret names and boolean readiness. Never copy environment
    // values, tokens, keys, response bodies, or credentials into CI artifacts.
    const configuredProviders = providerRows
      .filter(row => row && row.configured === true)
      .map(row => String(row.key || '').slice(0, 100))
      .filter(Boolean);

    const applicationShell = await applicationShellPromise;
    const ok = response.ok && payload?.ok === true && firebaseProjectMatch && applicationShell.ok;
    return {
      ok,
      status: ok ? 'healthy' : !applicationShell.ok ? 'degraded' : String(payload?.status || 'degraded').slice(0, 40),
      applicationShell,
      httpStatus: response.status,
      firebaseProjectMatch,
      firebaseServiceAccountConfigured: Boolean(
        services?.firebaseServiceAccount?.key === 'FIREBASE_SERVICE_ACCOUNT_JSON' &&
        services?.firebaseServiceAccount?.configured === true &&
        services?.firebaseServiceAccount?.state === 'configured'
      ),
      firebaseServiceAccountStatus: services?.firebaseServiceAccount && {
        key: String(services.firebaseServiceAccount.key || '').slice(0, 120),
        state: String(services.firebaseServiceAccount.state || 'unknown').slice(0, 60),
        reason: String(services.firebaseServiceAccount.reason || '').slice(0, 160),
        missingFields: Array.isArray(services.firebaseServiceAccount.missingFields)
          ? services.firebaseServiceAccount.missingFields.map(value => String(value).slice(0, 80))
          : [],
        credentialAuthentication: String(services.firebaseServiceAccount.credentialAuthentication || 'not_checked').slice(0, 40),
      },
      githubTokenEncryptionStatus: services?.githubTokenEncryption && {
        key: String(services.githubTokenEncryption.key || '').slice(0, 120),
        state: String(services.githubTokenEncryption.state || 'unknown').slice(0, 60),
        reason: String(services.githubTokenEncryption.reason || '').slice(0, 160),
      },
      configuredProviderSecretNames: configuredProviders,
      workersAiBindingConfigured: services?.ai?.workersAiBinding?.configured === true,
      connectionEncryptionConfigured: Boolean(
        (services?.universalConnections || []).some(row =>
          row?.key === 'OVYX_CONNECTION_ENCRYPTION_KEY' && row?.configured === true
        )
      ),
      missingRequiredEnvironment: missing,
      emptyRequiredEnvironment: empty,
      unavailableRequiredEnvironment: unavailable,
      invalidRequiredEnvironment: invalid
    };
  } catch (error) {
    const applicationShell = await applicationShellPromise;
    return {
      ok: false,
      status: 'unavailable',
      httpStatus: null,
      applicationShell,
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
  result.logErrors = findCloudflareLogErrors(lines, sanitizeLine);
  result.runtimeHealth = await probeApplicationHealth(deployment.url);

  // Also probe the stable Pages project hostname users commonly bookmark.
  // A deployment-specific hash URL being healthy does not prove the canonical
  // browser/project link has switched to the same currently deployed release.
  const canonicalHost = String(rawProjectInfo.subdomain || rawProjectInfo.domains?.[0] || '').trim();
  let canonicalUrl = '';
  try {
    if (canonicalHost) canonicalUrl = new URL(/^https?:\/\//i.test(canonicalHost) ? canonicalHost : 'https://' + canonicalHost).origin;
  } catch {}
  let deploymentOrigin = '';
  try { deploymentOrigin = new URL(deployment.url).origin; } catch {}
  result.canonicalRuntimeHealth = canonicalUrl && canonicalUrl !== deploymentOrigin
    ? await probeApplicationHealth(canonicalUrl)
    : { ok: true, status: 'same-origin-or-unavailable', skipped: true, reason: 'No distinct canonical Pages hostname was returned.' };

  function runtimeFailureReasons(health, label) {
    if (!health || health.ok) return [];
    const reasons = [];
    if (health.error) reasons.push(health.error);
    else {
      reasons.push('HTTP ' + String(health.httpStatus || 'n/a') + ', status ' + String(health.status || 'unknown'));
      if (health.firebaseProjectMatch === false) reasons.push('Firebase client/server project mismatch');
      if (health.missingRequiredEnvironment?.length) reasons.push('variables not present: ' + health.missingRequiredEnvironment.join(', '));
      if (health.emptyRequiredEnvironment?.length) reasons.push('variables present but empty: ' + health.emptyRequiredEnvironment.join(', '));
      if (health.unavailableRequiredEnvironment?.length) reasons.push('bindings exist but runtime values are unavailable: ' + health.unavailableRequiredEnvironment.join(', '));
      if (health.invalidRequiredEnvironment?.length) {
        reasons.push('variables present but invalid: ' + health.invalidRequiredEnvironment
          .map(item => item.key + ' (' + item.state + ': ' + item.reason + ')')
          .join(', '));
      }
      if (health.applicationShell && !health.applicationShell.ok) {
        const shell = health.applicationShell;
        reasons.push(label + ' application shell failed: ' + (shell.error || ('HTTP ' + String(shell.httpStatus || 'n/a') + ', quality inspector asset ' + (shell.qualityRuntimeAssetOk ? 'present' : 'unavailable'))));
        if (!shell.browserTabIcon?.ok) reasons.push(label + ' browser tab icon failure: ' + (shell.browserTabIcon?.error || 'icon probe did not pass.'));
        if (!shell.requiredRuntimes?.cancelSafety?.ok) reasons.push(label + ' mobile Cancel/rollback runtime failure: ' + (shell.requiredRuntimes?.cancelSafety?.error || 'runtime was not verified.'));
        if (!shell.requiredRuntimes?.faviconLock?.ok) reasons.push(label + ' favicon enforcement runtime failure: ' + (shell.requiredRuntimes?.faviconLock?.error || 'runtime was not verified.'));
      }
    }
    return reasons;
  }

  const primaryReasons = runtimeFailureReasons(result.runtimeHealth, 'Deployment URL');
  if (primaryReasons.length) result.apiErrors.push('Runtime health probe failed: ' + primaryReasons.join('; '));
  const canonicalReasons = runtimeFailureReasons(result.canonicalRuntimeHealth, 'Canonical Pages URL');
  if (canonicalReasons.length) result.apiErrors.push('Canonical Pages health probe failed: ' + canonicalReasons.join('; '));

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
  const deploymentShell = result.runtimeHealth?.applicationShell;
  console.log(`Deployment browser tab icon: ${deploymentShell?.browserTabIcon?.ok ? 'verified' : 'FAILED'}`);
  console.log(`Deployment mobile Cancel/rollback runtime: ${deploymentShell?.requiredRuntimes?.cancelSafety?.ok ? 'verified' : 'FAILED'}`);
  console.log(`Deployment favicon enforcement runtime: ${deploymentShell?.requiredRuntimes?.faviconLock?.ok ? 'verified' : 'FAILED'}`);
  console.log(`Canonical Pages URL: ${canonicalUrl || 'n/a'} (${result.canonicalRuntimeHealth?.status || 'unknown'})`);

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
