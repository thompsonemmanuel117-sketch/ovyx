const ENV_GROUPS = {
  Firebase: [
    'FIREBASE_PROJECT_ID',
    'FIREBASE_WEB_API_KEY',
    'FIREBASE_SERVICE_ACCOUNT_JSON',
    'FIREBASE_SERVICE_ACCOUNT',
  ],
  GitHub: [
    'GITHUB_APP_ID',
    'GITHUB_APP_INSTALLATION_ID',
    'GITHUB_APP_PRIVATE_KEY',
    'GITHUB_TOKEN_ENCRYPTION_KEY',
    'GITHUB_ALLOWED_REPOS',
  ],
  Cloudflare: [
    'CLOUDFLARE_ACCOUNT_ID',
    'CLOUDFLARE_API_TOKEN',
    'CLOUDFLARE_PAGES_PROJECT',
  ],
  AI: [
    'GEMINI_API_KEY',
    'ANTHROPIC_API_KEY',
    'DEEPSEEK_API_KEY',
    'OPENAI_API_KEY',
    'GROQ_API_KEY',
    'OPENROUTER_API_KEY',
  ],
  AIModelConfiguration: [
    'GEMINI_MODEL',
    'GEMINI_AGENT_MODEL',
    'ANTHROPIC_MODEL',
    'ANTHROPIC_AGENT_MODEL',
    'DEEPSEEK_MODEL',
    'DEEPSEEK_AGENT_MODEL',
    'OPENAI_MODEL',
    'OPENAI_AGENT_MODEL',
    'CLOUDFLARE_AI_MODEL',
    'OVYX_AI_PROVIDER_ORDER',
    'AI_PROVIDER_ORDER',
  ],
  UniversalConnections: [
    'OVYX_CONNECTION_ENCRYPTION_KEY',
  ],
  Agent: [
    'OVYX_AGENT_CALLBACK_SECRET',
    'OVYX_AGENT_CALLBACK_URL',
  ],
};

const REQUIRED = new Set([
  'FIREBASE_PROJECT_ID',
  'FIREBASE_WEB_API_KEY',
  'FIREBASE_SERVICE_ACCOUNT_JSON',
  'GITHUB_TOKEN_ENCRYPTION_KEY',
  'GITHUB_ALLOWED_REPOS',
  'OVYX_CONNECTION_ENCRYPTION_KEY',
]);

const ROUTES = [
  '/api/health',
  '/api/service-status',
  '/api/entitlements',
  '/api/ai/assistant',
  '/api/ai/gateway',
  '/api/ai/status',
  '/api/generate',
  '/api/agent/status',
  '/api/agent/callback',
  '/api/admin/rbac',
  '/api/admin/users',
  '/api/github/oauth',
  '/api/github/repos',
  '/api/settings/connections',
  '/api/workspace/activate',
  '/api/deploy',
];

function inspectBinding(env, key) {
  const environment = env && (typeof env === 'object' || typeof env === 'function')
    ? env
    : null;

  if (!environment || !(key in environment)) {
    return { state: 'absent', value: undefined };
  }

  const value = environment[key];
  if (value === undefined || value === null) {
    return { state: 'unavailable', value };
  }
  if (String(value).trim() === '') {
    return { state: 'empty', value };
  }

  return { state: 'present', value };
}

function configured(env, key) {
  return inspectBinding(env, key).state === 'present';
}

function summarize(env) {
  const groups = {};
  for (const [group, keys] of Object.entries(ENV_GROUPS)) {
    groups[group] = keys.map((key) => {
      const binding = inspectBinding(env, key);
      return {
        key,
        configured: binding.state === 'present',
        state: binding.state,
        required: REQUIRED.has(key),
      };
    });
  }
  return groups;
}

function updateRow(groups, groupName, key, details) {
  const row = (groups[groupName] || []).find((item) => item.key === key);
  if (row) Object.assign(row, details);
}

function normalizePrivateKey(value) {
  return String(value || '').replace(/\\n/g, '\n').trim();
}

