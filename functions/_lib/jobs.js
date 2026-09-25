const TTL_SECONDS =
  60 * 60 * 24 * 7;

export async function saveJob(
  env,
  job
) {
  if (
    !env.OVYX_JOBS
  ) {
    return job;
  }

  await env.OVYX_JOBS.put(
    `agent:${job.id}`,
    JSON.stringify(
      job
    ),
    {
      expirationTtl:
        TTL_SECONDS,
    }
  );

  return job;
}

export async function getJob(
  env,
  id
) {
  if (
    !env.OVYX_JOBS
  ) {
    return null;
  }

  const raw =
    await env.OVYX_JOBS.get(
      `agent:${id}`
    );

  return raw
    ? JSON.parse(raw)
    : null;
}

export async function updateJob(
  env,
  id,
  patch
) {
  const current =
    (await getJob(
      env,
      id
    )) || {
      id,
      createdAt:
        Date.now(),
    };

  const next = {
    ...current,
    ...patch,
    updatedAt:
      Date.now(),
  };

  if (
    env.OVYX_JOBS
  ) {
    await env.OVYX_JOBS.put(
      `agent:${id}`,
      JSON.stringify(
        next
      ),
      {
        expirationTtl:
          TTL_SECONDS,
      }
    );
  }

  return next;
}

export async function appendJobEvent(
  env,
  id,
  event
) {
  const current =
    await getJob(
      env,
      id
    );

  if (!current) {
    return null;
  }

  const events =
    Array.isArray(
      current.events
    )
      ? current.events.slice(
          -49
        )
      : [];

  events.push({
    ...event,
    ts:
      Date.now(),
  });

  return updateJob(
    env,
    id,
    {
      events,
    }
  );
  }
