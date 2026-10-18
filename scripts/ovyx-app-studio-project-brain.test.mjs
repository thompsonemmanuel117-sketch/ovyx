import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const runtime = read('assets/ovyx-app-studio-project-brain.js');
const builder = read('assets/ovyx-app-studio-link-builder.js');
const middleware = read('functions/_middleware.js');
const headers = read('_headers');
const packageJson = JSON.parse(read('package.json'));
const workflow = read('.github/workflows/ovyx-assistant-workspace-browser.yml');
const browserTest = read('scripts/ovyx-app-studio-link-builder.browser.test.mjs');

for (const path of [
  'assets/ovyx-app-studio-project-brain.js',
  'assets/ovyx-app-studio-link-builder.js',
  'scripts/ovyx-app-studio-project-brain.test.mjs',
  'scripts/ovyx-app-studio-link-builder.browser.test.mjs'
]) {
  execFileSync(process.execPath, ['--check', fileURLToPath(new URL('../' + path, import.meta.url))], { stdio: 'pipe' });
}

const sandbox = { window: {}, console };
vm.runInNewContext(runtime, sandbox, { filename: 'ovyx-app-studio-project-brain.js' });
const brain = sandbox.window.OVYXProjectBrain;
assert.ok(brain && typeof brain.analyze === 'function', 'Project Brain should expose its dependency/control analyzer.');

const good = {
  id: 'audit-demo', name: 'Audit Demo', routes: { '/': 'index.html', '/about/': 'pages/about.html' },
  files: {
    'index.html': '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Audit Demo</title><link rel="stylesheet" href="styles.css"></head><body><nav><a href="/">Home</a><a href="/about/">About</a><a href="#details">Details</a></nav><main><h1>Audit Demo</h1><section id="details"><button type="button" id="counter">Tap</button><form id="lead"><label>Email <input name="email" type="email"></label><button type="submit">Save</button></form></section><img src="/assets/mark.svg" alt="Brand mark"><script src="app.js"></script></main></body></html>',
    'pages/about.html': '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>About Audit Demo</title><link rel="stylesheet" href="../styles.css"></head><body><nav><a href="/">Home</a></nav><h1>About</h1><script src="../app.js"></script></body></html>',
    'styles.css': 'body{font-family:Arial}#counter{color:#fff}nav a{color:#333}body{background:url("assets/mark.svg")}',
    'app.js': "document.querySelector('#counter')?.addEventListener('click',function(){this.textContent='Tapped'});",
    'assets/mark.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5"/></svg>'
  }
};
const passing = brain.analyze(good);
assert.equal(passing.status, 'passed', 'A complete fixture should pass with no warnings or unresolved dependencies: ' + JSON.stringify(passing.checks.filter(x => x.severity !== 'pass')));
assert.ok(passing.graph.edges.some(edge => edge.type === 'stylesheet'), 'The graph should connect HTML pages to CSS files.');
assert.ok(passing.graph.edges.some(edge => edge.type === 'script'), 'The graph should connect HTML pages to JavaScript files.');
assert.ok(passing.graph.edges.some(edge => edge.type === 'navigation'), 'The graph should connect internal navigation to another page.');
assert.ok(passing.graph.edges.some(edge => edge.type === 'script-hook'), 'The graph should map JavaScript selectors to concrete HTML components.');
assert.ok(passing.graph.edges.some(edge => edge.type === 'style-hook'), 'The graph should map CSS selectors to concrete HTML components.');
assert.ok(passing.checks.some(item => item.code === 'BUTTON_ACTION_EVIDENCE'), 'A detected interactive control handler should be recorded as evidence.');
assert.ok(passing.checks.some(item => item.code === 'STYLESHEET_DEPENDENCY_OK'));
assert.ok(passing.checks.some(item => item.code === 'SCRIPT_DEPENDENCY_OK'));
const live = brain.analyze(good, { loaded: true, title: 'Audit Demo', route: '/', links: [{ href: '/about/' }], controls: [{ tag: 'button', id: 'counter', label: 'Tap', disabled: false }], forms: [{ id: 'lead', fieldCount: 1 }], errors: [] });
assert.equal(live.summary.runtimeChecked, true);
assert.ok(live.checks.some(item => item.code === 'LIVE_PREVIEW_LOADED'));
assert.ok(live.checks.some(item => item.code === 'LIVE_LINKS_INSPECTED'));
assert.ok(live.checks.some(item => item.code === 'LIVE_CONTROLS_INSPECTED'));

