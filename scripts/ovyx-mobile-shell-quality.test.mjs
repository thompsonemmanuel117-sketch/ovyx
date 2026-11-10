import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(root, 'assets/css/ovyx-mobile-shell-quality.css'), 'utf8');
const middleware = fs.readFileSync(path.join(root, 'functions/_middleware.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

assert.match(middleware, /ovyx-mobile-shell-quality\.css\?v=20261110-11/, 'The shell quality layer must be delivered with the existing HTML shell.');
assert.match(css, /#ovyx-v52-bottom-bar\s*\{[\s\S]*?height:\s*64px\s*!important/, 'The existing mobile dock must have a compact fixed height.');
assert.match(css, /\.v52-bottom-create\s*\{[\s\S]*?height:\s*54px\s*!important/, 'The New action must align within the dock, not float above it.');
assert.match(css, /padding-bottom:\s*calc\(112px\s*\+\s*env\(safe-area-inset-bottom/, 'Home content must reserve at least 100px of dock clearance including the safe area.');
assert.doesNotMatch(css, /padding-bottom:\s*calc\(94px\s*\+\s*env\(safe-area-inset-bottom/, 'The previous 94px clearance is below the required browser-quality threshold.');
assert.match(css, /data-ovyx-mode="light"/, 'Light appearance must work with the canonical mode attribute.');
assert.match(css, /\.ovyx-light/, 'Light appearance must also support the legacy theme class.');
assert.match(css, /--ovyx-light-accent:\s*#806331/, 'Light-theme accent text must use a contrast-safe darker gold.');
assert.match(css, /One restrained brand-accent authority across platform surfaces/);
assert.match(css, /Outrank the legacy App Studio black-canvas rules/);
assert.match(css, /body #view-router-viewport > #view-appstudio/, 'Light appearance must outrank legacy hard-coded App Studio backgrounds.');
assert.match(css, /section:not\(#view-webstudio\)/, 'Platform accent overrides must explicitly leave Web Studio outside their scope.');
assert.ok(css.includes('#ovyx-topbar') && css.includes('--ovyx-platform-accent'), 'The top bar must share the restrained platform accent.');
assert.ok(css.includes('#view-settings') && css.includes('--ovyx-platform-accent'), 'Standalone Settings must share the restrained platform accent.');
assert.match(css, /--ovyx-ds-gold:var\(--ovyx-platform-accent\)!important/, 'Platform design tokens must resolve through the canonical platform accent.');
assert.doesNotMatch(css, /--(?:app-accent|accent|ov-accent)\s*:/, 'The platform polish layer must not override ThemeContext-owned custom accent variables.');
assert.match(html, /const platformAccent=legacyDefaultAccent\?/, 'The canonical ThemeContext must map the legacy orange default to a restrained platform gold.');
assert.match(html, /set\('--ovyx-platform-accent',platformAccent\)/, 'Custom appearance colours must flow into the platform accent token.');
assert.match(css, /\.text-amber-300[\s\S]*?color:\s*var\(--ovyx-platform-accent-strong\)/, 'Legacy pale amber text utilities must remain legible on white surfaces.');
assert.match(css, /#ovyx-v52-bottom-bar button\.is-active/, 'The active dock item must retain a clear light-theme state.');
assert.ok(pkg.scripts.test.includes('scripts/ovyx-mobile-shell-quality.test.mjs'), 'The mobile shell quality contract must run in npm test.');

console.log('OVYX mobile dock geometry and light-theme contrast contracts passed.');


assert.match(css, /#view-router-viewport\s*\{[\s\S]*?padding-bottom:\s*0\s*!important/, 'Shared route viewport must not reserve dashboard dock space on authentication and other non-dashboard routes.');
assert.match(css, /body\.ovyx-auth-open #view-master-auth/, 'Authentication must receive mobile safe-area and full-height layout treatment.');
assert.match(css, /--ovyx-ds-focus:\s*var\(--ovyx-platform-accent-strong\)/, 'Light appearance must use the selected contrast-safe platform accent for focus states.');
assert.match(css, /\.text-yellow-500[\s\S]*?color:\s*var\(--ovyx-platform-accent\)/, 'Yellow/gold text utilities must remain readable and follow the selected platform accent on light surfaces.');

assert.match(css, /--ovyx-brand-gold:\s*#E8B64F/, 'Dark appearance must use a clear, bright champagne-gold brand accent.');
assert.match(css, /--ovyx-brand-gold-strong:\s*#F5C96A/, 'Primary gold actions must use a brighter highlight tone.');
assert.match(css, /@keyframes ovyxGoldShimmer/, 'Gold primary actions must have a restrained shimmer animation.');
assert.match(css, /prefers-reduced-motion:\s*reduce/, 'Gold animation must respect reduced-motion preferences.');
assert.match(css, /section:not\(#view-webstudio\)/, 'Gold polish must not alter Web Studio internals.');

assert.match(css, /html:is\\(\\.ovyx-light,\\[data-ovyx-mode="light"\\]\\) \\{[\\s\\S]*?--ovyx-platform-accent:\\s*var\\(--ovyx-light-accent\\)/, 'Light mode must default to contrast-safe gold while still allowing inline user theme overrides.');
assert.ok(css.includes('html:is(.ovyx-light,[data-ovyx-mode="light"]) {') && css.includes('--ovyx-platform-accent: var(--ovyx-light-accent);'), 'Light mode must default to contrast-safe gold while still allowing inline user theme overrides.');
