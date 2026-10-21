(function () {
  'use strict';

  if (window.__OVYX_WS_PROJECT_BRANDING_V2__) return;
  window.__OVYX_WS_PROJECT_BRANDING_V2__ = true;

  var busy = false;
  var resolving = false;
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
    var parts = [];
    String(path || '').replace(/\\/g, '/').replace(/^\/+/, '').split('/').forEach(function (part) {
      if (!part || part === '.') return;
      if (part === '..') { if (parts.length) parts.pop(); return; }
      parts.push(part);
    });
    return parts.join('/');
  }
  function resolveProjectPath(fromPath, reference) {
    var value = clean(reference).split(/[?#]/)[0].replace(/\\/g, '/');
    if (!value || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(value)) return '';
    if (value.charAt(0) === '/') return normalizePath(value);
    var base = String(fromPath || '').replace(/\\/g, '/').split('/').slice(0, -1).join('/');
    return normalizePath((base ? base + '/' : '') + value);
  }
  function isPlatformLogo(reference) {
    var value = clean(reference).split(/[?#]/)[0].replace(/\\/g, '/');
    return /(?:^|\/)(?:ovyx-logo|ovyx-brand-mark|ovyx-brand-lockup|ovyx-notification-icon|ovyx-boot-logo)(?:\.(?:svg|png|jpe?g|webp|ico))?$/i.test(value);
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
  function assetName(asset) {
    return clean(asset && (asset.name || asset.originalName || asset.filename || asset.fileName || asset.path || asset.storagePath));
  }
  function assetBasename(value) {
    return clean(value).split(/[?#]/)[0].replace(/\\/g, '/').split('/').pop().toLowerCase();
  }
  function projectAssets(project) {
    return Array.isArray(project && project.assets) ? project.assets.filter(function (asset) {
      return asset && typeof asset === 'object';
    }) : [];
  }
  function assetMatchesReference(asset, reference) {
    if (!asset || isPlatformLogo(assetName(asset)) || isPlatformLogo(reference)) return false;
    var wanted = assetBasename(reference);
    if (!wanted) return false;
    var names = [asset.name, asset.originalName, asset.filename, asset.fileName, asset.path, asset.storagePath];
    return names.some(function (name) { return name && assetBasename(name) === wanted; });
  }
  function matchingProjectAsset(project, reference) {
    return projectAssets(project).find(function (asset) {
      return assetMatchesReference(asset, reference);
    }) || null;
  }
  function imageHref(fromPath, reference, files) {
    var value = clean(reference);
    if (!value || isPlatformLogo(value) || /^(?:blob:|javascript:)/i.test(value)) return '';
    if (/^data:image\//i.test(value)) {
      if (/^data:image\/svg\+xml/i.test(value)) {
        try {
          var encoded = value.slice(value.indexOf(',') + 1);
          var decoded = value.indexOf(';base64,') >= 0 ? atob(encoded) : decodeURIComponent(encoded);
          return svgDataUrl(decoded) || value;
        } catch (_) { return value; }
      }
      return value;
    }
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
    if (/\.(?:svg|png|jpe?g|webp|gif|ico|avif)(?:[?#]|$)/i.test(value)) return '/' + resolved;
    return '';
  }
  function svgHref(element) {
    if (!element || !element.outerHTML) return '';
    var markup = element.outerHTML;
    // An inline SVG using document-level defs or inherited CSS will not be
    // faithfully reproduced as a standalone favicon; let a referenced asset win.
    if (/<use\b[^>]*?(?:href|xlink:href)\s*=\s*["']#/i.test(markup)) return '';
    return svgDataUrl(markup);
  }
  function elementDescription(element) {
    return [
      element.getAttribute('alt'), element.getAttribute('title'),
      element.getAttribute('aria-label'), element.getAttribute('class'),
      element.getAttribute('id'), element.getAttribute('src'),
      element.getAttribute('data-src')
    ].map(clean).join(' ').toLowerCase();
  }
  function elementScore(element, files) {
    var desc = elementDescription(element);
    var tag = String(element.tagName || '').toLowerCase();
    var reference = tag === 'img' ? clean(element.getAttribute('src') || element.getAttribute('data-src')) : '';
    if (isPlatformLogo(reference)) return -100;
    var hasBrandSignal = /logo|wordmark|brand|identity|site[\s_.-]?mark|brand[\s_.-]?mark|favicon|monogram|emblem|symbol/i.test(desc);
    var inHeader = !!(element.closest && element.closest('header, nav, [role="banner"]'));
    if (!hasBrandSignal && !(tag === 'img' && inHeader)) return -100;

    var score = hasBrandSignal ? 20 : 8;
    if (inHeader) score += 8;
    if (tag === 'img') score += 6;
    if (tag === 'svg') score += 2;
    if (reference && /logo|wordmark|brand|identity|mark|favicon|icon/i.test(reference)) score += 8;
    if (reference) {
      var resolved = resolveProjectPath('', reference);
      if (resolved && files[resolved]) score += 4;
    }
    var width = Number(element.getAttribute('width'));
    if (Number.isFinite(width) && width > 0 && width <= 180) score += 4;
    if (Number.isFinite(width) && width > 240) score -= 10;
    if (/\b(?:avatar|profile|headshot|customer|product|hero|banner|cover|gallery|thumbnail|portrait|background)\b/i.test(desc)) score -= 14;
    if (/^data:image\//i.test(reference)) score += 2;
    return score;
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
  function listBrandCandidates(pagePath, html, files, project, primary) {
    if (!/<head\b/i.test(html) || !/<body\b/i.test(html)) return [];
    var doc;
    try { doc = new DOMParser().parseFromString(html, 'text/html'); } catch (_) { return []; }
    var candidates = Array.prototype.slice.call(doc.querySelectorAll(
      'img, header svg, nav svg, [role="banner"] svg, [class*="logo" i] svg, [id*="logo" i] svg, [class*="brand" i] img, [id*="brand" i] img, [class*="mark" i] svg, [id*="mark" i] svg'
    )).map(function (element) {
      var score = elementScore(element, files);
      if (score <= 0) return null;
      var tag = String(element.tagName || '').toLowerCase();
      var reference = tag === 'img' ? clean(element.getAttribute('src') || element.getAttribute('data-src')) : '';
      var href = reference ? imageHref(pagePath, reference, files) : '';
      var asset = !href && reference ? matchingProjectAsset(project, reference) : null;
      if (!href && !asset && tag === 'svg') href = svgHref(element);
      if (!href && !asset) return null;
      if (primary) score += 2;
      return { score: score, href: href, asset: asset, pagePath: pagePath };
    }).filter(Boolean);
    return candidates;
  }
  function rankedProjectLogoAssets(project) {
    return projectAssets(project).map(function (asset) {
      var name = assetName(asset);
      if (!name || isPlatformLogo(name)) return null;
      var type = clean(asset.type || asset.contentType || asset.mimeType).toLowerCase();
      if (!/^image\//.test(type) && !/\.(?:svg|png|jpe?g|webp|gif|ico|avif)$/i.test(name)) return null;
      if (!/(?:logo|wordmark|brand|identity|favicon|site[-_. ]?icon|monogram|emblem|(?:^|[-_. ])mark(?:[-_. ]|$))/i.test(name)) return null;
      var score = 20;
      if (/logo/i.test(name)) score += 8;
      if (/favicon|site[-_. ]?icon/i.test(name)) score += 5;
      if (/\.svg$/i.test(name)) score += 6;
      else if (/\.png$/i.test(name)) score += 4;
      else if (/\.(?:webp|ico)$/i.test(name)) score += 3;
      if (/\b(?:old|backup|draft|placeholder|sample|avatar|profile|hero|banner|cover|thumbnail|product)\b/i.test(name)) score -= 18;
      return { asset: asset, score: score };
    }).filter(function (item) { return item && item.score > 0; }).sort(function (a, b) { return b.score - a.score; });
  }
  async function resolveAssetHref(asset) {
    if (!asset) return '';
    var direct = clean(asset.downloadUrl || asset.publicUrl || asset.publicURL || asset.url || asset.href || asset.dataUrl);
    if (/^data:image\//i.test(direct) || /^https?:\/\//i.test(direct)) return direct;
    if (typeof window.OVYXAssetStore?.url === 'function' && asset.storagePath) {
      try {
        var resolved = clean(await window.OVYXAssetStore.url(asset));
        if (/^https?:\/\//i.test(resolved)) return resolved;
      } catch (_) {
        // A signed asset URL can become available once auth and the asset layer finish booting.
      }
    }
    return '';
  }
  async function findBrandHref(graph, project, paths, first) {
    var files = graph.files || {};
    var candidates = [];
    paths.forEach(function (path) {
      var list = listBrandCandidates(path, sourceOf(files[path]), files, project, path === first);
      candidates = candidates.concat(list);
    });
    candidates.sort(function (a, b) { return b.score - a.score; });
    for (var i = 0; i < candidates.length; i += 1) {
      if (candidates[i].href) return candidates[i].href;
      var resolved = await resolveAssetHref(candidates[i].asset);
      if (resolved) return resolved;
    }

    // Uploaded project assets are stored separately from the source-file graph.
    // Use an explicitly logo/brand/icon-named project image when page markup
    // references it indirectly or the HTML has not finished hydrating yet.
    var assetCandidates = rankedProjectLogoAssets(project);
    for (var j = 0; j < assetCandidates.length; j += 1) {
      var assetHref = await resolveAssetHref(assetCandidates[j].asset);
      if (assetHref) return assetHref;
    }
    return null;
  }
  function readAttribute(tag, name) {
    var match = tag.match(new RegExp("\\b" + name + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))", "i"));
    return match ? (match[1] != null ? match[1] : match[2] != null ? match[2] : match[3] || '') : '';
  }
  function setHref(tag, href) {
    var escaped = String(href).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    if (/\bhref\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i.test(tag)) {
      return tag.replace(/\bhref\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i, 'href="' + escaped + '"');
    }
    return tag.replace(/\s*\/?>$/, function (close) { return ' href="' + escaped + '"' + close; });
  }
  function patchFavicon(html, href) {
    if (!href || !/<head\b/i.test(html)) return html;
    var found = false;
    var next = html.replace(/<link\b[^>]*>/gi, function (tag) {
      var rel = readAttribute(tag, 'rel').toLowerCase().split(/\s+/);
      if (rel.indexOf('icon') < 0) return tag;
      found = true;
      return setHref(tag, href);
    });
    if (found) return next;
    return next.replace(/<head\b[^>]*>/i, function (tag) {
      return tag + '<link rel="icon" href="' + String(href).replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '">';
    });
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
  function activeContext() {
    var studio = window.WebStudio && typeof window.WebStudio === 'object' ? window.WebStudio : null;
    var project = window.KernelState && (window.KernelState.activeProject || window.KernelState.project) || studio && studio.project;
    if (!project || !studio) return null;
    if (typeof studio.ensureProjectGraph === 'function') {
      try { studio.ensureProjectGraph(); } catch (_) {}
    }
    var studioGraph = studio.graph && studio.graph.files ? studio.graph : null;
    var projectGraph = project.ovyxGraph && project.ovyxGraph.files ? project.ovyxGraph : null;
    var graph = studioGraph && Object.keys(studioGraph.files).length ? studioGraph :
      projectGraph && Object.keys(projectGraph.files).length ? projectGraph : studioGraph || projectGraph;
    if (!graph || !graph.files || typeof graph.files !== 'object') return null;
    return { studio: studio, project: project, graph: graph, projectId: clean(project.id) };
  }
  function patchProjectGraph(context, href, paths) {
    var graph = context.graph;
    var files = graph.files;
    var changed = [];
    paths.forEach(function (path) {
      var before = sourceOf(files[path]);
      var after = patchFavicon(before, href);
      if (after !== before) { updateContent(files, path, after); changed.push(path); }
    });
    if (!changed.length) return false;
    graph.updatedAt = Date.now();
    context.studio.graph = graph;
    context.project.ovyxGraph = graph;
    if (typeof context.studio.syncGraphToProject === 'function') context.studio.syncGraphToProject();
    if (window.ProjectStore && typeof window.ProjectStore.save === 'function') window.ProjectStore.save();
    if (document.body && document.body.classList.contains('ovyx-webstudio-active') && typeof context.studio.renderPreview === 'function') {
      context.studio.renderPreview();
    }
    return true;
  }
  async function applyProjectBranding() {
    if (busy || resolving) return false;
    var context = activeContext();
    if (!context) return false;
    var paths = fileList(context.graph);
    if (!paths.length) return false;
    var first = primaryPath(context.graph, context.project, paths);
    var ordered = first ? [first].concat(paths.filter(function (path) { return path !== first; })) : paths.slice();
    resolving = true;
    try {
      var href = await findBrandHref(context.graph, context.project, ordered, first);
      if (!href) return false;
      var current = activeContext();
      if (!current || current.projectId !== context.projectId || current.graph !== context.graph) return false;
      busy = true;
      try {
        return patchProjectGraph(context, href, paths) || true;
      } catch (_) {
        // Never interrupt editing/preview if saving the optional favicon correction fails.
        return false;
      } finally {
        busy = false;
      }
    } finally {
      resolving = false;
    }
  }
  function retryBoot() {
    attempts = 0;
    schedule();
    window.setTimeout(boot, 160);
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    window.setTimeout(function () {
      scheduled = false;
      applyProjectBranding().then(function (done) {
        if (!done && attempts < 60) window.setTimeout(boot, 180);
      }).catch(function () {
        if (attempts < 60) window.setTimeout(boot, 180);
      });
    }, 80);
  }
  function boot() {
    if (attempts >= 60) return;
    attempts += 1;
    applyProjectBranding().then(function (done) {
      if (!done && attempts < 60) window.setTimeout(boot, 200);
    }).catch(function () {
      if (attempts < 60) window.setTimeout(boot, 200);
    });
  }

  boot();
  ['ovyx:view-changed', 'ovyx:project-activated', 'ovyx:project-loaded', 'ovyx:project-saved',
    'ovyx:webstudio-initial-site-built', 'ovyx:webstudio-quality-report'].forEach(function (eventName) {
    window.addEventListener(eventName, retryBoot);
  });
})();