import {
  AGENT_SYSTEM_PROMPT,
  planPrompt,
  executePrompt,
  repairPrompt,
} from './prompts.js';

import {
  callJsonModel,
} from './providers.js';

import {
  listTree,
  readFile,
  createBranch,
  commitBatch,
  createPullRequest,
  getBranch,
} from './github.js';

import {
  assertSafePath,
} from './entitlements.js';

import {
  validateChanges,
} from './validator.js';

import {
  appendJobEvent,
  updateJob,
} from './jobs.js';

const DEFAULT_MAX_CONTEXT =
  220_000;

const DEFAULT_MAX_FILE =
  1_800_000;

const DEFAULT_MAX_CHANGED =
  6;

const TEXT_EXTENSIONS =
  /\.(html?|css|js|mjs|cjs|ts|tsx|jsx|json|jsonc|md|mdx|yaml|yml|toml|txt|svg)$/i;

function cap(
  env,
  key,
  fallback
) {
  const n =
    Number(env[key]);

  return Number.isFinite(n) &&
    n > 0
    ? n
    : fallback;
}

function isTextPath(path) {
  return TEXT_EXTENSIONS.test(
    path
  );
}

function pathScore(
  path,
  prompt
) {
  const q =
    String(
      prompt || ''
    ).toLowerCase();

  const tokens =
    q
      .split(
        /[^a-z0-9]+/
      )
      .filter(
        x => x.length > 2
      )
      .slice(0, 16);

  let score = 0;

  const p =
    path.toLowerCase();

  for (
    const token of tokens
  ) {
    if (
      p.includes(token)
    ) {
      score += 8;
    }
  }

  if (
    /package\.json$/.test(
      p
    )
  ) {
    score += 20;
  }

  if (
    /^(index\.html|src\/main\.|src\/app\.)/i.test(
      path
    )
  ) {
    score += 15;
  }

  if (
    /(wrangler|cloudflare|vite|next|astro|tsconfig|firebase)/i.test(
      p
    )
  ) {
    score += 12;
  }

  if (
    /(_middleware|middleware|orchestrator|api\/)/i.test(
      p
    )
  ) {
    score += 10;
  }

  return score;
}

function trimText(
  text,
  max
) {
  if (
    text.length <= max
  ) {
    return text;
  }

  return (
    text.slice(
      0,
      Math.max(
        0,
        max - 120
      )
    ) +
    '\n/* OVYX CONTEXT TRUNCATED */\n'
  );
}

function sanitizeHints(
  hints
) {
  if (
    !hints ||
    typeof hints !==
      'object'
  ) {
    return '{}';
  }

  return JSON.stringify({
    product:
      hints.product,

    activeView:
      hints.activeView,

    activeProject:
      hints.activeProject
        ? {
            id:
              hints
                .activeProject
                .id,

            name:
              hints
                .activeProject
                .name,

            status:
              hints
                .activeProject
                .status,
          }
        : undefined,
  });
}