async function validateFirebaseServiceAccount(env) {
  const key = 'FIREBASE_SERVICE_ACCOUNT_JSON';
  const binding = inspectBinding(env, key);
  if (['absent', 'empty', 'unavailable'].includes(binding.state)) {
    const reasons = {
      absent: 'variable_not_present',
      empty: 'value_empty',
      unavailable: 'binding_exists_but_runtime_value_is_unavailable',
    };
    return {
      key,
      configured: false,
      required: true,
      state: binding.state,
      reason: reasons[binding.state],
    };
  }

  let account;
  try {
    account = typeof binding.value === 'string'
      ? JSON.parse(binding.value)
      : binding.value;
  } catch {
    return {
      key,
      configured: false,
      required: true,
      state: 'invalid_json',
      reason: 'value_is_not_valid_json',
    };
  }

  if (!account || typeof account !== 'object' || Array.isArray(account)) {
    return {
      key,
      configured: false,
      required: true,
      state: 'invalid_shape',
      reason: 'expected_service_account_object',
    };
  }

  const missingFields = ['client_email', 'private_key', 'project_id'].filter((field) => {
    return typeof account[field] !== 'string' || !account[field].trim();
  });
  if (missingFields.length) {
    return {
      key,
      configured: false,
      required: true,
      state: 'invalid_shape',
      reason: 'missing_required_fields',
      missingFields,
    };
  }

  const projectId = String(env?.FIREBASE_PROJECT_ID || '').trim();
  if (!projectId || account.project_id.trim() !== projectId) {
    return {
      key,
      configured: false,
      required: true,
      state: 'project_mismatch',
      reason: 'service_account_project_does_not_match_firebase_project',
    };
  }

  try {
    const pem = normalizePrivateKey(account.private_key);
    const match = pem.match(/^-----BEGIN PRIVATE KEY-----([\s\S]+?)-----END PRIVATE KEY-----$/);
    if (!match) throw new Error('Invalid PKCS8 private key envelope.');
    const base64 = match[1].replace(/\s+/g, '');
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new Error('Invalid private key encoding.');
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    await crypto.subtle.importKey(
      'pkcs8',
      bytes.buffer,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    );
  } catch {
    return {
      key,
      configured: false,
      required: true,
      state: 'invalid_private_key',
      reason: 'private_key_is_not_a_valid_pkcs8_rsa_key',
    };
  }

  return {
    key,
    configured: true,
    required: true,
    state: 'configured',
    reason: 'json_shape_project_and_private_key_format_checked',
    credentialAuthentication: 'not_checked',
  };
}

function validateGitHubTokenEncryptionKey(env) {
  const key = 'GITHUB_TOKEN_ENCRYPTION_KEY';
  const binding = inspectBinding(env, key);
  if (['absent', 'empty', 'unavailable'].includes(binding.state)) {
    const reasons = {
      absent: 'variable_not_present',
      empty: 'value_empty',
      unavailable: 'binding_exists_but_runtime_value_is_unavailable',
    };
    return {
      key,
      configured: false,
      required: true,
      state: binding.state,
      reason: reasons[binding.state],
    };
  }

  if (String(binding.value).trim().length < 32) {
    return {
      key,
      configured: false,
      required: true,
      state: 'invalid',
      reason: 'must_be_at_least_32_characters',
    };
  }

  return {
    key,
    configured: true,
    required: true,
    state: 'configured',
    reason: 'minimum_length_check_passed',
  };
}

function validateConnectionEncryptionKey(env) {
  const key = 'OVYX_CONNECTION_ENCRYPTION_KEY';
  const binding = inspectBinding(env, key);
  if (['absent', 'empty', 'unavailable'].includes(binding.state)) {
    const reasons = {
      absent: 'variable_not_present',
      empty: 'value_empty',
      unavailable: 'binding_exists_but_runtime_value_is_unavailable',
    };
    return {
      key,
      configured: false,
      required: true,
      state: binding.state,
      reason: reasons[binding.state],
    };
  }
  if (String(binding.value).trim().length < 32) {
    return {
      key,
      configured: false,
      required: true,
      state: 'invalid',
      reason: 'must_be_at_least_32_characters',
    };
  }
  return {
    key,
    configured: true,
    required: true,
    state: 'configured',
    reason: 'minimum_length_check_passed',
  };
}

