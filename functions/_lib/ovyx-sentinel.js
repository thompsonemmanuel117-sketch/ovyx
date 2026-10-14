
// Provider checks validate that configured server-side credentials can reach
// each provider's low-cost model-list endpoint. They do not consume generation
// credits and cannot guarantee billing balance or permissions for every model.
const AI_PROVIDER_TARGETS = Object.freeze([
  { id: 'ai_gemini', provider: 'Gemini', key: 'GEMINI_API_KEY', url: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', headers: key => ({ 'x-goog-api-key': key }) },
  { id: 'ai_anthropic', provider: 'Anthropic', key: 'ANTHROPIC_API_KEY', url: 'https://api.anthropic.com/v1/models?limit=1', headers: key => ({ 'x-api-key': key, 'anthropic-version': '2023-06-01' }) },
  { id: 'ai_deepseek', provider: 'DeepSeek', key: 'DEEPSEEK_API_KEY', url: 'https://api.deepseek.com/models', headers: key => ({ Authorization: 'Bearer ' + key }) },
  { id: 'ai_openai', provider: 'OpenAI', key: 'OPENAI_API_KEY', url: 'https://api.openai.com/v1/models', headers: key => ({ Authorization: 'Bearer ' + key }) },
  { id: 'ai_groq', provider: 'Groq', key: 'GROQ_API_KEY', url: 'https://api.groq.com/openai/v1/models', headers: key => ({ Authorization: 'Bearer ' + key }) },
  { id: 'ai_openrouter', provider: 'OpenRouter', key: 'OPENROUTER_API_KEY', url: 'https://openrouter.ai/api/v1/models', headers: key => ({ Authorization: 'Bearer ' + key }) },
]);

async function checkAIProviderCredential(target, env, fetchImpl, now) {
  const key = String(env?.[target.key] || '').trim();
  if (!key) {
    return {
      id: target.id,
      path: target.provider + ' credential',
      status: 'skipped',
      ok: true,
      httpStatus: null,
      durationMs: 0,
      code: 'PROVIDER_KEY_NOT_CONFIGURED',
      summary: target.provider + ' API key is not configured; this optional provider was not probed.',
    };
  }

  const startedAt = now();
  try {
    const response = await fetchWithDeadline(fetchImpl, target.url, 6000, {
      Accept: 'application/json',
      ...target.headers(key),
    });
    // Only HTTP metadata is retained; never read or persist provider response bodies.
    try { await response.body?.cancel(); } catch {}
    if (response.ok) {
      return {
        id: target.id, path: target.provider + ' credential', status: 'pass', ok: true,
        httpStatus: response.status, durationMs: safeDuration(startedAt, now),
        code: 'PROVIDER_CREDENTIAL_ACCEPTED',
        summary: target.provider + ' accepted the configured credential for a model-list request.',
      };
    }
    const authFailure = response.status === 401;
    const permissionFailure = response.status === 403;
    const creditFailure = response.status === 402;
    const rateLimited = response.status === 429;
    const status = authFailure || creditFailure ? 'fail' : 'warning';
    const code = authFailure ? 'PROVIDER_AUTH_FAILED'
      : permissionFailure ? 'PROVIDER_PERMISSION_OR_ACCOUNT_RESTRICTED'
      : creditFailure ? 'PROVIDER_BILLING_OR_CREDITS_REQUIRED'
      : rateLimited ? 'PROVIDER_RATE_LIMITED'
      : response.status >= 500 ? 'PROVIDER_UPSTREAM_ERROR' : 'PROVIDER_REQUEST_REJECTED';
    const summary = authFailure ? target.provider + ' rejected the credential (HTTP 401); check whether it was revoked, expired, or copied incorrectly.'
      : permissionFailure ? target.provider + ' denied access (HTTP 403); check account restrictions and API permissions.'
      : creditFailure ? target.provider + ' reported a billing or credit restriction (HTTP 402).'
      : rateLimited ? target.provider + ' rate-limited the diagnostic request (HTTP 429); retry later.'
      : response.status >= 500 ? target.provider + ' is temporarily reporting an upstream error.'
      : target.provider + ' rejected the diagnostic request (HTTP ' + response.status + ').';
    return { id: target.id, path: target.provider + ' credential', status, ok: false,
      httpStatus: response.status, durationMs: safeDuration(startedAt, now), code, summary };
  } catch (error) {
    const timedOut = error?.name === 'AbortError';
    return { id: target.id, path: target.provider + ' credential', status: 'warning', ok: false,
      httpStatus: null, durationMs: safeDuration(startedAt, now),
      code: timedOut ? 'PROVIDER_CHECK_TIMEOUT' : 'PROVIDER_CHECK_UNREACHABLE',
      summary: timedOut ? target.provider + ' credential check timed out.' : target.provider + ' credential check could not reach the provider.' };
  }
}

const CHECK_TARGETS = Object.freeze([
  { id: 'app_shell', path: '/', kind: 'html' },
  { id: 'platform_health', path: '/api/health', kind: 'json' },
  { id: 'service_configuration', path: '/api/service-status', kind: 'json' },
  { id: 'assistant_asset', path: '/assets/ovyx-assistant-workspace.js', kind: 'asset' },
  { id: 'sentinel_asset', path: '/assets/ovyx-sentinel.js', kind: 'asset' },
]);

function safeDuration(startedAt, now) {
  return Math.max(0, Math.min(120000, Math.round(now() - startedAt)));
}

function responseCheck(target, response, payload, durationMs) {
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  const check = {
    id: target.id,
    path: target.path,
    status: response.ok ? 'pass' : 'fail',
    ok: response.ok,
    httpStatus: response.status,
    durationMs,
    code: response.ok ? 'HTTP_OK' : ('HTTP_' + response.status),
    summary: response.ok ? 'Endpoint responded successfully.' : ('Endpoint returned HTTP ' + response.status + '.'),
  };

  if (response.ok && target.kind === 'html' && !contentType.includes('text/html')) {
    check.status = 'warning';
    check.ok = false;
    check.code = 'UNEXPECTED_CONTENT_TYPE';
    check.summary = 'The application route did not return HTML.';
  }

  if (response.ok && target.kind === 'asset' && !contentType.includes('javascript') && !contentType.includes('text/plain')) {
    check.status = 'warning';
    check.ok = false;
    check.code = 'UNEXPECTED_ASSET_CONTENT_TYPE';
    check.summary = 'A required assistant JavaScript asset did not return a JavaScript content type.';
  }

  if (response.ok && target.id === 'platform_health' && payload && typeof payload === 'object') {
    const degraded = payload.ok === false || String(payload.status || '').toLowerCase() === 'degraded';
    if (degraded) {
      check.status = 'warning';
      check.ok = false;
      check.code = 'PLATFORM_HEALTH_DEGRADED';
      check.summary = 'The platform health endpoint reports degraded configuration or service health.';
      const names = [
        ...(Array.isArray(payload.missingRequiredEnvironment) ? payload.missingRequiredEnvironment : []),
        ...(Array.isArray(payload.emptyRequiredEnvironment) ? payload.emptyRequiredEnvironment : []),
        ...(Array.isArray(payload.unavailableRequiredEnvironment) ? payload.unavailableRequiredEnvironment : []),
        ...(Array.isArray(payload.invalidRequiredEnvironment) ? payload.invalidRequiredEnvironment.map(item => item && typeof item === 'object' ? item.key : item) : []),
      ];
      check.details = [...new Set(names.map(value => String(value || '').slice(0, 90).replace(/[^A-Za-z0-9_.-]/g, '')).filter(Boolean))].slice(0, 16);
    }
  }

  if (response.ok && target.id === 'service_configuration' && payload && typeof payload === 'object') {
    const encryptionConfigured = payload.connectionEncryption?.configured === true;
    if (!encryptionConfigured) {
      check.status = 'warning';
      check.ok = false;
      check.code = 'CONNECTION_ENCRYPTION_NOT_CONFIGURED';
      check.summary = 'Universal Connection secret encryption is not configured; credential-based connections may be unavailable.';
    }
  }

  return check;
}

async function fetchWithDeadline(fetchImpl, url, timeoutMs, extraHeaders = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, {
      method: 'GET',
      headers: { Accept: 'application/json, text/html, application/javascript', 'Cache-Control': 'no-store', ...extraHeaders },
      redirect: 'manual',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function collectSentinelChecks({ origin, env = {}, fetchImpl = fetch, now = Date.now } = {}) {
  const base = new URL(String(origin || ''));
  if (base.protocol !== 'https:' && base.hostname !== 'localhost' && base.hostname !== '127.0.0.1') {
    throw Object.assign(new Error('Sentinel requires an HTTPS site origin.'), { code: 'HTTPS_REQUIRED' });
  }
  if (base.username || base.password) throw Object.assign(new Error('Site origin must not include credentials.'), { code: 'INVALID_SITE_ORIGIN' });

  const issues = [];
  const started = new Date(now()).toISOString();

  // Probe the five first-party health targets concurrently. Serial 8-second
  // timeouts could otherwise consume the separate Cron Worker's 45-second
  // request budget before it can save a report.
  const checks = await Promise.all(CHECK_TARGETS.map(async target => {
    const startedAt = now();
    try {
      const url = new URL(target.path, base.origin).toString();
      const response = await fetchWithDeadline(fetchImpl, url, 8000);
      let payload = null;
      if (target.kind === 'json' && String(response.headers.get('content-type') || '').toLowerCase().includes('json')) {
        try { payload = await response.json(); } catch { payload = null; }
      } else if (target.kind === 'json') {
        try { await response.body?.cancel(); } catch {}
      }
      return responseCheck(target, response, payload, safeDuration(startedAt, now));
    } catch (error) {
      const timedOut = error?.name === 'AbortError';
      return {
        id: target.id,
        path: target.path,
        status: 'fail',
        ok: false,
        httpStatus: null,
        durationMs: safeDuration(startedAt, now),
        code: timedOut ? 'CHECK_TIMEOUT' : 'CHECK_UNREACHABLE',
        summary: timedOut ? 'Endpoint check timed out.' : 'Endpoint could not be reached.',
      };
    }
  }));

  const providerChecks = await Promise.all(AI_PROVIDER_TARGETS.map(target => checkAIProviderCredential(target, env, fetchImpl, now)));
  checks.push(...providerChecks);

  if (String(env.OVYX_SENTINEL_GITHUB_TOKEN || '').trim()) {
    const startedAt = now();
    try {
      const response = await fetchWithDeadline(fetchImpl,
        'https://api.github.com/repos/thompsonemmanuel117-sketch/ovyx/actions/runs?branch=main&per_page=20',
        8000,
        {
          Authorization: 'Bearer ' + String(env.OVYX_SENTINEL_GITHUB_TOKEN).trim(),
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      );
      if (!response.ok) {
        checks.push({
          id: 'github_actions',
          path: 'GitHub Actions · main',
          status: 'warning',
          ok: false,
          httpStatus: response.status,
          durationMs: safeDuration(startedAt, now),
          code: response.status === 401 || response.status === 403 ? 'GITHUB_TOKEN_REJECTED' : 'GITHUB_ACTIONS_UNAVAILABLE',
          summary: 'Recent CI results could not be checked. Verify the optional Sentinel GitHub token and repository access.',
        });
      } else {
        const data = await response.json().catch(() => ({}));
        const latestByWorkflow = new Map();
        for (const run of Array.isArray(data.workflow_runs) ? data.workflow_runs : []) {
          const key = String(run.workflow_id || run.name || 'unknown');
          const current = latestByWorkflow.get(key);
          if (!current || String(run.created_at || '') > String(current.created_at || '')) latestByWorkflow.set(key, run);
        }
        const failed = [...latestByWorkflow.values()].filter(run => run.status === 'completed' && !['success', 'neutral', 'skipped'].includes(String(run.conclusion || '').toLowerCase()));
        checks.push({
          id: 'github_actions',
          path: 'GitHub Actions · main',
          status: failed.length ? 'fail' : 'pass',
          ok: failed.length === 0,
          httpStatus: response.status,
          durationMs: safeDuration(startedAt, now),
          code: failed.length ? 'LATEST_CI_RUN_FAILED' : 'LATEST_CI_RUNS_HEALTHY',
          summary: failed.length
            ? (String(failed.length) + ' workflow(s) have a latest completed run that did not succeed.')
            : 'Latest completed workflow runs on main are successful or no completed failure was found.',
          details: failed.slice(0, 8).map(run => String(run.name || run.workflow_id || 'Workflow').slice(0, 100)),
        });
      }
    } catch (error) {
      checks.push({
        id: 'github_actions',
        path: 'GitHub Actions · main',
        status: 'warning',
        ok: false,
        httpStatus: null,
        durationMs: safeDuration(startedAt, now),
        code: error?.name === 'AbortError' ? 'GITHUB_CHECK_TIMEOUT' : 'GITHUB_CHECK_UNREACHABLE',
        summary: 'Recent CI results could not be checked.',
      });
    }
  } else {
    checks.push({
      id: 'github_actions',
      path: 'GitHub Actions · main',
      status: 'skipped',
      ok: true,
      httpStatus: null,
      durationMs: 0,
      code: 'GITHUB_TOKEN_NOT_CONFIGURED',
      summary: 'Optional CI-history monitoring is not configured. Core application health checks still run.',
    });
  }

  const finished = new Date(now()).toISOString();
  for (const check of checks) {
    if (check.status === 'fail') {
      issues.push({ severity: 'critical', checkId: check.id, code: check.code, summary: check.summary, details: check.details || [] });
    } else if (check.status === 'warning') {
      issues.push({ severity: 'warning', checkId: check.id, code: check.code, summary: check.summary, details: check.details || [] });
    }
  }

  return { startedAt: started, finishedAt: finished, checks, issues };
}

export function createSentinelReport({ scan, id, source = 'manual', previousScheduledAt = null } = {}) {
  const checks = Array.isArray(scan?.checks) ? scan.checks.slice() : [];
  const lastScheduledTime = source === 'scheduled' ? String(scan?.finishedAt || '') : String(previousScheduledAt || '');
  const scheduleAgeMs = lastScheduledTime ? Date.now() - Date.parse(lastScheduledTime) : Infinity;
  const scheduleActive = Number.isFinite(scheduleAgeMs) && scheduleAgeMs >= 0 && scheduleAgeMs <= 45 * 60 * 1000;

  checks.push({
    id: 'background_scheduler',
    path: 'Cloudflare Cron Worker',
    status: scheduleActive ? 'pass' : 'warning',
    ok: scheduleActive,
    httpStatus: null,
    durationMs: 0,
    code: scheduleActive ? 'SCHEDULE_RECENTLY_CONFIRMED' : 'SCHEDULE_NOT_RECENTLY_CONFIRMED',
    summary: scheduleActive
      ? 'A scheduled Sentinel run was recorded within the last 45 minutes.'
      : 'A recent scheduled Sentinel run has not been recorded. The scheduler Worker may not be deployed or its secret may not be configured.',
  });

  const issues = [];
  for (const check of checks) {
    if (check.status === 'fail') issues.push({ severity: 'critical', checkId: check.id, code: check.code, summary: check.summary, details: check.details || [] });
    else if (check.status === 'warning') issues.push({ severity: 'warning', checkId: check.id, code: check.code, summary: check.summary, details: check.details || [] });
  }
  const criticalCount = issues.filter(issue => issue.severity === 'critical').length;
  const warningCount = issues.filter(issue => issue.severity === 'warning').length;
  const scanned = checks.filter(check => check.status !== 'skipped').length;
  const passed = checks.filter(check => check.status === 'pass').length;
  return {
    id: String(id || ''),
    version: 1,
    source: source === 'scheduled' ? 'scheduled' : 'manual',
    status: criticalCount ? 'critical' : warningCount ? 'needs_attention' : 'healthy',
    startedAt: String(scan?.startedAt || new Date().toISOString()),
    finishedAt: String(scan?.finishedAt || new Date().toISOString()),
    checkedCount: scanned,
    passedCount: passed,
    criticalCount,
    warningCount,
    checks,
    issues: issues.slice(0, 40),
  };
}


const SAFE_REMEDIATION_GUIDANCE = Object.freeze({
  PLATFORM_HEALTH_DEGRADED: {
    title: 'Review required platform configuration',
    steps: [
      'Open the OVYX Cloudflare Pages Production environment settings and check the listed configuration names.',
      'Repair only values confirmed missing or invalid in the correct environment. Enter secrets in the secure dashboard field; never put them in Git, chat, browser reports, or logs.',
      'Run another Sentinel scan after the configuration is saved and the deployment is available.',
    ],
  },
  CONNECTION_ENCRYPTION_NOT_CONFIGURED: {
    title: 'Verify Universal Connections encryption configuration',
    steps: [
      'Check whether OVYX_CONNECTION_ENCRYPTION_KEY is present and at least 32 characters in Cloudflare Pages Production.',
      'Do not replace or rotate an existing encryption key if saved Universal Connections may contain encrypted credentials; rotation needs an explicit migration/recovery plan.',
      'Never expose the key in chat, Git, screenshots, or logs, then rerun the health check.',
    ],
  },
  LATEST_CI_RUN_FAILED: {
    title: 'Inspect the most recent failing CI workflow',
    steps: [
      'Open the repository Actions page and inspect the latest completed run for the named workflow.',
      'Locate the first failing step and preserve the error summary without copying secrets or private user data.',
      'Prepare a targeted code change with a regression test, then run verification before merging. Sentinel has not modified source code.',
    ],
  },
  SCHEDULE_NOT_RECENTLY_CONFIRMED: {
    title: 'Verify background Sentinel scheduling',
    steps: [
      'Confirm the separate ovyx-sentinel-scheduler Worker is deployed with the 30-minute Cron Trigger.',
      'Confirm OVYX_SENTINEL_BASE_URL is the canonical HTTPS origin and the Worker secret matches the Pages secret; do not place the shared value in Git or chat.',
      'Do not claim scheduled monitoring is active until a scheduled report is saved and shows a recent scheduler confirmation.',
    ],
  },
  GITHUB_TOKEN_REJECTED: {
    title: 'Check optional GitHub Actions monitoring access',
    steps: [
      'Verify the server-side OVYX_SENTINEL_GITHUB_TOKEN is an unexpired, read-only token scoped to this repository Actions metadata.',
      'If replacement is necessary, update it through the approved secure secret manager and never display or log the token.',
      'Run a Sentinel scan again to confirm the optional check can read workflow status.',
    ],
  },
  GITHUB_ACTIONS_UNAVAILABLE: {
    title: 'Retry optional GitHub Actions monitoring',
    steps: [
      'Check GitHub service status and the repository Actions page before assuming the OVYX application is down.',
      'If the problem persists, inspect the optional Sentinel token permissions and recent server-side network errors without exposing the token.',
      'Rerun Sentinel after the upstream service is available.',
    ],
  },
  UNEXPECTED_CONTENT_TYPE: {
    title: 'Verify the application shell route',
    steps: [
      'Confirm the current Cloudflare Pages deployment is serving the expected HTML shell at the site root.',
      'Check the latest deployment result and the route/build output before changing middleware or Web Studio code.',
      'Run desktop/mobile browser checks after a targeted correction.',
    ],
  },
  UNEXPECTED_ASSET_CONTENT_TYPE: {
    title: 'Verify an assistant runtime asset',
    steps: [
      'Confirm the current Pages deployment serves the required asset as JavaScript rather than an HTML fallback.',
      'Check the asset path and deployment output; preserve the existing Web Studio generation pipeline.',
      'Rerun the Sentinel asset check and desktop/mobile tests.',
    ],
  },
});

export function createSentinelFixPlan(report) {
  const checks = Array.isArray(report?.checks) ? report.checks : [];
  const affected = checks.filter(check => check && ['fail', 'warning'].includes(String(check.status || '')));
  const tasks = [];
  const seen = new Set();

  for (const check of affected) {
    if (tasks.length >= 12) break;
    const code = String(check.code || '').trim().slice(0, 100);
    const checkId = String(check.id || 'system_check').trim().slice(0, 80);
    const key = checkId + ':' + code;
    if (seen.has(key)) continue;
    seen.add(key);

    let guidance = SAFE_REMEDIATION_GUIDANCE[code];
    if (!guidance && /^HTTP_[45]\d{2}$/.test(code)) {
      guidance = {
        title: 'Investigate an endpoint HTTP error',
        steps: [
          'Check the current Pages deployment result and the server-side logs for the named endpoint and timestamp.',
          'Determine whether the failure is transient or a repeatable route/configuration issue before editing code.',
          'Make a narrow fix with a regression test, rerun the relevant checks, and verify the endpoint again.',
        ],
      };
    } else if (!guidance && ['CHECK_TIMEOUT', 'CHECK_UNREACHABLE', 'GITHUB_CHECK_TIMEOUT', 'GITHUB_CHECK_UNREACHABLE'].includes(code)) {
      guidance = {
        title: 'Retry an unreachable or timed-out health check',
        steps: [
          'Check whether the site or upstream service is reachable and whether a deployment is currently in progress.',
          'Retry the check before treating a single timeout as a confirmed outage.',
          'If it repeats, inspect the affected route or upstream status and add a regression check for the confirmed cause.',
        ],
      };
    } else if (!guidance && code === 'GITHUB_TOKEN_NOT_CONFIGURED') {
      guidance = {
        title: 'Optional CI history monitoring is not enabled',
        steps: [
          'Core Sentinel health checks can still run without this optional integration.',
          'If CI history monitoring is needed, configure a read-only GitHub Actions token as a server-side secret.',
          'Do not put a token in source code, requests, or report history.',
        ],
      };
    } else if (!guidance) {
      guidance = {
        title: 'Review the reported system check',
        steps: [
          'Read the check code and sanitized summary in the Sentinel report.',
          'Reproduce the issue using the smallest relevant health check before changing configuration or source code.',
          'Prepare a targeted, reviewable fix with a regression test. Do not apply destructive changes or deploy automatically.',
        ],
      };
    }

    const detailNames = code === 'PLATFORM_HEALTH_DEGRADED' && Array.isArray(check.details)
      ? [...new Set(check.details.map(value => String(value || '').trim()).filter(value => /^[A-Z][A-Z0-9_]{1,79}$/.test(value)))].slice(0, 16)
      : [];
    tasks.push({
      id: key,
      checkId,
      code,
      priority: check.status === 'fail' ? 'critical' : 'warning',
      title: guidance.title,
      issue: String(check.summary || 'A system check needs attention.').replace(/\s+/g, ' ').trim().slice(0, 240),
      ...(detailNames.length ? { configurationNames: detailNames } : {}),
      steps: guidance.steps.slice(0, 6),
    });
  }

  const critical = affected.filter(check => check.status === 'fail').length;
  const warnings = affected.filter(check => check.status === 'warning').length;
  return {
    sourceReportId: String(report?.id || '').slice(0, 100) || null,
    generatedAt: new Date().toISOString(),
    status: tasks.length ? 'attention_required' : report ? 'clear' : 'no_report',
    summary: !report
      ? 'Run a Sentinel scan before preparing a remediation plan.'
      : tasks.length
        ? 'Prepared ' + tasks.length + ' reviewable task(s) from ' + critical + ' critical finding(s) and ' + warnings + ' warning(s).'
        : 'No remediation steps are indicated by the latest saved checks.',
    automaticChanges: false,
    tasks,
    note: 'Advisory only. This plan does not edit source files, change Cloudflare settings, rotate credentials, access private user projects or conversations, or deploy code.',
  };
}

export function sentinelCronSecretMatches(provided, configured) {
  const left = new TextEncoder().encode(String(provided || ''));
  const right = new TextEncoder().encode(String(configured || ''));
  if (left.length < 32 || left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left[index] ^ right[index];
  return mismatch === 0;
}

export function isSentinelAdmin(user) {
  const email = String(user?.email || '').trim().toLowerCase();
  return Boolean(user && user.emailVerified === true && email === 'ovyxsupportteam@gmail.com');
}
