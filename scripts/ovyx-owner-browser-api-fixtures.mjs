import assert from 'node:assert/strict';

/**
 * Browser-only network fixture for the local Pages shell. The real server
 * contract is covered by the owner-control/static/integration suites. These
 * responses keep a no-secret local E2E runtime from turning expected auth and
 * missing-environment responses into misleading browser-console failures.
 * Keep the response bodies shaped like the corresponding public/admin APIs.
 */
export async function installOwnerBrowserApiFixtures(page) {
  const pricing = {
    pro: { ngn: 33500, usd: 20 },
    max: { ngn: 209375, usd: 120 }
  };
  const tokenQuotas = { free: 50000, pro: 500000, max: 5000000 };
  const dailyPromptQuotas = { free: 4, pro: 20, max: 100 };
  const planFeatures = {
    pro: ['webStudio', 'appStudio', 'aiGeneration', 'github', 'cloudflareDeploy', 'templates'],
    max: ['webStudio', 'advancedWebStudio', 'appStudio', 'aiGeneration', 'github', 'cloudflareDeploy', 'teamWorkspace', 'templates']
  };
  const gates = {
    webstudio: 'pro', advancedwebstudio: 'max', appstudio: 'max',
    aigeneration: 'free', github: 'pro', cloudflaredeploy: 'pro',
    teamworkspace: 'max', templates: 'free'
  };
  const aiConfig = { providerOrder: ['gemini', 'deepseek', 'claude', 'openai', 'groq', 'openrouter'] };
  let identity = { assistantName: 'OVYX AI', persona: '', markColor: '#E8B64F' };
  let integrationLive = true;

  const responseFor = (path, method, request) => {
    if (path === '/api/entitlements') return null; // explicit identity fixture is registered after this catch-all
    if (path === '/api/health') return {
      ok: true, status: 'READY', healthy: true, groups: {}, summary: { ok: true }, routes: [],
      missingRequiredEnvironment: [], invalidRequiredEnvironment: [], checkedAt: new Date().toISOString()
    };
    if (path === '/api/plans') return {
      ok: true, pricing, tokenQuotas, dailyPromptQuotas, features: planFeatures,
      planFeaturesManaged: false, accessRules: [], gating: gates, source: 'server-fixture'
    };
    if (path === '/api/service-status') return {
      ok: true, providers: [], services: [], statuses: [], ovyx: { recognized: true, isAdminProfile: true },
      edgeTelemetry: { latencyMs: 1, countryCode: 'NG', currencyMode: '₦' }
    };
    if (path === '/api/identity') return { ok: true, identity: { assistantName: identity.assistantName, markColor: identity.markColor } };
    if (path === '/api/admin/identity') {
      if (method === 'POST') {
        try {
          const payload = request.postDataJSON() || {};
          identity = { ...identity, ...(payload.identity || payload) };
        } catch {}
      }
      return { ok: true, identity, authority: 'SERVER', scope: 'global', updatedAt: 'fixture' };
    }
    if (path === '/api/admin/ai-config') {
      if (method === 'POST') {
        try {
          const payload = request.postDataJSON() || {};
          const next = payload.config || payload;
          if (Array.isArray(next.providerOrder)) aiConfig.providerOrder = next.providerOrder;
        } catch {}
      }
      return { ok: true, config: aiConfig, updatedAt: 'fixture', authority: 'SERVER' };
    }
    if (path === '/api/admin/users') {
      const payload = (() => { try { return request.postDataJSON() || {}; } catch { return {}; } })();
      if (method === 'POST') {
        return {
          ok: true, action: payload.action || 'fixture', uid: payload.uid || 'fixture-user',
          plan: payload.plan || 'free', disabled: payload.disabled === true,
          refreshTokensRevoked: true, quota: { monthly: tokenQuotas[payload.plan || 'free'] || tokenQuotas.free },
          updatedAt: 'fixture', authority: 'FIREBASE_AUTH_AND_SERVER'
        };
      }
      return { ok: true, authority: 'SERVER', users: [], nextPageToken: null, pageSize: 50 };
    }
    if (path === '/api/admin/sentinel') return {
      ok: true, latestReport: { status: 'healthy', critical: 0, warnings: 0, checkedAt: 'fixture' },
      latestDiagnosis: null, diagnoses: [], lastScanAt: 'fixture', totalRuns: 1, reports: [], fixPlan: []
    };
    if (path === '/api/admin/sentinel-diagnose') return { ok: true, diagnosis: null, changesApplied: false };
    if (path === '/api/admin/sentinel-companion') return { ok: true, reply: 'Fixture status only.', actions: [] };
    if (path === '/api/admin/guardian-repo') return { ok: true, repositories: [], files: [], results: [] };
    if (path === '/api/admin/guardian-patch') return { ok: true, preview: true, changesApplied: false, files: [] };
    if (path === '/api/ai/status') return {
      ok: true, status: 'DEGRADED', providers: [], additionalProviders: [],
      cloudflare: { workersAiBinding: false, edgeRuntime: 'BROWSER_FIXTURE' }, checkedAt: 'fixture'
    };
    if (path === '/api/ai/provider-availability') return { ok: true, providers: [], availability: [] };
    if (path === '/api/tokens/balance') return {
      ok: true, plan: 'free', monthlyLimit: 50000, dailyLimit: 4,
      current_monthly_tokens: 50000, daily_prompts_allowance: 4,
      boosterTokens: 0, is_monthly_exhausted: false, mode: 'monthly', bypass: false
    };
    if (path === '/api/notifications') return { ok: true, notifications: [], unreadCount: 0 };
    if (path === '/api/settings/connections') return { ok: true, connections: [], items: [] };
    if (path === '/api/github/repos') return { ok: true, repositories: [], repos: [] };
    if (path === '/api/admin/control') {
      const payload = (() => { try { return request.postDataJSON() || {}; } catch { return {}; } })();
      if (method === 'POST' && payload.action === 'setProductionState') integrationLive = payload.live === true;
      const config = {
        pricing, gating: gates, masterAdminOverride: false,
        liveDeploy: integrationLive, productionLive: integrationLive,
        environment: integrationLive ? 'live' : 'sandbox', updatedAt: 'fixture'
      };
      return { ok: true, config, authority: 'SERVER_ADMIN' };
    }
    if (path === '/api/admin/plans/update') {
      const payload = (() => { try { return request.postDataJSON() || {}; } catch { return {}; } })();
      const config = {
        pricing: payload.pricing || pricing,
        tokenQuotas: payload.tokenQuotas || tokenQuotas,
        dailyPromptQuotas: payload.dailyPromptQuotas || dailyPromptQuotas,
        planFeatures: payload.features || planFeatures,
        planFeaturesManaged: true,
        gating: payload.gating || gates,
        accessRules: payload.accessRules || []
      };
      return { ok: true, config, authority: 'SERVER_ADMIN' };
    }
    if (path === '/api/admin/broadcasts') {
      if (method === 'POST') {
        const payload = (() => { try { return request.postDataJSON() || {}; } catch { return {}; } })();
        return { ok: true, broadcast: { id: 'fixture-broadcast', ...payload, body: payload.message || payload.body || '', published: true }, delivery: 'global-inbox' };
      }
      return { ok: true, broadcasts: [], nextPageToken: null };
    }
    if (path === '/api/admin/templates') {
      if (method === 'POST') {
        const payload = (() => { try { return request.postDataJSON() || {}; } catch { return {}; } })();
        return { ok: true, template: { id: 'fixture-template', ...payload, published: true, updatedAt: 'fixture' }, scope: 'global' };
      }
      return { ok: true, templates: [], nextPageToken: null };
    }
    if (path === '/api/ai/workspace-tools') return { ok: true, operation: 'snapshot', projects: [], activeProject: null, files: [], items: [] };
    if (path === '/api/ai/ovyx') return { ok: true, text: 'This local browser fixture has no live AI credentials.', message: 'This local browser fixture has no live AI credentials.', actions: [] };
    if (path === '/api/ai/feedback') return { ok: true, saved: true };
    if (path === '/api/generate') return { ok: true, generated: false, text: 'No local generator fixture was requested.' };
    if (path === '/api/deploy') return { ok: true, deployed: false, status: 'fixture' };

    // Local E2E startup touches unrelated feature endpoints. Make their lack of
    // production secrets explicit in a successful fixture envelope, not as fake
    // network-level 401/503 failures. Feature-specific tests own those contracts.
    return {
      ok: true, status: 'READY', fixture: true, items: [], results: [], data: [],
      projects: [], files: [], connections: [], providers: [], additionalProviders: [],
      notifications: [], unreadCount: 0, repositories: [], repos: [], templates: [],
      broadcasts: [], users: [], tickets: [], routes: [], actions: [], capabilities: {}
    };
  };

  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const body = responseFor(url.pathname, request.method().toUpperCase(), request);
    if (body === null) return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      headers: { 'Cache-Control': 'no-store', 'X-OVYX-Browser-Fixture': 'true' },
      body: JSON.stringify(body)
    });
  });
}
