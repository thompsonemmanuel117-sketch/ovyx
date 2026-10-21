(function () {
  'use strict';

  // The OVYX application shell owns its browser-tab icon. Website-specific
  // favicons are written into generated site files by Web Studio, never here.
  if (window.__OVYX_SHELL_FAVICON_LOCK_V2__) return;
  window.__OVYX_SHELL_FAVICON_LOCK_V2__ = true;

  var FAVICON_HREF = '/ovyx-tab-v6.svg?v=20261021-6';
  var observer = null;
  var enforcing = false;

  function isIconLink(link) {
    if (!link || String(link.tagName || '').toLowerCase() !== 'link') return false;
    return String(link.getAttribute('rel') || '')
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .indexOf('icon') >= 0;
  }

  function setIfDifferent(element, name, value) {
    if (element.getAttribute(name) !== value) element.setAttribute(name, value);
  }

  function enforceFavicon() {
    var head = document.head;
    if (!head || enforcing) return false;
    enforcing = true;
    try {
      var icons = Array.prototype.slice.call(head.querySelectorAll('link[rel]')).filter(isIconLink);
      var canonical = icons.find(function (link) {
        return link.getAttribute('href') === FAVICON_HREF &&
          link.getAttribute('type') === 'image/svg+xml';
      }) || icons[0] || null;

      if (!canonical) {
        canonical = document.createElement('link');
        head.insertBefore(canonical, head.firstChild || null);
      }

      // Keep one canonical declaration, even if an old inline script, a
      // component, or a cached page version tries to add a competing icon.
      icons.forEach(function (link) {
        if (link !== canonical && link.parentNode) link.parentNode.removeChild(link);
      });
      setIfDifferent(canonical, 'rel', 'icon');
      setIfDifferent(canonical, 'type', 'image/svg+xml');
      setIfDifferent(canonical, 'href', FAVICON_HREF);
      setIfDifferent(canonical, 'sizes', 'any');
      return true;
    } catch (_) {
      return false;
    } finally {
      enforcing = false;
    }
  }

  function start() {
    if (!document.head) return;
    enforceFavicon();
    if (!observer && typeof MutationObserver === 'function') {
      observer = new MutationObserver(function () {
        enforceFavicon();
      });
      observer.observe(document.head, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['rel', 'href', 'type']
      });
    }
  }

  if (document.readyState === 'loading' && !document.head) {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
  window.addEventListener('pageshow', enforceFavicon, { passive: true });

  window.OVYXShellFavicon = Object.freeze({
    enforce: enforceFavicon,
    href: FAVICON_HREF
  });
})();
