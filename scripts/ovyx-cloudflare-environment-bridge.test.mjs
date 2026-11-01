import assert from 'node:assert/strict';
import {
  getCloudflareEnvironmentInventory,
  resolveIntegrationCredential,
  resolveIntegrationCredentials,
} from '../functions/_lib/cloudflare-environment.js';

const env = {
  RESEND_API_KEY: 'SENTINEL_RESEND_SECRET_DO_NOT_LEAK',
  STRIPE_SECRET_KEY: 'SENTINEL_STRIPE_SECRET_DO_NOT_LEAK',
  WHATSAPP_ACCESS_TOKEN: 'SENTINEL_WHATSAPP_SECRET_DO_NOT_LEAK',
  OPAY_CASHIER_PUBLIC_KEY: 'SENTINEL_OPAY_PUBLIC_KEY_DO_NOT_LEAK',
  OPAY_CASHIER_SECRET_KEY: 'SENTINEL_OPAY_PRIVATE_KEY_DO_NOT_LEAK',
  PROPERTY_DATA_API_TOKEN: 'SENTINEL_UNKNOWN_SECRET_DO_NOT_LEAK',
  GEMINI_API_KEY: 'SENTINEL_GEMINI_SECRET_DO_NOT_LEAK',
  OPENAI_API_KEY: 'SENTINEL_OPENAI_SECRET_DO_NOT_LEAK',
  ANTHROPIC_API_KEY: 'SENTINEL_ANTHROPIC_SECRET_DO_NOT_LEAK',
  DEEPSEEK_API_TOKEN: 'SENTINEL_DEEPSEEK_SECRET_DO_NOT_LEAK',
  AI: { run() {} },
  DB: { prepare() {} },
  EMPTY_API_KEY: '',
};

const report = getCloudflareEnvironmentInventory(env);
assert.equal(report.runtime, 'cloudflare-pages-functions');
assert.equal(report.secretValuesExposed, false);
assert.equal(report.discoveredBindingCount, Object.keys(env).length);
assert.equal(report.integrations.find(item => item.id === 'email').providers.find(item => item.id === 'resend').configured, true);
assert.equal(report.integrations.find(item => item.id === 'payments').providers.find(item => item.id === 'stripe').configured, true);
assert.deepEqual(report.unrecognizedCredentialNames, ['PROPERTY_DATA_API_TOKEN']);
assert.deepEqual(report.excludedAiProviderNames, ['ANTHROPIC_API_KEY', 'DEEPSEEK_API_TOKEN', 'GEMINI_API_KEY', 'OPENAI_API_KEY']);

const serialized = JSON.stringify(report);
for (const secret of [
  'SENTINEL_RESEND_SECRET_DO_NOT_LEAK',
  'SENTINEL_STRIPE_SECRET_DO_NOT_LEAK',
  'SENTINEL_WHATSAPP_SECRET_DO_NOT_LEAK',
  'SENTINEL_OPAY_PUBLIC_KEY_DO_NOT_LEAK',
  'SENTINEL_OPAY_PRIVATE_KEY_DO_NOT_LEAK',
  'SENTINEL_UNKNOWN_SECRET_DO_NOT_LEAK',
  'SENTINEL_GEMINI_SECRET_DO_NOT_LEAK',
  'SENTINEL_OPENAI_SECRET_DO_NOT_LEAK',
  'SENTINEL_ANTHROPIC_SECRET_DO_NOT_LEAK',
  'SENTINEL_DEEPSEEK_SECRET_DO_NOT_LEAK',
]) assert.equal(serialized.includes(secret), false);

assert.equal(resolveIntegrationCredential(env, 'email', 'resend').key, 'RESEND_API_KEY');
assert.equal(resolveIntegrationCredential(env, 'payments', 'stripe').key, 'STRIPE_SECRET_KEY');
assert.equal(resolveIntegrationCredential(env, 'messaging', 'whatsapp').key, 'WHATSAPP_ACCESS_TOKEN');
assert.deepEqual(resolveIntegrationCredentials(env, 'payments', 'opay').map(item => item.key), ['OPAY_CASHIER_PUBLIC_KEY', 'OPAY_CASHIER_SECRET_KEY']);
assert.equal(resolveIntegrationCredential(env, 'email', 'sendgrid'), null);
assert.throws(() => resolveIntegrationCredential(env, 'unknown', 'provider'), { code: 'INTEGRATION_ADAPTER_NOT_REGISTERED' });
assert.equal(resolveIntegrationCredential({ RESEND_API_KEY: { secret: true } }, 'email', 'resend'), null,
  'Only string secret bindings may be used as credentials; service objects are not stringified.');

console.log('Cloudflare environment bridge tests passed: inventory is name-only, AI keys are excluded, and adapters resolve only registered credentials.');
