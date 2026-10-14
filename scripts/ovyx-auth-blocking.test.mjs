import assert from 'node:assert/strict';
import { isAllowedNewAccountProvider } from '../firebase-auth-blocking/policy.js';

assert.equal(isAllowedNewAccountProvider('password'), true, 'Explicit email/password account creation must remain allowed.');
assert.equal(isAllowedNewAccountProvider('PASSWORD'), true, 'Provider IDs should be normalized.');
assert.equal(isAllowedNewAccountProvider('google.com'), false, 'A new Google account must be blocked.');
assert.equal(isAllowedNewAccountProvider('github.com'), false, 'A new GitHub account must be blocked.');
assert.equal(isAllowedNewAccountProvider('facebook.com'), false, 'Unknown social providers must not bypass the policy.');
assert.equal(isAllowedNewAccountProvider(''), false, 'Missing provider identity must fail closed.');
console.log('OVYX Firebase Auth account-creation policy tests passed.');
