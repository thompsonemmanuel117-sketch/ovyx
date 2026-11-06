import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const catalogue = read('assets/ovyx-personal-connections-catalogue.js');
const center = read('assets/ovyx-personal-connections-center.js');
const middleware = read('functions/_middleware.js');
const headers = read('_headers');
const packageJson = JSON.parse(read('package.json'));

assert.match(catalogue, /const SERVICES = Object\.freeze\(\[/);
for (const service of [
  'OpenAI','Anthropic Claude','Google Gemini','DeepSeek','Groq','OpenRouter',
  'Stripe','Paystack','Flutterwave','OPay','Resend','SendGrid','Twilio',
  'WhatsApp Cloud API','Slack','Discord','Notion','Airtable','HubSpot',
  'Salesforce','Shopify','WooCommerce','Supabase','Cloudflare','Google Drive',
  'Google Sheets','Google Calendar','GitHub','Figma','Custom HTTPS API'
]) assert.ok(catalogue.includes("name:'" + service + "'"), 'Catalogue must include ' + service);

assert.match(catalogue, /cdn\.simpleicons\.org\//, 'Recognizable services must use brand logos.');
assert.match(catalogue, /referrerpolicy="no-referrer"/i, 'Logo requests must not leak the OVYX page referrer.');
assert.match(catalogue, /OAuth:/, 'Every service card must disclose OAuth availability.');
assert.match(catalogue, /Project adapter:/, 'Every service card must disclose project-adapter readiness.');
assert.match(catalogue, /Generic HTTPS adapter ready/, 'The generic project adapter must be identified accurately.');
assert.match(catalogue, /0 native provider adapters/, 'The catalogue must not invent provider-specific project adapters.');
assert.match(catalogue, /The separate GitHub account OAuth flow is not a project connection adapter/);
assert.match(catalogue, /OVYX platform checkout routes are separate from project adapters/);
assert.match(catalogue, /OAuth-enabled services use a real consent and callback flow/);
for (const service of ['notion','slack','discord','googledrive','googlesheets','googlecalendar']) assert.ok(catalogue.includes("oauthService:'" + service + "'"), 'OAuth service must be registered: ' + service);
assert.match(catalogue, /ovyx:connection-oauth-readiness/);
assert.match(catalogue, /ovyx:connection-oauth-start/);
assert.match(catalogue, /enabled:false/, 'OAuth-only or unsupported signed integrations must not offer a misleading Connect action.');
assert.match(catalogue, /if \(service\.type === 'ai'\)/, 'AI providers must use their dedicated secure Personal AI flow.');
assert.match(catalogue, /data-ovyx-personal-ai-manager/, 'AI catalogue entries must reuse the existing Personal AI manager.');
assert.match(catalogue, /data-pc-add/, 'Non-AI services must reuse the existing Personal Connections setup flow.');
assert.match(catalogue, /endpoint\.value = ''/, 'The catalogue must not invent or prefill a provider endpoint.');
assert.match(catalogue, /Saving the connection does not create a native provider adapter/);
assert.match(catalogue, /new MutationObserver/, 'The catalogue must remount after the existing settings panel rerenders.');
assert.match(catalogue, /setAttribute\('aria-label', 'Service catalogue'\)/);
assert.match(center, /Your connections\. One secure home\./, 'The existing Personal Connections centre must remain intact.');
assert.match(center, /function grant\(/, 'Existing project permission management must remain intact.');
assert.match(center, /async function test\(/, 'Existing connection verification must remain intact.');
assert.match(middleware, /ovyx-personal-connections-catalogue\.js\?v=/, 'The catalogue runtime must be loaded by Pages middleware.');
assert.match(headers, /\/assets\/ovyx-personal-connections-catalogue\.js[\s\S]*?Cache-Control: no-store/, 'The catalogue runtime must not be served stale.');
assert.ok(packageJson.scripts.test.includes('scripts/ovyx-personal-connections-catalogue.test.mjs'), 'The catalogue regression test must run in the full test suite.');

console.log('Personal Connections catalogue tests passed: branded service discovery, honest OAuth and adapter status, safe connection handoff, and preservation of existing account controls.');
