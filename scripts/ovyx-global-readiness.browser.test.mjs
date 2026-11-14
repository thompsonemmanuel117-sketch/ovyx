import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../assets/ovyx-global-readiness.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.match(source, /fetch\('\/api\/global\/readiness'/, 'The browser must load country-aware defaults from the same-origin API.');
assert.match(source, /cache: 'no-store'/, 'Visitor-specific country metadata must not be cached across users.');
assert.match(source, /ovyx:global-readiness-ready/, 'Consumers must receive a stable readiness event.');
assert.match(source, /OVYXFormatMoney/, 'The browser must expose locale-aware currency formatting.');
assert.match(source, /dataset\.ovyxCountry/);
assert.match(source, /catch\(function \(\) \{\s*\/\/ Global defaults are progressive enhancement/s, 'Readiness failures must never block the app shell.');
assert.match(html, /assets\/ovyx-global-readiness\.js/, 'The global readiness bootstrap must be loaded by the real OVYX app shell.');
console.log('OVYX global readiness browser integration checks passed.');
