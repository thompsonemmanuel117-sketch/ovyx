(function () {
  'use strict';

  if (window.__OVYX_SETTINGS_CONNECTIONS_VISIBILITY_FIX_V1__) return;
  window.__OVYX_SETTINGS_CONNECTIONS_VISIBILITY_FIX_V1__ = true;

  var observer = null;
  var observedRoot = null;
  var syncing = false;

  function settingsRoot() {
    return document.getElementById('view-settings');
  }

  function selectedSettingsId(root) {
    // The active navigation item is the reliable source of truth. A legacy
    // Connections visibility guard can temporarily overwrite Settings.current.
    var nav = root && (
      root.querySelector('.ovyx-settings-sidebar [data-settings-nav].active') ||
      root.querySelector('[data-settings-nav].active')
    );
    var navId = nav && String(nav.getAttribute('data-settings-nav') || '').trim();
    if (navId) return navId;
    var settings = window.OVYXSettings;
    return settings && typeof settings.current === 'string' && settings.current.trim()
      ? settings.current.trim()
      : 'general';
  }

  function setImportant(element, property, value) {
    if (!element || element.style.getPropertyValue(property) === value &&
        element.style.getPropertyPriority(property) === 'important') return;
    element.style.setProperty(property, value, 'important');
  }

  function syncConnectionPanel(id) {
    var root = settingsRoot();
    if (!root || syncing) return;
    syncing = true;
    try {
      var main = root.querySelector('#ovyx-settings-main, .ovyx-settings-main');
      var panels = Array.prototype.slice.call(root.querySelectorAll('[data-settings-panel="connections"]'));
      if (!panels.length) return;

      var canonical = panels.find(function (panel) {
        return main && main.contains(panel);
      }) || panels[0];
      var activeId = typeof id === 'string' && id.trim() ? id.trim() : selectedSettingsId(root);

      panels.forEach(function (panel) {
        var active = panel === canonical && activeId === 'connections';

        // V91 added this class and a !important display rule, but never removes
        // the class when another Settings tab opens. That overrides the hidden
        // attribute and leaves Universal Connections visible on every tab.
        panel.classList.remove('is-v91-active');
        panel.classList.toggle('active', active);
        panel.hidden = !active;
        setImportant(panel, 'display', active ? 'block' : 'none');
        setImportant(panel, 'visibility', active ? 'visible' : 'hidden');
        setImportant(panel, 'opacity', active ? '1' : '0');
        setImportant(panel, 'pointer-events', active ? 'auto' : 'none');
        if (panel !== canonical) panel.setAttribute('aria-hidden', 'true');
        else panel.setAttribute('aria-hidden', String(!active));
      });

      // If a buggy/legacy renderer accidentally nests the V91 form into another
      // Settings card, remove only that stray copy. The canonical Connections
      // panel above remains the single owner of the live form and event handlers.
      Array.prototype.slice.call(root.querySelectorAll(
        '[data-settings-panel]:not([data-settings-panel="connections"]) .ovyx-v91-conn-shell'
      )).forEach(function (stray) {
        stray.remove();
      });
    } finally {
      syncing = false;
    }
  }

  function hookSettings() {
    var settings = window.OVYXSettings;
    if (!settings || typeof settings.show !== 'function' ||
        settings.show.__OVYXSettingsConnectionsVisibilityFixV1__) return;

    var originalShow = settings.show;
    var wrappedShow = function (id) {
      var result = originalShow.apply(this, arguments);
      syncConnectionPanel(typeof id === 'string' ? id : undefined);
      window.setTimeout(function () { syncConnectionPanel(); }, 0);
      return result;
    };
    wrappedShow.__OVYXSettingsConnectionsVisibilityFixV1__ = true;
    wrappedShow.__OVYXOriginalShow = originalShow;
    settings.show = wrappedShow;
  }

  function install() {
    var root = settingsRoot();
    hookSettings();
    if (!root) return;

    if (observedRoot !== root) {
      if (observer) observer.disconnect();
      observedRoot = root;
      observer = new MutationObserver(function () {
        hookSettings();
        syncConnectionPanel();
      });
      observer.observe(root, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['class', 'hidden', 'aria-hidden']
      });
    }
    syncConnectionPanel();
  }

  document.addEventListener('click', function (event) {
    var nav = event.target && event.target.closest &&
      event.target.closest('#view-settings [data-settings-nav]');
    if (!nav) return;
    window.setTimeout(function () {
      hookSettings();
      syncConnectionPanel(String(nav.getAttribute('data-settings-nav') || ''));
    }, 0);
    window.setTimeout(function () { syncConnectionPanel(); }, 40);
  }, true);

  window.addEventListener('ovyx-settings-rendered', function () {
    window.setTimeout(install, 0);
  });
  window.addEventListener('ovyx:view-changed', function () {
    window.setTimeout(install, 0);
  });
  [0, 120, 400, 1000, 2200].forEach(function (delay) {
    window.setTimeout(install, delay);
  });
})();