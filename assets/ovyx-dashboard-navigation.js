(function () {
  'use strict';
  if (window.__OVYX_DASHBOARD_NAVIGATION_AUTHORITY_V1__) return;
  window.__OVYX_DASHBOARD_NAVIGATION_AUTHORITY_V1__ = true;

  var DOCK_ID = 'ovyx-v52-bottom-bar';
  var VIEWPORT_ID = 'view-router-viewport';
  var owned = new WeakMap();
  var PROPERTIES = ['display', 'visibility', 'opacity', 'pointer-events'];

  function normalizeRoute(value) {
    return String(value || '').replace(/^view-/, '').trim().toLowerCase();
  }

  function visible(element) {
    if (!element || !element.isConnected || element.hidden) return false;
    var style = window.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' &&
      style.visibility !== 'collapse' && element.getClientRects().length > 0;
  }

  function activeRoute() {
    var stateRoute = normalizeRoute(window.KernelState && window.KernelState.activeView);
    var viewport = document.getElementById(VIEWPORT_ID);
    if (!stateRoute || !viewport) return null;

    // aria-hidden can be stale during legacy route transitions. The rendered
    // section and KernelState must agree before the Home dock is shown.
    var sections = Array.prototype.filter.call(viewport.children, function (node) {
      return node instanceof HTMLElement && node.tagName === 'SECTION' &&
        /^view-[a-z0-9-]+$/i.test(node.id || '');
    });
    var visibleSections = sections.filter(visible);
    if (visibleSections.length !== 1) return null;
    var renderedRoute = normalizeRoute(visibleSections[0].id);
    return renderedRoute === stateRoute ? stateRoute : null;
  }

  function overlayOpen() {
    // Authentication is a full-screen protected surface layered over Home.
    // KernelState can legitimately remain on Home while this overlay is open,
    // so route-only checks are insufficient to own the dashboard dock.
    return document.body.classList.contains('ovyx-auth-open') ||
      document.documentElement.classList.contains('ovyx-auth-open') ||
      visible(document.getElementById('view-master-auth')) ||
      visible(document.getElementById('kernel-brain-bot-panel')) ||
      visible(document.getElementById('ovyx-website-management'));
  }

  function read(style, property) {
    return { value: style.getPropertyValue(property), priority: style.getPropertyPriority(property) };
  }

  function write(style, property, value) {
    if (style.getPropertyValue(property) !== value || style.getPropertyPriority(property) !== 'important') {
      style.setProperty(property, value, 'important');
    }
  }

  function restore(dock) {
    var state = owned.get(dock);
    if (!state) return;
    PROPERTIES.forEach(function (property) {
      var saved = state.saved[property];
      if (saved && saved.value) dock.style.setProperty(property, saved.value, saved.priority || '');
      else dock.style.removeProperty(property);
    });
    owned.delete(dock);
  }

  function enforce(dock, show) {
    var state = owned.get(dock);
    if (!state) {
      state = { saved: {}, last: {} };
      PROPERTIES.forEach(function (property) {
        state.saved[property] = read(dock.style, property);
      });
      owned.set(dock, state);
    }

    var desired = show
      ? { display: 'grid', visibility: 'visible', opacity: '1', 'pointer-events': 'auto' }
      : { display: 'none', visibility: 'hidden', opacity: '0', 'pointer-events': 'none' };

    PROPERTIES.forEach(function (property) {
      var current = read(dock.style, property);
      var last = state.last[property];
      // Retain changes made by the original shell while this authority is
      // active, then reassert the route-correct state.
      if (!last || current.value !== last.value || current.priority !== last.priority) {
        state.saved[property] = current;
      }
      write(dock.style, property, desired[property]);
      state.last[property] = { value: desired[property], priority: 'important' };
    });
  }

  function sync() {
    var dock = document.getElementById(DOCK_ID);
    if (!dock) return;
    if (window.innerWidth >= 768) {
      restore(dock);
      return;
    }

    var route = activeRoute();
    var show = route === 'home' && !overlayOpen();
    enforce(dock, show);
  }

  var pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    var run = function () {
      window.requestAnimationFrame(function () {
        pending = false;
        sync();
      });
    };
    if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(run);
    else Promise.resolve().then(function () { pending = false; sync(); });
  }

  function observe() {
    var viewport = document.getElementById(VIEWPORT_ID);
    if (viewport && !viewport.dataset.ovyxDashboardDockObserved) {
      viewport.dataset.ovyxDashboardDockObserved = '1';
      new MutationObserver(schedule).observe(viewport, {
        childList: true, subtree: true, attributes: true,
        attributeFilter: ['class', 'style', 'hidden', 'inert']
      });
    }

    var dock = document.getElementById(DOCK_ID);
    if (dock && !dock.dataset.ovyxDashboardDockObserved) {
      dock.dataset.ovyxDashboardDockObserved = '1';
      new MutationObserver(schedule).observe(dock, {
        attributes: true, attributeFilter: ['style', 'hidden', 'class']
      });
    }

    if (document.body && !document.body.dataset.ovyxDashboardDockMountObserver) {
      document.body.dataset.ovyxDashboardDockMountObserver = '1';
      new MutationObserver(function (records) {
        if (records.some(function (record) {
          return Array.prototype.some.call(record.addedNodes || [], function (node) {
            return node.nodeType === 1 && (node.id === DOCK_ID || node.id === VIEWPORT_ID ||
              (node.querySelector && (node.querySelector('#' + DOCK_ID) || node.querySelector('#' + VIEWPORT_ID))));
          });
        })) {
          observe();
          schedule();
        }
      }).observe(document.body, { childList: true, subtree: true });
    }
    schedule();
  }

  function boot() {
    observe();
    window.addEventListener('ovyx:view-changed', schedule, { passive: true });
    window.addEventListener('popstate', schedule, { passive: true });
    window.addEventListener('pageshow', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    if (window.visualViewport) window.visualViewport.addEventListener('resize', schedule, { passive: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();

  window.OVYXDashboardNavigationAuthority = Object.freeze({ sync: sync, refresh: observe });
})();
