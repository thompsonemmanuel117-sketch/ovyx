import { pathToFileURL } from 'node:url';
import path from 'node:path';

const API_ROOT = 'https://api.cloudflare.com/client/v4';
const DEFAULT_TIMEOUT_MS = 12 * 60 * 1000;
const DEFAULT_POLL_MS = 10_000;
const REQUEST_TIMEOUT_MS = 15_000;
const RETRYABLE_HTTP = new Set([408, 425, 429, 500, 502, 503, 504]);

function validateEnv(env) {
  const token = String(env.CLOUDFLARE_API_TOKEN || '').trim();
  const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const project = String(env.CLOUDFLARE_PAGES_PROJECT || '').trim();
  const expectedSha = String(env.OVYX_EXPECTED_DEPLOYMENT_SHA || '').trim().toLowerCase();

  if (!token || !accountId || !project || !expectedSha) {
    throw new Error('Deployment gate requires Cloudflare Pages read credentials, project settings, and the expected commit SHA.');
  }
  if (!/^[0-9a-f]{40}$/.test(expectedSha)) {
    throw new Error('OVYX_EXPECTED_DEPLOYMENT_SHA must be a full 40-character Git commit SHA.');
  }
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(project)) {
    throw new Error('CLOUDFLARE_PAGES_PROJECT is not a valid Pages project name.');
  }

  return { token, accountId, project, expectedSha };
}

export function assessProductionDeployment(deployments, expectedSha) {
  const matching = (Array.isArray(deployments) ? deployments : [])
    .filter(deployment =>
      String(deployment?.environment || '').toLowerCase() === 'production' &&
      String(deployment?.deployment_trigger?.metadata?.branch || '') === 'main' &&
      String(deployment?.deployment_trigger?.metadata?.commit_hash || '').toLowerCase() === String(expectedSha).toLowerCase()
    )
    .sort((left, right) => Date.parse(right?.created_on || '') - Date.parse(left?.created_on || ''));

  if (!matching.length) return { state: 'not-found' };

  const deployment = matching[0];
  const latest = deployment.latest_stage || {};
  const stageName = String(latest.name || 'unknown').toLowerCase();
  const stageStatus = String(latest.status || 'unknown').toLowerCase();

  if (deployment.is_skipped === true) {
    return { state: 'failed', reason: 'deployment-skipped', stage: stageName, status: stageStatus };
  }
  if (['failure', 'canceled'].includes(stageStatus)) {
    return { state: 'failed', reason: 'deployment-stage-failed', stage: stageName, status: stageStatus };
  }
  if (stageName === 'deploy' && stageStatus === 'success') {
    return {
      state: 'ready',
      deploymentId: String(deployment.id || ''),
      stage: stageName,
      status: stageStatus,
    };
  }
  return { state: 'pending', stage: stageName, status: stageStatus };
}

function safeApiError(status) {
  return 'Cloudflare Pages deployment API returned HTTP ' + Number(status) + '. Credentials and response bodies are omitted.';
}

export async function waitForProductionDeployment({
  env = process.env,
  fetchImpl = fetch,
  sleepImpl = ms => new Promise(resolve => setTimeout(resolve, ms)),
  nowImpl = () => Date.now(),
  logImpl = line => console.log(line),
  timeoutMs = Number(env.OVYX_CF_DEPLOY_GATE_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
  pollIntervalMs = Number(env.OVYX_CF_DEPLOY_GATE_POLL_MS) || DEFAULT_POLL_MS,
} = {}) {
  const { token, accountId, project, expectedSha } = validateEnv(env);
  const timeout = Math.min(15 * 60 * 1000, Math.max(1000, Number(timeoutMs) || DEFAULT_TIMEOUT_MS));
  const pollInterval = Math.min(30_000, Math.max(100, Number(pollIntervalMs) || DEFAULT_POLL_MS));
  const deadline = nowImpl() + timeout;
  const url = new URL(
    API_ROOT + '/accounts/' + encodeURIComponent(accountId) +
      '/pages/projects/' + encodeURIComponent(project) + '/deployments'
  );
  url.searchParams.set('env', 'production');
  url.searchParams.set('per_page', '20');
  let lastObservation = { state: 'not-found' };

  while (nowImpl() <= deadline) {
    let response;
    try {
      response = await fetchImpl(url, {
        method: 'GET',
        headers: {
          Authorization: 'Bearer ' + token,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        redirect: 'error',
      });
    } catch {
      if (nowImpl() >= deadline) break;
      await sleepImpl(Math.min(pollInterval, Math.max(0, deadline - nowImpl())));
      continue;
    }

    if ([401, 403].includes(response.status)) {
      throw new Error(safeApiError(response.status) + ' Check that the token has Pages Read permission.');
    }
    if (!response.ok) {
      if (RETRYABLE_HTTP.has(response.status) && nowImpl() < deadline) {
        await sleepImpl(Math.min(pollInterval, Math.max(0, deadline - nowImpl())));
        continue;
      }
      throw new Error(safeApiError(response.status));
    }

    let body;
    try { body = await response.json(); } catch {
      throw new Error('Cloudflare Pages deployment API returned invalid JSON; no deployment was assumed successful.');
    }
    if (body?.success !== true || !Array.isArray(body?.result)) {
      throw new Error('Cloudflare Pages deployment API response did not contain a valid deployment list; no deployment was assumed successful.');
    }

    lastObservation = assessProductionDeployment(body.result, expectedSha);
    if (lastObservation.state === 'ready') {
      const result = {
        event: 'ovyx-production-deployment-verified',
        status: 'ready',
        branch: 'main',
        commit: expectedSha,
        deploymentId: lastObservation.deploymentId || null,
        stage: lastObservation.stage,
      };
      logImpl(JSON.stringify(result));
      return result;
    }
    if (lastObservation.state === 'failed') {
      throw new Error(
        'The production deployment for the expected OVYX revision did not succeed (' +
        lastObservation.reason + ', stage=' + lastObservation.stage + ', status=' + lastObservation.status + ').'
      );
    }

    if (nowImpl() >= deadline) break;
    await sleepImpl(Math.min(pollInterval, Math.max(0, deadline - nowImpl())));
  }

  throw new Error(
    'Timed out waiting for a successful production Cloudflare Pages deployment of OVYX main revision ' +
    expectedSha.slice(0, 12) + '. Last observed state: ' + lastObservation.state +
    (lastObservation.stage ? ' (stage=' + lastObservation.stage + ', status=' + lastObservation.status + ')' : '') +
    '. Full acceptance was stopped before live AI generation so it cannot test a stale revision.'
  );
}

const directlyExecuted = process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (directlyExecuted) {
  waitForProductionDeployment().catch(error => {
    console.error('[OVYX DEPLOYMENT GATE] ' + String(error?.message || 'Deployment verification failed.'));
    process.exitCode = 1;
  });
}
