const DEFAULT_PAGE_LIMIT = 250;

function cleanRelativePath(value) {
  const path = String(value || '').trim().replace(/^\/+/, '');
  if (
    !path ||
    path.length > 500 ||
    path.includes('\\') ||
    path.split('/').some(part => part === '.' || part === '..') ||
    /^(?:node_modules|dist|build|coverage|\.git|\.env)(?:\/|$)/i.test(path)
  ) {
    return '';
  }
  return path;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function routeFromPath(path) {
  const normalized = String(path || '').replace(/^\/+/, '').replace(/\\/g, '/');
  if (/^(?:index\.html|src\/app\/page\.[cm]?[jt]sx?|app\/page\.[cm]?[jt]sx?)$/i.test(normalized)) {
    return '/';
  }
  const appPage = normalized.match(/^(?:src\/)?app\/(.*)\/page\.[cm]?[jt]sx?$/i);
  if (appPage) return appPage[1] ? '/' + appPage[1].replace(/\/+$/, '') + '/' : '/';
  const pagesFile = normalized.replace(/^src\/pages\//i, '').replace(/^pages\//i, '');
  if (/\/index\.html$/i.test(pagesFile)) {
    return '/' + pagesFile.replace(/\/index\.html$/i, '').replace(/^\/+|\/+$/g, '') + '/';
  }
  if (/^index\.html$/i.test(pagesFile)) return '/';
  if (/\.(?:html|astro|tsx?|jsx?)$/i.test(pagesFile)) {
    return '/' + pagesFile.replace(/\.(?:astro|tsx?|jsx?)$/i, '');
  }
  return '/' + pagesFile.replace(/\/+$/, '') + '/';
}

export function normalizeSiteMap(raw, maxPages = DEFAULT_PAGE_LIMIT) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.pages)) {
    return { siteMap: null, overflow: 0 };
  }

  const pageLimit = Number.isFinite(Number(maxPages)) && Number(maxPages) > 0
    ? Math.floor(Number(maxPages))
    : DEFAULT_PAGE_LIMIT;
  const overflow = Math.max(0, raw.pages.length - pageLimit);
  const pageInput = raw.pages.slice(0, pageLimit);
  const pages = [];
  const seenPaths = new Set();

  for (const item of pageInput) {
    if (!item || typeof item !== 'object') continue;
    const path = cleanRelativePath(item.path);
    if (!path || seenPaths.has(path)) continue;
    seenPaths.add(path);

    let url = String(item.url || routeFromPath(path)).trim();
    if (/^(?:\/\/|https?:\/\/)/i.test(url)) url = routeFromPath(path);
    if (!url.startsWith('/')) url = '/' + url;
    url = url.replace(/\/{2,}/g, '/');
    if (!url || url.includes('..') || url.includes('\\')) url = routeFromPath(path);

    pages.push({
      title: String(item.title || item.name || path).trim().slice(0, 120),
      path,
      url,
      goal: String(item.goal || item.purpose || item.description || '').trim().slice(0, 500),
    });
  }

  const sharedSeen = new Set();
  const sharedFiles = [];
  for (const item of Array.isArray(raw.sharedFiles) ? raw.sharedFiles : []) {
    const source = typeof item === 'string' ? { path: item } : item;
    const path = cleanRelativePath(source?.path);
    if (!path || sharedSeen.has(path)) continue;
    sharedSeen.add(path);
    sharedFiles.push({
      path,
      purpose: String(source.purpose || source.role || 'Shared styling, navigation, interaction, routing or project configuration').trim().slice(0, 300),
    });
  }

  const pagePaths = new Set(pages.map(page => page.path));
  const declaredFoundation = (Array.isArray(raw.foundationPaths) ? raw.foundationPaths : [])
    .map(cleanRelativePath)
    .filter(path => path && (!pagePaths.has(path) || path === pages[0]?.path));

  const foundationPaths = unique([
    pages[0]?.path,
    ...declaredFoundation,
    ...sharedFiles.map(file => file.path),
  ]).filter(path => !pagePaths.has(path) || path === pages[0]?.path);

  return {
    siteMap: {
      architecture: String(raw.architecture || raw.routingStrategy || 'Project-native page architecture').trim().slice(0, 500),
      pages,
      sharedFiles,
      foundationPaths,
    },
    overflow,
  };
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export function createSiteBuildBatches(siteMap, maxChangedFiles = 6) {
  if (!siteMap || !Array.isArray(siteMap.pages) || siteMap.pages.length < 2) return [];
  const maxChanges = Math.max(2, Math.floor(Number(maxChangedFiles) || 6));
  const pages = siteMap.pages;
  const pageByPath = new Map(pages.map(page => [page.path, page]));
  const sharedFiles = Array.isArray(siteMap.sharedFiles) ? siteMap.sharedFiles : [];
  const sharedPaths = unique(sharedFiles.map(file => file.path));
  const homepagePath = pages[0].path;
  const foundationPaths = unique([
    homepagePath,
    ...(Array.isArray(siteMap.foundationPaths) ? siteMap.foundationPaths : []),
    ...sharedPaths,
  ]).filter(path => !pageByPath.has(path) || path === homepagePath);

  const batches = [];
  const foundationChunks = chunk(foundationPaths, maxChanges);
  for (const paths of foundationChunks) {
    batches.push({
      kind: 'foundation',
      targetPaths: paths,
      targetPages: paths.map(path => pageByPath.get(path)).filter(Boolean),
      targetFiles: paths.map(path => {
        const shared = sharedFiles.find(file => file.path === path);
        return {
          path,
          kind: pageByPath.has(path) ? 'page' : 'shared',
          title: pageByPath.get(path)?.title || path,
          goal: pageByPath.get(path)?.goal || shared?.purpose || 'Create the shared foundation required by the website.',
        };
      }),
    });
  }

  const foundationPagePaths = new Set(foundationPaths.filter(path => pageByPath.has(path)));
  const remainingPages = pages.filter(page => !foundationPagePaths.has(page.path));
  const pageBatchSize = Math.max(1, maxChanges - 3);
  for (const pageGroup of chunk(remainingPages, pageBatchSize)) {
    batches.push({
      kind: 'pages',
      targetPaths: pageGroup.map(page => page.path),
      targetPages: pageGroup,
      targetFiles: pageGroup.map(page => ({
        path: page.path,
        kind: 'page',
        title: page.title,
        goal: page.goal,
      })),
    });
  }

  return batches.map((batch, index) => ({
    ...batch,
    index: index + 1,
    total: batches.length,
    maxChangedFiles: maxChanges,
    maxAdditionalChanges: Math.max(0, maxChanges - batch.targetPaths.length),
    allowedPaths: unique([...batch.targetPaths, ...sharedPaths]),
    allSharedPaths: sharedPaths,
  }));
}

