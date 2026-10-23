const AI_PROVIDER_KEYS = new Set([
  'GEMINI_API_KEY',
  'ANTHROPIC_API_KEY',
  'DEEPSEEK_API_KEY',
  'OPENAI_API_KEY',
  'GROQ_API_KEY',
  'OPENROUTER_API_KEY',
]);

const PROPERTY_PATTERN = /PROPERTY|LISTING|REALTY|REAL_ESTATE|ZILLOW|ZOOPLA/i;
const ENQUIRY_PATTERN = /ENQUIR|CONTACT|RESEND|SMTP|EMAIL|SENDGRID|MAILGUN|WHATSAPP|TWILIO|SOCIAL|WEBHOOK|FORM/i;

// Deliberately returns variable *names only*. The Cloudflare Pages project API
// can include secret values in its JSON response. Never copy values into this
// inventory, logs, generated artifacts, or error messages.
export function summarizeCloudflareRuntimeConfig(project) {
  const names = new Set();

  const inspect = node => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) inspect(item);
      return;
    }

    for (const [key, value] of Object.entries(node)) {
      if (key === 'env_vars' && value && typeof value === 'object' && !Array.isArray(value)) {
        for (const [name, definition] of Object.entries(value)) {
          const type = String(definition?.type || '').toLowerCase();
          if (type === 'plain_text' || type === 'secret_text') {
            names.add(String(name).slice(0, 120));
          }
        }
        continue;
      }
      inspect(value);
    }
  };

  inspect(project);
  const all = [...names].sort();
  return {
    aiProviderKeyNames: all.filter(name => AI_PROVIDER_KEYS.has(name)),
    propertyIntegrationVariableNames: all.filter(name => PROPERTY_PATTERN.test(name)),
    enquiryAndSocialVariableNames: all.filter(name => ENQUIRY_PATTERN.test(name)),
  };
}


// Select only a completed, non-skipped production deployment built from the
// exact trusted main commit currently being evaluated. A successful HTTP readiness
// probe against a stale Pages deployment is not sufficient evidence.
export function findSuccessfulProductionDeployment(deployments, expectedCommitSha) {
  const expected = String(expectedCommitSha || '').trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(expected) || !Array.isArray(deployments)) return null;
  const deployment = deployments.find(item => {
    const sha = String(item?.deployment_trigger?.metadata?.commit_hash || '').trim().toLowerCase();
    const branch = String(item?.deployment_trigger?.metadata?.branch || '').trim();
    return item?.environment === 'production' &&
      item?.is_skipped !== true &&
      sha === expected &&
      branch === 'main' &&
      item?.latest_stage?.name === 'deploy' &&
      item?.latest_stage?.status === 'success';
  });
  if (!deployment) return null;
  return {
    id: String(deployment.id || '').slice(0, 100),
    commitSha: expected,
    branch: 'main',
    environment: 'production',
    stage: 'deploy',
    status: 'success',
  };
}

const PUBLIC_EVALUATION_VARIABLES = Object.freeze([
  'OVYX_EVAL_LISTINGS_PUBLIC_BROWSER_URL',
  'OVYX_EVAL_LISTINGS_SOURCE_AUTHORITY',
  'OVYX_EVAL_LISTINGS_JSON_PATH',
  'OVYX_EVAL_LISTING_ID_FIELD',
  'OVYX_EVAL_LISTING_TITLE_FIELD',
  'OVYX_EVAL_LISTING_LOCATION_FIELD',
  'OVYX_EVAL_LISTING_STATUS_FIELD',
  'OVYX_EVAL_PUBLIC_ENQUIRY_URL',
  'OVYX_EVAL_ENABLE_EXTERNAL_ENQUIRY_PROBE',
]);

// Read only an allow-list of explicitly public, plain-text evaluation settings
// from the production Pages config. Never read or return secret_text values,
// provider keys, recipient addresses, or arbitrary environment variables.
export function readCloudflareEvaluationPublicSettings(project) {
  const configured = project?.deployment_configs?.production?.env_vars;
  const result = {};
  if (!configured || typeof configured !== 'object' || Array.isArray(configured)) return result;
  for (const name of PUBLIC_EVALUATION_VARIABLES) {
    const definition = configured[name];
    if (!definition || String(definition.type || '').toLowerCase() !== 'plain_text') continue;
    if (typeof definition.value !== 'string') continue;
    const value = definition.value.trim();
    if (value && value.length <= 2048 && !/[\r\n\0]/.test(value)) result[name] = value;
  }
  return result;
}
