import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const runtime = read('assets/ovyx-app-studio-link-builder.js');
const analyzer = read('assets/ovyx-app-studio-url-analyzer.js');
const brandDNA = read('assets/ovyx-app-studio-brand-dna.js');
const middleware = read('functions/_middleware.js');
const headers = read('_headers');
const pkg = JSON.parse(read('package.json'));
const workflow = read('.github/workflows/ovyx-assistant-workspace-browser.yml');
const browserTest = read('scripts/ovyx-app-studio-link-builder.browser.test.mjs');

for (const path of [
  'assets/ovyx-app-studio-link-builder.js',
  'scripts/ovyx-app-studio-link-builder.test.mjs',
  'scripts/ovyx-app-studio-link-builder.browser.test.mjs'
]) {
  execFileSync(process.execPath, ['--check', fileURLToPath(new URL('../' + path, import.meta.url))], { stdio: 'pipe' });
}

assert.ok(analyzer.includes('__OVYX_URL_ANALYZER_LAST_REPORT__'), 'Stage 2 must retain its structured analyzer report for Stage 3.');
assert.ok(runtime.includes('window.__OVYX_URL_ANALYZER_LAST_REPORT__'), 'Stage 3 must consume the Stage 2 report rather than re-fetching the source URL.');
assert.ok(runtime.includes('window.OVYXAIService.generate'), 'Stage 3 must use the existing authenticated OVYX AI generator.');
assert.ok(runtime.includes("mode: 'app-build'"), 'Stage 3 must route through the App Studio generation mode.');
assert.ok(runtime.includes("activeView: 'appstudio'"), 'Stage 3 generation must remain scoped to Project App Studio.');
assert.ok(runtime.includes('sourceSiteMap: brief.pages'), 'The generator must receive route titles, paths, headings, and inspection status from the analyzer.');
assert.ok(runtime.includes('sourceBrandColors'), 'The analyzed brand identity must be passed with the generation request.');
assert.ok(runtime.includes("frame.srcdoc = renderedHtml"), 'Generated HTML must open in the real interactive iframe preview.');
assert.ok(runtime.includes("setAttribute('sandbox', 'allow-scripts allow-forms allow-popups')"), 'The live project preview must isolate generated code in a sandbox.');
assert.ok(runtime.includes('data-lb-source'), 'The generated project source files must be inspectable in the UI.');
assert.ok(runtime.includes('ovyx:link-app-generated'), 'Generation completion must publish a real project event for later stage integrations.');
assert.ok(!runtime.includes('window.KernelState.activeProject ='), 'Link generation must not replace the user’s currently open project.');
assert.ok(brandDNA.includes('appBrandId') && brandDNA.includes('isAppStudioRequest'), 'Stage 1 must continue scoping identity and generation requests per app.');
assert.ok(middleware.includes('/assets/ovyx-app-studio-link-builder.js?v=20261018-1'), 'The real OVYX Pages shell must load the Stage 3 runtime.');
assert.ok(headers.includes('/assets/ovyx-app-studio-link-builder.js') && headers.includes('Cache-Control: no-store'), 'The live Stage 3 runtime must not be stuck behind stale asset caching.');
assert.ok(pkg.scripts.test.includes('scripts/ovyx-app-studio-link-builder.test.mjs'), 'The Stage 3 regression test must run under npm test.');
assert.ok(workflow.includes('scripts/ovyx-app-studio-link-builder.browser.test.mjs'), 'The desktop/mobile browser integration test must be wired into CI.');
assert.ok(browserTest.includes("frameLocator('[data-lb-preview]')") && browserTest.includes('Tap 1'), 'The browser test must interact with the live preview, not only inspect a screenshot or iframe element.');
assert.ok(browserTest.includes('/api/app-studio/url-analyzer') && browserTest.includes('/api/ai/gateway'), 'The integration test must cross the analyzer and existing generator request boundaries.');

console.log('OVYX Stage 3 source checks passed: analyzer handoff, existing AI generator routing, per-app branding, sandboxed live project preview, source inspection, and CI wiring.');
