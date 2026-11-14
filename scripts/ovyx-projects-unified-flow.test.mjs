import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const asset = await readFile(new URL('../assets/ovyx-projects-unified-flow.js', import.meta.url), 'utf8');
const middleware = await readFile(new URL('../functions/_middleware.js', import.meta.url), 'utf8');
const browserTest = await readFile(new URL('./ovyx-project-workspace-picker.browser.test.mjs', import.meta.url), 'utf8');

assert.doesNotThrow(() => new vm.Script(asset), 'The Projects runtime must parse.');
assert.match(asset, /data-nav="continue-project"/, 'The legacy desktop Continue Project shortcut must stay removed.');
assert.match(asset, /button\[onclick\*="continueOvyxProject"\]/, 'The legacy mobile Continue Project shortcut must stay removed.');
assert.doesNotMatch(asset, /ovyx-projects-continue-panel|data-continue-project|data-continue-create/, 'The duplicate Continue working panel and its actions must not be recreated.');
assert.match(asset, /data-modal-create/, 'The existing project create modal must retain its duplicate-submission guard.');
assert.match(asset, /stopImmediatePropagation/, 'A repeated create click must not create a second project.');
assert.match(asset, /Creating…/, 'Creation must provide immediate feedback.');
assert.match(asset, /ovyx-project-create-modal/, 'The existing project modal must be enhanced rather than replaced.');
assert.match(asset, /#ovyx-project-create-modal\[hidden\]\{display:none!important\}/, 'A closed project modal must not intercept clicks after its opening animation frame.');
assert.match(asset, /new MutationObserver/, 'Late-mounted project views and the create modal must be handled.');
assert.match(middleware, /ovyx-projects-unified-flow\.js\?v=20261114-5/, 'The updated runtime must be cache-busted in the Pages shell.');
assert.match(browserTest, /ovyx-projects-continue-panel/, 'Browser coverage must verify the duplicate panel is absent.');
assert.match(browserTest, /data-picker-create/, 'Browser coverage must retain the existing project creation flow.');

console.log('OVYX single Projects entry-point contract checks passed.');
