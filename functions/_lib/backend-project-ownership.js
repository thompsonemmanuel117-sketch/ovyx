const clean = (value, max = 320) => String(value ?? '').trim().slice(0, max);
const normalizeEmail = value => clean(value, 320).toLowerCase();

/**
 * Confirms that a saved project record belongs to the authenticated Firebase
 * identity. The record must be loaded server-side from its canonical Firestore
 * path; client-supplied owner fields are never accepted as evidence.
 */
export function assertOwnedSavedProject(project, { uid, email, projectId } = {}) {
  const ownerUid = clean(uid, 128);
  const ownerEmail = normalizeEmail(email);
  const id = clean(projectId, 120);

  if (!ownerUid || !/^[A-Za-z0-9_-]{1,120}$/.test(id)) {
    throw Object.assign(new Error('A valid authenticated owner and saved project are required.'), {
      status: 400,
      code: 'PROJECT_IDENTITY_INVALID',
    });
  }

  if (!project ||
      clean(project.ownerUid, 128) !== ownerUid ||
      normalizeEmail(project.ownerEmail) !== ownerEmail) {
    throw Object.assign(new Error('The saved website was not found for this account.'), {
      status: 404,
      code: 'PROJECT_NOT_FOUND',
    });
  }

  return project;
}
