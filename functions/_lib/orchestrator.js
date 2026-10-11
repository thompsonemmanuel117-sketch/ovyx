import {
  AGENT_SYSTEM_PROMPT,
  WEB_STUDIO_EXCELLENCE,
  planPrompt,
  executePrompt,
  polishPrompt,
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
  buildExperienceBrief,
  isWebStudioPrompt,
  scoreWebStudioChanges,
} from './experience.js';

import {
  appendJobEvent,
  updateJob,
} from './jobs.js';

import {
  normalizeSiteMap,
  createSiteBuildBatches,
  mergeStagedChanges,
  buildSiteBatchContext,
  selectSitePolishChanges,
} from './multi-page.js';

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

function explicitlyRequestsMultiplePages(prompt) {
  const text = String(prompt || '').toLowerCase();
  if (/\b(?:multi[-\s]?page|multiple\s+pages?|several\s+pages?|many\s+pages?|more\s+than\s+one\s+page|\d+\s+pages?|(?:two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|one\s+hundred)\s+pages?)\b/i.test(text)) {
    return true;
  }
  const namedPages = text.match(/\b(?:home(?:page)?|about|services?|pricing|contact|products?|blog|dashboard|faq|privacy|terms)\s+pages?\b/gi) || [];
  return namedPages.length >= 2 || /\bpages\s*[:\-]/i.test(text);
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

function sanitizeBrandProfile(
  profile
) {
  if (
    !profile ||
    typeof profile !==
      'object'
  ) {
    return undefined;
  }

  const colors =
    profile.colors &&
    typeof profile.colors ===
      'object'
      ? Object.fromEntries(
          Object.entries(
            profile.colors
          )
            .filter(
              ([key, value]) =>
                /^[A-Za-z0-9_-]{1,40}$/.test(
                  key
                ) &&
                /^#[0-9a-f]{6}$/i.test(
                  String(value || '')
                )
            )
            .slice(0, 12)
            .map(
              ([key, value]) => [
                key,
                String(
                  value
                ).toUpperCase(),
              ]
            )
        )
      : {};

  const layoutRules =
    Array.isArray(
      profile.layoutRules
    )
      ? profile.layoutRules
          .map(
            value =>
              String(
                value || ''
              ).trim()
          )
          .filter(Boolean)
          .slice(0, 50)
      : [];

  return {
    version:
      Number(
        profile.version
      ) || 1,
    hasLogo:
      Boolean(
        profile.logoDataUrl
      ),
    colors,
    layoutRules,
  };
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

    brandProfile:
      sanitizeBrandProfile(
        hints.brandProfile
      ),
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
  if (!Array.isArray(rawChanges)) {
    throw new Error('Agent returned no changes array.');
  }

  const configuredLimit = cap(
    env,
    'AGENT_MAX_CHANGED_FILES',
    DEFAULT_MAX_CHANGED
  );
  const requestedLimit = Number(opts.maxChanges);
  const maxChanges = Number.isFinite(requestedLimit) && requestedLimit > 0
    ? Math.floor(requestedLimit)
    : configuredLimit;

  if (rawChanges.length > maxChanges) {
    throw new Error(
      `Agent changed too many files in one operation (${rawChanges.length}; maximum ${maxChanges}).`
    );
  }

  const staged = new Map(
    (Array.isArray(opts.existingChanges) ? opts.existingChanges : [])
      .map(item => [item.path, item])
  );
  const allowedPaths = Array.isArray(opts.allowedPaths)
    ? new Set(opts.allowedPaths)
    : null;
  const changed = [];

  for (const raw of rawChanges) {
    const path = assertSafePath(raw.path, {
      allowDeletes: opts.allowDeletes,
      allowWorkflowChanges: opts.allowWorkflowChanges,
    });

    if (allowedPaths && !allowedPaths.has(path)) {
      throw new Error(
        `${path}: path is outside the approved multi-page batch allowlist.`
      );
    }

    const action = String(raw.action || 'update');
    if (!['create', 'update', 'delete'].includes(action)) {
      throw new Error(`${path}: unsupported action ${action}.`);
    }

    const previous = staged.get(path);

    if (action === 'delete') {
      if (previous?.action === 'create') {
        changed.push({
          path,
          action: 'delete',
          removeStagedCreate: true,
        });
      } else {
        changed.push({
          path,
          action: 'delete',
          previousSha: previous?.previousSha,
        });
      }
      continue;
    }

    let current = previous && previous.action !== 'delete'
      ? {
          content: previous.content,
          sha: previous.previousSha,
        }
      : null;

    if (!current) {
      try {
        current = await readFile(
          env,
          repo.owner,
          repo.repo,
          path,
          branch
        );
      } catch {
        current = null;
      }
    }

    if (action === 'create') {
      if (current) {
        throw new Error(
          `${path}: create requested but file already exists.`
        );
      }

      changed.push({
        path,
        action: 'create',
        content: String(raw.content ?? ''),
      });
      continue;
    }

    if (!current) {
      throw new Error(
        `${path}: update requested but file does not exist.`
      );
    }

    if (!Array.isArray(raw.operations) || !raw.operations.length) {
      throw new Error(
        `${path}: update requires exact-match operations.`
      );
    }

    const content = applyOperationsToContent(
      current.content,
      raw.operations,
      path
    );

    changed.push({
      path,
      action: previous?.action === 'create' ? 'create' : 'update',
      content,
      previousSha: previous?.previousSha || current.sha,
    });
  }

  return changed;
}

