import {
  assertAuthenticated,
} from '../../_lib/firebase.js';

import {
  getJob,
} from '../../_lib/jobs.js';

import {
  json,
  errorResponse,
} from '../../_lib/http.js';

export async function onRequestGet(
  context
) {
  try {
    const user = assertAuthenticated(
      context.data?.user
    );

    const id = new URL(
      context.request.url
    ).searchParams.get('jobId');

    if (!id) {
      return errorResponse(
        'jobId is required.',
        400,
        'JOB_ID_REQUIRED'
      );
    }

    const job = await getJob(
      context.env,
      id
    );

    if (!job) {
      return errorResponse(
        'Agent job not found.',
        404,
        'JOB_NOT_FOUND'
      );
    }

    if (
      job.userId !== user.sub &&
      !(
        user.admin ||
        user.owner
      )
    ) {
      return errorResponse(
        'Not allowed to view this job.',
        403,
        'FORBIDDEN'
      );
    }

    return json({
      ok: true,
      job,
    });
  } catch (err) {
    return errorResponse(
      err.message ||
        'Unable to load agent status.',
      err.status || 500,
      err.code ||
        'AGENT_STATUS_FAILED'
    );
  }
}
