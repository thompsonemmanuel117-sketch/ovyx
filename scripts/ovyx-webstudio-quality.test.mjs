import assert from 'node:assert/strict';
import fs from 'node:fs';

const runtime = fs.readFileSync('assets/ovyx-webstudio-quality.js', 'utf8');
const middleware = fs.readFileSync('functions/_middleware.js', 'utf8');
const headers = fs.readFileSync('_headers', 'utf8');
const packageJson = fs.readFileSync('package.json', 'utf8');
const prompts = fs.readFileSync('functions/_lib/prompts.js', 'utf8');

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

assert.ok(middleware.includes('/assets/ovyx-webstudio-quality.js?v=20261014-2'), 'The quality inspector must load from the application-shell middleware.');
assert.equal((middleware.match(/\/assets\/ovyx-webstudio-quality\.js\?v=20261014-2/g) || []).length, 1, 'The quality inspector must be injected exactly once per application shell.');
assert.ok(headers.includes('/assets/ovyx-webstudio-quality.js\n  Cache-Control: no-store, no-cache, must-revalidate'), 'Quality inspection code must not be served from a stale cache.');
assert.equal((headers.match(/\/assets\/ovyx-webstudio-quality\.js/g) || []).length, 1, 'Quality asset cache rules must appear exactly once.');
assert.ok(packageJson.includes('scripts/ovyx-webstudio-quality.test.mjs'), 'The quality regression contract must run in npm test.');
assert.ok(prompts.includes('ART DIRECTION AND DISTINCTIVENESS'), 'The server-side Web Studio agent must receive the premium design contract.');
assert.ok(prompts.includes('Make at most one bounded targeted repair pass'), 'The server-side Web Studio agent must use bounded repair passes.');
assert.ok(prompts.includes('appropriate aria-expanded, aria-controls, aria-selected or aria-pressed state'), 'Web Studio prompts must require accessible state that browser checks can exercise.');
assert.ok(prompts.includes('4.5:1 for normal text and 3:1 for large/bold text'), 'The generation contract must state readable text-contrast targets.');
assert.ok(prompts.includes('visible :focus/:focus-visible indicators'), 'The generation contract must require visible keyboard focus cues.');
assert.ok(prompts.includes('1,800 rendered elements per route'), 'The generation contract must provide a concrete DOM-size budget.');
assert.ok(!runtime.includes('MAX_BROWSER_PAGES'), 'Responsive browser smoke checks must not silently exclude routes past a fixed route cap.');
assert.ok(runtime.includes('ovyx-webstudio-qa-'), 'The inspector must name exported QA reports with a recognizable prefix.');
assert.ok(runtime.includes('getClientSummary: function ()'), 'The quality runtime must expose its client summary for review and integration.');
assert.ok(runtime.includes('No missing or unresolved local asset references were found.'), 'The inspector must report local image/media/font/CSS URL reference validation.');
assert.ok(runtime.includes('Their availability, licensing, latency and rendering were not verified'), 'The inspector must not claim external assets were tested when network access is blocked.');
assert.ok(!runtime.includes('runBuildAgent(prompt, false'), 'Quality repairs must not start an unbounded normal build loop.');

console.log('Web Studio quality contracts passed: build prompt, real source/browser checks, safe sandbox, and snapshot-protected repair.');
