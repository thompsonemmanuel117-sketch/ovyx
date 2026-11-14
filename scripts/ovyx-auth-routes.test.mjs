import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const routes = fs.readFileSync(new URL('../assets/ovyx-auth-routes.js', import.meta.url), 'utf8');

for (const route of ['/login', '/signup', '/forgot-password', '/verify-email', '/auth/callback']) {
  assert.ok(routes.includes("'" + route + "'"), 'Missing authentication route ' + route);
}
assert.match(html, /assets\/ovyx-auth-routes\.js/, 'The authentication route controller must be loaded by the application shell.');
assert.match(routes, /sendPasswordResetEmail\(email\)/, 'Password recovery must use the existing Firebase reset-email API.');
assert.match(routes, /If an OVYX account matches that email, password reset instructions will be sent\./, 'Password recovery must not reveal whether an account exists.');
assert.match(routes, /sendEmailVerification\(\)/, 'The verification page must support resending Firebase verification email.');
assert.match(routes, /current\.reload\(\)/, 'The verification page must refresh Firebase user state before checking verification.');
assert.match(routes, /stopImmediatePropagation\(\)/, 'Standalone auth route handlers must prevent the legacy overlay handlers from also firing.');
assert.match(routes, /window\.Router\?\.go\?\.\('master-auth'/, 'Authentication routes must reuse the existing master auth view.');
assert.match(html, /ovyx-master-auth-form/, 'The existing Firebase auth form must remain in the shell.');
assert.match(html, /popupSignIn\('google'\)/, 'Google sign-in must remain wired to the existing Firebase popup flow.');
assert.match(html, /popupSignIn\('github'\)/, 'GitHub sign-in must remain wired to the existing Firebase popup flow.');
console.log('OVYX standalone authentication route contracts passed.');
