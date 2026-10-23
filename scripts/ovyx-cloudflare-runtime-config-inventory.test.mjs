import assert from 'node:assert/strict';
import { summarizeCloudflareRuntimeConfig } from './ovyx-cloudflare-runtime-config-inventory.mjs';

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
