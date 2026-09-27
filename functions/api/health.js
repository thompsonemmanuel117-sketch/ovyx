const ENV_GROUPS = {
  Firebase: [
    'FIREBASE_PROJECT_ID',
    'FIREBASE_WEB_API_KEY',
    'FIREBASE_SERVICE_ACCOUNT_JSON',
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
  '/api/deploy',
];

function configured(env, key) {
  return Boolean(env?.[key] && String(env[key]).trim());
}

function summarize(env) {
  const groups = {};
  for (const [group, keys] of Object.entries(ENV_GROUPS)) {
    groups[group] = keys.map(key => ({
      key,
      configured: configured(env, key),
      required: REQUIRED.has(key),
    }));
  }
  return groups;
}

export function onRequestGet(context) {
  const env = context.env;
  const groups = summarize(env);
  const requiredMissing = Object.values(groups)
    .flat()
    .filter(item => item.required && !item.configured)
    .map(item => item.key);

  const aiReady = ENV_GROUPS.AI.some(key => configured(env, key));

  return Response.json({
    ok: requiredMissing.length === 0,
    status: requiredMissing.length === 0 ? 'healthy' : 'degraded',
    authority: 'SERVER',
    routes: ROUTES,
    services: {
      firebase: groups.Firebase,
      github: groups.GitHub,
      cloudflare: groups.Cloudflare,
      ai: {
        providers: groups.AI,
        ready: aiReady,
      },
      agent: groups.Agent,
    },
    missingRequiredEnvironment: requiredMissing,
    note: 'Cloudflare/Firebase runtime connectivity still requires the deployed environment to be checked; this endpoint does not pretend missing secrets are healthy.',
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
