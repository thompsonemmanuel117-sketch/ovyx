import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const menuStart = html.indexOf('id="ws-preview-menu"');
assert.ok(menuStart >= 0, 'The Web Studio preview three-dot menu must exist.');
const menuEnd = html.indexOf('</div>', menuStart);
assert.ok(menuEnd > menuStart, 'The preview menu must have a closing container.');
const menuHtml = html.slice(menuStart, menuEnd);

const actions = [...menuHtml.matchAll(/data-ws-menu="([^"]+)"/g)].map(match => match[1]);
const expected = [
  'mobile-chat', 'pages', 'sections', 'assets', 'viewport', 'starter-pages',
  'export', 'code', 'files', 'visual', 'tests', 'console', 'history',
  'download', 'deploy', 'convert-mobile-app', 'delete',
];
assert.deepEqual(actions, expected, 'Every documented preview menu action must appear exactly once and in a stable order.');

const baseHandlerStart = html.indexOf('handlePreviewMenu(action){');
const baseHandlerEnd = html.indexOf('togglePreviewMenu(){', baseHandlerStart);
assert.ok(baseHandlerStart >= 0 && baseHandlerEnd > baseHandlerStart, 'The base preview menu dispatcher must exist.');
const baseHandler = html.slice(baseHandlerStart, baseHandlerEnd);

const patchStart = html.indexOf('function patchMenu(){');
const patchEnd = html.indexOf('patchMenu();', patchStart);
assert.ok(patchStart >= 0 && patchEnd > patchStart, 'The supplemental preview menu dispatcher must exist.');
const patch = html.slice(patchStart, patchEnd);

for (const action of expected) {
  const casePattern = new RegExp("case\\s*['\"]" + action.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&') + "['\"]\\s*:");
  assert.ok(casePattern.test(baseHandler) || casePattern.test(patch),
    'Preview menu action "' + action + '" must route to a real handler rather than the unavailable-tool fallback.');
}

for (const token of [
  'renderPages()', 'renderSections()', 'renderAssets()', 'renderViewport()',
  'renderStarterPages()', 'renderExport()', 'downloadFrameworkProject',
  'openCodeEditor(this.entryFile())', 'showFileGraph()', 'runTests(true)',
  'openEngineeringConsole', 'openHistory()', 'downloadProject()', 'openDeployPanel()',
  'handleConvertToMobileApp()', 'deleteActiveProjectAndReset',
]) {
  assert.ok(html.includes(token), 'Preview menu is missing its expected operation: ' + token);
}

assert.ok(html.includes("document.querySelectorAll('[data-ws-menu]').forEach(btn => btn.addEventListener('click', () => this.handlePreviewMenu(btn.dataset.wsMenu)))"),
  'Preview menu buttons must be connected to the dispatcher.');
assert.ok(html.includes('window.OVYXPreviewProjectControls?.openSections?.()'), 'Sections must open the real project sections tool.');
assert.ok(html.includes('window.OVYXPreviewProjectControls?.openAssets?.()'), 'Assets must open the real project assets tool.');
assert.ok(html.includes('function renderExport()'), 'Framework Export must show the export choices.');
assert.ok(html.includes("body.querySelectorAll('[data-e]').forEach"), 'Framework Export format choices must be clickable.');

console.log('Web Studio preview menu contract tests passed: all 17 actions are routed to real handlers.');
