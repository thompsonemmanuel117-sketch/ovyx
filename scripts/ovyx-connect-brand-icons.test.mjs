import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const asset = await readFile(new URL('../assets/ovyx-connect-brand-icons.js', import.meta.url), 'utf8');
const middleware = await readFile(new URL('../functions/_middleware.js', import.meta.url), 'utf8');
const headers = await readFile(new URL('../_headers', import.meta.url), 'utf8');

for (const brand of ['stripe','paystack','flutterwave','whatsapp','github','googledrive','googlesheets','resend','openai','googlegemini','anthropic','deepseek','cloudflare']) {
  assert.ok(asset.includes("'" + brand + "'") || asset.includes(":'" + brand + "'"), 'Brand logo mapping must include ' + brand);
}
assert.match(asset, /cdn\.simpleicons\.org\//, 'Known apps must use official brand SVG marks.');
assert.match(asset, /google\.com\/s2\/favicons/, 'Arbitrary API hosts must resolve their real website favicon.');
assert.match(asset, /referrerPolicy = 'no-referrer'/, 'Third-party icon requests must not receive the OVYX page referrer.');
assert.match(asset, /MutationObserver/, 'Logos must also appear when the saved connections list is rendered later.');
assert.match(asset, /row\.querySelector\('\.ovyx-connect-brand-icon'\)/, 'Decorating an existing row must detect nested icons and remain idempotent.');
assert.match(asset, /new MutationObserver\(records => \{[\s\S]*?for \(const node of record\.addedNodes\)/, 'Dynamic decoration must inspect only newly inserted subtrees.');
assert.match(asset, /decorate\(node\)/, 'New connection rows must still receive their brand icons.');
assert.doesNotMatch(asset, /new MutationObserver\(decorate\)/, 'App-shell mutations must not trigger a full-document decoration scan.');

assert.match(asset, /data-v91-test/);
assert.match(asset, /data-conn-test/);
assert.match(middleware, /ovyx-connect-brand-icons\.js/, 'The live Pages middleware must inject the Connect icon runtime.');
assert.match(headers, /\/assets\/ovyx-connect-brand-icons\.js[\s\S]*?Cache-Control: no-store/, 'The new runtime must not be served stale.');
console.log('OVYX Connect brand icon tests passed.');
