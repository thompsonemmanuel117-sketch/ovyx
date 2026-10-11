import assert from 'node:assert/strict';
import {
  normalizeSiteMap,
  createSiteBuildBatches,
  mergeStagedChanges,
  buildSiteBatchContext,
  selectSitePolishChanges,
} from '../functions/_lib/multi-page.js';

const pages = Array.from({ length: 20 }, (_, index) => ({
  title: index === 0 ? 'Home' : 'Page ' + (index + 1),
  path: index === 0 ? 'index.html' : 'page-' + (index + 1) + '/index.html',
  url: index === 0 ? '/' : '/page-' + (index + 1) + '/',
  goal: 'Purpose for page ' + (index + 1),
}));

const normalized = normalizeSiteMap({
  architecture: 'Static HTML pages with shared assets',
  pages,
  sharedFiles: [
    { path: 'assets/site.css', purpose: 'Global visual system' },
    { path: 'assets/site.js', purpose: 'Navigation and interactions' },
  ],
  foundationPaths: ['assets/site.css', 'assets/site.js', 'index.html'],
});
assert.equal(normalized.overflow, 0);
assert.equal(normalized.siteMap.pages.length, 20);
assert.equal(normalized.siteMap.pages[0].url, '/');
assert.equal(normalized.siteMap.pages[1].url, '/page-2/');
assert.equal(normalizeSiteMap({ pages: [{ path: 'about.html', url: '/about/' }, { path: 'contact/index.html', url: '/contact' }] }).siteMap.pages[0].url, '/about.html', 'Static HTML URLs must match the actual output path.');
assert.equal(normalizeSiteMap({ pages: [{ path: 'src/pages/about.astro', url: '/wrong/' }, { path: 'src/pages/contact.astro', url: '/also-wrong/' }] }).siteMap.pages[0].url, '/about', 'Framework page URLs should follow native file routes.');

const batches = createSiteBuildBatches(normalized.siteMap, 6);
assert(batches.length > 1, 'A 20-page site must split into multiple file-sized batches.');
assert.equal(batches[0].kind, 'foundation');
assert(batches.every(batch => batch.targetPaths.length <= 6));
assert(batches.every(batch => batch.maxAdditionalChanges + batch.targetPaths.length <= 6));
assert.deepEqual(
  batches.flatMap(batch => batch.targetPages.map(page => page.path)).sort(),
  pages.map(page => page.path).sort(),
  'Every planned page must be assigned to exactly one required build batch.',
);
assert(batches.slice(1).every(batch => batch.targetPaths.length <= 3));

const initial = [
  { path: 'index.html', action: 'create', content: '<html>first</html>' },
  { path: 'assets/site.css', action: 'create', content: 'body { color: black; }' },
];
const merged = mergeStagedChanges(initial, [
  { path: 'index.html', action: 'create', content: '<html>updated</html>' },
  { path: 'assets/site.css', action: 'update', content: 'body { color: navy; }' },
  { path: 'pages/new/index.html', action: 'create', content: '<html>new</html>' },
]);
assert.equal(merged.find(item => item.path === 'index.html').action, 'create');
assert.equal(merged.find(item => item.path === 'index.html').content, '<html>updated</html>');
assert.equal(merged.find(item => item.path === 'assets/site.css').action, 'create');
assert.equal(merged.find(item => item.path === 'assets/site.css').content, 'body { color: navy; }');
assert.equal(merged.length, 3);

const context = buildSiteBatchContext({
  baseContext: 'BASE FILES',
  stagedChanges: merged,
  siteMap: normalized.siteMap,
  batch: batches[1],
  maxChars: 40_000,
});
assert(context.includes('FULL WEBSITE ROUTE MANIFEST'));
assert(context.includes('pages/page-20/index.html'));
assert(context.includes('ALREADY GENERATED FILE PATHS'));
assert(context.includes('assets/site.css'));

const polishSelection = selectSitePolishChanges(
  [...pages.map(page => ({ path: page.path, action: 'create', content: '<html />' })), ...normalized.siteMap.sharedFiles.map(file => ({ path: file.path, action: 'create', content: 'body{}' }))],
  normalized.siteMap,
  6,
);
assert.equal(polishSelection.length, 6);
assert.equal(polishSelection[0].path, 'index.html');
assert(polishSelection.some(item => item.path === 'assets/site.css'));
assert(polishSelection.some(item => item.path === 'assets/site.js'));

const overflow = normalizeSiteMap({ pages }, 10);
assert.equal(overflow.overflow, 10, 'Over-limit maps must be reported, not silently treated as complete.');

const invalidPath = normalizeSiteMap({ pages: [{ title: 'bad', path: '../secret.html' }, ...pages] });
assert(!invalidPath.siteMap.pages.some(page => page.path === '../secret.html'));

console.log('Multi-page Web Studio build tests passed.');
