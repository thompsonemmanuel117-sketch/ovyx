import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const asset = await readFile(new URL('../assets/ovyx-project-workspace-picker.js', import.meta.url), 'utf8');
const middleware = await readFile(new URL('../functions/_middleware.js', import.meta.url), 'utf8');

assert.doesNotThrow(() => new Function(asset), 'The project picker runtime must parse as JavaScript.');

assert.match(asset, /showWorkspacePicker\s*=\s*function/);
assert.match(asset, /ProjectStore\.list|STORE\(\)\.list/);
assert.match(asset, /STORE\(\)\.open\(selectedId\)/);
assert.match(asset, /createPromptModal/);
assert.match(asset, /showModal\(\)/);
assert.match(asset, /aria-labelledby/);
assert.match(asset, /aria-live="polite"/);
assert.match(asset, /prefers-reduced-motion/);
assert.doesNotMatch(asset, /window\.prompt\s*\(/, 'The new project picker must not use a browser prompt.');
assert.match(middleware, /ovyx-project-workspace-picker\.js\?v=20261106-1/, 'The project picker runtime must be injected into the production app shell.');

console.log('OVYX project workspace picker contract tests passed.');
