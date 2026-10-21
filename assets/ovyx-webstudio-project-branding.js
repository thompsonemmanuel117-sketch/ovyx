(function () {
  'use strict';

  if (window.__OVYX_WS_PROJECT_BRANDING_V1__) return;
  window.__OVYX_WS_PROJECT_BRANDING_V1__ = true;

  var busy = false;
  var scheduled = false;
  var attempts = 0;

  function clean(value) {
    return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, '').trim();
  }
  function sourceOf(value) {
    if (typeof value === 'string') return value;
    if (!value || typeof value !== 'object') return '';
    return typeof value.content === 'string' ? value.content :
      typeof value.text === 'string' ? value.text :
      typeof value.source === 'string' ? value.source :
      typeof value.code === 'string' ? value.code : '';
  }
  function normalizePath(path) {
    var cleanParts = [];
    String(path || '').replace(/\\/g, '/').replace(/^\/+/, '').split('/').forEach(function (part) {
      if (!part || part === '.') return;
      if (part === '..') { if (cleanParts.length) cleanParts.pop(); return; }
      cleanParts.push(part);
    });
    return cleanParts.join('/');
  }
  function resolveProjectPath(fromPath, reference) {
    var value = clean(reference).split(/[?#]/)[0].replace(/\\/g, '/');
    if (!value || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(value)) return '';
    if (value.charAt(0) === '/') return normalizePath(value);
    var base = String(fromPath || '').replace(/\\/g, '/').split('/').slice(0, -1).join('/');
    return normalizePath((base ? base + '/' : '') + value);
  }
  function isPlatformLogo(reference) {
    var value = clean(reference);
    return /(?:^|\/)(?:ovyx-logo|ovyx-brand-mark|ovyx-brand-lockup|ovyx-notification-icon)(?:\.(?:svg|png|jpe?g|webp|ico))?(?:[?#]|$)/i.test(value) ||
      /ovyx-(?:boot-logo|brand-mark|notification-icon)/i.test(value);
  }
  function sanitizeSvg(source) {
    return String(source || '')
      .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
      .replace(/<foreignObject\b[\s\S]*?<\/foreignObject\s*>/gi, '')
      .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/javascript\s*:/gi, '');
  }
  function svgDataUrl(source) {
    var value = sanitizeSvg(source);
    if (!/<svg\b/i.test(value)) return '';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(value);
  }
  function imageHref(fromPath, reference, files) {
    var value = clean(reference);
    if (!value || isPlatformLogo(value) || /^(?:blob:|javascript:)/i.test(value)) return '';
    if (/^data:image\//i.test(value)) return value;
    if (/^https?:\/\//i.test(value)) return value;
    var resolved = resolveProjectPath(fromPath, value);
    if (!resolved) return '';
    var asset = files[resolved];
    if (!asset) return '';
    var assetText = sourceOf(asset);
    if (/<svg\b/i.test(assetText)) {
      var data = svgDataUrl(assetText);
      if (data) return data;
    }
    if (/\.(?:svg|png|jpe?g|webp|gif|ico)(?:[?#]|$)/i.test(value)) return '/' + resolved;
    return '';
  }
  function svgHref(element) {
    if (!element || !element.outerHTML) return '';
    return svgDataUrl(element.outerHTML);
  }
  function elementDescription(element) {
    return [
      element.getAttribute('alt'), element.getAttribute('title'),
      element.getAttribute('aria-label'), element.getAttribute('class'),
      element.getAttribute('id'), element.getAttribute('src')
    ].map(clean).join(' ').toLowerCase();
  }
  function elementScore(element) {
    var desc = elementDescription(element);
    var markup = String(element && element.outerHTML || '').slice(0, 2500);
    if (/\b(?:ovyx-brand-mark|ovyx-brand-lockup|ovyx-logo|ovyx-boot-logo|ovyx-notification-icon)\b/i.test(desc + ' ' + markup)) return -100;
    var hasBrandSignal = /\b(?:logo|wordmark|brand|identity|site-mark|brandmark)\b/.test(desc);
    if (!hasBrandSignal) return -100;
    var score = 14;
    if (/\b(?:avatar|profile|customer|product|hero|banner-image)\b/.test(desc)) score -= 10;
    if (element.closest && element.closest('header, nav, [role="banner"]')) score += 8;
    if (element.tagName && element.tagName.toLowerCase() === 'svg') score += 2;
    if (isPlatformLogo(element.getAttribute && (element.getAttribute('src') || element.getAttribute('href') || ''))) score -= 100;
    return score;
  }
  function findBrandHref(pagePath, html, files) {
    if (!/<head\b/i.test(html) || !/<body\b/i.test(html)) return null;
    var doc;
    try { doc = new DOMParser().parseFromString(html, 'text/html'); } catch (_) { return null; }
    var candidates = Array.prototype.slice.call(doc.querySelectorAll(
      'img, header svg, nav svg, [role="banner"] svg, [class*="logo" i] svg, [id*="logo" i] svg'
    )).map(function (element) {
      var score = elementScore(element);
      var tag = element.tagName.toLowerCase();
      var reference = tag === 'img' ? clean(element.getAttribute('src') || element.getAttribute('data-src')) : '';
      var href = reference ? imageHref(pagePath, reference, files) : svgHref(element);
      return { score: score, href: href };
    }).filter(function (item) { return item.href && item.score > 0; });
    candidates.sort(function (a, b) { return b.score - a.score; });
    return candidates.length ? candidates[0].href : null;
  }
  function setHref(tag, href) {
    var escaped = String(href).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    if (/\bhref\s*=\s*(["'])[\s\S]*?\1/i.test(tag)) {
      return tag.replace(/\bhref\s*=\s*(["'])[\s\S]*?\1/i, 'href="' + escaped + '"');
    }
    return tag.replace(/\s*\/?>$/, function (close) { return ' href="' + escaped + '"' + close; });
  }
  function patchFavicon(html, href) {
    if (!href || !/<head\b/i.test(html)) return html;
    var found = false;
    var next = html.replace(/<link\b[^>]*>/gi, function (tag) {
      var rel = tag.match(/\brel\s*=\s*(["'])([^"']*)\1/i);
      var relations = rel ? rel[2].toLowerCase().split(/\s+/) : [];
      if (relations.indexOf('icon') < 0) return tag;
      found = true;
      return setHref(tag, href);
    });
    if (found) return next;
    return next.replace(/<head\b[^>]*>/i, function (tag) {
      return tag + '<link rel="icon" href="' + String(href).replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '">';
    });
  }
  function fileList(graph) {
    var files = graph && graph.files || {};
    return Object.keys(files).filter(function (path) {
      return /\.html?$/i.test(path) && /<(?:!doctype|html|head)\b/i.test(sourceOf(files[path]));
    });
  }
  function primaryPath(graph, project, paths) {
    var files = graph && graph.files || {};
    var entry = clean(graph && graph.entry);
    if (entry && files[entry] && /\.html?$/i.test(entry)) return entry;
    var pages = Array.isArray(project && project.pages) ? project.pages : [];
    var home = pages.find(function (page) {
      return page && (String(page.route || '') === '/' || /^home$/i.test(String(page.name || '')));
    });
    var pagePath = clean(home && (home.__ovyxFile || home.file || home.path));
    if (pagePath && files[pagePath] && /\.html?$/i.test(pagePath)) return pagePath;
    return paths.find(function (path) { return /(?:^|\/)index\.html?$/i.test(path); }) ||
      paths.find(function (path) { return /(?:^|\/)home\.html?$/i.test(path); }) || paths[0] || '';
  }
  function updateContent(files, path, content) {
    var current = files[path];
    if (typeof current === 'string') { files[path] = content; return; }
    var entry = Object.assign({}, current || {});
    if (Object.prototype.hasOwnProperty.call(entry, 'content') || !('text' in entry) && !('source' in entry) && !('code' in entry)) entry.content = content;
    else if (Object.prototype.hasOwnProperty.call(entry, 'text')) entry.text = content;
    else if (Object.prototype.hasOwnProperty.call(entry, 'source')) entry.source = content;
    else entry.code = content;
    files[path] = entry;
  }
  function applyProjectBranding() {
    if (busy) return false;
    var studio = window.WebStudio && typeof window.WebStudio === 'object' ? window.WebStudio : null;
    var project = window.KernelState && (window.KernelState.activeProject || window.KernelState.project) || studio && studio.project;
    var graph = studio && studio.graph && studio.graph.files ? studio.graph :
      project && project.ovyxGraph && project.ovyxGraph.files ? project.ovyxGraph : null;
    if (!project || !graph || !graph.files || typeof graph.files !== 'object') return false;
    var paths = fileList(graph);
    if (!paths.length) return false;
    var first = primaryPath(graph, project, paths);
    var ordered = first ? [first].concat(paths.filter(function (path) { return path !== first; })) : paths.slice();
    var brandHref = null;
    for (var i = 0; i < ordered.length && !brandHref; i += 1) {
      brandHref = findBrandHref(ordered[i], sourceOf(graph.files[ordered[i]]), graph.files);
    }
    if (!brandHref) return true;
    var changed = [];
    paths.forEach(function (path) {
      var before = sourceOf(graph.files[path]);
      var after = patchFavicon(before, brandHref);
      if (after !== before) { updateContent(graph.files, path, after); changed.push(path); }
    });
    if (!changed.length) return true;
    busy = true;
    try {
      graph.updatedAt = Date.now();
      studio.graph = graph;
      if (window.KernelState && window.KernelState.activeProject) window.KernelState.activeProject.ovyxGraph = graph;
      if (typeof studio.syncGraphToProject === 'function') studio.syncGraphToProject();
      if (window.ProjectStore && typeof window.ProjectStore.save === 'function') window.ProjectStore.save();
      if (document.body && document.body.classList.contains('ovyx-webstudio-active') && typeof studio.renderPreview === 'function') studio.renderPreview();
    } catch (_) {
      // The favicon correction is best-effort; never block editing or preview rendering.
    } finally {
      busy = false;
    }
    return true;
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    window.setTimeout(function () {
      scheduled = false;
      try { applyProjectBranding(); } catch (_) {}
    }, 80);
  }
  function boot() {
    if (applyProjectBranding()) return;
    if (attempts++ < 60) window.setTimeout(boot, 200);
  }

  boot();
  ['ovyx:view-changed', 'ovyx:project-activated', 'ovyx:project-loaded', 'ovyx:webstudio-initial-site-built', 'ovyx:webstudio-quality-report'].forEach(function (eventName) {
    window.addEventListener(eventName, schedule);
  });
})();