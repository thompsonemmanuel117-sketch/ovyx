import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const asset = await readFile(new URL('../assets/ovyx-home-dashboard-behavior.js', import.meta.url), 'utf8');
const middleware = await readFile(new URL('../functions/_middleware.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
assert.doesNotThrow(() => new vm.Script(asset), 'Dashboard behavior runtime must parse.');

const listeners = {};
const elements = {};
const makeElement = (id, initial = {}) => ({
  id,
  value: '',
  innerHTML: '',
  textContent: '',
  style: {},
  ...initial,
  options: [{ value: 'balanced', textContent: 'OVYX Everyday' }, { value: 'fast', textContent: 'OVYX Quick' }, { value: 'quality', textContent: 'OVYX Deep' }],
  attributes: {},
  setAttribute(name, value) { this.attributes[name] = value; },
  querySelector(selector) {
    if (selector === 'span') return this.noteCopy || null;
    return null;
  },
  dispatchEvent(event) {
    for (const listener of listeners[event.type] || []) listener({ target: this, preventDefault() {} });
  }
});
elements['home-projects-grid'] = makeElement('home-projects-grid');
elements['v59-ai-mode-select'] = makeElement('v59-ai-mode-select', { value: 'balanced' });
elements['v59-routing-note'] = makeElement('v59-routing-note', { noteCopy: { textContent: '' } });
elements['ws-brain-depth'] = makeElement('ws-brain-depth', { value: '2' });

const projects = [
  { id: 'older', updatedAt: '2026-11-01T10:00:00.000Z' },
  { id: 'newest', updatedAt: '2026-11-13T10:00:00.000Z' },
  { id: 'middle', updatedAt: 1794300000000 },
  { id: 'oldest', updatedAt: '2026-10-01T10:00:00.000Z' }
];
let created = 0;
const windowEvents = {};
const document = {
  readyState: 'complete',
  head: { appendChild() {} },
  getElementById(id) { return elements[id] || null; },
  createElement() { return { textContent: '', id: '' }; },
  addEventListener(type, listener) { (listeners[type] ||= []).push(listener); }
};
const localStore = new Map();
const localStorage = {
  getItem(key) { return localStore.get(key) ?? null; },
  setItem(key, value) { localStore.set(key, String(value)); }
};
const window = {
  KernelState: { projects },
  ProjectStore: {
    list() { return window.KernelState.projects.slice(); },
    card(project) { return '<article>' + project.id + '</article>'; },
    createPromptModal() { created += 1; }
  },
  WebStudio: { responseDepth: 2 },
  Router: { go() {} },
  addEventListener(type, listener) { (windowEvents[type] ||= []).push(listener); }
};
class FakeEvent { constructor(type, options = {}) { this.type = type; this.bubbles = options.bubbles; } }
vm.runInNewContext(asset, { window, document, localStorage, Event: FakeEvent, console });

assert.deepEqual(Array.from(window.ProjectStore.list(), project => project.id), ['newest', 'middle', 'older', 'oldest'],
  'Recent project ordering must handle ISO dates and numeric timestamps.');
assert.match(elements['home-projects-grid'].innerHTML, /newest.*middle.*older/,
  'The Home dashboard must render the three most recently active projects.');

window.KernelState.projects = [];
window.ProjectStore.renderHome();
assert.match(elements['home-projects-grid'].innerHTML, /No projects yet/);
assert.match(elements['home-projects-grid'].innerHTML, /data-ovyx-home-create/,
  'The empty state must contain a real, actionable create control.');
const clickHandlers = listeners.click || [];
for (const handler of clickHandlers) {
  handler({ target: { closest: selector => selector === '[data-ovyx-home-create]' ? {} : null }, preventDefault() {} });
}
assert.equal(created, 1, 'The empty-state action must call the existing project creation flow.');

const changeHandlers = listeners.change || [];
elements['v59-ai-mode-select'].value = 'fast';
for (const handler of changeHandlers) handler({ target: elements['v59-ai-mode-select'] });
assert.equal(window.WebStudio.responseDepth, 1, 'Quick mode must map to the existing concise response depth.');
assert.equal(localStorage.getItem('ovyx.ws.responseDepth.v1'), '1');
assert.equal(elements['v59-ai-mode-select'].options[1].textContent, 'Fast');
assert.equal(elements['v59-ai-mode-select'].attributes['aria-label'], 'Response detail');
assert.match(elements['v59-routing-note'].noteCopy.textContent, /Fast.*Get results quickly for simple requests/);

elements['v59-ai-mode-select'].value = 'quality';
for (const handler of changeHandlers) handler({ target: elements['v59-ai-mode-select'] });
assert.equal(window.WebStudio.responseDepth, 3, 'Deep mode must map to the existing detailed response depth.');
assert.equal(localStorage.getItem('ovyx.ws.responseDepth.v1'), '3');
assert.equal(elements['v59-ai-mode-select'].options[2].textContent, 'Detailed');
assert.equal(elements['v59-ai-mode-select'].title, 'More careful, thorough responses for complex projects.');

elements['ws-brain-depth'].value = '2';
for (const handler of listeners.input || []) handler({ target: elements['ws-brain-depth'] });
assert.equal(elements['v59-ai-mode-select'].value, 'balanced',
  'The dashboard mode selector must stay synchronized with Web Studio response depth.');

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
assert.ok(packageJson.scripts.test.includes('scripts/ovyx-home-dashboard-behavior.test.mjs'),
  'The new dashboard behavior regression test must run in npm test.');
assert.match(middleware, /ovyx-home-dashboard-behavior\.js\?v=20261114-1/,
  'The dashboard behavior runtime must be injected into the Pages shell.');
assert.match(html, /id="home-projects-grid"/);
assert.match(html, /id="v59-ai-mode-select"/);
assert.match(html, /id="v59-routing-note"/);

console.log('OVYX Home dashboard recent-project, empty-state and build-mode behavior checks passed.');
