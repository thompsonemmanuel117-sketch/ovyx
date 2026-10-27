(function () {
  'use strict';
  if (window.__OVYX_WEBSTUDIO_QUALITY_V1__) return;
  window.__OVYX_WEBSTUDIO_QUALITY_V1__ = true;

  var STYLE_ID = 'ovyx-ws-quality-style-v1';
  var ROOT_ID = 'ovyx-ws-quality-root';
  var WIDTHS = [320, 390, 768, 1024, 1440];
  var CORE_BROWSER_ROUTE_COUNT = 3;
  var ADDITIONAL_ROUTE_WIDTHS = [390, 1440];
  var MAX_SAFE_CONTROLS_PER_ROUTE = 8;
  var FRAME_TIMEOUT_MS = 1400;
  var root = null;
  var studioRef = null;
  var currentReport = null;
  var running = false;
  var buildDepth = 0;
  var buildInFlight = false;
  var deferredPreviewRefresh = false;
  var qualityGateActive = false;
  var lastBuildStage = { stage: 'ready', status: 'idle', message: 'Ready to review', at: Date.now() };
  var lastFocused = null;
  var stageRows = [
    { id: 'source', label: 'Existing source tests', status: 'pending', detail: 'Waiting to review website files.' },
    { id: 'audit', label: 'Pages, navigation and accessibility', status: 'pending', detail: 'Waiting to review website files.' },
    { id: 'browser', label: 'Desktop and mobile checks', status: 'pending', detail: 'Waiting to review the website preview.' },
    { id: 'truth', label: 'Integration and result reporting', status: 'pending', detail: 'Waiting to summarize the review results.' }
  ];

  function text(value) { return String(value == null ? '' : value); }
  function trim(value, max) { return text(value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max || 300); }
  function clone(value) { try { return JSON.parse(JSON.stringify(value)); } catch (_) { return value == null ? null : value; } }
  function dispatch(name, detail) {
    try { window.dispatchEvent(new CustomEvent(name, { detail: detail || {} })); } catch (_) {}
  }
  function toast(message, kind) {
    try { if (typeof window.showToast === 'function') window.showToast(text(message), kind || 'info'); } catch (_) {}
  }
  function getStudio() { return window.WebStudio && typeof window.WebStudio === 'object' ? window.WebStudio : null; }
  function isActive() {
    var view = document.getElementById('view-webstudio');
    return !!(view && !view.classList.contains('hidden') && view.getAttribute('aria-hidden') !== 'true');
  }
  function fileText(value) {
    if (typeof value === 'string') return value;
    if (!value || typeof value !== 'object') return '';
    return text(value.content != null ? value.content : value.text != null ? value.text : value.source != null ? value.source : value.code);
  }
  function normalizePath(path) {
    var parts = text(path).replace(/\\/g, '/').replace(/^\/+/, '').split('/');
    var clean = [];
    for (var i = 0; i < parts.length; i += 1) {
      if (!parts[i] || parts[i] === '.') continue;
      if (parts[i] === '..') {
        if (!clean.length) return '';
        clean.pop();
      } else clean.push(parts[i]);
    }
    return clean.join('/').slice(0, 500);
  }
  function resolveFile(fromPath, reference) {
    var value = text(reference).trim();
    if (!value || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(value)) return '';
    value = value.split('#')[0].split('?')[0];
    if (!value) return '';
    var base = value.charAt(0) === '/' ? '' : text(fromPath).replace(/\\/g, '/').split('/').slice(0, -1).join('/') + '/';
    return normalizePath(base + value);
  }
  function slug(value) {
    return text(value).toLowerCase().replace(/\.html?$/i, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  function routeForPath(path, project) {
    var file = normalizePath(path);
    var pages = Array.isArray(project && project.pages) ? project.pages : [];
    var page = pages.find(function (item) {
      return item && [item.__ovyxFile, item.path, item.file].some(function (candidate) {
        return candidate && normalizePath(candidate) === file;
      });
    });
    if (page) {
      var explicit = text(page.route || page.url || page.href).trim();
      if (explicit.charAt(0) === '/' && !/^\/\//.test(explicit)) return normalizeRoute(explicit);
      var named = slug(page.slug || page.name || page.title);
      if (!named || /^home(?:page)?$/.test(named) || /^index$/.test(named)) return '/';
      return '/' + named + '/';
    }
    var lower = file.toLowerCase();
    if (/^(?:src\/)?pages\/.+\.html?$/.test(lower)) {
      var namedFile = file.split('/').pop().replace(/\.html?$/i, '');
      var namedSlug = slug(namedFile);
      return !namedSlug || /^home(?:page)?$/.test(namedSlug) || namedSlug === 'index' ? '/' : '/' + namedSlug + '/';
    }
    if (/^index\.html?$/i.test(file)) return '/';
    if (/\/index\.html?$/i.test(file)) return normalizeRoute('/' + file.replace(/\/index\.html?$/i, '') + '/');
    if (/\.html?$/i.test(file)) return '/' + file;
    return '/' + slug(file) + '/';
  }
  function normalizeRoute(path) {
    var value = text(path).replace(/\/{2,}/g, '/');
    if (!value) return '/';
    if (value.charAt(0) !== '/') value = '/' + value;
    if (/\.[a-z0-9]{1,8}$/i.test(value)) return value;
    return value.length > 1 ? value.replace(/\/+$/, '') + '/' : '/';
  }
  function getGraph(studio) {
    try { studio.ensureProjectGraph(); } catch (_) {}
    return studio.graph || (window.KernelState && window.KernelState.activeProject && window.KernelState.activeProject.ovyxGraph) || { files: {} };
  }
  function collectPages(studio, files) {
    var pages = Object.keys(files || {}).map(function (path) {
      return { path: normalizePath(path), content: fileText(files[path]), route: '' };
    }).filter(function (item) { return item.path && /\.html?$/i.test(item.path) && item.content.trim().length > 80; });
    var project = window.KernelState && window.KernelState.activeProject || {};
    var seen = new Set(pages.map(function (item) { return item.path; }));
    if (!pages.length && typeof studio.pageToHtml === 'function') {
      (Array.isArray(project.pages) ? project.pages : []).slice(0, 60).forEach(function (page, index) {
        if (!page || !Array.isArray(page.sections) || !page.sections.length) return;
        var pagePath = normalizePath(page.__ovyxFile || page.path || ('src/pages/' + (slug(page.name) || ('page-' + (index + 1))) + '.html'));
        if (!pagePath || seen.has(pagePath)) return;
        try {
          var html = studio.pageToHtml(page);
          if (typeof html === 'string' && html.trim().length > 80) {
            pages.push({ path: pagePath, content: html, route: text(page.route || '') });
            seen.add(pagePath);
          }
        } catch (_) {}
      });
    }
    pages.forEach(function (item) { item.route = routeForPath(item.path, project); });
    return pages.sort(function (a, b) {
      if (a.route === '/') return -1;
      if (b.route === '/') return 1;
      return a.path.localeCompare(b.path);
    });
  }
  function recommendationForFinding(item) {
    var title = text(item && item.title).toLowerCase();
    var group = text(item && item.group).toLowerCase();
    var status = text(item && item.status).toLowerCase();
    if (status === 'pass') return 'No corrective change is indicated; this check passed within the tested scope.';
    if (status === 'info' && title.indexOf('integration') < 0 && title.indexOf('coverage') < 0 && title.indexOf('interactive controls') < 0 && title.indexOf('live form') < 0) {
      return 'Informational result, not a confirmed defect. Review the stated limitation only if it affects the requested website workflow.';
    }

    if (title.indexOf('page metadata and landmarks') >= 0 || title.indexOf('generated website files') >= 0) {
      return 'Update only the affected page files: add the missing document metadata or main landmark identified above, keep each page title descriptive, and preserve the existing route and page content.';
    }
    if (title.indexOf('accessible controls and imagery') >= 0) {
      return 'Fix the exact elements named in the findings: provide meaningful image alt text, unique IDs, valid ARIA references, associated form labels, and accessible names for controls and links. Keep existing behavior intact.';
    }
    if (title.indexOf('internal links and anchors') >= 0) {
      return 'Replace each placeholder or broken destination with the intended generated route or an existing section ID. Preserve the visitor journey and verify every affected link after the edit.';
    }
    if (title.indexOf('stylesheet structure') >= 0) {
      return 'Correct the reported CSS syntax or unbalanced braces in the named stylesheet only, then re-check the affected page styles at mobile and desktop widths.';
    }
    if (title.indexOf('fixed-width layout rules') >= 0 || title.indexOf('horizontal overflow') >= 0) {
      return 'Inspect the specific overflowing element and its parent layout. Use fluid sizing, min-width: 0, max-width: 100%, responsive grid/flex rules, and safe text wrapping where appropriate. Do not hide overflow globally as a cosmetic workaround; re-test the affected route at 320px, 390px, tablet and desktop widths.';
    }
    if (title.indexOf('reduced-motion preference') >= 0) {
      return 'Respect prefers-reduced-motion for non-essential animation and transitions while keeping all content and controls available when motion is reduced.';
    }
    if (title.indexOf('local asset references') >= 0 || title.indexOf('external asset reachability') >= 0) {
      return 'Correct only the asset paths shown in the findings, confirm each local asset exists relative to the referencing file, and provide a deliberate visual fallback if a remote asset cannot load.';
    }
    if (title.indexOf('form delivery') >= 0 || title.indexOf('live form and transaction state') >= 0) {
      return 'Connect the form to the actual configured submission handler if one exists. Validate inputs, preserve entered values after errors, and show truthful pending, success or failure feedback. If no delivery service is configured, disclose that boundary rather than displaying a fake success.';
    }
    if (title.indexOf('client-side secret exposure') >= 0) {
      return 'Remove any real secret from browser-delivered files, rotate it if it was exposed, and move privileged access behind an authorized server-side integration. Do not replace the exposed value with another client-side secret.';
    }
    if (title.indexOf('safe interactive behavior smoke test') >= 0 || title.indexOf('interactive controls') >= 0) {
      return 'Use the reported control labels to identify the affected component, wire its intended action to a real state change or destination, and provide visible feedback. Do not automatically trigger payment, deletion, booking, account or submission actions during a smoke test.';
    }
    if (title.indexOf('rendered text contrast sample') >= 0) {
      return 'Adjust the reported text/background pair to meet the appropriate contrast target while preserving the brand palette where possible. Re-test the rendered color combination; do not rely on color alone to communicate state.';
    }
    if (title.indexOf('visible keyboard focus indicators') >= 0) {
      return 'Add a clearly visible :focus-visible treatment to the affected keyboard-operable controls, ensure it is not clipped or covered, and verify keyboard navigation through the primary journey.';
    }
    if (title.indexOf('page loading performance') >= 0) {
      return 'Use the report details to target the largest avoidable render costs first: right-size and compress oversized images, defer non-critical scripts, reduce unnecessary DOM work, and preserve above-the-fold content and core interactions. Treat sandbox timings as diagnostics, not production Core Web Vitals.';
    }
    if (title.indexOf('page runtime errors') >= 0 || title.indexOf('sandbox runtime and render completion') >= 0) {
      return 'Fix the first reproducible runtime error and its affected dependency or selector in the named page/script. Re-run the affected route and the responsive inspection; do not suppress the error without fixing its cause.';
    }
    if (title.indexOf('editorial copy and placeholder text') >= 0) {
      return 'Replace the detected template phrase with accurate, audience-specific copy. Proofread visible headings, paragraphs, labels and calls to action for natural wording, grammar and consistent terminology; do not invent business facts. Then review typography and text wrapping at mobile and desktop sizes.';
    }
    if (title.indexOf('page content presence') >= 0) {
      return 'Restore the missing meaningful page content or repair the rendering path for the named route. Keep the route, navigation and intended page purpose intact.';
    }
    if (title.indexOf('existing web studio source tests') >= 0 || group.indexOf('source validation') >= 0) {
      return 'Use the exact failing source-test output above to locate the responsible website file, fix the smallest relevant cause, and rerun the same test before accepting the repair.';
    }
    if (title.indexOf('live integration verification') >= 0 || title.indexOf('integration') >= 0) {
      return 'This result marks a verification boundary, not a confirmed defect. Test the real provider or service in an authorized safe environment before claiming the integration works; keep unconnected behavior clearly labelled.';
    }
    if (title.indexOf('post-build quality gate') >= 0 || title.indexOf('repair verification') >= 0) {
      return 'Review the remaining failing or warning findings above, address only the verified website files involved, then rerun the complete quality inspection. Keep the last known-good preview available until the re-check passes.';
    }
    if (title.indexOf('project stylesheets') >= 0) {
      return 'A separate stylesheet is optional. If styles are embedded intentionally, no change is required; otherwise move shared styles into a clearly referenced stylesheet only when it improves maintainability without breaking the site.';
    }
    if (title.indexOf('coverage') >= 0 || group.indexOf('coverage') >= 0) {
      return 'Use the reported coverage limits to decide what still needs manual review. Do not treat untested routes, controls or external integrations as passed.';
    }
    if (item && (item.status === 'fail' || item.status === 'warn')) {
      return 'Inspect the specific evidence above and the named file, make the smallest safe change that resolves the observed issue, preserve neighboring features, and rerun the relevant check.';
    }
    return 'No corrective change is indicated by this result. Keep the limitation in mind and verify the relevant behavior separately if it matters to the project.';
  }

  function addCheck(report, group, title, status, detail, file) {
    var normalized = ['pass', 'warn', 'fail', 'info'].indexOf(status) >= 0 ? status : 'info';
    report.checks.push({
      group: trim(group, 60),
      title: trim(title, 180),
      status: normalized,
      detail: trim(detail, 1200),
      file: trim(file, 240),
      recommendation: recommendationForFinding({ group: group, title: title, status: normalized, detail: detail, file: file })
    });
  }
  function statusForFindings(count, isCritical) {
    if (!count) return 'pass';
    return isCritical ? 'fail' : 'warn';
  }
  function hasAccessibleName(element) {
    if (text(element.getAttribute('aria-label')).trim()) return true;
    var labelled = text(element.getAttribute('aria-labelledby')).trim();
    if (labelled && labelled.split(/\s+/).every(function (id) { return !!element.ownerDocument.getElementById(id); })) return true;
    if (text(element.getAttribute('title')).trim()) return true;
    if (text(element.value).trim()) return true;
    return !!text(element.innerText || element.textContent).replace(/\s+/g, ' ').trim();
  }
  function hasLabel(element, doc) {
    if (text(element.getAttribute('aria-label')).trim() || text(element.getAttribute('aria-labelledby')).trim()) return true;
    if (element.id && doc.querySelector('label[for="' + CSS.escape(element.id) + '"]')) return true;
    return !!(element.closest && element.closest('label'));
  }
  function auditSources(report, pages, files, project) {
    var pageRoutes = new Set(pages.map(function (page) { return normalizeRoute(page.route); }));
    var pagePaths = new Set(pages.map(function (page) { return page.path; }));
    var pageByRoute = new Map();
    var pageByPath = new Map();
    var idsByPagePath = new Map();
    pages.forEach(function (page) {
      var route = normalizeRoute(page.route);
      if (route) pageByRoute.set(route, page);
      if (page.path) pageByPath.set(page.path, page);
      var ids = new Set();
      try {
        var destinationDoc = new DOMParser().parseFromString(page.content, 'text/html');
        destinationDoc.querySelectorAll('[id]').forEach(function (node) {
          var id = text(node.id).trim();
          if (id) ids.add(id);
        });
      } catch (_) {}
      if (page.path) idsByPagePath.set(page.path, ids);
    });
    if (!pages.length) {
      addCheck(report, 'Project artifacts', 'Generated website files', 'fail', 'No complete website page was found. A preview cannot be marked as verified until a valid page is available.');
      return;
    }
    addCheck(report, 'Project artifacts', 'Generated website files', 'pass', pages.length + ' website page(s) are available for review.');
    var metadataIssues = [];
    var copyIssues = [];
    var accessibilityIssues = [];
    var routeIssues = [];
    var resourceIssues = [];
    var assetReferenceCount = 0;
    var externalAssetReferences = 0;
    function auditAssetReference(fromPath, reference, kind) {
      var value = text(reference).trim();
      if (!value || /^(?:data:|blob:)/i.test(value)) return;
      if (/^(?:https?:)?\/\//i.test(value)) {
        externalAssetReferences += 1;
        return;
      }
      if (/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(value)) return;
      assetReferenceCount += 1;
      var target = resolveFile(fromPath, value);
      if (!target) {
        resourceIssues.push(fromPath + ': local ' + kind + ' reference "' + trim(value, 120) + '" escapes the project root and cannot be resolved.');
      } else if (!files[target]) {
        resourceIssues.push(fromPath + ': local ' + kind + ' reference "' + trim(value, 120) + '" does not match a file in the website.');
      }
    }
    function auditAssetSrcset(fromPath, value, kind) {
      var srcset = text(value).trim();
      if (!srcset || /\bdata:/i.test(srcset)) return;
      srcset.split(',').forEach(function (candidate) {
        var reference = text(candidate).trim().split(/\s+/)[0];
        if (reference) auditAssetReference(fromPath, reference, kind);
      });
    }
    function auditCssUrlReferences(fromPath, css) {
      var urlPattern = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/gi;
      var match;
      while ((match = urlPattern.exec(text(css)))) {
        var reference = text(match[1] || match[2] || match[3]).trim();
        if (reference) auditAssetReference(fromPath, reference, 'CSS url() asset');
      }
    }
    var interactionIssues = [];
    var securityIssues = [];
    var cssFiles = Object.keys(files || {}).filter(function (path) { return /\.css$/i.test(path) && fileText(files[path]).trim(); });
    var cssText = cssFiles.map(function (path) { return fileText(files[path]); }).join('\n');
    var allClientCode = Object.keys(files || {}).filter(function (path) { return /\.(?:html?|css|m?js|jsx|tsx|ts)$/i.test(path); }).map(function (path) { return fileText(files[path]); }).join('\n');
    var detectedForms = 0;
    var detectedButtons = 0;
    var checkedIds = 0;
    pages.forEach(function (page) {
      var doc;
      try { doc = new DOMParser().parseFromString(page.content, 'text/html'); }
      catch (_) {
        metadataIssues.push(page.path + ': could not parse the HTML document.');
        return;
      }
      if (!/<!doctype\s+html/i.test(page.content.slice(0, 200))) metadataIssues.push(page.path + ': missing an HTML doctype.');
      if (!text(doc.title).trim()) metadataIssues.push(page.path + ': missing a non-empty <title>.');
      if (!text(doc.documentElement.getAttribute('lang')).trim()) metadataIssues.push(page.path + ': missing a language on <html>.');
      var viewport = doc.querySelector('meta[name="viewport" i]');
      if (!viewport || !/width\s*=\s*device-width/i.test(text(viewport && viewport.getAttribute('content')))) metadataIssues.push(page.path + ': missing a responsive viewport meta tag.');
      if (!doc.querySelector('main, [role="main"]')) metadataIssues.push(page.path + ': no main landmark was found.');
      if (!doc.querySelector('h1')) metadataIssues.push(page.path + ': no primary <h1> heading was found.');
      var copyBody = doc.body ? doc.body.cloneNode(true) : null;
      if (copyBody) copyBody.querySelectorAll('script,style,noscript,template,svg,iframe').forEach(function (node) { node.remove(); });
      var visibleCopy = text(copyBody && copyBody.textContent).replace(/\s+/g, ' ').trim();
      var copyPatterns = [
        { label: 'lorem ipsum placeholder', pattern: /\blorem\s+ipsum\b/i },
        { label: 'unfinished placeholder', pattern: /\b(?:insert|replace|add)\s+(?:your\s+)?(?:text|copy|content|image|logo|company name|business name)\s+here\b/i },
        { label: 'bracketed content placeholder', pattern: /\[\s*(?:your|insert|replace|add)\s+(?:business|company|brand|product|text|content|image)\b[^\]]{0,80}\]/i },
        { label: 'generic brand placeholder', pattern: /\b(?:your company name|your business name|your brand name|company name goes here|brand name goes here)\b/i },
        { label: 'unfinished marker', pattern: /\b(?:TODO|FIXME)\b/i }
      ];
      copyPatterns.forEach(function (rule) {
        if (rule.pattern.test(visibleCopy)) copyIssues.push(page.path + ': detected ' + rule.label + '.');
      });
      var idCounts = Object.create(null);
      doc.querySelectorAll('[id]').forEach(function (node) {
        var id = text(node.id).trim();
        if (!id) return;
        idCounts[id] = (idCounts[id] || 0) + 1;
        checkedIds += 1;
      });
      Object.keys(idCounts).forEach(function (id) {
        if (idCounts[id] > 1) accessibilityIssues.push(page.path + ': duplicate id "' + id + '" (' + idCounts[id] + ' occurrences).');
      });
      doc.querySelectorAll('label[for]').forEach(function (label) {
        var targetId = text(label.getAttribute('for')).trim();
        if (targetId && !doc.getElementById(targetId)) {
          accessibilityIssues.push(page.path + ': a label references a missing control id.');
        }
      });
      doc.querySelectorAll('[aria-labelledby], [aria-describedby]').forEach(function (node) {
        ['aria-labelledby', 'aria-describedby'].forEach(function (attributeName) {
          var references = text(node.getAttribute(attributeName)).split(/\s+/).filter(Boolean);
          references.forEach(function (targetId) {
            if (!doc.getElementById(targetId)) {
              accessibilityIssues.push(page.path + ': ' + attributeName + ' references a missing id.');
            }
          });
        });
      });
      doc.querySelectorAll('img:not([alt])').forEach(function (image) {
        accessibilityIssues.push(page.path + ': image is missing an alt attribute' + (image.getAttribute('src') ? ' (' + trim(image.getAttribute('src'), 100) + ')' : '') + '.');
      });
      doc.querySelectorAll('button, [role="button"], input[type="button" i], input[type="submit" i], input[type="reset" i]').forEach(function (button) {
        detectedButtons += 1;
        if (!hasAccessibleName(button)) accessibilityIssues.push(page.path + ': a button-like control has no accessible name.');
      });
      doc.querySelectorAll('input:not([type="hidden" i]), select, textarea').forEach(function (control) {
        var type = text(control.getAttribute('type')).toLowerCase();
        if (['button', 'submit', 'reset', 'image'].indexOf(type) >= 0) return;
        if (!hasLabel(control, doc)) accessibilityIssues.push(page.path + ': a form control has no associated accessible label' + (control.id ? ' (#' + control.id + ')' : '') + '.');
      });
      doc.querySelectorAll('img, source, video[poster], audio[src], track[src], link[rel~="icon"][href]').forEach(function (node) {
        var tag = text(node.tagName).toLowerCase();
        var src = text(node.getAttribute('src')).trim();
        var srcset = text(node.getAttribute('srcset')).trim();
        var lazySrc = text(node.getAttribute('data-src')).trim();
        if (src) auditAssetReference(page.path, src, tag + ' asset');
        if (srcset) auditAssetSrcset(page.path, srcset, tag + ' srcset asset');
        if (lazySrc) auditAssetReference(page.path, lazySrc, tag + ' lazy asset');
        if (tag === 'video' && node.getAttribute('poster')) auditAssetReference(page.path, node.getAttribute('poster'), 'video poster');
        if ((tag === 'img' || tag === 'source') && !src && !srcset && !lazySrc) {
          resourceIssues.push(page.path + ': a ' + tag + ' element has no src, srcset or data-src reference.');
        }
      });
      doc.querySelectorAll('style').forEach(function (style) {
        auditCssUrlReferences(page.path, style.textContent || '');
      });
      doc.querySelectorAll('[style]').forEach(function (node) {
        auditCssUrlReferences(page.path, node.getAttribute('style') || '');
      });
      doc.querySelectorAll('a').forEach(function (anchor) {
        var href = text(anchor.getAttribute('href')).trim();
        if (!href) {
          routeIssues.push(page.path + ': link "' + trim(anchor.innerText || anchor.textContent, 80) + '" has no href.');
          return;
        }
        if (href === '#') {
          routeIssues.push(page.path + ': placeholder link href="#" was found.');
          return;
        }
        if (anchor.getAttribute('target') === '_blank' && !/\bnoopener\b/i.test(text(anchor.getAttribute('rel')))) {
          securityIssues.push(page.path + ': a target="_blank" link is missing rel="noopener".');
        }
        if (!hasAccessibleName(anchor) && !anchor.querySelector('img[alt]')) {
          accessibilityIssues.push(page.path + ': a link has no accessible name.');
        }
        if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) return;
        if (href.charAt(0) === '#') {
          var fragment = '';
          try { fragment = decodeURIComponent(href.slice(1)); } catch (_) { fragment = href.slice(1); }
          if (fragment && !doc.getElementById(fragment)) routeIssues.push(page.path + ': fragment link #' + trim(fragment, 70) + ' has no matching id.');
          return;
        }
        var localFile = resolveFile(page.path, href);
        var parsedTarget = null;
        var targetRoute = '';
        try {
          parsedTarget = new URL(href, 'https://ovyx-quality.invalid' + page.route);
          targetRoute = normalizeRoute(parsedTarget.pathname);
        } catch (_) {}
        var destinationPage = (localFile && pageByPath.get(localFile)) || (targetRoute && pageByRoute.get(targetRoute));
        if (parsedTarget && parsedTarget.hash && destinationPage) {
          var destinationFragment = '';
          try { destinationFragment = decodeURIComponent(parsedTarget.hash.slice(1)); }
          catch (_) { destinationFragment = parsedTarget.hash.slice(1); }
          var destinationIds = idsByPagePath.get(destinationPage.path) || new Set();
          if (destinationFragment && !destinationIds.has(destinationFragment)) {
            routeIssues.push(page.path + ': cross-page fragment link "' + trim(href, 120) + '" points to an id missing from destination "' + trim(destinationPage.path, 100) + '".');
          }
        }
        if (/\.html?$/i.test(href) || /\.html?$/i.test(localFile)) {
          if (localFile && files[localFile] && pagePaths.has(localFile)) return;
          var routeUrl = '';
          try { routeUrl = normalizeRoute(new URL(href, 'https://ovyx-quality.invalid' + page.route).pathname); } catch (_) {}
          if (routeUrl && pageRoutes.has(routeUrl)) return;
          routeIssues.push(page.path + ': internal page link "' + trim(href, 120) + '" does not resolve to a generated route.');
          return;
        }
        var isRoutePath = href.charAt(0) === '/' || href.endsWith('/') || (!/[?#]/.test(href) && !/\.[a-z0-9]{1,8}$/i.test(href));
        if (isRoutePath) {
          var normalizedRoute = '';
          try { normalizedRoute = normalizeRoute(new URL(href, 'https://ovyx-quality.invalid' + page.route).pathname); } catch (_) {}
          if (normalizedRoute && pageRoutes.has(normalizedRoute)) return;
          routeIssues.push(page.path + ': internal route link "' + trim(href, 120) + '" has no matching generated page.');
        }
      });
      detectedForms += doc.querySelectorAll('form').length;
      doc.querySelectorAll('form').forEach(function (form) {
        var hasSubmitHandler = /addEventListener\s*\(\s*['"]submit['"]|onsubmit\s*=/i.test(allClientCode);
        if (!text(form.getAttribute('action')).trim() && !hasSubmitHandler) interactionIssues.push(page.path + ': form has no declared submission destination or detectable submit handler; delivery was not verified.');
      });
      doc.querySelectorAll('script[src]').forEach(function (script) {
        var ref = text(script.getAttribute('src'));
        if (/^(?:https?:)?\/\//i.test(ref)) return;
        var target = resolveFile(page.path, ref);
        if (target && !files[target]) resourceIssues.push(page.path + ': local script "' + trim(ref, 120) + '" is not present in the file graph.');
      });
      doc.querySelectorAll('link[rel~="stylesheet"][href]').forEach(function (link) {
        var ref = text(link.getAttribute('href'));
        if (/^(?:https?:)?\/\//i.test(ref)) {
          externalAssetReferences += 1;
          return;
        }
        var target = resolveFile(page.path, ref);
        if (target && !files[target]) resourceIssues.push(page.path + ': local stylesheet "' + trim(ref, 120) + '" is not present in the file graph.');
      });
    });
    addCheck(report, 'Content quality', 'Editorial copy and placeholder text', statusForFindings(copyIssues.length, false), copyIssues.length ? copyIssues.slice(0, 50).join('\n') : 'No common template-placeholder phrases were detected in visible page copy. This heuristic does not replace a full human proofread.');
    addCheck(report, 'SEO and document structure', 'Page metadata and landmarks', statusForFindings(metadataIssues.length, false), metadataIssues.length ? metadataIssues.slice(0, 35).join('\n') : 'Every generated HTML page has a title, language, mobile viewport, main landmark, primary heading and doctype.');
    addCheck(report, 'Accessibility', 'Accessible controls and imagery', statusForFindings(accessibilityIssues.length, true), accessibilityIssues.length ? accessibilityIssues.slice(0, 50).join('\n') : 'No missing image alt attributes, duplicate IDs, unlabeled form controls or unnamed buttons and links were found in the generated HTML.');
    addCheck(report, 'Navigation', 'Internal links and anchors', statusForFindings(routeIssues.length, true), routeIssues.length ? routeIssues.slice(0, 50).join('\n') : 'No placeholder links, missing href attributes or broken generated-page and fragment links were found.');
    if (cssFiles.length) {
      var braceIssues = [];
      cssFiles.forEach(function (path) {
        var css = fileText(files[path]);
        var open = (css.match(/\{/g) || []).length;
        var close = (css.match(/\}/g) || []).length;
        if (open !== close) braceIssues.push(path + ': ' + open + ' opening and ' + close + ' closing braces.');
      });
      if (braceIssues.length) addCheck(report, 'Responsive styling', 'Stylesheet structure', 'fail', braceIssues.join('\n'));
      else addCheck(report, 'Responsive styling', 'Stylesheet structure', 'pass', cssFiles.length + ' stylesheet(s) have balanced braces.');
      if (/(?:width|min-width)\s*:\s*(?:1[0-9]{3,}|[2-9][0-9]{3,})px/i.test(cssText) && !/max-width\s*:\s*(?:100%|100vw|[0-9.]+(?:rem|em|vw))/i.test(cssText)) {
        addCheck(report, 'Responsive styling', 'Fixed-width layout rules', 'warn', 'A fixed-width element may exceed smaller screens. The desktop and mobile checks will look for horizontal overflow.');
      }
      if (/(?:animation|transition)\s*:/i.test(cssText) && !/prefers-reduced-motion\s*:\s*reduce/i.test(cssText)) {
        addCheck(report, 'Accessibility', 'Reduced-motion preference', 'warn', 'Some motion effects may not respect the reduced-motion accessibility preference.');
      }
    } else {
      addCheck(report, 'Responsive styling', 'Project stylesheets', 'warn', 'No separate stylesheet was found. The website may use styles embedded in its pages.');
    }
    cssFiles.forEach(function (path) {
      auditCssUrlReferences(path, fileText(files[path]));
    });
    addCheck(report, 'Project assets', 'Local asset references', statusForFindings(resourceIssues.length, false),
      resourceIssues.length
        ? resourceIssues.slice(0, 40).join('\n')
        : 'No missing or unresolved local asset references were found. Inspected ' + assetReferenceCount + ' local path reference(s) across images, media, icons, srcsets and CSS url() resources. This checks graph presence, not whether a binary asset is visually correct.');
    if (externalAssetReferences) {
      addCheck(report, 'Project assets', 'External asset reachability', 'info',
        externalAssetReferences + ' external asset reference(s) were found. Their availability, licensing, latency and rendering were not verified because the isolated browser sandbox blocks network access.');
    }
    if (interactionIssues.length) addCheck(report, 'Forms and interactions', 'Form delivery', 'warn', interactionIssues.slice(0, 30).join('\n'));
    var envPaths = Object.keys(files || {}).filter(function (path) { return /(^|\/)\.env(?:\.|$)/i.test(path); });
    if (envPaths.length) securityIssues.push('Configuration files were found in the website files: ' + envPaths.slice(0, 8).join(', ') + '.');
    Object.keys(files || {}).forEach(function (path) {
      if (!/\.(?:html?|css|m?js|jsx|tsx|ts)$/i.test(path)) return;
      var contents = fileText(files[path]);
      if (/\b(?:sk-[A-Za-z0-9]{24,}|AIza[0-9A-Za-z_-]{30,})\b|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/.test(contents)) {
        securityIssues.push(path + ': a credential-like value was detected. Its value is deliberately not displayed.');
      }
    });
    addCheck(report, 'Security', 'Client-side secret exposure', statusForFindings(securityIssues.length, true), securityIssues.length ? securityIssues.slice(0, 25).join('\n') : 'No obvious access credentials were found in the website files. This automated check cannot guarantee that all sensitive information is absent.');
    if (detectedForms) {
      addCheck(report, 'Integrations', 'Live form and transaction state', 'info', detectedForms + ' form(s) found. This review does not submit forms, make purchases, book appointments, sign in, or contact external services. Those workflows remain unverified.');
    }
    if (detectedButtons) {
      addCheck(report, 'Forms and interactions', 'Interactive controls', 'info', detectedButtons + ' interactive control(s) found. Their labels were reviewed; potentially destructive, payment, booking, and account actions are not triggered automatically.');
    }
    addCheck(report, 'Coverage', 'Source audit coverage', 'pass', 'Page structure and controls were reviewed across ' + pages.length + ' website page(s), including ' + checkedIds + ' page elements.');
  }
  function safeSandboxPayload(page, files, token) {
    var notes = [];
    var scripts = [];
    var doc = new DOMParser().parseFromString(page.content, 'text/html');
    var head = doc.head || doc.documentElement.insertBefore(doc.createElement('head'), doc.body || doc.documentElement.firstChild);
    var title = trim(doc.title || page.path, 160);
    var totalScriptChars = 0;
    doc.querySelectorAll('link[rel~="stylesheet"][href]').forEach(function (link) {
      var href = text(link.getAttribute('href'));
      if (/^(?:https?:)?\/\//i.test(href) || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) {
        notes.push('External stylesheet was not loaded in the isolated browser test.');
        link.remove();
        return;
      }
      var target = resolveFile(page.path, href);
      if (target && files[target]) {
        var style = doc.createElement('style');
        style.setAttribute('data-ovyx-quality-local-style', target);
        style.textContent = fileText(files[target]).slice(0, 250000);
        link.replaceWith(style);
      } else {
        notes.push('Local stylesheet "' + trim(href, 100) + '" could not be found among the website files.');
        link.remove();
      }
    });
    doc.querySelectorAll('script').forEach(function (script) {
      var type = text(script.getAttribute('type')).toLowerCase();
      if (type && !/(?:javascript|ecmascript|module)/i.test(type)) {
        script.remove();
        return;
      }
      var source = '';
      var ref = text(script.getAttribute('src')).trim();
      if (ref) {
        var target = resolveFile(page.path, ref);
        if (target && files[target] && /\.m?js$/i.test(target)) source = fileText(files[target]);
        else {
          notes.push('Script "' + trim(ref, 100) + '" was not run because its source is not included in the website files or is hosted elsewhere.');
          script.remove();
          return;
        }
      } else source = text(script.textContent);
      if (!source.trim()) { script.remove(); return; }
      if (/\bimport\s+(?:[\w*{]|["'])|\bexport\s+(?:default|const|let|var|function|class|\{|\*)/m.test(source)) {
        notes.push('A JavaScript module with imports/exports was excluded from execution in the isolated browser test.');
        script.remove();
        return;
      }
      if (totalScriptChars + source.length > 220000) {
        notes.push('Remaining project script content exceeded the safe test budget and was not executed.');
        script.remove();
        return;
      }
      totalScriptChars += source.length;
      scripts.push(source);
      script.remove();
    });
    doc.querySelectorAll('iframe,object,embed,base').forEach(function (node) {
      notes.push('Embedded content was disabled in the isolated browser test.');
      node.remove();
    });
    var csp = doc.createElement('meta');
    csp.httpEquiv = 'Content-Security-Policy';
    csp.content = "default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; font-src data:; script-src 'unsafe-inline'; connect-src 'none'; form-action 'none'; object-src 'none'; frame-src 'none'; child-src 'none'; base-uri 'none'; navigate-to 'none'; media-src data: blob:";
    head.insertBefore(csp, head.firstChild);
    if (!doc.querySelector('meta[name="viewport" i]')) {
      var viewport = doc.createElement('meta');
      viewport.name = 'viewport';
      viewport.content = 'width=device-width, initial-scale=1';
      head.appendChild(viewport);
    }
    return {
      token: token,
      title: title,
      html: '<!doctype html>' + doc.documentElement.outerHTML,
      scripts: scripts,
      notes: notes
    };
  }
  function utf8Base64(value) {
    return btoa(unescape(encodeURIComponent(value)));
  }
  function runViewport(page, files, width, runNumber) {
    return new Promise(function (resolve) {
      var frame = document.createElement('iframe');
      frame.setAttribute('title', 'OVYX isolated responsive quality check');
      frame.setAttribute('sandbox', 'allow-scripts');
      frame.setAttribute('aria-hidden', 'true');
      frame.tabIndex = -1;
      frame.style.cssText = 'position:fixed!important;left:-10000px!important;top:0!important;width:' + width + 'px!important;height:760px!important;opacity:0!important;pointer-events:none!important;border:0!important;z-index:-1!important;';
      document.body.appendChild(frame);
      var token = 'ovyx-q-' + Date.now() + '-' + runNumber + '-' + Math.random().toString(36).slice(2, 9);
      var payload = safeSandboxPayload(page, files, token);
      payload.probeInteractions = width === 390;
      payload.maxSafeControls = MAX_SAFE_CONTROLS_PER_ROUTE;
      var encoded = utf8Base64(JSON.stringify(payload));
      var wrapper = '(function(){var p=JSON.parse(decodeURIComponent(escape(atob("' + encoded + '"))));var errs=[];var sent=false;var interactions={candidates:0,tested:0,responded:0,skipped:0,noOp:[]};var forms={candidates:0,tested:0,invalidRejected:0,invalidAccepted:[],noNativeValidation:[],skipped:0};var accessibility={contrastSamples:0,contrastSkipped:0,lowContrast:[],focusControls:0,noFocusIndicator:[],authoredFocusStyles:0,pagesChecked:0};var startedAt=performance.now();var initialRenderMs=0;function report(){if(sent)return;sent=true;try{var d=document.documentElement,b=document.body;var vw=window.innerWidth||d.clientWidth||0;var sw=Math.max(d.scrollWidth,b?b.scrollWidth:0);parent.postMessage({type:"ovyx-quality-result",token:p.token,result:{title:document.title||p.title,viewportWidth:vw,scrollWidth:sw,documentHeight:Math.max(d.scrollHeight,b?b.scrollHeight:0),contentLength:(b&&(b.innerText||b.textContent)||"").trim().length,runtimeErrors:errs.slice(0,12),interactions:interactions,forms:forms,accessibility:accessibility,initialRenderMs:initialRenderMs,domNodes:d.querySelectorAll(\"*\").length,imageCount:document.images.length,scriptCount:document.scripts.length,stylesheetCount:document.querySelectorAll(\"style\").length+document.querySelectorAll(\"link[rel=stylesheet]\").length}}, "*")}catch(e){parent.postMessage({type:"ovyx-quality-result",token:p.token,result:{viewportWidth:window.innerWidth||0,scrollWidth:0,runtimeErrors:[String(e&&e.message||e)],interactions:interactions,forms:forms,accessibility:accessibility,initialRenderMs:initialRenderMs,domNodes:d.querySelectorAll(\"*\").length,imageCount:document.images.length,scriptCount:document.scripts.length,stylesheetCount:document.querySelectorAll(\"style\").length+document.querySelectorAll(\"link[rel=stylesheet]\").length}}, "*")}}window.addEventListener("error",function(e){errs.push(String(e.message||"Runtime error").slice(0,240))},true);window.addEventListener("unhandledrejection",function(e){errs.push(String(e.reason&&e.reason.message||e.reason||"Unhandled promise rejection").slice(0,240))});document.open();document.write(p.html);document.close();(p.scripts||[]).forEach(function(src){try{var el=document.createElement("script");el.textContent=src;document.body.appendChild(el)}catch(e){errs.push(String(e&&e.message||e).slice(0,240))}});initialRenderMs=Math.max(0,performance.now()-startedAt);function probeAccessibility(){try{function parseColor(value){var raw=String(value||\"\").trim().toLowerCase();if(raw===\"transparent\")return{r:0,g:0,b:0,a:0};var left=raw.indexOf(\"(\"),right=raw.lastIndexOf(\")\");if(left<0||right<=left)return null;var nums=raw.slice(left+1,right).match(/[0-9.]+/g)||[];if(nums.length<3)return null;return{r:Number(nums[0]),g:Number(nums[1]),b:Number(nums[2]),a:nums.length>3?Math.max(0,Math.min(1,Number(nums[3]))):1}}function blend(front,back){var alpha=front.a==null?1:front.a;return{r:front.r*alpha+back.r*(1-alpha),g:front.g*alpha+back.g*(1-alpha),b:front.b*alpha+back.b*(1-alpha),a:1}}function luminance(color){function channel(value){value=value/255;return value<=0.04045?value/12.92:Math.pow((value+0.055)/1.055,2.4)}return 0.2126*channel(color.r)+0.7152*channel(color.g)+0.0722*channel(color.b)}function ratio(a,b){var la=luminance(a),lb=luminance(b);return(Math.max(la,lb)+0.05)/(Math.min(la,lb)+0.05)}function backgroundFor(el){var chain=[],node=el;while(node&&node.nodeType===1){chain.unshift(node);node=node.parentElement}var bg={r:255,g:255,b:255,a:1};for(var i=0;i<chain.length;i++){var style=getComputedStyle(chain[i]);if((style.backgroundImage&&style.backgroundImage!==\"none\")||Number(style.opacity)<0.98||(style.mixBlendMode&&style.mixBlendMode!==\"normal\"))return null;var color=parseColor(style.backgroundColor);if(color)bg=blend(color,bg)}return bg}function focusRuleExists(){var found=false;function visit(rules){for(var i=0;rules&&i<rules.length;i++){var rule=rules[i];if(rule.cssRules)visit(rule.cssRules);if(!rule.selectorText||rule.selectorText.indexOf(\":focus\")<0||!rule.style)continue;var outline=String(rule.style.outlineStyle||\"\");var width=parseFloat(rule.style.outlineWidth);var shadow=String(rule.style.boxShadow||\"\");if((outline&&outline!==\"none\"&&outline!==\"hidden\"&&Number.isFinite(width)&&width>0)||(shadow&&shadow!==\"none\"))found=true}}for(var s=0;s<document.styleSheets.length;s++){try{visit(document.styleSheets[s].cssRules)}catch(e){}}return found}var selectors=\"h1,h2,h3,h4,h5,h6,p,a,button,label,li,small,strong,em,span,td,th,summary,blockquote\";var nodes=[].slice.call(document.querySelectorAll(selectors));for(var n=0;n<nodes.length&&n<120;n++){var el=nodes[n];var copy=String((el.innerText||el.textContent||\"\")).replace(/\\s+/g,\" \").trim();if(!copy||copy.length>240||el.getAttribute(\"aria-hidden\")===\"true\"||el.closest(\"[hidden],[aria-hidden=true]\")||!el.getClientRects().length){accessibility.contrastSkipped++;continue}var style=getComputedStyle(el);if(style.display===\"none\"||style.visibility===\"hidden\"||Number(style.opacity)<0.1){accessibility.contrastSkipped++;continue}var fg=parseColor(style.color),bg=backgroundFor(el);if(!fg||!bg){accessibility.contrastSkipped++;continue}fg=blend(fg,bg);var value=ratio(fg,bg);var size=parseFloat(style.fontSize)||16;var weight=parseInt(style.fontWeight,10)||400;var large=size>=24||(size>=18.66&&weight>=700);var threshold=large?3:4.5;accessibility.contrastSamples++;if(!Number.isFinite(value)||value+0.05<threshold){var description=el.tagName.toLowerCase()+(el.id?\"#\"+el.id:\"\")+\" \\\"\"+copy.slice(0,70)+\"\\\" \"+(Number.isFinite(value)?value.toFixed(2):\"unknown\")+\":1 (target \"+threshold+\":1)\";if(accessibility.lowContrast.indexOf(description)<0)accessibility.lowContrast.push(description)}}var focusRule=focusRuleExists();if(focusRule)accessibility.authoredFocusStyles++;var focusables=[].slice.call(document.querySelectorAll(\"a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex=\\\"-1\\\"])\")).filter(function(el){if(!el||el.closest(\"[hidden],[aria-hidden=true]\")||!el.getClientRects().length||getComputedStyle(el).visibility===\"hidden\")return false;return !(el.tagName===\"INPUT\"&&String(el.type).toLowerCase()===\"hidden\")}).slice(0,20);var previous=document.activeElement;for(var f=0;f<focusables.length;f++){var control=focusables[f];accessibility.focusControls++;var label=(control.getAttribute(\"aria-label\")||control.innerText||control.textContent||control.getAttribute(\"name\")||control.tagName.toLowerCase()).replace(/\\s+/g,\" \").trim().slice(0,70);try{control.focus({preventScroll:true});var focusStyle=getComputedStyle(control);var visibleOutline=focusStyle.outlineStyle!==\"none\"&&focusStyle.outlineStyle!==\"hidden\"&&(parseFloat(focusStyle.outlineWidth)||0)>0;var visibleShadow=focusStyle.boxShadow&&focusStyle.boxShadow!==\"none\";if(!visibleOutline&&!visibleShadow&&!focusRule&&accessibility.noFocusIndicator.indexOf(label)<0)accessibility.noFocusIndicator.push(label)}catch(e){if(accessibility.noFocusIndicator.indexOf(label)<0)accessibility.noFocusIndicator.push(label+\" (focus failed)\")}}try{if(previous&&previous.focus)previous.focus({preventScroll:true})}catch(e){}accessibility.pagesChecked++}catch(e){errs.push(\"Accessibility smoke test: \"+String(e&&e.message||e).slice(0,180))}}function probeControls(){try{var candidates=[].slice.call(document.querySelectorAll("button,[role=button],[role=tab],summary,[aria-expanded],[aria-pressed]")).filter(function(el){if(!el||el.disabled||el.closest("form")||el.getAttribute("type")==="submit"||el.getAttribute("type")==="reset")return false;var label=((el.id||"")+" "+(typeof el.className==="string"?el.className:"")+" "+(el.getAttribute("aria-label")||"")+" "+(el.textContent||"")).toLowerCase();if(/pay|checkout|book|reserve|confirm|delete|remove|purchase|buy|logout|log out|sign in|sign out|login|register|submit|send|order|subscription|password|account/.test(label))return false;return /menu|nav|tab|accordion|disclosure|toggle|dropdown|modal|dialog|filter|sort|search|carousel|slide|expand|collapse|drawer|open|close|cart|basket|wishlist|favorite|favourite|size|variant/.test(label)||el.hasAttribute("aria-controls")||el.getAttribute("role")==="tab"||el.tagName==="SUMMARY"});interactions.candidates=candidates.length;interactions.skipped=Math.max(0,candidates.length-(Number(p.maxSafeControls)||8));candidates=candidates.slice(0,Number(p.maxSafeControls)||8);function signature(el){var controlled=el.getAttribute("aria-controls");var target=controlled?document.getElementById(controlled):null;return JSON.stringify({html:el.outerHTML.slice(0,500),body:((document.body&&(document.body.innerText||document.body.textContent))||"").slice(0,180),hidden:target?target.hidden:null,targetText:target?((target.innerText||target.textContent)||"").slice(0,90):"",targetDisplay:target?getComputedStyle(target).display:"",hash:location.hash,details:el.parentElement&&el.parentElement.tagName==="DETAILS"?el.parentElement.open:null})}var index=0;function next(){if(index>=candidates.length)return;var el=candidates[index++];var before=signature(el);var label=(el.getAttribute("aria-label")||el.innerText||el.textContent||el.id||"toggle control").replace(/\\s+/g," ").trim().slice(0,90);interactions.tested++;try{el.click()}catch(e){interactions.noOp.push(label+" (click error)");next();return}setTimeout(function(){var after=signature(el);if(after!==before)interactions.responded++;else interactions.noOp.push(label);next()},70)}next()}catch(e){errs.push("Interaction smoke test: "+String(e&&e.message||e).slice(0,180))}}function probeForms(){try{var all=[].slice.call(document.querySelectorAll("form"));forms.candidates=all.length;forms.skipped=Math.max(0,all.length-4);all.slice(0,4).forEach(function(form,index){var label=(form.getAttribute("aria-label")||form.id||form.getAttribute("action")||("form "+(index+1))).replace(/\\s+/g," ").trim().slice(0,80);if(form.noValidate){forms.noNativeValidation.push(label+" (custom validation path)");return}var controls=[].slice.call(form.querySelectorAll("input,select,textarea")).filter(function(field){if(field.disabled||field.readOnly)return false;var type=String(field.type||"").toLowerCase();if(["hidden","button","submit","reset","image","file"].indexOf(type)>=0)return false;return field.required||type==="email"||type==="url"});if(!controls.length){forms.noNativeValidation.push(label);return}var field=controls[0];var type=String(field.type||"").toLowerCase();var selectedGroup=[];var savedSelected=-1;var savedValue=field.value;var savedChecked=field.checked;if(type==="radio"){var radioName=field.name;selectedGroup=[].slice.call(form.querySelectorAll("input[type=radio]")).filter(function(item){return !radioName||item.name===radioName}).map(function(item){return{field:item,checked:item.checked}})}if(field.tagName==="SELECT")savedSelected=field.selectedIndex;try{if(type==="radio")selectedGroup.forEach(function(item){item.field.checked=false});else if(type==="checkbox")field.checked=false;else if(field.tagName==="SELECT")field.selectedIndex=-1;else if(field.required)field.value="";else if(type==="email")field.value="not-an-email";else if(type==="url")field.value="not-a-url";var rejected=field.checkValidity()===false&&form.checkValidity()===false;forms.tested++;if(rejected)forms.invalidRejected++;else forms.invalidAccepted.push(label+" ("+String(field.name||field.id||type||field.tagName).slice(0,80)+")")}finally{if(type==="radio")selectedGroup.forEach(function(item){item.field.checked=item.checked});else if(type==="checkbox")field.checked=savedChecked;else if(field.tagName==="SELECT")field.selectedIndex=savedSelected;else field.value=savedValue}})}catch(e){errs.push("Form validation smoke test: "+String(e&&e.message||e).slice(0,180))}}if(p.probeInteractions){setTimeout(probeAccessibility,25);setTimeout(probeControls,50);setTimeout(probeForms,80);setTimeout(report,850)}else setTimeout(report,320);setTimeout(report,1100)})();';
      var done = false;
      var timer = setTimeout(function () {
        finish({ timeout: true, result: null, notes: payload.notes || [] });
      }, FRAME_TIMEOUT_MS);
      function finish(value) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        window.removeEventListener('message', onMessage);
        try { frame.remove(); } catch (_) {}
        resolve(value);
      }
      function onMessage(event) {
        if (event.source !== frame.contentWindow || !event.data || event.data.type !== 'ovyx-quality-result' || event.data.token !== token) return;
        finish({ timeout: false, result: event.data.result || null, notes: payload.notes || [] });
      }
      window.addEventListener('message', onMessage);
      frame.srcdoc = '<!doctype html><html><head><meta charset="utf-8"></head><body><script>' + wrapper.replace(/<\/script/gi, '<\\/script') + '</script></body></html>';
    });
  }
  function countIssues(report) {
    return report.checks.reduce(function (out, item) {
      if (item.status === 'fail') out.fail += 1;
      else if (item.status === 'warn') out.warn += 1;
      else if (item.status === 'pass') out.pass += 1;
      else out.info += 1;
      return out;
    }, { pass: 0, warn: 0, fail: 0, info: 0 });
  }
  function reportStatus(report) {
    var counts = countIssues(report);
    return counts.fail ? 'fail' : counts.warn ? 'warn' : 'pass';
  }
  function updateStage(id, status, detail) {
    var row = stageRows.find(function (item) { return item.id === id; });
    if (!row) return;
    row.status = status;
    row.detail = text(detail || '');
    renderStages();
    var label = row.label;
    emitBuildStage({ stage: 'quality-' + id, status: status, message: label + (detail ? ': ' + detail : '') });
  }
  function emitBuildStage(detail) {
    lastBuildStage = {
      stage: text(detail && detail.stage || 'ready'),
      status: text(detail && detail.status || 'info'),
      message: trim(detail && detail.message || '', 220),
      at: Date.now()
    };
    dispatch('ovyx:webstudio-build-stage', lastBuildStage);
    syncBuildBadge();
  }
  function shortBuildLabel(stage) {
    var labels = {
      'planning': 'Planning', 'ai-generation': 'Generating', 'artifact-received': 'Output received', 'quality-inspection': 'Quality check', 'quality-auto-repair': 'Repairing',
      'files-applied': 'Applying files', 'source-tests': 'Source tests', 'preview-refresh': 'Refreshing preview',
      'build-verified': 'Build verified', 'build-failed': 'Build needs attention', 'ready': 'Quality'
    };
    return labels[stage] || trim(stage.replace(/-/g, ' '), 24) || 'Quality';
  }
  function syncBuildBadge() {
    if (!root) return;
    document.querySelectorAll('[data-ovyx-quality-trigger]').forEach(function (button) {
      var label = button.querySelector('[data-ovyx-quality-label]');
      var dot = button.querySelector('[data-ovyx-quality-dot]');
      if (label) label.textContent = buildInFlight ? shortBuildLabel(lastBuildStage.stage) : (lastBuildStage.stage === 'build-verified' ? 'Quality · Build OK' : lastBuildStage.stage === 'build-failed' ? 'Quality · Check build' : 'Quality');
      button.setAttribute('title', lastBuildStage.message || 'Run the OVYX Web Studio quality inspector.');
      button.setAttribute('data-build-status', lastBuildStage.status || 'idle');
      if (dot) dot.textContent = buildInFlight ? '…' : lastBuildStage.stage === 'build-verified' ? '✓' : lastBuildStage.stage === 'build-failed' ? '!' : '•';
    });
  }
  function renderStages() {
    if (!root) return;
    var host = root.querySelector('[data-quality-stages]');
    if (!host) return;
    host.textContent = '';
    stageRows.forEach(function (item) {
      var row = document.createElement('div');
      row.className = 'ovyx-ws-quality-stage status-' + item.status;
      var mark = document.createElement('span');
      mark.className = 'ovyx-ws-quality-stage-mark';
      mark.setAttribute('aria-hidden', 'true');
      mark.textContent = item.status === 'done' ? '✓' : item.status === 'running' ? '…' : item.status === 'failed' ? '!' : '○';
      var body = document.createElement('div');
      body.className = 'ovyx-ws-quality-stage-body';
      var title = document.createElement('b');
      title.textContent = item.label;
      var detail = document.createElement('small');
      detail.textContent = item.detail;
      body.appendChild(title);
      body.appendChild(detail);
      row.appendChild(mark);
      row.appendChild(body);
      host.appendChild(row);
    });
  }
  function buildInterface() {
    if (root || !document.body) return;
    root = document.createElement('div');
    root.id = ROOT_ID;
    root.innerHTML = '<style id="' + STYLE_ID + '"></style><div class="ovyx-ws-quality-overlay" data-quality-overlay hidden><section class="ovyx-ws-quality-dialog" role="dialog" aria-modal="true" aria-labelledby="ovyx-ws-quality-title" tabindex="-1"><header class="ovyx-ws-quality-header"><div><div class="ovyx-ws-quality-kicker">OVYX WEB STUDIO · ENGINEERING QA</div><h2 id="ovyx-ws-quality-title">Quality Inspector</h2><p data-quality-subtitle>Inspect the actual generated project files before release.</p></div><button class="ovyx-ws-quality-close" type="button" data-quality-close aria-label="Close Quality Inspector">×</button></header><div class="ovyx-ws-quality-body"><div class="ovyx-ws-quality-summary" data-quality-summary aria-live="polite">Ready to review this website.</div><div class="ovyx-ws-quality-progress" aria-hidden="true"><span data-quality-progress></span></div><div class="ovyx-ws-quality-stages" data-quality-stages></div><section class="ovyx-ws-quality-findings"><div class="ovyx-ws-quality-findings-head"><h3>Findings</h3><span data-quality-counts>Not run</span></div><div class="ovyx-ws-quality-list" data-quality-list><p class="ovyx-ws-quality-empty">Run a quality review to inspect website pages across desktop and mobile sizes.</p></div></section><p class="ovyx-ws-quality-note">Safe-test limits: generated code runs in an isolated sandbox with network APIs and form submissions blocked. This inspector does not send contact forms, complete payments, book appointments, or verify a live authentication/API integration.</p></div><footer class="ovyx-ws-quality-footer"><button type="button" data-quality-run class="ovyx-ws-quality-primary">Run quality checks</button><button type="button" data-quality-repair class="ovyx-ws-quality-secondary" disabled>Repair issues with OVYX</button><button type="button" data-quality-export class="ovyx-ws-quality-ghost" aria-label="Export QA report as JSON" disabled>Export QA report</button><button type="button" data-quality-copy-summary class="ovyx-ws-quality-ghost" aria-label="Copy client-ready QA summary" disabled>Copy summary</button><button type="button" data-quality-console class="ovyx-ws-quality-ghost">Open source tests</button></footer></section></div>';
    document.body.appendChild(root);
    var css = [
      '#'+ROOT_ID+'{font:500 13px/1.5 Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#e5e7eb}',
      '#'+ROOT_ID+' .ovyx-ws-quality-overlay[hidden]{display:none!important}',
      '#'+ROOT_ID+' .ovyx-ws-quality-overlay{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:clamp(8px,2vw,24px);background:rgba(4,8,18,.78);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}',
      '#'+ROOT_ID+' .ovyx-ws-quality-dialog{width:min(980px,100%);max-height:min(92dvh,900px);display:flex;flex-direction:column;overflow:hidden;border:1px solid rgba(255,255,255,.13);border-radius:18px;background:linear-gradient(145deg,#111827,#080d17 75%);box-shadow:0 30px 100px rgba(0,0,0,.48);outline:none}',
      '#'+ROOT_ID+' .ovyx-ws-quality-header{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:20px 22px 14px;border-bottom:1px solid rgba(255,255,255,.08)}',
      '#'+ROOT_ID+' .ovyx-ws-quality-kicker{font:700 9px/1.3 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.13em;color:#e7bd67}',
      '#'+ROOT_ID+' .ovyx-ws-quality-header h2{font-size:21px;line-height:1.2;margin:6px 0 4px;font-weight:750;letter-spacing:-.03em;color:#f9fafb}',
      '#'+ROOT_ID+' .ovyx-ws-quality-header p{margin:0;color:#9ca3af;font-size:11px}',
      '#'+ROOT_ID+' .ovyx-ws-quality-close{flex:none;width:34px;height:34px;border:1px solid rgba(255,255,255,.14);border-radius:10px;color:#d1d5db;background:rgba(255,255,255,.04);font-size:22px;cursor:pointer}',
      '#'+ROOT_ID+' .ovyx-ws-quality-body{overflow:auto;padding:15px 22px;min-height:0}',
      '#'+ROOT_ID+' .ovyx-ws-quality-summary{font-size:12px;font-weight:650;color:#f3f4f6;margin-bottom:9px}',
      '#'+ROOT_ID+' .ovyx-ws-quality-progress{height:3px;overflow:hidden;border-radius:99px;background:rgba(255,255,255,.08);margin-bottom:14px}',
      '#'+ROOT_ID+' .ovyx-ws-quality-progress span{display:block;height:100%;width:0;background:linear-gradient(90deg,#d6a847,#a9dfbe);transition:width .12s linear}',
      '#'+ROOT_ID+' .ovyx-ws-quality-stages{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:18px}',
      '#'+ROOT_ID+' .ovyx-ws-quality-stage{display:flex;align-items:flex-start;gap:8px;min-width:0;padding:10px;border:1px solid rgba(255,255,255,.09);border-radius:10px;background:rgba(255,255,255,.025)}',
      '#'+ROOT_ID+' .ovyx-ws-quality-stage-mark{display:flex;align-items:center;justify-content:center;flex:none;width:20px;height:20px;border-radius:50%;background:rgba(255,255,255,.07);color:#9ca3af;font-weight:800;font-size:11px}',
      '#'+ROOT_ID+' .ovyx-ws-quality-stage.status-done .ovyx-ws-quality-stage-mark{color:#b7f7c7;background:rgba(34,197,94,.13)}',
      '#'+ROOT_ID+' .ovyx-ws-quality-stage.status-running .ovyx-ws-quality-stage-mark{color:#f2ce78;background:rgba(245,158,11,.13)}',
      '#'+ROOT_ID+' .ovyx-ws-quality-stage.status-failed .ovyx-ws-quality-stage-mark{color:#fca5a5;background:rgba(239,68,68,.13)}',
      '#'+ROOT_ID+' .ovyx-ws-quality-stage-body{min-width:0}',
      '#'+ROOT_ID+' .ovyx-ws-quality-stage b{display:block;font-size:10px;color:#e5e7eb;line-height:1.4}',
      '#'+ROOT_ID+' .ovyx-ws-quality-stage small{display:block;color:#858e9c;font-size:9px;line-height:1.45;margin-top:3px;overflow-wrap:anywhere}',
      '#'+ROOT_ID+' .ovyx-ws-quality-findings-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:7px}',
      '#'+ROOT_ID+' .ovyx-ws-quality-findings-head h3{font-size:12px;margin:0;color:#f3f4f6}',
      '#'+ROOT_ID+' .ovyx-ws-quality-findings-head span{font-size:10px;color:#9ca3af}',
      '#'+ROOT_ID+' .ovyx-ws-quality-list{display:grid;gap:7px}',
      '#'+ROOT_ID+' .ovyx-ws-quality-empty{padding:20px 12px;text-align:center;color:#9ca3af;font-size:11px;border:1px dashed rgba(255,255,255,.13);border-radius:10px;margin:0}',
      '#'+ROOT_ID+' .ovyx-ws-quality-item{padding:10px 12px;border:1px solid rgba(255,255,255,.085);border-radius:10px;background:rgba(255,255,255,.025)}',
      '#'+ROOT_ID+' .ovyx-ws-quality-item-top{display:flex;align-items:center;gap:8px;margin-bottom:4px}',
      '#'+ROOT_ID+' .ovyx-ws-quality-status{display:inline-flex;align-items:center;flex:none;border-radius:4px;padding:2px 5px;font:800 8px/1.4 ui-monospace,monospace;letter-spacing:.04em}',
      '#'+ROOT_ID+' .status-pass .ovyx-ws-quality-status{background:rgba(34,197,94,.12);color:#a7f3b8}',
      '#'+ROOT_ID+' .status-warn .ovyx-ws-quality-status{background:rgba(245,158,11,.12);color:#f4d28d}',
      '#'+ROOT_ID+' .status-fail .ovyx-ws-quality-status{background:rgba(239,68,68,.13);color:#fca5a5}',
      '#'+ROOT_ID+' .status-info .ovyx-ws-quality-status{background:rgba(148,163,184,.12);color:#cbd5e1}',
      '#'+ROOT_ID+' .ovyx-ws-quality-item h4{font-size:11px;line-height:1.4;font-weight:700;color:#e5e7eb;margin:0}',
      '#'+ROOT_ID+' .ovyx-ws-quality-item p{font-size:10px;line-height:1.55;color:#a5adba;margin:0;white-space:pre-wrap;overflow-wrap:anywhere}',
      '#'+ROOT_ID+' .ovyx-ws-quality-recommendation{margin-top:9px;padding:9px 10px;border-left:2px solid #c9a96e;border-radius:0 7px 7px 0;background:rgba(201,169,110,.075)}',
      '#'+ROOT_ID+' .ovyx-ws-quality-recommendation strong{display:block;font-size:9px;line-height:1.4;letter-spacing:.04em;color:#e7c992;margin-bottom:4px}',
      '#'+ROOT_ID+' .ovyx-ws-quality-recommendation p{font-size:10px;line-height:1.55;color:#c4cbd5;margin:0;white-space:pre-wrap;overflow-wrap:anywhere}',
      '#'+ROOT_ID+' .ovyx-ws-quality-apply-finding{display:inline-flex;align-items:center;justify-content:center;margin-top:8px;min-height:28px;padding:6px 10px;border:1px solid rgba(201,169,110,.35);border-radius:7px;background:rgba(201,169,110,.12);color:#f2d8a6;font-size:10px;font-weight:700;cursor:pointer}',
      '#'+ROOT_ID+' .ovyx-ws-quality-apply-finding:hover{background:rgba(201,169,110,.2)}',
      '#'+ROOT_ID+' .ovyx-ws-quality-apply-finding:focus-visible{outline:2px solid #f2d8a6;outline-offset:2px}',
      '#'+ROOT_ID+' .ovyx-ws-quality-file{font:9px/1.5 ui-monospace,monospace;color:#e7bd67;margin-top:4px;overflow-wrap:anywhere}',
      '#'+ROOT_ID+' .ovyx-ws-quality-note{font-size:9px;line-height:1.5;color:#828c9b;border-top:1px solid rgba(255,255,255,.08);padding-top:10px;margin:14px 0 0}',
      '#'+ROOT_ID+' .ovyx-ws-quality-footer{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;padding:13px 22px 17px;border-top:1px solid rgba(255,255,255,.08);background:rgba(0,0,0,.10)}',
      '#'+ROOT_ID+' .ovyx-ws-quality-footer button{min-height:36px;border-radius:9px;padding:8px 12px;font:700 10px/1.2 Inter,system-ui,sans-serif;cursor:pointer;transition:background .16s,border-color .16s}',
      '#'+ROOT_ID+' .ovyx-ws-quality-primary{border:1px solid #d7b261;color:#15130e;background:#e6c577}',
      '#'+ROOT_ID+' .ovyx-ws-quality-primary:hover{background:#f0d58f}',
      '#'+ROOT_ID+' .ovyx-ws-quality-secondary{border:1px solid rgba(230,197,119,.44);color:#ecd6a0;background:rgba(230,197,119,.08)}',
      '#'+ROOT_ID+' .ovyx-ws-quality-ghost{border:1px solid rgba(255,255,255,.13);color:#d1d5db;background:rgba(255,255,255,.035)}',
      '#'+ROOT_ID+' .ovyx-ws-quality-footer button:disabled{opacity:.4;cursor:not-allowed}',
      '#'+ROOT_ID+' .ovyx-ws-quality-footer button:focus-visible{outline:2px solid #f0d58f;outline-offset:3px}',
      '.ovyx-ws-quality-trigger{gap:7px!important;display:inline-flex!important;align-items:center!important;white-space:nowrap!important}',
      '.ovyx-ws-quality-trigger [data-ovyx-quality-dot]{font-size:9px;opacity:.82}',
      '.ovyx-ws-quality-trigger[data-build-status="error"],.ovyx-ws-quality-trigger[data-build-status="fail"]{border-color:rgba(248,113,113,.5)!important}',
      '@media(max-width:760px){#'+ROOT_ID+' .ovyx-ws-quality-overlay{padding:0;align-items:stretch}#'+ROOT_ID+' .ovyx-ws-quality-dialog{width:100%;max-height:100dvh;height:100dvh;border-radius:0;border-left:0;border-right:0}#'+ROOT_ID+' .ovyx-ws-quality-header{padding:16px 14px 12px}#'+ROOT_ID+' .ovyx-ws-quality-body{padding:12px 14px}#'+ROOT_ID+' .ovyx-ws-quality-stages{grid-template-columns:repeat(2,minmax(0,1fr))}#'+ROOT_ID+' .ovyx-ws-quality-footer{padding:12px 14px;justify-content:stretch}#'+ROOT_ID+' .ovyx-ws-quality-footer button{flex:1 1 42%;min-width:0}}',
      '@media(max-width:420px){#'+ROOT_ID+' .ovyx-ws-quality-stage{padding:7px;gap:5px}#'+ROOT_ID+' .ovyx-ws-quality-stage b{font-size:9px}#'+ROOT_ID+' .ovyx-ws-quality-header h2{font-size:19px}}',
      '@media(prefers-reduced-motion:reduce){#'+ROOT_ID+' *,#'+ROOT_ID+' *::before,#'+ROOT_ID+' *::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}'
    ].join('\n');
    root.querySelector('style').textContent = css;
    var view = document.getElementById('view-webstudio');
    if (view) view.querySelectorAll('[data-ovyx-quality-trigger]').forEach(function (trigger) { trigger.remove(); });
    var dialog = root.querySelector('.ovyx-ws-quality-dialog');
    if (dialog) dialog.id = ROOT_ID + '-dialog';
    renderStages();
    syncBuildBadge();
  }
  function setOverlay(open) {
    if (!root) return;
    var overlay = root.querySelector('[data-quality-overlay]');
    if (!overlay) return;
    if (open) {
      lastFocused = document.activeElement;
      overlay.hidden = false;
      root.querySelector('.ovyx-ws-quality-dialog')?.focus();
      var runButton = root.querySelector('[data-quality-run]');
      if (runButton) runButton.focus({ preventScroll: true });
    } else {
      overlay.hidden = true;
      try { if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus({ preventScroll: true }); } catch (_) {}
    }
  }
  function shareableReport(report) {
    var counts = countIssues(report);
    var browser = report && report.browser || {};
    var coverage = (report && report.checks || []).find(function (item) { return item.group === 'Coverage' && item.title === 'Desktop and mobile checks coverage'; });
    return {
      schemaVersion: 1,
      product: 'OVYX Web Studio Quality Inspector',
      generatedAt: new Date().toISOString(),
      projectName: trim(report && report.projectName || 'Untitled project', 160),
      inspection: {
        startedAt: report && report.startedAt || null,
        finishedAt: report && report.finishedAt || null,
        status: text(report && report.status || reportStatus(report)),
        statusMeaning: report && report.status === 'fail'
          ? 'One or more checks failed; resolve blockers before handoff.'
          : report && report.status === 'warn'
            ? 'No check failed, but warnings remain; review them before handoff.'
            : 'No failing or warning checks were recorded within the tested scope; this is not a production or integration certification.',
        counts: counts,
        browser: {
          pagesAvailable: Number(browser.pagesAvailable || 0),
          pagesTested: Number(browser.pagesTested || 0),
          viewportChecksPlanned: Number(browser.total || 0),
          viewportChecksCompleted: Number(browser.completed || 0),
          widthsCssPixels: Array.isArray(browser.widths) ? browser.widths.slice() : [],
          routeCoverage: coverage ? trim(coverage.detail, 1200) : 'No completed responsive browser coverage statement was available.',
          safeControlSampling: {
            eligibleControls: Number(browser.interactions && browser.interactions.candidates || 0),
            controlsTested: Number(browser.interactions && browser.interactions.tested || 0),
            stateChangesObserved: Number(browser.interactions && browser.interactions.responded || 0),
            controlsSkippedByCap: Number(browser.interactions && browser.interactions.skipped || 0),
            mobileRoutesProbed: Number(browser.interactions && browser.interactions.pagesProbed || 0),
            capPerRoute: MAX_SAFE_CONTROLS_PER_ROUTE
          }
        },
        checks: (report && report.checks || []).map(function (item) {
          return {
            group: trim(item.group, 80),
            title: trim(item.title, 180),
            status: text(item.status),
            detail: trim(item.detail, 1200),
            recommendation: trim(item.recommendation || recommendationForFinding(item), 700),
            file: item.file ? trim(item.file, 240) : undefined
          };
        })
      },
      privacy: {
        projectIdIncluded: false,
        sourceFileContentsIncluded: false,
        note: 'The report summarizes inspection findings and paths; it does not bundle source files. Review project-specific findings before sharing externally.'
      },
      limitations: [
        'This report contains evidence from source checks and isolated browser smoke tests only.',
        'Real sign-in, database writes, email delivery, booking, payments and authenticated API behavior remain unverified unless separately tested against the actual service in a safe test environment.',
        'Sandbox render measurements are diagnostics, not real-network load times or production Core Web Vitals.',
        'Automated contrast and interaction checks are partial smoke checks, not full WCAG certification or exhaustive interaction testing.'
      ]
    };
  }
  function clientSummary(report) {
    var exportData = shareableReport(report);
    var inspection = exportData.inspection;
    var counts = inspection.counts;
    var browser = inspection.browser;
    var statusLabel = inspection.status === 'fail' ? 'NEEDS ATTENTION'
      : inspection.status === 'warn' ? 'PASSED WITH WARNINGS'
      : 'PASS — WITHIN TESTED SCOPE';
    var lines = [
      'OVYX WEB STUDIO — CLIENT QA SUMMARY',
      '',
      'Project: ' + exportData.projectName,
      'Inspection finished: ' + (inspection.finishedAt || 'Not completed'),
      'Result: ' + statusLabel,
      'Checks: ' + counts.pass + ' passed · ' + counts.warn + ' warnings · ' + counts.fail + ' failed · ' + counts.info + ' informational',
      'Responsive browser coverage: ' + browser.pagesTested + '/' + browser.pagesAvailable + ' route(s), ' + browser.viewportChecksCompleted + '/' + browser.viewportChecksPlanned + ' viewport checks completed.',
      'Safe control smoke test: ' + Number(browser.safeControlSampling && browser.safeControlSampling.controlsTested || 0) + ' of ' + Number(browser.safeControlSampling && browser.safeControlSampling.eligibleControls || 0) + ' eligible controls tested across ' + Number(browser.safeControlSampling && browser.safeControlSampling.mobileRoutesProbed || 0) + ' mobile route probes; ' + Number(browser.safeControlSampling && browser.safeControlSampling.controlsSkippedByCap || 0) + ' skipped by the per-route safety cap.'
    ];
    if (browser.routeCoverage) lines.push('Coverage plan: ' + browser.routeCoverage);
    var priorities = (report.checks || []).filter(function (item) {
      return (item.status === 'fail' || item.status === 'warn') && item.group !== 'Coverage';
    }).slice(0, 6);
    lines.push('', 'Priority findings');
    if (priorities.length) {
      priorities.forEach(function (item, index) {
        lines.push((index + 1) + '. [' + item.status.toUpperCase() + '] ' + trim(item.group, 80) + ' — ' + trim(item.title, 180));
        lines.push('   ' + trim(item.detail, 360));
      });
    } else {
      lines.push('No failing or warning checks were recorded within this inspection run.');
    }
    lines.push(
      '',
      'Verification limits',
      '• Browser checks are isolated smoke tests; route coverage is adaptive, not every route at every width.',
      '• Live sign-in, data persistence, email, booking, payments and authenticated APIs are not verified by this report.',
      '• Sandbox timings are not production load time or Core Web Vitals.',
      '• This report is evidence for review, not a guarantee of business outcomes or a full accessibility/security certification.'
    );
    return lines.join('\n');
  }
  function downloadQualityReport(report) {
    if (!report || !report.finishedAt) {
      toast('Complete a quality inspection before exporting its report.', 'warning');
      return false;
    }
    try {
      var data = shareableReport(report);
      var blob = new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      var date = new Date(report.finishedAt);
      var datePart = Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
      var projectSlug = slug(report.projectName || 'project').slice(0, 48) || 'project';
      link.href = url;
      link.download = 'ovyx-webstudio-qa-' + projectSlug + '-' + datePart + '.json';
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(function () { try { URL.revokeObjectURL(url); } catch (_) {} }, 1000);
      toast('Quality report prepared. Review it before sharing with a client.', 'success');
      return true;
    } catch (error) {
      toast('The quality report could not be exported in this browser.', 'error');
      return false;
    }
  }
  async function copyClientSummary() {
    if (!currentReport || !currentReport.finishedAt) {
      toast('Complete a quality inspection before copying its summary.', 'warning');
      return false;
    }
    var summary = clientSummary(currentReport);
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(summary);
      } else {
        var fallback = document.createElement('textarea');
        fallback.value = summary;
        fallback.setAttribute('readonly', '');
        fallback.setAttribute('aria-hidden', 'true');
        fallback.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
        document.body.appendChild(fallback);
        fallback.select();
        var copied = false;
        try { copied = !!document.execCommand('copy'); } catch (_) {}
        fallback.remove();
        if (!copied) throw new Error('Clipboard access is unavailable.');
      }
      toast('Quality summary copied. Review it before sharing.', 'success');
      return true;
    } catch (error) {
      toast('The summary could not be copied. Export the full report instead.', 'warning');
      return false;
    }
  }
  function renderFindings(report) {
    if (!root) return;
    var list = root.querySelector('[data-quality-list]');
    var summary = root.querySelector('[data-quality-summary]');
    var countsNode = root.querySelector('[data-quality-counts]');
    var progress = root.querySelector('[data-quality-progress]');
    var repairButton = root.querySelector('[data-quality-repair]');
    var exportButton = root.querySelector('[data-quality-export]');
    var copyButton = root.querySelector('[data-quality-copy-summary]');
    var subtitle = root.querySelector('[data-quality-subtitle]');
    if (!list) return;
    if (!report) {
      list.textContent = '';
      var empty = document.createElement('p');
      empty.className = 'ovyx-ws-quality-empty';
      empty.textContent = 'Run a quality review to inspect website pages across desktop and mobile sizes.';
      list.appendChild(empty);
      if (summary) summary.textContent = 'Ready to review this website.';
      if (countsNode) countsNode.textContent = 'Not run';
      if (progress) progress.style.width = '0%';
      if (repairButton) repairButton.disabled = true;
      if (exportButton) exportButton.disabled = true;
      if (copyButton) copyButton.disabled = true;
      return;
    }
    var counts = countIssues(report);
    list.textContent = '';
    report.checks.forEach(function (item, findingIndex) {
      var card = document.createElement('article');
      card.className = 'ovyx-ws-quality-item status-' + item.status;
      var top = document.createElement('div');
      top.className = 'ovyx-ws-quality-item-top';
      var badge = document.createElement('span');
      badge.className = 'ovyx-ws-quality-status';
      badge.textContent = item.status.toUpperCase();
      var title = document.createElement('h4');
      title.textContent = item.title;
      top.appendChild(badge);
      top.appendChild(title);
      var detail = document.createElement('p');
      detail.textContent = item.detail;
      card.appendChild(top);
      card.appendChild(detail);
      if (item.status === 'fail' || item.status === 'warn' || (item.status === 'info' && /integration|coverage|interactive controls|live form/i.test(item.title))) {
        var recommendation = document.createElement('div');
        recommendation.className = 'ovyx-ws-quality-recommendation';
        var recommendationTitle = document.createElement('strong');
        recommendationTitle.textContent = item.status === 'info' ? 'Verification note' : 'Suggested improvement';
        var recommendationText = document.createElement('p');
        recommendationText.textContent = item.recommendation || recommendationForFinding(item);
        recommendation.appendChild(recommendationTitle);
        recommendation.appendChild(recommendationText);
        if ((item.status === 'fail' || item.status === 'warn') && item.group !== 'Coverage') {
          var applyButton = document.createElement('button');
          applyButton.type = 'button';
          applyButton.className = 'ovyx-ws-quality-apply-finding';
          applyButton.setAttribute('data-quality-repair-finding', String(findingIndex));
          applyButton.textContent = 'Apply suggested fix';
          applyButton.setAttribute('aria-label', 'Apply suggested fix for ' + item.title);
          recommendation.appendChild(applyButton);
        }
        card.appendChild(recommendation);
      }
      if (item.file) {
        var file = document.createElement('div');
        file.className = 'ovyx-ws-quality-file';
        file.textContent = item.file;
        card.appendChild(file);
      }
      list.appendChild(card);
    });
    var summaryText = counts.fail + ' failed · ' + counts.warn + ' warning(s) · ' + counts.pass + ' passed';
    if (report.browser && report.browser.total) summaryText += ' · ' + report.browser.completed + '/' + report.browser.total + ' browser viewport checks';
    if (report.finishedAt) summaryText += ' · completed ' + new Date(report.finishedAt).toLocaleTimeString();
    if (summary) summary.textContent = summaryText;
    if (countsNode) countsNode.textContent = counts.pass + ' pass / ' + counts.warn + ' warn / ' + counts.fail + ' fail';
    if (subtitle) subtitle.textContent = report.projectName ? 'Evidence from "' + report.projectName + '" — based on the website preview, not a static mockup.' : 'Review results are based on the website preview, not a static mockup.';
    if (progress) progress.style.width = '100%';
    if (repairButton) repairButton.disabled = running || !report.checks.some(function (item) { return item.status === 'fail' || item.status === 'warn'; });
    if (exportButton) exportButton.disabled = running || !report.finishedAt;
    if (copyButton) copyButton.disabled = running || !report.finishedAt;
  }
  function progressFraction(completed, total) {
    var bar = root && root.querySelector('[data-quality-progress]');
    if (bar) bar.style.width = (total ? Math.round(Math.min(1, completed / total) * 100) : 0) + '%';
  }
  function stageStatus(stageId, status, detail) {
    var row = stageRows.find(function (item) { return item.id === stageId; });
    if (row) {
      row.status = status;
      row.detail = text(detail || '');
      renderStages();
    }
    if (root) {
      var summary = root.querySelector('[data-quality-summary]');
      if (summary && status === 'running') summary.textContent = (row ? row.label : stageId) + '… ' + text(detail || '');
    }
  }
  async function inspectProject() {
    var studio = getStudio();
    var report = {
      projectId: text(window.KernelState && window.KernelState.activeProject && window.KernelState.activeProject.id),
      projectName: trim(window.KernelState && window.KernelState.activeProject && window.KernelState.activeProject.name, 160),
      startedAt: new Date().toISOString(),
      finishedAt: null,
      checks: [],
      browser: { total: 0, completed: 0, pagesTested: 0, pagesAvailable: 0, widths: WIDTHS.slice(), interactions: { candidates: 0, tested: 0, responded: 0, skipped: 0, pagesProbed: 0, noOp: [] }, forms: { candidates: 0, tested: 0, invalidRejected: 0, invalidAccepted: [], noNativeValidation: [], skipped: 0 }, accessibility: { contrastSamples: 0, contrastSkipped: 0, lowContrast: [], focusControls: 0, noFocusIndicator: [], authoredFocusStyles: 0, pagesChecked: 0 }, performance: { samples: 0, totalInitialRenderMs: 0, maxInitialRenderMs: 0, maxDomNodes: 0, maxImages: 0, maxScripts: 0, maxStylesheets: 0 } },
      notes: []
    };
    currentReport = report;
    stageRows = stageRows.map(function (item) { return { id: item.id, label: item.label, status: 'pending', detail: 'Waiting to run.' }; });
    renderStages();
    renderFindings(report);
    var graph = getGraph(studio || {});
    var files = graph && graph.files || {};
    var pages = collectPages(studio || {}, files);
    var existingTests = null;

    stageStatus('source', 'running', 'Running Web Studio source checks.');
    try {
      if (studio && typeof studio.runTests === 'function') existingTests = studio.runTests(false);
      if (!existingTests) {
        addCheck(report, 'Source validation', 'Existing Web Studio source tests', 'warn', 'Some additional website checks are not available, so their results cannot be confirmed.');
      } else {
        addCheck(report, 'Source validation', 'Existing Web Studio source tests', existingTests.ok === true ? 'pass' : 'fail', trim(existingTests.summary + (existingTests.details && existingTests.ok !== true ? '\n' + existingTests.details : ''), 1400));
      }
    } catch (error) {
      addCheck(report, 'Source validation', 'Existing Web Studio source tests', 'fail', 'Some source checks could not complete. Review the website files and try again.');
    }
    stageStatus('source', 'done', existingTests && existingTests.ok === true ? 'Source checks completed with no reported errors.' : 'Source checks completed; review findings below.');
    renderFindings(report);

    stageStatus('audit', 'running', pages.length + ' generated HTML page(s) found.');
    auditSources(report, pages, files, window.KernelState && window.KernelState.activeProject || {});
    stageStatus('audit', 'done', 'Inspected all generated HTML routes and project code patterns.');
    renderFindings(report);

    stageStatus('browser', 'running', 'Preparing an isolated browser viewport matrix.');
    var coveredPages = pages;
    report.browser.pagesAvailable = pages.length;
    if (!pages.length) {
      addCheck(report, 'Browser testing', 'Desktop and mobile checks', 'fail', 'No website page was available for a browser review. The preview has not been verified.');
    } else if (!coveredPages.length) {
      addCheck(report, 'Browser testing', 'Desktop and mobile checks', 'warn', 'No page was available for the desktop and mobile checks.');
    } else {
      var coreRoutes = coveredPages.slice(0, Math.min(CORE_BROWSER_ROUTE_COUNT, coveredPages.length));
      var routePlan = [];
      coreRoutes.forEach(function (corePage) {
        WIDTHS.forEach(function (width) { routePlan.push({ page: corePage, width: width }); });
      });
      coveredPages.slice(coreRoutes.length).forEach(function (additionalPage) {
        ADDITIONAL_ROUTE_WIDTHS.forEach(function (width) { routePlan.push({ page: additionalPage, width: width }); });
      });
      report.browser.total = routePlan.length;
      var visitedPages = Object.create(null);
      var overflow = [];
      var scriptErrors = [];
      var timeouts = [];
      var sandboxNotes = [];
      var emptyPages = [];
      var runNumber = 0;
      for (var p = 0; p < routePlan.length; p += 1) {
        var page = routePlan[p].page;
        var width = routePlan[p].width;
        if (!visitedPages[page.path]) {
          visitedPages[page.path] = true;
          report.browser.pagesTested += 1;
        }
        runNumber += 1;
        progressFraction(runNumber, report.browser.total + 4);
        stageStatus('browser', 'running', 'Browser check ' + (p + 1) + '/' + routePlan.length + ' · ' + page.path + ' · ' + width + 'px viewport.');
          var result;
          try { result = await runViewport(page, files, width, runNumber); }
          catch (error) { result = { timeout: true, result: null, notes: [] }; }
          report.browser.completed += 1;
          (result.notes || []).forEach(function (note) { if (sandboxNotes.indexOf(note) < 0) sandboxNotes.push(note); });
          if (result.timeout || !result.result) {
            timeouts.push(page.path + ' at ' + width + 'px: sandbox did not return a report within ' + FRAME_TIMEOUT_MS + 'ms.');
          } else {
            var browserResult = result.result;
            if (width === 390 && browserResult.interactions) {
              var accessibilityAudit = report.browser.accessibility;
              var accessibilityResult = browserResult.accessibility || {};
              accessibilityAudit.contrastSamples += Number(accessibilityResult.contrastSamples || 0);
              accessibilityAudit.contrastSkipped += Number(accessibilityResult.contrastSkipped || 0);
              accessibilityAudit.focusControls += Number(accessibilityResult.focusControls || 0);
              accessibilityAudit.authoredFocusStyles += Number(accessibilityResult.authoredFocusStyles || 0);
              accessibilityAudit.pagesChecked += Number(accessibilityResult.pagesChecked || 0);
              (accessibilityResult.lowContrast || []).forEach(function (finding) {
                var entry = page.path + ': ' + trim(finding, 180);
                if (accessibilityAudit.lowContrast.indexOf(entry) < 0) accessibilityAudit.lowContrast.push(entry);
              });
              (accessibilityResult.noFocusIndicator || []).forEach(function (finding) {
                var entry = page.path + ': ' + trim(finding, 100);
                if (accessibilityAudit.noFocusIndicator.indexOf(entry) < 0) accessibilityAudit.noFocusIndicator.push(entry);
              });
              var interactionAudit = report.browser.interactions;
              interactionAudit.pagesProbed += 1;
              interactionAudit.candidates += Number(browserResult.interactions.candidates || 0);
              interactionAudit.tested += Number(browserResult.interactions.tested || 0);
              interactionAudit.responded += Number(browserResult.interactions.responded || 0);
              interactionAudit.skipped += Number(browserResult.interactions.skipped || 0);
              (browserResult.interactions.noOp || []).forEach(function (label) {
                var finding = page.path + ': ' + trim(label, 100);
                if (interactionAudit.noOp.indexOf(finding) < 0) interactionAudit.noOp.push(finding);
              });
            }
            if (width === 390 && browserResult.forms) {
              var formResult = browserResult.forms;
              var formAudit = report.browser.forms;
              ['candidates', 'tested', 'invalidRejected', 'skipped'].forEach(function (key) {
                formAudit[key] += Math.max(0, Number(formResult[key]) || 0);
              });
              (formResult.invalidAccepted || []).forEach(function (finding) {
                formAudit.invalidAccepted.push(page.path + ': ' + trim(finding, 120));
              });
              (formResult.noNativeValidation || []).forEach(function (finding) {
                formAudit.noNativeValidation.push(page.path + ': ' + trim(finding, 120));
              });
            }
            if (browserResult.viewportWidth && Math.abs(browserResult.viewportWidth - width) > 3) {
              timeouts.push(page.path + ' at requested ' + width + 'px, actual sandbox viewport was ' + browserResult.viewportWidth + 'px.');
            }
            var performanceAudit = report.browser.performance;
            if (Number.isFinite(Number(browserResult.initialRenderMs)) && browserResult.domNodes != null) {
              performanceAudit.samples += 1;
              performanceAudit.totalInitialRenderMs += Math.max(0, Number(browserResult.initialRenderMs) || 0);
              performanceAudit.maxInitialRenderMs = Math.max(performanceAudit.maxInitialRenderMs, Math.max(0, Number(browserResult.initialRenderMs) || 0));
              performanceAudit.maxDomNodes = Math.max(performanceAudit.maxDomNodes, Number(browserResult.domNodes) || 0);
              performanceAudit.maxImages = Math.max(performanceAudit.maxImages, Number(browserResult.imageCount) || 0);
              performanceAudit.maxScripts = Math.max(performanceAudit.maxScripts, Number(browserResult.scriptCount) || 0);
              performanceAudit.maxStylesheets = Math.max(performanceAudit.maxStylesheets, Number(browserResult.stylesheetCount) || 0);
            }
            if (Number(browserResult.scrollWidth) > Number(browserResult.viewportWidth) + 2) {
              overflow.push(page.path + ' at ' + width + 'px viewport has horizontal overflow (' + browserResult.scrollWidth + 'px content width).');
            }
            if (Number(browserResult.contentLength || 0) < 20) emptyPages.push(page.path + ' at ' + width + 'px rendered little or no body text.');
            (browserResult.runtimeErrors || []).forEach(function (error) {
              var entry = page.path + ' at ' + width + 'px: ' + trim(error, 220);
              if (scriptErrors.indexOf(entry) < 0) scriptErrors.push(entry);
            });
          }
        progressFraction(runNumber, report.browser.total + 4);
        if (p % 5 === 4 || p === routePlan.length - 1) renderFindings(report);
      }
      addCheck(report, 'Browser testing', 'Horizontal overflow', overflow.length ? 'fail' : 'pass', overflow.length ? overflow.slice(0, 45).join('\n') : 'No horizontal overflow was detected across all ' + coveredPages.length + ' HTML route(s) under the selected responsive coverage plan.');
      addCheck(report, 'Browser testing', 'Page runtime errors', scriptErrors.length ? 'fail' : 'pass', scriptErrors.length ? scriptErrors.slice(0, 35).join('\n') : 'No browser script errors were detected during the tested previews.');
      var interactionAudit = report.browser.interactions;
      if (interactionAudit.tested) {
        addCheck(report, 'Forms and interactions', 'Safe interactive behavior smoke test', interactionAudit.noOp.length ? 'fail' : 'pass', interactionAudit.noOp.length ? interactionAudit.noOp.slice(0, 20).join('\\n') : interactionAudit.responded + ' of ' + interactionAudit.tested + ' safe menu, tab, disclosure, filter, cart, wishlist, or variant control(s) changed observable page state in the isolated mobile browser. Destructive, account, payment, booking, submit and send controls were not clicked.');
      } else {
        addCheck(report, 'Forms and interactions', 'Safe interactive behavior smoke test', 'info', 'No safe menu, tab, filter, or similar control was available for automatic testing. Other controls and integrations still need manual review.');
      }
      if (!interactionAudit.candidates) {
        addCheck(report, 'Coverage', 'Safe control interaction sampling', 'info',
          'No controls matched the inspector’s conservative safe-click criteria in ' + interactionAudit.pagesProbed + ' mobile route probe(s). This is not evidence that the project has no interactive controls; other controls and complete user journeys remain unverified.');
      } else if (interactionAudit.skipped) {
        addCheck(report, 'Coverage', 'Safe control interaction sampling', 'info',
          'The isolated browser tested ' + interactionAudit.tested + ' of ' + interactionAudit.candidates + ' eligible safe semantic control(s) across ' + interactionAudit.pagesProbed + ' mobile route probe(s). ' + interactionAudit.skipped + ' additional eligible control(s) were not clicked because the sampling cap is ' + MAX_SAFE_CONTROLS_PER_ROUTE + ' per route. Untested controls and complete end-to-end user journeys remain unverified.');
      } else {
        addCheck(report, 'Coverage', 'Safe control interaction sampling', 'pass',
          'The isolated browser tested ' + interactionAudit.tested + ' of ' + interactionAudit.candidates + ' eligible safe semantic control(s) across ' + interactionAudit.pagesProbed + ' mobile route probe(s). This is a smoke sample, not exhaustive testing of every control or complete user journey.');
      }
      var formAudit = report.browser.forms;
      if (formAudit.tested) {
        var formStatus = formAudit.invalidAccepted.length
          ? 'fail'
          : (formAudit.noNativeValidation.length || formAudit.skipped ? 'info' : 'pass');
        var formDetail = 'The isolated preview checked native HTML validation on ' + formAudit.tested +
          ' of ' + formAudit.candidates + ' detected form(s); ' + formAudit.invalidRejected +
          ' invalid field state(s) were correctly blocked. No submit event was dispatched and outbound network requests are blocked. This does not verify custom JavaScript validation or real form delivery.';
        if (formAudit.invalidAccepted.length) {
          formDetail += '\nInvalid input was accepted by native validation: ' + formAudit.invalidAccepted.slice(0, 12).join('\n');
        }
        if (formAudit.noNativeValidation.length || formAudit.skipped) {
          formDetail += '\nManual validation review remains for: ' + formAudit.noNativeValidation.slice(0, 8).join('; ') +
            (formAudit.skipped ? '; ' + formAudit.skipped + ' additional form(s) were not sampled.' : '');
        }
        addCheck(report, 'Forms and interactions', 'Safe form validation smoke test', formStatus, formDetail);
      } else if (formAudit.candidates) {
        addCheck(report, 'Forms and interactions', 'Safe form validation smoke test', 'info',
          'Found ' + formAudit.candidates + ' form(s), but no native required/email/URL constraint could be safely exercised. Custom validation and the real submission path remain unverified; no form was submitted.');
      } else {
        addCheck(report, 'Forms and interactions', 'Safe form validation smoke test', 'info',
          'No forms were found in the tested generated HTML routes. Form-delivery behavior is not applicable to this artifact.');
      }
      var accessibilityAudit = report.browser.accessibility;
      if (accessibilityAudit.contrastSamples) {
        addCheck(report, 'Accessibility', 'Rendered text contrast sample', accessibilityAudit.lowContrast.length ? 'warn' : 'pass', accessibilityAudit.lowContrast.length ? accessibilityAudit.lowContrast.slice(0, 20).join('\\n') : 'No low-contrast text was found in ' + accessibilityAudit.contrastSamples + ' rendered text sample(s) across ' + accessibilityAudit.pagesChecked + ' page(s). Text over image/gradient or uncertain translucent backgrounds was skipped (' + accessibilityAudit.contrastSkipped + ' sample(s)); this is not a full WCAG certification.');
      } else {
        addCheck(report, 'Accessibility', 'Rendered text contrast sample', 'info', 'Text contrast could not be measured reliably because some text appears over images, gradients, or transparent backgrounds.');
      }
      if (accessibilityAudit.focusControls) {
        addCheck(report, 'Accessibility', 'Visible keyboard focus indicators', accessibilityAudit.noFocusIndicator.length ? 'warn' : 'pass', accessibilityAudit.noFocusIndicator.length ? accessibilityAudit.noFocusIndicator.slice(0, 20).join('\\n') : 'Inspected ' + accessibilityAudit.focusControls + ' focusable control(s) across ' + accessibilityAudit.pagesChecked + ' page(s); visible focus cues or an authored focus-style rule were detected.');
      } else {
        addCheck(report, 'Accessibility', 'Visible keyboard focus indicators', 'info', 'No keyboard-operable controls were available for this review.');
      }
      var performanceAudit = report.browser.performance;
      if (performanceAudit.samples) {
        var averageRenderMs = Math.round(performanceAudit.totalInitialRenderMs / performanceAudit.samples);
        var performanceFindings = [];
        if (performanceAudit.maxInitialRenderMs > 500) performanceFindings.push('Initial document parse and inline-script processing exceeded 500ms in at least one isolated run.');
        if (performanceAudit.maxDomNodes > 1800) performanceFindings.push('A rendered route exceeded the approximate 1,800-element DOM budget.');
        if (performanceAudit.maxScripts > 32) performanceFindings.push('A page contained more than 32 script elements.');
        if (performanceAudit.maxStylesheets > 14) performanceFindings.push('A page contained more than 14 style/link stylesheet elements.');
        addCheck(report, 'Performance', 'Page loading performance', performanceFindings.length ? 'warn' : 'pass',
          'Measured ' + performanceAudit.samples + ' isolated viewport render(s): average initial document parse plus inline-script processing ' + averageRenderMs + 'ms, maximum ' + Math.round(performanceAudit.maxInitialRenderMs) + 'ms; maximum DOM nodes ' + performanceAudit.maxDomNodes + ', images ' + performanceAudit.maxImages + ', scripts ' + performanceAudit.maxScripts + ', stylesheets ' + performanceAudit.maxStylesheets + '. This is a sandbox diagnostic, not production load time, Core Web Vitals or a real-network performance measurement.' + (performanceFindings.length ? '\\n' + performanceFindings.join('\\n') : ''));
      } else {
        addCheck(report, 'Performance', 'Page loading performance', 'info', 'The browser review could not collect performance measurements.');
      }
      if (timeouts.length) addCheck(report, 'Browser testing', 'Sandbox runtime and render completion', 'warn', timeouts.slice(0, 25).join('\n'));
      if (emptyPages.length) addCheck(report, 'Browser testing', 'Page content presence', 'warn', emptyPages.slice(0, 25).join('\n'));
      addCheck(report, 'Coverage', 'Desktop and mobile checks coverage', 'pass',
        'Browser checks covered all ' + coveredPages.length + ' generated HTML route(s): ' + coreRoutes.length + ' core route(s) at all ' + WIDTHS.length + ' viewport widths (' + WIDTHS.join(', ') + 'px), and ' + Math.max(0, coveredPages.length - coreRoutes.length) + ' additional route(s) at mobile ' + ADDITIONAL_ROUTE_WIDTHS[0] + 'px and desktop ' + ADDITIONAL_ROUTE_WIDTHS[1] + 'px. Static source audits covered every route. This is responsive smoke coverage, not exhaustive testing of every interaction or a production-device matrix.');
      if (sandboxNotes.length) addCheck(report, 'Browser testing', 'Isolated test limitations', 'info', sandboxNotes.slice(0, 20).join('\n'));
    }
    stageStatus('browser', 'done', report.browser.completed + ' actual isolated browser viewport check(s) completed.');
    renderFindings(report);

    stageStatus('truth', 'running', 'Summarizing only observed test results.');
    addCheck(report, 'Integrations', 'Live integration verification', 'info', 'This report covers website structure and the preview. Email, data saving, sign-in, payments, bookings, and account-connected actions have not been verified unless tested separately.');
    report.finishedAt = new Date().toISOString();
    report.status = reportStatus(report);
    report.counts = countIssues(report);
    stageStatus('truth', 'done', 'Report assembled from completed source and browser checks.');
    progressFraction(report.browser.completed + 4, report.browser.total + 4);
    currentReport = report;
    renderFindings(report);
    dispatch('ovyx:webstudio-quality-report', clone(report));
    return report;
  }
  function issueScore(report) {
    if (!report) return Infinity;
    return report.checks.reduce(function (sum, item) {
      if (item.group === 'Coverage') return sum;
      if (item.status === 'fail') return sum + 4;
      if (item.status === 'warn') return sum + 1;
      return sum;
    }, 0);
  }
  function finalizeQualityReport(report) {
    if (!report) return null;
    report.finishedAt = new Date().toISOString();
    report.status = reportStatus(report);
    report.counts = countIssues(report);
    currentReport = report;
    renderFindings(report);
    dispatch('ovyx:webstudio-quality-report', clone(report));
    return report;
  }
  async function rejectBuildForQuality(studio, snapshot, reason) {
    var restored = restoreSnapshot(studio, snapshot);
    deferredPreviewRefresh = false;
    qualityGateActive = false;
    var report = null;
    try { report = await inspectProject(); } catch (_) {}
    if (!report) {
      var project = window.KernelState && window.KernelState.activeProject || {};
      report = {
        projectId: text(project.id),
        projectName: trim(project.name, 160),
        startedAt: new Date().toISOString(),
        finishedAt: null,
        checks: [],
        browser: { total: 0, completed: 0, pagesTested: 0, pagesAvailable: 0, widths: WIDTHS.slice(), interactions: { candidates: 0, tested: 0, responded: 0, skipped: 0, pagesProbed: 0, noOp: [] }, forms: { candidates: 0, tested: 0, invalidRejected: 0, invalidAccepted: [], noNativeValidation: [], skipped: 0 }, accessibility: { contrastSamples: 0, contrastSkipped: 0, lowContrast: [], focusControls: 0, noFocusIndicator: [], authoredFocusStyles: 0, pagesChecked: 0 }, performance: { samples: 0, totalInitialRenderMs: 0, maxInitialRenderMs: 0, maxDomNodes: 0, maxImages: 0, maxScripts: 0, maxStylesheets: 0 } },
        notes: []
      };
    }
    addCheck(report, 'Automatic build gate', 'Post-build quality gate', 'fail',
      trim(reason, 900) + ' ' + (restored
        ? 'The previous project snapshot was restored; the unverified build was not promoted.'
        : 'The previous project snapshot could not be fully restored. The editor must be checked before continuing.'));
    finalizeQualityReport(report);
    emitBuildStage({
      stage: 'build-failed',
      status: 'error',
      message: 'The updated website did not meet the quality threshold. Your previous version was restored.'
    });
    return report;
  }
  function captureSnapshot(studio) {
    var project = window.KernelState && window.KernelState.activeProject || {};
    var graph;
    try { graph = studio.snapshotGraph(); } catch (_) { graph = clone(getGraph(studio)); }
    var projects = clone(window.KernelState && window.KernelState.projects || []);
    var historyStack = clone(studio.historyStack || []);
    return {
      projectId: text(project.id),
      project: clone(project),
      projects: projects,
      graph: clone(graph),
      historyStack: historyStack,
      historyPointer: Number(studio.historyPointer == null ? -1 : studio.historyPointer)
    };
  }
  function restoreSnapshot(studio, snapshot) {
    try {
      var state = window.KernelState;
      state.projects = clone(snapshot.projects || []);
      state.activeProject = state.projects.find(function (item) { return text(item && item.id) === snapshot.projectId; }) || clone(snapshot.project || {});
      studio.graph = clone(snapshot.graph || { version: 2, entry: 'src/pages/Home.html', files: {} });
      if (state.activeProject) state.activeProject.ovyxGraph = studio.graph;
      studio.historyStack = clone(snapshot.historyStack || []);
      studio.historyPointer = snapshot.historyPointer;
      try { studio.syncGraphToProject(); } catch (_) {}
      try { if (studio.graphKeyPrefix) localStorage.setItem(studio.graphKeyPrefix + (state.activeProject && state.activeProject.id || 'unknown'), JSON.stringify(studio.graph)); } catch (_) {}
      try { window.ProjectStore && window.ProjectStore.save && window.ProjectStore.save(); } catch (_) {}
      try { window.ProjectStore && window.ProjectStore.renderHome && window.ProjectStore.renderHome(); } catch (_) {}
      try { window.ProjectStore && window.ProjectStore.renderProjects && window.ProjectStore.renderProjects(); } catch (_) {}
      try { studio.renderPreview && studio.renderPreview(); } catch (_) {}
      try { studio.render && studio.render(); } catch (_) {}
      return true;
    } catch (_) { return false; }
  }
  function discardDeferredPreview() {
    deferredPreviewRefresh = false;
  }
  function publishVerifiedPreview(studio) {
    if (!studio || typeof studio.renderPreview !== 'function') {
      throw new Error('The quality checks passed, but the preview could not be opened right now.');
    }
    qualityGateActive = false;
    buildInFlight = false;
    deferredPreviewRefresh = false;
    studio.renderPreview();
  }
  function findingsForRepair(report, selectedIndex) {
    var checks = report && report.checks || [];
    var targeted = Number.isInteger(selectedIndex);
    return checks.filter(function (item, index) {
      return (!targeted || index === selectedIndex) && (item.status === 'fail' || item.status === 'warn') && item.group !== 'Coverage';
    }).slice(0, 35).map(function (item) {
      return '- [' + item.status.toUpperCase() + '] ' + item.group + ' — ' + item.title + (item.file ? ' (' + item.file + ')' : '') + '\n  Evidence: ' + item.detail.slice(0, 700) + '\n  Suggested improvement: ' + (item.recommendation || recommendationForFinding(item));
    });
  }
  async function repairWithOVYX(selectedIndex) {
    if (running) return;
    var studio = getStudio();
    if (!studio || typeof studio.runBuildAgent !== 'function' || !currentReport) {
      toast('Website creation and repair are not available right now. Please try again.', 'warning');
      return;
    }
    var findings = findingsForRepair(currentReport, selectedIndex);
    if (!findings.length) {
      toast('No issues were found that require an automatic repair.', 'info');
      return;
    }
    var beforeReport = currentReport;
    var scoreBefore = issueScore(beforeReport);
    var snapshot = captureSnapshot(studio);
    var prompt = [
      'OVYX QUALITY INSPECTOR REPAIR',
      'Repair only the verified website defects below in the existing Web Studio project. This is one bounded repair attempt.',
      'Preserve the established visual art direction, brand profile, working routes, content, editor state, project files and all unrelated behavior.',
      'Change only the website files required to address the listed findings. Do not change OVYX application code, authentication, billing, provider routing, server configuration or unrelated project files.',
      'Do not invent customer facts, contact details, reviews, prices, credentials or integration status. Do not claim live form, booking or payment success without a real connection.',
      'For missing or inaccessible integrations, keep the limitation explicit rather than creating a fake success state.',
      'Re-run source validation after the repair; a real website file must change. If no safe repair can be made, preserve the existing website.',
      '',
      'Verified findings from the completed quality report, each with a specific suggested improvement:',
      'Use the recommendation as guidance, not as permission to invent facts. Trace each finding to the file and component it names; if evidence does not identify a safe target, leave it unchanged and report the limitation.',
      findings.join('\n'),
      '',
      'Use the actual project files supplied by Web Studio and make only the smallest changes needed.'
    ].join('\n');
    running = true;
    renderFindings(currentReport);
    stageRows = stageRows.map(function (item) {
      return {
        id: item.id, label: item.label,
        status: item.id === 'audit' ? 'running' : item.status,
        detail: item.id === 'audit' ? 'Submitting the specific findings to the existing OVYX build pipeline.' : item.detail
      };
    });
    renderStages();
    var summary = root && root.querySelector('[data-quality-summary]');
    if (summary) summary.textContent = 'Trying one focused repair using the selected AI option.';
    var runButton = root && root.querySelector('[data-quality-run]');
    var repairButton = root && root.querySelector('[data-quality-repair]');
    if (runButton) runButton.disabled = true;
    if (repairButton) repairButton.disabled = true;
    emitBuildStage({ stage: 'quality-repair', status: 'running', message: 'A focused website repair is in progress.' });
    var success = false;
    try {
      var token = Number(studio.requestEpoch || 0);
      await studio.runBuildAgent(prompt, true, token, [], {
        projectId: snapshot.projectId,
        project: clone(snapshot.project),
        projects: clone(snapshot.projects),
        graph: clone(snapshot.graph)
      });
      var nextProject = window.KernelState && window.KernelState.activeProject || {};
      var nextGraph = getGraph(studio);
      var changed = typeof studio.diffFiles === 'function' ? studio.diffFiles(snapshot.graph, nextGraph).length > 0 : JSON.stringify(snapshot.graph) !== JSON.stringify(nextGraph);
      var newVerification = text(nextProject.ovyxBuildVerifiedAt) && text(nextProject.ovyxBuildVerifiedAt) !== text(snapshot.project && snapshot.project.ovyxBuildVerifiedAt);
      if (!changed || !newVerification) throw new Error('The updated website could not be verified, so your previous version was restored.');
      running = false;
      var afterReport = await inspectProject();
      if (issueScore(afterReport) > 0) {
        restoreSnapshot(studio, snapshot);
        discardDeferredPreview();
        currentReport = beforeReport;
        renderFindings(beforeReport);
        var note = 'The attempted repair still left quality findings. OVYX restored the previous project and kept its working preview.';
        addCheck(beforeReport, 'Automatic repair', 'Repair verification', 'warn', note);
        beforeReport.finishedAt = new Date().toISOString();
        beforeReport.status = reportStatus(beforeReport);
        beforeReport.counts = countIssues(beforeReport);
        renderFindings(beforeReport);
        toast(note, 'warning');
      } else {
        currentReport = afterReport;
        addCheck(afterReport, 'Automatic repair', 'Repair verification', 'pass', 'The website was updated, passed source checks, and its quality score improved from ' + scoreBefore + ' to ' + issueScore(afterReport) + '.');
        afterReport.finishedAt = new Date().toISOString();
        afterReport.status = reportStatus(afterReport);
        afterReport.counts = countIssues(afterReport);
        renderFindings(afterReport);
        if (!qualityGateActive) publishVerifiedPreview(studio);
        toast('The reported website issues were corrected and quality checks were rerun.', 'success');
        success = true;
      }
    } catch (error) {
      restoreSnapshot(studio, snapshot);
      discardDeferredPreview();
      currentReport = beforeReport;
      addCheck(beforeReport, 'Automatic repair', 'Repair verification', 'warn', trim(error && error.message || 'The repair could not be verified.', 700) + ' The previous website files and preview were restored.');
      beforeReport.finishedAt = new Date().toISOString();
      beforeReport.status = reportStatus(beforeReport);
      beforeReport.counts = countIssues(beforeReport);
      renderFindings(beforeReport);
      toast('The repair could not be verified; your previous website version was restored.', 'warning');
    } finally {
      running = false;
      if (runButton) runButton.disabled = false;
      if (repairButton) repairButton.disabled = !(currentReport && currentReport.checks.some(function (item) { return item.status === 'fail' || item.status === 'warn'; }));
      emitBuildStage({
        stage: success ? (qualityGateActive ? 'quality-auto-repair' : 'build-verified') : 'build-failed',
        status: success ? (qualityGateActive ? 'info' : 'success') : 'warning',
        message: success
          ? (qualityGateActive ? 'The targeted repair re-check passed; the outer build gate still must finish before the preview is released.' : 'Targeted repair passed a fresh quality check and the verified preview was released.')
          : 'Targeted repair did not pass the quality gate.'
      });
    }
  }
  function bindControls() {
    if (!root || root.dataset.ovyxBound === '1') return;
    root.dataset.ovyxBound = '1';
    root.addEventListener('click', function (event) {
      var trigger = event.target && event.target.closest && event.target.closest('[data-ovyx-quality-trigger]');
      if (trigger) {
        event.preventDefault();
        lastFocused = trigger;
        setOverlay(true);
        return;
      }
      if (event.target && event.target.closest && event.target.closest('[data-quality-close]')) {
        event.preventDefault();
        setOverlay(false);
        return;
      }
      if (event.target && event.target.matches && event.target.matches('[data-quality-overlay]')) {
        setOverlay(false);
        return;
      }
      if (event.target && event.target.closest && event.target.closest('[data-quality-run]')) {
        if (running) return;
        running = true;
        var runButton = root.querySelector('[data-quality-run]');
        if (runButton) runButton.disabled = true;
        performInspection().catch(function (error) {
          addCheck(currentReport || { checks: [] }, 'Inspector runtime', 'Quality inspection', 'fail', trim(error && error.message || error, 800));
          renderFindings(currentReport);
          toast('The quality inspection could not complete. Review the report.', 'error');
        }).finally(function () {
          running = false;
          if (runButton) runButton.disabled = false;
          renderFindings(currentReport);
        });
        return;
      }
      if (event.target && event.target.closest && event.target.closest('[data-quality-export]')) {
        downloadQualityReport(currentReport);
        return;
      }
      if (event.target && event.target.closest && event.target.closest('[data-quality-copy-summary]')) {
        copyClientSummary();
        return;
      }
      var targetedRepair = event.target && event.target.closest && event.target.closest('[data-quality-repair-finding]');
      if (targetedRepair) {
        var selectedFinding = Number(targetedRepair.getAttribute('data-quality-repair-finding'));
        if (Number.isInteger(selectedFinding)) repairWithOVYX(selectedFinding);
        return;
      }
      if (event.target && event.target.closest && event.target.closest('[data-quality-repair]')) {
        repairWithOVYX();
        return;
      }
      if (event.target && event.target.closest && event.target.closest('[data-quality-console]')) {
        try {
          var studio = getStudio();
          studio && studio.openEngineeringConsole && studio.openEngineeringConsole('tests');
          setOverlay(false);
        } catch (_) {}
      }
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && root && !root.querySelector('[data-quality-overlay]').hidden) {
        event.preventDefault();
        setOverlay(false);
      }
    });
    window.addEventListener('ovyx:view-changed', syncVisibility);
    window.addEventListener('ovyx:webstudio-build-stage', function (event) {
      if (event && event.detail) {
        lastBuildStage = event.detail;
        syncBuildBadge();
      }
    });
  }
  function syncVisibility() {
    var active = isActive();
    if (root) document.querySelectorAll('[data-ovyx-quality-trigger]').forEach(function (button) {
      button.hidden = !active;
    });
    if (!active && root) setOverlay(false);
    if (active && root && !root.querySelector('[data-ovyx-quality-trigger]')) addTriggers();
  }
  function addTriggers() {
    var view = document.getElementById('view-webstudio');
    if (view) view.querySelectorAll('[data-ovyx-quality-trigger]').forEach(function (trigger) { trigger.remove(); });
    syncBuildBadge();
  }
  function wrapBuildLifecycle(studio) {
    if (typeof studio.callAI === 'function' && !studio.callAI.__ovyxQualityContract) {
      var originalCallAI = studio.callAI;
      async function qualityContractCallAI(payload, token) {
        var next = payload && typeof payload === 'object' ? Object.assign({}, payload) : {};
        var mode = text(next.mode).toLowerCase();
        var prompt = text(next.prompt);
        var isRepair = /OVYX QUALITY INSPECTOR REPAIR/i.test(prompt);
        var isBuild = mode === 'build' && !isRepair;
        if (isBuild) {
          next.prompt = prompt + '\n\nOVYX WEB STUDIO QUALITY CONTRACT:\n' +
            '- Choose a distinctive visual direction that fits this specific brand, audience and business category; do not reuse a generic AI landing-page template.\n' +
            '- Plan complete pages and visitor journeys before editing. Preserve unrelated existing work and only touch files that are needed.\n' +
            '- Keep DOM trees purposeful (aim below roughly 1,800 rendered elements per route), minimize blocking assets and avoid unnecessary JS dependencies; reported sandbox render timings are not real-world Core Web Vitals.\n' +
            '- Use a deliberate typography scale, spacing rhythm, composition, appropriate imagery, responsive layouts and purposeful motion with reduced-motion support; meet WCAG AA text contrast (4.5:1 normal, 3:1 large/bold) on known solid backgrounds and provide visible :focus/:focus-visible indicators.\n' +
            '- Make navigation and requested controls behave meaningfully. Give forms real validation, loading, success and error states; never fake delivery, payment, booking or authentication when the integration is not configured.\n' +
            '- Do not invent contact details, prices, testimonials, certifications, business facts, API credentials or connected-service status. Keep missing integrations clearly unverified.\n' +
            '- Use generated project files as the source of truth. The existing test and preview gate must be able to inspect the result; do not claim browser tests ran unless they did.\n' +
            '- Return complete valid file contents or supported structured edits for the requested task; do not silently drop requested routes or working features.';
        }
        if (isBuild) {
          buildInFlight = true;
          emitBuildStage({ stage: 'ai-generation', status: 'running', message: 'Creating your website from your brief.' });
        }
        try {
          var result = await originalCallAI.call(this, next, token);
          if (isBuild) emitBuildStage({ stage: 'artifact-received', status: 'success', message: 'Draft received. Checking its pages and resources before opening the preview.' });
          return result;
        } catch (error) {
          if (isBuild) {
            buildInFlight = false;
            emitBuildStage({ stage: 'build-failed', status: 'error', message: 'Website creation could not finish, so no new preview was opened.' });
          }
          throw error;
        }
      }
      qualityContractCallAI.__ovyxQualityContract = true;
      studio.callAI = qualityContractCallAI;
    }
    if (typeof studio.applyAIResult === 'function' && !studio.applyAIResult.__ovyxQualityEvents) {
      var originalApply = studio.applyAIResult;
      function qualityApplyAIResult(result) {
        var value = originalApply.apply(this, arguments);
        if (buildInFlight) emitBuildStage({ stage: 'files-applied', status: 'success', message: 'Draft files were applied. Reviewing the website structure next.' });
        return value;
      }
      qualityApplyAIResult.__ovyxQualityEvents = true;
      studio.applyAIResult = qualityApplyAIResult;
    }
    if (typeof studio.runTests === 'function' && !studio.runTests.__ovyxQualityEvents) {
      var originalTests = studio.runTests;
      function qualityRunTests() {
        if (buildInFlight) emitBuildStage({ stage: 'source-tests', status: 'running', message: 'Checking the saved website files.' });
        var result = originalTests.apply(this, arguments);
        if (buildInFlight) emitBuildStage({ stage: 'source-tests', status: result && result.ok ? 'success' : 'warning', message: result && result.ok ? 'The existing source tests passed.' : 'The source tests reported issues; see the report or console.' });
        return result;
      }
      qualityRunTests.__ovyxQualityEvents = true;
      studio.runTests = qualityRunTests;
    }
    if (typeof studio.renderPreview === 'function' && !studio.renderPreview.__ovyxQualityEvents) {
      // Always delegate to a stable raw renderer, never another feature wrapper.
      var originalPreview = studio.__ovyxRawRenderPreviewV1 ||
        studio.renderPreview.__ovyxRawRenderPreviewV1 ||
        studio.renderPreview.__ovyxPreviewBaseV1 ||
        studio.renderPreview;
      studio.__ovyxRawRenderPreviewV1 = originalPreview;
      function qualityRenderPreview() {
        var shouldPause = studio.__ovyxShouldPauseLivePreviewV1;
        if (typeof shouldPause === 'function' && shouldPause()) return false;
        if (buildInFlight) {
          deferredPreviewRefresh = true;
          emitBuildStage({
            stage: 'preview-refresh',
            status: 'running',
            message: 'The new preview is being checked. Your previous verified preview remains available.'
          });
          return undefined;
        }
        var value = originalPreview.apply(this, arguments);
        try { studio.__ovyxLivePreviewRenderedV1?.(); } catch (_) {}
        emitBuildStage({ stage: 'preview-refresh', status: 'success', message: 'The preview passed quality checks and is ready to review.' });
        return value;
      }
      qualityRenderPreview.__ovyxQualityEvents = true;
      qualityRenderPreview.__ovyxPreviewBaseV1 = originalPreview;
      qualityRenderPreview.__ovyxRawRenderPreviewV1 = originalPreview;
      studio.renderPreview = qualityRenderPreview;
    }
    if (typeof studio.runBuildAgent === 'function' && !studio.runBuildAgent.__ovyxQualityEvents) {
      var originalBuild = studio.runBuildAgent;
      var depth = 0;
      async function qualityRunBuildAgent() {
        var outer = depth === 0;
        var repairCall = arguments[1] === true;
        var qualityGateRejected = false;
        var state = window.KernelState || {};
        var beforeProject = clone(state.activeProject || {});
        var beforeGraph = clone(getGraph(studio));
        var beforeBuildSnapshot = outer && !repairCall ? captureSnapshot(studio) : null;
        depth += 1;
        if (outer) {
          deferredPreviewRefresh = false;
          qualityGateActive = false;
          buildInFlight = true;
          emitBuildStage({ stage: 'planning', status: 'running', message: 'Website request received. Preparing the page files.' });
        }
        try {
          var value = await originalBuild.apply(this, arguments);
          if (outer) {
            var afterProject = window.KernelState && window.KernelState.activeProject || {};
            var afterGraph = getGraph(studio);
            var changed = typeof studio.diffFiles === 'function' ? studio.diffFiles(beforeGraph, afterGraph).length > 0 : JSON.stringify(beforeGraph) !== JSON.stringify(afterGraph);
            var verified = changed && text(afterProject.ovyxBuildVerifiedAt) && text(afterProject.ovyxBuildVerifiedAt) !== text(beforeProject.ovyxBuildVerifiedAt);
            if (!verified) {
              if (changed && beforeBuildSnapshot) {
                qualityGateRejected = true;
                await rejectBuildForQuality(studio, beforeBuildSnapshot, 'The project file graph changed, but the build pipeline did not produce a new verified-source marker.');
                throw new Error('The updated website did not pass initial checks, so your previous version was restored.');
              }
              qualityGateActive = false;
              deferredPreviewRefresh = false;
              buildInFlight = false;
              emitBuildStage({
                stage: 'build-failed',
                status: 'warning',
                message: 'No verified changes were found. Your previous preview remains unchanged.'
              });
            } else if (repairCall) {
              emitBuildStage({
                stage: 'source-verified',
                status: 'info',
                message: 'The changes passed initial checks. Final quality review is still in progress.'
              });
            } else {
              qualityGateActive = true;
              emitBuildStage({
                stage: 'quality-inspection',
                status: 'running',
                message: 'Initial checks passed. Reviewing every page and desktop/mobile layouts before marking the website ready.'
              });
              var report = null;
              var inspectionError = null;
              running = true;
              try {
                report = await performInspection();
              } catch (error) {
                inspectionError = trim(error && error.message || error, 600);
              } finally {
                running = false;
              }

              if (inspectionError || !report) {
                qualityGateRejected = true;
                await rejectBuildForQuality(
                  studio,
                  beforeBuildSnapshot,
                  'The automatic quality inspection did not complete' + (inspectionError ? ': ' + inspectionError + '.' : '.')
                );
                throw new Error('The automatic post-build quality inspection failed. The previous project state was restored where possible.');
              } else if (issueScore(report) > 0) {
                emitBuildStage({
                  stage: 'quality-auto-repair',
                  status: 'running',
                  message: 'The post-build quality inspection found repairable issues. OVYX will attempt one targeted repair, then repeat the checks.'
                });
                await repairWithOVYX();
                var repairedReport = currentReport;
                var repairVerified = !!(repairedReport &&
                  issueScore(repairedReport) === 0 &&
                  repairedReport.checks.some(function (item) {
                    return item.group === 'Automatic repair' && item.status === 'pass';
                  }));
                if (!repairVerified) {
                  qualityGateRejected = true;
                  await rejectBuildForQuality(
                    studio,
                    beforeBuildSnapshot,
                    'The generated website still had failing or warning quality findings after the single bounded repair attempt.'
                  );
                  throw new Error('The generated website did not pass the automatic quality gate. The previous project state was restored where possible.');
                } else {
                  addCheck(repairedReport, 'Automatic build gate', 'Post-build quality gate', 'pass',
                    'The generated files passed source checks, the isolated browser matrix, and one evidence-based repair/re-check pass. Any route-coverage or live-integration limitations remain explicitly reported.');
                  finalizeQualityReport(repairedReport);
                  publishVerifiedPreview(studio);
                  emitBuildStage({
                    stage: 'build-verified',
                    status: 'success',
                    message: 'The automatic post-build quality gate passed after one bounded repair and re-check.'
                  });
                }
              } else {
                addCheck(report, 'Automatic build gate', 'Post-build quality gate', 'pass',
                  'The generated files passed source validation, route/accessibility checks and the isolated responsive browser matrix. Live integrations and any explicit coverage limits remain separately reported.');
                finalizeQualityReport(report);
                publishVerifiedPreview(studio);
                emitBuildStage({
                  stage: 'build-verified',
                  status: 'success',
                  message: 'Source checks and automatic post-build quality inspection passed. The verified project is ready for review.'
                });
              }
            }
          }
          return value;
        } catch (error) {
          if (outer) {
            buildInFlight = false;
            qualityGateActive = false;
            if (!qualityGateRejected) {
              var errorGraph = getGraph(studio);
              var errorChanged = typeof studio.diffFiles === 'function'
                ? studio.diffFiles(beforeGraph, errorGraph).length > 0
                : JSON.stringify(beforeGraph) !== JSON.stringify(errorGraph);
              if (errorChanged && beforeBuildSnapshot) restoreSnapshot(studio, beforeBuildSnapshot);
              deferredPreviewRefresh = false;
              emitBuildStage({ stage: 'build-failed', status: 'error', message: 'Website creation could not be verified, so your previous version was kept or restored.' });
            }
          }
          throw error;
        } finally {
          depth = Math.max(0, depth - 1);
          if (outer) buildInFlight = false;
          syncBuildBadge();
        }
      }
      qualityRunBuildAgent.__ovyxQualityEvents = true;
      studio.runBuildAgent = qualityRunBuildAgent;
    }
  }
  async function performInspection() {
    currentReport = await inspectProject();
    return currentReport;
  }
  function install() {
    var studio = getStudio();
    var view = document.getElementById('view-webstudio');
    if (!studio || !view || !document.body) return false;
    studioRef = studio;
    buildInterface();
    addTriggers();
    bindControls();
    wrapBuildLifecycle(studio);
    syncVisibility();
    if (!window.OVYXWebStudioQuality) {
      window.OVYXWebStudioQuality = {
        run: function () {
          if (running) return Promise.reject(new Error('A Web Studio quality check is already running.'));
          running = true;
          return performInspection().finally(function () {
            running = false;
            renderFindings(currentReport);
          });
        },
        getReport: function () { return clone(currentReport); },
        exportReport: function () { return downloadQualityReport(currentReport); },
        copySummary: copyClientSummary,
        getClientSummary: function () { return currentReport && currentReport.finishedAt ? clientSummary(currentReport) : ''; },
        open: function () { setOverlay(true); return true; },
        close: function () { setOverlay(false); },
        version: '1.2.0'
      };
    }
    return true;
  }

  var attempts = 0;
  function boot() {
    if (install()) return;
    if (attempts++ < 70) setTimeout(boot, 200);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
  window.addEventListener('ovyx:view-changed', function () { setTimeout(boot, 0); });
  window.addEventListener('firebase-auth-state-ready', function () { setTimeout(boot, 0); });
})();