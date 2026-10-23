import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveEntitlements } from '../functions/api/entitlements.js';
import { ROOT_EMAIL } from '../functions/_lib/brain/registry.js';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const runtime = read('assets/ovyx-admin-workspace.js');
const middleware = read('functions/_middleware.js');
const apiMiddleware = read('functions/api/_middleware.js');
const rbac = read('functions/api/admin/rbac.js');
const entitlementsSource = read('functions/api/entitlements.js');
const headers = read('_headers');
const html = read('index.html');

const routes = [
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

assert.ok(runtime.includes("fetch('/api/entitlements'"), 'Admin Workspace must verify access with the server entitlement endpoint.');
assert.ok(runtime.includes("role === ROOT_ROLE"), 'Admin Workspace must require the canonical root role.');
assert.ok(runtime.includes("const ROOT_EMAIL = 'ovyxsupportteam@gmail.com'"), 'Admin Workspace must pin the canonical owner email.');
assert.ok(runtime.includes('!!user?.uid && !!data?.uid') && runtime.includes('actualEmail === expectedEmail'), 'Admin Workspace must fail closed if the entitlement response does not match the signed-in Firebase identity.');
assert.ok(runtime.includes('actualEmail === ROOT_EMAIL') && runtime.includes('data?.bypass === true'), 'Admin Workspace must require the server-confirmed root identity and owner bypass flag.');
assert.ok(rbac.includes("import { resolveEntitlements } from '../entitlements.js'"), 'RBAC must use the canonical server entitlement resolver.');
assert.doesNotMatch(rbac, /profile\?\.role\s*===?\s*['"]ROOT_SUPERUSER['"]|role === 'ROOT_SUPERUSER' \|\|/, 'A stored profile role must never mint ROOT_SUPERUSER access.');
assert.ok(entitlementsSource.includes('Only the canonical, Firebase-verified account email grants root bypass.'), 'Root bypass must be tied to the canonical verified owner identity.');
assert.ok(apiMiddleware.includes("'PRODUCTION_INTEGRATIONS_PAUSED'"), 'The owner-controlled global integration kill switch must remain an explicit safety boundary.');

const rootEntitlements = await resolveEntitlements({}, { uid: 'ovyx-root-owner-contract-test', email: ROOT_EMAIL });
assert.equal(rootEntitlements.role, 'ROOT_SUPERUSER', 'The configured owner identity must resolve to ROOT_SUPERUSER.');
assert.equal(rootEntitlements.owner, true, 'The configured owner must receive owner authority.');
assert.equal(rootEntitlements.admin, true, 'The configured owner must receive admin authority.');
assert.equal(rootEntitlements.bypass, true, 'The configured owner must bypass plan and feature entitlements.');
for (const [feature, allowed] of Object.entries(rootEntitlements.capabilities || {})) {
  assert.equal(allowed, true, 'The owner must have access to ' + feature + ' regardless of ordinary plan gates.');
}
assert.ok(runtime.includes("data?.owner === true") && runtime.includes("data?.isRoot === true"), 'Admin Workspace must require a server-confirmed owner identity.');
assert.ok(runtime.includes("credentials: 'same-origin'") && runtime.includes("cache: 'no-store'"), 'Admin entitlement checks must stay same-origin and uncached.');
assert.ok(runtime.includes('ovyx-admin-workspace-entry-desktop') && runtime.includes('ovyx-admin-workspace-entry-mobile'), 'Desktop and mobile owner entry points must be restored.');
assert.ok(runtime.includes('ovyx-admin-workspace-hub') && runtime.includes('Find an admin module'), 'The Admin Workspace hub and module search must exist.');
assert.ok(runtime.includes('clearAuthorization(data)'), 'Failed/non-root authorization must remove the owner-only interface.');
assert.ok(runtime.includes("byId('ovyx-admin-module-directory')?.remove()"), 'The legacy inline module directory must not duplicate or bypass the server-verified hub.');

for (const route of routes) {
  assert.ok(runtime.includes("route: '" + route + "'"), 'Admin Workspace is missing route ' + route + '.');
  assert.ok(html.includes('id="view-' + route + '"'), 'Expected existing admin destination is missing from the application shell: ' + route + '.');
}

assert.ok(middleware.includes('/assets/ovyx-admin-workspace.js?v=20261018-2'), 'The Admin Workspace runtime must be injected into the application shell.');
assert.ok(headers.includes('/assets/ovyx-admin-workspace.js') && headers.includes('Cache-Control: no-store, no-cache, must-revalidate'), 'The Admin Workspace runtime must not be served stale from cache.');
assert.doesNotMatch(runtime, /localStorage\s*\.\s*getItem\([^)]*(?:role|owner|admin|entitlement)/i, 'Local storage must never be used as authority for admin access.');
assert.doesNotMatch(runtime, /OVYX_ADMIN_UI_PREVIEW\s*=\s*true/, 'The runtime must not unlock admin UI through a browser preview flag.');

console.log('OVYX Admin Workspace contract tests passed: server-verified root access, desktop/mobile entry points, nine existing modules, same-origin uncached entitlement checks, and fail-closed UI.');
