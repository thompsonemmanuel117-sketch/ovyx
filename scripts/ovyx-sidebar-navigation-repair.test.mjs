import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const runtime = await readFile(new URL('../assets/ovyx-sidebar-navigation-repair.js', import.meta.url), 'utf8');
const middleware = await readFile(new URL('../functions/_middleware.js', import.meta.url), 'utf8');
const source = await readFile(new URL('../index.html', import.meta.url), 'utf8');

assert.doesNotThrow(() => new vm.Script(runtime), 'Sidebar repair runtime must parse.');
assert.ok(runtime.includes('ProjectStore\\.createPromptModal'), 'Only the duplicate mobile sidebar create-project action is removed.');
assert.match(runtime, /window\.OVYXDesktopShell\.setCollapsed\(!collapsed, true\)/, 'Desktop sidebar visibility and inert state must be changed through the canonical shell authority.');
assert.match(runtime, /sidebar\.inert \|\| sidebar\.getAttribute\('aria-hidden'\) === 'true'/, 'A visually open but inert sidebar must be detected and repaired.');
assert.match(runtime, /window\.MobileDrawer\.open/, 'The mobile menu must continue opening the existing drawer.');
assert.match(runtime, /ovyx-webstudio-active/, 'Web Studio keeps its own sidebar behavior.');
assert.match(source, /ProjectStore\.createPromptModal\(\); MobileDrawer\.close\(\)/, 'The legacy mobile create entry remains identifiable for targeted removal.');
assert.match(source, /data-nav="projects" onclick="Router\.go\('projects'\)"/, 'The Projects library navigation remains available.');
assert.match(source, /data-modal-create/, 'The canonical project creation flow remains in Projects.');
assert.match(middleware, /ovyx-sidebar-navigation-repair\.js\?v=20261117-1/, 'Pages must load the repaired sidebar authority after legacy shell scripts.');


let removed = false;
let collapseCall = null;
const menu = { dataset: {}, onclick: null };
const createEntry = {
  textContent: 'New Project Start from an idea',
  getAttribute: () => 'ProjectStore.createPromptModal(); MobileDrawer.close()',
  remove: () => { removed = true; }
};
const drawer = { querySelectorAll: () => [createEntry] };
const documentMock = {
  readyState: 'complete',
  getElementById: id => id === 'mobile-drawer' ? drawer : id === 'ovyx-v34-menu-source' ? menu : null,
  documentElement: { dataset: { ovyxSidebar: 'collapsed' }, classList: { remove() {} } },
  body: { classList: { contains: () => false } }
};
const windowMock = {
  innerWidth: 1280,
  matchMedia: () => ({ matches: true }),
  addEventListener() {},
  OVYXDesktopShell: { setCollapsed: (...args) => { collapseCall = args; } }
};
vm.runInNewContext(runtime, { window: windowMock, document: documentMock });
assert.equal(removed, true, 'The duplicate New Project entry must be removed from the mobile drawer.');
assert.equal(typeof menu.onclick, 'function', 'The top-bar menu must receive the canonical sidebar toggle.');
menu.onclick({ preventDefault() {}, stopPropagation() {} });
assert.deepEqual(collapseCall, [false, true], 'Opening a visually collapsed sidebar must also clear its inert state through the canonical controller.');

console.log('OVYX sidebar navigation repair contract checks passed.');
