import {
  timingSafeEqual,
} from '../../_lib/firebase.js';

import {
  getJob,
  updateJob,
} from '../../_lib/jobs.js';

import {
  getWorkflowRun,
  getWorkflowJobs,
  getJobLogs,
  updatePullRequest,
} from '../../_lib/github.js';

import {
  repairBranchFromCI,
} from '../../_lib/orchestrator.js';

import {
  json,
  errorResponse,
} from '../../_lib/http.js';

async function verifySignature(
  secret,
  body,
  header
) {
  if (!secret || !header) {
    return false;
  }

  const value = header
    .replace(
      /^sha256=/i,
      ''
    )
    .trim();

  if (
    !/^[A-Za-z0-9+/=]+$/.test(
      value
    )
  ) {
    return false;
  }

  const key =
    await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(
        secret
      ),
      {
        name: 'HMAC',
        hash: 'SHA-256',
      },
      false,
      ['sign']
    );

  const mac =
    new Uint8Array(
      await crypto.subtle.sign(
        'HMAC',
        key,
        new TextEncoder().encode(
          body
        )
      )
    );

  const expected = btoa(
    String.fromCharCode(
      ...mac
    )
  );

  return timingSafeEqual(
    new TextEncoder().encode(
      expected
    ),
    new TextEncoder().encode(
      value
    )
  );
}

function extractJobId(
  branch
) {
  const match = String(
    branch || ''
  ).match(
    /^ovyx\/agent\/([0-9a-f-]{20,80})$/i
  );

  return (
    match?.[1] || null
  );
}

export async function onRequestPost(
  context
) {
  const body =
    await context.request.text();

  const valid =
    await verifySignature(
      context.env
        .OVYX_AGENT_CALLBACK_SECRET,
      body,
      context.request.headers.get(
        'x-ovyx-signature'
      )
    );

  if (!valid) {
    return errorResponse(
      'Invalid callback signature.',
      401,
      'INVALID_CALLBACK_SIGNATURE'
    );
  }

  try {
    const payload =
      JSON.parse(body);

    const runId =
      payload.runId;

    const branch =
      String(
        payload.branch || ''
      );

    const repo =
      payload.repo;

    const jobId = String(
      payload.jobId ||
        extractJobId(branch) ||
        ''
    );

    if (
      !runId ||
      !jobId ||
      !repo?.owner ||
      !repo?.repo
    ) {
      return errorResponse(
        'Incomplete verification callback.',
        400,
        'INVALID_CALLBACK'
      );
    }

    const job = await getJob(
      context.env,
      jobId
    );

    if (!job) {
      return errorResponse(
        'Agent job not found.',
        404,
        'JOB_NOT_FOUND'
      );
    }

    if (
      job.repo.owner.toLowerCase() !==
        String(
          repo.owner
        ).toLowerCase() ||
      job.repo.repo.toLowerCase() !==
        String(
          repo.repo
        ).toLowerCase()
    ) {
      return errorResponse(
        'Callback repository does not match the Agent job.',
        403,
        'CALLBACK_REPO_MISMATCH'
      );
    }

    if (
      job.branch !== branch
    ) {
      return errorResponse(
        'Callback branch does not match the Agent job.',
        403,
        'CALLBACK_BRANCH_MISMATCH'
      );
    }

    const run =
      await getWorkflowRun(
        context.env,
        repo.owner,
        repo.repo,
        runId
      );

    if (
      run.head_branch !==
      branch
    ) {
      return errorResponse(
        'Workflow branch mismatch.',
        403,
        'WORKFLOW_BRANCH_MISMATCH'
      );
    }

    await updateJob(
      context.env,
      jobId,
      {
        ci: {
          runId,
          status: run.status,
          conclusion:
            run.conclusion,
          url:
            run.html_url,
        },
      }
    );

    if (
      run.conclusion ===
      'success'
    ) {
      if (job.prNumber) {
        await updatePullRequest(
          context.env,
          repo.owner,
          repo.repo,
          job.prNumber,
          {
            draft: false,
          }
        );
      }

      await updateJob(
        context.env,
        jobId,
        {
          status:
            'completed',
          completedAt:
            Date.now(),
          verification: {
            static: 'passed',
            ci: 'passed',
            runId,
            runUrl:
              run.html_url,
          },
        }
      );

      return json({
        ok: true,
        status:
          'completed',
        jobId,
        runUrl:
          run.html_url,
      });
    }

    if (
      run.status !==
      'completed'
    ) {
      return json({
        ok: true,
        status:
          'ignored_non_terminal',
        jobId,
      });
    }

    const jobs =
      await getWorkflowJobs(
        context.env,
        repo.owner,
        repo.repo,
        runId
      );

    const failedJobs =
      (jobs.jobs || [])
        .filter(item =>
          [
            'failure',
            'timed_out',
            'cancelled',
          ].includes(
            item.conclusion
          )
        );

    const logs = [];

    for (
      const item of failedJobs.slice(
        0,
        3
      )
    ) {
      try {
        logs.push(
          `JOB ${item.name}\n${await getJobLogs(
            context.env,
            repo.owner,
            repo.repo,
            item.id
          )}`
        );
      } catch (err) {
        logs.push(
          `JOB ${item.name}\nUnable to fetch logs: ${err.message}`
        );
      }
    }

    const output =
      logs
        .join('\n\n')
        .slice(-60_000);

    const repair =
      await repairBranchFromCI(
        {
          env:
            context.env,
          job,
          testOutput:
            output,
          send: () => {},
        }
      );

    if (
      !repair.repaired
    ) {
      await updateJob(
        context.env,
        jobId,
        {
          status:
            'failed',
          ci: {
            runId,
            conclusion:
              run.conclusion,
            output,
          },
        }
      );
    }

    return json({
      ok: true,
      status:
        repair.repaired
          ? 'repair_committed'
          : 'failed',
      jobId,
      repair,
    });
  } catch (err) {
    return errorResponse(
      err.message ||
        'CI callback failed.',
      err.status || 500,
      err.code ||
        'CI_CALLBACK_FAILED'
    );
  }
        }
