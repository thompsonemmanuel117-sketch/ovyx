import assert from 'node:assert/strict';
import { buildStudioMultiPage } from '../functions/_lib/studio-multipage.js';
import { auditWebsiteIntegrity } from '../functions/_lib/site-integrity.js';


const integritySiteMap = {
  pages: [
    { title: 'Home', path: 'src/pages/Home.html', url: '/' },
    { title: 'About', path: 'src/pages/About.html', url: '/about/' },
  ],
};
const integrityFiles = {
  'src/pages/Home.html': '<!doctype html><html lang="en"><head><title>Home</title><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="../styles.css"><script src="../main.js"></script></head><body><main><h1>Home</h1><nav><a href="/about/">About</a><a href="/about/#team">Meet the team</a><a href="#features">Features</a><a href="https://example.com/reference">External reference</a><a href="mailto:hello@example.com">Email</a></nav><section id="features"><img src="../assets/mark.svg" srcset="../assets/mark.svg 1x" alt="Brand mark"></section></main></body></html>',
  'src/pages/About.html': '<!doctype html><html lang="en"><head><title>About</title><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="../styles.css"><script src="../main.js"></script></head><body><main><h1>About</h1><section id="team"><h2>Meet the team</h2></section><a href="/">Home</a></main></body></html>',
  'src/styles.css': 'body{background-image:url("./assets/mark.svg")}',
  'src/main.js': 'document.documentElement.dataset.ready = "true";',
  'src/assets/mark.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>',
};
const cleanIntegrity = auditWebsiteIntegrity(integrityFiles, integritySiteMap);
assert.equal(cleanIntegrity.totalFindings, 0, JSON.stringify(cleanIntegrity.findings));
assert.equal(cleanIntegrity.externalResourcesVerified, false);
assert.equal(cleanIntegrity.runtimeBehaviorVerified, false);

const brokenIntegrityFiles = {
  ...integrityFiles,
  'src/pages/Home.html': integrityFiles['src/pages/Home.html']
    .replace('href="/about/"', 'href="/missing-route/"')
    .replace('href="#features"', 'href="#does-not-exist"')
    .replace('href="/about/#team"', 'href="/about/#missing-team"')
    .replace('href="https://example.com/reference"', 'href="#"')
    .replace('src="../assets/mark.svg"', 'src="../assets/missing.svg"')
    .replace('srcset="../assets/mark.svg 1x"', 'srcset="../assets/missing-srcset.svg 1x"'),
  'src/styles.css': 'body{background-image:url("./assets/missing.svg")}',
};
const brokenIntegrity = auditWebsiteIntegrity(brokenIntegrityFiles, integritySiteMap);
for (const code of ['INTERNAL_ROUTE_UNMAPPED', 'ORPHAN_FRAGMENT', 'BROKEN_ROUTE_FRAGMENT', 'PLACEHOLDER_LINK', 'LOCAL_IMG_MISSING', 'LOCAL_SRCSET_ASSET_MISSING', 'LOCAL_CSS_ASSET_MISSING']) {
  assert.ok(brokenIntegrity.findings.some(item => item.code === code), 'Integrity audit should detect ' + code);
}
assert.ok(brokenIntegrity.totalFindings >= 5);
assert.ok(brokenIntegrity.summary.includes('source-level'));

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

  if (String(options.user).includes('BOUNDED WEBSITE POLISH PHASE')) {
    const match = String(options.user).match(/POLISH CURRENT FILE CONTENTS JSON:\n([\s\S]*?)\n\nPOLISH ALLOWLIST JSON:/);
    assert(match, 'Polish prompt must supply complete target files and an explicit allowlist.');
    const files = JSON.parse(match[1]);
    assert.ok(String(options.user).includes('FULL WEBSITE ROUTE MANIFEST JSON'), 'Polish must preserve site-wide route awareness.');
    assert.ok(String(options.user).includes('PROMPT REQUIREMENT CONTRACT JSON'), 'Polish must preserve the original requirements.');
    files['src/styles.css'] = String(files['src/styles.css'] || '').replace('outline-offset:3px', 'outline-offset:4px');
    if (files['src/pages/Contact.html']) {
      files['src/pages/Contact.html'] = files['src/pages/Contact.html'].replace('href="/missing-route/"', 'href="/menu/"');
    }
    assert.ok(String(options.user).includes('INTERNAL_ROUTE_UNMAPPED'), 'The polish prompt must identify the broken route found before polishing.');
    return {
      text: JSON.stringify({ summary: 'Bounded polish complete', files }),
      provider: 'gemini',
      model: 'test-model',
      rawUsage: { prompt_tokens: 5, completion_tokens: 9, total_tokens: 14 },
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
      }).join('') + (title === 'Contact' ? '<a href="/missing-route/">Broken route</a>' : '');
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
  qualityContract: 'OVYX_TEST_WEBSITE_QUALITY_CONTRACT: premium art direction, keyboard accessibility, responsive layouts, real interactions, truthful integrations.',
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
assert.equal(result.rawUsage.prompt_tokens, 11 + 19 * 3 + 5);
assert.equal(result.rawUsage.completion_tokens, 7 + 31 * 3 + 9);
assert.equal(calls.length, 5, 'The five-page site should use one planning call, three file-sized batches, and one bounded polish call.');
assert.equal(result.qualityPolish.status, 'applied');
assert.equal(result.qualityPolish.filesUpdated, 2);
assert.ok(result.files['src/styles.css'].includes('outline-offset:4px'), 'The verified polish result should be applied.');
assert.ok(result.files['src/pages/Contact.html'].includes('href="/menu/"'), 'The integrity-targeted polish should repair the broken internal route.');
assert.equal(result.qualityPolish.integrityBefore, 1, 'The generated baseline should report the unresolved internal route.');
assert.equal(result.qualityPolish.integrityAfter, 0, 'The accepted polish should remove that integrity finding.');
assert.equal(result.qualityPolish.integrityFindings.length, 0);
assert(calls[calls.length - 1].user.includes('POLISH ALLOWLIST JSON'), 'The polish phase must use an explicit file allowlist.');
assert(calls[calls.length - 1].system.includes('senior frontend engineer'), 'The polish phase must preserve the Web Studio role instructions.');
assert(result.summary.includes('5 distinct website pages'));
assert(calls.every(call => call.system.includes('OVYX_TEST_WEBSITE_QUALITY_CONTRACT')), 'Every sitemap-planning and page-generation call must receive the Web Studio quality contract.');
assert(calls[0].system.includes('realistic route-by-route sitemap'), 'The planning-specific instructions must remain present alongside the quality contract.');
assert(calls.slice(1).every(call => call.system.includes('senior frontend engineer')), 'The page-generation role instructions must remain present alongside the quality contract.');
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

