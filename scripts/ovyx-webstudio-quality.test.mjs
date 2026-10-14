import assert from 'node:assert/strict';
import fs from 'node:fs';

const runtime = fs.readFileSync('assets/ovyx-webstudio-quality.js', 'utf8');
const middleware = fs.readFileSync('functions/_middleware.js', 'utf8');
const headers = fs.readFileSync('_headers', 'utf8');
const packageJson = fs.readFileSync('package.json', 'utf8');
const prompts = fs.readFileSync('functions/_lib/prompts.js', 'utf8');
const assistant = fs.readFileSync('functions/api/ai/assistant.js', 'utf8');

// Parsing this script does not execute it; browser behavior is exercised separately.
assert.doesNotThrow(() => new Function(runtime), 'The Web Studio quality runtime must parse as valid JavaScript.');

for (const token of [
  'OVYX WEB STUDIO QUALITY CONTRACT',
  "WIDTHS = [320, 390, 768, 1024, 1440]",
  "setAttribute('sandbox', 'allow-scripts')",
  "connect-src 'none'",
  "form-action 'none'",
  "img-src data: blob:",
  "media-src data: blob:",
  "restoreSnapshot(studio, snapshot)",
  'OVYX QUALITY INSPECTOR REPAIR',
  'ovyx:webstudio-build-stage',
  'Automatic build gate',
  'quality-auto-repair',
  'deferredPreviewRefresh',
  'publishVerifiedPreview',
  'last known-good preview stays visible',
  'rejectBuildForQuality',
  'Horizontal overflow',
  'Page runtime errors',
  'function probeControls()',
  'function probeAccessibility()',
  'Isolated render processing budget',
  'CORE_BROWSER_ROUTE_COUNT = 3',
  'ADDITIONAL_ROUTE_WIDTHS = [390, 1440]',
  'MAX_SAFE_CONTROLS_PER_ROUTE = 8',
  'interactions.skipped=Math.max',
  'Safe control interaction sampling',
  'No controls matched the inspector’s conservative safe-click criteria',
  'safeControlSampling',
  'var routePlan = []',
  'report.browser.pagesTested += 1',
  'initialRenderMs',
  'domNodes',
  'Rendered text contrast sample',
  'Visible keyboard focus indicators',
  'Safe interactive behavior smoke test',
  'payload.probeInteractions = width === 390;',
  'Live integration verification',
  'function auditAssetReference(fromPath, reference, kind)',
  'function auditAssetSrcset(fromPath, value, kind)',
  'CSS url() asset',
  'External asset reachability',
  'data-quality-export',
  'data-quality-copy-summary',
  'function shareableReport(report)',
  'function clientSummary(report)',
  'function downloadQualityReport(report)',
  'function copyClientSummary()',
  'projectIdIncluded: false',
  'sourceFileContentsIncluded: false',
]) {
  assert.ok(runtime.includes(token), 'Quality runtime is missing: ' + token);
}

