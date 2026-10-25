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
    .replace('srcset="../assets/mark.svg 1x"', 'srcset="../assets/missing-srcset.svg 1x"')
    .replace(' alt="Brand mark"', '')
    .replace('<h1>Home</h1>', '<h1 id="features">Home</h1><label for="missing-input">Email</label><input id="unlabelled-input" name="email"><button aria-labelledby="missing-button-label">Save</button>'),
  'src/styles.css': 'body{background-image:url("./assets/missing.svg")}',
};
const brokenIntegrity = auditWebsiteIntegrity(brokenIntegrityFiles, integritySiteMap);
for (const code of ['INTERNAL_ROUTE_UNMAPPED', 'ORPHAN_FRAGMENT', 'BROKEN_ROUTE_FRAGMENT', 'PLACEHOLDER_LINK', 'LOCAL_IMG_MISSING', 'LOCAL_SRCSET_ASSET_MISSING', 'IMAGE_ALT_MISSING', 'DUPLICATE_HTML_ID', 'LABEL_TARGET_MISSING', 'ARIA_REFERENCE_TARGET_MISSING', 'FORM_CONTROL_LABEL_MISSING', 'LOCAL_CSS_ASSET_MISSING']) {
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
let polishAssertionStage = 'not-entered';
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
    polishAssertionStage = 'current-file-manifest';
    const match = String(options.user).match(/POLISH CURRENT FILE CONTENTS JSON:\n([\s\S]*?)\n\nPOLISH ALLOWLIST JSON:/);
    assert(match, 'Polish prompt must supply complete target files and an explicit allowlist.');
    const files = JSON.parse(match[1]);
    polishAssertionStage = 'route-manifest';
    assert.ok(String(options.user).includes('FULL WEBSITE ROUTE MANIFEST JSON'), 'Polish must preserve site-wide route awareness.');
    polishAssertionStage = 'prompt-requirement-contract';
    assert.ok(String(options.user).includes('PROMPT REQUIREMENT CONTRACT JSON'), 'Polish must preserve the original requirements.');
    files['src/styles.css'] = String(files['src/styles.css'] || '').replace('outline-offset:3px', 'outline-offset:4px');
    if (files['src/pages/Contact.html']) {
      files['src/pages/Contact.html'] = files['src/pages/Contact.html'].replace('href="/missing-route/"', 'href="/menu/"');
    }
    polishAssertionStage = 'integrity-finding-cue';
    assert.ok(String(options.user).includes('INTERNAL_ROUTE_UNMAPPED'), 'The polish prompt must identify the broken route found before polishing.');
    polishAssertionStage = 'polish-result-returned';
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
      const primaryAction = title.toLowerCase() === 'reservations' ? '<button type="button">Reserve a table</button>' : '';
      // Deliberately model the two common AI mistakes: basenames without the
      // parent path, and pages that forget to include the shared assets entirely.
      const stylesRef = title === 'About' ? '' : '<link rel="stylesheet" href="styles.css">';
      const scriptRef = title === 'About' ? '' : '<script src="main.js"></script>';
      files[target.path] = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="' + title + ' page"><title>' + title + ' | Test Restaurant</title>' + stylesRef + '</head><body><nav aria-label="Main navigation">' + links + '</nav><main><h1>' + title + '</h1><p>Purposeful content for the ' + slug + ' page.</p>' + primaryAction + '</main>' + scriptRef + '</body></html>';
    }
  }
  // One target deliberately returns direct HTML rather than the JSON envelope.
  // The single-file contract must safely recover that known target and still run
  // the ordinary shared-asset and structural validators.
  if (targets.length === 1 && targets[0].path === 'src/pages/Menu.html') {
    return {
      text: files[targets[0].path],
      provider: 'gemini',
      model: 'test-model',
      rawUsage: { prompt_tokens: 19, completion_tokens: 31, total_tokens: 50 },
    };
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
assert.match(result.files['src/pages/Home.html'], /href="\.\.\/styles\.css"/, 'A basename-only shared stylesheet URL must be repaired to the correct src/pages-relative path.');
assert.match(result.files['src/pages/Home.html'], /src="\.\.\/main\.js"/, 'A basename-only shared script URL must be repaired to the correct src/pages-relative path.');
assert.match(result.files['src/pages/About.html'], /href="\.\.\/styles\.css"/, 'A page that omits the shared stylesheet must receive the required stylesheet reference.');
assert.match(result.files['src/pages/About.html'], /src="\.\.\/main\.js"/, 'A page that omits the shared script must receive the required script reference.');
assert.ok(result.sharedAssetPagesRepaired >= 1, 'Asset normalization should report repaired generated pages.');
assert.equal(result.totalPages, 5);
assert.equal(result.rawUsage.prompt_tokens, 11 + 19 * 7 + 5);
assert.equal(result.rawUsage.completion_tokens, 7 + 31 * 7 + 9);
assert.equal(calls.length, 9, 'The five-page site should use one planning call, seven single-file batches, and one bounded polish call.');
assert.equal(result.batchCount, 7, 'Every generated file batch must contain exactly one target file.');
const targetBatchCalls = calls.filter(call => String(call.user).includes('REQUIRED TARGET FILES JSON:'));
assert.equal(targetBatchCalls.length, 7);
for (const call of targetBatchCalls) {
  const manifest = String(call.user).match(/REQUIRED TARGET FILES JSON:\n([\s\S]*?)\n\nREQUIRED TARGET PATHS JSON:/);
  const allowed = String(call.user).match(/ALLOWED OUTPUT PATHS JSON:\n([\s\S]*?)\n\nALREADY GENERATED PATHS JSON:/);
  assert(manifest && allowed, 'Every batch must carry a bounded target and allowlist.');
  const targets = JSON.parse(manifest[1]);
  const allowedPaths = JSON.parse(allowed[1]);
  assert.equal(targets.length, 1, 'Every batch manifest must contain exactly one required file.');
  assert.deepEqual(allowedPaths, targets.map(item => item.path), 'The model must only return the files explicitly assigned to this batch.');
}
assert.equal(result.qualityPolish.status, 'applied', 'Polish should be applied; last validation point was ' + polishAssertionStage + '; result=' + JSON.stringify(result.qualityPolish));
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
const makeBookingOmissionModel = repairHandler => async (_env, options) => {
  const user = String(options.user || '');
  if (user.includes('BOUNDED REQUIREMENT REPAIR PHASE')) return repairHandler(options);
  const result = await callModel(_env, options);
  if (user.includes('REQUIRED TARGET FILES JSON:') && !user.includes('BOUNDED WEBSITE POLISH PHASE')) {
    const payload = JSON.parse(result.text);
    for (const path of Object.keys(payload.files || {})) {
      if (/Reservations\.html$/i.test(path)) {
        payload.files[path] = String(payload.files[path]).replace('<button type="button">Reserve a table</button>', '');
      }
    }
    return { ...result, text: JSON.stringify(payload) };
  }
  return result;
};

const repairCalls = [];
const repairedRequirementBuild = await buildStudioMultiPage({
  env: {},
  callModel: makeBookingOmissionModel(async options => {
    repairCalls.push(options);
    const match = String(options.user).match(/REPAIR CURRENT FILE CONTENTS JSON:\n([\s\S]*?)\n\nREPAIR ALLOWLIST JSON:/);
    assert(match, 'Requirement repair must include complete current file contents and a separate allowlist.');
    assert.ok(String(options.user).includes('REQUIREMENT VERIFICATION FAILURES JSON'), 'Repair must see the exact failed deterministic checks.');
    const files = JSON.parse(match[1]);
    const target = Object.keys(files).find(path => /Reservations\.html$/i.test(path));
    assert.ok(target, 'The bounded repair should select the reservation page for a booking-flow failure.');
    files[target] = String(files[target]).replace('</main>', '<button type="button">Reserve a table</button></main>');
    return {
      text: JSON.stringify({ summary: 'Booking control repaired', files: { [target]: files[target] } }),
      provider: 'gemini',
      model: 'test-model',
      rawUsage: { prompt_tokens: 3, completion_tokens: 5, total_tokens: 8 },
    };
  }),
  provider: 'automatic',
  authUser: { sub: 'test-user' },
  mode: 'build',
  prompt: 'Build a five-page restaurant website with Home, Menu, About, Reservations, and Contact pages.',
  project: { id: 'project-requirement-repair', name: 'Restaurant', pages: [] },
  files: {},
  qualityContract: 'OVYX_TEST_WEBSITE_QUALITY_CONTRACT: preserve requirements and validate repaired files.',
});
assert.equal(repairCalls.length, 1, 'A missing booking control should trigger exactly one bounded repair request.');
assert.equal(repairedRequirementBuild.requirementRepair.status, 'applied', JSON.stringify(repairedRequirementBuild.requirementRepair));
assert.equal(repairedRequirementBuild.requirementRepair.issuesBefore[0].code, 'BOOKING_FLOW_MISSING');
assert.equal(repairedRequirementBuild.requirementVerification.ok, true);
assert.equal(repairedRequirementBuild.requirementRepair.issuesAfter.length, 0);
assert.ok(repairedRequirementBuild.files['src/pages/Reservations.html'].includes('Reserve a table'));
assert.equal(repairedRequirementBuild.files['src/private.html'], undefined, 'The requirement repair must not introduce unapproved paths.');
assert.ok(repairCalls[0].user.includes('REPAIR ALLOWLIST JSON'));
assert.equal(repairedRequirementBuild.rawUsage.total_tokens, 18 + 50 * 7 + 8 + 14, 'Usage accounting must include all seven single-file batches plus the requirement-repair and polish calls.');
assert.ok(repairedRequirementBuild.summary.includes('bounded requirement-repair pass was applied'));

const rejectedRequirementRepair = await buildStudioMultiPage({
  env: {},
  callModel: makeBookingOmissionModel(async () => ({
    text: JSON.stringify({
      summary: 'Unauthorized requirement repair',
      files: { 'src/private.html': '<!doctype html><html><head><title>Unauthorized</title></head><body><h1>Unauthorized</h1></body></html>' },
    }),
    provider: 'gemini',
    model: 'test-model',
    rawUsage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
  })),
  provider: 'automatic',
  authUser: { sub: 'test-user' },
  mode: 'build',
  prompt: 'Build a five-page restaurant website with Home, Menu, About, Reservations, and Contact pages.',
  project: { id: 'project-rejected-requirement-repair', name: 'Restaurant', pages: [] },
  files: {},
  qualityContract: 'OVYX_TEST_WEBSITE_QUALITY_CONTRACT: preserve the validated baseline.',
}).then(() => null, error => error);
assert.ok(rejectedRequirementRepair, 'An incomplete site with an unauthorized repair must not be marked ready.');
assert.equal(rejectedRequirementRepair.code, 'WEBSTUDIO_PROMPT_REQUIREMENT_MISSING');
assert.equal(rejectedRequirementRepair.requirementRepair.status, 'rejected');

// An unusable model-generated batch gets exactly one bounded full-build retry.
// Single-file batches mean omitting their only required file becomes an empty
// response; the second attempt must rebuild all pages cleanly and preserve usage.
let dropFirstRequiredFile = true;
const retryCallHistory = [];
const retryingCallModel = async (_env, options) => {
  retryCallHistory.push(options);
  const answer = await callModel(_env, options);
  const user = String(options.user || '');
  if (dropFirstRequiredFile && user.includes('REQUIRED TARGET FILES JSON:') && !user.includes('BOUNDED WEBSITE POLISH PHASE')) {
    const match = user.match(/REQUIRED TARGET FILES JSON:\n([\s\S]*?)\n\nREQUIRED TARGET PATHS JSON:/);
    assert(match, 'Retry fixture must receive the required-file manifest.');
    const targets = JSON.parse(match[1]);
    assert.equal(targets.length, 1, 'Each retry fixture batch must have exactly one approved target.');
    dropFirstRequiredFile = false;
    // Return a valid envelope with no file contents; the retry path must recover
    // without trying to JSON-parse a raw-code response from another batch.
    return {
      ...answer,
      text: JSON.stringify({ summary: 'Intentionally empty single-file batch', files: {} }),
    };
  }
  return answer;
};
const retryBuild = await buildStudioMultiPage({
  env: {},
  callModel: retryingCallModel,
  provider: 'automatic',
  authUser: { sub: 'retry-test-user' },
  mode: 'build',
  prompt: 'Build a five-page restaurant website with Home, Menu, About, Reservations, and Contact pages.',
  project: { id: 'project-bounded-retry', name: 'Restaurant', pages: [] },
  files: {},
  qualityContract: 'OVYX_TEST_WEBSITE_QUALITY_CONTRACT: preserve original requirements and validate every generated file.',
});
assert.ok(retryBuild, 'A malformed first batch should recover instead of abandoning the requested website.');
assert.equal(retryBuild.generationRecovery.status, 'recovered-after-one-bounded-retry');
assert.equal(retryBuild.generationRecovery.firstFailureCode, 'WEBSTUDIO_BATCH_EMPTY');
assert.equal(retryBuild.siteMap.pages.length, 5);
assert.equal(Object.keys(retryBuild.files).filter(path => path.startsWith('src/pages/')).length, 5);
assert.ok(retryBuild.rawUsage.total_tokens > 0, 'The successful retry must report usage from both failed and successful attempts when available.');
assert.equal(retryCallHistory.filter(item => String(item.user).includes('WEBSITE ARCHITECTURE PLANNING PHASE')).length, 2,
  'The recovery is bounded to one clean full-build retry.');
assert.ok(retryCallHistory.some(item => String(item.system).includes('BOUNDED WEBSITE-GENERATION RECOVERY')),
  'The second attempt must receive the explicit recovery instructions.');
assert.ok(retryBuild.files['src/pages/Home.html'].includes('href="../styles.css"'));
assert.ok(retryBuild.files['src/pages/About.html'].includes('src="../main.js"'));

assert.equal(rejectedRequirementRepair.requirementVerification.ok, false);

// A malformed sitemap response must not abandon the whole multi-page build.
// OVYX recovers the requested routes deterministically, then validates all files and links.
const invalidPlanCalls = [];
const fallbackExpectedPages = ['Home', 'Property Listings', 'About', 'Contact'];
const fallbackNav = fallbackExpectedPages.map(title => ({
  title,
  href: title === 'Home' ? '/' : '/' + title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '/',
}));
const invalidSitemapRecoveryModel = async (_env, options) => {
  invalidPlanCalls.push(options);
  const user = String(options.user || '');
  if (user.includes('WEBSITE ARCHITECTURE PLANNING PHASE')) {
    return {
      text: 'The model did not return valid sitemap JSON.',
      provider: 'cloudflare-workers-ai',
      model: '@cf/meta/llama-3.1-8b-instruct-fp8-fast',
      rawUsage: { prompt_tokens: 120, completion_tokens: 12, total_tokens: 132 },
    };
  }
  if (user.includes('BOUNDED WEBSITE POLISH PHASE')) {
    throw new Error('The fallback test disables the optional polish pass.');
  }
  const match = user.match(/REQUIRED TARGET FILES JSON:\n([\s\S]*?)\n\nREQUIRED TARGET PATHS JSON:/);
  assert(match, 'Recovered sitemap batch must include the expected target manifest.');
  const targets = JSON.parse(match[1]);
  const files = {};
  for (const target of targets) {
    if (target.path === 'src/styles.css') {
      files[target.path] = '*,*::before,*::after{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#202020;background:#f7f4ef}nav{display:flex;flex-wrap:wrap;gap:1rem;padding:1rem}main{max-width:72rem;margin:auto;padding:2rem}a:focus-visible{outline:3px solid #76513a;outline-offset:3px}@media(max-width:600px){main{padding:1rem}nav{gap:.6rem}}';
    } else if (target.path === 'src/main.js') {
      files[target.path] = "document.documentElement.dataset.ready = 'true';";
    } else {
      const title = String(target.title || 'Page');
      const links = fallbackNav.map(link => '<a href="' + link.href + '">' + link.title + '</a>').join('');
      files[target.path] = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="' + title + ' information"><title>' + title + '</title><link rel="stylesheet" href="../styles.css"><script src="../main.js" defer></script></head><body><nav aria-label="Main navigation">' + links + '</nav><main><h1>' + title + '</h1><p>Information for visitors, with facts and availability confirmed by the property advisory.</p></main></body></html>';
    }
  }
  return {
    text: JSON.stringify({ summary: 'Batch generated', files }),
    provider: 'cloudflare-workers-ai',
    model: '@cf/meta/llama-3.1-8b-instruct-fp8-fast',
    rawUsage: { prompt_tokens: 180, completion_tokens: 260, total_tokens: 440 },
  };
};
const invalidPlanFallbackBuild = await buildStudioMultiPage({
  env: { OVYX_WEBSTUDIO_POLISH_ENABLED: 'false' },
  callModel: invalidSitemapRecoveryModel,
  provider: 'automatic',
  authUser: { sub: 'invalid-plan-recovery-test' },
  mode: 'build',
  prompt: 'Build a four-page multi-page property advisory website in Nigeria: Home, Property Listings, About, Contact. No live property feed or client contact details are connected; do not invent live property facts.',
  project: { id: 'project-invalid-plan-recovery', name: 'Property Advisory', pages: [] },
  files: {},
  qualityContract: 'OVYX_TEST_WEBSITE_QUALITY_CONTRACT: preserve honest listing states and validate every internal route.',
});
assert.ok(invalidPlanFallbackBuild, 'A malformed sitemap response should recover instead of abandoning the multi-page build.');
assert.equal(invalidPlanFallbackBuild.siteMapRecovery, 'deterministic-fallback-after-invalid-model-plan');
assert.deepEqual(invalidPlanFallbackBuild.siteMap.pages.map(page => page.title), fallbackExpectedPages);
assert.equal(Object.keys(invalidPlanFallbackBuild.files).filter(path => path.startsWith('src/pages/') && path.endsWith('.html')).length, 4);
assert.equal(invalidPlanFallbackBuild.requirementVerification?.ok, true, JSON.stringify(invalidPlanFallbackBuild.requirementVerification));
assert.equal(invalidPlanFallbackBuild.qualityPolish.status, 'disabled');
assert.ok(invalidPlanFallbackBuild.summary.includes('recovered the requested page structure'));
assert.equal(invalidPlanCalls.filter(item => String(item.user).includes('WEBSITE ARCHITECTURE PLANNING PHASE')).length, 1,
  'Deterministic sitemap recovery must avoid a second billable planning retry.');
assert.ok(invalidPlanFallbackBuild.rawUsage.total_tokens >= 132,
  'Usage accounting must include the invalid planning response and generated files.');

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
assert.equal(safeAfterRejectedPolish.rawUsage.total_tokens, 18 + 50 * 7 + 5, 'Rejected polish accounting must include all seven single-file batches.');

console.log('Web Studio multi-page integration tests passed.');


// Provider authentication, billing, quota, and network failures must not be
// re-issued by the structural-output recovery path; the router already owns
// provider fallback and another full build could add unnecessary provider cost.
let providerFailureCalls = 0;
const upstreamFailure = Object.assign(new Error('private provider response must never leak'), {
  status: 503,
  code: 'AI_PROVIDER_UNAVAILABLE',
});
const providerFailureBuild = await buildStudioMultiPage({
  env: {},
  callModel: async () => {
    providerFailureCalls += 1;
    throw upstreamFailure;
  },
  provider: 'automatic',
  mode: 'build',
  prompt: 'Build a four-page website with Home, Services, About, and Contact pages.',
  project: { id: 'project-provider-failure', name: 'Service', pages: [] },
  files: {},
}).then(() => null, error => error);
assert.ok(providerFailureBuild, 'An upstream AI failure must still be surfaced.');
assert.equal(providerFailureBuild.code, 'AI_PROVIDER_UNAVAILABLE');
assert.equal(providerFailureCalls, 1, 'The output-recovery retry must not repeat provider auth/billing/quota/network failures.');
