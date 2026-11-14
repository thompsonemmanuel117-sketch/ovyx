(function () {
  'use strict';

  if (window.__OVYX_WS_NAV_HEADER_POLISH_V4__) return;
  window.__OVYX_WS_NAV_HEADER_POLISH_V4__ = true;

  var STYLE_ID = 'ovyx-webstudio-navigation-header-polish-v4';
  var bodyObserver = null;
  var viewObserver = null;
  var mobileOverlayAdjusted = false;

  // The header remains part of the visible workspace. The navigation panel
  // already layers over the left side of the header on desktop, and the
  // full-screen drawer layers over it on mobile. Hiding the entire header
  // made both the arrow and Preview disappear and left them dependent on a
  // second state machine to become visible again. Only correct the drawer's
  // known 54px inline offset on mobile; never change header visibility,
  // display, inert, or aria-hidden state here.
  var CSS = [
    '@media(max-width:767px){body.ovyx-webstudio-active.ovyx-ws-mobile-nav-open #mobile-drawer{position:fixed!important;inset-block:0!important;top:0!important;bottom:0!important;height:100dvh!important;min-height:100vh!important;max-height:100dvh!important;z-index:2147483001!important}body.ovyx-webstudio-active.ovyx-ws-mobile-nav-open #mobile-drawer-backdrop{position:fixed!important;inset:0!important;top:0!important;bottom:0!important;height:100dvh!important;min-height:100vh!important;max-height:100dvh!important;z-index:2147483000!important}}'
  ].join('\n');

  function install() {
    var parent = document.head || document.documentElement;
    if (!parent) return false;
    var style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      parent.appendChild(style);
    }
    style.textContent = CSS;
    return true;
  }

  function removeMobileOverlayOverrides() {
    if (!mobileOverlayAdjusted) return;
    var drawer = document.getElementById('mobile-drawer');
    var backdrop = document.getElementById('mobile-drawer-backdrop');
    [drawer, backdrop].forEach(function (element) {
      if (!element) return;
      ['top', 'bottom', 'height', 'max-height'].forEach(function (property) {
        element.style.removeProperty(property);
      });
    });
    mobileOverlayAdjusted = false;
  }

  function syncHeader() {
    install();
    var body = document.body;
    var mobile = !!(window.matchMedia && window.matchMedia('(max-width: 767px)').matches);
    var open = !!(body && body.classList.contains('ovyx-ws-mobile-nav-open'));
    if (!mobile || !open) {
      removeMobileOverlayOverrides();
      return;
    }

    var drawer = document.getElementById('mobile-drawer');
    var backdrop = document.getElementById('mobile-drawer-backdrop');
    if (drawer) {
      drawer.style.setProperty('top', '0', 'important');
      drawer.style.setProperty('bottom', '0', 'important');
      drawer.style.setProperty('height', '100dvh', 'important');
      drawer.style.setProperty('max-height', '100dvh', 'important');
    }
    if (backdrop) {
      backdrop.style.setProperty('top', '0', 'important');
      backdrop.style.setProperty('bottom', '0', 'important');
      backdrop.style.setProperty('height', '100dvh', 'important');
      backdrop.style.setProperty('max-height', '100dvh', 'important');
    }
    mobileOverlayAdjusted = true;
  }

  function boot() {
    install();
    if (!document.body || typeof MutationObserver !== 'function') return false;
    if (!bodyObserver) {
      bodyObserver = new MutationObserver(syncHeader);
      bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }
    var view = document.getElementById('view-webstudio');
    if (view && !viewObserver) {
      viewObserver = new MutationObserver(syncHeader);
      viewObserver.observe(view, { childList: true, subtree: true });
    }
    syncHeader();
    return true;
  }

  document.addEventListener('click', function (event) {
    var target = event.target && event.target.closest ? event.target : null;
    var sidebarClose = target && target.closest ? target.closest('#ovyx-desktop-sidebar-close') : null;
    if (sidebarClose && document.body &&
        document.body.classList.contains('ovyx-webstudio-active') &&
        document.body.classList.contains('ovyx-ws-nav-open')) {
      // Preserve the existing desktop close affordance, but delegate the
      // state transition to the production navigation controller.
      event.preventDefault();
      event.stopImmediatePropagation();
      window.OVYXWebStudioNavigation?.close?.();
    }
  }, true);

  window.addEventListener('resize', syncHeader);
  window.addEventListener('ovyx:view-changed', boot);
  window.addEventListener('firebase-auth-state-ready', boot);
  if (!boot()) document.addEventListener('DOMContentLoaded', boot, { once: true });
})();
