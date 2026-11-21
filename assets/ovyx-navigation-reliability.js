(function () {
  'use strict';
  if (window.__OVYX_NAVIGATION_RELIABILITY_V1__) return;
  window.__OVYX_NAVIGATION_RELIABILITY_V1__ = true;

  const ROUTES = Object.freeze({
    home: 'home', dashboard: 'home',
    webstudio: 'webstudio', 'web-studio': 'webstudio',
    appstudio: 'appstudio', 'app-studio': 'appstudio',
    workspace: 'workspace', 'manage-website': 'workspace',
    projects: 'projects', project: 'projects',
    templates: 'templates', template: 'templates',
    settings: 'settings', connections: 'settings',
    plans: 'pricing', plan: 'pricing', pricing: 'pricing', billing: 'pricing',
    help: 'support', faq: 'support', support: 'support',
    inbox: 'inbox', sharing: 'sharing'
  });

  function closeDrawer() {
    try { window.MobileDrawer?.close?.(); } catch (_) {}
  }

  function getRoute(item) {
    const keys = ['data-mobile-nav', 'data-nav', 'data-v52-account', 'data-sidebar-nav', 'data-route'];
    for (const key of keys) {
      const value = String(item.getAttribute(key) || '').trim().toLowerCase();
      if (value && ROUTES[value]) return ROUTES[value];
    }
    const inline = String(item.getAttribute('onclick') || '');
    const match = inline.match(/(?:Router\.go|switchView)\s*\(\s*['"]([a-z0-9_-]+)['"]/i);
    if (match) return ROUTES[String(match[1]).toLowerCase()] || null;
    return null;
  }

  function handleNavigation(event) {
    const target = event.target;
    if (!target?.closest) return;
    const item = target.closest(
      '#mobile-drawer [data-mobile-nav], #mobile-drawer [data-v52-account], ' +
      '#mobile-drawer [data-nav], #app-sidebar [data-nav], #app-sidebar [data-sidebar-nav], ' +
      '#app-sidebar [data-v52-account]'
    );
    if (!item || item.disabled || item.getAttribute('aria-disabled') === 'true') return;
    const route = getRoute(item);
    if (!route) return;
    if (route === 'sharing') {
      if (typeof window.OVYXProjectSharing?.open !== 'function') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      window.OVYXProjectSharing.open();
      closeDrawer();
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    if (typeof window.Router?.go === 'function') window.Router.go(route);
    else if (typeof window.switchView === 'function') window.switchView(route);
    if (item.closest('#mobile-drawer')) closeDrawer();
  }

  // Document-level delegation survives drawer replacement, route remounts and
  // late-created navigation entries. Capture phase wins over stale inline
  // handlers, without intercepting buttons that have no known route.
  document.addEventListener('click', handleNavigation, true);
  window.OVYXNavigationReliability = Object.freeze({ version: 1, refresh: function () {} });
})();