const MAX_FILES = 500;
const MAX_TOTAL_SOURCE_CHARS = 2_000_000;
const MAX_FILE_CHARS = 240_000;
const CODE_EXT = /\\.(?:mjs|cjs|js|jsx|ts|tsx|vue|svelte|astro)$/i;
const SCRIPT_IMPORT = /(?:\\bimport\\s+(?:[^'";]*?\\s+from\\s+)?|\\bexport\\s+[^'";]*?\\s+from\\s+|\\bimport\\s*\\(|\\brequire\\s*\\()\\s*['"]([^'"]+)['"]/g;
const CSS_IMPORT = /@import\\s+(?:url\\()?\\s*['"]?([^'")\\s;]+)['"]?\\s*\\)?/gi;
const CSS_URL = /url\\(\\s*['"]?([^'")]+)['"]?\\s*\\)/gi;
const HTML_REFERENCE = /\\b(?:src|href|action|poster)\\s*=\\s*(['"])(.*?)\\1/gi;
const EXTENSIONS = ['', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.json', '.css', '.scss', '.html', '.vue', '.svelte', '.astro', '/index.js', '/index.ts', '/index.tsx', '/index.jsx'];

function safePath(value) {
  if (typeof value !== 'string') return '';
  const path = value.trim().replace(/\\\\/g, '/').replace(/^\\.\\//, '');
  if (!path || path.length > 500 || path.startsWith('/') || /^[a-z]:/i.test(path) ||
      /[\\u0000-\\u001f\\u007f]/.test(path) ||
      path.split('/').some(part => !part || part === '.' || part === '..' || /^(?:__proto__|prototype|constructor)$/i.test(part)) ||
      /^(?:node_modules|dist|build|coverage|\.git|\.env)(?:\/|$)/i.test(path)) return '';
  return path;
}
function sourceOf(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  for (const key of ['content', 'text', 'source', 'code']) if (typeof value[key] === 'string') return value[key];
  return '';
}
function collectReferences(path, source) {
  const refs = [];
  const add = (raw, kind) => {
    const value = String(raw || '').trim().replace(/[?#].*$/, '');
    if (!value || /^(?:[a-z][a-z0-9+.-]*:|\\/\\/|#|data:|blob:|mailto:|tel:|javascript:)/i.test(value)) return;
    if (value.startsWith('/') || value.startsWith('./') || value.startsWith('../')) refs.push({ specifier: value, kind });
  };
  if (CODE_EXT.test(path)) {
    for (const match of source.matchAll(SCRIPT_IMPORT)) add(match[1], 'module-import');
  }
  if (/\\.css$/i.test(path) || /\\.(?:vue|svelte|astro|html?)$/i.test(path)) {
    for (const match of source.matchAll(CSS_IMPORT)) add(match[1], 'stylesheet-import');
    for (const match of source.matchAll(CSS_URL)) add(match[1], 'asset-url');
  }
  if (/\\.(?:html?|vue|svelte|astro)$/i.test(path)) {
    for (const match of source.matchAll(HTML_REFERENCE)) add(match[2], 'document-reference');
  }
  return refs;
}
function resolveReference(from, specifier, known) {
  const base = specifier.startsWith('/')
    ? specifier.slice(1)
    : from.split('/').slice(0, -1).concat(specifier.split('/')).join('/');
  const parts = [];
  for (const part of base.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') { if (!parts.length) return ''; parts.pop(); }
    else parts.push(part);
  }
  const normalized = safePath(parts.join('/'));
  if (!normalized) return '';
  for (const suffix of EXTENSIONS) {
    const candidate = normalized + suffix;
    if (known.has(candidate)) return candidate;
  }
  return '';
}

/**
 * Builds a bounded, read-only dependency map from an existing project file bag.
 * It records only paths and relationships; source contents never leave this function.
 */
export function buildWebsiteFileGraph(input, options = {}) {
  const bag = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const maxFiles = Math.max(1, Math.min(MAX_FILES, Number(options.maxFiles) || MAX_FILES));
  const maxTotal = Math.max(10_000, Math.min(MAX_TOTAL_SOURCE_CHARS, Number(options.maxTotalSourceChars) || MAX_TOTAL_SOURCE_CHARS));
  const files = new Map();
  let totalChars = 0;
  let truncated = false;
  for (const [rawPath, value] of Object.entries(bag)) {
    const path = safePath(rawPath);
    const source = sourceOf(value);
    if (!path || !source || source.length > MAX_FILE_CHARS) continue;
    if (files.size >= maxFiles || totalChars + source.length > maxTotal) { truncated = true; break; }
    files.set(path, source);
    totalChars += source.length;
  }
  const known = new Set(files.keys());
  const edges = [];
  const missingReferences = [];
  const edgeKeys = new Set();
  const reverse = new Map([...known].map(path => [path, new Set()]));
  for (const [from, source] of files) {
    for (const reference of collectReferences(from, source)) {
      const target = resolveReference(from, reference.specifier, known);
      if (!target) {
        missingReferences.push({ from, specifier: reference.specifier, kind: reference.kind });
        continue;
      }
      const key = from + '->' + target + ':' + reference.kind;
      if (edgeKeys.has(key)) continue;
      edgeKeys.add(key);
      edges.push({ id: key, from, to: target, kind: reference.kind });
      reverse.get(target)?.add(from);
    }
  }
  const nodes = [...known].map(path => ({
    path,
    kind: /\\.css$/i.test(path) ? 'style' : /\\.(?:png|jpe?g|gif|webp|avif|svg|woff2?|ttf|otf)$/i.test(path) ? 'asset' :
      /\\.(?:html?)$/i.test(path) ? 'page' : CODE_EXT.test(path) ? 'code' : 'data',
  }));
  return {
    version: 1,
    status: truncated ? 'bounded-partial' : files.size ? 'analyzed' : 'no-project-files',
    nodes,
    edges,
    missingReferences,
    limits: { maxFiles, maxTotalSourceChars: maxTotal, filesAnalyzed: files.size, sourceCharsAnalyzed: totalChars, truncated },
    reverseDependencies: Object.fromEntries([...reverse].map(([path, dependents]) => [path, [...dependents].sort()])),
  };
}

/** Returns direct and transitive dependents that may need review after a file edit. */
export function analyzeWebsiteFileImpact(graph, changedPaths = []) {
  const nodes = new Set((graph?.nodes || []).map(node => node.path));
  const reverse = graph?.reverseDependencies || {};
  const queue = [];
  const changed = [...new Set((Array.isArray(changedPaths) ? changedPaths : [changedPaths]).map(safePath).filter(path => path && nodes.has(path)))];
  const seen = new Set(changed);
  const depth = new Map(changed.map(path => [path, 0]));
  for (const path of changed) queue.push(path);
  while (queue.length) {
    const dependency = queue.shift();
    const nextDepth = (depth.get(dependency) || 0) + 1;
    for (const dependent of Array.isArray(reverse[dependency]) ? reverse[dependency] : []) {
      if (seen.has(dependent)) continue;
      seen.add(dependent);
      depth.set(dependent, nextDepth);
      queue.push(dependent);
    }
  }
  const impacted = [...seen].filter(path => !changed.includes(path)).sort((a,b) => (depth.get(a)||0)-(depth.get(b)||0) || a.localeCompare(b));
  return {
    changedPaths: changed,
    impactedPaths: impacted,
    totalAffected: changed.length + impacted.length,
    maxDependencyDepth: Math.max(0, ...[...depth.values()]),
    requiresBroadReview: impacted.length >= 12 || changed.length >= 5,
    unknownChangedPaths: (Array.isArray(changedPaths) ? changedPaths : [changedPaths]).map(safePath).filter(path => path && !nodes.has(path)),
  };
}
