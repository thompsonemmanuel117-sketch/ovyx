(function () {
  'use strict';
  if (window.__OVYX_MASTER_NAVIGATION_V1__) return;
  window.__OVYX_MASTER_NAVIGATION_V1__ = true;

  var ROUTES = Object.freeze({
    home: { group: 'Workspace', title: 'Overview' },
    projects: { group: 'Workspace', title: 'Projects' },
    templates: { group: 'Workspace', title: 'Templates' },
    inbox: { group: 'Workspace', title: 'Inbox' },
    webstudio: { group: 'Build', title: 'Web Studio' },
    appstudio: { group: 'Build', title: 'App Studio' },
    'kernel-bot': { group: 'Operate', title: 'Workspace Repair' },
    pricing: { group: 'Account', title: 'Plans & Billing' },
    settings: { group: 'Account', title: 'Settings' },
    faq: { group: 'Account', title: 'Help & Support' },
    'admin-overview': { group: 'Administration', title: 'Admin Overview' },
    'admin-template-hub': { group: 'Administration', title: 'Template Hub' },
    'admin-pricing': { group: 'Administration', title: 'Pricing & Entitlements' },
    'admin-users': { group: 'Administration', title: 'Users' },
    'admin-brain': { group: 'Administration', title: 'AI Brain' },
    'admin-identity': { group: 'Administration', title: 'Identity' },
    'admin-backend': { group: 'Administration', title: 'Backend & Environment' },
    'admin-telemetry': { group: 'Administration', title: 'Telemetry' },
    'admin-broadcasts': { group: 'Administration', title: 'Broadcasts' }
  });

  var $ = function (selector, root) { return (root || document).querySelector(selector); };
  var $$ = function (selector, root) { return Array.from((root || document).querySelectorAll(selector)); };

  function byClick(root, fragment) {
    return $$('.ovyx-nav-item, .ovyx-account-link, .ovyx-mobile-nav-item', root)
      .find(function (node) { return String(node.getAttribute('onclick') || '').indexOf(fragment) >= 0; }) || null;
  }

  function group(label, mobile) {
    var section = document.createElement('section');
    section.className = mobile ? 'ovyx-master-nav-group ovyx-ds' : 'ovyx-master-nav-group ovyx-ds';
    var heading = document.createElement('div');
    heading.className = mobile ? 'ovyx-nav-label px-2' : 'ovyx-nav-label';
    heading.textContent = label;
    var items = document.createElement('div');
    items.className = mobile ? 'space-y-1' : 'space-y-0.5';
    section.appendChild(heading);
    section.appendChild(items);
    return { section: section, items: items };
  }

  function desktopItem(label, detail, icon, key, action, ownerOnly) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'ovyx-nav-item spring-btn ovyx-master-nav-added';
    button.setAttribute('data-nav', key);
    button.innerHTML = '<span class="ovyx-nav-icon"><i class="' + icon + '" aria-hidden="true"></i></span>' +
      '<span class="ovyx-nav-copy"><b></b><small></small></span>';
    button.querySelector('b').textContent = label;
    button.querySelector('small').textContent = detail;
    if (ownerOnly) button.hidden = true;
    button.addEventListener('click', action);
    return button;
  }

  function mobileItem(label, detail, icon, key, action, ownerOnly) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'ovyx-mobile-nav-item spring-btn ovyx-master-nav-added';
    button.setAttribute('data-mobile-nav', key);
    button.innerHTML = '<i class="' + icon + '" aria-hidden="true"></i><span><b></b><small></small></span>';
    button.querySelector('b').textContent = label;
    button.querySelector('small').textContent = detail;
    if (ownerOnly) button.hidden = true;
    button.addEventListener('click', action);
    return button;
  }

  function closeMobile() {
    try { window.MobileDrawer && window.MobileDrawer.close && window.MobileDrawer.close(); } catch (_) {}
  }

  function openRoute(route) {
    closeMobile();
    if (window.Router && typeof window.Router.go === 'function') window.Router.go(route);
    else if (typeof window.switchView === 'function') window.switchView(route);
  }

  function openSettingsSection(section) {
    closeMobile();
    var attempts = 0;
    function reveal() {
      var settings = window.OVYXSettings;
      if (settings && typeof settings.show === 'function') {
        try {
          settings.show(section);
          syncRoute();
          return;
        } catch (_) {}
      }
      attempts += 1;
      if (attempts < 24) window.setTimeout(reveal, 50);
    }
    if (String(window.KernelState && window.KernelState.activeView || '') !== 'settings') {
      openRoute('settings');
      window.setTimeout(reveal, 0);
    } else {
      reveal();
    }
  }

  function openAssistant() {
    closeMobile();
    var trigger = document.getElementById('header-ai-project-bot');
    if (trigger) trigger.click();
  }

  function openSites() {
    closeMobile();
    var manager = window.OVYXWebsiteManagement;
    if (manager && typeof manager.openWorkspace === 'function') manager.openWorkspace();
    else openRoute('webstudio');
  }

  function openAdmin() {
    closeMobile();
    if (window.OvyxOwnerConsole && typeof window.OvyxOwnerConsole.open === 'function') {
      window.OvyxOwnerConsole.open();
    } else {
      openRoute('admin-overview');
    }
  }

  function installDesktopNavigation() {
    var sidebar = document.getElementById('app-sidebar');
    var nav = $('.ovyx-primary-nav', sidebar);
    var bottom = $('.ovyx-sidebar-bottom', sidebar);
    if (!sidebar || !nav || !bottom || nav.dataset.ovyxMasterNav === '1') return;

    var home = $('[data-nav="home"]', nav);
    var continueProject = $('[data-nav="continue-project"]', nav);
    var recentProjects = $('[data-nav="recent-projects"]', nav);
    var web = $('[data-nav="webstudio"]', nav);
    var app = $('[data-nav="appstudio"]', nav);
    var manage = $('[data-nav="workspace"]', nav);
    var templates = $('[data-nav="templates"]', nav);
    var projects = $('[data-nav="projects"]', bottom);
    var inbox = byClick(bottom, "Router.go('inbox')");
    var plans = byClick(bottom, "Router.go('pricing')");
    var settings = byClick(bottom, "Router.go('settings')");
    var help = byClick(bottom, "Router.go('faq')");
    var assistant = document.getElementById('desktop-ai-assistant');
    var admin = document.getElementById('desktop-owner-command');
    var usage = $('.ovyx-usage-mini', bottom);

    if (!home || !web || !app || !manage || !templates) return;

    if (inbox) inbox.setAttribute('data-nav', 'inbox');
    if (plans) plans.setAttribute('data-nav', 'pricing');
    if (settings) settings.setAttribute('data-nav', 'settings');
    if (help) help.setAttribute('data-nav', 'faq');
    if (assistant) assistant.setAttribute('data-nav', 'assistant');
    if (admin) admin.setAttribute('data-nav', 'admin-overview');

    var workspace = group('Workspace', false);
    var build = group('Build', false);
    var connect = group('Connect', false);
    var operate = group('Operate', false);
    var account = group('Account', false);
    var administration = group('Administration', false);

    [home, projects, templates, inbox, continueProject, recentProjects].forEach(function (node) {
      if (node) workspace.items.appendChild(node);
    });
    [web, app, assistant].forEach(function (node) { if (node) build.items.appendChild(node); });
    connect.items.appendChild(desktopItem('Personal Connections', 'Apps, APIs and account connections', 'fa-solid fa-plug', 'connections', function () { openSettingsSection('connections'); }));
    [manage, desktopItem('Workspace Repair', 'Inspect and repair supported issues', 'fa-solid fa-screwdriver-wrench', 'kernel-bot', function () { openRoute('kernel-bot'); })]
      .forEach(function (node) { if (node) operate.items.appendChild(node); });
    [plans, settings, help].forEach(function (node) { if (node) account.items.appendChild(node); });
    if (admin) administration.items.appendChild(admin);

    nav.replaceChildren(workspace.section, build.section, connect.section, operate.section, account.section, administration.section);
    bottom.replaceChildren();
    if (usage) bottom.appendChild(usage);
    nav.dataset.ovyxMasterNav = '1';
    sidebar.classList.add('ovyx-master-navigation-ready');
  }

  function installMobileNavigation() {
    var drawer = document.getElementById('mobile-drawer');
    var nav = $('nav', drawer);
    if (!drawer || !nav || nav.dataset.ovyxMasterNav === '1') return;

    var home = $('[data-mobile-nav="home"]', nav);
    var newProject = byClick(nav, 'ProjectStore.createPromptModal()');
    var continueProject = byClick(nav, 'continueOvyxProject()');
    var recentProjects = byClick(nav, 'home-recent-anchor');
    var web = $('[data-mobile-nav="webstudio"]', nav);
    var app = $('[data-mobile-nav="appstudio"]', nav);
    var manage = $('[data-mobile-nav="workspace"]', nav);
    var templates = $('[data-mobile-nav="templates"]', nav);
    var projects = $('[data-mobile-nav="projects"]', nav);

    if (!home || !web || !app || !manage || !templates) return;

    var workspace = group('Workspace', true);
    var build = group('Build', true);
    var connect = group('Connect', true);
    var operate = group('Operate', true);
    var account = group('Account', true);
    var administration = group('Administration', true);

    [home, newProject, projects, templates, continueProject, recentProjects].forEach(function (node) {
      if (node) workspace.items.appendChild(node);
    });
    [web, app, mobileItem('AI Assistant', 'Open your OVYX assistant', 'fa-solid fa-wand-magic-sparkles', 'assistant', openAssistant)]
      .forEach(function (node) { if (node) build.items.appendChild(node); });
    connect.items.appendChild(mobileItem('Personal Connections', 'Apps, APIs and account connections', 'fa-solid fa-plug', 'connections', function () { openSettingsSection('connections'); }));
    [manage, mobileItem('Workspace Repair', 'Inspect and repair supported issues', 'fa-solid fa-screwdriver-wrench', 'kernel-bot', function () { openRoute('kernel-bot'); })]
      .forEach(function (node) { if (node) operate.items.appendChild(node); });
    account.items.appendChild(mobileItem('Inbox', 'Account and workspace notifications', 'fa-regular fa-bell', 'inbox', function () { openRoute('inbox'); }));
    account.items.appendChild(mobileItem('Plans & Billing', 'Plans and usage options', 'fa-regular fa-credit-card', 'pricing', function () { openRoute('pricing'); }));
    account.items.appendChild(mobileItem('Settings', 'Profile and preferences', 'fa-solid fa-gear', 'settings', function () { openRoute('settings'); }));
    account.items.appendChild(mobileItem('Help & Support', 'Guides and support', 'fa-regular fa-circle-question', 'faq', function () { openRoute('faq'); }));

    var mobileAdmin = mobileItem('Admin Center', 'Owner-only platform controls', 'fa-solid fa-gauge-high', 'admin-overview', openAdmin, true);
    administration.items.appendChild(mobileAdmin);
    nav.replaceChildren(workspace.section, build.section, connect.section, operate.section, account.section, administration.section);
    nav.dataset.ovyxMasterNav = '1';
    nav.classList.add('ovyx-master-mobile-navigation-ready');

    function syncAdminVisibility() {
      var authorized = !!(window.OVYXAdminWorkspace && typeof window.OVYXAdminWorkspace.isAuthorized === 'function' && window.OVYXAdminWorkspace.isAuthorized());
      mobileAdmin.hidden = !authorized;
      administration.section.hidden = !authorized;
    }
    syncAdminVisibility();
    window.addEventListener('ovyx-owner-state', syncAdminVisibility);
    window.addEventListener('firebase-auth-state-ready', syncAdminVisibility);
    window.addEventListener('ovyx:view-changed', syncAdminVisibility);
  }

  function installBreadcrumb() {
    var header = document.getElementById('ovyx-topbar');
    if (!header || $('#ovyx-master-breadcrumb', header)) return;
    var right = header.children[1];
    if (!right) return;
    var breadcrumb = document.createElement('nav');
    breadcrumb.id = 'ovyx-master-breadcrumb';
    breadcrumb.className = 'ovyx-master-breadcrumb ovyx-ds';
    breadcrumb.setAttribute('aria-label', 'Breadcrumb');
    breadcrumb.innerHTML = '<span class="ovyx-master-breadcrumb-root">OVYX</span><span aria-hidden="true">/</span><span id="ovyx-master-breadcrumb-group">Workspace</span><span aria-hidden="true">/</span><span id="ovyx-master-breadcrumb-current" aria-current="page">Overview</span>';
    header.insertBefore(breadcrumb, right);
  }

  function syncRoute(event) {
    var route = String(event && event.detail && event.detail.view || window.KernelState && window.KernelState.activeView || 'home')
      .replace(/^view-/, '').toLowerCase();
    var settings = window.OVYXSettings;
    var detail = route === 'settings' && settings && settings.current === 'connections'
      ? { group: 'Connect', title: 'Personal Connections' }
      : ROUTES[route] || { group: 'Workspace', title: 'Overview' };

    var groupNode = document.getElementById('ovyx-master-breadcrumb-group');
    var currentNode = document.getElementById('ovyx-master-breadcrumb-current');
    if (groupNode) groupNode.textContent = detail.group;
    if (currentNode) currentNode.textContent = detail.title;

    var mobileTitle = document.getElementById('mobile-current-view');
    if (mobileTitle) mobileTitle.textContent = detail.title;

    $$('#app-sidebar nav button[data-nav]').forEach(function (button) {
      var key = button.getAttribute('data-nav');
      var active = key === route || (key === 'connections' && route === 'settings' && settings && settings.current === 'connections');
      button.classList.toggle('text-white', active);
      button.classList.toggle('bg-white/[0.08]', active);
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    $$('#mobile-drawer nav button[data-mobile-nav]').forEach(function (button) {
      var key = button.getAttribute('data-mobile-nav');
      var active = key === route || (key === 'connections' && route === 'settings' && settings && settings.current === 'connections');
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
  }

  function boot() {
    installDesktopNavigation();
    installMobileNavigation();
    installBreadcrumb();
    syncRoute();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
  window.addEventListener('ovyx:view-changed', function (event) { window.requestAnimationFrame(function () { syncRoute(event); }); });
  window.addEventListener('ovyx-settings-rendered', function () { window.requestAnimationFrame(syncRoute); });
  window.addEventListener('ovyx-owner-state', function () {
    var button = document.querySelector('#app-sidebar #desktop-owner-command');
    if (button && button.style.display !== 'none') button.hidden = false;
  });
  window.addEventListener('pageshow', boot);
  window.OVYXMasterNavigation = Object.freeze({ version: 1, refresh: boot, sync: syncRoute });
})();