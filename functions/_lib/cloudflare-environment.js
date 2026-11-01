/**
 * Server-only Cloudflare Pages environment bridge.
 *
 * This module intentionally inventories binding NAMES, never values. Secret
 * values are returned only to a registered server-side adapter through the
 * explicit resolver and must never be serialized, logged, or passed to a model.
 */

const AI_PROVIDER_SECRET_NAMES = new Set([
  'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'ANTHROPIC_API_KEY', 'CLAUDE_API_KEY',
  'DEEPSEEK_API_KEY', 'OPENAI_API_KEY', 'GROQ_API_KEY', 'GROQ_API_TOKEN',
  'OPENROUTER_API_KEY', 'OPENROUTER_SECRET_KEY',
]);

const RESERVED_PREFIXES = ['FIREBASE_', 'CLOUDFLARE_', 'GITHUB_', 'OVYX_'];

export const INTEGRATION_ADAPTERS = Object.freeze({
  email: Object.freeze({
    label: 'Email delivery',
    providers: Object.freeze({
      resend: Object.freeze(['RESEND_API_KEY']),
      sendgrid: Object.freeze(['SENDGRID_API_KEY']),
      mailgun: Object.freeze(['MAILGUN_API_KEY']),
      brevo: Object.freeze(['BREVO_API_KEY', 'SENDINBLUE_API_KEY']),
    }),
  }),
  payments: Object.freeze({
    label: 'Payments',
    providers: Object.freeze({
      stripe: Object.freeze(['STRIPE_SECRET_KEY', 'STRIPE_API_KEY']),
      paystack: Object.freeze(['PAYSTACK_SECRET_KEY', 'PAYSTACK_SECRET']),
      flutterwave: Object.freeze(['FLUTTERWAVE_SECRET_KEY', 'FLW_SECRET_KEY']),
    }),
  }),
  messaging: Object.freeze({
    label: 'Messaging',
    providers: Object.freeze({
      twilio: Object.freeze(['TWILIO_AUTH_TOKEN', 'TWILIO_API_KEY_SECRET']),
      whatsapp: Object.freeze(['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_TOKEN']),
    }),
  }),
});

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getBindingNames(env) {
  if (!isRecord(env) && typeof env !== 'function') return [];
  try {
    return Object.keys(env).filter(name => /^[A-Z][A-Z0-9_]{1,127}$/.test(name)).sort();
  } catch {
    return [];
  }
}

function isConfiguredSecret(value) {
  // Do not stringify objects: Cloudflare service bindings (D1, KV, R2, AI)
  // are capabilities, not credential strings.
  return typeof value === 'string' && value.trim().length > 0;
}

export function resolveIntegrationCredential(env, integrationId, providerId) {
  const integration = INTEGRATION_ADAPTERS[String(integrationId || '').toLowerCase()];
  const provider = integration?.providers?.[String(providerId || '').toLowerCase()];
  if (!provider) {
    throw Object.assign(new Error('Integration adapter is not registered.'), {
      code: 'INTEGRATION_ADAPTER_NOT_REGISTERED',
      status: 404,
    });
  }

  for (const key of provider) {
    const value = env?.[key];
    if (isConfiguredSecret(value)) return Object.freeze({ key, value });
  }

  return null;
}

export function getCloudflareEnvironmentInventory(env) {
  const names = getBindingNames(env);
  const knownNames = new Set();
  const integrations = Object.entries(INTEGRATION_ADAPTERS).map(([id, definition]) => {
    const providers = Object.entries(definition.providers).map(([providerId, aliases]) => {
      aliases.forEach(name => knownNames.add(name));
      const configuredKey = aliases.find(name => isConfiguredSecret(env?.[name])) || null;
      const presentNames = aliases.filter(name => names.includes(name));
      return {
        id: providerId,
        label: providerId,
        configured: Boolean(configuredKey),
        matchedVariable: configuredKey,
        detectedVariableNames: presentNames,
        state: configuredKey ? 'configured' : presentNames.length ? 'empty' : 'missing',
      };
    });
    return {
      id,
      label: definition.label,
      configured: providers.some(provider => provider.configured),
      providers,
    };
  });

  const unrecognizedCredentialNames = names.filter(name => {
    if (knownNames.has(name) || AI_PROVIDER_SECRET_NAMES.has(name)) return false;
    if (RESERVED_PREFIXES.some(prefix => name.startsWith(prefix))) return false;
    return /(?:API_KEY|API_TOKEN|ACCESS_TOKEN|SECRET_KEY|CLIENT_SECRET|AUTH_TOKEN)$/.test(name);
  });

  return Object.freeze({
    runtime: 'cloudflare-pages-functions',
    discoveredBindingCount: names.length,
    integrations,
    unrecognizedCredentialNames,
    excludedAiProviderNames: [...AI_PROVIDER_SECRET_NAMES].filter(name => names.includes(name)).sort(),
    secretValuesExposed: false,
  });
}