function sourceIndex(
  text
) {
  const lines =
    String(text).split(
      '\n'
    );

  const out = [];

  const patterns = [
    /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g,

    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(?/g,

    /\bclass\s+([A-Za-z_$][\w$]*)\b/g,

    /id=["']([^"']+)["']/g,

    /data-[\w-]+=["']([^"']+)["']/g,
  ];

  const names =
    new Set();

  for (
    const line of lines.slice(
      0,
      20_000
    )
  ) {
    for (
      const re of patterns
    ) {
      for (
        const m of line.matchAll(
          re
        )
      ) {
        const v =
          m[1];

        if (
          v &&
          v.length < 100
        ) {
          names.add(v);
        }

        if (
          names.size >
          350
        ) {
          return [
            ...names,
          ];
        }
      }
    }
  }

  return [
    ...names,
  ];
}

function promptTerms(
  prompt,
  plan
) {
  const source =
    `${prompt} ${
      (plan?.plan || [])
        .map(
          x => x.goal
        )
        .join(' ')
    }`.toLowerCase();

  return [
    ...new Set(
      source
        .split(
          /[^a-z0-9_-]+/
        )
        .filter(
          x =>
            x.length > 3
        )
    ),
  ].slice(0, 12);
}

function largeFileContext(
  path,
  text,
  prompt,
  plan
) {
  const terms =
    promptTerms(
      prompt,
      plan
    );

  const windows =
    [];

  const lower =
    text.toLowerCase();

  for (
    const term of terms
  ) {
    let from = 0;
    let hits = 0;

    while (
      hits < 2
    ) {
      const at =
        lower.indexOf(
          term,
          from
        );

      if (
        at < 0
      ) {
        break;
      }

      windows.push({
        at,
        term,
      });

      from =
        at + term.length;

      hits++;
    }
  }

  windows.sort(
    (a, b) =>
      a.at - b.at
  );

  const merged =
    [];

  for (
    const w of windows
  ) {
    const start =
      Math.max(
        0,
        w.at - 3500
      );

    const end =
      Math.min(
        text.length,
        w.at + 4500
      );

    if (
      !merged.some(
        x =>
          start >=
            x.start &&
          start <=
            x.end
      )
    ) {
      merged.push({
        start,
        end,
      });
    }

    if (
      merged.length >=
      8
    ) {
      break;
    }
  }

  if (
    !merged.length
  ) {
    return [
      `FILE: ${path}`,
      `SIZE: ${text.length}`,
      'SYMBOL INDEX:',
      sourceIndex(
        text
      )
        .slice(
          0,
          350
        )
        .join(', '),
      '',
    ].join('\n');
  }

  return [
    `FILE: ${path}`,
    `SIZE: ${text.length}`,
    'MATCHED CONTEXT:',
  ]
    .concat(
      merged.map(
        (w, i) =>
          `\n--- window ${
            i + 1
          } ---\n${text.slice(
            w.start,
            w.end
          )}`
      )
    )
    .join('\n');
}

async function inspectRepo(
  env,
  repo,
  branch,
  prompt,
  plan,
  inspectPaths,
  send
) {
  const tree =
    await listTree(
      env,
      repo.owner,
      repo.repo,
      branch
    );

  const treeEntries =
    tree.files.slice(
      0,
      cap(
        env,
        'AGENT_MAX_TREE_FILES',
        5000
      )
    );

  const lookup =
    new Map(
      treeEntries.map(
        x => [
          x.path,
          x,
        ]
      )
    );

  const selected =
    new Set();

  for (
    const p of
      inspectPaths || []
  ) {
    if (
      lookup.has(p)
    ) {
      selected.add(p);
    }
  }

  const ranked =
    treeEntries
      .filter(
        x =>
          isTextPath(
            x.path
          )
      )
      .sort(
        (a, b) =>
          pathScore(
            b.path,
            prompt
          ) -
          pathScore(
            a.path,
            prompt
          )
      );

  for (
    const item of ranked.slice(
      0,
      12
    )
  ) {
    selected.add(
      item.path
    );
  }

  const contextParts =
    [];

  const files =
    {};

  let total =
    0;

  const maxContext =
    cap(
      env,
      'AGENT_MAX_CONTEXT_BYTES',
      DEFAULT_MAX_CONTEXT
    );

  const maxFile =
    cap(
      env,
      'AGENT_MAX_FILE_BYTES',
      DEFAULT_MAX_FILE
    );

  for (
    const path of selected
  ) {
    const info =
      lookup.get(path);

    if (
      !info ||
      !isTextPath(path)
    ) {
      continue;
    }

    if (
      info.size >
      maxFile
    ) {
      try {
        const file =
          await readFile(
            env,
            repo.owner,
            repo.repo,
            path,
            branch
          );

        files[path] =
          file.content;

        const snippet =
          largeFileContext(
            path,
            file.content,
            prompt,
            plan
          );

        const safe =
          trimText(
            snippet,
            Math.min(
              24_000,
              maxContext -
                total
            )
          );

        if (
          safe.length
        ) {
          contextParts.push(
            safe
          );

          total +=
            safe.length;
        }
      } catch {}

      continue;
    }

    if (
      total >
      maxContext
    ) {
      break;
    }

    const file =
      await readFile(
        env,
        repo.owner,
        repo.repo,
        path,
        branch
      );

    files[path] =
      file.content;

    const safe =
      trimText(
        `FILE: ${path}\n\n${file.content}`,
        Math.min(
          40_000,
          maxContext -
            total
        )
      );

    contextParts.push(
      safe
    );

    total +=
      safe.length;
  }

  return {
    tree,
    files,
    context:
      contextParts.join(
        '\n\n'
      ),
    lookup,
  };
}

function applyOperationsToContent(
  content,
  operations,
  path
) {
  let out =
    String(content);

  for (
    const op of
      operations || []
  ) {
    if (
      !op ||
      op.type !==
        'replace'
    ) {
      throw new Error(
        `${path}: unsupported edit operation.`
      );
    }

    const find =
      String(
        op.find ?? ''
      );

    const replace =
      String(
        op.replace ?? ''
      );

    if (
      !find
    ) {
      throw new Error(
        `${path}: empty match string.`
      );
    }

    let index =
      -1;

    let count =
      0;

    let from =
      0;

    while (true) {
      const at =
        out.indexOf(
          find,
          from
        );

      if (
        at < 0
      ) {
        break;
      }

      count++;

      if (
        count ===
        Number(
          op.occurrence ||
            1
        )
      ) {
        index =
          at;

        break;
      }

      from =
        at + find.length;
    }

    if (
      index < 0
    ) {
      throw new Error(
        `${path}: exact match not found for repair operation.`
      );
    }

    const allCount =
      out.split(find)
        .length - 1;

    const expected =
      Number(
        op.expectedMatches ||
          1
      );

    if (
      allCount !==
      expected
    ) {
      throw new Error(
        `${path}: match is not unique; found ${allCount}, expected ${expected}.`
      );
    }

    out =
      out.slice(
        0,
        index
      ) +
      replace +
      out.slice(
        index +
          find.length
      );
  }

  return out;
}

async function materializeChanges(
  env,
  repo,
  branch,
  rawChanges,
  opts = {}
) {
  if (
    !Array.isArray(
      rawChanges
    )
  ) {
    throw new Error(
      'Agent returned no changes array.'
    );
  }

  if (
    rawChanges.length >
    cap(
      env,
      'AGENT_MAX_CHANGED_FILES',
      DEFAULT_MAX_CHANGED
    )
  ) {
    throw new Error(
      'Agent changed too many files in one operation.'
    );
  }

  const changed =
    [];

  for (
    const raw of rawChanges
  ) {
    const path =
      assertSafePath(
        raw.path,
        opts
      );

    const action =
      String(
        raw.action ||
          'update'
      );

    if (
      ![
        'create',
        'update',
        'delete',
      ].includes(
        action
      )
    ) {
      throw new Error(
        `${path}: unsupported action ${action}.`
      );
    }

    if (
      action ===
      'delete'
    ) {
      changed.push({
        path,
        action:
          'delete',
      });

      continue;
    }

    let current =
      null;

    try {
      current =
        await readFile(
          env,
          repo.owner,
          repo.repo,
          path,
          branch
        );
    } catch {
      current =
        null;
    }

    if (
      action ===
      'create'
    ) {
      if (current) {
        throw new Error(
          `${path}: create requested but file already exists.`
        );
      }

      const content =
        String(
          raw.content ??
            ''
        );

      changed.push({
        path,
        action,
        content,
      });

      continue;
    }

    if (
      !current
    ) {
      throw new Error(
        `${path}: update requested but file does not exist.`
      );
    }

    if (
      !Array.isArray(
        raw.operations
      ) ||
      !raw.operations.length
    ) {
      throw new Error(
        `${path}: update requires exact-match operations.`
      );
    }

    const content =
      applyOperationsToContent(
        current.content,
        raw.operations,
        path
      );

    changed.push({
      path,
      action,
      content,
      previousSha:
        current.sha,
    });
  }

  return changed;
}

/*
 * MASTER OVYX AGENT LOOP
 *
 * generate.js imports this function directly.
 */
export async function runAgent({
  env,
  user,
  repo,
  baseBranch,
  prompt,
  send,
  jobId,
  requestedProvider =
    'automatic',
  model,
  clientContext = {},
  allowDeletes =
    false,
  allowWorkflowChanges =
    false,
  delivery =
    'pr',
}) {
  await updateJob(
    env,
    jobId,
    {
      status:
        'planning',

      repo,

      baseBranch,

      prompt,

      userId:
        user.sub,

      requestedProvider,
    }
  );

  const emit =
    async (
      event,
      data
    ) => {
      send(
        event,
        data
      );

      try {
        await appendJobEvent(
          env,
          jobId,
          {
            event,
            ...data,
          }
        );
      } catch {}
    };

  await emit(
    'progress',
    {
      stage:
        'planning',
      message:
        'Inspecting the repository layout…',
    }
  );

  const initialTree =
    await listTree(
      env,
      repo.owner,
      repo.repo,
      baseBranch
    );

  const treeText =
    trimText(
      initialTree.files
        .slice(
          0,
          cap(
            env,
            'AGENT_MAX_TREE_FILES',
            5000
          )
        )
        .map(
          x =>
            `${x.path}\t${x.size}`
        )
        .join(
          '\n'
        ),
      cap(
        env,
        'AGENT_MAX_TREE_CONTEXT_CHARS',
        120_000
      )
    );

  const planResult =
    await callJsonModel(
      env,
      {
        provider:
          requestedProvider,

        model,

        system:
          AGENT_SYSTEM_PROMPT,

        user:
          planPrompt({
            prompt,

            tree:
              treeText,

            hints:
              sanitizeHints(
                clientContext
              ),
          }),

        maxTokens:
          3500,
      }
    );

  const plan =
    planResult.json;

  if (
    plan.needsUserInput
  ) {
    await updateJob(
      env,
      jobId,
      {
        status:
          'needs_user_input',

        plan,
      }
    );

    await emit(
      'needs_user_input',
      {
        plan,
      }
    );

    return {
      jobId,
      status:
        'needs_user_input',
      plan,
    };
  }

  await updateJob(
    env,
    jobId,
    {
      plan,

      provider:
        planResult.provider,

      model:
        planResult.model,
    }
  );

  await emit(
    'progress',
    {
      stage:
        'inspection',

      message:
        'Loading the files needed for the implementation…',

      plan,
    }
  );

  const inspected =
    await inspectRepo(
      env,
      repo,
      baseBranch,
      prompt,
      plan,
      plan.inspectPaths,
      send
    );

  const executionResult =
    await callJsonModel(
      env,
      {
        provider:
          requestedProvider,

        model,

        system:
          `${AGENT_SYSTEM_PROMPT}\n\nYou are now in EXECUTION phase. Use exact-match patch operations for existing files.`,

        user:
          executePrompt({
            prompt,

            plan,

            files:
              inspected.context,

            allowDeletes,

            allowWorkflowChanges,
          }),

        maxTokens:
          cap(
            env,
            'AGENT_EXECUTE_MAX_TOKENS',
            9000
          ),
      }
    );

  if (
    executionResult
      .json
      ?.needsUserInput
  ) {
    await updateJob(
      env,
      jobId,
      {
        status:
          'needs_user_input',

        execution:
          executionResult.json,
      }
    );

    await emit(
      'needs_user_input',
      {
        execution:
          executionResult.json,
      }
    );

    return {
      jobId,

      status:
        'needs_user_input',

      execution:
        executionResult.json,
    };
  }

  await emit(
    'progress',
    {
      stage:
        'editing',

      message:
        'Applying exact file edits and checking structural safety…',
    }
  );

  let changes =
    await materializeChanges(
      env,
      repo,
      baseBranch,
      executionResult
        .json
        .changes,
      {
        allowDeletes,

        allowWorkflowChanges,
      }
    );

  let validation =
    validateChanges(
      changes,
      {
        allowDeletes,
      }
    );

  let repairCount =
    0;

  while (
    validation.length &&
    repairCount <
      cap(
        env,
        'AGENT_MAX_REPAIRS',
        2
      )
  ) {
    repairCount++;

    await emit(
      'progress',
      {
        stage:
          'repairing',

        message:
          `Verification found ${validation.length} issue(s); repairing pass ${repairCount}…`,

        errors:
          validation,
      }
    );

    const repairFiles =
      changes
        .filter(
          x =>
            x.action !==
            'delete'
        )
        .map(
          x =>
            `FILE: ${x.path}\n\n${trimText(
              x.content,
              70_000
            )}`
        )
        .join(
          '\n\n'
        );

    const repairResult =
      await callJsonModel(
        env,
        {
          provider:
            requestedProvider,

          model,

          system:
            `${AGENT_SYSTEM_PROMPT}\n\nYou are in SELF-REPAIR phase. Repair only the reported verification failures.`,

          user:
            repairPrompt({
              prompt,

              changes:
                JSON.stringify(
                  executionResult
                    .json
                    .changes
                ),

              errors:
                validation,

              testOutput:
                '',

              files:
                repairFiles,
            }),

          maxTokens:
            cap(
              env,
              'AGENT_REPAIR_MAX_TOKENS',
              9000
            ),
        }
      );

    const repairChanges =
      await materializeChanges(
        env,
        repo,
        baseBranch,
        repairResult
          .json
          .changes,
        {
          allowDeletes,

          allowWorkflowChanges,
        }
      );

    const byPath =
      new Map(
        changes.map(
          x => [
            x.path,
            x,
          ]
        )
      );

    for (
      const item of
        repairChanges
    ) {
      byPath.set(
        item.path,
        item
      );
    }

    changes = [
      ...byPath.values(),
    ];

    validation =
      validateChanges(
        changes,
        {
          allowDeletes,
        }
      );
  }

  if (
    validation.length
  ) {
    await updateJob(
      env,
      jobId,
      {
        status:
          'failed',

        validationErrors:
          validation,
      }
    );

    await emit(
      'failed',
      {
        stage:
          'verification',

        message:
          'The Agent stopped because verification still failed.',

        errors:
          validation,
      }
    );

    throw Object.assign(
      new Error(
        `Verification failed: ${validation.join(
          ' | '
        )}`
      ),
      {
        code:
          'AGENT_VALIDATION_FAILED',
      }
    );
  }

  await emit(
    'progress',
    {
      stage:
        'verification',

      message:
        'Static structural verification passed. Creating an isolated Git branch…',

      changedFiles:
        changes.map(
          x => x.path
        ),
    }
  );

  if (
    delivery ===
    'preview'
  ) {
    await updateJob(
      env,
      jobId,
      {
        status:
          'verified',

        changes,

        verification: {
          static:
            'passed',
      },
      }
    );

    await emit(
      'complete',
      {
        jobId,

        status:
          'verified',

        changedFiles:
          changes.map(
            x => x.path
          ),

        verification: [
          'JSON structure parsed',
          'basic JS delimiter scan passed',
          'HTML tag structure scan passed',
          'secret/placeholder scan passed',
        ],
      }
    );

    return {
      jobId,

      status:
        'verified',

      changes,
    };
  }

  const branch =
    `ovyx/agent/${jobId}`;

  try {
    await createBranch(
      env,
      repo.owner,
      repo.repo,
      baseBranch,
      branch
    );
  } catch (
    err
  ) {
    if (
      err.status !==
      422
    ) {
      throw err;
    }
  }

  await emit(
    'progress',
    {
      stage:
        'git',

      message:
        'Writing the verified changes as one branch commit…',

      branch,
    }
  );

  const commit =
    await commitBatch(
      env,
      repo.owner,
      repo.repo,
      branch,
      changes,

      `OVYX Agent: ${prompt.slice(
        0,
        70
      )}`
    );

  const pr =
    await createPullRequest(
      env,
      repo.owner,
      repo.repo,
      {
        title:
          `OVYX Agent — ${prompt.slice(
            0,
            72
          )}`,

        body: [
          '## OVYX Agent Mode',
          '',

          `Request: ${prompt}`,

          '',

          '### Verification',
          '- Static structural checks: passed',
          '- JSON parsing: passed for changed JSON files',
          '- Repository secret scan: passed',
          '- Full build/test CI: triggered by branch push',
          '',

          'The branch remains a draft until repository CI verification succeeds.',
        ].join('\n'),

        head:
          branch,

        base:
          baseBranch,

        draft:
          true,
      }
    );

  await updateJob(
    env,
    jobId,
    {
      status:
        'ci_pending',

      branch,

      commitSha:
        commit.commitSha,

      prNumber:
        pr.number,

      prUrl:
        pr.url,

      changes:
        changes.map(
          x => ({
            path:
              x.path,

            action:
              x.action,
          })
        ),

      verification: {
        static:
          'passed',

        ci:
          'pending',
      },
    }
  );

  await emit(
    'complete',
    {
      jobId,

      status:
        'ci_pending',

      branch,

      commitSha:
        commit.commitSha,

      pullRequest:
        pr,

      changedFiles:
        changes.map(
          x => x.path
        ),

      verification: [
        'Static preflight passed',
        'GitHub CI pending',
        'Draft PR created; main branch untouched',
      ],
    }
  );

  return {
    jobId,

    status:
      'ci_pending',

    branch,

    commitSha:
      commit.commitSha,

    pullRequest:
      pr,

    changes,
  };
}

export async function repairBranchFromCI({
  env,
  job,
  testOutput,
  send,
}) {
  const emit =
    async (
      event,
      data
    ) => {
      send?.(
        event,
        data
      );

      try {
        await appendJobEvent(
          env,
          job.id,
          {
            event,
            ...data,
          }
        );
      } catch {}
    };

  const attempt =
    Number(
      job.repairCount ||
        0
    ) + 1;

  const maxRepairs =
    cap(
      env,
      'AGENT_MAX_REPAIRS',
      2
    );

  if (
    attempt >
    maxRepairs
  ) {
    await updateJob(
      env,
      job.id,
      {
        status:
          'failed',

        ci: {
          conclusion:
            'failure',

          output:
            testOutput
              ?.slice?.(
                -30_000
              ) || '',
        },

        repairCount:
          attempt - 1,
      }
    );

    return {
      repaired:
        false,

      reason:
        'repair_limit_reached',
    };
  }

  await updateJob(
    env,
    job.id,
    {
      status:
        'repairing',

      repairCount:
        attempt,
    }
  );

  await emit(
    'progress',
    {
      stage:
        'ci_repair',

      message:
        `CI failed; OVYX is preparing repair pass ${attempt}…`,
    }
  );

  const files =
    {};

  for (
    const entry of (
      job.changes ||
      []
    ).slice(
      0,
      cap(
        env,
        'AGENT_MAX_CHANGED_FILES',
        DEFAULT_MAX_CHANGED
      )
    )
  ) {
    if (
      entry.action ===
      'delete'
    ) {
      continue;
    }

    try {
      const file =
        await readFile(
          env,
          job.repo.owner,
          job.repo.repo,
          entry.path,
          job.branch
        );

      files[
        entry.path
      ] =
        file.content;
    } catch {}
  }

  const repairResult =
    await callJsonModel(
      env,
      {
        provider:
          job.requestedProvider ||
          'automatic',

        model:
          job.model,

        system:
          `${AGENT_SYSTEM_PROMPT}\n\nYou are responding to real CI failure output. Repair only the reported defect and preserve the rest of the branch.`,

        user:
          repairPrompt({
            prompt:
              job.prompt,

            changes:
              JSON.stringify(
                job.changes ||
                  []
              ),

            errors:
              [],

            testOutput:
              trimText(
                String(
                  testOutput ||
                    ''
                ),
                45_000
              ),

            files:
              Object.entries(
                files
              )
                .map(
                  ([p, c]) =>
                    `FILE: ${p}\n\n${trimText(
                      c,
                      80_000
                    )}`
                )
                .join(
                  '\n\n'
                ),
          }),

        maxTokens:
          cap(
            env,
            'AGENT_REPAIR_MAX_TOKENS',
            9000
          ),
      }
    );

  const repairs =
    await materializeChanges(
      env,
      job.repo,
      job.branch,
      repairResult
        .json
        .changes,
      {
        allowDeletes:
          false,

        allowWorkflowChanges:
          false,
      }
    );

  const validation =
    validateChanges(
      repairs,
      {
        allowDeletes:
          false,
      }
    );

  if (
    validation.length
  ) {
    await updateJob(
      env,
      job.id,
      {
        status:
          'failed',

        validationErrors:
          validation,
      }
    );

    await emit(
      'failed',
      {
        stage:
          'ci_repair',

        message:
          'Repair was generated but failed structural verification.',

        errors:
          validation,
      }
    );

    return {
      repaired:
        false,

      reason:
        'repair_validation_failed',

      errors:
        validation,
    };
  }

  await emit(
    'progress',
    {
      stage:
        'ci_repair',

      message:
        'Repair passed static checks; committing the repair to the agent branch…',

      changedFiles:
        repairs.map(
          x => x.path
        ),
    }
  );

  const commit =
    await commitBatch(
      env,
      job.repo.owner,
      job.repo.repo,
      job.branch,
      repairs,

      `OVYX Agent repair ${attempt}: ${job.prompt.slice(
        0,
        60
      )}`
    );

  const mergedChanges = [
    ...(job.changes ||
      []
    ).filter(
      x =>
        !repairs.some(
          r =>
            r.path ===
            x.path
        )
    ),

    ...repairs.map(
      x => ({
        path:
          x.path,

        action:
          x.action,
      })
    ),
  ];

  await updateJob(
    env,
    job.id,
    {
      status:
        'ci_pending',

      commitSha:
        commit.commitSha,

      changes:
        mergedChanges,

      lastRepair: {
        attempt,

        commitSha:
          commit.commitSha,
      },
    }
  );

  await emit(
    'progress',
    {
      stage:
        'ci_repair',

      message:
        'Repair committed. Waiting for the repository verification workflow to run again.',

      commitSha:
        commit.commitSha,

      attempt,
    }
  );

  return {
    repaired:
      true,

    commitSha:
      commit.commitSha,

    attempt,
  };
}
