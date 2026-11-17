import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../assets/ovyx-home-recent-page.js', import.meta.url), 'utf8');
const middleware = await readFile(new URL('../functions/_middleware.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

assert.doesNotThrow(() => new vm.Script(source), 'Dashboard navigation runtime must parse.');

const listeners = {};
let removedTools = 0;
let destination = '';
const heading = { textContent: '' };
const eyebrow = { textContent: '' };
const viewAll = {
  textContent: '',
  attributes: {},
  removeAttribute(name) { delete this.attributes[name]; },
  setAttribute(name, value) { this.attributes[name] = value; }
};
const bell = { style: { setProperty() {} } };
const inboxRoot = { setAttribute() {} };
const toolsSection = { remove() { removedTools += 1; } };
const document = {
  readyState: 'complete',
  querySelector(selector) {
    return ({
      '#view-home .v59-workspace-section': toolsSection,
      '#home-recent-anchor .v59-section-head h2': heading,
      '#home-recent-anchor .v59-section-head .v59-eyebrow': eyebrow,
      '#home-recent-anchor .v59-section-head button': viewAll
    })[selector] || null;
  },
  querySelectorAll() { return []; },
  getElementById(id) {
    return id === 'ovyx-account-notifications-root' ? inboxRoot
      : id === 'ovyx-notification-bell' ? bell : null;
  },
  addEventListener(type, listener) { (listeners[type] ||= []).push(listener); }
};
const window = {
  KernelState: { activeView: 'home' },
  Router: { go(route) { destination = route; } },
  addEventListener(type, listener) { (listeners['window:' + type] ||= []).push(listener); }
};
vm.runInNewContext(source, { window, document });
assert.equal(removedTools, 1, 'The Start tools section must be removed from the Home dashboard.');
assert.equal(heading.textContent, 'Recent websites');
assert.equal(eyebrow.textContent, 'RECENT');
assert.equal(viewAll.attributes['data-ovyx-open-projects'], 'true');
assert.equal(viewAll.attributes['aria-label'], 'View all projects');
assert.equal(viewAll.attributes.onclick, undefined, 'The old inline action must not trigger a second route.');
for (const handler of listeners.click || []) {
  handler({
    target: { closest: selector => selector === '[data-ovyx-open-projects]' ? viewAll : null },
    preventDefault() {},
    stopImmediatePropagation() {}
  });
}
assert.equal(destination, 'projects', 'View all must navigate directly to the main Projects library.');
assert.equal(typeof window.OVYXRecentWebsitesPage.open, 'function');
assert.match(source, /#view-home \.v59-workspace-section/,
  'The dashboard Start tools section must be removed from the overview.');
assert.match(source, /data-ovyx-open-projects/,
  'View all must use a dedicated Projects destination action.');
assert.match(source, /Router\?\.go\?\.\('projects'\)/,
  'View all must open the existing main Projects route.');
assert.doesNotMatch(source, /view-recent|Router\?\.go\?\.\('recent'\)|data-ovyx-open-recent/,
  'The duplicate Recent page and its route must no longer be created or opened.');
assert.match(source, /button\[data-nav="recent-projects"\].*button\[onclick\*="home-recent-anchor"\]/,
  'Duplicate desktop and mobile Recent sidebar shortcuts must stay removed.');
assert.match(source, /button\.remove\(\)/);
assert.match(source, /ovyx-account-notifications-root/,
  'The authenticated Inbox root must remain mounted.');
assert.match(source, /setProperty\('visibility', isHome\(\) \? 'hidden' : ''/,
  'Only the floating notification trigger should be hidden on Home.');
assert.match(source, /setProperty\('pointer-events', isHome\(\) \? 'none' : ''/);
assert.match(source, /data-ovyx-home-hidden/);
assert.match(source, /Recent projects/);
assert.match(source, /PROJECTS/);
assert.match(source, /node\.textContent !== value/,
  'Navigation text updates must avoid redundant DOM writes.');
assert.doesNotMatch(source, /observer\.observe\(document\.body/,
  'Dashboard navigation must not watch the entire application DOM.');

assert.match(html, /id="view-projects"/,
  'The existing main Projects view must remain in the application shell.');
assert.match(html, /id="projects-grid-feed"/,
  'The main Projects inventory must retain its real project feed.');
assert.match(html, /id="projects-search"/,
  'The main Projects search must remain available.');
assert.match(html, /id="home-projects-grid"/,
  'The compact dashboard recent-project preview must remain.');

assert.match(middleware, /ovyx-home-recent-page\.js\?v=20261117-1/,
  'The dashboard declutter runtime must load with a fresh cache version.');
assert.doesNotMatch(middleware, /ovyx-home-recent-page\.css/,
  'The retired Recent page stylesheet must not be injected.');
assert.match(middleware, /ovyx-home-recent-website-gallery\.js/,
  'The existing dashboard project preview must remain loaded.');
assert.match(middleware, /ovyx-home-recent-website-gallery\.css/,
  'The existing dashboard project preview styles must remain loaded.');

console.log('OVYX dashboard Projects destination and Start tools removal checks passed.');
