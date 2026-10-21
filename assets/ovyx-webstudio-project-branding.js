(function () {
  'use strict';

  if (window.__OVYX_WS_PROJECT_BRANDING_V6__) return;
  window.__OVYX_WS_PROJECT_BRANDING_V7__ = true;

  var busy = false;
  var resolving = false;
  var scheduled = false;
  var attempts = 0;
  var uploadedAssetCache = Object.create(null);
  var tabFaviconState = null;

  function restoreTabFavicon() {
    var saved = tabFaviconState;
    if (!saved) return;
    saved.links.forEach(function (item) {
      if (!item.element) return;
      if (item.href === null) item.element.removeAttribute('href');
      else item.element.setAttribute('href', item.href);
    });
    if (saved.createdLink && saved.createdLink.parentNode) {
      saved.createdLink.parentNode.removeChild(saved.createdLink);
    }
    tabFaviconState = null;
  }

  function syncTabFavicon(href, projectId) {
    var body = document.body;
    var head = document.head;
    if (!href || !projectId || !body || !head ||
        !body.classList.contains('ovyx-webstudio-active')) {
      restoreTabFavicon();
      return;
    }

    if (tabFaviconState && tabFaviconState.projectId !== projectId) {
      restoreTabFavicon();
    }

    if (!tabFaviconState) {
      var icons = Array.prototype.slice.call(document.querySelectorAll('link[rel~="icon"]'));
      var createdLink = null;
      if (!icons.length) {
        createdLink = document.createElement('link');
        createdLink.rel = 'icon';
        createdLink.setAttribute('data-ovyx-project-favicon', 'true');
        head.appendChild(createdLink);
      }
      tabFaviconState = {
        projectId: projectId,
        links: icons.map(function (element) {
          return { element: element, href: element.getAttribute('href') };
        }),
        createdLink: createdLink
      };
    }

    if (tabFaviconState.createdLink) {
      tabFaviconState.createdLink.setAttribute('href', href);
    }
    tabFaviconState.links.forEach(function (item) {
      item.element.setAttribute('href', href);
    });
  }

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
  function projectAssets(project, supplemental) {
    var rows = [];
    [project && project.assets, supplemental].forEach(function (group) {
      if (!Array.isArray(group)) return;
      group.forEach(function (asset) {
        if (!asset || typeof asset !== 'object') return;
        var key = clean(asset.assetId || asset.id || asset.storagePath || asset.path || asset.name || asset.originalName);
        var index = key ? rows.findIndex(function (item) {
          return clean(item.assetId || item.id || item.storagePath || item.path || item.name || item.originalName) === key;
        }) : -1;
        if (index >= 0) rows[index] = Object.assign({}, rows[index], asset);
        else rows.push(Object.assign({}, asset));
      });
    });
    return rows;
  }
  async function loadProjectAssets(project) {
    var local = projectAssets(project);
    var projectId = clean(project && project.id);
    if (!projectId || typeof window.OVYXAssetStore?.list !== 'function') return local;
    var cached = uploadedAssetCache[projectId];
    if (!cached) {
      cached = Promise.resolve().then(function () {
        return window.OVYXAssetStore.list(projectId);
      }).then(function (remote) {
        return projectAssets(project, Array.isArray(remote) ? remote : []);
      }).catch(function () { return local; });
      uploadedAssetCache[projectId] = cached;
    }
    try { return projectAssets(project, await cached); } catch (_) { return local; }
  }
  function assetMatchesReference(asset, reference) {
    if (!asset || isPlatformLogo(assetName(asset)) || isPlatformLogo(reference)) return false;
    var wanted = assetBasename(reference);
    if (!wanted) return false;
    var names = [asset.name, asset.originalName, asset.filename, asset.fileName, asset.path, asset.storagePath];
    return names.some(function (name) { return name && assetBasename(name) === wanted; });
  }
  function matchingProjectAsset(project, reference, supplemental) {
    return projectAssets(project, supplemental).find(function (asset) {
      return assetMatchesReference(asset, reference);
    }) || null;
  }
  function graphAssetPath(fromPath, reference, files) {
    var value = clean(reference).split(/[?#]/)[0].replace(/\\/g, '/');
    if (!value || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(value)) return '';
    var candidates = [];
    function add(path) {
      path = normalizePath(path);
      if (path && candidates.indexOf(path) < 0) candidates.push(path);
    }
    var resolved = resolveProjectPath(fromPath, value);
    add(resolved);
    if (value.charAt(0) === '/') add('public/' + value);
    if (resolved) add('public/' + resolved);
    if (/^(?:@|~)\//.test(value)) {
      var aliasPath = value.slice(2);
      add(aliasPath);
      add('src/' + aliasPath);
      add('src/assets/' + aliasPath.replace(/^assets\//, ''));
      add('public/' + aliasPath);
    }
    for (var i = 0; i < candidates.length; i += 1) {
      if (Object.prototype.hasOwnProperty.call(files || {}, candidates[i])) return candidates[i];
    }
    return resolved;
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
    var resolved = graphAssetPath(fromPath, value, files);
    if (!resolved) return '';
    var asset = files[resolved];
    if (!asset) return '';
    var assetText = sourceOf(asset);
    if (/^data:image\//i.test(assetText)) return assetText;
    if (/<svg\b/i.test(assetText)) {
      var data = svgDataUrl(assetText);
      if (data) return data;
    }
    if (/\.(?:svg|png|jpe?g|webp|gif|ico|avif)(?:[?#]|$)/i.test(value)) {
      return '/' + resolved.replace(/^public\//, '');
    }
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
    var parts = [];
    var node = element;
    var depth = 0;
    while (node && depth < 4 && node.nodeType === 1) {
      parts.push(
        node.getAttribute('alt'), node.getAttribute('title'),
        node.getAttribute('aria-label'), node.getAttribute('class'),
        node.getAttribute('id'), node.getAttribute('src'),
        node.getAttribute('data-src'), node.getAttribute('data-testid'),
        node.getAttribute('data-brand')
      );
      node = node.parentElement;
      depth += 1;
    }
    return parts.map(clean).join(' ').toLowerCase();
  }
  function elementScore(element, files) {
    var desc = elementDescription(element);
    var tag = String(element.tagName || '').toLowerCase();
    var reference = tag === 'img' ? clean(element.getAttribute('src') || element.getAttribute('data-src')) : '';
    if (isPlatformLogo(reference) || /ovyx-(?:brand-mark|brand-lockup|logo|notification-icon|boot-logo)/i.test(desc)) return -100;
    var hasBrandSignal = /logo|wordmark|brand|identity|site[\s_.-]?mark|brand[\s_.-]?mark|favicon|monogram|emblem|symbol/i.test(desc);
    var inHeader = !!(element.closest && element.closest('header, nav, [role="banner"]'));
    if (!hasBrandSignal && !((tag === 'img' || tag === 'svg') && inHeader)) return -100;

    var score = hasBrandSignal ? 20 : 8;
    if (inHeader) score += 8;
    if (tag === 'img') score += 6;
    if (tag === 'svg') score += 4;
    if (reference && /logo|wordmark|brand|identity|mark|favicon|icon/i.test(reference)) score += 8;
    if (reference) {
      var resolved = graphAssetPath('', reference, files);
      if (resolved && files[resolved]) score += 4;
    }
    var width = Number(element.getAttribute('width'));
    if (Number.isFinite(width) && width > 0 && width <= 18) score -= 6;
    else if (Number.isFinite(width) && width >= 28 && width <= 180) score += 6;
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
  function listBrandCandidates(pagePath, html, files, project, primary, supplementalAssets) {
    if (!/<head\b/i.test(html) || !/<body\b/i.test(html)) return [];
    var doc;
    try { doc = new DOMParser().parseFromString(html, 'text/html'); } catch (_) { return []; }
    var candidates = Array.prototype.slice.call(doc.querySelectorAll('img, svg')).map(function (element) {
      var score = elementScore(element, files);
      if (score <= 0) return null;
      var tag = String(element.tagName || '').toLowerCase();
      var reference = tag === 'img' ? clean(element.getAttribute('src') || element.getAttribute('data-src')) : '';
      var href = reference ? imageHref(pagePath, reference, files) : '';
      var asset = !href && reference ? matchingProjectAsset(project, reference, supplementalAssets) : null;
      if (!href && !asset && tag === 'svg') href = svgHref(element);
      if (!href && !asset) return null;
      if (primary) score += 2;
      return { score: score, href: href, asset: asset, pagePath: pagePath };
    }).filter(Boolean);
    return candidates;
  }
  function sourceLogoCandidates(graph, project, supplementalAssets) {
    var files = graph && graph.files || {};
    var candidates = [];
    var sourcePattern = /\.(?:[cm]?[jt]sx?|vue|svelte)$/i;
    var assetPattern = /["']([^"'\s]+\.(?:svg|png|jpe?g|webp|gif|ico|avif)(?:\?[^"'\s]*)?)["']/gi;
    Object.keys(files).filter(function (path) { return sourcePattern.test(path); }).forEach(function (path) {
      var text = sourceOf(files[path]);
      if (!text || text.length > 900000) return;
      var match;
      assetPattern.lastIndex = 0;
      while ((match = assetPattern.exec(text)) !== null) {
        var reference = clean(match[1]);
        if (!reference || isPlatformLogo(reference)) continue;
        var context = text.slice(Math.max(0, match.index - 180), Math.min(text.length, assetPattern.lastIndex + 180));
        var brandSignal = /logo|wordmark|brand|identity|favicon|monogram|emblem|(?:^|[-_.\s])mark(?:[-_.\s]|$)|site[-_.\s]?icon/i.test(reference + ' ' + context);
        if (!brandSignal) continue;
        var href = imageHref(path, reference, files);
        var asset = !href ? matchingProjectAsset(project, reference, supplementalAssets) : null;
        if (!href && !asset) continue;
        var score = 24;
        if (/logo|wordmark|brand|identity/i.test(reference)) score += 14;
        if (/\.svg(?:[?#]|$)/i.test(reference)) score += 6;
        if (/import\s+[^;\n]{0,100}\b(?:logo|brand|mark|identity)/i.test(context)) score += 8;
        candidates.push({ score: score, href: href, asset: asset, pagePath: path });
      }
    });
    return candidates;
  }
  function projectLogoReferences(project) {
    var brand = project && project.brand && typeof project.brand === 'object' ? project.brand : {};
    return [
      project && project.logo,
      project && project.logoUrl,
      project && project.brandLogo,
      project && project.logoAsset,
      project && project.websiteLogo,
      project && project.siteLogo,
      brand.logo,
      brand.logoUrl
    ].map(clean).filter(function (reference) {
      return !!reference && !isPlatformLogo(reference);
    });
  }
  function rankedProjectLogoAssets(project, supplementalAssets) {
    return projectAssets(project, supplementalAssets).map(function (asset) {
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
  function backgroundImageReference(value) {
    var match = String(value || '').match(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/i);
    if (!match) return '';
    var reference = clean(match[1] != null ? match[1] : match[2] != null ? match[2] : match[3]).replace(/^['"]|['"]$/g, '');
    if (!reference || /^(?:blob:|javascript:)/i.test(reference)) return '';
    return reference;
  }
  function elementBrandDescription(element) {
    if (!element || element.nodeType !== 1) return '';
    return [
      element.tagName, element.getAttribute('alt'), element.getAttribute('title'),
      element.getAttribute('aria-label'), element.getAttribute('class'),
      element.getAttribute('id'), element.getAttribute('data-testid'),
      element.getAttribute('data-brand')
    ].map(clean).join(' ').toLowerCase();
  }
  function renderedCssBrandCandidates(doc, first, files) {
    var candidates = [];
    if (!doc || !doc.querySelectorAll || !doc.defaultView ||
        typeof doc.defaultView.getComputedStyle !== 'function') return candidates;

    // Include inline-style nodes too. Brand-named nodes are preferred; an
    // otherwise unnamed element qualifies only when it is a small mark inside
    // a semantic header/nav/banner, which avoids mistaking hero backgrounds
    // for a site logo.
    var selector = '[class], [id], [alt], [title], [aria-label], [data-testid], [data-brand], [style]';
    Array.prototype.slice.call(doc.querySelectorAll(selector)).forEach(function (element) {
      var description = elementBrandDescription(element);
      var hasBrandSignal = /(?:logo|wordmark|brand|identity|site[\s_.-]?mark|favicon|monogram|emblem|symbol)/i.test(description);
      var inBrandRegion = !!(element.closest && element.closest('header, nav, [role="banner"]'));
      if (!hasBrandSignal && !inBrandRegion) return;

      var stylePairs = [];
      try {
        stylePairs.push({ style: doc.defaultView.getComputedStyle(element), pseudo: false });
        stylePairs.push({ style: doc.defaultView.getComputedStyle(element, '::before'), pseudo: true });
        stylePairs.push({ style: doc.defaultView.getComputedStyle(element, '::after'), pseudo: true });
      } catch (_) { return; }

      stylePairs.forEach(function (pair) {
        var style = pair.style;
        if (!style) return;
        var reference = backgroundImageReference(style.backgroundImage) ||
          backgroundImageReference(style.content);
        if (!reference) return;
        var href = imageHref(first || '', reference, files);
        if (!href) return;

        var width = parseFloat(style.width);
        var height = parseFloat(style.height);
        if (!hasBrandSignal && (!inBrandRegion || !Number.isFinite(width) || !Number.isFinite(height) ||
            width <= 0 || height <= 0 || width > 360 || height > 180)) return;
        var score = hasBrandSignal ? 155 : 68;
        if (/\b(?:logo|wordmark|brand|identity|favicon|monogram|emblem|symbol)\b/i.test(description)) score += 12;
        if (Number.isFinite(width) && width > 500) score -= 60;
        if (Number.isFinite(height) && height > 220) score -= 60;
        if (pair.pseudo) score += 2;
        candidates.push({
          score: score,
          href: href,
          asset: null,
          pagePath: first || '',
          fromLivePreview: true,
          fromCssBackground: true
        });
      });
    });
    return candidates;
  }
  function renderedPreviewIconCandidates(doc, first, files) {
    var candidates = [];
    if (!doc || !doc.querySelectorAll) return candidates;
    Array.prototype.slice.call(doc.querySelectorAll('link[rel]')).forEach(function (link) {
      var rel = clean(link.getAttribute('rel')).toLowerCase().split(/\s+/);
      if (rel.indexOf('icon') < 0) return;
      var reference = clean(link.getAttribute('href'));
      if (!reference || isPlatformLogo(reference)) return;

      // A declared icon in the running site is a stronger signal than guessing
      // from its full-size wordmark; use the project graph for local assets.
      var href = imageHref(first || '', reference, files);
      if (!href && /^data:image\//i.test(reference)) href = reference;
      if (!href && /^https?:\/\//i.test(reference)) href = reference;
      if (!href) return;
      candidates.push({
        score: 240,
        href: href,
        asset: null,
        pagePath: first || '',
        fromLivePreview: true,
        fromExplicitPreviewIcon: true
      });
    });
    return candidates;
  }
  function livePreviewBrandCandidates(graph, project, first, supplementalAssets) {
    var files = graph && graph.files || {};
    var candidates = [];
    // The live preview is the strongest evidence of which logo the project
    // actually renders. A logo may be injected at runtime or composed by a
    // framework component and therefore be missing from its saved HTML shell.
    ['ws-canvas-iframe', 'ws-mobile-preview-frame'].forEach(function (id) {
      var frame = document.getElementById(id);
      var doc = null;
      try { doc = frame && frame.contentDocument; } catch (_) { doc = null; }
      if (!doc || !doc.documentElement) return;
      try {
        var rendered = doc.documentElement.outerHTML;
        if (!rendered || !/<head\b/i.test(rendered) || !/<body\b/i.test(rendered)) return;
        var found = renderedPreviewIconCandidates(doc, first || '', files);
        found = found.concat(listBrandCandidates(first || '', rendered, files, project, true, supplementalAssets));
        found = found.concat(renderedCssBrandCandidates(doc, first || '', files));
        found.forEach(function (candidate) {
          // Prefer the real, rendered site mark over a fallback asset or a
          // stale favicon reference embedded in source HTML.
          candidate.score += 80;
          candidate.fromLivePreview = true;
          candidates.push(candidate);
        });
      } catch (_) {
        // A cross-origin or not-yet-loaded preview is optional evidence.
      }
    });
    return candidates.sort(function (a, b) { return b.score - a.score; });
  }

  async function findBrandHref(graph, project, paths, first) {
    var files = graph.files || {};
    var supplementalAssets = await loadProjectAssets(project);

    // First inspect the currently rendered preview. This makes the favicon
    // follow the visible logo even when a site is component-based, has a
    // runtime-rendered header, or stores its markup outside index.html.
    var liveCandidates = livePreviewBrandCandidates(graph, project, first, supplementalAssets);
    for (var liveIndex = 0; liveIndex < liveCandidates.length; liveIndex += 1) {
      if (liveCandidates[liveIndex].href) return liveCandidates[liveIndex].href;
      var liveAssetHref = await resolveAssetHref(liveCandidates[liveIndex].asset);
      if (liveAssetHref) return liveAssetHref;
    }

    var candidates = [];
    paths.forEach(function (path) {
      var list = listBrandCandidates(path, sourceOf(files[path]), files, project, path === first, supplementalAssets);
      candidates = candidates.concat(list);
    });
    candidates.sort(function (a, b) { return b.score - a.score; });
    for (var i = 0; i < candidates.length; i += 1) {
      if (candidates[i].href) return candidates[i].href;
      var resolved = await resolveAssetHref(candidates[i].asset);
      if (resolved) return resolved;
    }

    // Framework-based websites frequently hold their visible logo reference
    // in a React/Vue/Svelte component instead of the HTML shell.
    var codeCandidates = sourceLogoCandidates(graph, project, supplementalAssets);
    codeCandidates.sort(function (a, b) { return b.score - a.score; });
    for (var codeIndex = 0; codeIndex < codeCandidates.length; codeIndex += 1) {
      if (codeCandidates[codeIndex].href) return codeCandidates[codeIndex].href;
      var codeAssetHref = await resolveAssetHref(codeCandidates[codeIndex].asset);
      if (codeAssetHref) return codeAssetHref;
    }

    var projectReferences = projectLogoReferences(project);
    for (var refIndex = 0; refIndex < projectReferences.length; refIndex += 1) {
      var ref = projectReferences[refIndex];
      var directHref = imageHref(first || '', ref, files);
      if (directHref) return directHref;
      var refAsset = matchingProjectAsset(project, ref, supplementalAssets);
      var refHref = await resolveAssetHref(refAsset);
      if (refHref) return refHref;
    }

    // Project asset records may be available from server storage even when
    // older project state does not yet have them copied into project.assets.
    var assetCandidates = rankedProjectLogoAssets(project, supplementalAssets);
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
    if (!context) { restoreTabFavicon(); return false; }
    var paths = fileList(context.graph);
    if (!paths.length) { restoreTabFavicon(); return false; }
    var first = primaryPath(context.graph, context.project, paths);
    var ordered = first ? [first].concat(paths.filter(function (path) { return path !== first; })) : paths.slice();
    resolving = true;
    try {
      var href = await findBrandHref(context.graph, context.project, ordered, first);
      if (!href) { restoreTabFavicon(); return false; }
      var current = activeContext();
      if (!current || current.projectId !== context.projectId || current.graph !== context.graph) return false;
      if (document.body && document.body.classList.contains('ovyx-webstudio-active')) {
        syncTabFavicon(href, current.projectId);
      } else {
        restoreTabFavicon();
      }
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
    var projectId = clean(window.KernelState?.activeProject?.id);
    if (projectId) delete uploadedAssetCache[projectId];
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
    'ovyx:preview-updated', 'ovyx:webstudio-initial-site-built', 'ovyx:webstudio-quality-report',
    'firebase-auth-state-ready', 'ovyx-auth-state-ready'].forEach(function (eventName) {
    window.addEventListener(eventName, retryBoot);
  });
})();