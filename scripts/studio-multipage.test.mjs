import assert from 'node:assert/strict';
import { buildStudioMultiPage } from '../functions/_lib/studio-multipage.js';

const plannedPages = [
  { title: 'Home', goal: 'Explain the restaurant and primary booking path.' },
  { title: 'Menu', goal: 'Browse menu categories and featured dishes.' },
  { title: 'About', goal: 'Tell the restaurant story.' },
  { title: 'Reservations', goal: 'Help visitors reserve a table.' },
  { title: 'Contact', goal: 'Provide contact and location details without inventing an address.' },
];

const calls = [];
const callModel = async (_env, options) => {
  calls.push(options);
  if (String(options.user).includes('WEBSITE ARCHITECTURE PLANNING PHASE')) {
    return {
      text: JSON.stringify({
        summary: 'Restaurant website sitemap',
        siteMap: {
          architecture: 'Five separate selectable pages using a shared visual system.',
          pages: plannedPages,
        },
      }),
      provider: 'gemini',
      model: 'test-model',
      rawUsage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
    };
  }

  const match = String(options.user).match(/REQUIRED TARGET FILES JSON:\n([\s\S]*?)\n\nREQUIRED TARGET PATHS JSON:/);
  assert(match, 'Batch prompt must list its required target files.');
  const targets = JSON.parse(match[1]);
  const files = {};
  for (const target of targets) {
    if (target.path === 'src/styles.css') {
      files[target.path] = '*,*::before,*::after{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;background:#faf7f0;color:#27211b}nav{display:flex;gap:1rem;flex-wrap:wrap;padding:1rem}main{max-width:70rem;margin:auto;padding:2rem}a:focus-visible,button:focus-visible{outline:3px solid #b66b32;outline-offset:3px}';
    } else if (target.path === 'src/main.js') {
      files[target.path] = "document.querySelectorAll('a[href^=\\\"/\\\"]').forEach(function(link){link.setAttribute('aria-label',link.textContent.trim())});";
    } else {
      const title = String(target.title || 'Page');
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const links = plannedPages.map(page => {
        const href = page.title === 'Home' ? '/' : '/' + page.title.toLowerCase() + '/';
        return '<a href="' + href + '">' + page.title + '</a>';
      }).join('');
      files[target.path] = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="' + title + ' page"><title>' + title + ' | Test Restaurant</title><link rel="stylesheet" href="../styles.css"></head><body><nav aria-label="Main navigation">' + links + '</nav><main><h1>' + title + '</h1><p>Purposeful content for the ' + slug + ' page.</p></main><script src="../main.js"></script></body></html>';
    }
  }
  return {
    text: JSON.stringify({ summary: 'Batch complete', files }),
    provider: 'gemini',
    model: 'test-model',
    rawUsage: { prompt_tokens: 19, completion_tokens: 31, total_tokens: 50 },
  };
};

const result = await buildStudioMultiPage({
  env: {},
  callModel,
  provider: 'automatic',
  authUser: { sub: 'test-user' },
  mode: 'build',
  prompt: 'Build a five-page restaurant website with a home page, menu, about, reservations, and contact.',
  project: { id: 'project-1', name: 'Restaurant', description: 'Restaurant site', pages: [{ name: 'Home', sections: [] }], assets: [] },
  files: {
    'src/pages/Home.html': '<!doctype html><html><head><title>Old</title></head><body>Old</body></html>',
    'src/styles.css': 'body{margin:0}',
    'src/main.js': '/* existing */',
  },
  context: { brandProfile: { accent: '#b66b32' } },
});

assert(result, 'A multi-page website build should return a result.');
assert.equal(result.siteMap.pages.length, 5);
assert.equal(result.project.pages.length, 5);
assert.equal(Object.keys(result.files).filter(path => path.startsWith('src/pages/')).length, 5);
assert(result.files['src/pages/Home.html'].includes('<h1>Home</h1>'));
assert(result.files['src/pages/Menu.html'].includes('<h1>Menu</h1>'));
assert(result.files['src/styles.css'].includes('box-sizing:border-box'));
assert(result.files['src/main.js'].includes('aria-label'));
assert.equal(result.totalPages, 5);
assert.equal(result.rawUsage.prompt_tokens, 11 + 19 * 3);
assert.equal(result.rawUsage.completion_tokens, 7 + 31 * 3);
assert.equal(calls.length, 4, 'The five-page site should use one planning call plus three file-sized batches.');
assert(result.summary.includes('5 distinct website pages'));
assert(result.quotaInputText.includes('FULL WEBSITE ROUTE MANIFEST'));
assert(result.quotaOutputText.length > 0);

// A planning model may omit a named route. Web Studio must recover the
// explicit user requirement before generating files, rather than silently ship
// a smaller website.
const omissionModel = async (env, options) => {
  if (String(options.user).includes('WEBSITE ARCHITECTURE PLANNING PHASE')) {
    return {
      text: JSON.stringify({
        summary: 'Incomplete draft sitemap',
        siteMap: {
          architecture: 'Draft missing one explicitly named route.',
          pages: [
            { title: 'Home', goal: 'Introduce the requested website.' },
            { title: 'About', goal: 'Explain the organization.' },
            { title: 'Contact', goal: 'Help visitors get in touch.' },
          ],
        },
      }),
      provider: 'gemini',
      model: 'test-model',
      rawUsage: { prompt_tokens: 5, completion_tokens: 4, total_tokens: 9 },
    };
  }
  return callModel(env, options);
};

const recovered = await buildStudioMultiPage({
  env: {},
  callModel: omissionModel,
  provider: 'automatic',
  authUser: { sub: 'test-user' },
  mode: 'build',
  prompt: 'Build a three-page website with Home, Menu, and Contact pages.',
  project: { id: 'project-recovery', name: 'Test Site', pages: [] },
  files: {},
});
assert(recovered, 'The multi-page pipeline should recover an omitted explicitly requested page.');
assert(recovered.siteMap.pages.some(page => page.title === 'Menu'));
assert(recovered.files['src/pages/Menu.html']?.includes('<h1>Menu</h1>'));
assert(recovered.requirementVerification?.ok, JSON.stringify(recovered.requirementVerification));
assert.equal(recovered.totalPages, 4, 'Web Studio may retain useful supporting pages while restoring all required pages.');

const singlePage = await buildStudioMultiPage({
  env: {},
  callModel: async () => { throw new Error('An explicit landing page should not enter multi-page planning.'); },
  mode: 'build',
  prompt: 'Create a one-page landing page for my newsletter.',
  project: { id: 'p2' },
  files: {},
});
assert.equal(singlePage, null);

console.log('Web Studio multi-page integration tests passed.');