function applyPolishChanges(baseChanges, rawChanges, maxFiles) {
  if (!Array.isArray(rawChanges)) {
    throw new Error('Web Studio polish returned no changes array.');
  }

  if (rawChanges.length > maxFiles) {
    throw new Error('Web Studio polish changed too many files.');
  }

  const byPath = new Map(
    baseChanges.map(item => [item.path, item])
  );

  for (const raw of rawChanges) {
    const path = assertSafePath(raw.path, { allowDeletes: false });
    if (String(raw.action || 'update') !== 'update') {
      throw new Error(path + ': polish may only update existing files.');
    }

    const current = byPath.get(path);
    if (!current || !current.content) {
      throw new Error(path + ': polish target was not part of the current build.');
    }

    if (!Array.isArray(raw.operations) || !raw.operations.length) {
      throw new Error(path + ': polish update requires exact-match operations.');
    }

    const content = applyOperationsToContent(
      current.content,
      raw.operations,
      path
    );

    byPath.set(path, {
      ...current,
      action: 'update',
      content
    });
  }

  return [...byPath.values()];
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
  onUsage = () => {},
  clientContext = {},
  allowDeletes =
    false,
  allowWorkflowChanges =
    false,
  delivery =
    'pr',
}) {
  const webStudio = isWebStudioPrompt(prompt, clientContext?.mode || '');
  const experienceBrief = webStudio
    ? buildExperienceBrief(prompt, clientContext)
    : null;

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

  let planResult =
    await callJsonModel(
      env,
      {
        provider:
          requestedProvider,

        model,

        onUsage,

        taskPrompt: prompt,

        user:
          planPrompt({
            prompt,

            tree:
              treeText,

            hints:
              sanitizeHints(
                clientContext
              ),

            experience:
              experienceBrief,
          }),

        authUser:
          user,

        system:
          webStudio
            ? AGENT_SYSTEM_PROMPT + '\n\n' + WEB_STUDIO_EXCELLENCE
            : AGENT_SYSTEM_PROMPT,

        maxTokens:
          5000,
      }
    );

  let plan =
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

  const multiPageRequested = webStudio && explicitlyRequestsMultiplePages(prompt);
  const pageLimit = cap(env, 'AGENT_MAX_SITE_PAGES', 250);
  let normalizedSiteMap = webStudio
    ? normalizeSiteMap(plan?.siteMap, pageLimit)
    : { siteMap: null, overflow: 0 };
  let siteMap = normalizedSiteMap.siteMap;

  if (normalizedSiteMap.overflow > 0) {
    throw Object.assign(
      new Error(`The planned site contains more than ${pageLimit} pages. Increase AGENT_MAX_SITE_PAGES to allow a larger build; no pages were silently dropped.`),
      { code: 'SITE_MAP_PAGE_LIMIT' }
    );
  }

  if (multiPageRequested && (!siteMap || siteMap.pages.length < 2)) {
    await emit('progress', {
      stage: 'planning',
      message: 'Rechecking the requested multi-page sitemap before writing any files…',
    });

    planResult = await callJsonModel(
      env,
      {
        provider: requestedProvider,
        model,
        onUsage,
        taskPrompt: prompt,
        user: planPrompt({
          prompt: prompt + '\n\nREQUIRED: This task explicitly asks for multiple distinct website pages. Return a complete siteMap with every requested page as its own route and include all shared files required to build them.',
          tree: treeText,
          hints: sanitizeHints(clientContext),
          experience: experienceBrief,
          requireMultiPage: true,
        }),
        authUser: user,
        system: AGENT_SYSTEM_PROMPT + (webStudio ? '\n\n' + WEB_STUDIO_EXCELLENCE : ''),
        maxTokens: 7000,
      }
    );
    plan = planResult.json;
    normalizedSiteMap = normalizeSiteMap(plan?.siteMap, pageLimit);
    siteMap = normalizedSiteMap.siteMap;

    if (normalizedSiteMap.overflow > 0) {
      throw Object.assign(
        new Error(`The planned site contains more than ${pageLimit} pages. Increase AGENT_MAX_SITE_PAGES to allow a larger build; no pages were silently dropped.`),
        { code: 'SITE_MAP_PAGE_LIMIT' }
      );
    }
    if (!siteMap || siteMap.pages.length < 2) {
      throw Object.assign(
        new Error('OVYX could not create a complete multi-page route plan for this request. No website files were written; try submitting the full list of requested pages in your prompt.'),
        { code: 'SITE_MAP_PLAN_INCOMPLETE' }
      );
    }
  }

  if (webStudio && plan && typeof plan === 'object') {
    plan.experienceBrief = experienceBrief;
    if (siteMap) plan.siteMap = siteMap;
  }

  const siteBuild = webStudio && siteMap && siteMap.pages.length > 1;

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

  let executionResult;
  let changes = [];
  const maxChangedFiles = Math.max(
    2,
    cap(
      env,
      'AGENT_MAX_CHANGED_FILES',
      DEFAULT_MAX_CHANGED
    )
  );

  if (siteBuild) {
    const batches = createSiteBuildBatches(siteMap, maxChangedFiles);
    if (!batches.length) {
      throw Object.assign(
        new Error('The multi-page sitemap did not produce any executable build batches.'),
        { code: 'SITE_MAP_BATCHES_EMPTY' }
      );
    }

    await updateJob(env, jobId, {
      status: 'building',
      siteMap,
      buildProgress: {
        mode: 'multi_page',
        totalPages: siteMap.pages.length,
        completedBatches: 0,
        totalBatches: batches.length,
      },
    });

    for (const batch of batches) {
      await emit('progress', {
        stage: 'building_pages',
        message: batch.kind === 'foundation'
          ? `Building the shared website foundation (batch ${batch.index} of ${batch.total})…`
          : `Building pages ${Math.min(siteMap.pages.length, 1 + (batch.index - 1) * Math.max(1, maxChangedFiles - 3))} onward (batch ${batch.index} of ${batch.total})…`,
        batch: batch.index,
        totalBatches: batch.total,
        totalPages: siteMap.pages.length,
        changedFilesSoFar: changes.length,
        targetFiles: batch.targetPaths,
      });

      const batchContext = buildSiteBatchContext({
        baseContext: inspected.context,
        stagedChanges: changes,
        siteMap,
        batch,
        maxChars: cap(env, 'AGENT_MAX_BATCH_CONTEXT_CHARS', 160_000),
      });

      executionResult = await callJsonModel(
        env,
        {
          provider: requestedProvider,
          model,
          onUsage,
          taskPrompt: prompt,
          system:
            AGENT_SYSTEM_PROMPT +
            '\n\n' +
            WEB_STUDIO_EXCELLENCE +
            '\n\nYou are in a controlled multi-page implementation batch. Output only the required structured JSON.',
          user: executePrompt({
            prompt,
            plan,
            files: batchContext,
            hints: sanitizeHints(clientContext),
            experience: experienceBrief,
            allowDeletes,
            allowWorkflowChanges,
            buildBatch: {
              index: batch.index,
              total: batch.total,
              kind: batch.kind,
              targetFiles: batch.targetFiles,
              targetPaths: batch.targetPaths,
              allowedPaths: batch.allowedPaths,
              alreadyGeneratedPaths: changes.map(item => item.path),
              maxChangedFiles: batch.maxChangedFiles,
              maxAdditionalChanges: batch.maxAdditionalChanges,
            },
          }),
          authUser: user,
          maxTokens: cap(
            env,
            'AGENT_EXECUTE_MAX_TOKENS',
            12_000
          ),
        }
      );

      if (executionResult.json?.needsUserInput) {
        await updateJob(env, jobId, {
          status: 'needs_user_input',
          plan,
          siteMap,
          buildProgress: {
            mode: 'multi_page',
            totalPages: siteMap.pages.length,
            completedBatches: batch.index - 1,
            totalBatches: batches.length,
          },
          stagedFilePaths: changes.map(item => item.path),
          execution: executionResult.json,
        });
        await emit('needs_user_input', {
          execution: executionResult.json,
          completedBatches: batch.index - 1,
          totalBatches: batches.length,
          stagedFilePaths: changes.map(item => item.path),
        });
        return {
          jobId,
          status: 'needs_user_input',
          execution: executionResult.json,
          siteMap,
        };
      }

      const batchChanges = await materializeChanges(
        env,
        repo,
        baseBranch,
        executionResult.json?.changes,
        {
          allowDeletes,
          allowWorkflowChanges,
          maxChanges: maxChangedFiles,
          existingChanges: changes,
          allowedPaths: batch.allowedPaths,
        }
      );

      changes = mergeStagedChanges(changes, batchChanges);

      const missingPages = batch.targetPages.filter(page =>
        !inspected.lookup.has(page.path) &&
        !changes.some(item => item.path === page.path && item.action !== 'delete')
      );
      if (missingPages.length) {
        throw Object.assign(
          new Error(
            `Multi-page batch ${batch.index} did not create the requested page file(s): ${missingPages.map(page => page.path).join(', ')}. OVYX stopped instead of silently skipping pages.`
          ),
          { code: 'SITE_MAP_BATCH_INCOMPLETE' }
        );
      }

      await updateJob(env, jobId, {
        status: 'building',
        siteMap,
        buildProgress: {
          mode: 'multi_page',
          totalPages: siteMap.pages.length,
          completedBatches: batch.index,
          totalBatches: batches.length,
          changedFiles: changes.length,
        },
        stagedFilePaths: changes.map(item => item.path),
      });
      await emit('progress', {
        stage: 'building_pages',
        message: `Completed batch ${batch.index} of ${batch.total}; continuing with the rest of the website…`,
        batch: batch.index,
        totalBatches: batch.total,
        totalPages: siteMap.pages.length,
        changedFilesSoFar: changes.length,
        completedPagePaths: siteMap.pages
          .filter(page => changes.some(item => item.path === page.path && item.action !== 'delete') || inspected.lookup.has(page.path))
          .map(page => page.path),
      });
    }

    executionResult = {
      ...executionResult,
      json: {
        ...(executionResult?.json || {}),
        changes,
        summary: executionResult?.json?.summary || plan.summary || 'Multi-page website generated in verified batches.',
      },
    };
  } else {
    executionResult = await callJsonModel(
      env,
      {
        provider: requestedProvider,
        model,
        onUsage,
        taskPrompt: prompt,
        system:
          (webStudio
            ? AGENT_SYSTEM_PROMPT + '\n\n' + WEB_STUDIO_EXCELLENCE
            : AGENT_SYSTEM_PROMPT) +
          '\n\nYou are now in EXECUTION phase. Use exact-match patch operations for existing files.',
        user: executePrompt({
          prompt,
          plan,
          files: inspected.context,
          hints: sanitizeHints(clientContext),
          experience: experienceBrief,
          allowDeletes,
          allowWorkflowChanges,
        }),
        authUser: user,
        maxTokens: cap(
          env,
          'AGENT_EXECUTE_MAX_TOKENS',
          12_000
        ),
      }
    );

    if (executionResult.json?.needsUserInput) {
      await updateJob(
        env,
        jobId,
        {
          status: 'needs_user_input',
          execution: executionResult.json,
        }
      );

      await emit('needs_user_input', {
        execution: executionResult.json,
      });

      return {
        jobId,
        status: 'needs_user_input',
        execution: executionResult.json,
      };
    }

    await emit('progress', {
      stage: 'editing',
      message: 'Applying exact file edits and checking structural safety…',
    });

    changes = await materializeChanges(
      env,
      repo,
      baseBranch,
      executionResult.json.changes,
      {
        allowDeletes,
        allowWorkflowChanges,
      }
    );
  }

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

    const validationPaths = new Set(
      validation
        .map(error => String(error).split(':')[0])
        .filter(Boolean)
    );
    const repairCandidates = siteBuild
      ? [
          ...changes.filter(item => validationPaths.has(item.path)),
          ...changes.filter(item => !validationPaths.has(item.path)).slice(0, maxChangedFiles),
        ]
      : changes;
    const repairTargets = repairCandidates
      .filter(item => item.action !== 'delete')
      .filter((item, index, all) => all.findIndex(candidate => candidate.path === item.path) === index)
      .slice(0, maxChangedFiles);

    const repairFiles = repairTargets
      .map(item => `FILE: ${item.path}\n\n${trimText(item.content, 18_000)}`)
      .join('\n\n');

    const repairResult =
      await callJsonModel(
        env,
        {
          provider:
            requestedProvider,

          model,

          onUsage,

          taskPrompt: prompt,

          system:
            `${AGENT_SYSTEM_PROMPT}\n\nYou are in SELF-REPAIR phase. Repair only the reported verification failures.`,

          user:
            repairPrompt({
              prompt,

              changes:
                JSON.stringify(
                  changes.map(item => ({ path: item.path, action: item.action }))
                ),

              errors:
                validation,

              testOutput:
                '',

              files:
                repairFiles,

              hints:
                sanitizeHints(
                  clientContext
                ),
            }),

          authUser:
            user,

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
          existingChanges: changes,
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
    webStudio &&
    !validation.length &&
    cap(env, 'AGENT_MAX_POLISH_PASSES', 1) > 0
  ) {
    const qualityBefore = scoreWebStudioChanges(changes);

    await emit(
      'progress',
      {
        stage: 'polishing',
        message:
          'Applying a final design, interaction and responsive-quality pass…',
        qualityScore: qualityBefore
      }
    );

    for (
      let polishPass = 1;
      polishPass <= cap(env, 'AGENT_MAX_POLISH_PASSES', 1);
      polishPass++
    ) {
      try {
        const polishSourceChanges = siteBuild
          ? selectSitePolishChanges(
              changes,
              siteMap,
              cap(env, 'AGENT_MAX_POLISH_FILES', 6)
            )
          : changes;
        const polishFiles = polishSourceChanges
          .filter(item => item.action !== 'delete')
          .map(item =>
            'FILE: ' + item.path + '\n\n' +
            trimText(item.content, 35_000)
          )
          .join('\n\n');

        const polishResult = await callJsonModel(
          env,
          {
            provider: requestedProvider,
            model,
            onUsage,

          taskPrompt: prompt,
            authUser: user,
            system:
              AGENT_SYSTEM_PROMPT +
              '\n\n' +
              WEB_STUDIO_EXCELLENCE +
              '\n\nYou are in the FINAL POLISH phase. Preserve working functionality and improve only the experience quality.',
            user:
              polishPrompt({
                prompt,
                plan,
                experience: experienceBrief,
                files: polishFiles,
                currentScore: qualityBefore,
                hints: sanitizeHints(clientContext)
              }),
            maxTokens: cap(
              env,
              'AGENT_POLISH_MAX_TOKENS',
              9000
            )
          }
        );

        const candidate = applyPolishChanges(
          changes,
          polishResult.json?.changes,
          cap(env, 'AGENT_MAX_CHANGED_FILES', DEFAULT_MAX_CHANGED)
        );

        const candidateValidation = validateChanges(
          candidate,
          { allowDeletes: false }
        );

        const qualityAfter = scoreWebStudioChanges(candidate);

        if (
          !candidateValidation.length &&
          qualityAfter >= qualityBefore
        ) {
          changes = candidate;
          validation = candidateValidation;

          await emit(
            'progress',
            {
              stage: 'polishing',
              message:
                'Final polish accepted after structural verification.',
              qualityScore: qualityAfter,
              qualityDelta: qualityAfter - qualityBefore,
              pass: polishPass
            }
          );
        } else {
          await emit(
            'progress',
            {
              stage: 'polishing',
              message:
                'Final polish was rejected because it did not improve the verified result.',
              qualityScore: qualityBefore,
              candidateQualityScore: qualityAfter,
              pass: polishPass
            }
          );
        }
      } catch (polishError) {
        await emit(
          'progress',
          {
            stage: 'polishing',
            message:
              'The optional final polish pass was skipped; the verified build is unchanged.',
            error:
              polishError?.message || String(polishError)
          }
        );
      }
    }
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

        taskPrompt: job.prompt || '',

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
