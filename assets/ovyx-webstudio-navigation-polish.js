(function () {
  'use strict';

  if (window.__OVYX_WS_NAV_HEADER_POLISH_V1__) return;
  window.__OVYX_WS_NAV_HEADER_POLISH_V1__ = true;

  var STYLE_ID = 'ovyx-webstudio-navigation-header-polish-v1';
  var CSS = [
    'body.ovyx-webstudio-active.ovyx-ws-nav-open #view-webstudio .ovyx-ws-header,body.ovyx-webstudio-active.ovyx-ws-mobile-nav-open #view-webstudio .ovyx-ws-header{display:none!important;visibility:hidden!important;pointer-events:none!important}',
    '@media(max-width:767px){body.ovyx-webstudio-active.ovyx-ws-mobile-nav-open #mobile-drawer{top:0!important;bottom:0!important;height:100dvh!important;max-height:100dvh!important}body.ovyx-webstudio-active.ovyx-ws-mobile-nav-open #mobile-drawer-backdrop{top:0!important;bottom:0!important;height:100dvh!important;max-height:100dvh!important}}'
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

  install();
  document.addEventListener('DOMContentLoaded', install, { once: true });
  window.addEventListener('ovyx:view-changed', install);
})();