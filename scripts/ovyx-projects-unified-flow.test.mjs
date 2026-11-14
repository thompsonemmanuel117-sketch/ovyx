import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const asset = await readFile(new URL('../assets/ovyx-projects-unified-flow.js', import.meta.url), 'utf8');
const middleware = await readFile(new URL('../functions/_middleware.js', import.meta.url), 'utf8');
const browserTest = await readFile(new URL('./ovyx-project-workspace-picker.browser.test.mjs', import.meta.url), 'utf8');

assert.doesNotThrow(() => new vm.Script(asset), 'The unified Projects runtime must parse.');
assert.match(asset, /data-nav="continue-project"/, 'The legacy desktop Continue Project shortcut must be removed.');
assert.match(asset, /button\[onclick\*="continueOvyxProject"\]/, 'The legacy mobile Continue Project shortcut must be removed.');
assert.match(asset, /ovyx-projects-continue-panel/, 'Projects must own the continue-project surface.');
assert.match(asset, /ProjectStore|STORE\(\)/, 'The Projects surface must use the existing project store.');
assert.match(asset, /store\.open\(id\)/, 'Continue must use the existing project open operation.');
assert.match(asset, /Promise\.resolve\(result\)/, 'Project opening must handle both synchronous and asynchronous results.');
assert.match(asset, /aria-busy/, 'The continue action must expose its opening state.');
assert.match(asset, /data-continue-create/, 'The empty state must preserve the existing create action.');
assert.match(asset, /data-modal-create/, 'The existing create modal must receive a duplicate-submission guard.');
assert.match(asset, /stopImmediatePropagation/, 'A repeated create click must not create a second project.');
assert.match(asset, /Creating…/, 'Creation must provide immediate feedback.');
assert.match(asset, /ovyx-project-create-modal/, 'The existing project modal must be enhanced rather than replaced.');
assert.match(asset, /#ovyx-project-create-modal\[hidden\]\{display:none!important\}/, 'A closed project modal must not intercept clicks after its opening animation frame.');
assert.match(asset, /function install\(\)\s*\{\s*installStyles\(\)/, 'The Projects panel styles must be installed during runtime startup.');
assert.match(asset, /new MutationObserver/, 'Late-mounted project views and the create modal must be handled.');
assert.match(middleware, /ovyx-projects-unified-flow\.js\?v=20261114-4/, 'The runtime must be loaded by the Pages shell.');
assert.match(browserTest, /Continue Project/, 'Browser coverage must verify the old shortcut is absent.');
assert.match(browserTest, /data-continue-project/, 'Browser coverage must exercise the new in-Projects action.');

console.log('OVYX unified Projects flow contract checks passed.');
