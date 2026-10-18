import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const runtime = read('assets/ovyx-app-studio-premium-polish.js');
const middleware = read('functions/_middleware.js');
const headers = read('_headers');
const packageJson = JSON.parse(read('package.json'));
const workflow = read('.github/workflows/ovyx-assistant-workspace-browser.yml');
const browserTest = read('scripts/ovyx-app-studio-premium-polish.browser.test.mjs');
const functionalRuntime = read('assets/ovyx-app-studio-link-builder.js');
const conversionRuntime = read('index.html');

for (const path of [
  'assets/ovyx-app-studio-premium-polish.js',
  'scripts/ovyx-app-studio-premium-polish.test.mjs',
  'scripts/ovyx-app-studio-premium-polish.browser.test.mjs'
]) {
  execFileSync(process.execPath, ['--check', fileURLToPath(new URL('../' + path, import.meta.url))], { stdio: 'pipe' });
}

assert.ok(runtime.includes('From website to working app.'), 'App Studio must have a clear product heading.');
assert.ok(runtime.includes('data-ovyx-as-step="analyze"') && runtime.includes('data-ovyx-as-step="generate"') && runtime.includes('data-ovyx-as-step="verify"') && runtime.includes('data-ovyx-as-step="release"'), 'The workspace must expose one guided four-step path.');
assert.ok(runtime.includes('wrapIdentity(root)'), 'Advanced Brand DNA controls must remain available in progressive disclosure.');
assert.ok(runtime.includes('wrapLegacyConversion(root)'), 'The existing Web Studio conversion route must remain accessible without dominating the primary flow.');
assert.ok(runtime.includes('groupAnalyzerDetails(root)'), 'Detailed URL scan evidence must be collapsible while core results and generation stay prominent.');
assert.ok(runtime.includes('handlePaletteDisclosure'), 'Using detected source colors must open the actual Brand DNA controls.');
assert.ok(runtime.includes('prefers-reduced-motion:reduce'), 'Animations must respect reduced-motion preferences.');
assert.ok(runtime.includes('ovyx-app-studio-project-brain') && runtime.includes('ovyx-app-studio-release'), 'The guided path must target the actual verifier and release controls.');
assert.ok(runtime.includes('!project') && runtime.includes('!verified'), 'The progress rail must reflect generated and verified state rather than decorative status.');
assert.ok(!runtime.includes('window.OVYXAIService') && !runtime.includes('fetch('), 'The polish layer must not duplicate the generation/API logic.');
assert.ok(functionalRuntime.includes('data-lb-mobile-build') && functionalRuntime.includes('data-lb-export-zip') && functionalRuntime.includes('data-lb-publish'), 'The existing supported release actions must remain in the main release workspace.');
assert.ok(conversionRuntime.includes('ovyx-appstudio-phrase4-runtime'), 'The existing Web Studio-to-mobile conversion runtime must remain in the app.');
assert.ok(middleware.includes('/assets/ovyx-app-studio-premium-polish.js?v=20261018-1'), 'The real Pages shell must load the polish runtime after the App Studio feature runtimes.');
assert.ok(headers.includes('/assets/ovyx-app-studio-premium-polish.js') && headers.includes('Cache-Control: no-store'), 'The premium UI asset must not be held behind stale browser caching.');
assert.ok(packageJson.scripts.test.includes('scripts/ovyx-app-studio-premium-polish.test.mjs'), 'The design-system source test must run under npm test.');
assert.ok(workflow.includes('scripts/ovyx-app-studio-premium-polish.browser.test.mjs'), 'The responsive progressive-disclosure browser test must run in CI.');
assert.ok(browserTest.includes('390') && browserTest.includes("emulateMedia({ reducedMotion: 'reduce' })") && browserTest.includes('Detailed inspection report'), 'Browser coverage must include mobile layout, reduced motion and report disclosure.');

console.log('OVYX App Studio premium polish source checks passed: guided flow, progressive disclosure, preserved release/conversion actions, reduced-motion support and CI wiring.');
