import { normalizeSiteMap, createSiteBuildBatches, mergeStagedChanges, buildSiteBatchContext, selectSitePolishChanges } from './multi-page.js';
import { validateChanges } from './validator.js';
import { buildPromptContract, verifyPromptContractOutput } from './prompt-contract.js';
function cap(env, key, fallback) { const n = Number(env && env[key]); return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback; }
function singlePage(prompt) { return /\b(?:one[-\s]?page|single[-\s]?page|landing[-\s]?page\s+only|homepage\s+only)\b/i.test(String(prompt || '')); }
function manyPages(prompt) { return /\b(?:multi[-\s]?page|multiple\s+pages?|several\s+pages?|many\s+pages?|more\s+than\s+one\s+page|\d+\s+pages?|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen|twenty|thirty|forty|fifty)\b/i.test(String(prompt || '').toLowerCase()); }
function parseJSON(text) {
  const raw = String(text || '').trim().replace(/^\x60{3}(?:json)?/i, '').replace(/\x60{3}$/i, '').trim();
  try { return JSON.parse(raw); } catch {}
  const start = raw.indexOf('{'), end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) { try { return JSON.parse(raw.slice(start, end + 1)); } catch {} }
  return null;
}
function slug(value) { return String(value || '').trim().replace(/\.html?$/i, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'Page'; }
function cleanFiles(value) {
  const out = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  for (const [rawPath, rawFile] of Object.entries(value)) {
    const path = String(rawPath || '').trim().replace(/^\/+/, '');
    if (!path || path.length > 400 || path.includes('..') || path.includes('\\') ||
      /^(?:node_modules|dist|build|coverage|\.git|\.env)(?:\/|$)/i.test(path)) continue;
    let content = typeof rawFile === 'string' ? rawFile : null;
    if (content === null && rawFile && typeof rawFile === 'object') content = rawFile.content || rawFile.text || rawFile.source || rawFile.code;
    if (typeof content === 'string' && /\.(?:html?|css|js|mjs|jsx|tsx|ts|json|svg|txt|md|astro)$/i.test(path)) out[path] = content.slice(0, 120000);
  }
  return out;
}
function outputFiles(value) {
  const files = value && (value.files || value.fileEdits || (value.patch && value.patch.files));
  const out = {};
  if (Array.isArray(files)) {
    files.forEach(item => {
      const path = String((item && (item.path || item.file)) || '').trim().replace(/^\/+/, '');
      const content = item && (item.content || item.text || item.source || item.code);
      if (path && typeof content === 'string') out[path] = content;
    });
  } else if (files && typeof files === 'object') {
    Object.entries(files).forEach(([path, item]) => {
      const content = typeof item === 'string' ? item : item && (item.content || item.text || item.source || item.code);
      if (path && typeof content === 'string') out[String(path).replace(/^\/+/, '')] = content;
    });
  }
  if (!Object.keys(out).length && value && typeof value.html === 'string') out['src/pages/Home.html'] = value.html;
  if (!Object.keys(out).length && value && typeof value.code === 'string') out['src/pages/Home.html'] = value.code;
  return out;
}
function makeSiteMap(raw, limit) {
  if (!raw || !Array.isArray(raw.pages)) return { siteMap: null, overflow: 0 };
  const overflow = Math.max(0, raw.pages.length - limit), pages = [], seen = new Set();
  for (const entry of raw.pages.slice(0, limit)) {
    const title = String((entry && (entry.title || entry.name)) || '').trim().slice(0, 100);
    if (!title) continue;
    const path = 'src/pages/' + slug(title) + '.html';
    if (seen.has(path.toLowerCase())) continue;
    seen.add(path.toLowerCase());
    pages.push({ title, path, url: /^home(?:page)?$/i.test(title) ? '/' : '/' + slug(title).toLowerCase() + '/', goal: String((entry && (entry.goal || entry.purpose)) || '').slice(0, 300) });
  }
  if (!pages.some(page => /^home(?:page)?$/i.test(page.title))) pages.unshift({ title: 'Home', path: 'src/pages/Home.html', url: '/', goal: 'Main website landing page.' });
  else {
    const home = pages.findIndex(page => /^home(?:page)?$/i.test(page.title));
    if (home > 0) pages.unshift(pages.splice(home, 1)[0]);
    pages[0].url = '/';
  }
  const sharedFiles = [
    { path: 'src/styles.css', purpose: 'Shared responsive styles and reusable components.' },
    { path: 'src/main.js', purpose: 'Shared navigation and interactive behavior.' },
  ];
  const result = normalizeSiteMap({ architecture: raw.architecture || 'Web Studio multi-page site', pages, sharedFiles, foundationPaths: [pages[0].path, 'src/styles.css', 'src/main.js'] }, limit);
  if (!result.siteMap) return { siteMap: null, overflow };
  result.siteMap.pages = pages;
  result.siteMap.sharedFiles = sharedFiles;
  result.siteMap.foundationPaths = [pages[0].path, 'src/styles.css', 'src/main.js'];
  return { siteMap: result.siteMap, overflow: Math.max(overflow, result.overflow) };
}

function usageAdd(total, rawUsage) {
  const keys = {
    prompt_tokens: ['prompt_tokens', 'promptTokenCount', 'input_tokens', 'inputTokenCount', 'inputTokens'],
    completion_tokens: ['completion_tokens', 'candidatesTokenCount', 'output_tokens', 'outputTokenCount', 'outputTokens'],
    total_tokens: ['total_tokens', 'totalTokenCount', 'totalTokens'],
  };
  const next = { ...total };
  let found = false;
  for (const [target, aliases] of Object.entries(keys)) {
    for (const key of aliases) {
      const n = Number(rawUsage && rawUsage[key]);
      if (Number.isFinite(n) && n >= 0) {
        next[target] = Number(next[target] || 0) + Math.round(n);
        found = true;
        break;
      }
    }
  }
  return { total: next, found };
}

function accountingError(error, usage, hasUsage, inputs, outputs) {
  const result = error instanceof Error ? error : new Error(String(error || 'Multi-page generation failed.'));
  result.partialUsage = hasUsage ? {
    prompt_tokens: usage.prompt_tokens || 0,
    completion_tokens: usage.completion_tokens || 0,
    total_tokens: usage.total_tokens === undefined ? ((usage.prompt_tokens || 0) + (usage.completion_tokens || 0)) : usage.total_tokens,
  } : null;
  result.quotaInputText = inputs.join('\n\n');
  result.quotaOutputText = outputs.join('\n\n');
  return result;
}

function planPrompt(prompt, project, paths, requireMulti, limit, extraContext, promptContract) {
  return [
    'OVYX WEB STUDIO WEBSITE ARCHITECTURE PLANNING PHASE.',
    'Return strict JSON only: {"summary":"...","siteMap":{"architecture":"...","pages":[{"title":"Home","goal":"..."}]}}.',
    'Plan independently selectable page documents, not only sections on one homepage. For a full business/product/portfolio website, default to 3–8 useful distinct pages. An explicit one-page/landing-page-only request stays one page.',
    'Include every page explicitly requested by the user. Add supporting pages only when they materially improve the same goal. Include Home and unique page titles.',
    'Each page will be a full HTML document at src/pages/<Page-Name>.html. Use src/pages/Home.html for Home. Shared CSS is src/styles.css and shared interactions are src/main.js.',
    'Do not generate code in this phase. Do not invent business facts. Do not merge requested pages.',
    'Configured page ceiling: ' + limit + '. If the brief explicitly requires more, say so in summary rather than silently omitting pages.',
    'USER BRIEF:\n' + String(prompt || ''),
    'PROMPT REQUIREMENT CONTRACT JSON:\n' + JSON.stringify(promptContract || {}),
    'CURRENT PROJECT:\n' + JSON.stringify(project || {}),
    'EXISTING PROJECT FILE PATHS:\n' + paths.join('\n').slice(0, 18000),
    'BRAND / CLIENT CONTEXT:\n' + String(extraContext || '').slice(0, 6000),
    'PAGE REQUIREMENT:\n' + (requireMulti ? 'The user explicitly requested multiple pages. Plan at least two distinct pages.' : 'Respect explicit one-page wording; otherwise choose a proportionate complete site architecture.'),
  ].join('\n\n');
}

function makeBatchPrompt(prompt, plan, siteMap, batch, stagedChanges, existingFiles, extraContext, promptContract) {
  const context = buildSiteBatchContext({
    baseContext: 'ORIGINAL BRIEF:\n' + String(prompt || '') + '\n\nAPPROVED SITE MAP:\n' + JSON.stringify(plan) + '\n\nBRAND / CLIENT CONTEXT:\n' + String(extraContext || '').slice(0, 6000),
    stagedChanges,
    siteMap,
    batch,
    repositoryFiles: existingFiles,
    maxChars: 140000,
  });
  return [
    'OVYX WEB STUDIO MULTI-PAGE IMPLEMENTATION BATCH.',
    'Return strict JSON only, without Markdown fences.',
    'Output shape: {"summary":"...","files":{"src/pages/Home.html":"complete HTML document","src/styles.css":"complete stylesheet","src/main.js":"complete JavaScript"}}.',
    'Every value in files must be complete final UTF-8 file content, not a diff, filename list or summary.',
    'Batch ' + batch.index + ' of ' + batch.total + '; kind: ' + batch.kind + '; maximum distinct output files: ' + batch.maxChangedFiles + '.',
    'PROMPT REQUIREMENT CONTRACT JSON:\n' + JSON.stringify(promptContract || {}),
    'REQUIRED TARGET FILES JSON:\n' + JSON.stringify(batch.targetFiles),
    'REQUIRED TARGET PATHS JSON:\n' + JSON.stringify(batch.targetPaths),
    'ALLOWED OUTPUT PATHS JSON:\n' + JSON.stringify(batch.allowedPaths),
    'ALREADY GENERATED PATHS JSON:\n' + JSON.stringify(stagedChanges.map(item => item.path)),
    'Create every required target. Never skip a page or merge separate routes into one document.',
    'Use the complete route manifest to keep navigation and links consistent. Each page needs unique content, a title and description, responsive layout, accessible controls and working interactions.',
    'Preserve the shared design language. Reuse staged CSS/JS; update shared files only when truly required.',
    'Do not invent facts or output placeholder copy, dead controls, secrets or files outside the allowlist.',
    'Do not output more than ' + batch.maxChangedFiles + ' files.',
    '',
    context,
  ].join('\n\n');
}

function makePolishPrompt(prompt, plan, siteMap, targets, extraContext, promptContract) {
  const currentFiles = Object.fromEntries(targets.map(item => [item.path, item.content]));
  return [
    'OVYX WEB STUDIO BOUNDED WEBSITE POLISH PHASE.',
    'Perform one targeted quality-improvement pass on the already generated multi-page website. Preserve its established visual direction and all working behavior.',
    'Return strict JSON only, using this shape: {"summary":"...","files":{"existing/allowed/path":"complete final file content"}}.',
    'Return complete final files only for the provided allowlist. Do not add files, rename routes, change the sitemap, or return diffs.',
    'Improve meaningful details only: design distinctiveness, visual hierarchy, page-to-page consistency, mobile layout, accessibility, metadata, asset references and interaction clarity. Avoid cosmetic churn.',
    'Keep every explicit user requirement, form, navigation destination, page title, and working interaction intact. Never invent business facts, testimonials, prices, contact details, integrations or results.',
    'Keep dependencies unchanged. No secrets, TODOs, placeholders or dead controls.',
    'ORIGINAL USER BRIEF:\n' + String(prompt || ''),
    'APPROVED WEBSITE ARCHITECTURE JSON:\n' + JSON.stringify(plan || {}),
    'FULL WEBSITE ROUTE MANIFEST JSON:\n' + JSON.stringify({
      architecture: siteMap && siteMap.architecture || '',
      pages: (siteMap && Array.isArray(siteMap.pages) ? siteMap.pages : []).map(page => ({ title: page.title, path: page.path, url: page.url, goal: page.goal })),
      sharedFiles: (siteMap && Array.isArray(siteMap.sharedFiles) ? siteMap.sharedFiles : []).map(file => ({ path: file.path, purpose: file.purpose })),
    }),
    'PROMPT REQUIREMENT CONTRACT JSON:\n' + JSON.stringify(promptContract || {}),
    'BRAND AND EXPERIENCE CONTEXT:\n' + String(extraContext || '').slice(0, 6000),
    'POLISH TARGET FILES JSON:\n' + JSON.stringify(targets.map(item => ({ path: item.path, currentCharacters: item.content.length }))),
    'POLISH CURRENT FILE CONTENTS JSON:\n' + JSON.stringify(currentFiles),
    'POLISH ALLOWLIST JSON:\n' + JSON.stringify(targets.map(item => item.path)),
  ].join('\n\n');
}

function selectBoundedPolishTargets(staged, siteMap, limit, maxFileChars, maxTotalChars) {
  const candidates = selectSitePolishChanges(staged, siteMap, limit);
  const selected = [];
  let totalChars = 0;
  for (const item of candidates) {
    const content = String(item && item.content || '');
    if (!item || !item.path || !content.trim() || content.length > maxFileChars) continue;
    if (totalChars + content.length > maxTotalChars) continue;
    selected.push({ ...item, content });
    totalChars += content.length;
  }
  return selected;
}

function validateStagedSite(staged, prompt, siteMap) {
  const validation = validateChanges(staged.map(item => ({ ...item, action: 'update' })), { allowDeletes: false });
  const outputFilesByPath = Object.fromEntries(staged.map(item => [item.path, item.content]));
  const requirementVerification = verifyPromptContractOutput(prompt, outputFilesByPath, siteMap);
  return { validation, outputFilesByPath, requirementVerification };
}

function projectPages(project, siteMap) {
  const oldPages = project && Array.isArray(project.pages) ? project.pages : [];
  const oldByName = new Map(oldPages.map(page => [slug(page && page.name).toLowerCase(), page]));
  return siteMap.pages.map((page, index) => {
    const old = oldByName.get(slug(page.title).toLowerCase());
    return {
      ...(old && typeof old === 'object' ? old : {}),
      name: page.title,
      path: page.path,
      route: page.url,
      sections: old && Array.isArray(old.sections) ? old.sections : [],
      order: index,
    };
  });
}

export async function buildStudioMultiPage(options) {
  const env = options.env;
  const callModel = options.callModel;
  const provider = options.provider || 'automatic';
  const model = options.model;
  const authUser = options.authUser;
  const prompt = String(options.prompt || '');
  const promptContract = buildPromptContract(prompt);
  const project = options.project || {};
  const mode = String(options.mode || 'build').toLowerCase();
  if (mode !== 'build' || singlePage(prompt)) return null;

  const existingFiles = cleanFiles(options.files);
  const pageLimit = cap(env, 'OVYX_WEBSTUDIO_MAX_PAGES', 250);
  const fileLimit = Math.max(3, Math.min(10, cap(env, 'OVYX_WEBSTUDIO_MAX_BATCH_FILES', 6)));
  const requireMulti = manyPages(prompt);
  const extraContext = typeof options.context === 'string' ? options.context : JSON.stringify(options.context || {});
  const inputs = [];
  const outputs = [];
  let usage = {};
  let hasUsage = false;
  const planInput = planPrompt(prompt, project, Object.keys(existingFiles), requireMulti, pageLimit, extraContext, promptContract);
  let planResult;
  try {
    planResult = await callModel(env, {
      provider, model, authUser, taskPrompt: prompt,
      system: [String(options.qualityContract || '').trim(), 'You are an expert website information architect. Return JSON only with a realistic route-by-route sitemap. Do not generate site code in this planning phase.'].filter(Boolean).join('\n\n'),
      user: planInput,
      maxTokens: cap(env, 'OVYX_WEBSTUDIO_PLAN_TOKENS', 7000),
    });
  } catch (error) {
    throw accountingError(error, usage, hasUsage, inputs, outputs);
  }
  inputs.push(planInput);
  outputs.push(String(planResult && planResult.text || ''));
  const firstUsage = usageAdd(usage, planResult && planResult.rawUsage);
  usage = firstUsage.total;
  hasUsage = hasUsage || firstUsage.found;

  const plan = parseJSON(planResult && planResult.text);
  const normalized = makeSiteMap(plan && plan.siteMap, pageLimit);
  const siteMap = normalized.siteMap;

  if (normalized.overflow > 0) {
    throw accountingError(Object.assign(new Error('The website exceeds the configured page ceiling of ' + pageLimit + '. Increase OVYX_WEBSTUDIO_MAX_PAGES to allow a larger site; no pages were silently dropped.'), { status: 413, code: 'WEBSTUDIO_PAGE_LIMIT' }), usage, hasUsage, inputs, outputs);
  }
  if (!siteMap || !siteMap.pages.length) {
    if (!requireMulti) return null;
    throw accountingError(Object.assign(new Error('OVYX could not create a valid multi-page plan. No project files were changed; include the requested page names and retry.'), { status: 502, code: 'WEBSTUDIO_SITEMAP_INVALID' }), usage, hasUsage, inputs, outputs);
  }
  // Recover omitted requested routes deterministically instead of silently accepting
  // a sitemap that dropped an explicitly named page.
  const pageKey = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const plannedPageKeys = new Set(siteMap.pages.map(page => pageKey(page.title)));
  for (const title of promptContract.explicitPages) {
    const key = pageKey(title);
    if (!key || plannedPageKeys.has(key)) continue;
    if (siteMap.pages.length >= pageLimit) {
      throw accountingError(Object.assign(new Error('The brief explicitly requests the "' + title + '" page, but adding it would exceed the configured page ceiling of ' + pageLimit + '. No pages were silently dropped.'), { status: 413, code: 'WEBSTUDIO_PAGE_LIMIT' }), usage, hasUsage, inputs, outputs);
    }
    const pageSlug = slug(title);
    const page = {
      title,
      path: 'src/pages/' + pageSlug + '.html',
      url: '/' + pageSlug.toLowerCase() + '/',
      goal: 'Required by the user prompt; do not omit.',
    };
    siteMap.pages.push(page);
    plannedPageKeys.add(key);
    if (plan && plan.siteMap && Array.isArray(plan.siteMap.pages)) {
      plan.siteMap.pages.push({ title, goal: page.goal });
    }
  }

  if (requireMulti && siteMap.pages.length < 2) {
    throw accountingError(Object.assign(new Error('The generated plan did not contain multiple distinct pages. No files were changed; retry with the requested page names.'), { status: 502, code: 'WEBSTUDIO_SITEMAP_INCOMPLETE' }), usage, hasUsage, inputs, outputs);
  }
  if (siteMap.pages.length < 2) return null;

  const batches = createSiteBuildBatches(siteMap, fileLimit);
  if (!batches.length) {
    throw accountingError(Object.assign(new Error('OVYX could not turn the page plan into build batches.'), { status: 502, code: 'WEBSTUDIO_BATCH_PLAN_FAILED' }), usage, hasUsage, inputs, outputs);
  }

  let staged = [];
  let lastResult = planResult;
  for (const batch of batches) {
    const input = makeBatchPrompt(prompt, plan, siteMap, batch, staged, existingFiles, extraContext, promptContract);
    inputs.push(input);
    let result;
    try {
      result = await callModel(env, {
        provider, model, authUser, taskPrompt: prompt,
        system: [String(options.qualityContract || '').trim(), 'You are OVYX Web Studio, a senior frontend engineer and UX architect. Follow the batch instructions exactly. Return strict JSON with complete file contents.'].filter(Boolean).join('\n\n'),
        user: input,
        maxTokens: cap(env, 'OVYX_WEBSTUDIO_BATCH_TOKENS', 18000),
      });
    } catch (error) {
      throw accountingError(error, usage, hasUsage, inputs, outputs);
    }
    lastResult = result;
    outputs.push(String(result && result.text || ''));
    const nextUsage = usageAdd(usage, result && result.rawUsage);
    usage = nextUsage.total;
    hasUsage = hasUsage || nextUsage.found;

    const generated = outputFiles(parseJSON(result && result.text));
    const paths = Object.keys(generated);
    const allowed = new Set(batch.allowedPaths);
    if (!paths.length) throw accountingError(Object.assign(new Error('Web Studio batch ' + batch.index + ' returned no usable file contents. The site was not marked complete.'), { status: 502, code: 'WEBSTUDIO_BATCH_EMPTY' }), usage, hasUsage, inputs, outputs);
    if (paths.length > fileLimit) throw accountingError(Object.assign(new Error('Web Studio batch ' + batch.index + ' returned too many files. Retry the build.'), { status: 502, code: 'WEBSTUDIO_BATCH_FILE_LIMIT' }), usage, hasUsage, inputs, outputs);
    for (const path of paths) {
      if (!allowed.has(path)) throw accountingError(Object.assign(new Error('Web Studio attempted an unplanned output path: ' + path), { status: 502, code: 'WEBSTUDIO_PATH_NOT_ALLOWED' }), usage, hasUsage, inputs, outputs);
      if (!String(generated[path]).trim()) throw accountingError(Object.assign(new Error('Web Studio returned empty content for ' + path), { status: 502, code: 'WEBSTUDIO_EMPTY_FILE' }), usage, hasUsage, inputs, outputs);
    }
    const missing = batch.targetPaths.filter(path => !paths.includes(path));
    if (missing.length) throw accountingError(Object.assign(new Error('Web Studio batch ' + batch.index + ' missed required files: ' + missing.join(', ') + '. The site was not marked complete.'), { status: 502, code: 'WEBSTUDIO_BATCH_MISSING_FILES' }), usage, hasUsage, inputs, outputs);
    staged = mergeStagedChanges(staged, paths.map(path => ({
      path,
      action: existingFiles[path] || staged.some(item => item.path === path) ? 'update' : 'create',
      content: generated[path],
    })));
  }

  // Validate the first complete version before the optional polish pass. A failed
  // polish must never overwrite this baseline or turn a valid build into a failure.
  let checks = validateStagedSite(staged, prompt, siteMap);
  if (checks.validation.length) {
    throw accountingError(Object.assign(new Error('Generated website failed structural validation: ' + checks.validation.slice(0, 4).join(' | ')), { status: 422, code: 'WEBSTUDIO_SITE_VALIDATION_FAILED' }), usage, hasUsage, inputs, outputs);
  }
  if (!checks.requirementVerification.ok) {
    throw accountingError(Object.assign(new Error('Web Studio could not verify all explicit requirements: ' + checks.requirementVerification.issues.map(issue => issue.message).join(' | ') + '. The site was not marked complete.'), { status: 422, code: 'WEBSTUDIO_PROMPT_REQUIREMENT_MISSING', requirementVerification: checks.requirementVerification }), usage, hasUsage, inputs, outputs);
  }

  const baselineStaged = staged.map(item => ({ ...item }));
  const polishLimit = Math.max(1, Math.min(8, cap(env, 'OVYX_WEBSTUDIO_POLISH_MAX_FILES', 6)));
  const maxPolishFileChars = Math.max(1000, Math.min(45000, cap(env, 'OVYX_WEBSTUDIO_POLISH_MAX_FILE_CHARS', 28000)));
  const maxPolishContextChars = Math.max(10000, Math.min(100000, cap(env, 'OVYX_WEBSTUDIO_POLISH_MAX_CONTEXT_CHARS', 80000)));
  const polishTargets = selectBoundedPolishTargets(staged, siteMap, polishLimit, maxPolishFileChars, maxPolishContextChars);
  let qualityPolish = {
    status: 'skipped',
    filesConsidered: polishTargets.length,
    filesUpdated: 0,
  };
  const polishEnabled = String(env && env.OVYX_WEBSTUDIO_POLISH_ENABLED || 'true').trim().toLowerCase() !== 'false';

  if (polishEnabled && polishTargets.length) {
    const polishInput = makePolishPrompt(prompt, plan, siteMap, polishTargets, extraContext, promptContract);
    inputs.push(polishInput);
    try {
      const polishResult = await callModel(env, {
        provider,
        model,
        authUser,
        taskPrompt: prompt,
        system: [
          String(options.qualityContract || '').trim(),
          'You are OVYX Web Studio, a senior frontend engineer and product designer. Return only complete files from the bounded polish allowlist.',
        ].filter(Boolean).join('\n\n'),
        user: polishInput,
        maxTokens: Math.max(1000, Math.min(18000, cap(env, 'OVYX_WEBSTUDIO_POLISH_TOKENS', 12000))),
      });
      lastResult = polishResult;
      outputs.push(String(polishResult && polishResult.text || ''));
      const polishUsage = usageAdd(usage, polishResult && polishResult.rawUsage);
      usage = polishUsage.total;
      hasUsage = hasUsage || polishUsage.found;

      const polishedFiles = outputFiles(parseJSON(polishResult && polishResult.text));
      const polishedPaths = Object.keys(polishedFiles);
      const allowedPolishPaths = new Set(polishTargets.map(item => item.path));
      const baselineByPath = new Map(baselineStaged.map(item => [item.path, item.content]));
      const invalidPolish = !polishedPaths.length ||
        polishedPaths.length > polishTargets.length ||
        polishedPaths.some(path => !allowedPolishPaths.has(path) ||
          !String(polishedFiles[path]).trim() ||
          String(polishedFiles[path]).length > 120000);

      if (invalidPolish) {
        qualityPolish.status = 'rejected';
      } else {
        const candidate = mergeStagedChanges(baselineStaged, polishedPaths.map(path => ({
          path,
          action: existingFiles[path] || baselineStaged.some(item => item.path === path) ? 'update' : 'create',
          content: polishedFiles[path],
        })));
        const candidateChecks = validateStagedSite(candidate, prompt, siteMap);
        const changedPaths = polishedPaths.filter(path => String(polishedFiles[path]) !== String(baselineByPath.get(path) || ''));
        if (!changedPaths.length) {
          qualityPolish.status = 'unchanged';
        } else if (candidateChecks.validation.length || !candidateChecks.requirementVerification.ok) {
          qualityPolish.status = 'rejected';
        } else {
          staged = candidate;
          checks = candidateChecks;
          qualityPolish.status = 'applied';
          qualityPolish.filesUpdated = changedPaths.length;
        }
      }
    } catch (polishError) {
      // The validated baseline remains usable if this extra, bounded call is
      // unavailable. Include partial usage when the provider reports it.
      if (polishError && polishError.partialUsage) {
        const partial = usageAdd(usage, polishError.partialUsage);
        usage = partial.total;
        hasUsage = hasUsage || partial.found;
      }
      qualityPolish.status = 'skipped';
    }
  } else if (polishEnabled && !polishTargets.length) {
    qualityPolish.status = 'skipped';
  } else {
    qualityPolish.status = 'disabled';
  }

  const outputFilesByPath = checks.outputFilesByPath;
  const requirementVerification = checks.requirementVerification;

  const updatedProject = project && project.id ? {
    id: project.id,
    name: project.name,
    description: project.description,
    assets: Array.isArray(project.assets) ? project.assets : [],
    pages: projectPages(project, siteMap),
  } : null;
  const rawUsage = hasUsage ? {
    prompt_tokens: usage.prompt_tokens || 0,
    completion_tokens: usage.completion_tokens || 0,
    total_tokens: usage.total_tokens === undefined ? ((usage.prompt_tokens || 0) + (usage.completion_tokens || 0)) : usage.total_tokens,
  } : null;
  const pageCount = siteMap.pages.length;
  const polishNote = qualityPolish.status === 'applied'
    ? ' A bounded design-polish pass refined ' + qualityPolish.filesUpdated + ' file(s).'
    : qualityPolish.status === 'rejected'
      ? ' An optional polish result failed validation, so the first validated version was preserved.'
      : qualityPolish.status === 'unchanged'
        ? ' The optional polish pass found no necessary changes.'
        : qualityPolish.status === 'disabled'
          ? ' The optional design-polish pass is disabled.'
          : ' The first validated version was preserved because the optional polish pass was unavailable.';
  const summary = 'Built ' + pageCount + ' distinct website pages in ' + batches.length + ' verified batches.' + polishNote;
  const message = 'Your multi-page website is ready in Web Studio. ' + pageCount + ' pages were generated and structurally checked.' + polishNote;
  return {
    ok: true,
    text: JSON.stringify({ summary, message }),
    message,
    summary,
    files: outputFilesByPath,
    requirementVerification,
    qualityPolish,
    project: updatedProject,
    siteMap,
    provider: (lastResult && lastResult.provider) || (planResult && planResult.provider),
    model: (lastResult && lastResult.model) || (planResult && planResult.model),
    requestedProvider: (lastResult && lastResult.requestedProvider) || (planResult && planResult.requestedProvider) || provider,
    routedProvider: (lastResult && lastResult.routedProvider) || (planResult && planResult.routedProvider) || provider,
    rawUsage,
    quotaInputText: inputs.join('\n\n'),
    quotaOutputText: outputs.join('\n\n'),
    totalPages: pageCount,
    batchCount: batches.length,
  };
}
