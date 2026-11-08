import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(root, 'assets/css/ovyx-mobile-shell-quality.css'), 'utf8');
const middleware = fs.readFileSync(path.join(root, 'functions/_middleware.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

assert.match(middleware, /ovyx-mobile-shell-quality\.css\?v=20261108-1/, 'The shell quality layer must be delivered with the existing HTML shell.');
assert.match(css, /#ovyx-v52-bottom-bar\s*\{[\s\S]*?height:\s*64px\s*!important/, 'The existing mobile dock must have a compact fixed height.');
assert.match(css, /\.v52-bottom-create\s*\{[\s\S]*?height:\s*54px\s*!important/, 'The New action must align within the dock, not float above it.');
assert.match(css, /padding-bottom:\s*calc\(94px\s*\+\s*env\(safe-area-inset-bottom/, 'Home content must clear the dock without excessive blank space.');
assert.match(css, /data-ovyx-mode="light"/, 'Light appearance must work with the canonical mode attribute.');
assert.match(css, /\.ovyx-light/, 'Light appearance must also support the legacy theme class.');
assert.match(css, /--ovyx-light-accent:\s*#875500/, 'Light-theme accent text must use a contrast-safe darker gold.');
assert.match(css, /\.text-amber-300[\s\S]*?color:\s*var\(--ovyx-light-accent-strong\)/, 'Legacy pale amber text utilities must remain legible on white surfaces.');
assert.match(css, /#ovyx-v52-bottom-bar button\.is-active/, 'The active dock item must retain a clear light-theme state.');
assert.ok(pkg.scripts.test.includes('scripts/ovyx-mobile-shell-quality.test.mjs'), 'The mobile shell quality contract must run in npm test.');

console.log('OVYX mobile dock geometry and light-theme contrast contracts passed.');