export function mergeStagedChanges(existingChanges = [], incomingChanges = []) {
  const staged = new Map(
    (Array.isArray(existingChanges) ? existingChanges : []).map(item => [item.path, item]),
  );

  for (const item of Array.isArray(incomingChanges) ? incomingChanges : []) {
    if (!item?.path) continue;
    if (item.removeStagedCreate) {
      staged.delete(item.path);
      continue;
    }

    const previous = staged.get(item.path);
    if (!previous) {
      staged.set(item.path, item);
      continue;
    }

    const action = previous.action === 'create'
      ? 'create'
      : (item.action || previous.action);

    staged.set(item.path, {
      ...previous,
      ...item,
      action,
      previousSha: previous.previousSha || item.previousSha,
    });
  }

  return [...staged.values()].map(({ removeStagedCreate, ...item }) => item);
}

export function buildSiteBatchContext({
  baseContext = '',
  stagedChanges = [],
  siteMap,
  batch,
  maxChars = 160_000,
}) {
  const limit = Math.max(20_000, Math.floor(Number(maxChars) || 160_000));
  const baseLimit = Math.floor(limit * 0.52);
  const base = String(baseContext || '');
  const baseSlice = base.length > baseLimit
    ? base.slice(0, baseLimit) + '\n/* Base repository context shortened to leave room for multi-page staged files. */'
    : base;

  const pages = Array.isArray(siteMap?.pages) ? siteMap.pages : [];
  const sitemapText = JSON.stringify({
    architecture: siteMap?.architecture || '',
    pages: pages.map(page => ({ title: page.title, path: page.path, url: page.url, goal: page.goal })),
    sharedFiles: (siteMap?.sharedFiles || []).map(file => ({ path: file.path, purpose: file.purpose })),
  });
  const staged = Array.isArray(stagedChanges) ? stagedChanges.filter(item => item && item.action !== 'delete' && typeof item.content === 'string') : [];
  const stagedPaths = unique(staged.map(item => item.path));

  const sharedPaths = new Set((siteMap?.sharedFiles || []).map(file => file.path));
  const homepagePath = pages[0]?.path;
  const targetPaths = new Set(batch?.targetPaths || []);
  const recentPaths = staged.filter(item => !sharedPaths.has(item.path)).slice(-2).map(item => item.path);
  const priorityPaths = unique([
    ...stagedPaths.filter(path => sharedPaths.has(path)),
    homepagePath,
    ...stagedPaths.filter(path => targetPaths.has(path)),
    ...recentPaths,
  ]);
  const byPath = new Map(staged.map(item => [item.path, item]));
  const remaining = staged.filter(item => !priorityPaths.includes(item.path));
  const chosen = [
    ...priorityPaths.map(path => byPath.get(path)).filter(Boolean),
    ...remaining,
  ];

  const reservedChars = Math.min(30_000, Math.floor(limit * 0.24));
  const stagedBudget = Math.max(4_000, limit - baseSlice.length - sitemapText.length - reservedChars);
  const stagedParts = [];
  let used = 0;
  for (const item of chosen) {
    if (used >= stagedBudget) break;
    const available = Math.min(16_000, stagedBudget - used);
    if (available < 800) break;
    const content = String(item.content);
    const slice = content.length > available
      ? content.slice(0, Math.max(0, available - 100)) + '\n/* Staged file context shortened; full file remains preserved by OVYX. */'
      : content;
    const piece = '\n\nFILE: ' + item.path + ' (' + item.action + ')\n' + slice;
    stagedParts.push(piece);
    used += piece.length;
  }

  const stagedText = stagedParts.join('');
  const alreadyGenerated = stagedPaths.length ? stagedPaths.join('\n') : '(none yet)';
  const batchTargetText = (batch?.targetFiles || [])
    .map(item => '- ' + item.kind + ': ' + item.path + ' — ' + item.title + (item.goal ? ' — ' + item.goal : ''))
    .join('\n');

  return [
    'BASE REPOSITORY CONTEXT (read-only baseline):',
    baseSlice,
    '',
    'FULL WEBSITE ROUTE MANIFEST (keep these paths and URLs consistent):',
    sitemapText,
    '',
    'ALREADY GENERATED FILE PATHS:',
    alreadyGenerated,
    '',
    'CURRENT BATCH TARGETS:',
    batchTargetText || '(No explicit targets)',
    '',
    'STAGED FILE CONTENTS (the latest generated version of these files):',
    stagedText || '(No files have been staged yet)',
  ].join('\n').slice(0, limit);
}

export function selectSitePolishChanges(changes = [], siteMap, limit = 6) {
  const changed = Array.isArray(changes) ? changes : [];
  const byPath = new Map(changed.map(item => [item.path, item]));
  const pages = Array.isArray(siteMap?.pages) ? siteMap.pages : [];
  const shared = Array.isArray(siteMap?.sharedFiles) ? siteMap.sharedFiles : [];
  const preferred = unique([
    pages[0]?.path,
    ...shared.map(file => file.path),
    ...pages.slice(1).map(page => page.path),
  ]);
  const selected = preferred.map(path => byPath.get(path)).filter(Boolean);
  for (const item of changed) {
    if (selected.length >= limit) break;
    if (!selected.some(existing => existing.path === item.path)) selected.push(item);
  }
  return selected.slice(0, Math.max(1, Math.floor(Number(limit) || 6)));
}
