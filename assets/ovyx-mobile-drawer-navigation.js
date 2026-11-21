(function () {
  'use strict';
  if (window.__OVYX_MOBILE_DRAWER_NAVIGATION_V1__) return;
  window.__OVYX_MOBILE_DRAWER_NAVIGATION_V1__ = true;

  var ROUTES = Object.freeze({
    home: 'home',
    webstudio: 'webstudio',
    appstudio: 'appstudio',
    templates: 'templates',
    projects: 'projects'
  });

  function closeDrawer() {
    try { window.MobileDrawer && window.MobileDrawer.close && window.MobileDrawer.close(); } catch (_) {}
  }

  function handleMobileNavigation(event) {
    if (window.innerWidth >= 768 || !event || !event.target || !event.target.closest) return;
    var item = event.target.closest('#mobile-drawer [data-mobile-nav]');
    if (!item || item.disabled || item.getAttribute('aria-disabled') === 'true') return;

    var destination = String(item.getAttribute('data-mobile-nav') || '').trim().toLowerCase();
    var route = ROUTES[destination];
    if (route) {
      if (!window.Router || typeof window.Router.go !== 'function') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      window.Router.go(route);
      return;
    }

    if (destination === 'workspace') {
      var management = window.OVYXWebsiteManagement;
      if (!management || typeof management.openWorkspace !== 'function') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      management.openWorkspace();
      closeDrawer();
      return;
    }

    if (destination === 'sharing') {
      var sharing = window.OVYXProjectSharing;
      if (!sharing || typeof sharing.open !== 'function') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      sharing.open();
      closeDrawer();
    }
  }

  function bind() {
    var drawer = document.getElementById('mobile-drawer');
    if (!drawer || drawer.dataset.ovyxTapNavigationBound === '1') return;
    drawer.dataset.ovyxTapNavigationBound = '1';
    drawer.addEventListener('click', handleMobileNavigation, true);
    drawer.querySelectorAll('[data-mobile-nav]').forEach(function (item) {
      item.style.setProperty('pointer-events', 'auto', 'important');
      item.style.setProperty('touch-action', 'manipulation', 'important');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind, { once: true });
  } else {
    bind();
  }
  window.addEventListener('ovyx:mobile-drawer-opened', bind, { passive: true });
  window.addEventListener('resize', bind, { passive: true });
  window.OVYXMobileDrawerNavigation = Object.freeze({ refresh: bind, version: 1 });
})();