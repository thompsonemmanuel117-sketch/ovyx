(() => {
  'use strict';

  // The server entitlement endpoint is the authority. This runtime never
  // unlocks Admin from local storage, email text alone, or a preview flag.
  const ROOT_ROLE = 'ROOT_SUPERUSER';
  const ROOT_EMAIL = 'ovyxsupportteam@gmail.com';
  const MODULES = Object.freeze([
    { route: 'admin-overview', label: 'System Overview', detail: 'Platform health and service status', icon: 'fa-gauge-high' },
    { route: 'admin-pricing', label: 'Pricing & Plans', detail: 'Plans, quotas, and feature gates', icon: 'fa-tags' },
    { route: 'admin-users', label: 'Users & Roles', detail: 'Accounts and entitlements', icon: 'fa-users' },
    { route: 'admin-brain', label: 'AI services', detail: 'AI availability and selection preferences', icon: 'fa-brain' },
    { route: 'admin-identity', label: 'AI Identity', detail: 'OVYX identity and generation policy', icon: 'fa-fingerprint' },
    { route: 'admin-backend', label: 'Service health', detail: 'Service availability and security', icon: 'fa-server' },
    { route: 'admin-telemetry', label: 'Telemetry', detail: 'Service checks and operational health', icon: 'fa-chart-line' },
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
    byId('ovyx-admin-module-directory')?.remove();
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

  function syncLegacyAdminGuard(isRoot, data = null) {
    const lockdown = window.FirebaseAuthLockdown;
    if (lockdown && typeof lockdown === 'object') {
      // Older Router guards consult this same flag. It is synchronized only
      // after /api/entitlements has verified the current Firebase identity.
      lockdown.isSuperuser = isRoot === true;
      if (isRoot === true) {
        lockdown.adminEmail = String(data?.email || currentUser()?.email || '').trim().toLowerCase();
      }
      try { lockdown.enforceAccess?.(); } catch (error) {
        console.warn('[OVYX Admin Workspace] Legacy admin visibility sync failed:', String(error?.message || 'unavailable').slice(0, 90));
      }
    }
    try {
      window.dispatchEvent(new CustomEvent('ovyx-owner-state', {
        detail: { root: isRoot === true, source: 'verified-server-entitlements' },
      }));
    } catch { /* Optional cross-runtime UI notification. */ }
  }

  function clearAuthorization(data) {
    const wasAuthorized = authorized;
    authorized = false;
    syncLegacyAdminGuard(false, data);
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
    const expectedEmail = String(user?.email || '').trim().toLowerCase();
    const actualEmail = String(data?.email || '').trim().toLowerCase();
    // Fail closed unless the server response matches this exact authenticated Firebase user.
    const sameIdentity = !!user?.uid && !!data?.uid &&
      String(data.uid) === String(user.uid) &&
      !!expectedEmail && actualEmail === expectedEmail;
    const isRoot = role === ROOT_ROLE && actualEmail === ROOT_EMAIL &&
      data?.owner === true && data?.isRoot === true &&
      data?.admin === true && data?.bypass === true &&
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
    button.addEventListener('click', () => { void navigate('admin-overview'); });
    return button;
  }

  function ensureStyles() {
    if (byId('ovyx-admin-workspace-styles')) return;
    const style = document.createElement('style');
    style.id = 'ovyx-admin-workspace-styles';
    style.textContent = `
      .ovyx-admin-workspace-entry{display:flex!important;align-items:center!important;gap:10px!important;min-height:42px!important;width:100%!important;box-sizing:border-box!important;border:1px solid rgba(232,182,79,.24)!important;border-radius:12px!important;background:linear-gradient(100deg,rgba(232,182,79,.09),rgba(255,255,255,.018))!important;color:var(--app-text,#f8fafc)!important;text-align:left!important;padding:10px 12px!important;cursor:pointer!important}
      .ovyx-admin-workspace-entry>i:first-child{color:#e8b64f!important;flex:0 0 auto!important}
      .ovyx-admin-workspace-entry-title{flex:1 1 auto!important;font:800 10px/1.25 Inter,system-ui,sans-serif!important}
      .ovyx-admin-workspace-entry-badge{flex:0 0 auto!important;border:1px solid rgba(232,182,79,.28)!important;border-radius:999px!important;padding:4px 6px!important;color:#e8b64f!important;font:800 7px/1 JetBrains Mono,monospace!important;letter-spacing:.08em!important}
      .ovyx-admin-workspace-entry:hover{border-color:rgba(232,182,79,.52)!important;background:rgba(232,182,79,.09)!important}
      .ovyx-admin-workspace-mobile-group{display:block!important;margin-top:14px!important;padding-top:12px!important;border-top:1px solid var(--app-border,rgba(255,255,255,.08))!important}
      .ovyx-admin-workspace-mobile-label{padding:0 8px 8px!important;color:var(--app-muted,#8a929c)!important;font:800 8px/1 JetBrains Mono,monospace!important;letter-spacing:.15em!important}
      .ovyx-admin-workspace-entry-mobile{display:flex!important;margin:0 0 4px!important}
      .ovyx-admin-workspace-hub{display:block!important;position:relative!important;width:100%!important;box-sizing:border-box!important;margin:0 0 20px!important;padding:17px!important;border:1px solid var(--app-border,rgba(255,255,255,.09))!important;border-radius:18px!important;background:linear-gradient(145deg,rgba(232,182,79,.055),rgba(255,255,255,.018) 48%,rgba(0,209,255,.025))!important;color:var(--app-text,#f8fafc)!important}
      .ovyx-admin-workspace-hub[hidden]{display:none!important}
      .ovyx-admin-workspace-header{display:flex!important;align-items:flex-start!important;justify-content:space-between!important;gap:14px!important}
      .ovyx-admin-workspace-eyebrow{color:#c9a24b!important;font:800 8px/1 JetBrains Mono,monospace!important;letter-spacing:.18em!important;text-transform:uppercase!important}
      .ovyx-admin-workspace-header h2{margin:6px 0 0!important;color:var(--app-text,#f8fafc)!important;font:850 clamp(18px,2.5vw,23px)/1.15 Inter,system-ui,sans-serif!important;letter-spacing:-.025em!important}
      .ovyx-admin-workspace-header p{max-width:680px!important;margin:7px 0 0!important;color:var(--app-muted,#929aa4)!important;font:500 10px/1.6 Inter,system-ui,sans-serif!important}
      .ovyx-admin-workspace-access{display:inline-flex!important;align-items:center!important;gap:6px!important;flex:0 0 auto!important;white-space:nowrap!important;border:1px solid rgba(52,211,153,.22)!important;border-radius:999px!important;padding:7px 9px!important;background:rgba(52,211,153,.045)!important;color:#6ee7b7!important;font:800 7px/1 JetBrains Mono,monospace!important}
      .ovyx-admin-workspace-search{display:flex!important;align-items:center!important;gap:9px!important;margin:16px 0 12px!important;padding:10px 12px!important;border:1px solid var(--app-border,rgba(255,255,255,.08))!important;border-radius:11px!important;background:rgba(0,0,0,.12)!important;color:var(--app-muted,#89939d)!important}
      .ovyx-admin-workspace-search input{width:100%!important;min-width:0!important;border:0!important;outline:0!important;background:transparent!important;color:var(--app-text,#f8fafc)!important;font:600 10px/1.5 Inter,system-ui,sans-serif!important}
      .ovyx-admin-workspace-search input::placeholder{color:var(--app-muted,#78818b)!important}
      .ovyx-admin-workspace-search:focus-within{border-color:rgba(232,182,79,.45)!important}
      .ovyx-admin-workspace-grid{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:9px!important}
      .ovyx-admin-workspace-module{display:flex!important;align-items:center!important;gap:10px!important;min-width:0!important;min-height:69px!important;padding:11px!important;border:1px solid var(--app-border,rgba(255,255,255,.075))!important;border-radius:12px!important;background:rgba(255,255,255,.018)!important;color:var(--app-text,#f8fafc)!important;text-align:left!important;cursor:pointer!important;transition:transform .15s ease,border-color .15s ease,background .15s ease!important}
      .ovyx-admin-workspace-module:hover{transform:translateY(-1px)!important;border-color:rgba(232,182,79,.33)!important;background:rgba(232,182,79,.045)!important}
      .ovyx-admin-workspace-module[hidden]{display:none!important}
      .ovyx-admin-workspace-module-icon{display:grid!important;place-items:center!important;flex:0 0 32px!important;width:32px!important;height:32px!important;border:1px solid rgba(232,182,79,.16)!important;border-radius:10px!important;background:rgba(232,182,79,.045)!important;color:#e8c16c!important}
      .ovyx-admin-workspace-module-copy{display:block!important;flex:1 1 auto!important;min-width:0!important}
      .ovyx-admin-workspace-module-copy strong{display:block!important;color:var(--app-text,#e9edf2)!important;font:800 10px/1.3 Inter,system-ui,sans-serif!important;overflow-wrap:anywhere!important}
      .ovyx-admin-workspace-module-copy small{display:block!important;margin-top:5px!important;color:var(--app-muted,#89929c)!important;font:500 8px/1.45 Inter,system-ui,sans-serif!important;overflow-wrap:anywhere!important}
      .ovyx-admin-workspace-module-arrow{flex:0 0 auto!important;color:var(--app-muted,#68717c)!important;font-size:10px!important}
      .ovyx-admin-workspace-footer{margin:13px 0 0!important;color:var(--app-muted,#747e88)!important;font:500 8px/1.5 JetBrains Mono,monospace!important}
      .ovyx-admin-workspace-back{display:inline-flex!important;align-items:center!important;gap:8px!important;margin:0 0 12px!important;padding:9px 12px!important;border:1px solid rgba(232,182,79,.2)!important;border-radius:10px!important;background:rgba(232,182,79,.035)!important;color:var(--app-text,#f5f5f5)!important;font:750 9px/1.3 Inter,system-ui,sans-serif!important;cursor:pointer!important}
      .ovyx-admin-workspace-back i{color:#e8b64f!important}
      @media(max-width:900px){.ovyx-admin-workspace-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
      @media(max-width:520px){.ovyx-admin-workspace-hub{padding:13px!important}.ovyx-admin-workspace-header{display:block!important}.ovyx-admin-workspace-access{margin-top:12px!important}.ovyx-admin-workspace-grid{grid-template-columns:minmax(0,1fr)!important}.ovyx-admin-workspace-module{min-height:62px!important}.ovyx-admin-workspace-module-copy strong{font-size:11px!important}.ovyx-admin-workspace-module-copy small{font-size:9px!important}}
      @media(prefers-reduced-motion:reduce){.ovyx-admin-workspace-module{transition:none!important}.ovyx-admin-workspace-module:hover{transform:none!important}}
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function ensureEntries() {
    if (!authorized) return;
    ensureStyles();
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
    if (authorized) ensureStyles();
    // The old inline directory duplicates this server-verified hub and can be
    // unlocked by stale preview state. Remove it in both authorized and locked states.
    byId('ovyx-admin-module-directory')?.remove();
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
      description.textContent = 'Manage pricing, account access, AI settings, announcements and templates in one place.';
      copy.append(eyebrow, heading, description);
      const access = document.createElement('span');
      access.className = 'ovyx-admin-workspace-access';
      access.innerHTML = '<i class="fa-solid fa-shield-check" aria-hidden="true"></i><span>OWNER ACCESS VERIFIED</span>';
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
      footer.textContent = 'Each module verifies your permissions before allowing changes.';
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
      syncLegacyAdminGuard(true, data);
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
