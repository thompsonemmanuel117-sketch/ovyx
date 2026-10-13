(() => {
  'use strict';

  // The server entitlement endpoint is the authority. This runtime never
  // unlocks Admin from local storage, email text alone, or a preview flag.
  const ROOT_ROLE = 'ROOT_SUPERUSER';
  const MODULES = Object.freeze([
    { route: 'admin-overview', label: 'System Overview', detail: 'Platform health and runtime metrics', icon: 'fa-gauge-high' },
    { route: 'admin-pricing', label: 'Pricing & Plans', detail: 'Plans, quotas, and feature gates', icon: 'fa-tags' },
    { route: 'admin-users', label: 'Users & Roles', detail: 'Accounts and entitlements', icon: 'fa-users' },
    { route: 'admin-brain', label: 'AI Brain', detail: 'Provider and runtime diagnostics', icon: 'fa-brain' },
    { route: 'admin-identity', label: 'AI Identity', detail: 'OVYX identity and generation policy', icon: 'fa-fingerprint' },
    { route: 'admin-backend', label: 'Backend', detail: 'Endpoint and security diagnostics', icon: 'fa-server' },
    { route: 'admin-telemetry', label: 'Telemetry', detail: 'Edge checks and operational health', icon: 'fa-chart-line' },
    { route: 'admin-broadcasts', label: 'Broadcasts', detail: 'Announcements and push messaging', icon: 'fa-bullhorn' },
    { route: 'admin-template-hub', label: 'Template Matrix', detail: 'Template catalogue and publishing', icon: 'fa-layer-group' },
  ]);
  const ENTRY_DESKTOP = 'ovyx-admin-workspace-entry-desktop';
  const ENTRY_MOBILE = 'ovyx-admin-workspace-entry-mobile';
  const HUB_ID = 'ovyx-admin-workspace-hub';
  const BACK_LINK = 'ovyx-admin-workspace-back';
  let activeUid = '';
  let authRevision = 0;
  let inFlight = null;
  let registeredAuth = null;
  let authorized = false;

  const byId = id => document.getElementById(id);
  const safeRole = value => String(value || '').trim().toUpperCase();
  const currentAuth = () => {
    try { return window.firebase?.auth?.() || null; } catch { return null; }
  };
  const currentUser = () => {
    try { return currentAuth()?.currentUser || null; } catch { return null; }
  };
  const userKey = user => String(user?.uid || user?.email || (user ? 'signed-in' : ''));

  function hideOwnedUI() {
    byId(ENTRY_DESKTOP)?.remove();
    byId(ENTRY_MOBILE)?.remove();
    byId(HUB_ID)?.remove();
    document.querySelectorAll('[data-ovyx-admin-workspace-back]').forEach(node => node.remove());
    document.documentElement.classList.remove('ovyx-admin-workspace-authorized');
  }

  function downgradeCachedOwnerState(data) {
    if (data && typeof data === 'object') {
      window.__OVYX_SERVER_ENTITLEMENTS = data;
    } else if (safeRole(window.__OVYX_SERVER_ENTITLEMENTS?.role) === ROOT_ROLE) {
      window.__OVYX_SERVER_ENTITLEMENTS = {
        ...window.__OVYX_SERVER_ENTITLEMENTS,
        role: 'FREE_USER',
        owner: false,
        admin: false,
        bypass: false,
        entitlements: {
          ...(window.__OVYX_SERVER_ENTITLEMENTS.entitlements || {}),
          role: 'FREE_USER',
          owner: false,
          admin: false,
          bypass: false,
        },
      };
    }
    if (window.OVYXServerOwner) window.OVYXServerOwner.active = false;
    if (window.OVYXOwner) window.OVYXOwner.active = false;
    window.__OVYX_ROOT_AUTH_VERIFIED = false;
  }

  function clearAuthorization(data) {
    const wasAuthorized = authorized;
    authorized = false;
    hideOwnedUI();
    downgradeCachedOwnerState(data);
    if (wasAuthorized && /^admin-/.test(String(window.KernelState?.activeView || '').replace(/^view-/, ''))) {
      try { window.Router?.go?.('home'); } catch { /* The router may still be booting. */ }
    }
  }

  async function getToken(user, forceRefresh) {
    let timer;
    try {
      return await Promise.race([
        Promise.resolve().then(() => user.getIdToken(!!forceRefresh)),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('ADMIN_AUTH_TIMEOUT')), 6500);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  async function readServerEntitlements(user, forceRefresh = false) {
    const token = await getToken(user, forceRefresh);
    const response = await fetch('/api/entitlements', {
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
      credentials: 'same-origin',
      cache: 'no-store',
      signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(7000) : undefined,
    });
    if (response.status === 401 && !forceRefresh) return readServerEntitlements(user, true);
    if (!response.ok) throw new Error('ADMIN_ENTITLEMENTS_HTTP_' + response.status);
    const data = await response.json();
    const role = safeRole(data?.role || data?.entitlements?.role);
    const sameIdentity = !data?.uid || !user?.uid || String(data.uid) === String(user.uid);
    const isRoot = role === ROOT_ROLE &&
      (data?.owner === true || data?.isRoot === true || data?.admin === true) &&
      sameIdentity;
    return { data, isRoot };
  }

  function createEntry(id, mobile) {
    const button = document.createElement('button');
    button.id = id;
    button.type = 'button';
    button.className = mobile ? 'ovyx-admin-workspace-entry ovyx-admin-workspace-entry-mobile' : 'ovyx-account-link sidebar-action-card spring-btn ovyx-admin-workspace-entry';
    button.setAttribute('aria-label', 'Open Admin Workspace');
    const icon = document.createElement('i');
    icon.className = 'fa-solid fa-shield-halved';
    icon.setAttribute('aria-hidden', 'true');
    const title = document.createElement('span');
    title.className = 'ovyx-admin-workspace-entry-title';
    title.textContent = 'Admin Workspace';
    const badge = document.createElement('span');
    badge.className = 'ovyx-admin-workspace-entry-badge';
    badge.textContent = 'OWNER';
    button.append(icon, title, badge);
    button.addEventListener('click', () => { void openWorkspace(); });
    return button;
  }

  function ensureEntries() {
    if (!authorized) return;
    const sidebar = byId('app-sidebar');
    if (sidebar && !byId(ENTRY_DESKTOP)) {
      const button = createEntry(ENTRY_DESKTOP, false);
      const profile = sidebar.querySelector('.ovyx-sidebar-profile');
      if (profile?.parentNode) profile.parentNode.insertBefore(button, profile);
      else sidebar.appendChild(button);
    }

    const nav = byId('mobile-drawer')?.querySelector('nav');
    if (nav && !byId(ENTRY_MOBILE)) {
      const section = document.createElement('section');
      section.id = ENTRY_MOBILE;
      section.className = 'ovyx-admin-workspace-mobile-group';
      const label = document.createElement('div');
      label.className = 'ovyx-admin-workspace-mobile-label';
      label.textContent = 'OWNER TOOLS';
      section.append(label, createEntry(ENTRY_MOBILE + '-button', true));
      // Keep a stable owner-only group at the end of the mobile drawer.
      nav.appendChild(section);
    }
  }

  function moduleButton(module) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ovyx-admin-workspace-module';
    button.dataset.ovyxAdminWorkspaceRoute = module.route;
    button.setAttribute('aria-label', module.label + ': ' + module.detail);
    const icon = document.createElement('span');
    icon.className = 'ovyx-admin-workspace-module-icon';
    const glyph = document.createElement('i');
    glyph.className = 'fa-solid ' + module.icon;
    glyph.setAttribute('aria-hidden', 'true');
    icon.appendChild(glyph);
    const textWrap = document.createElement('span');
    textWrap.className = 'ovyx-admin-workspace-module-copy';
    const title = document.createElement('strong');
    title.textContent = module.label;
    const detail = document.createElement('small');
    detail.textContent = module.detail;
    textWrap.append(title, detail);
    const arrow = document.createElement('i');
    arrow.className = 'fa-solid fa-arrow-up-right-from-square ovyx-admin-workspace-module-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    button.append(icon, textWrap, arrow);
    button.addEventListener('click', () => { void navigate(module.route); });
    return button;
  }

  function ensureHub() {
    const overview = byId('view-admin-overview');
    if (!authorized || !overview) return;
    let hub = byId(HUB_ID);
    if (!hub) {
      hub = document.createElement('section');
      hub.id = HUB_ID;
      hub.className = 'ovyx-admin-workspace-hub';
      hub.setAttribute('aria-labelledby', 'ovyx-admin-workspace-title');

      const header = document.createElement('div');
      header.className = 'ovyx-admin-workspace-header';
      const copy = document.createElement('div');
      const eyebrow = document.createElement('div');
      eyebrow.className = 'ovyx-admin-workspace-eyebrow';
      eyebrow.textContent = 'OVYX / OWNER CONSOLE';
      const heading = document.createElement('h2');
      heading.id = 'ovyx-admin-workspace-title';
      heading.textContent = 'Admin Workspace';
      const description = document.createElement('p');
      description.textContent = 'One place for platform pricing, user access, AI settings, diagnostics, announcements and templates.';
      copy.append(eyebrow, heading, description);
      const access = document.createElement('span');
      access.className = 'ovyx-admin-workspace-access';
      access.innerHTML = '<i class="fa-solid fa-shield-check" aria-hidden="true"></i><span>SERVER VERIFIED</span>';
      header.append(copy, access);

      const search = document.createElement('label');
      search.className = 'ovyx-admin-workspace-search';
      const searchIcon = document.createElement('i');
      searchIcon.className = 'fa-solid fa-magnifying-glass';
      searchIcon.setAttribute('aria-hidden', 'true');
      const input = document.createElement('input');
      input.type = 'search';
      input.id = 'ovyx-admin-workspace-search-input';
      input.placeholder = 'Find an admin module…';
      input.setAttribute('aria-label', 'Find an admin module');
      input.autocomplete = 'off';
      search.append(searchIcon, input);

      const grid = document.createElement('div');
      grid.className = 'ovyx-admin-workspace-grid';
      MODULES.forEach(module => grid.appendChild(moduleButton(module)));
      const footer = document.createElement('p');
      footer.className = 'ovyx-admin-workspace-footer';
      footer.textContent = 'Opening a module does not bypass its normal server-side permission checks.';
      input.addEventListener('input', () => {
        const query = String(input.value || '').trim().toLowerCase();
        grid.querySelectorAll('.ovyx-admin-workspace-module').forEach(button => {
          button.hidden = !!query && !String(button.textContent || '').toLowerCase().includes(query);
        });
      });
      hub.append(header, search, grid, footer);
      overview.insertBefore(hub, overview.firstChild);
    }
    hub.hidden = false;
    ensureAdminBackLinks();
  }

  function ensureAdminBackLinks() {
    if (!authorized) return;
    document.querySelectorAll('#view-router-viewport > section[id^="view-admin-"]').forEach(section => {
      if (section.id === 'view-admin-overview' || section.querySelector('[data-ovyx-admin-workspace-back]')) return;
      const link = document.createElement('button');
      link.type = 'button';
      link.className = 'ovyx-admin-workspace-back';
      link.setAttribute('data-ovyx-admin-workspace-back', '1');
      link.innerHTML = '<i class="fa-solid fa-grid-2" aria-hidden="true"></i><span>All Admin Modules</span>';
      link.addEventListener('click', () => { void navigate('admin-overview'); });
      section.insertBefore(link, section.firstChild);
    });
  }

  async function navigate(route) {
    const target = MODULES.find(item => item.route === route);
    if (!target) return false;
    if (!(await refreshOwner())) return false;
    const router = window.Router;
    if (typeof router?.go !== 'function') {
      window.showToast?.('OVYX navigation is still starting. Please try again in a moment.', 'info');
      return false;
    }
    try {
      router.go(target.route);
      if (target.route === 'admin-overview') {
        setTimeout(() => byId('adm-stat-projects')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }), 60);
      } else {
        try { window.MobileDrawer?.close?.(); } catch { /* Optional on desktop. */ }
      }
      return true;
    } catch (error) {
      console.error('[OVYX Admin Workspace] Navigation failed:', String(error?.message || 'route unavailable').slice(0, 120));
      window.showToast?.('The admin module could not be opened. Please try again.', 'error');
      return false;
    }
  }

  function applyEntitlements(data, isRoot) {
    authorized = !!isRoot;
    if (isRoot) {
      window.__OVYX_SERVER_ENTITLEMENTS = data;
      window.__OVYX_ROOT_AUTH_VERIFIED = true;
      window.OVYXServerOwner = window.OVYXServerOwner || {};
      window.OVYXServerOwner.active = true;
      window.OVYXOwner = window.OVYXOwner || {};
      window.OVYXOwner.active = true;
      document.documentElement.classList.add('ovyx-admin-workspace-authorized', 'ovyx-owner-account');
      ensureEntries();
      ensureHub();
    } else {
      clearAuthorization(data);
    }
  }

  function refreshOwner() {
    const user = currentUser();
    const key = userKey(user);
    if (key !== activeUid) {
      activeUid = key;
      authRevision += 1;
      inFlight = null;
    }
    const revision = authRevision;
    if (!user) {
      clearAuthorization(null);
      return Promise.resolve(false);
    }
    if (inFlight?.key === key) return inFlight.promise;
    const promise = readServerEntitlements(user).then(({ data, isRoot }) => {
      if (revision !== authRevision || currentUser() !== user) return false;
      applyEntitlements(data, isRoot);
      return isRoot;
    }).catch(error => {
      if (revision === authRevision && currentUser() === user) {
        console.warn('[OVYX Admin Workspace] Server authorization check failed:', String(error?.message || 'unavailable').slice(0, 100));
        clearAuthorization(null);
      }
      return false;
    }).finally(() => {
      if (inFlight?.revision === revision) inFlight = null;
    });
    inFlight = { key, revision, promise };
    return promise;
  }

  function bindAuth() {
    const auth = currentAuth();
    if (auth && auth !== registeredAuth && typeof auth.onAuthStateChanged === 'function') {
      registeredAuth = auth;
      auth.onAuthStateChanged(() => { void refreshOwner(); });
    }
    void refreshOwner();
  }

  function boot() {
    bindAuth();
    window.addEventListener('firebase-auth-state-ready', bindAuth, { passive: true });
    window.addEventListener('ovyx:view-changed', () => {
      if (authorized) { ensureEntries(); ensureHub(); }
    }, { passive: true });
    window.addEventListener('pageshow', bindAuth, { passive: true });
  }

  window.OVYXAdminWorkspace = Object.freeze({
    open: () => navigate('admin-overview'),
    refresh: refreshOwner,
    routes: MODULES.map(item => item.route),
    isAuthorized: () => authorized,
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
