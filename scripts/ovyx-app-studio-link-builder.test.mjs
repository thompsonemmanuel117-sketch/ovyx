import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const runtime = read('assets/ovyx-app-studio-link-builder.js');
const projectBrain = read('assets/ovyx-app-studio-project-brain.js');
const analyzer = read('assets/ovyx-app-studio-url-analyzer.js');
const brandDNA = read('assets/ovyx-app-studio-brand-dna.js');
const middleware = read('functions/_middleware.js');
const headers = read('_headers');
const pkg = JSON.parse(read('package.json'));
const workflow = read('.github/workflows/ovyx-assistant-workspace-browser.yml');
const browserTest = read('scripts/ovyx-app-studio-link-builder.browser.test.mjs');

for (const path of [
  'assets/ovyx-app-studio-link-builder.js',
  'assets/ovyx-app-studio-project-brain.js',
  'scripts/ovyx-app-studio-project-brain.test.mjs',
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
assert.ok(runtime.includes('function routeFilesFor'), 'Stage 3 must map inspected routes to actual generated HTML files.');
assert.ok(runtime.includes('const multiPageBuild = inspectedPages.length > 1'), 'The generator must choose multiple HTML pages when more than one source page was inspected.');
assert.ok(runtime.includes('ovyxLinkAppNavigate'), 'The live preview must route internal links through its verified page map.');
assert.ok(runtime.includes("page.status !== 'inspected'"), 'Only source pages inspected by Stage 2 may be eligible for generated route mapping.');
assert.ok(runtime.includes('sourceBrandColors'), 'The analyzed brand identity must be passed with the generation request.');
assert.ok(runtime.includes("frame.srcdoc = renderedHtml"), 'Generated HTML must open in the real interactive iframe preview.');
assert.ok(runtime.includes("setAttribute('sandbox', 'allow-scripts allow-forms allow-popups')"), 'The live project preview must isolate generated code in a sandbox.');
assert.ok(runtime.includes('data-lb-source'), 'The generated project source files must be inspectable in the UI.');
assert.ok(runtime.includes('ovyx:link-app-generated'), 'Generation completion must publish a real project event for later stage integrations.');
assert.ok(projectBrain.includes('function analyze(project, runtimeSnapshot)'), 'Stage 5 must analyze the actual generated source map and runtime snapshot.');
assert.ok(projectBrain.includes('BROKEN_INTERNAL_ROUTE') && projectBrain.includes('STYLESHEET_DEPENDENCY_MISSING'), 'Project Brain must report concrete broken route and dependency failures.');
assert.ok(projectBrain.includes('script-hook') && projectBrain.includes('style-hook'), 'Project Brain must record component-to-JavaScript and component-to-CSS edges.');
assert.ok(runtime.includes('data-ovyx-project-brain-probe'), 'The generated preview must expose a controlled live DOM/error probe to Project Brain.');
assert.ok(runtime.includes('window.__OVYX_PROJECT_BRAIN_REPORT__'), 'The generated project UI must expose actual Project Brain results.');
assert.ok(middleware.includes('/assets/ovyx-app-studio-project-brain.js?v=20261018-4'), 'The real Pages shell must load Project Brain after the link builder.');
assert.ok(headers.includes('/assets/ovyx-app-studio-project-brain.js') && headers.includes('Cache-Control: no-store'), 'Project Brain should avoid stale asset caching.');
assert.ok(pkg.scripts.test.includes('scripts/ovyx-app-studio-project-brain.test.mjs'), 'Project Brain regression tests must run through npm test.');
assert.ok(browserTest.includes('runtimeChecked === true') && browserTest.includes('repairedAudit.status'), 'Browser integration must inspect the live preview and retest a repaired fixture.');
assert.ok(runtime.includes('.ovyx-lb-panel :is(input,button,summary):focus-visible'), 'The Stage 5 accessibility bug fix must preserve the corrected focus selector.');
assert.ok(!runtime.includes('}..ovyx-lb-panel :is(input,button,summary):focus-visible'), 'The malformed CSS selector must not return.');
assert.ok(!runtime.includes('window.KernelState.activeProject ='), 'Link generation must not replace the user’s currently open project.');
assert.ok(brandDNA.includes('appBrandId') && brandDNA.includes('isAppStudioRequest'), 'Stage 1 must continue scoping identity and generation requests per app.');
assert.ok(middleware.includes('/assets/ovyx-app-studio-link-builder.js?v=20261018-8'), 'The real OVYX Pages shell must load the Stage 3 runtime.');
assert.ok(headers.includes('/assets/ovyx-app-studio-link-builder.js') && headers.includes('Cache-Control: no-store'), 'The live Stage 3 runtime must not be stuck behind stale asset caching.');
assert.ok(pkg.scripts.test.includes('scripts/ovyx-app-studio-link-builder.test.mjs'), 'The Stage 3 regression test must run under npm test.');
assert.ok(workflow.includes('scripts/ovyx-app-studio-link-builder.browser.test.mjs'), 'The desktop/mobile browser integration test must be wired into CI.');
assert.ok(browserTest.includes("frameLocator('[data-lb-preview]')") && browserTest.includes('Tap 1'), 'The browser test must interact with the live preview, not only inspect a screenshot or iframe element.');
assert.ok(browserTest.includes('/api/app-studio/url-analyzer') && browserTest.includes('/api/ai/gateway'), 'The integration test must cross the analyzer and existing generator request boundaries.');

assert.ok(runtime.includes('data-ovyx-app-action-bridge'), 'The real preview must receive the controlled Stage 4 parent bridge.');
assert.ok(runtime.includes('connect-src'), 'The generated preview CSP must explicitly control network access.');
assert.ok(runtime.includes('connect-src') && runtime.includes('form-action'), 'The generated preview must block arbitrary direct network calls and browser form posts.');
assert.ok(runtime.includes('document.addEventListener("submit"'), 'Generated forms must have an implemented submit outcome.');
assert.ok(runtime.includes('function cleanSubmittedFields'), 'Form submissions must be bounded and sensitive fields filtered.');
assert.ok(runtime.includes('function writeAppState'), 'The preview must persist per-user app state locally with a size limit.');
assert.ok(runtime.includes('window.OVYXApp') && runtime.includes('auth.currentUser'), 'Generated apps must have a real sign-in status bridge.');
assert.ok(runtime.includes('const API_ACTIONS = Object.freeze'), 'OVYX API access must use a fixed endpoint allowlist.');
assert.ok(runtime.includes('window.confirm'), 'Private account API reads and project saves must request user authorization.');
assert.ok(runtime.includes('Allow this generated app to read your OVYX display name and email address?'), 'Generated apps must ask before receiving personal profile details.');
assert.ok(runtime.includes("fetch('/api/projects'"), 'Cloud project persistence must use the existing authenticated Projects API.');
assert.ok(runtime.includes('App saved to OVYX Projects'), 'The UI must only report cloud-save success after the API verifies a saved project.');
assert.ok(runtime.includes('Stage 04 action contract'), 'New generated projects must be instructed to use supported Stage 4 actions and disclose unsupported integrations.');
assert.ok(browserTest.includes('Saved in this browser only'), 'Browser tests must verify honest local-only form feedback.');
assert.ok(browserTest.includes('do-not-store-this'), 'Browser tests must verify password values are not stored.');
assert.ok(browserTest.includes('requests.cloudSave'), 'Browser tests must verify a confirmed authenticated cloud save.');
assert.ok(browserTest.includes('not-allowed'), 'Browser tests must verify direct arbitrary network calls are blocked.');

console.log('OVYX Stage 4/5 source checks passed: real generated-app actions, bounded persistence, Project Brain wiring, dependency graph and source/runtime test coverage.');
