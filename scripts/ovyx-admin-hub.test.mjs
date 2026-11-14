import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

// The owner Admin Overview must offer one clear entry point to existing modules.
assert.equal(
  (html.match(/id="ovyx-admin-module-directory"/g) || []).length,
  1,
  'The Admin Modules hub should exist exactly once.',
);
const overviewAt = html.indexOf('id="view-admin-overview"');
const hubAt = html.indexOf('id="ovyx-admin-module-directory"');
const nextAdminViewAt = html.indexOf('id="view-admin-pricing"', overviewAt);
assert.ok(overviewAt >= 0 && hubAt > overviewAt && nextAdminViewAt > hubAt,
  'The Admin Modules hub must live inside Admin Overview.');

const expectedRoutes = [
  'admin-overview',
  'admin-pricing',
  'admin-users',
  'admin-brain',
  'admin-identity',
  'admin-backend',
  'admin-telemetry',
  'admin-broadcasts',
  'admin-template-hub',
];
for (const route of expectedRoutes) {
  const escaped = route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.match(
    html,
    new RegExp('data-admin-module="' + escaped + '"\\s+onclick="Router\\.go\\(\\\'' + escaped + '\\\'\\)"'),
    'Admin Modules must link to ' + route + '.',
  );
}

// Guard against the exact regressions that hid the remembered workspace.
assert.doesNotMatch(
  html,
  /#ovyx-admin-module-directory\s*\{\s*display\s*:\s*none\s*!important/i,
  'A blanket CSS rule must not hide the Admin Modules hub.',
);
const cleanupCssStart = html.indexOf('<style id="ovyx-v8-deep-cleanup">');
const cleanupCssEnd = html.indexOf('</style>', cleanupCssStart);
assert.ok(cleanupCssStart >= 0 && cleanupCssEnd > cleanupCssStart, 'The Admin cleanup stylesheet must exist.');
const cleanupCss = html.slice(cleanupCssStart, cleanupCssEnd);
assert.ok(!cleanupCss.includes('#view-admin-overview #ovyx-admin-module-directory,'),
  'Admin cleanup CSS must not suppress the module hub.');

const cleanupRuntimeStart = html.indexOf('function scrubAdminDuplicates()');
const cleanupRuntimeEnd = html.indexOf('function ensureAdminChrome()', cleanupRuntimeStart);
assert.ok(cleanupRuntimeStart >= 0 && cleanupRuntimeEnd > cleanupRuntimeStart,
  'The single-admin-surface cleanup runtime must exist.');
const cleanupRuntime = html.slice(cleanupRuntimeStart, cleanupRuntimeEnd);
assert.ok(!cleanupRuntime.includes('#view-admin-overview #ovyx-admin-module-directory'),
  'Runtime cleanup must not remove the module hub from the DOM.');

assert.match(html, /function finalAdminRouterGuard\(\)/,
  'The admin route authorization guard must remain in the page.');
assert.match(
  html,
  /String\(view\)\.startsWith\('admin-'\).*FirebaseAuthLockdown\.isSuperuser/,
  'Admin routes must remain restricted to the verified owner outside explicit local preview.',
);

console.log('OVYX Admin hub tests passed: one restored module directory, nine route links, no hiding/removal regression, and owner-only route guard preserved.');