// An unapproved polish path must not damage an already validated baseline.
const rejectPolishModel = async (_env, options) => {
  if (String(options.user).includes('BOUNDED WEBSITE POLISH PHASE')) {
    return {
      text: JSON.stringify({ summary: 'Unauthorized file edit', files: { 'src/private.html': '<!doctype html><html lang="en"><head><title>bad</title></head><body><main><h1>Bad</h1></main></body></html>' } }),
      provider: 'gemini',
      model: 'test-model',
      rawUsage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
    };
  }
  return callModel(_env, options);
};
const safeAfterRejectedPolish = await buildStudioMultiPage({
  env: {},
  callModel: rejectPolishModel,
  provider: 'automatic',
  authUser: { sub: 'test-user' },
  mode: 'build',
  prompt: 'Build a multi-page restaurant website with Home, Menu, About, Reservations, and Contact pages.',
  project: { id: 'project-polish-fallback', name: 'Restaurant', pages: [] },
  files: {},
  qualityContract: 'OVYX_TEST_WEBSITE_QUALITY_CONTRACT: safe fallbacks are required.',
});
assert.equal(safeAfterRejectedPolish.qualityPolish.status, 'rejected');
assert.ok(safeAfterRejectedPolish.files['src/pages/Home.html'].includes('<h1>Home</h1>'));
assert.equal(safeAfterRejectedPolish.files['src/private.html'], undefined, 'Unapproved polish paths must never be committed into the staged build.');
assert.equal(safeAfterRejectedPolish.requirementVerification.ok, true);
assert.equal(safeAfterRejectedPolish.qualityPolish.integrityAfter, 1, 'A rejected polish must preserve the original integrity findings without introducing another defect.');
assert.equal(safeAfterRejectedPolish.rawUsage.total_tokens, 18 + 50 * 3 + 5);

console.log('Web Studio multi-page integration tests passed.');