assert.ok(middleware.includes('/assets/ovyx-webstudio-quality.js?v=20261014-4'), 'The quality inspector must load from the application-shell middleware.');
assert.equal((middleware.match(/\/assets\/ovyx-webstudio-quality\.js\?v=20261014-3/g) || []).length, 1, 'The quality inspector must be injected exactly once per application shell.');
assert.ok(headers.includes('/assets/ovyx-webstudio-quality.js\n  Cache-Control: no-store, no-cache, must-revalidate'), 'Quality inspection code must not be served from a stale cache.');
assert.equal((headers.match(/\/assets\/ovyx-webstudio-quality\.js/g) || []).length, 1, 'Quality asset cache rules must appear exactly once.');
assert.ok(packageJson.includes('scripts/ovyx-webstudio-quality.test.mjs'), 'The quality regression contract must run in npm test.');
assert.ok(prompts.includes('ART DIRECTION AND DISTINCTIVENESS'), 'The server-side Web Studio agent must receive the premium design contract.');
assert.ok(prompts.includes('Make at most one bounded targeted repair pass'), 'The server-side Web Studio agent must use bounded repair passes.');
assert.ok(prompts.includes('appropriate aria-expanded, aria-controls, aria-selected or aria-pressed state'), 'Web Studio prompts must require accessible state that browser checks can exercise.');
assert.ok(prompts.includes('4.5:1 for normal text and 3:1 for large/bold text'), 'The generation contract must state readable text-contrast targets.');
assert.ok(assistant.includes('qualityContract: WEB_STUDIO_EXCELLENCE'), 'The real Web Studio route must pass its premium quality contract into the multi-page builder.');
assert.ok(/WEB_STUDIO_SYSTEM_PROMPT\s*\+\s*'\\n\\n'\s*\+\s*WEB_STUDIO_EXCELLENCE/.test(assistant), 'Single-page Web Studio system instructions must use real line breaks between the core prompt and the premium quality contract.');
assert.ok(/'\\n\\nEXPERIENCE INTELLIGENCE:\\n'/.test(assistant), 'The experience brief must be separated with real line breaks for the model.');
assert.ok(/'\\n\\nCLIENT STUDIO INSTRUCTIONS:\\n'/.test(assistant), 'Client studio instructions must be separated with real line breaks for the model.');
assert.ok(/'\\n\\nAuthenticated user UID: '/.test(assistant), 'The authenticated-user context must be appended using real line breaks.');
const multipage = fs.readFileSync('functions/_lib/studio-multipage.js', 'utf8');
const integrity = fs.readFileSync('functions/_lib/site-integrity.js', 'utf8');
assert.ok(multipage.includes('OVYX WEB STUDIO BOUNDED WEBSITE POLISH PHASE'), 'Multi-page builds must receive a bounded final design-polish pass.');
assert.ok(multipage.includes('selectBoundedPolishTargets'), 'Polish context must be budgeted to protect large builds and provider limits.');
assert.ok(multipage.includes('allowedPolishPaths'), 'Polish output must be restricted to an explicit file allowlist.');
assert.ok(multipage.includes('validateStagedSite(candidate, prompt, siteMap)'), 'Polished files must pass the same source and prompt-requirement checks as the baseline.');
assert.ok(multipage.includes('const baselineStaged = staged.map(item => ({ ...item }));'), 'A valid baseline must be retained so a failed polish cannot destroy a good build.');
assert.ok(multipage.includes('auditWebsiteIntegrity(outputFilesByPath, siteMap)'), 'Multi-page builds must audit internal routes and local assets before accepting a polish result.');
assert.ok(multipage.includes('hasNewIntegrityFindings(integrityBefore, candidateChecks.integrity)'), 'A polish result must not introduce new source-level link or asset defects.');
assert.ok(multipage.includes('integrityPreferredPaths'), 'Files with integrity findings must be prioritized for the bounded repair pass.');
assert.ok(multipage.includes('External resource availability and live integrations were not verified by this static audit.'), 'The build summary must clearly separate static integrity checks from live verification.');
assert.ok(integrity.includes('INTERNAL_ROUTE_UNMAPPED'), 'The integrity audit must detect links outside the approved page route manifest.');
assert.ok(integrity.includes('LOCAL_CSS_ASSET_MISSING'), 'The integrity audit must detect missing CSS assets.');
assert.ok(integrity.includes('LOCAL_SRCSET_ASSET_MISSING'), 'The integrity audit must detect missing responsive-image srcset assets.');
assert.ok(integrity.includes('IMAGE_ALT_MISSING'), 'The integrity audit must detect images that omit an alt attribute.');
assert.ok(integrity.includes('DUPLICATE_HTML_ID'), 'The integrity audit must detect duplicate HTML ids.');
assert.ok(integrity.includes('FORM_CONTROL_LABEL_MISSING'), 'The integrity audit must detect form controls without detectable labels.');
assert.ok(integrity.includes('LABEL_TARGET_MISSING'), 'The integrity audit must detect labels that point to missing controls.');
assert.ok(integrity.includes('ARIA_REFERENCE_TARGET_MISSING'), 'The integrity audit must detect missing source targets for aria-labelledby/describedby references.');
assert.ok(integrity.includes('ORPHAN_FRAGMENT'), 'The integrity audit must detect broken same-page anchors.');
assert.ok(integrity.includes('BROKEN_ROUTE_FRAGMENT'), 'The source integrity audit must detect anchors that point to missing ids on another page.');
assert.ok(runtime.includes('label references a missing control id'), 'The browser source audit must detect labels pointing to missing form controls.');
assert.ok(runtime.includes('aria-labelledby references a missing id'), 'The browser source audit must detect unresolved aria-labelledby references.');
assert.ok(runtime.includes('aria-describedby references a missing id'), 'The browser source audit must detect unresolved aria-describedby references.');
assert.ok(integrity.includes('runtimeBehaviorVerified: false'), 'Static checks must not be presented as proof that runtime behavior works.');
assert.ok(prompts.includes('visible :focus/:focus-visible indicators'), 'The generation contract must require visible keyboard focus cues.');
assert.ok(prompts.includes('1,800 rendered elements per route'), 'The generation contract must provide a concrete DOM-size budget.');
assert.ok(!runtime.includes('MAX_BROWSER_PAGES'), 'Responsive browser smoke checks must not silently exclude routes past a fixed route cap.');
assert.ok(runtime.includes('ovyx-webstudio-qa-'), 'The inspector must name exported QA reports with a recognizable prefix.');
assert.ok(runtime.includes('getClientSummary: function ()'), 'The quality runtime must expose its client summary for review and integration.');
assert.ok(runtime.includes('No missing or unresolved local asset references were found.'), 'The inspector must report local image/media/font/CSS URL reference validation.');
assert.ok(runtime.includes('Their availability, licensing, latency and rendering were not verified'), 'The inspector must not claim external assets were tested when network access is blocked.');
assert.ok(!runtime.includes('runBuildAgent(prompt, false'), 'Quality repairs must not start an unbounded normal build loop.');

console.log('Web Studio quality contracts passed: build prompt, real source/browser checks, safe sandbox, and snapshot-protected repair.');
