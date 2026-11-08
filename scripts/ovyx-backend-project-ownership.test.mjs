import assert from 'node:assert/strict';
import { assertOwnedSavedProject } from '../functions/_lib/backend-project-ownership.js';

const project = {
  id: 'saved-project-123',
  ownerUid: 'firebase-user-123',
  ownerEmail: 'owner@example.com',
  name: 'My website',
};

assert.equal(assertOwnedSavedProject(project, {
  uid: 'firebase-user-123',
  email: 'OWNER@example.com',
  projectId: 'saved-project-123',
}), project, 'the verified owner can deploy their saved project');

for (const input of [
  { project: null, identity: { uid: 'firebase-user-123', email: 'owner@example.com', projectId: 'saved-project-123' } },
  { project, identity: { uid: 'another-user', email: 'owner@example.com', projectId: 'saved-project-123' } },
  { project, identity: { uid: 'firebase-user-123', email: 'attacker@example.com', projectId: 'saved-project-123' } },
]) {
  assert.throws(
    () => assertOwnedSavedProject(input.project, input.identity),
    error => error.status === 404 && error.code === 'PROJECT_NOT_FOUND',
    'missing or cross-account projects must fail closed',
  );
}

assert.throws(
  () => assertOwnedSavedProject(project, { uid: '', email: 'owner@example.com', projectId: 'saved-project-123' }),
  error => error.status === 400 && error.code === 'PROJECT_IDENTITY_INVALID',
);
assert.throws(
  () => assertOwnedSavedProject(project, { uid: 'firebase-user-123', email: 'owner@example.com', projectId: '../other' }),
  error => error.status === 400 && error.code === 'PROJECT_IDENTITY_INVALID',
);

console.log('OVYX saved-project deployment ownership tests passed.');
