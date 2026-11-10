import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtime = fs.readFileSync(path.join(root, 'assets/ovyx-dashboard-navigation.js'), 'utf8');
const middleware = fs.readFileSync(path.join(root, 'functions/_middleware.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

assert.ok(runtime.includes("var DOCK_ID = 'ovyx-v52-bottom-bar'"), 'The authority must target the existing Home dock, not create another navigation bar.');
assert.ok(runtime.includes("var VIEWPORT_ID = 'view-router-viewport'"), 'The authority must inspect the existing routed viewport.');
assert.match(runtime, /window\.KernelState\s*&&\s*window\.KernelState\.activeView/, 'The active route state must be part of the visibility decision.');
assert.match(runtime, /var visibleSections = sections\.filter\(visible\)/, 'The actual rendered route must be verified.');
assert.match(runtime, /visibleSections\.length !== 1/, 'Ambiguous route state must fail closed rather than flash the dock.');
assert.match(runtime, /renderedRoute === stateRoute/, 'The visible route must agree with KernelState before Home navigation is shown.');
assert.ok(!runtime.includes("getAttribute('aria-hidden')"), 'A stale aria-hidden marker must never decide whether Home is visible.');
assert.match(runtime, /kernel-brain-bot-panel/);
assert.match(runtime, /view-master-auth/, 'The dashboard dock must be suppressed while the full-screen authentication surface is open.');
assert.match(runtime, /ovyx-auth-open/, 'Authentication overlay state must independently suppress the dashboard dock even while Home remains the routed view.');
assert.match(runtime, /ovyx-website-management/);
assert.match(runtime, /window\.innerWidth >= 768/, 'Desktop navigation layout must remain untouched.');
assert.match(runtime, /function drawerOpen\(\)/, 'The final authority must independently detect an open mobile drawer.');
assert.match(runtime, /window\.OVYXDashboardDockBlocked/, 'The final authority must use the shared protected-surface contract.');
assert.match(html, /window\.OVYXDashboardDockBlocked=dockBlocked/, 'All route writers must share one dock visibility predicate.');
assert.ok((html.match(/!window\.OVYXDashboardDockBlocked\?\.\(\)/g) || []).length >= 4, 'Legacy dock writers must fail closed for drawers, authentication and standalone overlays.');
assert.match(runtime, /new MutationObserver/, 'The authority must follow route and dock re-renders.');
assert.match(runtime, /state\.saved\[property\] = current/, 'Original shell style changes must be preserved while the dock is controlled.');
assert.match(runtime, /function restore\(dock\)/, 'The dock styles must be restored when the mobile authority is not applicable.');
assert.match(middleware, /ovyx-dashboard-navigation\.js\?v=20261110-1/, 'The dashboard navigation authority must load through the Pages shell.');
assert.ok(pkg.scripts.test.includes('scripts/ovyx-dashboard-navigation.test.mjs'), 'The dashboard navigation contract must run in npm test.');

console.log('OVYX dashboard navigation authority contract checks passed.');
