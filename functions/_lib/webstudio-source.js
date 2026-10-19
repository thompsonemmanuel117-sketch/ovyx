const MAX_SOURCE_FILES = 400;
const MAX_TERMS = 8;
const MAX_MATCHES_PER_TERM = 8;
const MAX_SNIPPET_CHARS = 260;
const CLIENT_FILE_CHAR_LIMIT = 120000;

const SOURCE_TASK = /\b(?:search|find|locate|look\s+for|inspect|review|examine|audit|trace|where\s+is|show\s+me|list\s+(?:the\s+)?files?|read\s+(?:the\s+)?source|check\s+(?:the\s+)?(?:code|source|project|page)|understand\s+(?:the\s+)?(?:code|project|page))\b/i;
const EDIT_TASK = /\b(?:add|change|edit|update|fix|repair|apply|remove|delete|replace|improve|enhance|adjust|modify|restyle|reposition|resize|shrink|enlarge|increase|decrease|align|move|rearrange|polish|optimi[sz]e|implement)\b/i;
const EXPLICIT_NEW_BUILD = /\b(?:build|create|generate|design|develop|launch)\s+(?:(?:me|us)\s+)?(?:(?:a|an|the|brand\s+new|new|complete|full|multi[- ]page|single[- ]page)\s+){0,2}(?:website|web\s+site|site|web\s+app|application|digital\s+product)\b/i;
const EXISTING_REFERENCE = /\b(?:existing|current|already\s+(?:built|made|have)|this\s+(?:project|site|website|page|layout|design|button|menu|section|form|app|component)|that\s+(?:project|site|website|page|layout|design|button|menu|section|form|app|component)|my\s+(?:project|site|website|page|layout|design|app)|selected|above|here|it|the\s+(?:current|existing|same|selected)\s+(?:project|site|website|page|layout|design|app|file|source))\b/i;
const TARGETED_EDIT_OBJECT = /\b(?:the\s+)?(?:colors?|colou?rs?|font|typography|spacing|layout|header|footer|hero|menu|navigation|button|form|section|card|logo|image|background|contrast|padding|margin|mobile\s+menu|page|component|style|stylesheet|file|source|project)\b/i;

const STOP_WORDS = new Set((
  'a an and apply are as at be before build change check create current deeply do edit examine existing fix for from here how i improve inspect into it its locate look make me modify my of on or please project read repair replace review search show site source the their them this those to update use want website what where with work your you user asked add remove delete replace inspect review for this that same current already built applied fix fixing corrected improved smaller larger new page current existing selected files file files code source project website site web app app page pages changes change changed edit edited edits apply applied inspect inspecting review reviewed search searching find found locate locate the'
).split(/\s+/));

function asSourceText(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  for (const key of ['content', 'text', 'source', 'code']) {
    if (typeof value[key] === 'string') return value[key];
  }
  return '';
}

export function hasWebStudioSourceTask(prompt) {
  const text = String(prompt || '').trim();
  if (!text) return false;
  return SOURCE_TASK.test(text) || (EDIT_TASK.test(text) && (EXISTING_REFERENCE.test(text) || TARGETED_EDIT_OBJECT.test(text)));
}

export function isScopedWebStudioEdit(prompt, hasSourceContext = false) {
  const text = String(prompt || '').trim();
  if (!text || !hasSourceContext || !EDIT_TASK.test(text)) return false;
  if (EXISTING_REFERENCE.test(text)) return true;
  // In Web Studio, concise follow-ups like "change the colors" or "fix the menu"
  // act on the current source. Explicit requests to create a new website remain builds.
  if (EXPLICIT_NEW_BUILD.test(text) && !/\b(?:existing|current|this|that|my|already\s+built)\b/i.test(text)) return false;
  return /\b(?:the\s+(?:colors?|colou?rs?|font|typography|spacing|layout|header|footer|hero|menu|navigation|button|form|section|card|logo|image|background|contrast|padding|margin|mobile\s+menu)|colors?|colou?rs?|font|typography|spacing|layout|header|footer|hero|menu|navigation|button|form|section|card|logo|image|background|contrast|padding|margin|mobile\s+menu|the\s+project)\b/i.test(text);
}

function normalizeFiles(files) {
  if (!files || typeof files !== 'object' || Array.isArray(files)) return [];
  return Object.entries(files)
    .filter(([path]) => typeof path === 'string' && path.trim() && !path.includes('\\') && !path.split('/').some(part => part === '..' || part === '.'))
    .map(([path, value]) => ({ path: path.trim(), content: asSourceText(value) }))
    .filter(item => item.content.length > 0)
    .sort((a, b) => a.path.localeCompare(b.path));
}

