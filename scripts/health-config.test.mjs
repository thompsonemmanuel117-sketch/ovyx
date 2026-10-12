import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { onRequestGet } from '../functions/api/health.js';

const projectId = 'forgeos-49df6';
const baseEnv = () => ({
  FIREBASE_PROJECT_ID: projectId,
  FIREBASE_WEB_API_KEY: 'test-web-api-key',
  GITHUB_TOKEN_ENCRYPTION_KEY: 'g'.repeat(48),
  GITHUB_ALLOWED_REPOS: 'thompsonemmanuel117-sketch/ovyx',
  OVYX_CONNECTION_ENCRYPTION_KEY: 'c'.repeat(48),
});

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const privateKeyPem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
const validServiceAccount = {
  type: 'service_account',
  project_id: projectId,
  private_key_id: 'test-key-id',
  private_key: privateKeyPem,
  client_email: 'ovyx-test@forgeos-49df6.iam.gserviceaccount.com',
  client_id: 'test-client-id',
};

async function health(env) {
  const response = await onRequestGet({
    env,
    request: new Request('https://ovyx.invalid/api/health'),
  });
  return response.json();
}

function row(payload, group, key) {
  const serviceGroup = ({ Firebase: 'firebase', GitHub: 'github', UniversalConnections: 'universalConnections' })[group] || group;
  return payload.services[serviceGroup].find((entry) => entry.key === key);
}

// Universal Connection encryption is required; health must flag it without exposing the key.
{
  const env = { ...baseEnv(), OVYX_CONNECTION_ENCRYPTION_KEY: undefined };
  const payload = await health(env);
  assert.equal(row(payload, 'UniversalConnections', 'OVYX_CONNECTION_ENCRYPTION_KEY').state, 'unavailable');
  assert(payload.unavailableRequiredEnvironment.includes('OVYX_CONNECTION_ENCRYPTION_KEY'));
  assert.equal(payload.ok, false);
  assert(!JSON.stringify(payload).includes('c'.repeat(48)));
}

// Universal Connection encryption is required; health must flag it without exposing the key.
{
  const env = { ...baseEnv(), OVYX_CONNECTION_ENCRYPTION_KEY: undefined };
  const payload = await health(env);
  assert.equal(row(payload, 'UniversalConnections', 'OVYX_CONNECTION_ENCRYPTION_KEY').state, 'unavailable');
  assert(payload.unavailableRequiredEnvironment.includes('OVYX_CONNECTION_ENCRYPTION_KEY'));
  assert.equal(payload.services.universalConnectionsEncryption.configured, false);
  assert.equal(payload.ok, false);
  assert(!JSON.stringify(payload).includes('c'.repeat(48)));
}

// Missing bindings and bindings with empty values must be reported separately.
{
  const env = baseEnv();
  const payload = await health(env);
  assert.equal(row(payload, 'GitHub', 'GITHUB_TOKEN_ENCRYPTION_KEY').state, 'configured');
  assert.equal(row(payload, 'Firebase', 'FIREBASE_SERVICE_ACCOUNT_JSON').state, 'absent');
  assert(payload.missingRequiredEnvironment.includes('FIREBASE_SERVICE_ACCOUNT_JSON'));
  assert(!payload.emptyRequiredEnvironment.includes('FIREBASE_SERVICE_ACCOUNT_JSON'));
}

{
  const env = { ...baseEnv(), GITHUB_TOKEN_ENCRYPTION_KEY: '', FIREBASE_SERVICE_ACCOUNT_JSON: '' };
  const payload = await health(env);
  assert(payload.emptyRequiredEnvironment.includes('GITHUB_TOKEN_ENCRYPTION_KEY'));
  assert(payload.emptyRequiredEnvironment.includes('FIREBASE_SERVICE_ACCOUNT_JSON'));
  assert(!payload.missingRequiredEnvironment.includes('GITHUB_TOKEN_ENCRYPTION_KEY'));
}

