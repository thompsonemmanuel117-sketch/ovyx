const GITHUB_API = 'https://api.github.com';
const REPOSITORY = 'thompsonemmanuel117-sketch/ovyx';
const REQUEST_TIMEOUT_MS = 6000;
const MAX_FAILED_WORKFLOWS = 3;
const MAX_FAILED_JOBS = 4;
const MAX_FAILED_STEPS = 6;
const FAILURE_CONCLUSIONS = new Set(['failure', 'timed_out', 'action_required', 'startup_failure']);

function shortText(value, max = 100) {
  return String(value == null ? '' : value)
    .replace(/(?:Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, '[redacted]')
    .replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|AIza[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,})\b/g, '[redacted]')
    .replace(/(api[_ -]?key|secret|token|password)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function empty(status, summary, extra = {}) {
  return {
    status,
    checkedAt: new Date().toISOString(),
    summary: shortText(summary, 240),
    latestCompletedWorkflowCount: 0,
    failedWorkflows: [],
    ...extra,
  };
}

async function requestGitHub(url, token, fetchImpl) {
  return fetchImpl(url, {
    method: 'GET',
    redirect: 'manual',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer ' + token,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

/**
 * Collects bounded, read-only GitHub Actions failure metadata for Sentinel.
 * It deliberately never downloads raw workflow logs, source files, or artifacts.
 * The caller should pass the result to the diagnostic model as untrusted evidence.
 */
export async function collectSentinelCIMetadata({ env = {}, fetchImpl = fetch, now = Date.now } = {}) {
  const token = String(env?.OVYX_SENTINEL_GITHUB_TOKEN || '').trim();
  if (!token) {
    return empty('skipped', 'Optional GitHub Actions metadata is not configured. Diagnosis will use the saved Sentinel health report only.', {
      code: 'GITHUB_TOKEN_NOT_CONFIGURED',
    });
  }
  if (token.length > 5000 || /[\r\n]/.test(token)) {
    return empty('unavailable', 'The optional GitHub Actions credential has an invalid format.', {
      code: 'GITHUB_TOKEN_INVALID_FORMAT',
    });
  }

  let payload;
  try {
    const response = await requestGitHub(
      GITHUB_API + '/repos/' + REPOSITORY + '/actions/runs?branch=main&per_page=20',
      token,
      fetchImpl,
    );
    if (!response.ok) {
      try { await response.body?.cancel(); } catch {}
      return empty('unavailable', response.status === 401 || response.status === 403
        ? 'GitHub rejected the optional read-only Actions credential or its repository permissions.'
        : 'GitHub Actions metadata could not be retrieved right now.', {
        code: response.status === 401 || response.status === 403
          ? 'GITHUB_TOKEN_REJECTED'
          : 'GITHUB_ACTIONS_METADATA_UNAVAILABLE',
        httpStatus: response.status,
      });
    }
    payload = await response.json();
  } catch (error) {
    return empty('unavailable', error?.name === 'AbortError'
      ? 'The GitHub Actions metadata request timed out.'
      : 'The GitHub Actions metadata request could not reach GitHub.', {
      code: error?.name === 'AbortError' ? 'GITHUB_ACTIONS_TIMEOUT' : 'GITHUB_ACTIONS_UNREACHABLE',
    });
  }

  const latestByWorkflow = new Map();
  for (const run of Array.isArray(payload?.workflow_runs) ? payload.workflow_runs.slice(0, 20) : []) {
    if (String(run?.status || '').toLowerCase() !== 'completed') continue;
    const workflowId = String(run?.workflow_id || run?.name || 'unknown').slice(0, 100);
    const current = latestByWorkflow.get(workflowId);
    const createdAt = String(run?.created_at || '');
    if (!current || createdAt > String(current?.created_at || '')) {
      latestByWorkflow.set(workflowId, {
        workflowId,
        name: shortText(run?.name || 'Unnamed workflow', 100),
        conclusion: String(run?.conclusion || 'unknown').toLowerCase(),
        created_at: createdAt,
        runId: Number.isSafeInteger(Number(run?.id)) && Number(run.id) > 0 ? Number(run.id) : null,
      });
    }
  }
  const latest = [...latestByWorkflow.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const failed = latest.filter(run => FAILURE_CONCLUSIONS.has(run.conclusion)).slice(0, MAX_FAILED_WORKFLOWS);

  const failedWorkflows = await Promise.all(failed.map(async run => {
    const item = {
      workflow: run.name,
      conclusion: run.conclusion,
      completedAt: shortText(run.created_at, 35),
      failedJobs: [],
      jobMetadataStatus: run.runId ? 'pending' : 'unavailable',
    };
    if (!run.runId) return item;
    try {
      const response = await requestGitHub(
        GITHUB_API + '/repos/' + REPOSITORY + '/actions/runs/' + encodeURIComponent(String(run.runId)) + '/jobs?per_page=30',
        token,
        fetchImpl,
      );
      if (!response.ok) {
        try { await response.body?.cancel(); } catch {}
        item.jobMetadataStatus = 'unavailable';
        return item;
      }
      const jobsPayload = await response.json();
      const failedJobs = (Array.isArray(jobsPayload?.jobs) ? jobsPayload.jobs : [])
        .filter(job => FAILURE_CONCLUSIONS.has(String(job?.conclusion || '').toLowerCase()))
        .slice(0, MAX_FAILED_JOBS)
        .map(job => ({
          job: shortText(job?.name || 'Unnamed job', 100),
          conclusion: String(job?.conclusion || 'unknown').toLowerCase(),
          failedSteps: (Array.isArray(job?.steps) ? job.steps : [])
            .filter(step => FAILURE_CONCLUSIONS.has(String(step?.conclusion || '').toLowerCase()))
            .slice(0, MAX_FAILED_STEPS)
            .map(step => ({
              name: shortText(step?.name || 'Unnamed step', 120),
              conclusion: String(step?.conclusion || 'unknown').toLowerCase(),
              number: Number.isSafeInteger(Number(step?.number)) && Number(step.number) > 0
                ? Number(step.number)
                : null,
            })),
        }));
      item.failedJobs = failedJobs;
      item.jobMetadataStatus = 'checked';
      return item;
    } catch {
      item.jobMetadataStatus = 'unavailable';
      return item;
    }
  }));

  const code = failedWorkflows.length ? 'LATEST_CI_FAILURES_FOUND'
    : latest.length ? 'LATEST_CI_WORKFLOWS_COMPLETED'
      : 'NO_COMPLETED_CI_WORKFLOWS';
  return {
    status: failedWorkflows.length ? 'fail' : latest.length ? 'checked' : 'unknown',
    checkedAt: new Date(now()).toISOString(),
    code,
    summary: failedWorkflows.length
      ? 'Recent completed GitHub Actions workflows include failures. Only workflow/job/step metadata is included; raw logs were not downloaded.'
      : latest.length
        ? 'The latest completed GitHub Actions workflows were checked. No recent completed workflow failure was found in the fetched window.'
        : 'GitHub returned no completed workflow runs in the fetched window; CI health cannot be confirmed.',
    latestCompletedWorkflowCount: latest.length,
    latestCompletedWorkflows: latest.slice(0, 12).map(run => ({
      workflow: run.name,
      conclusion: run.conclusion,
      completedAt: shortText(run.created_at, 35),
    })),
    failedWorkflows,
  };
}
