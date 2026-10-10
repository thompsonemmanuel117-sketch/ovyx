// Safe compatibility endpoint for legacy provider-status surfaces.
// "CONFIGURED" means a secret exists in the server environment; it does not
// claim that the provider credentials authenticate or that requests succeed.
// Actual provider connectivity is tested by the authenticated /api/ai/status route.
const ROOT_EMAIL = 'ovyxsupportteam@gmail.com';

const PROVIDERS = Object.freeze([
  { id: 'gemini', key: 'GEMINI_API_KEY', label: 'Gemini' },
  { id: 'groq', key: 'GROQ_API_KEY', label: 'Groq (OVYX AI upstream)', groqFallback: true },
  { id: 'deepseek', key: 'DEEPSEEK_API_KEY', label: 'DeepSeek' },
  { id: 'anthropic', key: 'ANTHROPIC_API_KEY', label: 'Claude / compatible gateway' },
  { id: 'openai', keys: ['OVYX_AI_API_KEY', 'OPENAI_API_KEY'], label: 'OVYX AI' },
]);

const has = (env, key) => Boolean(String(env?.[key] || '').trim());
function apiHost(value) {
  try { return new URL(String(value || '')).hostname.toLowerCase(); } catch { return ''; }
}
function isGroqEndpoint(env) {
  return apiHost(env?.OVYX_AI_BASE_URL || env?.OPENAI_BASE_URL) === 'api.groq.com';
}
function isOpenRouterKey(value) {
  return /^sk-or-/i.test(String(value || '').trim());
}
const normalizeEmail = value => String(value || '').trim().toLowerCase();

function providerRows(env) {
  return PROVIDERS.map(provider => {
    const configured = Array.isArray(provider.keys)
      ? provider.keys.some(key => has(env, key))
      : has(env, provider.key) ||
        (provider.groqFallback && !has(env, provider.key) && has(env, 'OPENAI_API_KEY') && isGroqEndpoint(env));
    return {
      id: provider.id,
      provider: provider.id,
      name: provider.label,
      label: provider.label,
      status: configured ? 'CONFIGURED' : 'NOT_CONFIGURED',
      state: configured ? 'CONFIGURED' : 'NOT_CONFIGURED',
      configured,
      connected: false,
      verified: false,
      testRequired: configured,
      note: configured
        ? 'Server secret is present. Live provider authentication has not been tested by this endpoint.'
        : 'Server secret is not configured.'
    };
  });
}

export async function onRequestGet(context) {
  const started = Date.now();
  const { request, env } = context;
  const user = context.data?.user || null;
  // Never grant admin status based on the userEmail query parameter.
  // The middleware only supplies context.data.user after Firebase token validation.
  const isAdminUser =
    normalizeEmail(user?.email) === ROOT_EMAIL ||
    user?.owner === true ||
    user?.admin === true ||
    String(user?.role || '').toUpperCase() === 'ROOT_SUPERUSER';

  const providers = providerRows(env);
  const byId = Object.fromEntries(providers.map(row => [row.id, row]));
  // OVYX AI may use a compatible upstream without requiring a separate GROQ_API_KEY.
  if (byId.groq && isGroqEndpoint(env) && has(env, 'OPENAI_API_KEY')) {
    byId.groq.note = 'Uses the configured OVYX AI compatible endpoint. Live authentication must still be tested.';
  }
  if (byId.anthropic && isOpenRouterKey(env.ANTHROPIC_API_KEY)) {
    byId.anthropic.note = 'OpenRouter-compatible credential detected by its documented key prefix; status is configuration-only until the live probe succeeds.';
  }
  const firebaseReady =
    has(env, 'FIREBASE_PROJECT_ID') &&
    has(env, 'FIREBASE_WEB_API_KEY') &&
    (has(env, 'FIREBASE_SERVICE_ACCOUNT_JSON') || has(env, 'FIREBASE_SERVICE_ACCOUNT'));
  const githubReady =
    has(env, 'GITHUB_APP_ID') &&
    has(env, 'GITHUB_APP_INSTALLATION_ID') &&
    has(env, 'GITHUB_APP_PRIVATE_KEY');
  const cloudflareReady =
    has(env, 'CLOUDFLARE_ACCOUNT_ID') &&
    has(env, 'CLOUDFLARE_API_TOKEN') &&
    has(env, 'CLOUDFLARE_PAGES_PROJECT');
  const country = request.headers.get('CF-IPCountry') || 'NG';

  return Response.json({
    ok: true,
    authority: 'SERVER',
    ovyx: {
      recognized: true,
      platformName: 'OVYX',
      isAdminProfile: isAdminUser
    },
    providers,
    // Legacy named fields remain present so older dashboard cards do not break.
    gemini: { status: byId.gemini.status, configured: byId.gemini.configured },
    groq: { status: byId.groq.status, configured: byId.groq.configured },
    deepseek: { status: byId.deepseek.status, configured: byId.deepseek.configured },
    anthropic: { status: byId.anthropic.status, configured: byId.anthropic.configured },
    openai: { status: byId.openai.status, configured: byId.openai.configured },
    firebase: {
      status: firebaseReady ? 'CONFIGURED' : 'NOT_CONFIGURED',
      configured: firebaseReady,
      clientServerProjectMatch: Boolean(
        has(env, 'FIREBASE_PROJECT_ID') &&
        String(env.FIREBASE_PROJECT_ID).trim() === 'forgeos-49df6'
      )
    },
    github: {
      status: githubReady ? 'CONFIGURED' : 'NOT_CONFIGURED',
      configured: githubReady
    },
    cloudflare: {
      status: cloudflareReady ? 'CONFIGURED' : 'NOT_CONFIGURED',
      configured: cloudflareReady,
      environmentUrl: has(env, 'CLOUDFLARE_PAGES_URL') ? env.CLOUDFLARE_PAGES_URL : null
    },
    bankingInfrastructure: {
      routingState: has(env, 'OPAY_SECRET_KEY') && has(env, 'FOREIGN_SECRET_KEY')
        ? 'DUAL_ROUTING_ACTIVE'
        : has(env, 'OPAY_SECRET_KEY')
          ? 'LOCAL_ONLY_OPAY'
          : has(env, 'FOREIGN_SECRET_KEY')
            ? 'FOREIGN_ONLY_ACTIVE'
            : 'NO_PAYMENT_CONFIGURED',
      localGateway: {
        provider: 'OPay Nigeria Core Channels',
        status: has(env, 'OPAY_SECRET_KEY') ? 'CONFIGURED' : 'NOT_CONFIGURED'
      },
      internationalGateway: {
        provider: 'International Payment Gateway',
        status: has(env, 'FOREIGN_SECRET_KEY') ? 'CONFIGURED' : 'NOT_CONFIGURED'
      }
    },
    edgeTelemetry: {
      countryCode: country,
      currencyMode: country === 'NG' ? '₦' : '$',
      latencyMs: Date.now() - started,
      checkedAt: new Date().toISOString()
    },
    connectionEncryption: {
      configured: has(env, 'OVYX_CONNECTION_ENCRYPTION_KEY'),
      status: has(env, 'OVYX_CONNECTION_ENCRYPTION_KEY') ? 'CONFIGURED' : 'NOT_CONFIGURED'
    },
    warning: 'Configured status shows server-side secret presence only. It is not proof of valid credentials or a successful live request.'
  }, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

export async function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  return Response.json(
    { ok: false, error: 'METHOD_NOT_ALLOWED', message: 'GET is required.' },
    { status: 405, headers: { Allow: 'GET', 'Cache-Control': 'no-store' } }
  );
}
