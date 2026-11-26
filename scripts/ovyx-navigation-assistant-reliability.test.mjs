import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const nav = await readFile(new URL('../assets/ovyx-navigation-reliability.js', import.meta.url), 'utf8');
const pageCss = await readFile(new URL('../assets/css/ovyx-ai-assistant-page.css', import.meta.url), 'utf8');
const middleware = await readFile(new URL('../functions/_middleware.js', import.meta.url), 'utf8');
assert.doesNotThrow(() => new vm.Script(nav));
assert.match(middleware, /ovyx-navigation-reliability\.js\?v=20261126-1/);
assert.match(middleware, /ovyx-ai-assistant-page\.css\?v=20261126-2/);
assert.match(pageCss, /#view-ai-assistant #kernel-brain-bot-panel\.ovyx-native-workspace #bot-chat-history \.ovyx-native-welcome\s*\{[\s\S]*?background:\s*transparent\s*!important;[\s\S]*?box-shadow:\s*none\s*!important;[\s\S]*?padding:\s*0\s*!important;/,
  'The old opaque welcome board must be removed without deleting its message.');

let clickHandler = null;
let routed = [];
let closed = 0;
const bodyClasses = new Set();
const drawer = { querySelectorAll() { return []; }, matches() { return false; } };
const documentMock = {
  readyState: 'complete',
  body: { classList: { remove(...names) { names.forEach(name => bodyClasses.delete(name)); } } },
  addEventListener(type, handler, capture) { if (type === 'click' && capture) clickHandler = handler; },
  getElementById(id) { return id === 'mobile-drawer' ? drawer : null; }
};
const windowMock = {
  innerWidth: 390,
  addEventListener() {},
  requestAnimationFrame(fn) { fn(); return 1; },
  Router: { go(route) { routed.push(route); } },
  MobileDrawer: { close() { closed += 1; } }
};
vm.runInNewContext(nav, { window: windowMock, document: documentMock, MutationObserver: undefined });
assert.equal(typeof clickHandler, 'function');

function click({ attr, value, label, context = true, id = '' }) {
  const attrs = { [attr]: value };
  const item = {
    id, disabled: false, textContent: label || '',
    getAttribute(name) { return attrs[name] ?? (name === 'aria-label' ? null : null); },
    closest(selector) {
      if (selector === '#mobile-drawer,#mobile-sidebar,#v52-account-menu') return context ? drawer : null;
      if (selector.includes('#mobile-drawer') || selector.includes('#app-sidebar') ||
          selector.includes('data-navigation') || selector.includes('[role="navigation"]') ||
          selector.includes('.sidebar')) return context ? drawer : null;
      return null;
    }
  };
  let prevented = false, stopped = false;
  clickHandler({
    target: { closest(selector) {
      if (attr !== 'none' && (selector.includes('data-mobile-nav') || selector.includes('data-nav') ||
          selector.includes('data-sidebar-nav') || selector.includes('data-v52-account') ||
          selector.includes('data-v34-account') || selector.includes('data-v34-nav') ||
          selector.includes('data-route') || selector.includes('data-ovyx-route') ||
          selector.includes('#desktop-ai-assistant'))) return item;
      if (selector === 'button,a,[role="button"],[role="menuitem"]') return context ? item : null;
      return null;
    }},
    preventDefault() { prevented = true; },
    stopImmediatePropagation() { stopped = true; }
  });
  return { prevented, stopped };
}

for (const [attr, value, expected] of [
  ['data-v52-account', 'plans', 'pricing'],
  ['data-v52-account', 'help', 'support'],
  ['data-v52-account', 'settings', 'settings'],
  ['data-v52-account', 'ai-assistant', 'ai-assistant'],
  ['data-mobile-nav', 'projects', 'projects'],
  ['data-nav', 'settings', 'settings']
]) {
  const result = click({ attr, value, context: true });
  assert.equal(routed.at(-1), expected, value + ' must route to the canonical destination.');
  assert.equal(result.prevented, true);
  assert.equal(result.stopped, true);
}
assert.equal(closed, 6, 'Mobile navigation should close the drawer after successful route changes.');

routed = [];
const labelRoutes = [
  ['AI Assistant', 'ai-assistant'],
  ['Plans', 'pricing'],
  ['Settings', 'settings'],
  ['Help', 'support']
];
for (const [label, expected] of labelRoutes) {
  const result = click({ attr: 'none', value: '', label, context: true });
  assert.equal(routed.at(-1), expected, label + ' label-only navigation must route from the real menu context.');
  assert.equal(result.prevented, true);
}
const unknown = click({ attr: 'none', value: '', label: 'Delete project', context: true });
assert.equal(unknown.prevented, false, 'Unrelated actions must not be intercepted.');

console.log('OVYX global navigation and Assistant welcome-surface regression tests passed.');