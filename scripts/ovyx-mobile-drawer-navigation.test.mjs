import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const asset = await readFile(new URL('../assets/ovyx-mobile-drawer-navigation.js', import.meta.url), 'utf8');
const middleware = await readFile(new URL('../functions/_middleware.js', import.meta.url), 'utf8');
const source = await readFile(new URL('../index.html', import.meta.url), 'utf8');

assert.doesNotThrow(() => new vm.Script(asset), 'Mobile drawer navigation runtime must parse.');
assert.match(middleware, /ovyx-mobile-drawer-navigation\.js\?v=20261120-1/, 'Pages must load the mobile tap-navigation authority.');
for (const route of ['home', 'webstudio', 'appstudio', 'templates', 'projects']) {
  assert.ok(asset.includes(route + ": '" + route + "'"), 'The mobile drawer must route ' + route + ' through Router.go.');
}
assert.match(asset, /#mobile-drawer \[data-mobile-nav\]/, 'Only actual mobile drawer navigation items may be intercepted.');
assert.match(asset, /stopImmediatePropagation/, 'The delegated action must not run twice with the legacy inline handler.');
assert.match(source, /data-mobile-nav="workspace"/, 'Manage Website keeps its existing mobile entry.');
assert.match(source, /data-mobile-nav="sharing"/, 'Project Sharing keeps its existing mobile entry.');

let listener = null;
let route = '';
let closed = 0;
const drawer = {
  dataset: {},
  addEventListener(type, fn, capture) { if (type === 'click' && capture) listener = fn; },
  querySelectorAll() { return []; }
};
const documentMock = {
  readyState: 'complete',
  getElementById(id) { return id === 'mobile-drawer' ? drawer : null; },
  addEventListener() {}
};
const windowMock = {
  innerWidth: 390,
  addEventListener() {},
  Router: { go(value) { route = value; } },
  MobileDrawer: { close() { closed += 1; } }
};
vm.runInNewContext(asset, { window: windowMock, document: documentMock });
assert.equal(typeof listener, 'function', 'The existing mobile drawer must receive one delegated tap handler.');
let prevented = false, stopped = false;
const item = { disabled: false, getAttribute: name => name === 'data-mobile-nav' ? 'projects' : null };
listener({
  target: { closest(selector) { return selector === '#mobile-drawer [data-mobile-nav]' ? item : null; } },
  preventDefault() { prevented = true; },
  stopImmediatePropagation() { stopped = true; }
});
assert.equal(route, 'projects', 'A mobile Projects tap must navigate through the canonical Router.');
assert.equal(prevented, true, 'The delegated route action must own the tap.');
assert.equal(stopped, true, 'The old inline handler must not duplicate navigation.');
assert.equal(closed, 0, 'Router.go owns normal route drawer closure.');

route = '';
const desktopWindow = { ...windowMock, innerWidth: 1280 };
const desktopDrawer = { dataset: {}, addEventListener() {}, querySelectorAll() {} };
vm.runInNewContext(asset, { window: desktopWindow, document: { ...documentMock, getElementById: () => desktopDrawer } });
assert.equal(route, '', 'Desktop sidebar interactions must remain untouched.');

console.log('OVYX mobile drawer tap-navigation contract checks passed.');
