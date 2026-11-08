import assert from 'node:assert/strict';
import { createBackendProvisioningPlan } from '../functions/_lib/backend-provisioning.js';

const architecture = {
  engine: 'ovyx-fullstack-architecture',
  architectureStatus: 'planned-not-provisioned',
  capabilities: { backend: true, database: true },
  apiContracts: [{
    id: 'api-contact-create',
    method: 'POST',
    path: '/api/contact',
    authPolicy: 'public-rate-limited',
    modelIds: ['model-contact-submission'],
  }],
};
const files = [
  { path: 'functions/api/contact.js', content: 'export async function onRequestPost() { return Response.json({ ok: true }); }' },
  { path: 'migrations/0001_contact_submissions.sql', content: [
    'CREATE TABLE contact_submissions (id TEXT PRIMARY KEY, message TEXT NOT NULL);',
    'CREATE INDEX idx_contact_submissions_created ON contact_submissions(id);',
  ].join('\n') },
];

const first = await createBackendProvisioningPlan({
  ownerUid: 'firebase-user-123',
  projectId: 'saved-project-456',
  architecture,
  files,
});
const second = await createBackendProvisioningPlan({
  ownerUid: 'firebase-user-123',
  projectId: 'saved-project-456',
  architecture,
  files,
});
const otherOwner = await createBackendProvisioningPlan({
  ownerUid: 'firebase-user-999',
  projectId: 'saved-project-456',
  architecture,
  files,
});
assert.equal(first.namespace, second.namespace, 'The same owner/project pair must have a stable namespace.');
assert.notEqual(first.namespace, otherOwner.namespace, 'Different owners must never share a backend namespace.');
assert.equal(first.status, 'planned-not-provisioned');
assert.match(first.resources.workerScript, /^ovyx-[a-f0-9]{16}-preview$/);
assert.equal(first.resources.databaseBinding, 'DB');
assert.equal(first.migrations.length, 1);
assert.equal(first.safety.executesCloudflareOperations, false);
assert.equal(first.safety.appliesMigrations, false);
assert.equal(first.safety.includesSecretValues, false);
assert.equal(first.safety.productionPromotionAllowed, false);
assert.equal(JSON.stringify(first).includes('firebase-user-123'), false);
assert.equal(JSON.stringify(first).includes('message TEXT'), false);

await assert.rejects(
  createBackendProvisioningPlan({ ownerUid: 'owner', projectId: 'project', architecture, files: [
    ...files, { path: 'functions/../../secrets.js', content: 'export default 1;' },
  ] }),
  { code: 'BACKEND_FILE_PATH_INVALID' },
);
await assert.rejects(
  createBackendProvisioningPlan({ ownerUid: 'owner', projectId: 'project', architecture, files: [
    ...files, { path: 'functions/api/private.js', content: 'const token = "sk_live_12345678901234567890";' },
  ] }),
  { code: 'BACKEND_SECRET_IN_SOURCE' },
);
await assert.rejects(
  createBackendProvisioningPlan({ ownerUid: 'owner', projectId: 'project', architecture, files: [
    { path: 'functions/api/contact.js', content: 'export default {};' },
    { path: 'migrations/0002_drop_old_table.sql', content: 'DROP TABLE customer_records;' },
  ] }),
  { code: 'BACKEND_MIGRATION_DESTRUCTIVE' },
);
await assert.rejects(
  createBackendProvisioningPlan({
    ownerUid: 'owner', projectId: 'project',
    architecture: { ...architecture, capabilities: { backend: true, database: false } },
    files,
  }),
  { code: 'BACKEND_DATABASE_CAPABILITY_MISMATCH' },
);
for (const capability of ['payments', 'commerce', 'email', 'newsletter', 'subscriptions', 'notifications', 'integrations', 'automation', 'fileStorage', 'backgroundWork']) {
  await assert.rejects(
    createBackendProvisioningPlan({
      ownerUid: 'owner', projectId: 'project',
      architecture: { ...architecture, capabilities: { ...architecture.capabilities, [capability]: true } },
      files,
    }),
    { code: 'BACKEND_CAPABILITY_UNSUPPORTED' },
    'Unsupported provider capability must fail closed: ' + capability,
  );
}
await assert.rejects(
  createBackendProvisioningPlan({
    ownerUid: 'owner', projectId: 'project',
    architecture: { ...architecture, capabilities: { backend: true, database: true }, apiContracts: [] },
    files,
  }),
  { code: 'BACKEND_ARCHITECTURE_INVALID' },
);

console.log('OVYX owner-scoped backend provisioning plan tests passed.');
