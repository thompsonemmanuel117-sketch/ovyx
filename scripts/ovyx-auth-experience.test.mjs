import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

assert.match(html, /\.ovyx-auth-password-field\[hidden\]\s*\{\s*display:\s*none\s*!important/, 'Hidden confirmation password must remain hidden despite the password-field grid rule.');
assert.match(html, /#view-master-auth \.ovyx-auth-back\{position:absolute!important/, 'The auth back button must scroll with the auth page instead of covering the form while scrolling.');
assert.match(html, /Welcome back to OVYX/, 'The login state must use clear returning-user language.');
assert.match(html, /Sign in to continue to your workspace\./, 'The login subtitle must explain the next action clearly.');
assert.match(html, /Legacy redirect-result lookup exceeded its startup deadline/, 'A legacy redirect timeout must be logged internally rather than shown as a raw diagnostic.');
assert.doesNotMatch(html, /status\(code===.auth\/unauthorized-domain[\s\S]{0,400}error\?\.message\|\|.OAuth sign-in could not be completed\./, 'Raw unknown Firebase redirect errors must not be exposed to users.');
assert.match(html, /#view-master-auth \.ovyx-auth-intro h1\{font-size:clamp\(/, 'Mobile auth heading must use responsive typography.');
assert.match(html, /If an OVYX account matches that email, password reset instructions will be sent\./, 'Password recovery must use an account-enumeration-safe confirmation.');
assert.doesNotMatch(html, /e\?\.message\|\|.Could not send password reset email/, 'Raw Firebase password-recovery errors must not be exposed to users.');
assert.match(html, /google\.addEventListener\('click',[\s\S]*?popupSignIn\('google'\)/, 'The Google button must remain connected to the existing Firebase popup sign-in handler.');
assert.match(html, /github\.addEventListener\('click',[\s\S]*?popupSignIn\('github'\)/, 'The GitHub button must remain connected to the existing Firebase popup sign-in handler.');
assert.match(html, /await a\.sendPasswordResetEmail\(email\)/, 'Forgot password must remain connected to Firebase password-reset email delivery.');
assert.match(html, /window\.openLegal\(kind\)/, 'Terms and Privacy controls must remain connected to the OVYX legal modal.');
assert.match(html, /input\.type=wasVisible\?'password':'text'/, 'Password visibility controls must continue to toggle the associated input.');
console.log('OVYX authentication visibility, mobile layout, copy and timeout UX contracts passed.');
