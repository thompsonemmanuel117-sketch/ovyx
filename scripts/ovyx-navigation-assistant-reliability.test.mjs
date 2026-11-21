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
console.log('OVYX navigation and assistant composer reliability contracts passed.');