function extractTerms(prompt) {
  const text = String(prompt || '');
  const terms = [];
  const add = value => {
    const term = String(value || '').trim().replace(/\s+/g, ' ');
    if (term.length < 2 || term.length > 100) return;
    if (!terms.some(existing => existing.toLowerCase() === term.toLowerCase())) terms.push(term);
  };
  for (const match of text.matchAll(/["'“‘]([^"'"”’]{2,100})["'”’]/g)) add(match[1]);
  const words = text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[^\p{L}\p{N}_./-]+/gu, ' ')
    .split(/\s+/)
    .filter(word => word.length >= 3 && !STOP_WORDS.has(word.toLowerCase()));
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    if (!STOP_WORDS.has(word.toLowerCase())) add(word);
    if (i + 1 < words.length && !STOP_WORDS.has(words[i + 1].toLowerCase())) add(word + ' ' + words[i + 1]);
  }
  if (!terms.length && /\b(?:inspect|review|examine|audit)\b/i.test(text)) {
    for (const term of ['TODO', 'FIXME', 'aria-label', 'addEventListener', '@media', 'fetch(']) add(term);
  }
  return terms.slice(0, MAX_TERMS);
}

function cleanSnippet(value) {
  return String(value || '').replace(/\t/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_SNIPPET_CHARS);
}

/**
 * Inspect only source content explicitly supplied by Web Studio. Counts and
 * snippets describe this payload, never files outside it or a claimed full cloud scan.
 */
export function buildWebStudioSourceInspection({ prompt = '', files = null } = {}) {
  if (!hasWebStudioSourceTask(prompt)) return null;
  const allFiles = normalizeFiles(files);
  const selectedFiles = allFiles.slice(0, MAX_SOURCE_FILES);
  const terms = extractTerms(prompt);
  const matches = [];
  const byTerm = [];
  let totalCharacters = 0;
  let sourceMayBeTruncated = allFiles.length > selectedFiles.length;

  for (const file of selectedFiles) {
    totalCharacters += file.content.length;
    if (file.content.length >= CLIENT_FILE_CHAR_LIMIT) sourceMayBeTruncated = true;
  }

  for (const term of terms) {
    const termMatches = [];
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const expression = new RegExp(escaped, 'ig');
    for (const file of selectedFiles) {
      if (termMatches.length >= MAX_MATCHES_PER_TERM) break;
      const pathExpression = new RegExp(escaped, 'i');
      if (pathExpression.test(file.path)) {
        termMatches.push({ query: term, path: file.path, line: 0, matchType: 'path', snippet: cleanSnippet(file.path) });
      }
      const lines = file.content.split(/\r?\n/);
      for (let i = 0; i < lines.length && termMatches.length < MAX_MATCHES_PER_TERM; i += 1) {
        expression.lastIndex = 0;
        const match = expression.exec(lines[i]);
        if (!match) continue;
        const from = Math.max(0, match.index - 90);
        const to = Math.min(lines[i].length, match.index + term.length + 130);
        termMatches.push({ query: term, path: file.path, line: i + 1, matchType: 'content', snippet: cleanSnippet(lines[i].slice(from, to)) });
      }
    }
    byTerm.push({ query: term, count: termMatches.length, matches: termMatches });
    matches.push(...termMatches);
  }

  const fileInventory = selectedFiles.slice(0, 60).map(file => ({
    path: file.path,
    characters: file.content.length,
    lines: file.content.split(/\r?\n/).length,
    kind: /\.html?$/i.test(file.path) ? 'html'
      : /\.css$/i.test(file.path) ? 'css'
        : /\.(?:m?js|cjs|ts|tsx|jsx)$/i.test(file.path) ? 'javascript'
          : /\.json$/i.test(file.path) ? 'json' : 'text',
  }));
  const fileKinds = fileInventory.reduce((counts, file) => {
    counts[file.kind] = (counts[file.kind] || 0) + 1;
    return counts;
  }, {});

  return {
    kind: 'webstudio-source-inspection',
    prompt: String(prompt || '').trim().slice(0, 500),
    source: 'client-supplied-current-project-files',
    filesProvided: allFiles.length,
    filesSearched: selectedFiles.length,
    totalSourceCharacters: totalCharacters,
    fileInventory,
    fileInventoryTruncated: selectedFiles.length > fileInventory.length,
    fileKinds,
    sourceMayBeTruncated,
    terms,
    totalMatchesReported: matches.length,
    matches: matches.slice(0, MAX_TERMS * MAX_MATCHES_PER_TERM),
    byTerm,
    coverageNote: allFiles.length
      ? 'Only non-empty source files supplied with this request were inspected. This is not proof that unsupplied, omitted, or previously truncated saved-project files were searched.'
      : 'No readable source files were supplied with this request; no project source inspection could be completed.',
  };
}
