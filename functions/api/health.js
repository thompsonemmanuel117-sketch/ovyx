```javascript
/**
 * OVYX Health Check Endpoint
 *
 * Route: GET /api/health
 *
 * What this does:
 *   - Checks all required environment variables are set
 *   - Lists all available API routes
 *   - Returns a clean status report
 *   - Never exposes any secrets or tokens
 *
 * This file is SAFE — it only reads and reports, never changes anything.
 */

// =====================================================
// ENVIRONMENT VARIABLE CHECKS
// =====================================================

const REQUIRED_ENV_VARS = [
  // Firebase
  { key: 'FIREBASE_SERVICE_ACCOUNT_JSON', label: 'Firebase Service Account', group: 'Firebase' },
  { key: 'FIREBASE_API_KEY', label: 'Firebase API Key', group: 'Firebase' },

  // GitHub
  { key: 'GITHUB_CLIENT_ID', label: 'GitHub Client ID', group: 'GitHub' },
  { key: 'GITHUB_CLIENT_SECRET', label: 'GitHub Client Secret', group: 'GitHub' },
  { key: 'GITHUB_TOKEN', label: 'GitHub Token', group: 'GitHub' },
  { key: 'GITHUB_TOKEN_ENCRYPTION_KEY', label: 'GitHub Encryption Key', group: 'GitHub' },
  { key: 'GITHUB_REPO', label: 'GitHub Repo', group: 'GitHub' },

  // Cloudflare
  { key: 'CLOUDFLARE_ACCOUNT_ID', label: 'Cloudflare Account ID', group: 'Cloudflare' },
  { key: 'CLOUDFLARE_API_TOKEN', label: 'Cloudflare API Token', group: 'Cloudflare' },
  { key: 'CLOUDFLARE_PAGES_PROJECT', label: 'Cloudflare Pages Project', group: 'Cloudflare' },

  // Payments (OPay)
  { key: 'OPAY_SECRET_KEY', label: 'OPay Secret Key', group: 'Payments' },

  // AI Providers
  { key: 'GEMINI_API_KEY', label: 'Gemini API Key', group: 'AI Providers' },
  { key: 'OPENAI_API_KEY', label: 'OpenAI API Key', group: 'AI Providers' },
];

// =====================================================
// API ROUTE REGISTRY
// =====================================================

const KNOWN_ROUTES = [
  { path: '/api/auth/session', label: 'Auth: Session', group: 'Authentication' },
  { path: '/api/entitlements', label: 'Entitlements', group: 'Authentication' },
  { path: '/api/admin/rbac', label: 'Admin: RBAC', group: 'Admin' },
  { path: '/api/admin/users', label: 'Admin: Users', group: 'Admin' },
  { path: '/api/github/oauth', label: 'GitHub: OAuth', group: 'GitHub' },
  { path: '/api/github/repos', label: 'GitHub: Repos', group: 'GitHub' },
  { path: '/api/pay', label: 'Payments: Create', group: 'Payments' },
  { path: '/api/pay/webhook', label: 'Payments: Webhook', group: 'Payments' },
  { path: '/api/pay/verify', label: 'Payments: Verify', group: 'Payments' },
  { path: '/api/pay/refund', label: 'Payments: Refund', group: 'Payments' },
  { path: '/api/pay/status', label: 'Payments: Status', group: 'Payments' },
  { path: '/api/chat', label: 'AI: Chat', group: 'AI Assistant' },
  { path: '/api/generate', label: 'AI: Generate', group: 'AI Assistant' },
  { path: '/api/heartbeat', label: 'Runtime: Heartbeat', group: 'Runtime' },
  { path: '/api/sweep', label: 'Runtime: Sweeper', group: 'Runtime' },
];

// =====================================================
// HELPER FUNCTIONS
// =====================================================

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
    },
  });
}

function checkEnvVars(env) {
  const results = [];

  for (const config of REQUIRED_ENV_VARS) {
    const value = env?.[config.key];
    const isSet = value && String(value).trim().length > 0;

    results.push({
      key: config.key,
      label: config.label,
      group: config.group,
      status: isSet ? 'ok' : 'missing',
      preview: isSet ? '✅ Set' : '❌ Not set',
    });
  }

  return results;
}

function groupBy(items, key) {
  const groups = {};

  for (const item of items) {
    const groupKey = item[key];

    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }

    groups[groupKey].push(item);
  }

  return groups;
}

function summarizeStatus(items) {
  const total = items.length;
  const ok = items.filter(i => i.status === 'ok' || i.status === 'healthy').length;
  const missing = items.filter(i => i.status === 'missing').length;

  return { total, ok, missing };
}

// =====================================================
// MAIN HANDLER
// =====================================================

export async function onRequestGet(context) {
  const { request, env } = context;

  const startTime = Date.now();

  try {
    const envResults = checkEnvVars(env);
    const envSummary = summarizeStatus(envResults);
    const envByGroup = groupBy(envResults, 'group');
    const routesByGroup = groupBy(KNOWN_ROUTES, 'group');

    const report = {
      status: envSummary.missing === 0 ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      responseTimeMs: Date.now() - startTime,

      summary: {
        environmentVariables: {
          total: envSummary.total,
          set: envSummary.ok,
          missing: envSummary.missing,
        },
        apiRoutes: {
          total: KNOWN_ROUTES.length,
        },
      },

      services: Object.keys(envByGroup).map(groupName => {
        const vars = envByGroup[groupName];
        const allSet = vars.every(v => v.status === 'ok');

        return {
          service: groupName,
          status: allSet ? 'healthy' : 'missing-config',
          variables: vars.map(v => ({
            label: v.label,
            status: v.preview,
          })),
        };
      }),

      routes: Object.keys(routesByGroup).map(groupName => ({
        group: groupName,
        endpoints: routesByGroup[groupName].map(r => ({
          path: r.path,
          label: r.label,
        })),
      })),

      tips: envSummary.missing > 0
        ? [
            envSummary.missing + ' environment variable(s) are missing.',
            
            'Go to Cloudflare Dashboard → Workers & Pages → ovyx → Settings → Environment Variables to add them.',
          ]
        : [
            'All environment variables are set. System is ready.',
            'Visit /api/health anytime to check system status.',
          ],
    };

    return jsonResponse(report, 200);

  } catch (error) {
    return jsonResponse(
      {
        status: 'error',
        timestamp: new Date().toISOString(),
        error: 'Health check encountered an unexpected error.',
        message: error?.message || 'Unknown error',
        tip: 'Check that all _lib/ import paths are correct in your functions.',
      },
      500,
    );
  }
}

export async function onRequestPost() {
  return jsonResponse(
    { ok: false, error: 'This endpoint only accepts GET requests.', hint: 'Visit /api/health in your browser to see system status.' },
    405,
  );
}

export async function onRequestPut() {
  return jsonResponse(
    { ok: false, error: 'This endpoint only accepts GET requests.', hint: 'Visit /api/health in your browser to see system status.' },
    405,
  );
}

export async function onRequestDelete() {
  return jsonResponse(
    { ok: false, error: 'This endpoint only accepts GET requests.', hint: 'Visit /api/health in your browser to see system status.' },
    405,
  );
}
```