{
  const env = { ...baseEnv(), GITHUB_TOKEN_ENCRYPTION_KEY: 'too-short', OVYX_CONNECTION_ENCRYPTION_KEY: 'too-short', FIREBASE_SERVICE_ACCOUNT_JSON: '{bad json' };
  const payload = await health(env);
  assert.equal(row(payload, 'GitHub', 'GITHUB_TOKEN_ENCRYPTION_KEY').state, 'invalid');
  assert.equal(row(payload, 'UniversalConnections', 'OVYX_CONNECTION_ENCRYPTION_KEY').state, 'invalid');
  assert.equal(row(payload, 'Firebase', 'FIREBASE_SERVICE_ACCOUNT_JSON').state, 'invalid_json');
  assert(payload.invalidRequiredEnvironment.some((item) => item.key === 'GITHUB_TOKEN_ENCRYPTION_KEY'));
  assert(payload.invalidRequiredEnvironment.some((item) => item.key === 'OVYX_CONNECTION_ENCRYPTION_KEY' && item.reason === 'must_be_at_least_32_characters'));
  assert(payload.invalidRequiredEnvironment.some((item) => item.key === 'FIREBASE_SERVICE_ACCOUNT_JSON' && item.state === 'invalid_json'));
}

// A binding name can exist while the runtime returns no value; do not call this absent or blank.
{
  const env = {
    ...baseEnv(),
    GITHUB_TOKEN_ENCRYPTION_KEY: undefined,
    FIREBASE_SERVICE_ACCOUNT_JSON: undefined,
  };
  const payload = await health(env);
  assert.equal(row(payload, 'GitHub', 'GITHUB_TOKEN_ENCRYPTION_KEY').state, 'unavailable');
  assert.equal(row(payload, 'Firebase', 'FIREBASE_SERVICE_ACCOUNT_JSON').state, 'unavailable');
  assert(payload.unavailableRequiredEnvironment.includes('GITHUB_TOKEN_ENCRYPTION_KEY'));
  assert(payload.unavailableRequiredEnvironment.includes('FIREBASE_SERVICE_ACCOUNT_JSON'));
  assert(!payload.emptyRequiredEnvironment.includes('FIREBASE_SERVICE_ACCOUNT_JSON'));
}

// The health contract deliberately checks FIREBASE_SERVICE_ACCOUNT_JSON itself.
// An alias cannot hide a missing JSON binding.
{
  const env = {
    ...baseEnv(),
    FIREBASE_SERVICE_ACCOUNT: JSON.stringify(validServiceAccount),
  };
  const payload = await health(env);
  assert.equal(row(payload, 'Firebase', 'FIREBASE_SERVICE_ACCOUNT_JSON').state, 'absent');
  assert(payload.missingRequiredEnvironment.includes('FIREBASE_SERVICE_ACCOUNT_JSON'));
}

{
  const env = { ...baseEnv(), FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ project_id: projectId }) };
  const payload = await health(env);
  assert.equal(row(payload, 'Firebase', 'FIREBASE_SERVICE_ACCOUNT_JSON').state, 'invalid_shape');
}

{
  const env = {
    ...baseEnv(),
    FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ ...validServiceAccount, project_id: 'another-project' }),
  };
  const payload = await health(env);
  assert.equal(row(payload, 'Firebase', 'FIREBASE_SERVICE_ACCOUNT_JSON').state, 'project_mismatch');
}

// A well-formed service account should pass structural validation without exposing its value.
{
  const env = { ...baseEnv(), FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify(validServiceAccount) };
  const payload = await health(env);
  assert.equal(row(payload, 'Firebase', 'FIREBASE_SERVICE_ACCOUNT_JSON').state, 'configured');
  assert.equal(payload.services.firebaseServiceAccount.credentialAuthentication, 'not_checked');
  assert.equal(payload.ok, true);
  const json = JSON.stringify(payload);
  assert(!json.includes(validServiceAccount.private_key));
  assert(!json.includes(validServiceAccount.client_email));
}

console.log('OVYX runtime health configuration tests passed.');
