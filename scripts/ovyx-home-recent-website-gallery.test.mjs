import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../assets/ovyx-home-recent-website-gallery.js', import.meta.url), 'utf8');
const middleware = await readFile(new URL('../functions/_middleware.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../assets/css/ovyx-home-recent-website-gallery.css', import.meta.url), 'utf8');
assert.doesNotThrow(() => new vm.Script(source), 'Recent website gallery runtime must parse.');

const listeners = {};
const host = { innerHTML: '' };
const prompt = { placeholder: '', attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } };
const buildLabel = { textContent: 'Start building' };
const build = { querySelector(selector) { return selector === 'span' ? buildLabel : null; } };
const document = {
  readyState: 'complete',
  getElementById(id) { return id === 'home-projects-grid' ? host : id === 'prompt-home-input' ? prompt : id === 'v59-build' ? build : null; },
  addEventListener(type, listener) { (listeners[type] ||= []).push(listener); }
};
const storage = new Map();
const localStorage = {
  getItem(key) { return storage.has(key) ? storage.get(key) : null; },
  setItem(key, value) { storage.set(key, String(value)); }
};
const websiteA = {
  id: 'site-a', name: 'Studio Portfolio', type: 'website', updatedAt: '2026-11-13T10:25:00.000Z',
  description: 'THIS LONG BUILD PROMPT MUST NEVER APPEAR IN THE RECENT WEBSITE CARD',
  pages: [{ name: 'Home', sections: [{ content: { heading: 'Studio Portfolio', subheading: 'A clean creative portfolio', cta: 'View work' }, styles: { background: '#111827', color: '#ffffff' } }] }]
};
const websiteB = {
  id: 'site-b', name: 'Coffee House', projectType: 'website', updatedAt: 1794300000000,
  previewUrl: 'https://example.com/coffee-preview.webp',
  pages: [{ name: 'Home', sections: [] }]
};
const appProject = { id: 'app-a', name: 'Mobile App', type: 'mobile app', updatedAt: Date.now(), pages: [{ name: 'Home' }] };
const state = { projects: [websiteA, websiteB, appProject] };
let opened = '';
const window = {
  KernelState: state,
  firebase: { auth: () => ({ currentUser: { uid: 'test-user' } }) },
  ProjectStore: {
    list() { return state.projects.slice(); },
    open(id) { opened = id; },
    createPromptModal() {}
  },
  showToast() {}
};
vm.runInNewContext(source, { window, document, localStorage, Intl, Date, encodeURIComponent, console });

const api = window.OVYXHomeRecentWebsiteGallery;
assert.equal(api.isWebsite(websiteA), true);
assert.equal(api.isWebsite(appProject), false, 'Mobile apps must not appear in the website gallery.');
assert.deepEqual(Array.from(api.sortWebsites(state.projects), p => p.id), ['site-a', 'site-b']);
assert.match(host.innerHTML, /Preview of Studio Portfolio/);
assert.match(host.innerHTML, /data:image\/svg\+xml/);
assert.match(host.innerHTML, /Nov 13, 2026/);
assert.match(host.innerHTML, /10:25/);
assert.doesNotMatch(host.innerHTML, /THIS LONG BUILD PROMPT/);
assert.doesNotMatch(host.innerHTML, /Coffee House.*THIS LONG BUILD PROMPT/);
assert.match(host.innerHTML, /https:\/\/example\.com\/coffee-preview\.webp/);
assert.doesNotMatch(host.innerHTML, /data-ovyx-website-pin=/, 'Recent cards should not expose pin-management controls.');
assert.match(host.innerHTML, /data-ovyx-website-open="site-a"/);
assert.equal(prompt.placeholder, 'Describe what you want to build with OVYX…', 'The familiar dashboard prompt copy must be restored.');
assert.equal(prompt.attributes['aria-label'], 'Describe your project');
assert.equal(buildLabel.textContent, 'Build', 'The existing Build action label and arrow should remain intact.');

assert.match(host.innerHTML, /Coffee House/);

const openNode = { getAttribute: name => name === 'data-ovyx-website-open' ? 'site-a' : null };
for (const handler of listeners.click || []) {
  handler({
    target: { closest(selector) { return selector === '[data-ovyx-website-open]' ? openNode : null; } },
    preventDefault() {}, stopPropagation() {}
  });
}
assert.equal(opened, 'site-a', 'Opening a website preview must reuse the existing ProjectStore.open route.');

const extraSites = Array.from({ length: 6 }, (_, index) => ({
  id: 'site-' + index, name: 'Recent Website ' + index, type: 'website',
  updatedAt: '2026-11-' + String(14 - index).padStart(2, '0') + 'T10:00:00.000Z',
  pages: [{ name: 'Home', sections: [] }]
}));
state.projects = [appProject, ...extraSites];
api.renderHome();
assert.equal((host.innerHTML.match(/data-ovyx-website-card=/g) || []).length, 5,
  'Home must show exactly five most recent websites when six are available.');
assert.match(host.innerHTML, /Recent Website 0/);
assert.doesNotMatch(host.innerHTML, /Recent Website 5/, 'The sixth website belongs on the full Recent page, not Home.');
state.projects = [appProject];
api.renderHome();
assert.match(host.innerHTML, /No recent websites/);
assert.doesNotMatch(host.innerHTML, /data-ovyx-home-create/, 'Home Recent should not show a large Start Building CTA.');
assert.doesNotMatch(host.innerHTML, /Mobile App/);

assert.match(css, /#view-home #home-projects-grid/);
assert.match(css, /aspect-ratio:\s*16\s*\/\s*9/);
assert.match(css, /min-height:\s*104px/, 'The prompt box should return to its familiar proportions.');
assert.match(css, /prefers-reduced-motion/);
assert.match(middleware, /ovyx-home-recent-website-gallery\.js\?v=20261114-1/);
assert.match(middleware, /ovyx-home-recent-website-gallery\.css\?v=20261113-1/);
assert.match(middleware, /ovyx-home-recent-page\.js\?v=20261114-2/);
assert.match(middleware, /ovyx-home-recent-page\.css\?v=20261114-1/);
console.log('OVYX Home recent website gallery, preview, date/time, pin and edit checks passed.');
