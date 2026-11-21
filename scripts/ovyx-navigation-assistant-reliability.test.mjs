import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const nav = await readFile(new URL('../assets/ovyx-navigation-reliability.js', import.meta.url), 'utf8');
const composer = await readFile(new URL('../assets/ovyx-assistant-composer-reliability.js', import.meta.url), 'utf8');
const middleware = await readFile(new URL('../functions/_middleware.js', import.meta.url), 'utf8');
assert.doesNotThrow(() => new vm.Script(nav));
assert.doesNotThrow(() => new vm.Script(composer));
assert.match(middleware, /ovyx-navigation-reliability\.js\?v=20261121-1/);
assert.match(middleware, /ovyx-assistant-composer-reliability\.js\?v=20261121-1/);
for (const route of ['home','webstudio','appstudio','workspace','projects','templates','settings','pricing','support','inbox']) {
  assert.ok(nav.includes(route + ": '"), 'Navigation route must be supported: ' + route);
}
assert.match(nav, /document\.addEventListener\('click', handleNavigation, true\)/, 'Navigation must survive mobile drawer replacement through document delegation.');
assert.match(nav, /data-v52-account/, 'Account menu Help and Plans entries must be covered.');
assert.match(composer, /visualViewport\?\.addEventListener\?\.\('resize'/, 'Composer must react to Android keyboard viewport resizing.');
assert.match(composer, /Math\.min\(input\.scrollHeight \|\| 48, max\)/, 'Composer text height must be capped to the visible viewport.');
assert.match(composer, /flex: 1 1 0%/, 'Composer textarea must be allowed to shrink without covering adjacent controls.');

let delegatedClick = null;
const routed = [];
let drawerClosed = 0;
const mockWindow = {
  __OVYX_NAVIGATION_RELIABILITY_V1__: false,
  MobileDrawer: { close() { drawerClosed += 1; } },
  Router: { go(route) { routed.push(route); } },
  addEventListener() {}
};
const mockDocument = {
  addEventListener(type, handler, capture) {
    if (type === 'click' && capture) delegatedClick = handler;
  }
};
vm.runInNewContext(nav, { window: mockWindow, document: mockDocument });
assert.equal(typeof delegatedClick, 'function', 'One document-level capture handler must own navigation taps.');
for (const [attribute, value, expected] of [
  ['data-v52-account', 'help', 'support'],
  ['data-v52-account', 'plans', 'pricing'],
  ['data-mobile-nav', 'projects', 'projects'],
  ['data-nav', 'settings', 'settings']
]) {
  const item = {
    disabled: false,
    getAttribute(name) { return name === attribute ? value : null; },
    closest(selector) { return selector === '#mobile-drawer' ? (attribute === 'data-mobile-nav' || attribute === 'data-v52-account' ? {} : null) : null; }
  };
  let prevented = false, stopped = false;
  delegatedClick({
    target: { closest(selector) { return selector.includes('data-mobile-nav') || selector.includes('data-v52-account') || selector.includes('data-nav') ? item : null; } },
    preventDefault() { prevented = true; },
    stopImmediatePropagation() { stopped = true; }
  });
  assert.equal(routed.at(-1), expected, value + ' navigation must reach the canonical route.');
  assert.equal(prevented, true);
  assert.equal(stopped, true);
}
assert.equal(drawerClosed, 3, 'Mobile drawer taps must close the drawer after route navigation.');

console.log('OVYX navigation and assistant composer reliability contracts passed.');
