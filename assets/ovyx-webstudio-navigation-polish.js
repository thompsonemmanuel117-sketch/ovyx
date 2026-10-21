(function () {
  'use strict';

  if (window.__OVYX_WS_NAV_HEADER_POLISH_V3__) return;
  window.__OVYX_WS_NAV_HEADER_POLISH_V2__ = true;

  var STYLE_ID = 'ovyx-webstudio-navigation-header-polish-v3';
  var bodyObserver = null;
  var viewObserver = null;
  var triggerObserver = null;
  var observedTrigger = null;
  var savedHeaderState = null;
  var lastNavigationState = null;

  var CSS = [
    'body.ovyx-webstudio-active.ovyx-ws-nav-open #view-webstudio .ovyx-ws-header,body.ovyx-webstudio-active.ovyx-ws-mobile-nav-open #view-webstudio .ovyx-ws-header{visibility:hidden!important;pointer-events:none!important}',
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

  function navigationIsOpen() {
    var body = document.body;
    var trigger = document.getElementById('ws-sidebar-trigger');
    return !!(body && (
      body.classList.contains('ovyx-ws-nav-open') ||
      body.classList.contains('ovyx-ws-mobile-nav-open')
    )) || !!(trigger && trigger.getAttribute('aria-expanded') === 'true');
  }

  function restoreHeader(header) {
    var saved = savedHeaderState;
    if (!header || !saved || saved.header !== header) return;
    if (saved.display) header.style.setProperty('display', saved.display, saved.displayPriority);
    else header.style.removeProperty('display');
    if (saved.visibility) header.style.setProperty('visibility', saved.visibility, saved.visibilityPriority);
    else header.style.removeProperty('visibility');
    if (saved.ariaHidden === null) header.removeAttribute('aria-hidden');
    else header.setAttribute('aria-hidden', saved.ariaHidden);
    header.inert = saved.inert;
    savedHeaderState = null;
  }

  function syncHeader() {
    install();
    var view = document.getElementById('view-webstudio');
    var header = view && view.querySelector('.ovyx-ws-header');
    if (!header) return;
    var open = navigationIsOpen();

    if (open) {
      if (!savedHeaderState || savedHeaderState.header !== header) {
        savedHeaderState = {
          header: header,
          display: header.style.getPropertyValue('display'),
          displayPriority: header.style.getPropertyPriority('display'),
          visibility: header.style.getPropertyValue('visibility'),
          visibilityPriority: header.style.getPropertyPriority('visibility'),
          ariaHidden: header.getAttribute('aria-hidden'),
          inert: !!header.inert
        };
      }
      // Hide the chat toolbar visually behind navigation without removing
      // its flex row from the shell. Keeping the original row height prevents
      // the chat and preview panes from jumping or losing their alignment.
      // Both the body classes and the real arrow's aria-expanded state are
      // watched so the toolbar returns exactly as it was when navigation closes.
      header.style.setProperty('visibility', 'hidden', 'important');
      header.setAttribute('aria-hidden', 'true');
      header.inert = true;

      // The navigation owner sets a 54px offset with inline !important
      // styles. A stylesheet alone cannot override those styles, which left
      // the old chat-header gap visible even when the header itself was hidden.
      var mobile = !!(window.matchMedia && window.matchMedia('(max-width: 767px)').matches);
      if (mobile && document.body.classList.contains('ovyx-ws-mobile-nav-open')) {
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
      }
      lastNavigationState = true;
    } else {
      restoreHeader(header);
      lastNavigationState = false;
    }
  }

  function bindTriggerObserver() {
    var trigger = document.getElementById('ws-sidebar-trigger');
    if (trigger === observedTrigger) return;
    if (triggerObserver) triggerObserver.disconnect();
    triggerObserver = null;
    observedTrigger = trigger;
    if (trigger && typeof MutationObserver === 'function') {
      triggerObserver = new MutationObserver(syncHeader);
      triggerObserver.observe(trigger, { attributes: true, attributeFilter: ['aria-expanded'] });
    }
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
      viewObserver = new MutationObserver(function () {
        bindTriggerObserver();
        syncHeader();
      });
      viewObserver.observe(view, { childList: true, subtree: true });
    }
    bindTriggerObserver();
    syncHeader();
    return true;
  }

  document.addEventListener('click', function (event) {
    if (event.target && event.target.closest && event.target.closest('#ws-sidebar-trigger')) {
      window.setTimeout(syncHeader, 0);
    }
  }, true);
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') window.setTimeout(syncHeader, 0);
  }, true);
  window.addEventListener('resize', syncHeader);
  window.addEventListener('ovyx:view-changed', boot);
  window.addEventListener('firebase-auth-state-ready', boot);
  if (!boot()) document.addEventListener('DOMContentLoaded', boot, { once: true });
})();