const broken = {
  id: 'broken-demo', name: 'Broken Demo', routes: { '/': 'index.html' },
  files: {
    'index.html': '<!doctype html><html><head><title>Broken</title><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="missing.css"></head><body><a href="/missing/">Missing route</a><a href="#ghost">Missing anchor</a><button id="dead" type="button">Dead button</button><script src="app.js"></script></body></html>',
    'app.js': "fetch('/api/not-allowed');"
  }
};
const failed = brain.analyze(broken);
assert.equal(failed.status, 'failed');
assert.ok(failed.checks.some(item => item.code === 'STYLESHEET_DEPENDENCY_MISSING'));
assert.ok(failed.checks.some(item => item.code === 'BROKEN_INTERNAL_ROUTE'));
assert.ok(failed.checks.some(item => item.code === 'BROKEN_FRAGMENT'));
assert.ok(failed.checks.some(item => item.code === 'BUTTON_ACTION_UNVERIFIED'));
assert.ok(failed.checks.some(item => item.code === 'DIRECT_NETWORK_BLOCKED'));

const repaired = {
  ...broken,
  routes: { '/': 'index.html', '/missing/': 'pages/missing.html' },
  files: {
    ...broken.files,
    'index.html': broken.files['index.html'].replace('href="missing.css"', 'href="styles.css"').replace('id="dead" type="button">Dead button', 'id="dead" type="button">Toggle details').replace('href="#ghost"', 'href="#ghost"').replace('</body>', '<section id="ghost">Details</section></body>'),
    'pages/missing.html': '<!doctype html><html><head><title>Missing route page</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><h1>Missing route</h1></body></html>',
    'styles.css': 'body{font-family:Arial}',
    'app.js': "document.querySelector('#dead')?.addEventListener('click',function(){this.textContent='Details toggled'});"
  }
};
const retested = brain.analyze(repaired);
assert.equal(retested.status, 'passed', 'After repairing the known route, fragment, CSS and handler issues, the same engine should pass: ' + JSON.stringify(retested.checks.filter(x => x.severity !== 'pass')));
assert.ok(retested.checks.some(item => item.code === 'ROUTE_TARGET_OK' && item.evidence === '/missing/'));
assert.ok(retested.checks.some(item => item.code === 'FRAGMENT_LINK_OK'));
assert.ok(retested.checks.some(item => item.code === 'STYLESHEET_DEPENDENCY_OK'));
assert.ok(retested.checks.some(item => item.code === 'BUTTON_ACTION_EVIDENCE'));
assert.ok(!retested.checks.some(item => item.code === 'DIRECT_NETWORK_BLOCKED'));

assert.ok(middleware.includes('/assets/ovyx-app-studio-project-brain.js?v=20261018-1'), 'The real Pages shell should load Project Brain.');
assert.ok(headers.includes('/assets/ovyx-app-studio-project-brain.js') && headers.includes('Cache-Control: no-store'), 'Project Brain should not be masked by stale asset caching.');
assert.ok(packageJson.scripts.test.includes('scripts/ovyx-app-studio-project-brain.test.mjs'), 'The analyzer regression test should run under npm test.');
assert.ok(workflow.includes('assets/ovyx-app-studio-project-brain.js'), 'CI path filters should cover Project Brain.');
assert.ok(browserTest.includes('window.__OVYX_PROJECT_BRAIN_REPORT__'), 'The browser integration test should verify the actual Project Brain report.');
assert.ok(builder.includes('.ovyx-lb-panel :is(input,button,summary):focus-visible'), 'The existing malformed keyboard-focus CSS selector should remain fixed.');
assert.ok(!builder.includes('}..ovyx-lb-panel :is(input,button,summary):focus-visible'), 'The old malformed CSS selector must not regress.');

console.log('OVYX Project Brain checks passed: dependency graph, component hooks, routes, control evidence, live DOM evidence, intentional broken-fixture detection and clean re-test after repair.');
