const MAX_FILES = 500;
const MAX_TOTAL_SOURCE_CHARS = 2_000_000;
const MAX_FILE_CHARS = 240_000;
const CODE_EXT = /\.(?:mjs|cjs|js|jsx|ts|tsx|vue|svelte|astro)$/i;
const SCRIPT_IMPORT = /(?:\bimport\s+(?:[^'";]*?\s+from\s+)?|\bexport\s+[^'";]*?\s+from\s+|\bimport\s*\(|\brequire\s*\()\s*['"]([^'"]+)['"]/g;
const CSS_IMPORT = /@import\s+(?:url\()?\s*['"]?([^'")\s;]+)['"]?\s*\)?/gi;
const CSS_URL = /url\(\s*['"]?([^'")]+)['"]?\s*\)/gi;
const HTML_REFERENCE = /\b(?:src|href|action|poster)\s*=\s*(['"])(.*?)\1/gi;
const HTML_SRCSET = /\bsrcset\s*=\s*(['"])(.*?)\1/gi;
const NEW_URL_REFERENCE = /\bnew\s+URL\s*\(\s*(['"])(.*?)\1\s*,\s*import\.meta\.url\s*\)/g;
const EXTENSIONS = ['', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.json', '.css', '.scss', '.html', '.vue', '.svelte', '.astro', '/index.js', '/index.ts', '/index.tsx', '/index.jsx'];

function safePath(value) {
  if (typeof value !== 'string') return '';
  const path = value.trim().replace(/\\/g, '/').replace(/^\.\//, '');
  if (!path || path.length > 500 || path.startsWith('/') || /^[a-z]:/i.test(path) ||
      /[\u0000-\u001f\u007f]/.test(path) ||
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
    if (kind === 'document-action') return;
    const value = String(raw || '').trim().replace(/[?#].*$/, '');
    if (!value || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#|data:|blob:|mailto:|tel:|javascript:)/i.test(value)) return;
    if (value.startsWith('/') || value.startsWith('./') || value.startsWith('../')) refs.push({ specifier: value, kind });
  };
  if (CODE_EXT.test(path)) {
    for (const match of source.matchAll(SCRIPT_IMPORT)) add(match[1], 'module-import');
    for (const match of source.matchAll(NEW_URL_REFERENCE)) add(match[2], 'module-asset-reference');
  }
  if (/\.css$/i.test(path) || /\.(?:vue|svelte|astro|html?)$/i.test(path)) {
    for (const match of source.matchAll(CSS_IMPORT)) add(match[1], 'stylesheet-import');
    for (const match of source.matchAll(CSS_URL)) add(match[1], 'asset-url');
  }
  if (/\.(?:html?|vue|svelte|astro)$/i.test(path)) {
    for (const match of source.matchAll(HTML_REFERENCE)) {
      const attribute = match[0].slice(0, match[0].indexOf('=')).trim().toLowerCase();
      if (attribute === 'action') continue;
      add(match[2], attribute === 'href' ? 'route-or-document-reference' : 'document-reference');
    }
    for (const match of source.matchAll(HTML_SRCSET)) {
      for (const candidate of match[2].split(',')) {
        const url = candidate.trim().split(/\s+/)[0];
        if (url) add(url, 'responsive-image-reference');
      }
    }
  }
  return refs;
}
function resolveReference(from, specifier, known, kind = '') {
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
  const candidates = EXTENSIONS.map(suffix => normalized + suffix);
  if (kind === 'route-or-document-reference') {
    const route = normalized.replace(/\/$/, '');
    if (!route) {
      candidates.push('index.html', 'pages/index.html', 'src/pages/index.html', 'app/page.tsx', 'app/page.jsx', 'src/app/page.tsx', 'src/app/page.jsx');
    } else if (!/\.[a-z0-9]{1,12}$/i.test(route)) {
      candidates.push(
        route + '.html', route + '/index.html',
        'pages/' + route + '.html', 'pages/' + route + '/index.html',
        'src/pages/' + route + '.html', 'src/pages/' + route + '/index.html',
        'app/' + route + '/page.js', 'app/' + route + '/page.jsx', 'app/' + route + '/page.tsx', 'app/' + route + '/page.ts',
        'src/app/' + route + '/page.js', 'src/app/' + route + '/page.jsx', 'src/app/' + route + '/page.tsx', 'src/app/' + route + '/page.ts',
      );
    }
  }
  for (const candidate of candidates) if (known.has(candidate)) return candidate;
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
  const maxEdges = Math.max(1, Math.min(5_000, Number(options.maxEdges) || 4_000));
  const maxMissing = Math.max(1, Math.min(2_000, Number(options.maxMissingReferences) || 1_000));
  const files = new Map();
  let totalChars = 0;
  let truncated = false;
  for (const [rawPath, value] of Object.entries(bag)) {
    const path = safePath(rawPath);
    const source = sourceOf(value);
    if (!path || !source) continue;
    if (source.length > MAX_FILE_CHARS) { truncated = true; continue; }
    if (files.size >= maxFiles || totalChars + source.length > maxTotal) { truncated = true; break; }
    files.set(path, source);
    totalChars += source.length;
  }
  const known = new Set(files.keys());
  const edges = [];
  const missingReferences = [];
  const edgeKeys = new Set();
  let edgesTruncated = false;
  let missingReferencesTruncated = false;
  const reverse = new Map([...known].map(path => [path, new Set()]));
  for (const [from, source] of files) {
    for (const reference of collectReferences(from, source)) {
      if (edges.length >= maxEdges) { edgesTruncated = true; truncated = true; break; }
      const target = resolveReference(from, reference.specifier, known, reference.kind);
      if (!target) {
        const looksLikeFile = /\.[a-z0-9]{1,12}$/i.test(reference.specifier) || /(?:^|\/)(?:assets?|images?|scripts?|styles?|fonts?)\//i.test(reference.specifier);
        if (reference.kind !== 'document-reference' || looksLikeFile) {
          if (missingReferences.length < maxMissing) missingReferences.push({ from, specifier: reference.specifier, kind: reference.kind });
          else { missingReferencesTruncated = true; truncated = true; }
        }
        continue;
      }
      const key = from + '->' + target + ':' + reference.kind;
      if (edgeKeys.has(key)) continue;
      edgeKeys.add(key);
      edges.push({ id: key, from, to: target, kind: reference.kind });
      reverse.get(target)?.add(from);
    }
    if (edgesTruncated) break;
  }
  const nodes = [...known].map(path => ({
    path,
    kind: /\.css$/i.test(path) ? 'style' : /\.(?:png|jpe?g|gif|webp|avif|svg|woff2?|ttf|otf)$/i.test(path) ? 'asset' :
      /\.(?:html?)$/i.test(path) ? 'page' : CODE_EXT.test(path) ? 'code' : 'data',
  }));
  // Derive a bounded static route-to-component usage map from module dependencies.
  // Include common framework route conventions, while keeping route entrypoints out
  // of the reusable-component candidate list to avoid false "orphan component" flags.
  const routeEntrypoints = [...files.keys()].filter(path =>
    /\.html?$/i.test(path) ||
    /(?:^|\/)pages\/.+\.(?:tsx?|jsx?|vue|svelte|astro)$/i.test(path) ||
    /(?:^|\/)app\/(?:.*\/)?page\.(?:tsx?|jsx?)$/i.test(path) ||
    /(?:^|\/)routes\/(?:.*\/)?\+page\.(?:svelte|tsx?|jsx?)$/i.test(path)
  );
  const routeEntrySet = new Set(routeEntrypoints);
  const componentCandidates = new Map();
  for (const [path, source] of files) {
    if (!CODE_EXT.test(path) || routeEntrySet.has(path)) continue;
    const names = new Set();
    for (const match of source.matchAll(/\bexport\s+(?:default\s+)?(?:async\s+)?(?:function|class)\s+([A-Z][A-Za-z0-9_$]*)/g)) names.add(match[1]);
    for (const match of source.matchAll(/\bexport\s+(?:const|let|var)\s+([A-Z][A-Za-z0-9_$]*)\s*=/g)) names.add(match[1]);
    for (const match of source.matchAll(/\bexport\s*\{([^}]+)\}/g)) {
      for (const entry of match[1].split(',')) {
        const local = entry.trim().split(/\s+as\s+/i)[0].trim();
        if (/^[A-Z][A-Za-z0-9_$]*$/.test(local)) names.add(local);
      }
    }
    if (/\.(?:vue|svelte|astro)$/i.test(path) && /<[a-z][\w:-]*\b/i.test(source)) {
      const base = path.split('/').pop().replace(/\.(?:vue|svelte|astro)$/i, '');
      const inferred = base ? base.charAt(0).toUpperCase() + base.slice(1) : '';
      if (inferred) names.add(inferred);
    }
    if (names.size) componentCandidates.set(path, [...names].sort());
  }
  const outgoing = new Map();
  for (const edge of edges) {
    if (!outgoing.has(edge.from)) outgoing.set(edge.from, []);
    outgoing.get(edge.from).push(edge.to);
  }
  const componentUsage = new Map([...componentCandidates.keys()].map(path => [path, new Set()]));
  const routeComponents = [];
  for (const route of routeEntrypoints) {
    const visited = new Set([route]), queue = [route], used = [];
    while (queue.length) {
      const current = queue.shift();
      for (const next of outgoing.get(current) || []) {
        if (visited.has(next)) continue;
        visited.add(next);
        queue.push(next);
        if (componentCandidates.has(next)) {
          used.push(next);
          componentUsage.get(next)?.add(route);
        }
      }
    }
    routeComponents.push({ route, componentPaths: [...new Set(used)].sort() });
  }
  const componentGraph = {
    status: truncated ? 'bounded-partial' : 'analyzed',
    components: [...componentCandidates].map(([path, exports]) => ({ path, exports, usedByRoutes: [...(componentUsage.get(path) || [])].sort() })),
    routes: routeComponents,
    unreferencedComponents: [...componentCandidates.keys()].filter(path => !componentUsage.get(path)?.size).sort(),
    routeCount: routeComponents.length,
    componentCount: componentCandidates.size,
    evidence: 'static-import-graph; dynamic imports, runtime registries and implicit framework usage may not be visible',
  };
  return {
    version: 1,
    status: truncated ? 'bounded-partial' : files.size ? 'analyzed' : 'no-project-files',
    nodes,
    edges,
    componentGraph,
    missingReferences,
    limits: { maxFiles, maxTotalSourceChars: maxTotal, maxEdges, maxMissingReferences: maxMissing, filesAnalyzed: files.size, sourceCharsAnalyzed: totalChars, edgesTruncated, missingReferencesTruncated, truncated },
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
  const affectedRoutes = (graph?.componentGraph?.routes || []).filter(route => [...changed, ...impacted].some(path => route.componentPaths.includes(path) || route.route === path)).map(route => route.route).sort();
  return {
    changedPaths: changed,
    impactedPaths: impacted,
    affectedRoutes,
    totalAffected: changed.length + impacted.length,
    maxDependencyDepth: Math.max(0, ...[...depth.values()]),
    requiresBroadReview: impacted.length >= 12 || changed.length >= 5,
    unknownChangedPaths: (Array.isArray(changedPaths) ? changedPaths : [changedPaths]).map(safePath).filter(path => path && !nodes.has(path)),
  };
}
