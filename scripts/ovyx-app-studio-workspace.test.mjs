import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const runtime = read('assets/ovyx-app-studio-workspace.js');
const middleware = read('functions/_middleware.js');
const headers = read('_headers');
const packageJson = JSON.parse(read('package.json'));
const workflow = read('.github/workflows/ovyx-assistant-workspace-browser.yml');

execFileSync(process.execPath, ['--check', fileURLToPath(new URL('../assets/ovyx-app-studio-workspace.js', import.meta.url))], { stdio: 'pipe' });
assert.ok(runtime.includes('SECTIONS = ['), 'The workspace must retain its canonical four-section map.');
for (const id of ['ovyx-app-studio-url-analyzer-panel','ovyx-app-studio-link-builder','ovyx-app-studio-project-brain','ovyx-app-studio-release']) {
  assert.ok(runtime.includes(id), 'The workspace state must continue to identify the existing section: ' + id);
}
assert.ok(!runtime.includes('data-ovyx-as-workspace-target') && !runtime.includes('scrollToSection'), 'The workspace card must not repeat the four-step navigation already provided by the guided flow.');
assert.ok(runtime.includes('aria-live') && runtime.includes('aria-labelledby'), 'Workspace status and heading must remain accessible.');
assert.ok(runtime.includes("dataset.ovyxAsWorkspaceAction = 'expand'") && runtime.includes("dataset.ovyxAsWorkspaceAction = 'collapse'"), 'Expand and collapse must remain available as secondary actions.');
assert.ok(runtime.includes('More actions') && runtime.includes('ovyx-as-workspace-more'), 'Less-used controls must be grouped under a native More actions disclosure.');
assert.ok(runtime.includes('details.forEach(item => { item.open = true; })') && runtime.includes('details.forEach(item => { item.open = false; })'), 'Expand and collapse must update actual disclosures.');
assert.ok(runtime.includes('navigator.clipboard.writeText') && runtime.includes('Clipboard access is unavailable'), 'Copy summary must report real clipboard success or failure.');
assert.ok(runtime.includes('savedToProjects === true') && runtime.includes('runtimeChecked === true'), 'The workspace must distinguish cloud-saved and runtime-verified projects.');
assert.ok(runtime.includes('Device / preview only'), 'The workspace must not imply that an unsaved project is cloud-persisted.');
assert.ok(runtime.includes('MutationObserver') && runtime.includes('ovyx:link-app-generated'), 'The workspace must refresh when existing App Studio state changes.');
assert.ok(runtime.includes('prefers-reduced-motion:reduce'), 'The workspace must respect reduced-motion preferences.');
assert.ok(!runtime.includes('Switch workspace') && !runtime.includes('Open Assistant'), 'Duplicate workspace-switching and assistant shortcuts must not appear in the App Studio dock.');
assert.ok(!runtime.includes("dataset.ovyxAsWorkspaceAction = 'workspace'") && !runtime.includes("dataset.ovyxAsWorkspaceAction = 'assistant'"), 'Removed shortcuts must not leave dead action handlers.');
assert.ok(runtime.includes("dataset.ovyxAsWorkspaceAction = 'projects'") && runtime.includes("window.switchView('projects')"), 'The primary Open Projects action must remain connected to existing navigation.');
assert.ok(runtime.includes('root.insertBefore(dock, root.firstChild)'), 'The App Workspace must remain the first App Studio element.');
assert.ok(middleware.includes('/assets/ovyx-app-studio-workspace.js?v=20261115-1'), 'The Pages shell must load the current simplified workspace runtime.');
assert.ok(headers.includes('/assets/ovyx-app-studio-workspace.js') && headers.includes('Cache-Control: no-store'), 'The runtime must avoid stale caching.');
assert.ok(packageJson.scripts.test.includes('scripts/ovyx-app-studio-workspace.test.mjs'), 'The regression test must be part of npm test.');
assert.ok(workflow.includes('scripts/ovyx-app-studio-workspace.browser.test.mjs'), 'CI must run the desktop/mobile workspace browser test.');
assert.ok(!runtime.includes('fetch(') && !runtime.includes('OVYXAIService'), 'The workspace must reuse existing generation and API actions rather than duplicating them.');
console.log('OVYX App Studio workspace checks passed: one guided navigator, compact actions, truthful project state, feedback, reduced motion and preserved service boundaries.');
