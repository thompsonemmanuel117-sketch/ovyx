import { normalizeSiteMap, createSiteBuildBatches, mergeStagedChanges, buildSiteBatchContext, selectSitePolishChanges } from './multi-page.js';
import { auditWebsiteIntegrity } from './site-integrity.js';
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
  const out = {};
  const sources = [value, value?.output, value?.result, value?.data]
    .filter(item => item && typeof item === 'object' && !Array.isArray(item));

  const contentOf = item => {
    if (typeof item === 'string') return item;
    if (!item || typeof item !== 'object') return null;
    for (const key of ['content', 'contents', 'text', 'source', 'sourceCode', 'code', 'html', 'body', 'fileContent']) {
      if (typeof item[key] === 'string') return item[key];
    }
    return null;
  };
  const pathOf = item => String(
    item && (item.path || item.file || item.filePath || item.file_path || item.filename || item.targetPath)
      || ''
  ).trim().replace(/^\/+/, '');

  for (const source of sources) {
    const files = source.files || source.fileEdits || source.projectFiles || source.generatedFiles || source.patch?.files;
    if (Array.isArray(files)) {
      files.forEach(item => {
        const path = pathOf(item);
        const content = contentOf(item);
        if (path && typeof content === 'string') out[path] = content;
      });
    } else if (files && typeof files === 'object') {
      Object.entries(files).forEach(([path, item]) => {
        const content = contentOf(item);
        const cleanedPath = String(path || '').trim().replace(/^\/+/, '');
        if (cleanedPath && typeof content === 'string') out[cleanedPath] = content;
      });
    }
  }

  if (!Object.keys(out).length) {
    for (const source of sources) {
      const html = source.html;
      const code = source.code || source.sourceCode;
      if (typeof html === 'string') { out['src/pages/Home.html'] = html; break; }
      if (typeof code === 'string') { out['src/pages/Home.html'] = code; break; }
    }
  }
  return out;
}

function recoverCssFromMalformedEnvelope(rawText) {
  const raw = String(rawText || '');
  // Recover only a complete CSS string explicitly located in a file-content
  // field. This handles JSON wrappers broken by unescaped CSS quotes without
  // treating arbitrary JSON/object text as stylesheet source.
  const marker = /"(?:content|contents|css|source|code)"\s*:\s*"/i.exec(raw);
  if (!marker) return null;
  const start = marker.index + marker[0].length;
  let depth = 0;
  let started = false;
  let quote = '';
  let escaped = false;
  let comment = false;

  for (let index = start; index < raw.length; index += 1) {
    const character = raw[index];
    const next = raw[index + 1];

    if (comment) {
      if (character === '*' && next === '/') {
        comment = false;
        index += 1;
      }
      continue;
    }
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\') {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = '';
      continue;
    }
    if (character === '/' && next === '*') {
      comment = true;
      index += 1;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '{') {
      depth += 1;
      started = true;
      continue;
    }
    if (character === '}') {
      depth -= 1;
      if (depth < 0) return null;
      if (started && depth === 0) {
        const tail = raw.slice(index + 1);
        // At the end of a CSS value, the next quote is the malformed JSON
        // string delimiter, followed by an object/array delimiter.
        if (/^\s*(?:"\s*[,}\]]|[,}\]])/.test(tail) || /^\s*$/.test(tail)) {
          return raw.slice(start, index + 1)
            .replace(/\\n/g, '\n')
            .replace(/\\r/g, '\r')
            .replace(/\\t/g, '\t');
        }
      }
    }
  }
  return null;
}

