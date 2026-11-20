(function () {
  'use strict';
  if (window.__OVYX_SIDEBAR_NAVIGATION_REPAIR_V1__) return;
  window.__OVYX_SIDEBAR_NAVIGATION_REPAIR_V1__ = true;

  function isDesktop() {
    return window.matchMedia ? window.matchMedia('(min-width: 768px)').matches : window.innerWidth >= 768;
  }

  function removeDuplicateCreateEntry() {
    var drawer = document.getElementById('mobile-drawer');
    if (!drawer) return;
    drawer.querySelectorAll('.ovyx-mobile-nav-item').forEach(function (item) {
      var label = String(item.textContent || '').replace(/\s+/g, ' ').trim();
      var action = String(item.getAttribute('onclick') || '');
      if (/^New Project\b/i.test(label) && /ProjectStore\.createPromptModal/.test(action)) item.remove();
    });
  }

  function repairExpandedDesktopSidebar() {
    if (!isDesktop() || document.body.classList.contains('ovyx-webstudio-active')) return;
    var root = document.documentElement;
    var sidebar = document.getElementById('app-sidebar');
    if (!sidebar) return;

    // The collapsed class/data attribute are the shell's actual layout state.
    // Do not infer "collapsed" from inert/aria-hidden: those can be stale after
    // an interrupted transition and leave a visibly open sidebar unclickable.
    var collapsed = root.dataset.ovyxSidebar === 'collapsed' ||
      root.classList.contains('v34-sidebar-collapsed');
    if (collapsed) {
      sidebar.inert = true;
      sidebar.setAttribute('aria-hidden', 'true');
      return;
    }

    // Re-apply the canonical expanded state on boot and route changes. This
    // repairs stale inert/aria-hidden flags without changing the user's
    // intentional collapsed preference.
    if (window.OVYXDesktopShell && typeof window.OVYXDesktopShell.setCollapsed === 'function') {
      window.OVYXDesktopShell.setCollapsed(false, true);
    }
    sidebar.hidden = false;
    sidebar.inert = false;
    sidebar.setAttribute('aria-hidden', 'false');
    if (sidebar.style && sidebar.style.pointerEvents === 'none') {
      sidebar.style.pointerEvents = 'auto';
    }
  }

  function syncSidebarNavigation() {
    repairExpandedDesktopSidebar();
    var menu = document.getElementById('ovyx-v34-menu-source');
    if (!menu || menu.dataset.ovyxCanonicalSidebarToggle === '1') return;
    menu.dataset.ovyxCanonicalSidebarToggle = '1';

    // The legacy top-bar handler only toggled a CSS class. The canonical shell
    // also owns inert/aria-hidden, so the sidebar could look open while every
    // navigation control remained non-interactive.
    menu.onclick = function (event) {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      if (!isDesktop()) {
        window.MobileDrawer && window.MobileDrawer.open && window.MobileDrawer.open();
        return;
      }
      if (document.body.classList.contains('ovyx-webstudio-active')) {
        document.documentElement.classList.toggle('v34-sidebar-collapsed');
        return;
      }
      var root = document.documentElement;
      var sidebar = document.getElementById('app-sidebar');
      var collapsed = root.dataset.ovyxSidebar === 'collapsed' ||
        !!(sidebar && (sidebar.inert || sidebar.getAttribute('aria-hidden') === 'true'));
      root.classList.remove('v34-sidebar-collapsed');
      if (window.OVYXDesktopShell && typeof window.OVYXDesktopShell.setCollapsed === 'function') {
        window.OVYXDesktopShell.setCollapsed(!collapsed, true);
      } else if (sidebar) {
        sidebar.inert = !collapsed;
        sidebar.hidden = false;
        sidebar.setAttribute('aria-hidden', collapsed ? 'false' : 'true');
      }
    };
  }

  function install() {
    removeDuplicateCreateEntry();
    syncSidebarNavigation();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }

  window.addEventListener('resize', install, { passive: true });
  window.addEventListener('ovyx:view-changed', install, { passive: true });
  window.OVYXSidebarNavigationRepair = Object.freeze({ refresh: install, version: 1 });
})();