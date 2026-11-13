import assert from 'node:assert/strict';
import { readCloudflareEvaluationPublicSettings, summarizeCloudflareRuntimeConfig } from './ovyx-cloudflare-runtime-config-inventory.mjs';

const project = {
  subdomain: 'forgeos-2k0',
  deployment_configs: {
    production: {
      env_vars: {
        GEMINI_API_KEY: { type: 'secret_text', value: 'SENTINEL_GEMINI_KEY_MUST_NEVER_APPEAR' },
        GROQ_API_TOKEN: { type: 'secret_text', value: 'SENTINEL_GROQ_ALIAS_KEY_MUST_NEVER_APPEAR' },
        RESEND_API_KEY: { type: 'secret_text', value: 'SENTINEL_RESEND_KEY_MUST_NEVER_APPEAR' },
        OPAY_MERCHANT_ID: { type: 'secret_text', value: 'SENTINEL_OPAY_MERCHANT_MUST_NEVER_APPEAR' },
        OPAY_CASHIER_PUBLIC_KEY: { type: 'secret_text', value: 'SENTINEL_OPAY_PUBLIC_MUST_NEVER_APPEAR' },
        OPAY_CASHIER_SECRET_KEY: { type: 'secret_text', value: 'SENTINEL_OPAY_SECRET_MUST_NEVER_APPEAR' },
        GITHUB_CLIENT_ID: { type: 'plain_text', value: 'public-client-id-fixture' },
        GITHUB_CLIENT_SECRET: { type: 'secret_text', value: 'SENTINEL_GITHUB_CLIENT_SECRET_MUST_NEVER_APPEAR' },
        GITHUB_TOKEN_ENCRYPTION_KEY: { type: 'secret_text', value: 'SENTINEL_GITHUB_ENCRYPTION_MUST_NEVER_APPEAR' },
        OVYX_SENTINEL_CRON_SECRET: { type: 'secret_text', value: 'SENTINEL_CRON_PROD_MUST_NEVER_APPEAR' },
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
        OPENROUTER_SECRET_KEY: { type: 'secret_text', value: 'SENTINEL_OPENROUTER_ALIAS_KEY_MUST_NEVER_APPEAR' },
        WHATSAPP_ACCESS_TOKEN: { type: 'secret_text', value: 'SENTINEL_WHATSAPP_TOKEN_MUST_NEVER_APPEAR' },
        PAYSTACK_SECRET_KEY: { type: 'secret_text', value: 'SENTINEL_PAYSTACK_SECRET_MUST_NEVER_APPEAR' },
        GITHUB_CLIENT_ID: { type: 'plain_text', value: 'preview-client-id-fixture' },
      },
    },
  },
};

const report = summarizeCloudflareRuntimeConfig(project);
assert.deepEqual(report.aiProviderKeyNames, ['GEMINI_API_KEY', 'OPENAI_API_KEY']);
assert.deepEqual(report.productionAiProviderKeyNames, ['GEMINI_API_KEY']);
assert.deepEqual(report.previewAiProviderKeyNames, ['OPENAI_API_KEY']);
assert.deepEqual(report.productionUnrecognizedAiProviderCredentialVariableNames, ['GROQ_API_TOKEN'],
  'Production aliases should be visible by name only so the owner can detect naming mismatches safely.');
assert.deepEqual(report.previewUnrecognizedAiProviderCredentialVariableNames, ['OPENROUTER_SECRET_KEY'],
  'Preview provider aliases must be labelled separately from production.');
assert.deepEqual(report.propertyIntegrationVariableNames, ['PROPERTY_LISTING_API_TOKEN']);
assert.deepEqual(report.paymentIntegrationVariableNames, ['OPAY_CASHIER_PUBLIC_KEY', 'OPAY_CASHIER_SECRET_KEY', 'OPAY_MERCHANT_ID', 'PAYSTACK_SECRET_KEY']);
assert.deepEqual(report.productionPaymentIntegrationVariableNames, ['OPAY_CASHIER_PUBLIC_KEY', 'OPAY_CASHIER_SECRET_KEY', 'OPAY_MERCHANT_ID']);
assert.deepEqual(report.previewPaymentIntegrationVariableNames, ['PAYSTACK_SECRET_KEY']);
assert.deepEqual(report.githubIntegrationVariableNames, ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'GITHUB_TOKEN_ENCRYPTION_KEY']);
assert.equal(report.productionSentinelCronSecretPresent, true);
assert.equal(report.previewSentinelCronSecretPresent, false,
  'The report must clearly reveal a missing Preview Sentinel secret without exposing its value.');

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
  'SENTINEL_GROQ_ALIAS_KEY_MUST_NEVER_APPEAR',
  'SENTINEL_OPENROUTER_ALIAS_KEY_MUST_NEVER_APPEAR',
  'SENTINEL_RESEND_KEY_MUST_NEVER_APPEAR',
  'SENTINEL_OPAY_MERCHANT_MUST_NEVER_APPEAR',
  'SENTINEL_OPAY_PUBLIC_MUST_NEVER_APPEAR',
  'SENTINEL_OPAY_SECRET_MUST_NEVER_APPEAR',
  'SENTINEL_GITHUB_CLIENT_SECRET_MUST_NEVER_APPEAR',
  'SENTINEL_GITHUB_ENCRYPTION_MUST_NEVER_APPEAR',
  'SENTINEL_CRON_PROD_MUST_NEVER_APPEAR',
  'SENTINEL_PAYSTACK_SECRET_MUST_NEVER_APPEAR',
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
