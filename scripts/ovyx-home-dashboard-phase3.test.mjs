import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const css = await readFile(new URL('../assets/css/ovyx-home-dashboard-phase3.css', import.meta.url), 'utf8');
const runtime = await readFile(new URL('../assets/ovyx-home-dashboard-phase3.js', import.meta.url), 'utf8');
const middleware = await readFile(new URL('../functions/_middleware.js', import.meta.url), 'utf8');
const workflow = await readFile(new URL('../.github/workflows/ovyx-command-centre-browser.yml', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

assert.doesNotThrow(() => new vm.Script(runtime), 'UX copy runtime must parse.');
assert.match(middleware, /ovyx-home-dashboard-phase3\.js\?v=20261113-1/, 'The UX copy runtime must load through the Pages shell.');
assert.match(middleware, /ovyx-home-dashboard-phase3\.css\?v=20261113-1/, 'The responsive dashboard layer must load through the Pages shell.');
assert.match(workflow, /ovyx-home-dashboard-phase3\.js/);
assert.match(workflow, /ovyx-home-dashboard-phase3\.css/);
assert.ok(pkg.scripts.test.includes('scripts/ovyx-home-dashboard-phase3.test.mjs'), 'Phase 3 contract must run in npm test.');
assert.match(html, /id="view-home"/);
assert.match(html, /id="prompt-home-input"/);
assert.match(html, /id="v59-ai-mode-select"/);
assert.match(html, /id="v59-build"/);
assert.match(html, /class="v59-tool-card"/);

for (const selector of ['#view-home .v59-dashboard-shell', '#view-home .v59-composer-bar', '#view-home .v59-tool-card', '#view-home .v59-build-btn']) {
  assert.ok(css.includes(selector), 'Responsive polish must be scoped to Home: ' + selector);
}
assert.match(css, /min-height:\s*44px/, 'Primary touch targets must be at least 44px high.');
assert.match(css, /font-size:\s*16px/, 'The prompt must avoid mobile browser auto-zoom.');
assert.match(css, /prefers-reduced-motion:\s*reduce/, 'Motion must respect reduced-motion preferences.');
assert.match(css, /--app-text/);
assert.match(css, /--app-muted/);

const elements = {};
const listeners = {};
const createNode = (id, text = '') => ({
  id, textContent: text, innerHTML: '', placeholder: '', dataset: {}, attributes: {},
  options: [], children: [], querySelector(selector) { return this.children.find(child => child.selector === selector) || null; },
  querySelectorAll(selector) { return this.children.filter(child => child.group === selector); },
  setAttribute(key, value) { this.attributes[key] = value; },
  prepend(node) { this.children.unshift(node); }
});
const home = createNode('view-home');
const heading = createNode('heading');
const intro = createNode('intro');
const prompt = createNode('prompt-home-input');
const modeLabel = createNode('mode-label');
const mode = createNode('v59-ai-mode-select');
mode.options = ['balanced','fast','quality'].map(value => ({value,textContent:value}));
const build = createNode('v59-build');
const buildLabel = createNode('build-label');
build.children.push(Object.assign(buildLabel,{selector:'span'}));
const toolsHeading = createNode('tools-heading');
const recentHeading = createNode('recent-heading');
const plus = createNode('plus');
const addMenu = createNode('add-menu');
const commands = createNode('commands');
const recentLink = createNode('recent-link');
const cards = [0,1,2,3].map(i => ({querySelector:()=>({textContent:''})}));
home.querySelector = selector => ({
  '.v59-hero-copy h1':heading,
  '.v59-hero-copy p':intro,
  '.v59-model-label':modeLabel,
  '.v59-workspace-section .v59-section-head h2':toolsHeading,
  '.v59-recent-section .v59-section-head h2':recentHeading,
  '.v59-workspace-section .v59-command-link':commands,
  '.v59-recent-section .v59-command-link':recentLink
}[selector] || null);
home.querySelectorAll = selector => selector === '.v59-tool-card' ? cards : [];
elements['view-home']=home;elements['prompt-home-input']=prompt;elements['v59-ai-mode-select']=mode;elements['v59-build']=build;elements['v59-plus-note']=plus;elements['v59-add-menu']=addMenu;
home.querySelector('.v59-hero-copy h1');
const document = {readyState:'complete',getElementById:id=>elements[id]||null,addEventListener(type,fn){(listeners[type]||=[]).push(fn);}};
const window = {};
vm.runInNewContext(runtime,{window,document,MutationObserver:undefined});
assert.equal(heading.innerHTML,'What would you like<br/><em>to create?</em>');
assert.match(intro.textContent,/Describe something new/);
assert.equal(prompt.placeholder,'Describe what you want to create or change…');
assert.equal(modeLabel.textContent,'RESPONSE STYLE');
assert.deepEqual(Array.from(mode.options,o=>o.textContent),['Everyday · balanced','Quick · concise','Deep · detailed']);
assert.equal(buildLabel.textContent,'Start building');
assert.equal(toolsHeading.textContent,'Choose where to work.');
assert.equal(recentHeading.textContent,'Pick up where you left off.');
assert.ok(prompt.attributes['aria-label']);
assert.ok(build.attributes['aria-label']);

console.log('OVYX Home Phase 3 responsive layout and UX writing contracts passed.');
