import assert from 'node:assert/strict';
import { findSuccessfulProductionDeployment, readCloudflareEvaluationPublicSettings, summarizeCloudflareRuntimeConfig } from './ovyx-cloudflare-runtime-config-inventory.mjs';

const expectedCommit = 'a'.repeat(40);
const successfulDeployment = {
  id: 'deploy-current-main',
  environment: 'production',
  is_skipped: false,
  deployment_trigger: {
    type: 'github:push',
    metadata: { branch: 'main', commit_hash: expectedCommit },
  },
  latest_stage: { name: 'deploy', status: 'success' },
};
const staleProduction = {
  ...successfulDeployment,
  id: 'deploy-stale-main',
  deployment_trigger: { type: 'github:push', metadata: { branch: 'main', commit_hash: 'b'.repeat(40) } },
};
const previewMatch = { ...successfulDeployment, id: 'deploy-preview', environment: 'preview' };
const skippedMatch = { ...successfulDeployment, id: 'deploy-skipped', is_skipped: true };
const buildingMatch = { ...successfulDeployment, id: 'deploy-building', latest_stage: { name: 'build', status: 'active' } };
const failedMatch = { ...successfulDeployment, id: 'deploy-failed', latest_stage: { name: 'deploy', status: 'failure' } };
assert.deepEqual(findSuccessfulProductionDeployment([staleProduction, successfulDeployment], expectedCommit), {
  id: 'deploy-current-main',
  commitSha: expectedCommit,
  branch: 'main',
  environment: 'production',
  stage: 'deploy',
  status: 'success',
}, 'a successful production deployment must match the exact expected main commit, not just the latest readiness response');
assert.equal(findSuccessfulProductionDeployment([staleProduction], expectedCommit), null, 'stale production commits must not be accepted');
assert.equal(findSuccessfulProductionDeployment([previewMatch], expectedCommit), null, 'preview deployments must not satisfy production readiness');
assert.equal(findSuccessfulProductionDeployment([skippedMatch], expectedCommit), null, 'skipped deployments must not satisfy production readiness');
assert.equal(findSuccessfulProductionDeployment([buildingMatch], expectedCommit), null, 'a build in progress must not satisfy production readiness');
assert.equal(findSuccessfulProductionDeployment([failedMatch], expectedCommit), null, 'a failed deploy must not satisfy production readiness');
assert.equal(findSuccessfulProductionDeployment([successfulDeployment], 'not-a-commit'), null, 'invalid expected commit strings must fail closed');
assert.equal(findSuccessfulProductionDeployment(null, expectedCommit), null, 'malformed deployment lists must fail closed');

const project = {
  subdomain: 'forgeos-2k0',
  deployment_configs: {
    production: {
      env_vars: {
        GEMINI_API_KEY: { type: 'secret_text', value: 'SENTINEL_GEMINI_KEY_MUST_NEVER_APPEAR' },
        RESEND_API_KEY: { type: 'secret_text', value: 'SENTINEL_RESEND_KEY_MUST_NEVER_APPEAR' },
        PROPERTY_LISTING_API_TOKEN: { type: 'secret_text', value: 'SENTINEL_PROPERTY_TOKEN_MUST_NEVER_APPEAR' },
        OVYX_PUBLIC_CONTACT_URL: { type: 'plain_text', value: 'https://contact.example.invalid/route' },
        OVYX_CONNECTION_ENCRYPTION_KEY: { type: 'secret_text', value: 'SENTINEL_ENCRYPTION_KEY_MUST_NEVER_APPEAR' },
        PUBLIC_SITE_TITLE: { type: 'plain_text', value: 'OVYX' },
        UNRELATED_SECRET: { type: 'secret_text', value: 'SENTINEL_UNRELATED_SECRET_MUST_NEVER_APPEAR' },
      },
    },
    preview: {
      env_vars: {
        OPENAI_API_KEY: { type: 'secret_text', value: 'SENTINEL_OPENAI_KEY_MUST_NEVER_APPEAR' },
        WHATSAPP_ACCESS_TOKEN: { type: 'secret_text', value: 'SENTINEL_WHATSAPP_TOKEN_MUST_NEVER_APPEAR' },
      },
    },
  },
};

