import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const runtime = await readFile(new URL('../assets/ovyx-app-studio-design-system.js', import.meta.url), 'utf8');
const middleware = await readFile(new URL('../functions/_middleware.js', import.meta.url), 'utf8');
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.match(runtime, /OVYX_APP_STUDIO_DESIGN_SYSTEM_V1/);
assert.match(runtime, /Build apps\. Beautifully\./);
assert.match(runtime, /Analyze a site, create your app, and get it ready to launch\./);
assert.match(runtime, /data-brand-save/);
assert.match(runtime, /prefers-reduced-motion/);
assert.match(runtime, /max-width:360px/);
assert.match(runtime, /#view-appstudio/);
assert.match(runtime, /--as-text:var\(--text/);
assert.match(runtime, /input\[type=color\]/);
assert.match(middleware, /ovyx-app-studio-design-system\.js\?v=20261115-1/);
assert.ok(middleware.indexOf('ovyx-app-studio-workspace.js') < middleware.indexOf('ovyx-app-studio-design-system.js'), 'The visual layer must load after the existing App Studio runtimes.');
assert.ok(packageJson.scripts.test.includes('ovyx-app-studio-design-system.test.mjs'), 'The App Studio design-system contract must run in the main test suite.');
console.log('OVYX App Studio design-system contract passed.');