export async function onRequestGet(context) {
  const env = context.env || {};
  const groups = summarize(env);

  // These two critical bindings need more than a non-empty check. The API
  // reports only states and field names; it never returns secret values.
  const githubEncryption = validateGitHubTokenEncryptionKey(env);
  const connectionEncryption = validateConnectionEncryptionKey(env);
  const firebaseAccount = await validateFirebaseServiceAccount(env);

  updateRow(groups, 'GitHub', 'GITHUB_TOKEN_ENCRYPTION_KEY', githubEncryption);
  updateRow(groups, 'UniversalConnections', 'OVYX_CONNECTION_ENCRYPTION_KEY', connectionEncryption);
  updateRow(groups, 'Firebase', 'FIREBASE_SERVICE_ACCOUNT_JSON', firebaseAccount);

  const firebaseProjectId = String(env?.FIREBASE_PROJECT_ID || '').trim();
  const firebaseProjectMatch = Boolean(
    firebaseProjectId && firebaseProjectId === 'forgeos-49df6'
  );

  const requiredRows = Object.values(groups).flat().filter((item) => item.required);
  const missingRequiredEnvironment = requiredRows
    .filter((item) => item.state === 'absent')
    .map((item) => item.key);
  const emptyRequiredEnvironment = requiredRows
    .filter((item) => item.state === 'empty')
    .map((item) => item.key);
  const unavailableRequiredEnvironment = requiredRows
    .filter((item) => item.state === 'unavailable')
    .map((item) => item.key);
  const invalidRequiredEnvironment = requiredRows
    .filter((item) => !['absent', 'empty', 'unavailable', 'present', 'configured'].includes(item.state))
    .map((item) => ({
      key: item.key,
      state: item.state,
      reason: item.reason || 'value_failed_validation',
    }));

  if (firebaseProjectId && !firebaseProjectMatch && !invalidRequiredEnvironment.some((item) => item.key === 'FIREBASE_PROJECT_ID')) {
    invalidRequiredEnvironment.push({
      key: 'FIREBASE_PROJECT_ID',
      state: 'project_mismatch',
      reason: 'server_project_does_not_match_client_project',
    });
  }

  const hasAiBinding = Boolean(env?.AI && typeof env.AI.run === 'function');
  const aiReady = [
    'GEMINI_API_KEY',
    'ANTHROPIC_API_KEY',
    'DEEPSEEK_API_KEY',
    'OPENAI_API_KEY',
    'GROQ_API_KEY',
    'OPENROUTER_API_KEY',
  ].some((key) => configured(env, key)) || hasAiBinding;

  const serviceAccountRow = groups.Firebase.find((item) => item.key === 'FIREBASE_SERVICE_ACCOUNT_JSON');
  const hasBlockingConfigurationProblems =
    missingRequiredEnvironment.length > 0 ||
    emptyRequiredEnvironment.length > 0 ||
    unavailableRequiredEnvironment.length > 0 ||
    invalidRequiredEnvironment.length > 0;

  return Response.json({
    ok: !hasBlockingConfigurationProblems && firebaseProjectMatch,
    status: !hasBlockingConfigurationProblems && firebaseProjectMatch ? 'healthy' : 'degraded',
    authority: 'SERVER',
    routes: ROUTES,
    services: {
      firebase: groups.Firebase,
      firebaseServiceAccount: serviceAccountRow,
      firebaseProjectCheck: {
        clientServerProjectMatch: firebaseProjectMatch,
        clientProjectId: 'forgeos-49df6',
      },
      universalConnections: groups.UniversalConnections,
      universalConnectionsEncryption: connectionEncryption,
      github: groups.GitHub,
      githubTokenEncryption: githubEncryption,
      cloudflare: groups.Cloudflare,
      ai: {
        providers: groups.AI,
        modelConfiguration: groups.AIModelConfiguration,
        workersAiBinding: {
          configured: hasAiBinding,
          binding: 'AI',
        },
        ready: aiReady,
      },
      agent: groups.Agent,
    },
    missingRequiredEnvironment,
    emptyRequiredEnvironment,
    unavailableRequiredEnvironment,
    invalidRequiredEnvironment,
    note: 'Secret values are never returned. The runtime distinguishes absent bindings, blank values, unreadable/null values, and invalid non-empty values. Firebase service-account checks validate JSON, required fields, project match, and private-key format; they do not authenticate the account with Google.',
  });
}

export function onRequest(context) {
  if (context.request.method === 'GET') {
    return onRequestGet(context);
  }

  return Response.json(
    { ok: false, error: 'METHOD_NOT_ALLOWED' },
    { status: 405, headers: { Allow: 'GET' } },
  );
}