const report = summarizeCloudflareRuntimeConfig(project);
assert.deepEqual(report.aiProviderKeyNames, ['GEMINI_API_KEY', 'OPENAI_API_KEY']);
assert.deepEqual(report.propertyIntegrationVariableNames, ['PROPERTY_LISTING_API_TOKEN']);
assert.deepEqual(report.enquiryAndSocialVariableNames, [
  'OVYX_PUBLIC_CONTACT_URL',
  'RESEND_API_KEY',
  'WHATSAPP_ACCESS_TOKEN',
]);
const evaluationSettings = readCloudflareEvaluationPublicSettings({
  deployment_configs: {
    production: {
      env_vars: {
        OVYX_EVAL_LISTINGS_PUBLIC_BROWSER_URL: { type: 'plain_text', value: 'https://public-feed.example.invalid/properties' },
        OVYX_EVAL_LISTINGS_SOURCE_AUTHORITY: { type: 'plain_text', value: 'authoritative' },
        OVYX_EVAL_PUBLIC_ENQUIRY_URL: { type: 'plain_text', value: 'https://forms.example.invalid/submit' },
        OVYX_EVAL_ENABLE_EXTERNAL_ENQUIRY_PROBE: { type: 'plain_text', value: 'true' },
        OVYX_EVAL_LISTINGS_API_TOKEN: { type: 'secret_text', value: 'SENTINEL_FEED_TOKEN_MUST_NEVER_APPEAR' },
        OVYX_EVAL_ENQUIRY_TEST_RECIPIENT: { type: 'secret_text', value: 'SENTINEL_OWNER_RECIPIENT_MUST_NEVER_APPEAR' },
        GEMINI_API_KEY: { type: 'secret_text', value: 'SENTINEL_PROVIDER_KEY_MUST_NEVER_APPEAR' },
      },
    },
    preview: {
      env_vars: {
        OVYX_EVAL_LISTINGS_PUBLIC_BROWSER_URL: { type: 'plain_text', value: 'https://preview-feed.example.invalid/properties' },
        OVYX_EVAL_PUBLIC_ENQUIRY_URL: { type: 'plain_text', value: 'https://preview-forms.example.invalid/submit' },
      },
    },
  },
});
assert.deepEqual(evaluationSettings, {
  OVYX_EVAL_LISTINGS_PUBLIC_BROWSER_URL: 'https://public-feed.example.invalid/properties',
  OVYX_EVAL_LISTINGS_SOURCE_AUTHORITY: 'authoritative',
  OVYX_EVAL_PUBLIC_ENQUIRY_URL: 'https://forms.example.invalid/submit',
  OVYX_EVAL_ENABLE_EXTERNAL_ENQUIRY_PROBE: 'true',
}, 'Only explicitly allow-listed production plain-text acceptance settings should be read.');
assert.equal(JSON.stringify(evaluationSettings).includes('SENTINEL_FEED_TOKEN_MUST_NEVER_APPEAR'), false);
assert.equal(JSON.stringify(evaluationSettings).includes('SENTINEL_OWNER_RECIPIENT_MUST_NEVER_APPEAR'), false);
assert.equal(JSON.stringify(evaluationSettings).includes('SENTINEL_PROVIDER_KEY_MUST_NEVER_APPEAR'), false);
assert.equal(JSON.stringify(evaluationSettings).includes('preview-feed.example.invalid'), false);
const serialized = JSON.stringify(report);
for (const marker of [
  'SENTINEL_GEMINI_KEY_MUST_NEVER_APPEAR',
  'SENTINEL_RESEND_KEY_MUST_NEVER_APPEAR',
  'SENTINEL_PROPERTY_TOKEN_MUST_NEVER_APPEAR',
  'SENTINEL_ENCRYPTION_KEY_MUST_NEVER_APPEAR',
  'SENTINEL_UNRELATED_SECRET_MUST_NEVER_APPEAR',
  'SENTINEL_OPENAI_KEY_MUST_NEVER_APPEAR',
  'SENTINEL_WHATSAPP_TOKEN_MUST_NEVER_APPEAR',
  'https://contact.example.invalid/route',
]) {
  assert.equal(serialized.includes(marker), false, 'Configuration report must never include values: ' + marker);
}
console.log('Cloudflare runtime config inventory reports only approved variable names and never secret values or public URL values.');
