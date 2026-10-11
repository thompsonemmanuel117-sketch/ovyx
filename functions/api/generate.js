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

    const userEmail = String(user?.email || '').trim().toLowerCase();
    const brandProfile = userEmail
      ? await getFirestoreDataAtPath(
          context.env,
          ['users', userEmail, 'brand_profile']
        ).catch(() => null)
      : null;

    const jobId =
      crypto.randomUUID();

    // Agent Mode must use the same server-side quota as Web Studio and AI chat.
    const quotaReservation = await beginAIQuota(context.env, user);
    let totalUsedTokens = 0;
    let successfulModelCalls = 0;
    let quotaFinalized = false;

    try {
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
    } catch (saveError) {
      await refundDailyPrompt(context.env, quotaReservation);
      throw saveError;
    }

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

                onAIUsage: ({ rawUsage, inputText, outputText }) => {
                  const usage = calculateTokenUsage(rawUsage, inputText, outputText);
                  totalUsedTokens += Math.max(0, Number(usage.totalTokens) || 0);
                  successfulModelCalls += 1;
                },
              }
            );

          const quota = await finalizeAIQuota(
            context.env,
            quotaReservation,
            { total_tokens: totalUsedTokens },
            '',
            ''
          );
          quotaFinalized = true;
          await send('quota', { ...quota, usedTokens: totalUsedTokens });

          await updateJob(
            context.env,
            jobId,
            result
          );
        } catch (
          err
        ) {
          if (!quotaFinalized) {
            try {
              if (successfulModelCalls > 0) {
                await finalizeAIQuota(
                  context.env,
                  quotaReservation,
                  { total_tokens: totalUsedTokens },
                  '',
                  ''
                );
              } else {
                await refundDailyPrompt(context.env, quotaReservation);
              }
              quotaFinalized = true;
            } catch (quotaError) {
              console.error('[OVYX Agent quota]', {
                code: quotaError?.code || 'QUOTA_FINALIZE_FAILED',
                message: quotaError?.message || 'Unable to finalize Agent quota.'
              });
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
    return errorResponse(
      err.message ||
        'Unable to start OVYX Agent.',
      err.status || 500,
      err.code ||
        'AGENT_START_FAILED'
    );
  }
        }
