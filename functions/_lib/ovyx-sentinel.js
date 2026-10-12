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

  const checks = [];
  const issues = [];
  const started = new Date(now()).toISOString();

  for (const target of CHECK_TARGETS) {
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
      const check = responseCheck(target, response, payload, safeDuration(startedAt, now));
      checks.push(check);
    } catch (error) {
      const timedOut = error?.name === 'AbortError';
      checks.push({
        id: target.id,
        path: target.path,
        status: 'fail',
        ok: false,
        httpStatus: null,
        durationMs: safeDuration(startedAt, now),
        code: timedOut ? 'CHECK_TIMEOUT' : 'CHECK_UNREACHABLE',
        summary: timedOut ? 'Endpoint check timed out.' : 'Endpoint could not be reached.',
      });
    }
  }

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
