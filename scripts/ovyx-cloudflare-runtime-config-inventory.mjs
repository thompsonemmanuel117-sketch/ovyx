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
