(function () {
  'use strict';
  if (window.__OVYX_NAVIGATION_RELIABILITY_V2__) return;
  window.__OVYX_NAVIGATION_RELIABILITY_V2__ = true;

  const ROUTES = Object.freeze({
    home: 'home', dashboard: 'home',
    webstudio: 'webstudio', 'web-studio': 'webstudio',
    appstudio: 'appstudio', 'app-studio': 'appstudio',
    workspace: 'workspace', 'manage-website': 'workspace',
    projects: 'projects', project: 'projects',
    templates: 'templates', template: 'templates',
    settings: 'settings', 'account-settings': 'settings', connections: 'settings',
    plans: 'pricing', plan: 'pricing', pricing: 'pricing', billing: 'pricing',
    help: 'support', faq: 'support', support: 'support',
    assistant: 'ai-assistant', ai: 'ai-assistant', 'ai-assistant': 'ai-assistant',
    inbox: 'inbox', sharing: 'sharing'
  });

  const NAV_ITEM_SELECTOR = [
    '[data-mobile-nav]', '[data-nav]', '[data-sidebar-nav]', '[data-v52-account]',
    '[data-v34-account]', '[data-v34-nav]', '[data-route]', '[data-ovyx-route]',
    '#desktop-ai-assistant'
  ].join(',');

  function closeDrawer() {
    try { window.MobileDrawer?.close?.(); } catch (_) {}
    try {
      document.body?.classList.remove('ovyx-drawer-open', 'ovyx-mobile-drawer-open');
    } catch (_) {}
  }

  function normalizeLabel(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase()
      .replace(/[·•]/g, ' ').replace(/\s+/g, ' ');
  }

  function routeForValue(value) {
    const key = String(value || '').trim().toLowerCase().replace(/^view-/, '');
    return ROUTES[key] || null;
  }

  function isNavigationContext(item) {
    if (!item) return false;
    if (item.id === 'desktop-ai-assistant') return true;
    if (item.closest && item.closest(
      '#mobile-drawer,#app-sidebar,#mobile-sidebar,#v52-account-menu,' +
      '[role="navigation"],nav,[role="menu"],[data-navigation],[data-sidebar],' +
      '.sidebar,.drawer,[class*="sidebar"],[class*="drawer"]'
    )) return true;
    return false;
  }

  function getRoute(item) {
    const keys = [
      'data-mobile-nav', 'data-nav', 'data-sidebar-nav', 'data-v52-account',
      'data-v34-account', 'data-v34-nav', 'data-route', 'data-ovyx-route'
    ];
    for (const key of keys) {
      const route = routeForValue(item.getAttribute?.(key));
      if (route) return route;
    }

    const inline = String(item.getAttribute?.('onclick') || '');
    const routeCall = inline.match(/(?:Router\.go|switchView)\s*\(\s*['"]([a-z0-9_-]+)['"]/i);
    if (routeCall) return routeForValue(routeCall[1]);
    if (/WorkspaceBrainBot\s*\.\s*open\s*\(/i.test(inline)) return 'ai-assistant';

    const label = normalizeLabel(item.getAttribute?.('aria-label') || item.title || item.textContent);
    if (/^(?:ovyx\s+)?(?:ai\s+)?assistant$/.test(label)) return 'ai-assistant';
    if (/^(?:plans?|pricing|billing)$/.test(label)) return 'pricing';
    if (/^(?:settings|account\s+settings)$/.test(label)) return 'settings';
    if (/^(?:help|help\s*\/\s*faq|faq|support)$/.test(label)) return 'support';
    return null;
  }

  function findNavigationItem(target) {
    if (!target?.closest) return null;
    const declared = target.closest(NAV_ITEM_SELECTOR);
    if (declared) return declared;
    const control = target.closest('button,a,[role="button"],[role="menuitem"]');
    return control && isNavigationContext(control) ? control : null;
  }

  function navigate(route, item) {
    if (route === 'sharing') {
      if (typeof window.OVYXProjectSharing?.open !== 'function') return false;
      window.OVYXProjectSharing.open();
      closeDrawer();
      return true;
    }
    if (route === 'workspace' && typeof window.OVYXWebsiteManagement?.openWorkspace === 'function') {
      window.OVYXWebsiteManagement.openWorkspace();
      closeDrawer();
      return true;
    }
    if (route === 'ai-assistant' && typeof window.Router?.go !== 'function') {
      if (typeof window.WorkspaceBrainBot?.open !== 'function') return false;
      window.WorkspaceBrainBot.open();
      closeDrawer();
      return true;
    }
    if (typeof window.Router?.go === 'function') {
      window.Router.go(route);
      if (item?.closest?.('#mobile-drawer,#mobile-sidebar,#v52-account-menu') ||
          (window.innerWidth < 768 && isNavigationContext(item))) closeDrawer();
      return true;
    }
    if (typeof window.switchView === 'function') {
      window.switchView(route);
      if (window.innerWidth < 768 && isNavigationContext(item)) closeDrawer();
      return true;
    }
    return false;
  }

  function handleNavigation(event) {
    const item = findNavigationItem(event.target);
    if (!item || item.disabled || item.getAttribute?.('aria-disabled') === 'true') return;
    const route = getRoute(item);
    if (!route) return;
    // Do not swallow a navigation entry until its destination is actually
    // available. This lets the existing native action remain a safe fallback.
    if (route === 'sharing' && typeof window.OVYXProjectSharing?.open !== 'function') return;
    if (route === 'workspace' && typeof window.OVYXWebsiteManagement?.openWorkspace !== 'function' &&
        typeof window.Router?.go !== 'function' && typeof window.switchView !== 'function') return;
    if (route === 'ai-assistant' && typeof window.Router?.go !== 'function' &&
        typeof window.WorkspaceBrainBot?.open !== 'function') return;
    if (!window.Router?.go && typeof window.switchView !== 'function' &&
        !(route === 'sharing' && window.OVYXProjectSharing?.open) &&
        !(route === 'workspace' && window.OVYXWebsiteManagement?.openWorkspace) &&
        !(route === 'ai-assistant' && window.WorkspaceBrainBot?.open)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    navigate(route, item);
  }

  function syncNavigationControls() {
    const roots = [
      document.getElementById?.('mobile-drawer'),
      document.getElementById?.('app-sidebar'),
      document.getElementById?.('mobile-sidebar'),
      document.getElementById?.('v52-account-menu')
    ].filter(Boolean);
    for (const root of roots) {
      if (root.matches?.(NAV_ITEM_SELECTOR)) {
        root.style?.setProperty?.('pointer-events', 'auto', 'important');
        root.style?.setProperty?.('touch-action', 'manipulation', 'important');
      }
      root.querySelectorAll?.(NAV_ITEM_SELECTOR + ',button,a,[role="button"],[role="menuitem"]').forEach(item => {
        if (item.disabled || item.getAttribute('aria-disabled') === 'true') return;
        item.style?.setProperty?.('pointer-events', 'auto', 'important');
        item.style?.setProperty?.('touch-action', 'manipulation', 'important');
      });
    }
  }

  let syncFrame = 0;
  function scheduleSync() {
    if (syncFrame) return;
    const run = () => { syncFrame = 0; syncNavigationControls(); };
    syncFrame = typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame(run) : window.setTimeout(run, 16);
  }

  // A single document capture listener survives replaced drawers and catches
  // clicks on nested icons/text inside the real navigation controls.
  document.addEventListener('click', handleNavigation, true);
  if (document.body && typeof MutationObserver === 'function') {
    const observer = new MutationObserver(records => {
      if (records.some(record => record.type === 'childList')) scheduleSync();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
  window.addEventListener('ovyx:mobile-drawer-opened', scheduleSync, { passive: true });
  window.addEventListener('ovyx:view-changed', scheduleSync, { passive: true });
  window.addEventListener('resize', scheduleSync, { passive: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleSync, { once: true });
  else scheduleSync();

  window.OVYXNavigationReliability = Object.freeze({ version: 2, refresh: scheduleSync });
})();