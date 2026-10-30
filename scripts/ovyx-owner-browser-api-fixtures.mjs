import assert from 'node:assert/strict';

/**
 * Browser-only network fixture for the local Pages shell. The real server
 * contract is covered by the owner-control/static/integration suites. These
 * responses keep a no-secret local E2E runtime from turning expected auth and
 * missing-environment responses into misleading browser-console failures.
 * Keep the response bodies shaped like the corresponding public/admin APIs.
 */
export async function installOwnerBrowserApiFixtures(page, options = {}) {
  // Avoid depending on outbound Firebase CDN availability in a local browser
  // test. This facade only exists inside the Playwright page; API authority is
  // represented by route fixtures and is independently verified server-side.
  await page.addInitScript((options) => {
    if (window.__OVYX_TEST_FIREBASE__) return;
    window.__OVYX_TEST_FIREBASE__ = true;
    window.__OVYX_FIREBASE_LOADER_INSTALLED__ = true;
    window.__OVYX_FIREBASE_READY__ = true;
    window.__OVYX_FIREBASE_READY_ERROR__ = null;
    window.__OVYX_FIREBASE_READY_PROMISE__ = Promise.resolve(true);
    window.OVYXFirebaseConfig = window.OVYXFirebaseConfig || {
      apiKey: 'test-browser-only', projectId: 'ovyx-browser-test',
      authDomain: 'ovyx-browser-test.invalid'
    };
    const initialUser = options && options.initialUser && typeof options.initialUser === 'object' ? options.initialUser : null;
    let currentUser = initialUser ? {
      uid: String(initialUser.uid || 'ovyx-browser-test-user'),
      email: String(initialUser.email || 'builder@example.test'),
      emailVerified: true,
      displayName: String(initialUser.displayName || 'OVYX Browser Test'),
      getIdToken: async () => String(initialUser.token || 'ovyx-browser-test-token')
    } : null;
    const authListeners = new Set();
    const emitAuth = () => authListeners.forEach(callback => {
      try { callback(currentUser); } catch (_) {}
    });
    const authInstance = {
      get currentUser() { return currentUser; },
      onAuthStateChanged(callback) { authListeners.add(callback); queueMicrotask(() => callback(currentUser)); return () => authListeners.delete(callback); },
      onIdTokenChanged(callback) { authListeners.add(callback); queueMicrotask(() => callback(currentUser)); return () => authListeners.delete(callback); },
      async signOut() { currentUser = null; emitAuth(); },
      async setPersistence() {},
      async getRedirectResult() { return { user: null }; },
      async signInWithEmailAndPassword() { throw Object.assign(new Error('Firebase Auth is intentionally mocked in this isolated browser test.'), { code: 'auth/operation-not-allowed' }); },
      async createUserWithEmailAndPassword() { throw Object.assign(new Error('Firebase Auth is intentionally mocked in this isolated browser test.'), { code: 'auth/operation-not-allowed' }); },
      async signInWithPopup() { throw Object.assign(new Error('Firebase Auth is intentionally mocked in this isolated browser test.'), { code: 'auth/operation-not-allowed' }); },
      async signInWithRedirect() { throw Object.assign(new Error('Firebase Auth is intentionally mocked in this isolated browser test.'), { code: 'auth/operation-not-allowed' }); },
    };
    // Keep a single Firebase Auth object for the full browser test. Replacing
    // window.firebase after application boot leaves old listeners attached to a
    // different auth instance and can make owner navigation nondeterministic.
    window.__setOVYXBrowserAuthUser = (user) => {
      const nextUser = user && typeof user === 'object' ? {
        uid: String(user.uid || 'ovyx-browser-test-user'),
        email: String(user.email || 'builder@example.test'),
        emailVerified: user.emailVerified !== false,
        displayName: String(user.displayName || 'OVYX Browser Test'),
        getIdToken: async () => String(user.token || 'ovyx-browser-test-token')
      } : null;
      // The app discards stale entitlement results when currentUser changes
      // during an in-flight request. Keep object identity stable when the UID
      // is unchanged, just as Firebase Auth does for the same signed-in user.
      if (currentUser && nextUser && String(currentUser.uid) === nextUser.uid) {
        Object.assign(currentUser, nextUser);
      } else {
        currentUser = nextUser;
      }
      emitAuth();
      return currentUser;
    };
    const snapshot = () => ({ empty: true, docs: [], forEach() {}, docChanges() { return []; } });
    function firestoreCollection() {
      const chain = {
        doc(id) {
          return {
            id: String(id || 'fixture-document'),
            async get() { return { id: String(id || 'fixture-document'), exists: false, data() { return {}; } }; },
            async set() {}, async update() {}, async delete() {},
            onSnapshot(callback) { callback({ id: String(id || 'fixture-document'), exists: false, data() { return {}; } }); return () => {}; },
            collection() { return firestoreCollection(); }
          };
        },
        where() { return this; }, orderBy() { return this; }, limit() { return this; }, startAfter() { return this; },
        async get() { return snapshot(); },
        onSnapshot(callback) { callback(snapshot()); return () => {}; },
        async add() { return { id: 'ovyx-browser-test-document' }; }
      };
      return chain;
    }
    const db = { collection: firestoreCollection, async runTransaction(callback) { return callback({ get: async () => ({ exists: false, data() { return {}; } }), set() {}, update() {}, delete() {} }); } };
    function authFactory() { return authInstance; }
    authFactory.GoogleAuthProvider = class { addScope() {} };
    authFactory.OAuthProvider = class { constructor(providerId) { this.providerId = providerId; } addScope() {} };
    authFactory.GithubAuthProvider = class { addScope() {} };
    authFactory.EmailAuthProvider = { credential(email, password) { return { providerId: 'password', email, password }; } };
    function storage() {
      const ref = { async getDownloadURL() { return ''; }, async put() { return { ref }; }, async delete() {} };
      ref.child = () => ref;
      return { ref: () => ref };
    }
    function firebaseStore() { return db; }
    firebaseStore.FieldValue = { serverTimestamp() { return { __fixtureServerTimestamp: true }; }, delete() { return { __fixtureDelete: true }; } };
    const firebase = {
      apps: [{ name: '[DEFAULT]', options: window.OVYXFirebaseConfig }],
      initializeApp(config) { this.apps = [{ name: '[DEFAULT]', options: config }]; return this.apps[0]; },
      auth: authFactory,
      firestore: firebaseStore,
      storage,
    };
    Object.defineProperty(window, 'firebase', { configurable: true, writable: true, value: firebase });
    window.__OVYX_RESOLVE_FIREBASE_READY__ = () => true;
  }, options || {});
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
  const aiConfig = { providerOrder: ['cloudflare-workers-ai'] };
  let fixtureUsers = [{ uid: 'fixture-user-123', email: 'builder@example.test', displayName: 'Fixture Builder', role: 'FREE_USER', plan: 'free', disabled: false, quota: { plan: 'free', monthlyLimit: 50000, monthlyRemaining: 50000, dailyPromptLimit: 4, dailyPromptsRemaining: 4, boosterTokens: 0 } }];
  let fixtureBroadcasts = [];
  let fixtureTemplates = [];
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
      planFeaturesManaged: true, accessRules: [], gating: gates, source: 'server-fixture'
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
        const target = fixtureUsers.find(user => user.uid === (payload.uid || payload.targetUid));
        if (target && payload.action === 'setPlan') {
          target.plan = payload.plan;
          target.quota = { plan: payload.plan, monthlyLimit: tokenQuotas[payload.plan] || tokenQuotas.free, monthlyRemaining: tokenQuotas[payload.plan] || tokenQuotas.free, dailyPromptLimit: dailyPromptQuotas[payload.plan] || dailyPromptQuotas.free, dailyPromptsRemaining: dailyPromptQuotas[payload.plan] || dailyPromptQuotas.free, boosterTokens: 0 };
        }
        if (target && payload.action === 'setAccountStatus') target.disabled = payload.disabled === true;
        return {
          ok: true, action: payload.action || 'fixture', uid: payload.uid || 'fixture-user',
          plan: payload.plan || 'free', disabled: payload.disabled === true,
          refreshTokensRevoked: true, quota: { monthly: tokenQuotas[payload.plan || 'free'] || tokenQuotas.free },
          updatedAt: 'fixture', authority: 'FIREBASE_AUTH_AND_SERVER'
        };
      }
      return { ok: true, authority: 'SERVER', users: fixtureUsers.map(user => ({ ...user, quota: { ...user.quota } })), nextPageToken: null, pageSize: 50 };
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
      ok: true,
      status: 'READY',
      routingPolicy: 'cloudflare-only',
      engineMode: 'cloudflare-free-only',
      providers: [{
        provider: 'cloudflare-workers-ai',
        label: 'Cloudflare Workers AI',
        status: 'READY',
        configured: true,
        connected: true
      }],
      additionalProviders: [],
      cloudflare: { workersAiBinding: true, edgeRuntime: 'BROWSER_FIXTURE' },
      checkedAt: 'fixture'
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
      if (method === 'POST' && payload.action === 'saveSettings' && payload.pricing) { Object.assign(pricing.pro, payload.pricing.pro || {}); Object.assign(pricing.max, payload.pricing.max || {}); }
      const config = {
        pricing, gating: gates, masterAdminOverride: false,
        liveDeploy: integrationLive, productionLive: integrationLive,
        environment: integrationLive ? 'live' : 'sandbox', updatedAt: 'fixture'
      };
      return { ok: true, config, authority: 'SERVER_ADMIN' };
    }
    if (path === '/api/admin/plans/update') {
      const payload = (() => { try { return request.postDataJSON() || {}; } catch { return {}; } })();
      if (method === 'POST') {
        if (payload.pricing?.pro) Object.assign(pricing.pro, payload.pricing.pro);
        if (payload.pricing?.max) Object.assign(pricing.max, payload.pricing.max);
        if (payload.tokenQuotas) Object.assign(tokenQuotas, payload.tokenQuotas);
        if (payload.dailyPromptQuotas) Object.assign(dailyPromptQuotas, payload.dailyPromptQuotas);
        if (payload.gating) Object.assign(gates, payload.gating);
        if (payload.features) Object.assign(planFeatures, payload.features);
      }
      const config = {
        pricing, tokenQuotas, dailyPromptQuotas, planFeatures,
        planFeaturesManaged: true,
        gating: gates,
        accessRules: []
      };
      return { ok: true, config, authority: 'SERVER_ADMIN' };
    }
    if (path === '/api/admin/broadcasts') {
      if (method === 'POST') {
        const payload = (() => { try { return request.postDataJSON() || {}; } catch { return {}; } })();
        if (payload.action === 'unpublish') {
          const target = fixtureBroadcasts.find(item => item.id === payload.id);
          if (target) target.published = false;
          fixtureBroadcasts = fixtureBroadcasts.filter(item => item.id !== payload.id);
          return { ok: true, action: 'unpublish', id: payload.id, published: false, scope: 'global-inbox' };
        }
        const item = { id: 'fixture-broadcast-' + (fixtureBroadcasts.length + 1), ...payload, body: payload.message || payload.body || '', published: true, createdAt: new Date().toISOString() };
        fixtureBroadcasts.unshift(item);
        return { ok: true, broadcast: item, delivery: 'global-inbox' };
      }
      return { ok: true, broadcasts: fixtureBroadcasts.filter(item => item.published !== false).slice(), nextPageToken: null };
    }
    if (path === '/api/admin/templates') {
      if (method === 'POST') {
        const payload = (() => { try { return request.postDataJSON() || {}; } catch { return {}; } })();
        if (payload.action === 'unpublish') { fixtureTemplates = fixtureTemplates.filter(item => item.id !== payload.id); return { ok: true, action: 'unpublish', id: payload.id, published: false }; }
        const item = { id: payload.id || 'fixture-template-' + (fixtureTemplates.length + 1), ...payload, published: true, updatedAt: new Date().toISOString() };
        fixtureTemplates = fixtureTemplates.filter(old => old.id !== item.id).concat([item]);
        return { ok: true, template: item, scope: 'global' };
      }
      return { ok: true, templates: fixtureTemplates.slice(), nextPageToken: null };
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
