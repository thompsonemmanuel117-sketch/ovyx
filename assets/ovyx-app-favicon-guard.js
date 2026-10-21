(function () {
  'use strict';
  var GUARD_KEY = '__OVYX_APP_FAVICON_GUARD_V2__';
  var LINK_ID = 'ovyx-canonical-app-favicon';
  var MARKER = 'data-ovyx-canonical-favicon';
  var ICON_HREF = '/assets/ovyx-app-favicon.svg?v=20261021-2';
  var canonicalLink = null;
  var observer = null;
  var existing = window[GUARD_KEY];
  if (existing && existing.version === '2.0.0' && typeof existing.refresh === 'function') {
    existing.refresh();
    return;
  }

  var nativeSetAttribute = Element.prototype.setAttribute;
  var nativeRemoveAttribute = Element.prototype.removeAttribute;
  var nativeElementRemove = Element.prototype.remove;
  var nativeNodeRemoveChild = Node.prototype.removeChild;
  var nativeNodeReplaceChild = Node.prototype.replaceChild;

  function expectedAttribute(name) {
    switch (String(name || '').toLowerCase()) {
      case 'id': return LINK_ID;
      case MARKER: return 'true';
      case 'rel': return 'icon';
      case 'type': return 'image/svg+xml';
      case 'href': return ICON_HREF;
      default: return null;
    }
  }

  function isCanonicalLink(element) {
    return !!(element && element.nodeType === 1 &&
      String(element.tagName || '').toUpperCase() === 'LINK' &&
      (element === canonicalLink || element.id === LINK_ID || element.hasAttribute(MARKER)));
  }

  function setNativeAttributeIfNeeded(element, name, value) {
    if (element.getAttribute(name) !== value) nativeSetAttribute.call(element, name, value);
  }

  // Lock only the canonical OVYX favicon node; unrelated elements and links
  // continue to use their original DOM behavior.
  Element.prototype.setAttribute = function (name, value) {
    var attr = String(name || '').toLowerCase();
    if (isCanonicalLink(this)) {
      var expected = expectedAttribute(attr);
      if (expected !== null) {
        setNativeAttributeIfNeeded(this, attr, expected);
        return;
      }
    }
    return nativeSetAttribute.call(this, name, value);
  };

  Element.prototype.removeAttribute = function (name) {
    var attr = String(name || '').toLowerCase();
    if (isCanonicalLink(this)) {
      var expected = expectedAttribute(attr);
      if (expected !== null) {
        setNativeAttributeIfNeeded(this, attr, expected);
        return;
      }
    }
    return nativeRemoveAttribute.call(this, name);
  };

  function lockLinkProperty(property, attribute) {
    if (typeof HTMLLinkElement === 'undefined') return;
    var descriptor = Object.getOwnPropertyDescriptor(HTMLLinkElement.prototype, property);
    if (!descriptor || !descriptor.configurable || typeof descriptor.set !== 'function') return;
    try {
      Object.defineProperty(HTMLLinkElement.prototype, property, {
        configurable: descriptor.configurable,
        enumerable: descriptor.enumerable,
        get: descriptor.get,
        set: function (value) {
          if (isCanonicalLink(this)) {
            setNativeAttributeIfNeeded(this, attribute, expectedAttribute(attribute));
            return;
          }
          return descriptor.set.call(this, value);
        }
      });
    } catch (_) {
      // Attribute locking and the mutation observer remain active if a browser
      // does not allow wrapping this reflected property descriptor.
    }
  }

  lockLinkProperty('href', 'href');
  lockLinkProperty('rel', 'rel');
  lockLinkProperty('type', 'type');

  function hasIconRel(link) {
    return String(link.getAttribute('rel') || '').toLowerCase()
      .split(/\s+/).filter(Boolean).indexOf('icon') !== -1;
  }

  function findCanonicalLink() {
    var byId = document.getElementById(LINK_ID);
    if (byId && String(byId.tagName || '').toUpperCase() === 'LINK') return byId;
    var markedLinks = document.querySelectorAll('link[' + MARKER + ']');
    return markedLinks.length ? markedLinks[0] : null;
  }

  function enforceCanonicalFavicon() {
    if (!document.head) return null;
    var link = findCanonicalLink();

    if (!link) {
      link = document.createElement('link');
      canonicalLink = link;
      nativeSetAttribute.call(link, 'id', LINK_ID);
      nativeSetAttribute.call(link, MARKER, 'true');
      nativeSetAttribute.call(link, 'rel', 'icon');
      nativeSetAttribute.call(link, 'type', 'image/svg+xml');
      nativeSetAttribute.call(link, 'href', ICON_HREF);
      document.head.appendChild(link);
    }

    canonicalLink = link;
    if (link.parentNode !== document.head) document.head.appendChild(link);
    setNativeAttributeIfNeeded(link, 'id', LINK_ID);
    setNativeAttributeIfNeeded(link, MARKER, 'true');
    setNativeAttributeIfNeeded(link, 'rel', 'icon');
    setNativeAttributeIfNeeded(link, 'type', 'image/svg+xml');
    setNativeAttributeIfNeeded(link, 'href', ICON_HREF);

    // Exactly one browser-tab icon. Preserve Apple touch icons, manifests,
    // stylesheets, preload hints, and other unrelated link elements.
    Array.prototype.slice.call(document.querySelectorAll('link')).forEach(function (candidate) {
      if (candidate === link) return;
      if (hasIconRel(candidate) || candidate.id === LINK_ID || candidate.hasAttribute(MARKER)) {
        if (typeof nativeElementRemove === 'function') nativeElementRemove.call(candidate);
        else if (candidate.parentNode) nativeNodeRemoveChild.call(candidate.parentNode, candidate);
      }
    });
    return link;
  }

  if (typeof nativeElementRemove === 'function') {
    Element.prototype.remove = function () {
      if (isCanonicalLink(this)) {
        enforceCanonicalFavicon();
        return;
      }
      return nativeElementRemove.call(this);
    };
  }

  Node.prototype.removeChild = function (child) {
    if (child && child.parentNode === this && isCanonicalLink(child)) return child;
    return nativeNodeRemoveChild.call(this, child);
  };

  Node.prototype.replaceChild = function (newChild, oldChild) {
    if (oldChild && oldChild.parentNode === this && isCanonicalLink(oldChild)) return oldChild;
    return nativeNodeReplaceChild.call(this, newChild, oldChild);
  };

  function installObserver() {
    if (observer || !document.documentElement || typeof MutationObserver !== 'function') return;
    observer = new MutationObserver(function () {
      enforceCanonicalFavicon();
    });
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['href', 'rel', 'type', 'id', MARKER]
    });
  }

  function refresh() {
    var result = enforceCanonicalFavicon();
    installObserver();
    return !!result;
  }

  var api = Object.freeze({ version: '2.0.0', href: ICON_HREF, refresh: refresh });
  try {
    Object.defineProperty(window, GUARD_KEY, {
      configurable: false, enumerable: false, writable: false, value: api
    });
  } catch (_) {
    window[GUARD_KEY] = api;
  }

  if (document.head) refresh();
  else document.addEventListener('DOMContentLoaded', refresh, { once: true });
})();