export function extractFirstHtmlDocument(rawText, targetPath = '') {
  const raw = String(rawText || '');
  const starts = [...raw.matchAll(/<!doctype\s+html\b|<html\b/gi)]
    .map(match => match.index).filter(Number.isInteger);
  const candidates = [];
  const targetBase = String(targetPath || '').split('/').pop().replace(/\.html?$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const targetIsContact = /contact|enquir|inquir/i.test(targetBase);

  for (const start of starts) {
    const tail = raw.slice(start);
    const closeMatch = /<\/html\s*>/i.exec(tail);
    if (!closeMatch) continue;
    let document = tail.slice(0, closeMatch.index + closeMatch[0].length).trim();
    document = document.replace(/<[^>]*>/g, tag => tag.replace(/\\(["'])/g, '$1'));
    const doctypeCount = (document.match(/<!doctype\s+html\b/gi) || []).length;
    const htmlCount = (document.match(/<html\b/gi) || []).length;
    if (doctypeCount > 1 || htmlCount !== 1 ||
        !/<head\b/i.test(document) || !/<body\b/i.test(document) || !/<\/body\s*>/i.test(document)) continue;
    const title = document.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1] || '';
    const heading = document.match(/<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/i)?.[1] || '';
    const normalizedTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, '');
    const normalizedHeading = heading.toLowerCase().replace(/<[^>]*>/g, '').replace(/[^a-z0-9]+/g, '');
    let score = 0;
    if (targetBase && normalizedTitle.startsWith(targetBase)) score += 100;
    if (targetBase && normalizedHeading.startsWith(targetBase)) score += 50;
    if (targetIsContact && /(?:contact|enquir|inquir|getintouch)/.test(normalizedTitle + normalizedHeading)) score += 100;
    if (!targetIsContact && targetBase === 'home' && /^(?:home|welcome)/.test(normalizedHeading)) score += 25;
    if (!candidates.some(item => item.document === document)) candidates.push({ document, score, start });
  }

  if (!candidates.length) return null;
  if (targetPath) {
    candidates.sort((a, b) => b.score - a.score || a.start - b.start);
    if (candidates[0].score > 0) return candidates[0].document;
  }
  candidates.sort((a, b) => a.start - b.start);
  return candidates[0].document;
}

function recoverSingleFileContent(rawText, targetPath, parsedOutput = null) {
  const target = String(targetPath || '');
  const extension = (target.split('.').pop() || '').toLowerCase();
  if (!['html', 'htm', 'css', 'js', 'mjs'].includes(extension)) return null;

  const candidates = [];
  if (typeof parsedOutput === 'string') candidates.push(parsedOutput);
  if (parsedOutput && typeof parsedOutput === 'object' && !Array.isArray(parsedOutput)) {
    for (const key of ['html', 'code', 'text', 'response', 'output_text', 'content', 'output']) {
      if (typeof parsedOutput[key] === 'string') candidates.push(parsedOutput[key]);
    }
  }
  candidates.push(String(rawText || ''));

  const fence = String.fromCharCode(96).repeat(3);
  for (const candidate of candidates) {
    let raw = String(candidate || '').trim();
    if (!raw || raw.length > 200_000) continue;
    if (raw.startsWith(fence) && raw.endsWith(fence)) {
      raw = raw.slice(fence.length, -fence.length).trim();
      const newline = raw.indexOf('\n');
      const firstLine = (newline < 0 ? raw : raw.slice(0, newline)).trim().toLowerCase();
      if (['html', 'htm', 'css', 'javascript', 'js', 'mjs'].includes(firstLine)) {
        raw = newline < 0 ? '' : raw.slice(newline + 1).trim();
      }
    }
    if (!raw || raw.length > 120_000) continue;
    if (/^[{[]/.test(raw) && extension === 'css') {
      const recoveredCss = recoverCssFromMalformedEnvelope(raw);
      if (typeof recoveredCss === 'string' && recoveredCss.trim()) return recoveredCss;
    }
    // HTML can be recoverable even when a model wraps it in invalid JSON
    // (for example, unescaped attribute quotes inside a content string).
    // Keep JSON-looking response rejection for CSS/JS; HTML still requires a
    // complete document and passes the same allowlist and site validators.
    if (/^[{[]/.test(raw) && extension !== 'html' && extension !== 'htm') continue;

    if (extension === 'html' || extension === 'htm') {
      const document = extractFirstHtmlDocument(raw, target);
      if (document && document.length <= 120_000) return document;
      continue;
    }

    if (extension === 'css') {
      if (!raw.includes('{') || !raw.includes('}')) continue;
      let depth = 0;
      let balanced = true;
      for (const character of raw) {
        if (character === '{') depth += 1;
        if (character === '}') depth -= 1;
        if (depth < 0) { balanced = false; break; }
      }
      if (balanced && depth === 0) return raw;
      continue;
    }

    if (/(?:^|[;\n])\s*(?:(?:const|let|var|function|class|export|import|document|window|globalThis)\b|['"]use strict['"]|[A-Za-z_$][\w$]*\s*=>)/m.test(raw)) {
      return raw;
    }
  }
  return null;
}

const SAFE_OUTPUT_ROOT_KEYS = new Set([
  'summary', 'files', 'fileEdits', 'patch', 'html', 'code',
  'siteMap', 'text', 'response', 'output', 'output_text', 'content', 'message',
]);

function batchOutputShapeDiagnostics(rawText, parsed, generated, batch) {
  const raw = String(rawText || '');
  const rootKeys = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? [...new Set(Object.keys(parsed).map(key => SAFE_OUTPUT_ROOT_KEYS.has(key) ? key : 'other'))].slice(0, 12)
    : [];
  const container = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed.files ?? parsed.fileEdits ?? parsed.patch?.files)
    : undefined;
  const fileContainerKind = Array.isArray(container)
    ? 'array'
    : container && typeof container === 'object'
      ? 'object'
      : container === undefined || container === null
        ? 'absent'
        : 'other';
  const fileContainerEntries = Array.isArray(container)
    ? container.length
    : container && typeof container === 'object'
      ? Object.keys(container).length
      : 0;
  const targetExtension = (String(batch?.targetPaths?.[0] || '').split('.').pop() || '').toLowerCase();
  return {
    responseCharacters: Math.min(raw.length, 200_000),
    parsedJson: Boolean(parsed && typeof parsed === 'object' && !Array.isArray(parsed)),
    rootKeys,
    fileContainerKind,
    fileContainerEntries: Math.min(fileContainerEntries, 100),
    extractedFileCount: Math.min(Object.keys(generated || {}).length, 100),
    startsWithJsonObject: /^\s*\{/.test(raw),
    endsWithJsonObject: /\}\s*$/.test(raw),
    containsMarkdownFence: raw.includes(fenceForShapeDiagnostics()),
    containsHtmlDocument: /<!doctype\s+html|<html\b/i.test(raw),
    endsWithHtmlDocument: raw.toLowerCase().trimEnd().endsWith('</html>'),
    batchIndex: Math.max(0, Math.min(100, Number(batch?.index) || 0)),
    batchTotal: Math.max(0, Math.min(100, Number(batch?.total) || 0)),
    targetFileExtension: ['html', 'htm', 'css', 'js', 'mjs'].includes(targetExtension) ? targetExtension : 'other',
  };
}

function fenceForShapeDiagnostics() {
  return String.fromCharCode(96).repeat(3);
}

function deterministicFallbackSiteMapTitles(prompt, explicitPages = []) {
  const source = String(prompt || '').toLowerCase();
  const realEstate = /\b(?:real estate|realty|property advisory|property listings?|home buyers?|renters?)\b/i.test(source);
  const restaurant = /\b(?:restaurant|cafe|café|dining|menu|food service)\b/i.test(source);
  const fashion = /\b(?:fashion|clothing|apparel|materials\s*(?:&|and)\s*fit|fashion label)\b/i.test(source);
  const software = /\b(?:saas|software|workflow|software product|app platform|product website)\b/i.test(source);
  const defaults = realEstate
    ? ['Home', 'Property Listings', 'About', 'Contact']
    : restaurant
      ? ['Home', 'Menu', 'About', 'Contact']
      : fashion
        ? ['Home', 'Collections', 'About', 'Contact']
        : software
          ? ['Home', 'Product', 'Features', 'Contact']
          : ['Home', 'About', 'Services', 'Contact'];

  const titles = [];
  const key = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const aliases = value => {
    const normalized = key(value);
    return normalized === 'ourstory' ? 'about'
      : normalized === 'homepages' ? 'home'
      : normalized === 'collection' ? 'collections'
      : normalized === 'propertylisting' ? 'propertylistings'
      : normalized;
  };
  const add = title => {
    const value = String(title || '').trim().slice(0, 100);
    const canonical = aliases(value);
    if (!value || !canonical || titles.some(item => aliases(item) === canonical)) return;
    titles.push(value);
  };

  const requested = Array.isArray(explicitPages)
    ? explicitPages.map(value => String(value || '').trim()).filter(Boolean)
    : [];
  for (const title of (requested.length >= 2 ? requested : defaults)) add(title);

  // Some common requested pages are meaningful but not yet in the prompt
  // contract's generic page alias table. Recover these from exact phrase matches.
  if (/\bhow\s+it\s+works\b/i.test(source)) add('How It Works');
  if (/\bmaterials\s*(?:&|and)\s*fit\b/i.test(source)) add('Materials & Fit');

  if (!titles.some(title => /^home(?:page)?$/i.test(title))) titles.unshift('Home');
  const homeIndex = titles.findIndex(title => /^home(?:page)?$/i.test(title));
  if (homeIndex > 0) titles.unshift(titles.splice(homeIndex, 1)[0]);

  if (realEstate && /\bproperty\s+listings?\b/i.test(source) &&
      !titles.some(title => aliases(title) === 'propertylistings')) {
    titles.splice(1, 0, 'Property Listings');
  }
  return titles;
}

export function resolveExplicitPageManifest(env, promptContractPages) {
  const requestedPages = Array.isArray(promptContractPages) ? promptContractPages : [];
  if (env?.OVYX_WEBSTUDIO_EXPLICIT_PAGE_MANIFEST_ONLY !== 'true') return requestedPages;
  const configuredManifest = String(env.OVYX_WEBSTUDIO_EXPLICIT_PAGE_MANIFEST || '')
    .split('|').map(value => value.trim()).filter(Boolean);
  return configuredManifest.length ? configuredManifest : requestedPages;
}

export function restrictSiteMapToExplicitPages(raw, explicitPages, limit) {
  if (!raw || !Array.isArray(raw.pages) || !Array.isArray(explicitPages)) return null;
  const ceiling = Number(limit);
  if (!Number.isSafeInteger(ceiling) || ceiling < 2) return null;
  const key = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  const titles = [];
  const seen = new Set();
  for (const value of explicitPages) {
    const title = String(value || '').trim().slice(0, 100);
    const normalized = key(title);
    if (!title || !normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    titles.push(title);
  }
  // Only narrow the sitemap when the full explicit manifest fits. If the
  // prompt itself asks for more pages than allowed, preserve the normal guard.
  if (titles.length < 2 || titles.length > ceiling) return null;
  const byTitle = new Map();
  for (const page of raw.pages) {
    const title = String(page && (page.title || page.name) || '').trim();
    const normalized = key(title);
    if (normalized && !byTitle.has(normalized)) byTitle.set(normalized, page);
  }
  const pages = titles.map(title => {
    const planned = byTitle.get(key(title));
    return planned
      ? { ...planned, title }
      : { title, goal: 'Required by the original brief; preserve this explicitly requested route.' };
  });
  return {
    ...raw,
    pages,
  };
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

function splitBatchesForBoundedModelOutput(batches, maximumTargets = 1) {
  const targetLimit = Math.max(1, Math.min(1, Math.floor(Number(maximumTargets) || 1)));
  const split = [];
  for (const batch of Array.isArray(batches) ? batches : []) {
    const targets = Array.isArray(batch?.targetFiles) ? batch.targetFiles : [];
    for (let offset = 0; offset < targets.length; offset += targetLimit) {
      const targetFiles = targets.slice(offset, offset + targetLimit);
      const targetPaths = targetFiles.map(item => item.path).filter(Boolean);
      if (!targetPaths.length) continue;
      split.push({
        ...batch,
        targetFiles,
        targetPaths,
        targetPages: (Array.isArray(batch.targetPages) ? batch.targetPages : [])
          .filter(page => targetPaths.includes(page.path)),
        // Each model call must produce exactly one explicitly required file.
        // Shared CSS/JS are created in their own foundation batches and reused later.
        allowedPaths: targetPaths,
        maxChangedFiles: targetPaths.length,
        maxAdditionalChanges: 0,
        index: split.length + 1,
        total: 0,
      });
    }
  }
  return split.map((batch, index) => ({ ...batch, index: index + 1, total: split.length }));
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

function makeBatchPrompt(prompt, plan, siteMap, batch, stagedChanges, existingFiles, extraContext, promptContract, stage4Smoke = false) {
  const targetExtension = String(batch.targetPaths[0] || '').split('.').pop().toLowerCase();
  const cssOnly = batch.targetPaths.length === 1 && targetExtension === 'css';
  const javascriptOnly = batch.targetPaths.length === 1 && ['js', 'mjs'].includes(targetExtension);
  const rawSourceOnly = cssOnly || javascriptOnly;
  const compactSmokeHtmlTarget = stage4Smoke && (targetExtension === 'html' || targetExtension === 'htm');
  const context = buildSiteBatchContext({
    baseContext: 'APPROVED SITE MAP:\n' + JSON.stringify(plan) + '\n\nBRAND / CLIENT CONTEXT:\n' + String(extraContext || '').slice(0, 6000) + '\n\nORIGINAL USER BRIEF (preserve the specific requirements in this request):\n' + String(prompt || ''),
    stagedChanges,
    siteMap,
    batch,
    repositoryFiles: existingFiles,
    maxChars: 140000,
  });
  return [
    'OVYX WEB STUDIO MULTI-PAGE IMPLEMENTATION BATCH.',
    rawSourceOnly
      ? (cssOnly
          ? 'CSS-ONLY RESPONSE OVERRIDE: Return only the complete raw CSS stylesheet for the single approved src/styles.css target. Do not wrap it in JSON, Markdown fences, or prose. Preserve quoted CSS values and finish every rule with balanced braces.'
          : 'JAVASCRIPT-ONLY RESPONSE OVERRIDE: Return only complete raw JavaScript source for the single approved src/main.js target. Do not wrap it in JSON, Markdown fences, or prose. Keep the code syntactically complete.')
      : 'Return strict JSON only, without Markdown fences.',
    rawSourceOnly
      ? 'Output shape: raw ' + (cssOnly ? 'CSS' : 'JavaScript') + ' source only; the server will bind it to the single approved target path after source validation.'
      : 'Output shape: {"summary":"...","files":[{"path":"EXACT TARGET PATH FROM THE MANIFEST","language":"html|css|javascript","content":"complete file content"}]}.',
    rawSourceOnly
      ? 'Return complete final UTF-8 ' + (cssOnly ? 'CSS' : 'JavaScript') + ' source, not a diff, filename list, JSON envelope, or summary.'
      : 'Every value in files must be complete final UTF-8 file content, not a diff, filename list or summary.',
    'Pages live at src/pages/<Page>.html while shared files live at src/styles.css and src/main.js. From each page, reference shared assets with correct relative paths such as ../styles.css and ../main.js; never assume shared files are beside page files.',
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
    ...(compactSmokeHtmlTarget ? [
      'STAGE 4 SMOKE COMPACT HTML CONTRACT: This is the protected two-page engineering smoke, not a full client brief. Keep this HTML file at or below 2,800 characters. Return one complete, simple semantic document only: metadata, one h1, short content, navigation links and the required page-specific controls. Reuse ../styles.css and ../main.js; do not inline CSS, JavaScript, SVG illustrations, long copy, or duplicate shared components. Close every HTML tag and the document. The final page must remain genuinely usable and pass the same validators; never replace required behavior with fake success.',
      'For src/pages/Contact.html, include the labelled required name, email and message fields and a submit button. Preserve method="post" and action="/.well-known/ovyx-qa-enquiry"; main.js must handle the fetch, pending/disabled state, success only on response.ok, and an accessible error state. Do not send real enquiries or use a remote service.',
    ] : []),
    '',
    context,
  ].join('\n\n');
}

function makePolishPrompt(prompt, plan, siteMap, targets, extraContext, promptContract, integrityAudit) {
  const currentFiles = Object.fromEntries(targets.map(item => [item.path, item.content]));
  return [
    'OVYX WEB STUDIO BOUNDED WEBSITE POLISH PHASE.',
    'Perform one targeted quality-improvement pass on the already generated multi-page website. Preserve its established visual direction and all working behavior.',
    'Return strict JSON only, using this shape: {"summary":"...","files":{"existing/allowed/path":"complete final file content"}}.',
    'Return complete final files only for the provided allowlist. Do not add files, rename routes, change the sitemap, or return diffs.',
    'Prioritize fixing the deterministic site-integrity findings below, then improve meaningful details only: design distinctiveness, visual hierarchy, page-to-page consistency, mobile layout, accessibility, metadata, asset references and interaction clarity. Avoid cosmetic churn.',
    'SITE-INTEGRITY AUDIT JSON (source-level only; do not claim external resources or live integrations were verified):\\n' + JSON.stringify(integrityAudit || {}),
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

function selectBoundedPolishTargets(staged, siteMap, limit, maxFileChars, maxTotalChars, preferredPaths = []) {
  const byPath = new Map(staged.map(item => [item.path, item]));
  const preferred = Array.isArray(preferredPaths) ? preferredPaths : [];
  const ordinary = selectSitePolishChanges(staged, siteMap, limit).map(item => item.path);
  const allPaths = [...new Set([...preferred, ...ordinary, ...staged.map(item => item.path)])];
  const candidates = allPaths.map(path => byPath.get(path)).filter(Boolean);
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

function sharedAssetRelativePath(pagePath, assetPath) {
  const from = String(pagePath || '').split('/').slice(0, -1).filter(Boolean);
  const to = String(assetPath || '').split('/').filter(Boolean);
  let common = 0;
  while (common < from.length && common < to.length && from[common] === to[common]) common += 1;
  const relative = [...Array(from.length - common).fill('..'), ...to.slice(common)].join('/');
  return relative || to[to.length - 1] || '';
}

function isLocalAssetReference(value) {
  const raw = String(value || '').trim();
  return !!raw && !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(raw);
}

function tagReferencesAsset(tag, attribute, assetPath) {
  const matcher = new RegExp("\\b(" + attribute + "\\s*=\\s*)([\"'])(.*?)\\2", "i");
  const match = String(tag || '').match(matcher);
  if (!match || !isLocalAssetReference(match[3])) return false;
  const rawPath = match[3].split(/[?#]/, 1)[0];
  const expected = String(assetPath || '').split('/').filter(Boolean).pop() || '';
  const actual = rawPath.split('/').filter(Boolean).pop() || '';
  return !!expected && actual.toLowerCase() === expected.toLowerCase();
}

function rewriteTagAssetReference(tag, attribute, pagePath, assetPath) {
  const matcher = new RegExp("\\b(" + attribute + "\\s*=\\s*)([\"'])(.*?)\\2", "i");
  return String(tag || '').replace(matcher, (whole, prefix, quote, raw) => {
    if (!isLocalAssetReference(raw)) return whole;
    const rawPath = String(raw).split(/[?#]/, 1)[0];
    const expected = String(assetPath || '').split('/').filter(Boolean).pop() || '';
    const actual = rawPath.split('/').filter(Boolean).pop() || '';
    if (!expected || actual.toLowerCase() !== expected.toLowerCase()) return whole;
    const suffix = String(raw).slice(rawPath.length);
    const next = sharedAssetRelativePath(pagePath, assetPath) + suffix;
    return prefix + quote + next + quote;
  });
}

function insertSharedAssetTag(source, tag, target) {
  const text = String(source || '');
  if (target === 'head') {
    if (/<\/head\s*>/i.test(text)) return text.replace(/<\/head\s*>/i, match => '\n' + tag + match);
    if (/<head\b[^>]*>/i.test(text)) return text.replace(/<head\b[^>]*>/i, match => match + '\n' + tag);
    if (/<html\b[^>]*>/i.test(text)) return text.replace(/<html\b[^>]*>/i, match => match + '<head>' + tag + '</head>');
    return '<!doctype html><html><head>' + tag + '</head><body>' + text + '</body></html>';
  }
  if (/<\/body\s*>/i.test(text)) return text.replace(/<\/body\s*>/i, match => '\n' + tag + match);
  if (/<body\b[^>]*>/i.test(text)) return text.replace(/<body\b[^>]*>/i, match => match + '\n' + tag);
  return text + '\n' + tag;
}

function normalizeSharedAssetReferences(staged, siteMap) {
  const available = new Set((Array.isArray(staged) ? staged : []).map(item => item && item.path).filter(Boolean));
  const sharedAssets = (Array.isArray(siteMap?.sharedFiles) ? siteMap.sharedFiles : [])
    .map(item => String(item?.path || '').trim())
    .filter(path => available.has(path) && /\.(?:css|js)$/i.test(path));
  let repairedPages = 0;
  const next = (Array.isArray(staged) ? staged : []).map(item => {
    const pagePath = String(item?.path || '');
    if (!/\.html?$/i.test(pagePath) || !Array.isArray(siteMap?.pages) ||
        !siteMap.pages.some(page => String(page?.path || '') === pagePath) ||
        typeof item.content !== 'string') return item;
    const original = item.content;
    let content = original;
    for (const assetPath of sharedAssets) {
      if (/\.css$/i.test(assetPath)) {
        content = content.replace(/<link\b[^>]*>/gi, tag => rewriteTagAssetReference(tag, 'href', pagePath, assetPath));
        const linkTags = content.match(/<link\b[^>]*>/gi) || [];
        if (!linkTags.some(tag => tagReferencesAsset(tag, 'href', assetPath))) {
          const rel = sharedAssetRelativePath(pagePath, assetPath);
          content = insertSharedAssetTag(content, '<link rel="stylesheet" href="' + rel + '">', 'head');
        }
      } else if (/\.js$/i.test(assetPath)) {
        content = content.replace(/<script\b[^>]*>/gi, tag => rewriteTagAssetReference(tag, 'src', pagePath, assetPath));
        const scriptTags = content.match(/<script\b[^>]*>/gi) || [];
        if (!scriptTags.some(tag => tagReferencesAsset(tag, 'src', assetPath))) {
          const rel = sharedAssetRelativePath(pagePath, assetPath);
          content = insertSharedAssetTag(content, '<script src="' + rel + '" defer></script>', 'body');
        }
      }
    }
    if (content === original) return item;
    repairedPages += 1;
    return { ...item, content };
  });
  return { staged: next, repairedPages };
}

function resolveGeneratedLocalReference(fromFile, reference) {
  const value = String(reference || '').split(/[?#]/, 1)[0].trim();
  if (!value || /^(?:[a-z][a-z0-9+.-]*:|\/\/|data:|blob:|#)/i.test(value)) return '';
  const base = String(fromFile || '').replace(/\\/g, '/').split('/').slice(0, -1);
  const parts = value.startsWith('/') ? value.slice(1).split('/') : base.concat(value.split('/'));
  const normalized = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') { if (normalized.length) normalized.pop(); else return ''; continue; }
    normalized.push(part);
  }
  return normalized.join('/');
}

export function repairStage4SmokeQaFormAttributes(staged, siteMap, enabled = false) {
  const source = Array.isArray(staged) ? staged : [];
  if (!enabled) return { staged: source, repaired: false };
  const contactPage = (Array.isArray(siteMap?.pages) ? siteMap.pages : [])
    .find(page => /contact|enquir|inquir/i.test(String(page?.title || '')));
  if (!contactPage?.path) return { staged: source, repaired: false };
  let repaired = false;
  let next = source.map(item => {
    if (String(item?.path || '').replace(/\\/g, '/') !== String(contactPage.path).replace(/\\/g, '/') ||
        typeof item?.content !== 'string') return item;
    const openingForm = item.content.match(/<form\b[^>]*>/i)?.[0];
    if (!openingForm) return item;
    const attributesNormalized = openingForm
      .replace(/\s+(?:method|action)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/\s*\/?>(?:$)/, ending => ' method="post" action="/.well-known/ovyx-qa-enquiry"' + ending);
    if (attributesNormalized === openingForm) return item;
    repaired = true;
    return { ...item, content: item.content.replace(openingForm, attributesNormalized) };
  });
  const smokeQaHandler = [
    "document.addEventListener('DOMContentLoaded', () => {",
    "  document.querySelectorAll('form[action=\"/.well-known/ovyx-qa-enquiry\"]').forEach(form => {",
    "    if (form.dataset.ovyxQaBound === 'true') return;",
    "    form.dataset.ovyxQaBound = 'true';",
    "    let status = form.parentElement && form.parentElement.querySelector('#result, [data-ovyx-qa-status], [role=\"status\"]');",
    "    if (!status) { status = document.createElement('p'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); form.insertAdjacentElement('afterend', status); }",
    "    form.addEventListener('submit', async event => {",
    "      event.preventDefault();",
    "      const submit = form.querySelector('button[type=\"submit\"], input[type=\"submit\"]');",
    "      if (submit) submit.disabled = true;",
    "      status.textContent = 'Sending test enquiry…';",
    "      try {",
    "        const response = await fetch('/.well-known/ovyx-qa-enquiry', { method: 'POST', body: new FormData(form) });",
    "        if (!response.ok) throw new Error('QA submission rejected');",
    "        status.textContent = 'Your test enquiry was received.';",
    "        form.reset();",
    "      } catch {",
    "        status.textContent = 'Unable to submit the test enquiry. Please try again.';",
    "      } finally {",
    "        if (submit) submit.disabled = false;",
    "      }",
    "    });",
    "  });",
    "});",
  ].join('\n');
  let scriptIndex = next.findIndex(item => /(^|\/)main\.js$/i.test(String(item?.path || '').replace(/\\/g, '/')));
  if (scriptIndex < 0) scriptIndex = next.findIndex(item => /\.(?:js|mjs)$/i.test(String(item?.path || '')));
  if (scriptIndex >= 0 && String(next[scriptIndex].content || '') !== smokeQaHandler) {
    next = next.map((item, index) => index === scriptIndex ? { ...item, content: smokeQaHandler } : item);
    repaired = true;
  }
  return { staged: next, repaired };
}

export function repairStage4SmokeQaFormBehavior(staged, siteMap, enabled = false) {
  const source = Array.isArray(staged) ? staged : [];
  if (!enabled) return { staged: source, repaired: false };
  const contactPage = (Array.isArray(siteMap?.pages) ? siteMap.pages : [])
    .find(page => /contact|enquir|inquir/i.test(String(page?.title || '')));
  if (!contactPage?.path) return { staged: source, repaired: false };
  const contact = source.find(item =>
    String(item?.path || '').replace(/\\/g, '/') === String(contactPage.path).replace(/\\/g, '/') &&
    typeof item?.content === 'string' &&
    /<form\b/i.test(item.content)
  );
  if (!contact) return { staged: source, repaired: false };
  const scriptPath = 'src/main.js';
  const script = [
    "document.addEventListener('DOMContentLoaded', () => {",
    "  const form = document.querySelector('form[action=\"/.well-known/ovyx-qa-enquiry\"]');",
    "  if (!form) return;",
    "  let status = form.parentElement && form.parentElement.querySelector('#result, [data-qa-form-status]');",
    "  if (!status) {",
    "    status = document.createElement('p');",
    "    status.id = 'qa-form-status';",
    "    form.insertAdjacentElement('afterend', status);",
    "  }",
    "  status.setAttribute('role', 'status');",
    "  status.setAttribute('aria-live', 'polite');",
    "  const submit = form.querySelector('button[type=\"submit\"], input[type=\"submit\"]');",
    "  form.addEventListener('submit', async event => {",
    "    event.preventDefault();",
    "    if (submit) submit.disabled = true;",
    "    status.textContent = 'Sending test submission…';",
    "    try {",
    "      const response = await fetch('/.well-known/ovyx-qa-enquiry', { method: 'POST', body: new FormData(form) });",
    "      if (!response.ok) throw new Error('QA receiver rejected the test submission');",
    "      status.textContent = 'Test submission received by the local QA receiver. No email or customer lead was sent.';",
    "      form.reset();",
    "    } catch {",
    "      status.textContent = 'Test submission failed. Please retry; no customer enquiry was sent.';",
    "    } finally {",
    "      if (submit) submit.disabled = false;",
    "    }",
    "  });",
    "});",
    "",
  ].join('\n');
  const existing = source.find(item => String(item?.path || '').replace(/\\/g, '/') === scriptPath);
  if (!existing) return { staged: source, repaired: false };
  const repaired = existing.content !== script;
  if (!repaired) return { staged: source, repaired: false };
  return {
    staged: source.map(item => String(item?.path || '').replace(/\\/g, '/') === scriptPath
      ? { ...item, content: script }
      : item),
    repaired: true,
  };
}

export function validateStage4BrowserRuntime(staged, siteMap) {
  const errors = [];
  const files = Object.fromEntries((Array.isArray(staged) ? staged : [])
    .filter(item => item && typeof item.path === 'string' && typeof item.content === 'string')
    .map(item => [item.path.replace(/\\/g, '/'), item.content]));
  const htmlEntries = Object.entries(files).filter(([name]) => /\.html?$/i.test(name));
  const titleKey = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  const pages = Array.isArray(siteMap?.pages) ? siteMap.pages : [];
  const pageByPath = new Map(pages.map(page => [String(page.path || '').replace(/\\/g, '/'), page]));
  const referencedScripts = new Map();

  for (const [file, html] of htmlEntries) {
    const doctypeCount = (html.match(/<!doctype\s+html\b/gi) || []).length;
    const htmlCount = (html.match(/<html\b/gi) || []).length;
    if (doctypeCount !== 1 || htmlCount !== 1) errors.push(file + ': expected exactly one HTML document; do not append another page or a JSON envelope.');
    if (/<[^>]*\\["']/.test(html)) errors.push(file + ': HTML attributes contain escaped quotes and will not parse correctly in a browser.');
    if (!/<html\b[^>]*\blang\s*=\s*["'][^"']+["']/i.test(html)) errors.push(file + ': add a valid html lang attribute.');
    if (!/<meta\b[^>]*\bname\s*=\s*["']viewport["'][^>]*>/i.test(html)) errors.push(file + ': add a viewport meta tag for mobile devices.');
    if (!/<meta\b[^>]*\bname\s*=\s*["']description["'][^>]*>/i.test(html)) errors.push(file + ': add a meta description.');
    const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1] || '';
    const page = pageByPath.get(file);
    if (page?.title && !titleKey(title).startsWith(titleKey(page.title))) {
      errors.push(file + ': page title does not match the requested "' + page.title + '" route.');
    }
    for (const match of html.matchAll(/<script\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1[^>]*>/gi)) {
      const scriptPath = resolveGeneratedLocalReference(file, match[2]);
      if (scriptPath && files[scriptPath] !== undefined) {
        const users = referencedScripts.get(scriptPath) || [];
        users.push({ file, html });
        referencedScripts.set(scriptPath, users);
      }
    }
  }

  for (const [scriptPath, script] of Object.entries(files).filter(([name]) => /\.(?:js|mjs)$/i.test(name))) {
    if (/\b(?:from|import\s*\()\s*['"]jsdom['"]|new\s+JSDOM\b|\brequire\s*\(\s*['"]jsdom['"]/.test(script)) {
      errors.push(scriptPath + ': browser JavaScript must not import or instantiate jsdom.');
    }
    const references = [...script.matchAll(/getElementById\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\.addEventListener\s*\(/g)];
    for (const reference of references) {
      const id = reference[1];
      for (const user of referencedScripts.get(scriptPath) || []) {
        const hasDoubleQuotedId = user.html.includes('id="' + id + '"');
        const hasSingleQuotedId = user.html.includes("id='" + id + "'");
        if (!hasDoubleQuotedId && !hasSingleQuotedId) {
          errors.push(scriptPath + ': event handler for "' + id + '" is loaded on ' + user.file + ' where that element does not exist.');
        }
      }
    }
  }

  for (const [file, html] of htmlEntries) {
    const page = pageByPath.get(file);
    if (page && /contact|enquir|inquir/i.test(String(page.title || ''))) {
      const form = html.match(/<form\b[^>]*>/i)?.[0] || '';
      if (!form || !/\bmethod\s*=\s*["']post["']/i.test(form) ||
          !/\baction\s*=\s*["']\/\.well-known\/ovyx-qa-enquiry["']/i.test(form)) {
        errors.push(file + ': the isolated QA contact form must use method="post" and action="/.well-known/ovyx-qa-enquiry".');
      }
      const linkedScriptContent = [...referencedScripts.entries()]
        .filter(([, users]) => users.some(user => user.file === file))
        .map(([scriptPath]) => String(files[scriptPath] || ''))
        .join('\n');
      const hasLocalQaFetch = /fetch\s*\(\s*['"]\/\.well-known\/ovyx-qa-enquiry['"]/.test(html) ||
        /fetch\s*\(\s*['"]\/\.well-known\/ovyx-qa-enquiry['"]/.test(linkedScriptContent);
      if (!hasLocalQaFetch) {
        errors.push(file + ': the isolated QA form must submit to its local QA receiver and display a response state.');
      }
    }
  }
  return [...new Set(errors)];
}

function validateStagedSite(staged, prompt, siteMap, explicitPages = null, strictBrowserRuntime = false) {
  const validation = validateChanges(staged.map(item => ({ ...item, action: 'update' })), { allowDeletes: false });
  if (strictBrowserRuntime) validation.push(...validateStage4BrowserRuntime(staged, siteMap));
  const outputFilesByPath = Object.fromEntries(staged.map(item => [item.path, item.content]));
  const requirementVerification = verifyPromptContractOutput(prompt, outputFilesByPath, siteMap, { explicitPages: Array.isArray(explicitPages) ? explicitPages : undefined });
  const integrity = auditWebsiteIntegrity(outputFilesByPath, siteMap);
  return { validation, outputFilesByPath, requirementVerification, integrity };
}

function selectRequirementRepairPaths(staged, verification) {
  const codes = new Set((verification && verification.issues || []).map(issue => issue.code));
  const patterns = [];
  if (codes.has('BOOKING_FLOW_MISSING')) patterns.push(/reservation|booking|appointment|calendar|home/i);
  if (codes.has('SHOPPING_CART_MISSING') || codes.has('ADD_TO_CART_ACTION_MISSING')) patterns.push(/shop|product|cart|checkout|store|home/i);
  if (codes.has('CONTACT_FORM_MISSING')) patterns.push(/contact|enquir|inquir|home/i);
  if (codes.has('NEWSLETTER_MISSING')) patterns.push(/newsletter|subscribe|home/i);
  if (codes.has('AUTHENTICATION_UI_MISSING')) patterns.push(/login|sign.?in|account|auth|home/i);
  if (codes.has('PAYMENT_FLOW_MISSING')) patterns.push(/checkout|payment|shop|product|cart/i);

  const scored = (Array.isArray(staged) ? staged : [])
    .filter(item => item && /\.html?$/i.test(String(item.path || '')))
    .map((item, index) => {
      const searchable = String(item.path || '') + '\n' + String(item.content || '').slice(0, 16000);
      const hits = patterns.reduce((count, pattern) => count + (pattern.test(searchable) ? 1 : 0), 0);
      return { path: item.path, score: hits, index };
    })
    .filter(item => item.score > 0);
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.map(item => item.path);
}

function makeRequirementRepairPrompt(prompt, plan, siteMap, targets, extraContext, promptContract, verification, integrityAudit) {
  const currentFiles = Object.fromEntries(targets.map(item => [item.path, item.content]));
  return [
    'OVYX WEB STUDIO BOUNDED REQUIREMENT REPAIR PHASE.',
    'The first complete website passed structural validation but did not yet satisfy every deterministic requirement check. Make one narrow repair of the specific missing user-facing behavior listed below. Preserve all unrelated content, existing routes, design direction, and working behavior.',
    'Return strict JSON only with this shape: {"summary":"...","files":{"exact/allowlisted/path":"complete final file content"}}.',
    'Return complete contents only for files in the explicit repair allowlist. Do not add, delete, rename, or move files. Do not change the sitemap or modify unrelated pages.',
    'Implement a real visible control or form in the appropriate existing page. A navigation label or a paragraph describing a feature does not satisfy an action requirement. Do not claim a remote service, booking persistence, payment, cart backend, email delivery, or database is connected unless the source context proves it.',
    'Preserve supplied facts and never invent addresses, opening hours, prices, availability, testimonials, credentials, or provider status. Keep labels accessible and controls keyboard usable. Do not add dependencies, secrets, TODOs, fake success states, or placeholder links.',
    'ORIGINAL USER BRIEF:\n' + String(prompt || ''),
    'APPROVED WEBSITE ARCHITECTURE JSON:\n' + JSON.stringify(plan || {}),
    'FULL WEBSITE ROUTE MANIFEST JSON:\n' + JSON.stringify({
      architecture: siteMap && siteMap.architecture || '',
      pages: (siteMap && Array.isArray(siteMap.pages) ? siteMap.pages : []).map(page => ({ title: page.title, path: page.path, url: page.url, goal: page.goal })),
      sharedFiles: (siteMap && Array.isArray(siteMap.sharedFiles) ? siteMap.sharedFiles : []).map(file => ({ path: file.path, purpose: file.purpose })),
    }),
    'PROMPT REQUIREMENT CONTRACT JSON:\n' + JSON.stringify(promptContract || {}),
    'REQUIREMENT VERIFICATION FAILURES JSON:\n' + JSON.stringify(verification || {}),
    'EXISTING SITE-INTEGRITY AUDIT JSON (static source checks only):\n' + JSON.stringify(integrityAudit || {}),
    'BRAND AND PROJECT CONTEXT:\n' + String(extraContext || '').slice(0, 6000),
    'REPAIR TARGET FILES JSON:\n' + JSON.stringify(targets.map(item => ({ path: item.path, currentCharacters: item.content.length }))),
    'REPAIR CURRENT FILE CONTENTS JSON:\n' + JSON.stringify(currentFiles),
    'REPAIR ALLOWLIST JSON:\n' + JSON.stringify(targets.map(item => item.path)),
  ].join('\n\n');
}

function hasNewIntegrityFindings(before, after) {
  const key = item => [item.code, item.file, item.reference].join('|').toLowerCase();
  const existing = new Set((before && before.findings || []).map(key));
  return (after && after.findings || []).some(item => !existing.has(key(item)));
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

async function buildStudioMultiPageOnce(options) {
  const env = options.env;
  const callModel = options.callModel;
  const provider = options.provider || 'automatic';
  const model = options.model;
  const authUser = options.authUser;
  const preferredProvider = options.preferredProvider || '';
  const providerRouting = options.providerRouting || 'automatic';
  const fallback = options.fallback || 'automatic';
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
      provider, model, authUser, preferredProvider, providerRouting, fallback, taskPrompt: prompt,
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

  let plan = parseJSON(planResult && planResult.text);
  let normalized = makeSiteMap(plan && plan.siteMap, pageLimit);
  let siteMap = normalized.siteMap;
  let siteMapRecovery = null;

  const explicitPagesForReconciliation = resolveExplicitPageManifest(env, promptContract.explicitPages);
  const strictBrowserRuntime = env.OVYX_WEBSTUDIO_ENFORCE_BROWSER_RUNTIME === 'true';
  if (env.OVYX_WEBSTUDIO_EXPLICIT_PAGE_MANIFEST_ONLY === 'true') {
    const restrictedPlan = restrictSiteMapToExplicitPages(plan && plan.siteMap, explicitPagesForReconciliation, pageLimit);
    if (restrictedPlan) {
      normalized = makeSiteMap(restrictedPlan, pageLimit);
      siteMap = normalized.siteMap;
      plan = { ...(plan || {}), siteMap: restrictedPlan };
      siteMapRecovery = 'bounded-evaluation-explicit-page-manifest';
    }
  }

  if (normalized.overflow > 0) {
    throw accountingError(Object.assign(new Error('The website exceeds the configured page ceiling of ' + pageLimit + '. Increase OVYX_WEBSTUDIO_MAX_PAGES to allow a larger site; no pages were silently dropped.'), { status: 413, code: 'WEBSTUDIO_PAGE_LIMIT' }), usage, hasUsage, inputs, outputs);
  }
  if (!siteMap || !siteMap.pages.length) {
    if (!requireMulti) return null;

    // An invalid model-generated sitemap is recoverable from the original
    // brief's explicit page manifest and known industry conventions. This avoids
    // abandoning a whole site because one planning response was malformed.
    // Normal file, prompt-contract, route-integrity and quality checks still run.
    const fallbackTitles = deterministicFallbackSiteMapTitles(prompt, explicitPagesForReconciliation);
    if (fallbackTitles.length > pageLimit) {
      throw accountingError(Object.assign(new Error('The brief requires ' + fallbackTitles.length + ' pages, but the configured page ceiling is ' + pageLimit + '. No requested pages were silently dropped.'), { status: 413, code: 'WEBSTUDIO_PAGE_LIMIT' }), usage, hasUsage, inputs, outputs);
    }
    const fallbackRaw = {
      architecture: 'Deterministic sitemap recovery from the original user brief after an invalid model plan.',
      pages: fallbackTitles.map(title => ({
        title,
        goal: /^home(?:page)?$/i.test(title)
          ? 'Main landing page; orient visitors and link to every requested route.'
          : /property\s+listings?/i.test(title)
            ? 'Present only feed-backed inventory or clearly labelled illustrative listings; never invent live property facts.'
            : 'Fulfil the page purpose requested in the original brief without inventing business facts or integration status.',
      })),
      sharedFiles: [
        { path: 'src/styles.css', purpose: 'Shared responsive styles and reusable components.' },
        { path: 'src/main.js', purpose: 'Shared navigation and interactive behavior.' },
      ],
      foundationPaths: ['src/pages/Home.html', 'src/styles.css', 'src/main.js'],
    };
    normalized = makeSiteMap(fallbackRaw, pageLimit);
    siteMap = normalized.siteMap;
    if (!siteMap || !siteMap.pages.length || normalized.overflow > 0) {
      throw accountingError(Object.assign(new Error('OVYX could not safely recover the requested page plan. No project files were changed; retry after simplifying the page list.'), { status: 502, code: 'WEBSTUDIO_SITEMAP_INVALID' }), usage, hasUsage, inputs, outputs);
    }
    plan = { summary: 'Recovered the sitemap deterministically from the original brief after an invalid model planning response.', siteMap: fallbackRaw };
    siteMapRecovery = 'deterministic-fallback-after-invalid-model-plan';
  }
  // Recover omitted requested routes deterministically instead of silently accepting
  // a sitemap that dropped an explicitly named page.
  const pageKey = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const plannedPageKeys = new Set(siteMap.pages.map(page => pageKey(page.title)));
  for (const title of explicitPagesForReconciliation) {
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

  // Cloudflare free-only inference is capped at a bounded response size.
  // Keep each generation response to one required file. The free-only inference
  // path has a strict output-token cap, and even two complete files can produce
  // truncated JSON. Shared CSS/JS and every page are generated in separate calls.
  const batches = splitBatchesForBoundedModelOutput(createSiteBuildBatches(siteMap, fileLimit), 1);
  if (!batches.length) {
    throw accountingError(Object.assign(new Error('OVYX could not turn the page plan into build batches.'), { status: 502, code: 'WEBSTUDIO_BATCH_PLAN_FAILED' }), usage, hasUsage, inputs, outputs);
  }

  let staged = [];
  let sharedAssetPagesRepaired = 0;
  let lastResult = planResult;
  for (const batch of batches) {
    const input = makeBatchPrompt(prompt, plan, siteMap, batch, staged, existingFiles, extraContext, promptContract, env?.OVYX_WEBSTUDIO_EXPLICIT_PAGE_MANIFEST_ONLY === 'true');
    inputs.push(input);
    let result;
    try {
      result = await callModel(env, {
        provider, model, authUser, preferredProvider, providerRouting, fallback, taskPrompt: prompt,
        system: [
          String(options.qualityContract || '').trim(),
          'You are OVYX Web Studio, a senior frontend engineer and UX architect. Follow the exact response contract specified for this single-file batch.',
          batch.targetPaths.length === 1 && /\.css$/i.test(String(batch.targetPaths[0] || ''))
            ? 'CSS-ONLY RESPONSE OVERRIDE: return only complete raw CSS source for src/styles.css. Do not wrap CSS in JSON, Markdown fences, or prose. All braces must be balanced.'
            : batch.targetPaths.length === 1 && /\.(?:js|mjs)$/i.test(String(batch.targetPaths[0] || ''))
              ? 'JAVASCRIPT-ONLY RESPONSE OVERRIDE: return only complete raw JavaScript source for the exact approved src/main.js target. Do not wrap it in JSON, Markdown fences, or prose.'
              : 'SINGLE-FILE JSON CONTRACT: return strict JSON with a files array containing exactly one object for the exact target path in REQUIRED TARGET FILES JSON. Do not return any unrequested file or substitute Home.html for a CSS or JavaScript target.',
          env?.OVYX_WEBSTUDIO_EXPLICIT_PAGE_MANIFEST_ONLY === 'true' && /\.html?$/i.test(String(batch.targetPaths[0] || ''))
            ? 'STAGE 4 SMOKE: keep this one HTML file at or below 2,800 characters, use only the approved shared CSS and JS, avoid inline code and long content, and output fully closed valid HTML inside the required JSON envelope.'
            : '',
        ].filter(Boolean).join('\n\n'),
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

    const rawBatchText = String(result && result.text || '');
    const parsedBatchOutput = parseJSON(rawBatchText);
    const rawGenerated = outputFiles(parsedBatchOutput);
    const allowed = new Set(batch.allowedPaths);
    // Models sometimes include helpful shared CSS/JS or another page even when
    // this bounded batch requests one file. Never stage those extras: keep only
    // exact allowlisted targets, then verify every required target below.
    // This is safer and more robust than failing a valid target because the model
    // mentioned an unrequested file; unapproved paths are discarded, never written.
    let generated = Object.fromEntries(
      Object.entries(rawGenerated).filter(([path]) => allowed.has(path))
    );
    if (!Object.keys(generated).length && batch.targetPaths.length === 1) {
      const recoveredContent = recoverSingleFileContent(rawBatchText, batch.targetPaths[0], parsedBatchOutput);
      if (typeof recoveredContent === 'string' && recoveredContent.trim()) {
        generated = { [batch.targetPaths[0]]: recoveredContent };
      }
    }
    const paths = Object.keys(generated);
    if (!paths.length) {
      const outputDiagnostics = batchOutputShapeDiagnostics(rawBatchText, parsedBatchOutput, generated, batch);
      throw accountingError(Object.assign(new Error('Web Studio batch ' + batch.index + ' returned no usable contents for its approved target. The site was not marked complete.'), {
        status: 502,
        code: 'WEBSTUDIO_BATCH_EMPTY',
        outputDiagnostics,
      }), usage, hasUsage, inputs, outputs);
    }
    if (paths.length > batch.maxChangedFiles) throw accountingError(Object.assign(new Error('Web Studio batch ' + batch.index + ' exceeded its approved target limit after filtering. Retry the build.'), { status: 502, code: 'WEBSTUDIO_BATCH_FILE_LIMIT' }), usage, hasUsage, inputs, outputs);
    for (const path of paths) {
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

  const initialAssetNormalization = normalizeSharedAssetReferences(staged, siteMap);
  staged = initialAssetNormalization.staged;
  sharedAssetPagesRepaired += initialAssetNormalization.repairedPages;

  let stage4SmokeQaFormAttributesRepaired = false;
  let stage4SmokeQaFormBehaviorRepaired = false;
  if (env.OVYX_WEBSTUDIO_EXPLICIT_PAGE_MANIFEST_ONLY === 'true') {
    const qaFormRepair = repairStage4SmokeQaFormAttributes(staged, siteMap, true);
    staged = qaFormRepair.staged;
    stage4SmokeQaFormAttributesRepaired = qaFormRepair.repaired;
    const qaBehaviorRepair = repairStage4SmokeQaFormBehavior(staged, siteMap, true);
    staged = qaBehaviorRepair.staged;
    stage4SmokeQaFormBehaviorRepaired = qaBehaviorRepair.repaired;
  }

  // Validate the first complete version before the optional polish pass. A failed
  // polish must never overwrite this baseline or turn a valid build into a failure.
  let checks = validateStagedSite(staged, prompt, siteMap, explicitPagesForReconciliation, strictBrowserRuntime);
  if (checks.validation.length) {
    throw accountingError(Object.assign(new Error('Generated website failed structural validation: ' + checks.validation.slice(0, 8).join(' | ')), { status: 422, code: 'WEBSTUDIO_SITE_VALIDATION_FAILED', validationIssues: checks.validation.slice(0, 16), requirementVerification: checks.requirementVerification }), usage, hasUsage, inputs, outputs);
  }
  let requirementRepair = {
    status: checks.requirementVerification.ok ? 'not-needed' : 'pending',
    issuesBefore: checks.requirementVerification.issues,
    issuesAfter: checks.requirementVerification.issues,
    filesConsidered: 0,
    filesUpdated: 0,
    integrityAuditIsStaticOnly: true,
  };

  if (!checks.requirementVerification.ok) {
    const initialChecks = checks;
    const repairEnabled = String(env && env.OVYX_WEBSTUDIO_REQUIREMENT_REPAIR_ENABLED || 'true').trim().toLowerCase() !== 'false';
    const repairLimit = Math.max(1, Math.min(8, cap(env, 'OVYX_WEBSTUDIO_REQUIREMENT_REPAIR_MAX_FILES', 6)));
    const repairFileChars = Math.max(1000, Math.min(45000, cap(env, 'OVYX_WEBSTUDIO_REQUIREMENT_REPAIR_MAX_FILE_CHARS', 28000)));
    const repairContextChars = Math.max(10000, Math.min(100000, cap(env, 'OVYX_WEBSTUDIO_REQUIREMENT_REPAIR_MAX_CONTEXT_CHARS', 60000)));

    if (!repairEnabled) {
      requirementRepair.status = 'disabled';
    } else {
      const preferredPaths = selectRequirementRepairPaths(staged, initialChecks.requirementVerification);
      const repairTargets = selectBoundedPolishTargets(
        staged, siteMap, repairLimit, repairFileChars, repairContextChars,
        preferredPaths,
      );
      requirementRepair.filesConsidered = repairTargets.length;

      if (!repairTargets.length) {
        requirementRepair.status = 'no-safe-targets';
      } else {
        const repairInput = makeRequirementRepairPrompt(
          prompt, plan, siteMap, repairTargets, extraContext, promptContract,
          initialChecks.requirementVerification, initialChecks.integrity,
        );
        inputs.push(repairInput);
        try {
          const repairResult = await callModel(env, {
            provider,
            model,
            authUser,
            preferredProvider,
            providerRouting,
            fallback,
            taskPrompt: prompt,
            system: [
              String(options.qualityContract || '').trim(),
              'You are OVYX Web Studio, a senior frontend engineer repairing only the explicit requirement failures reported by deterministic checks. Return strict JSON and change only approved files.',
            ].filter(Boolean).join('\n\n'),
            user: repairInput,
            maxTokens: Math.max(1000, Math.min(18000, cap(env, 'OVYX_WEBSTUDIO_REQUIREMENT_REPAIR_TOKENS', 12000))),
          });
          outputs.push(String(repairResult && repairResult.text || ''));
          const repairUsage = usageAdd(usage, repairResult && repairResult.rawUsage);
          usage = repairUsage.total;
          hasUsage = hasUsage || repairUsage.found;

          const repairedFiles = outputFiles(parseJSON(repairResult && repairResult.text));
          const repairedPaths = Object.keys(repairedFiles);
          const allowedRepairPaths = new Set(repairTargets.map(item => item.path));
          const invalidRepair = !repairedPaths.length ||
            repairedPaths.length > repairTargets.length ||
            repairedPaths.some(path => !allowedRepairPaths.has(path) ||
              !String(repairedFiles[path]).trim() ||
              String(repairedFiles[path]).length > 120000);

          if (invalidRepair) {
            requirementRepair.status = 'rejected';
          } else {
            const baselineByPath = new Map(staged.map(item => [item.path, item.content]));
            const candidate = mergeStagedChanges(staged, repairedPaths.map(path => ({
              path,
              action: existingFiles[path] || staged.some(item => item.path === path) ? 'update' : 'create',
              content: repairedFiles[path],
            })));
            const normalizedRepair = normalizeSharedAssetReferences(candidate, siteMap);
            const normalizedCandidate = normalizedRepair.staged;
            sharedAssetPagesRepaired += normalizedRepair.repairedPages;
            const candidateChecks = validateStagedSite(normalizedCandidate, prompt, siteMap, explicitPagesForReconciliation, strictBrowserRuntime);
            const changedPaths = repairedPaths.filter(path => String(repairedFiles[path]) !== String(baselineByPath.get(path) || ''));

            if (!changedPaths.length) {
              requirementRepair.status = 'unchanged';
            } else if (
              candidateChecks.validation.length ||
              !candidateChecks.requirementVerification.ok ||
              hasNewIntegrityFindings(initialChecks.integrity, candidateChecks.integrity)
            ) {
              requirementRepair.status = 'rejected';
            } else {
              staged = normalizedCandidate;
              checks = candidateChecks;
              requirementRepair.status = 'applied';
              requirementRepair.filesUpdated = changedPaths.length;
              requirementRepair.issuesAfter = candidateChecks.requirementVerification.issues;
              requirementRepair.integrityBefore = initialChecks.integrity.totalFindings;
              requirementRepair.integrityAfter = candidateChecks.integrity.totalFindings;
            }
          }
        } catch (repairError) {
          if (repairError && repairError.partialUsage) {
            const partial = usageAdd(usage, repairError.partialUsage);
            usage = partial.total;
            hasUsage = hasUsage || partial.found;
          }
          requirementRepair.status = 'failed';
        }
      }
    }

    if (!checks.requirementVerification.ok) {
      requirementRepair.issuesAfter = checks.requirementVerification.issues;
      throw accountingError(Object.assign(new Error(
        'Web Studio could not verify all explicit requirements after one bounded repair attempt (' +
        requirementRepair.status + '): ' +
        checks.requirementVerification.issues.map(issue => issue.message).join(' | ') +
        '. The site was not marked complete.',
      ), {
        status: 422,
        code: 'WEBSTUDIO_PROMPT_REQUIREMENT_MISSING',
        requirementVerification: checks.requirementVerification,
        requirementRepair,
      }), usage, hasUsage, inputs, outputs);
    }
  }

  const baselineStaged = staged.map(item => ({ ...item }));
  const polishLimit = Math.max(1, Math.min(8, cap(env, 'OVYX_WEBSTUDIO_POLISH_MAX_FILES', 6)));
  const maxPolishFileChars = Math.max(1000, Math.min(45000, cap(env, 'OVYX_WEBSTUDIO_POLISH_MAX_FILE_CHARS', 28000)));
  const maxPolishContextChars = Math.max(10000, Math.min(100000, cap(env, 'OVYX_WEBSTUDIO_POLISH_MAX_CONTEXT_CHARS', 80000)));
  const integrityBefore = checks.integrity;
  const integrityPreferredPaths = integrityBefore.findings.map(item => item.file);
  const polishTargets = selectBoundedPolishTargets(
    staged, siteMap, polishLimit, maxPolishFileChars, maxPolishContextChars,
    integrityPreferredPaths,
  );
  let qualityPolish = {
    status: 'skipped',
    filesConsidered: polishTargets.length,
    filesUpdated: 0,
    integrityBefore: integrityBefore.totalFindings,
    integrityAfter: integrityBefore.totalFindings,
    integrityFindings: integrityBefore.findings,
    integrityAuditIsStaticOnly: true,
  };
  const polishEnabled = String(env && env.OVYX_WEBSTUDIO_POLISH_ENABLED || 'true').trim().toLowerCase() !== 'false';

  if (polishEnabled && polishTargets.length) {
    const polishInput = makePolishPrompt(prompt, plan, siteMap, polishTargets, extraContext, promptContract, integrityBefore);
    inputs.push(polishInput);
    try {
      const polishResult = await callModel(env, {
        provider,
        model,
        authUser,
        preferredProvider,
        providerRouting,
        fallback,
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
        let candidate = mergeStagedChanges(baselineStaged, polishedPaths.map(path => ({
          path,
          action: existingFiles[path] || baselineStaged.some(item => item.path === path) ? 'update' : 'create',
          content: polishedFiles[path],
        })));
        const normalizedPolish = normalizeSharedAssetReferences(candidate, siteMap);
        candidate = normalizedPolish.staged;
        sharedAssetPagesRepaired += normalizedPolish.repairedPages;
        const candidateChecks = validateStagedSite(candidate, prompt, siteMap, explicitPagesForReconciliation, strictBrowserRuntime);
        const changedPaths = polishedPaths.filter(path => String(polishedFiles[path]) !== String(baselineByPath.get(path) || ''));
        if (!changedPaths.length) {
          qualityPolish.status = 'unchanged';
        } else if (
          candidateChecks.validation.length ||
          !candidateChecks.requirementVerification.ok ||
          hasNewIntegrityFindings(integrityBefore, candidateChecks.integrity)
        ) {
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
  qualityPolish.integrityAfter = checks.integrity.totalFindings;
  qualityPolish.integrityFindings = checks.integrity.findings;
  qualityPolish.integritySummary = checks.integrity.summary;

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
  const integrityNote = qualityPolish.integrityAfter > 0
    ? ' Static review still reports ' + qualityPolish.integrityAfter + ' link or local-asset finding(s); review these before publishing. External resources and live integrations were not verified by this static audit.'
    : ' Static route, fragment, and local-asset checks found no unresolved references. External resource availability and live integrations were not verified by this static audit.';
  const repairNote = requirementRepair.status === 'applied'
    ? ' One bounded requirement-repair pass was applied and passed the same structural, prompt-contract, and no-new-integrity-defect checks.'
    : '';
  const sitemapRecoveryNote = siteMapRecovery
    ? ' The model sitemap was invalid, so OVYX recovered the requested page structure from your original brief and then ran the usual file, requirement and route checks.'
    : '';
  const summary = 'Built ' + pageCount + ' distinct website pages in ' + batches.length + ' verified batches.' + sitemapRecoveryNote + repairNote + polishNote + integrityNote;
  const message = 'Your multi-page website is ready in Web Studio. ' + pageCount + ' pages were generated and structurally checked.' + sitemapRecoveryNote + repairNote + polishNote + integrityNote;
  return {
    ok: true,
    text: JSON.stringify({ summary, message }),
    message,
    summary,
    files: outputFilesByPath,
    requirementVerification,
    requirementRepair,
    qualityPolish,
    project: updatedProject,
    siteMap,
    siteMapRecovery,
    provider: (lastResult && lastResult.provider) || (planResult && planResult.provider),
    model: (lastResult && lastResult.model) || (planResult && planResult.model),
    requestedProvider: (lastResult && lastResult.requestedProvider) || (planResult && planResult.requestedProvider) || provider,
    routedProvider: (lastResult && lastResult.routedProvider) || (planResult && planResult.routedProvider) || provider,
    rawUsage,
    quotaInputText: inputs.join('\n\n'),
    quotaOutputText: outputs.join('\n\n'),
    totalPages: pageCount,
    batchCount: batches.length,
    sharedAssetPagesRepaired,
    stage4SmokeQaFormAttributesRepaired,
    stage4SmokeQaFormBehaviorRepaired,
  };
}


const RETRYABLE_WEBSTUDIO_OUTPUT_FAILURES = new Set([
  'WEBSTUDIO_SITEMAP_INVALID',
  'WEBSTUDIO_SITEMAP_INCOMPLETE',
  'WEBSTUDIO_BATCH_PLAN_FAILED',
  'WEBSTUDIO_BATCH_EMPTY',
  'WEBSTUDIO_BATCH_FILE_LIMIT',
  'WEBSTUDIO_PATH_NOT_ALLOWED',
  'WEBSTUDIO_EMPTY_FILE',
  'WEBSTUDIO_BATCH_MISSING_FILES',
  'WEBSTUDIO_SITE_VALIDATION_FAILED',
  'WEBSTUDIO_PROMPT_REQUIREMENT_MISSING',
]);

function combineUsageRecords(...records) {
  let usage = {};
  let found = false;
  for (const record of records) {
    if (!record || typeof record !== 'object') continue;
    const next = usageAdd(usage, record);
    usage = next.total;
    found = found || next.found;
  }
  if (!found) return null;
  return {
    prompt_tokens: usage.prompt_tokens || 0,
    completion_tokens: usage.completion_tokens || 0,
    total_tokens: usage.total_tokens === undefined
      ? ((usage.prompt_tokens || 0) + (usage.completion_tokens || 0))
      : usage.total_tokens,
  };
}

export async function buildStudioMultiPage(options = {}) {
  try {
    return await buildStudioMultiPageOnce(options);
  } catch (firstError) {
    const failureCode = String(firstError?.code || '').toUpperCase();
    if (
      options?._ovyxGenerationRecoveryAttempt === 1 ||
      !RETRYABLE_WEBSTUDIO_OUTPUT_FAILURES.has(failureCode)
    ) {
      throw firstError;
    }

    const validationIssues = (Array.isArray(firstError?.validationIssues) ? firstError.validationIssues : [])
      .map(issue => String(issue || '').trim()).filter(Boolean).slice(0, 16);
    const requirementIssues = (firstError?.requirementVerification?.issues || [])
      .map(issue => String(issue?.message || '').trim())
      .filter(Boolean)
      .slice(0, 12);
    const stage4SmokeRecovery = options?.env?.OVYX_WEBSTUDIO_EXPLICIT_PAGE_MANIFEST_ONLY === 'true' &&
      failureCode === 'WEBSTUDIO_BATCH_EMPTY'
      ? 'STAGE 4 SMOKE RECOVERY: the previous single-file HTML response could not be extracted, most likely because the JSON-wrapped document was too long or truncated. On this one bounded smoke only, keep the requested HTML page under 2,800 characters, use the existing shared stylesheet and script instead of inline code, simplify decorative content, keep all required controls functional, and explicitly close body and html. Return exactly one complete target file in valid JSON. Do not weaken any validators.'
      : '';
    const recoveryInstruction = [
      'BOUNDED WEBSITE-GENERATION RECOVERY: the previous model output failed a deterministic build or quality check.',
      'Retry the full build once. Preserve the complete original user brief and every explicitly requested page, feature, language, market and interaction.',
      'Return strict valid JSON for every phase, generate every required file, and ensure the output satisfies the existing structural and prompt-requirement checks.',
      'Every HTML page under src/pages must load each supplied shared src/styles.css and src/main.js using correct local relative paths such as ../styles.css and ../main.js. Do not use placeholder links or omit shared assets.',
      stage4SmokeRecovery,
      validationIssues.length ? 'STRICT GENERATED BROWSER VALIDATION ERRORS (fix all before returning files): ' + validationIssues.join(' | ') : '',
      requirementIssues.length ? 'The prior deterministic requirement checks reported: ' + requirementIssues.join(' | ') : '',
    ].filter(Boolean).join('\n\n');

    let recoveryContext;
    if (typeof options.context === 'string') {
      recoveryContext = options.context + '\n\n' + recoveryInstruction;
    } else {
      recoveryContext = JSON.stringify({
        existingContext: options.context && typeof options.context === 'object' ? options.context : {},
        boundedGenerationRecovery: { failureCode, instruction: recoveryInstruction },
      });
    }
    const retryOptions = {
      ...options,
      qualityContract: [String(options.qualityContract || '').trim(), recoveryInstruction]
        .filter(Boolean).join('\n\n'),
      context: recoveryContext,
      _ovyxGenerationRecoveryAttempt: 1,
    };

    try {
      const recovered = await buildStudioMultiPageOnce(retryOptions);
      if (!recovered) throw firstError;
      const combinedUsage = combineUsageRecords(firstError?.partialUsage, recovered.rawUsage);
      return {
        ...recovered,
        ...(combinedUsage ? { rawUsage: combinedUsage } : {}),
        generationRecovery: {
          status: 'recovered-after-one-bounded-retry',
          firstFailureCode: failureCode,
        },
      };
    } catch (retryError) {
      const combinedPartialUsage = combineUsageRecords(firstError?.partialUsage, retryError?.partialUsage);
      if (combinedPartialUsage) retryError.partialUsage = combinedPartialUsage;
      retryError.generationRecovery = {
        status: 'retry-failed',
        firstFailureCode: failureCode,
      };
      throw retryError;
    }
  }
}
