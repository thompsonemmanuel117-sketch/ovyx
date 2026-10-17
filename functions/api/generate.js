import {
  assertAgentAccess,
} from '../_lib/firebase.js';

import {
  normalizeRepo,
  assertRepoAllowed,
} from '../_lib/entitlements.js';

import {
  readJson,
  errorResponse,
  sseResponse,
} from '../_lib/http.js';

import {
  runAgent,
} from '../_lib/orchestrator.js';

import {
  getFirestoreDataAtPath,
} from '../_lib/firebase-admin.js';

import {
  saveJob,
  updateJob,
} from '../_lib/jobs.js';

import {
  beginAIQuota,
  calculateTokenUsage,
  finalizeAIQuota,
  refundDailyPrompt,
} from '../_lib/token-quota.js';

export async function onRequestPost(
  context
) {
  const user =
    context.data?.user;
  let quotaReservation = null;
  let streamStarted = false;
  let agentCompleted = false;

  try {
    assertAgentAccess(
      user,
      context.env
    );

    if (
      !context.env.OVYX_JOBS
    ) {
      return errorResponse(
        'OVYX_JOBS KV binding is required for Agent Mode.',
        503,
        'AGENT_JOBS_NOT_CONFIGURED'
      );
    }

    const payload =
      await readJson(
        context.request,
        Number(
          context.env
            .AGENT_REQUEST_MAX_BYTES ||
            800_000
        )
      );

    const prompt =
      String(
        payload.prompt ||
          payload.message ||
          ''
      ).trim();

    if (!prompt) {
      return errorResponse(
        'Agent prompt is required.',
        400,
        'PROMPT_REQUIRED'
      );
    }

    if (
      prompt.length >
      Number(
        context.env
          .AGENT_MAX_PROMPT_CHARS ||
          20_000
      )
    ) {
      return errorResponse(
        'Agent prompt is too long.',
        413,
        'PROMPT_TOO_LARGE'
      );
    }

    const rawRepo =
      payload.repo ||
      {};

    const repo =
      assertRepoAllowed(
        user,
        context.env,
        normalizeRepo(
          rawRepo.owner ||
            context.env
              .GITHUB_DEFAULT_OWNER,

          rawRepo.name ||
            context.env
              .GITHUB_DEFAULT_REPO
        )
      );

    const baseBranch =
      String(
        rawRepo.branch ||
          payload.branch ||
          context.env
            .GITHUB_DEFAULT_BRANCH ||
          'main'
      ).trim();

    if (
      !/^[A-Za-z0-9_.\/-]{1,200}$/.test(
        baseBranch
      )
    ) {
      return errorResponse(
        'Invalid base branch.',
        400,
        'INVALID_BRANCH'
      );
    }

    // Reserve one user-visible AI build attempt before starting the Agent.
    // All model calls made by the multi-stage Agent are aggregated and charged
    // once at the end, while exhausted daily prompts are reserved atomically.
    quotaReservation = await beginAIQuota(context.env, user);
    const quotaUsage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 };
    let usageEstimated = false;
    const onUsage = (rawUsage, inputText, outputText) => {
      const usage = calculateTokenUsage(rawUsage, inputText, outputText);
      quotaUsage.input_tokens += Math.max(0, Number(usage.inputTokens) || 0);
      quotaUsage.output_tokens += Math.max(0, Number(usage.outputTokens) || 0);
      quotaUsage.total_tokens += Math.max(0, Number(usage.totalTokens) || 0);
      usageEstimated = usageEstimated || usage.estimated === true;
    };

    const userEmail = String(user?.email || '').trim().toLowerCase();
    const brandProfile = userEmail
      ? await getFirestoreDataAtPath(
          context.env,
          ['users', userEmail, 'brand_profile', 'config']
        ).catch(() => null)
      : null;

    const jobId =
      crypto.randomUUID();

    await saveJob(
      context.env,
      {
        id:
          jobId,

        status:
          'queued',

        createdAt:
          Date.now(),

        userId:
          user.sub,

        repo,

        baseBranch,

        prompt,

        requestedProvider:
          String(
            payload.provider ||
              'automatic'
          ).toLowerCase(),

        model:
          payload.model ||
          null,

        delivery:
          payload.delivery ===
          'preview'
            ? 'preview'
            : 'pr',

        events: [],
      }
    );

    streamStarted = true;
    return sseResponse(
      async send => {
        try {
          await send(
            'progress',
            {
              stage:
                'queued',
              message:
                'OVYX Agent accepted the task.',
            }
          );

          const result =
            await runAgent(
              {
                env:
                  context.env,

                user,

                repo,

                baseBranch,

                prompt,

                send,

                jobId,

                requestedProvider:
                  String(
                    payload.provider ||
                      'automatic'
                  ).toLowerCase(),

                model:
                  payload.model ||
                  undefined,

                onUsage,

                clientContext:
                  {
                    ...(payload.context || {}),
                    brandProfile: brandProfile || undefined,
                    mode: String(payload.mode || 'agent').slice(0, 60),
                  },

                allowDeletes:
                  payload.allowDeletes ===
                    true &&
                  !!user?.admin,

                allowWorkflowChanges:
                  payload.allowWorkflowChanges ===
                    true &&
                  !!user?.admin,

                delivery:
                  payload.delivery ===
                  'preview'
                    ? 'preview'
                    : 'pr',
              }
            );

          agentCompleted = true;
          const quota = await finalizeAIQuota(
            context.env,
            quotaReservation,
            quotaUsage,
            '',
            ''
          );
          if (quota?.usage) quota.usage.estimated = usageEstimated;
          await send('quota', { quota });

          await updateJob(
            context.env,
            jobId,
            { ...result, quota }
          );
        } catch (
          err
        ) {
          // A reserved daily prompt is refunded when the Agent fails before it
          // completes. If accounting itself fails after work completed, never
          // pretend the completed build did not consume its allowance.
          if (!agentCompleted) {
            try {
              // Partial Agent runs still consumed real provider tokens. Charge
              // those calls instead of refunding a daily prompt and losing usage.
              if (Number(quotaUsage.total_tokens) > 0) {
                const partialQuota = await finalizeAIQuota(
                  context.env,
                  quotaReservation,
                  quotaUsage,
                  '',
                  ''
                );
                if (partialQuota?.usage) partialQuota.usage.estimated = usageEstimated;
              } else {
                await refundDailyPrompt(context.env, quotaReservation);
              }
            } catch (accountingError) {
              console.error('[OVYX AGENT QUOTA ACCOUNTING]', accountingError?.message || accountingError);
            }
          }
          await updateJob(
            context.env,
            jobId,
            {
              status:
                'failed',
              error:
                err.message,
              code:
                err.code ||
                'AGENT_FAILED',
            }
          );

          throw err;
        }
      }
    );
  } catch (
    err
  ) {
    if (quotaReservation && !streamStarted) {
      try { await refundDailyPrompt(context.env, quotaReservation); } catch {}
    }
    return errorResponse(
      err.message ||
        'Unable to start OVYX Agent.',
      err.status || 500,
      err.code ||
        'AGENT_START_FAILED'
    );
  }
        }
