/* OVYX Stage 4 — platform motion coordinator. Web Studio is an explicit no-touch boundary. */
(function () {
  'use strict';
  if (window.__OVYX_PLATFORM_MOTION_V1__) return;
  window.__OVYX_PLATFORM_MOTION_V1__ = true;

  var activeViewId = '';
  var scheduled = false;
  var observer = null;
  var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');

  function isWebStudio(view) {
    return !view || view.id === 'view-webstudio' || !!view.closest('#view-webstudio') ||
      !!(document.body && document.body.classList.contains('ovyx-webstudio-active'));
  }

  function isVisible(view) {
    if (!view || view.hidden || view.getAttribute('aria-hidden') === 'true') return false;
    var style;
    try { style = window.getComputedStyle(view); } catch (_) { return false; }
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  function findActiveView() {
    var views = document.querySelectorAll('[id^="view-"]');
    for (var i = 0; i < views.length; i += 1) {
      if (!isWebStudio(views[i]) && isVisible(views[i])) return views[i];
    }
    return null;
  }

  function animateView(view) {
    if (!view || isWebStudio(view)) return;
    view.classList.add('ovyx-motion-scope');
    if (reducedMotion && reducedMotion.matches) return;
    view.classList.remove('ovyx-motion-enter');
    // A single layout read restarts only the short opacity/transform entrance.
    void view.offsetWidth;
    view.classList.add('ovyx-motion-enter');
  }

  function syncView() {
    scheduled = false;
    if (document.body && document.body.classList.contains('ovyx-webstudio-active')) return;
    var view = findActiveView();
    if (!view) return;
    view.classList.add('ovyx-motion-scope');
    if (view.id === activeViewId) return;
    activeViewId = view.id;
    animateView(view);
  }

  function scheduleSync() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(syncView);
  }

  function boot() {
    if (!document.body) return;
    if (!observer && typeof MutationObserver === 'function') {
      observer = new MutationObserver(scheduleSync);
      observer.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'hidden', 'aria-hidden']
      });
    }
    scheduleSync();
  }

  document.addEventListener('animationend', function (event) {
    if (event.animationName === 'ovyxMotionPageEnter') {
      event.target.classList.remove('ovyx-motion-enter');
    }
  }, true);
  document.addEventListener('ovyx:view-changed', scheduleSync);
  window.addEventListener('pageshow', scheduleSync);
  window.addEventListener('resize', scheduleSync, { passive: true });
  if (reducedMotion && typeof reducedMotion.addEventListener === 'function') {
    reducedMotion.addEventListener('change', function (event) {
      if (event.matches) {
        document.querySelectorAll('.ovyx-motion-enter').forEach(function (node) {
          node.classList.remove('ovyx-motion-enter');
        });
      }
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
