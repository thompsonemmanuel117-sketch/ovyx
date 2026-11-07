import assert from 'node:assert/strict';
import fs from 'node:fs';

const runtime = fs.readFileSync(new URL('../assets/ovyx-app-shell-polish.js', import.meta.url), 'utf8');
const middleware = fs.readFileSync(new URL('../functions/_middleware.js', import.meta.url), 'utf8');
const browser = fs.readFileSync(new URL('./ovyx-app-studio-premium-polish.browser.test.mjs', import.meta.url), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const workflow = fs.readFileSync(new URL('../.github/workflows/ovyx-assistant-workspace-browser.yml', import.meta.url), 'utf8');

assert.ok(runtime.includes('function contrastSafeTheme(theme)'), 'Theme colors must pass through one contrast guard.');
assert.ok(runtime.includes('minimumContrast(originalText, surfaces) < 4.5'), 'Primary text must meet WCAG AA contrast against canvas and cards.');
assert.ok(runtime.includes('minimumContrast(originalMuted, surfaces) < 4.5'), 'Muted text must remain readable rather than disappear into panels.');
assert.ok(runtime.includes('minimumContrast(originalAccent, surfaces) < 3'), 'Accent colors must remain distinguishable from the surrounding surfaces.');
assert.ok(runtime.includes("document.addEventListener('ovyx:theme-applied'") && runtime.includes('applyEffectiveTheme(event.detail?.effective || context.get())'), 'The effective rendered palette must be contrast-safe without rewriting canonical saved theme values.');
assert.ok(runtime.includes('lab.apply = function ()') && runtime.includes('context.preview(mapped)'), 'Theme Lab presets must update the canonical ThemeContext rather than only legacy --ov-* variables.');
assert.ok(runtime.includes('Theme preview applied. Save Appearance to keep it.'), 'Theme Lab feedback must not claim an unsaved preview was permanently saved.');
assert.ok(runtime.includes('#view-appstudio{padding-bottom:22px!important}'), 'App Studio must remove the old oversized bottom gap.');
assert.ok(runtime.includes('#view-home .v59-dashboard-shell{padding-bottom:18px!important}'), 'The Home dashboard must not retain the excessive 190px bottom runway.');
assert.ok(runtime.includes('#ovyx-launch-toasts .ovyx-launch-toast{pointer-events:none!important}'), 'Informational toast surfaces must not block taps on nearby workspace controls.');
assert.ok(runtime.includes('#ovyx-v52-bottom-bar{position:fixed!important;left:0!important;right:0!important;bottom:0!important') && runtime.includes('height:calc(64px + env(safe-area-inset-bottom,0px))!important'), 'The mobile dock must be anchored to the dashboard screen edge without changing its established height.');
assert.ok(runtime.includes('background:linear-gradient(180deg,color-mix(in srgb,var(--card'), 'The dock must keep its own theme-aware surface rather than inherit the flat page canvas.');
assert.ok(middleware.includes('/assets/ovyx-app-shell-polish.js?v=20261107-3'), 'The production Pages shell must load the new polish runtime.');
assert.ok(browser.includes('Theme text must remain readable') && browser.includes('bottom navigation must attach to the dashboard screen edges'), 'Desktop/mobile browser coverage must exercise the reported appearance and navigation problems.');
assert.ok(packageJson.scripts.test.includes('scripts/ovyx-app-shell-polish.test.mjs'), 'The source contract must run in npm test.');
assert.ok(workflow.includes("'assets/ovyx-app-shell-polish.js'"), 'The browser workflow must run when the shell polish runtime changes.');

console.log('OVYX App Shell polish source contracts passed.');
