(function () {
  'use strict';
  if (window.__OVYX_WEBSTUDIO_QUALITY_V1__) return;
  window.__OVYX_WEBSTUDIO_QUALITY_V1__ = true;

  var STYLE_ID = 'ovyx-ws-quality-style-v1';
  var ROOT_ID = 'ovyx-ws-quality-root';
  var WIDTHS = [320, 390, 768, 1024, 1440];
  var MAX_BROWSER_PAGES = 12;
  var FRAME_TIMEOUT_MS = 1400;
  var root = null;
  var studioRef = null;
  var currentReport = null;
  var running = false;
  var buildDepth = 0;
  var buildInFlight = false;
  var lastBuildStage = { stage: 'ready', status: 'idle', message: 'Ready to inspect', at: Date.now() };
  var lastFocused = null;
  var stageRows = [
    { id: 'source', label: 'Existing source tests', status: 'pending', detail: 'Waiting to run project checks.' },
    { id: 'audit', label: 'Pages, navigation and accessibility', status: 'pending', detail: 'Waiting to inspect project files.' },
    { id: 'browser', label: 'Responsive browser matrix', status: 'pending', detail: 'Waiting to render the generated pages.' },
    { id: 'truth', label: 'Integration and result reporting', status: 'pending', detail: 'Waiting to summarize verified evidence.' }
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
  function addCheck(report, group, title, status, detail, file) {
    var normalized = ['pass', 'warn', 'fail', 'info'].indexOf(status) >= 0 ? status : 'info';
    report.checks.push({
      group: trim(group, 60),
      title: trim(title, 180),
      status: normalized,
      detail: trim(detail, 1200),
      file: trim(file, 240)
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
    if (!pages.length) {
      addCheck(report, 'Project artifacts', 'Generated website files', 'fail', 'No complete HTML page was found in the project file graph. No preview should be represented as a verified build.');
      return;
    }
    addCheck(report, 'Project artifacts', 'Generated website files', 'pass', pages.length + ' HTML route document(s) are available in the current project file graph.');
    var metadataIssues = [];
    var accessibilityIssues = [];
    var routeIssues = [];
    var resourceIssues = [];
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
        if (/^(?:https?:)?\/\//i.test(ref)) return;
        var target = resolveFile(page.path, ref);
        if (target && !files[target]) resourceIssues.push(page.path + ': local stylesheet "' + trim(ref, 120) + '" is not present in the file graph.');
      });
    });
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
        addCheck(report, 'Responsive styling', 'Large fixed-width rules', 'warn', 'A wide fixed pixel width exists without an obvious max-width constraint. The browser matrix will check for actual horizontal overflow.');
      }
      if (/(?:animation|transition)\s*:/i.test(cssText) && !/prefers-reduced-motion\s*:\s*reduce/i.test(cssText)) {
        addCheck(report, 'Accessibility', 'Reduced-motion preference', 'warn', 'Motion is present but no prefers-reduced-motion: reduce rule was found in project styles.');
      }
    } else {
      addCheck(report, 'Responsive styling', 'Project stylesheets', 'warn', 'No external CSS file was found in the project graph; inline styles may still be present in the page documents.');
    }
    if (interactionIssues.length) addCheck(report, 'Forms and interactions', 'Form delivery', 'warn', interactionIssues.slice(0, 30).join('\n'));
    if (resourceIssues.length) addCheck(report, 'Project assets', 'Local asset references', 'warn', resourceIssues.slice(0, 30).join('\n'));
    var envPaths = Object.keys(files || {}).filter(function (path) { return /(^|\/)\.env(?:\.|$)/i.test(path); });
    if (envPaths.length) securityIssues.push('Environment-like file(s) are present in the project graph: ' + envPaths.slice(0, 8).join(', ') + '.');
    Object.keys(files || {}).forEach(function (path) {
      if (!/\.(?:html?|css|m?js|jsx|tsx|ts)$/i.test(path)) return;
      var contents = fileText(files[path]);
      if (/\b(?:sk-[A-Za-z0-9]{24,}|AIza[0-9A-Za-z_-]{30,})\b|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/.test(contents)) {
        securityIssues.push(path + ': a credential-like value was detected. Its value is deliberately not displayed.');
      }
    });
    addCheck(report, 'Security', 'Client-side secret exposure', statusForFindings(securityIssues.length, true), securityIssues.length ? securityIssues.slice(0, 25).join('\n') : 'No credential-like API key or private-key marker was detected in project HTML, CSS or JavaScript. This is a pattern check, not a complete security audit.');
    if (detectedForms) {
      addCheck(report, 'Integrations', 'Live form and transaction state', 'info', detectedForms + ' form(s) found. The inspector does not submit forms, make purchases, book appointments, authenticate users or call live project APIs. Those integrations remain unverified by this scan.');
    }
    if (detectedButtons) {
      addCheck(report, 'Forms and interactions', 'Interactive controls', 'info', detectedButtons + ' button-like control(s) found. Their labels were inspected; the inspector does not click potentially destructive, payment, booking or account controls automatically.');
    }
    addCheck(report, 'Coverage', 'Source audit coverage', 'pass', 'HTML structure and control checks covered all ' + pages.length + ' generated HTML page(s); ' + checkedIds + ' element ID(s) were inspected.');
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
        notes.push('Local stylesheet "' + trim(href, 100) + '" could not be resolved from the project file graph.');
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
          notes.push('Script "' + trim(ref, 100) + '" was not executed because its source is unavailable in the project graph or is external.');
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
      var encoded = utf8Base64(JSON.stringify(payload));
      var wrapper = '(function(){var p=JSON.parse(decodeURIComponent(escape(atob("' + encoded + '"))));var errs=[];var sent=false;function report(){if(sent)return;sent=true;try{var d=document.documentElement,b=document.body;var vw=window.innerWidth||d.clientWidth||0;var sw=Math.max(d.scrollWidth,b?b.scrollWidth:0);parent.postMessage({type:"ovyx-quality-result",token:p.token,result:{title:document.title||p.title,viewportWidth:vw,scrollWidth:sw,documentHeight:Math.max(d.scrollHeight,b?b.scrollHeight:0),contentLength:(b&&(b.innerText||b.textContent)||"").trim().length,runtimeErrors:errs.slice(0,12)}}, "*")}catch(e){parent.postMessage({type:"ovyx-quality-result",token:p.token,result:{viewportWidth:window.innerWidth||0,scrollWidth:0,runtimeErrors:[String(e&&e.message||e)]}}, "*")}}window.addEventListener("error",function(e){errs.push(String(e.message||"Runtime error").slice(0,240))},true);window.addEventListener("unhandledrejection",function(e){errs.push(String(e.reason&&e.reason.message||e.reason||"Unhandled promise rejection").slice(0,240))});document.open();document.write(p.html);document.close();(p.scripts||[]).forEach(function(src){try{var el=document.createElement("script");el.textContent=src;document.body.appendChild(el)}catch(e){errs.push(String(e&&e.message||e).slice(0,240))}});setTimeout(report,320);setTimeout(report,850)})();';
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
    root.innerHTML = '<style id="' + STYLE_ID + '"></style><div class="ovyx-ws-quality-overlay" data-quality-overlay hidden><section class="ovyx-ws-quality-dialog" role="dialog" aria-modal="true" aria-labelledby="ovyx-ws-quality-title" tabindex="-1"><header class="ovyx-ws-quality-header"><div><div class="ovyx-ws-quality-kicker">OVYX WEB STUDIO · ENGINEERING QA</div><h2 id="ovyx-ws-quality-title">Quality Inspector</h2><p data-quality-subtitle>Inspect the actual generated project files before release.</p></div><button class="ovyx-ws-quality-close" type="button" data-quality-close aria-label="Close Quality Inspector">×</button></header><div class="ovyx-ws-quality-body"><div class="ovyx-ws-quality-summary" data-quality-summary aria-live="polite">Ready to inspect the current project.</div><div class="ovyx-ws-quality-progress" aria-hidden="true"><span data-quality-progress></span></div><div class="ovyx-ws-quality-stages" data-quality-stages></div><section class="ovyx-ws-quality-findings"><div class="ovyx-ws-quality-findings-head"><h3>Findings</h3><span data-quality-counts>Not run</span></div><div class="ovyx-ws-quality-list" data-quality-list><p class="ovyx-ws-quality-empty">Run checks to inspect all generated pages and a responsive browser matrix.</p></div></section><p class="ovyx-ws-quality-note">Safe-test limits: generated code runs in an isolated sandbox with network APIs and form submissions blocked. This inspector does not send contact forms, complete payments, book appointments, or verify a live authentication/API integration.</p></div><footer class="ovyx-ws-quality-footer"><button type="button" data-quality-run class="ovyx-ws-quality-primary">Run quality checks</button><button type="button" data-quality-repair class="ovyx-ws-quality-secondary" disabled>Repair issues with OVYX</button><button type="button" data-quality-console class="ovyx-ws-quality-ghost">Open source tests</button></footer></section></div>';
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
      '#'+ROOT_ID+' .ovyx-ws-quality-file{font:9px/1.5 ui-monospace,monospace;color:#e7bd67;margin-top:4px;overflow-wrap:anywhere}',
      '#'+ROOT_ID+' .ovyx-ws-quality-note{font-size:9px;line-height:1.5;color:#828c9b;border-top:1px solid rgba(255,255,255,.08);padding-top:10px;margin:14px 0 0}',
      '#'+ROOT_ID+' .ovyx-ws-quality-footer{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;padding:13px 22px 17px;border-top:1px solid rgba(255,255,255,.08);background:rgba(0,0,0,.10)}',
      '#'+ROOT_ID+' .ovyx-ws-quality-footer button{min-height:36px;border-radius:9px;padding:8px 12px;font:700 10px/1.2 Inter,system-ui,sans-serif;cursor:pointer;transition:background .16s,border-color .16s}',
      '#'+ROOT_ID+' .ovyx-ws-quality-primary{border:1px solid #d7b261;color:#15130e;background:#e6c577}',
      '#'+ROOT_ID+' .ovyx-ws-quality-primary:hover{background:#f0d58f}',
      '#'+ROOT_ID+' .ovyx-ws-quality-secondary{border:1px solid rgba(230,197,119,.44);color:#ecd6a0;background:rgba(230,197,119,.08)}',
      '#'+ROOT_ID+' .ovyx-ws-quality-ghost{border:1px solid rgba(255,255,255,.13);color:#d1d5db;background:rgba(255,255,255,.035)}',
      '#'+ROOT_ID+' .ovyx-ws-quality-footer button:disabled{opacity:.4;cursor:not-allowed}',
      '.ovyx-ws-quality-trigger{gap:7px!important;display:inline-flex!important;align-items:center!important;white-space:nowrap!important}',
      '.ovyx-ws-quality-trigger [data-ovyx-quality-dot]{font-size:9px;opacity:.82}',
      '.ovyx-ws-quality-trigger[data-build-status="error"],.ovyx-ws-quality-trigger[data-build-status="fail"]{border-color:rgba(248,113,113,.5)!important}',
      '@media(max-width:760px){#'+ROOT_ID+' .ovyx-ws-quality-overlay{padding:0;align-items:stretch}#'+ROOT_ID+' .ovyx-ws-quality-dialog{width:100%;max-height:100dvh;height:100dvh;border-radius:0;border-left:0;border-right:0}#'+ROOT_ID+' .ovyx-ws-quality-header{padding:16px 14px 12px}#'+ROOT_ID+' .ovyx-ws-quality-body{padding:12px 14px}#'+ROOT_ID+' .ovyx-ws-quality-stages{grid-template-columns:repeat(2,minmax(0,1fr))}#'+ROOT_ID+' .ovyx-ws-quality-footer{padding:12px 14px;justify-content:stretch}#'+ROOT_ID+' .ovyx-ws-quality-footer button{flex:1 1 42%;min-width:0}}',
      '@media(max-width:420px){#'+ROOT_ID+' .ovyx-ws-quality-stage{padding:7px;gap:5px}#'+ROOT_ID+' .ovyx-ws-quality-stage b{font-size:9px}#'+ROOT_ID+' .ovyx-ws-quality-header h2{font-size:19px}}',
      '@media(prefers-reduced-motion:reduce){#'+ROOT_ID+' *,#'+ROOT_ID+' *::before,#'+ROOT_ID+' *::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}'
    ].join('\n');
    root.querySelector('style').textContent = css;
    var view = document.getElementById('view-webstudio');
    var hosts = view ? view.querySelectorAll('.ovyx-ws-header-actions') : [];
    if (hosts.length) {
      hosts.forEach(function (host, index) {
        if (host.querySelector('[data-ovyx-quality-trigger]')) return;
        var trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'ovyx-ws-header-button ovyx-ws-quality-trigger';
        trigger.setAttribute('data-ovyx-quality-trigger', '1');
        trigger.setAttribute('aria-haspopup', 'dialog');
        trigger.setAttribute('aria-controls', ROOT_ID + '-dialog');
        trigger.innerHTML = '<i class="fa-solid fa-shield-halved" aria-hidden="true"></i><span data-ovyx-quality-label>Quality</span><small data-ovyx-quality-dot aria-hidden="true">•</small>';
        trigger.addEventListener('click', function (event) { event.preventDefault(); lastFocused = trigger; setOverlay(true); });
        var preview = host.querySelector('#ws-preview-trigger');
        if (preview) host.insertBefore(trigger, preview); else host.appendChild(trigger);
      });
    }
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
  function renderFindings(report) {
    if (!root) return;
    var list = root.querySelector('[data-quality-list]');
    var summary = root.querySelector('[data-quality-summary]');
    var countsNode = root.querySelector('[data-quality-counts]');
    var progress = root.querySelector('[data-quality-progress]');
    var repairButton = root.querySelector('[data-quality-repair]');
    var subtitle = root.querySelector('[data-quality-subtitle]');
    if (!list) return;
    if (!report) {
      list.textContent = '';
      var empty = document.createElement('p');
      empty.className = 'ovyx-ws-quality-empty';
      empty.textContent = 'Run checks to inspect all generated pages and a responsive browser matrix.';
      list.appendChild(empty);
      if (summary) summary.textContent = 'Ready to inspect the current project.';
      if (countsNode) countsNode.textContent = 'Not run';
      if (progress) progress.style.width = '0%';
      if (repairButton) repairButton.disabled = true;
      return;
    }
    var counts = countIssues(report);
    list.textContent = '';
    report.checks.forEach(function (item) {
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
    if (subtitle) subtitle.textContent = report.projectName ? 'Evidence from "' + report.projectName + '" — the currently generated project, not a design mockup.' : 'Evidence from the current generated project, not a design mockup.';
    if (progress) progress.style.width = '100%';
    if (repairButton) repairButton.disabled = running || !report.checks.some(function (item) { return item.status === 'fail' || item.status === 'warn'; });
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
      browser: { total: 0, completed: 0, pagesTested: 0, pagesAvailable: 0, widths: WIDTHS.slice() },
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
        addCheck(report, 'Source validation', 'Existing Web Studio source tests', 'warn', 'The existing source test method was unavailable; the inspector cannot claim that those checks passed.');
      } else {
        addCheck(report, 'Source validation', 'Existing Web Studio source tests', existingTests.ok === true ? 'pass' : 'fail', trim(existingTests.summary + (existingTests.details && existingTests.ok !== true ? '\n' + existingTests.details : ''), 1400));
      }
    } catch (error) {
      addCheck(report, 'Source validation', 'Existing Web Studio source tests', 'fail', 'Source checks threw an error: ' + trim(error && error.message, 400));
    }
    stageStatus('source', 'done', existingTests && existingTests.ok === true ? 'Source checks completed with no reported errors.' : 'Source checks completed; review findings below.');
    renderFindings(report);

    stageStatus('audit', 'running', pages.length + ' generated HTML page(s) found.');
    auditSources(report, pages, files, window.KernelState && window.KernelState.activeProject || {});
    stageStatus('audit', 'done', 'Inspected all generated HTML routes and project code patterns.');
    renderFindings(report);

    stageStatus('browser', 'running', 'Preparing an isolated browser viewport matrix.');
    var coveredPages = pages.slice(0, MAX_BROWSER_PAGES);
    report.browser.pagesAvailable = pages.length;
    if (!pages.length) {
      addCheck(report, 'Browser testing', 'Responsive browser matrix', 'fail', 'No HTML artifact was available to load in an isolated browser. A preview must not be described as browser-verified.');
    } else if (!coveredPages.length) {
      addCheck(report, 'Browser testing', 'Responsive browser matrix', 'warn', 'No page could be selected for the browser matrix.');
    } else {
      report.browser.total = coveredPages.length * WIDTHS.length;
      var overflow = [];
      var scriptErrors = [];
      var timeouts = [];
      var sandboxNotes = [];
      var emptyPages = [];
      var runNumber = 0;
      for (var p = 0; p < coveredPages.length; p += 1) {
        var page = coveredPages[p];
        report.browser.pagesTested = p + 1;
        for (var w = 0; w < WIDTHS.length; w += 1) {
          var width = WIDTHS[w];
          runNumber += 1;
          progressFraction(runNumber, report.browser.total + 4);
          stageStatus('browser', 'running', 'Page ' + (p + 1) + '/' + coveredPages.length + ' · ' + width + 'px viewport.');
          var result;
          try { result = await runViewport(page, files, width, runNumber); }
          catch (error) { result = { timeout: true, result: null, notes: [] }; }
          report.browser.completed += 1;
          (result.notes || []).forEach(function (note) { if (sandboxNotes.indexOf(note) < 0) sandboxNotes.push(note); });
          if (result.timeout || !result.result) {
            timeouts.push(page.path + ' at ' + width + 'px: sandbox did not return a report within ' + FRAME_TIMEOUT_MS + 'ms.');
          } else {
            var browserResult = result.result;
            if (browserResult.viewportWidth && Math.abs(browserResult.viewportWidth - width) > 3) {
              timeouts.push(page.path + ' at requested ' + width + 'px, actual sandbox viewport was ' + browserResult.viewportWidth + 'px.');
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
        }
        renderFindings(report);
      }
      addCheck(report, 'Browser testing', 'Horizontal overflow', overflow.length ? 'fail' : 'pass', overflow.length ? overflow.slice(0, 45).join('\n') : 'No horizontal overflow was detected at ' + WIDTHS.join(', ') + ' CSS-pixel widths across ' + coveredPages.length + ' HTML route(s).');
      addCheck(report, 'Browser testing', 'Page runtime errors', scriptErrors.length ? 'fail' : 'pass', scriptErrors.length ? scriptErrors.slice(0, 35).join('\n') : 'No JavaScript runtime errors were captured in the isolated test runs.');
      if (timeouts.length) addCheck(report, 'Browser testing', 'Sandbox runtime and render completion', 'warn', timeouts.slice(0, 25).join('\n'));
      if (emptyPages.length) addCheck(report, 'Browser testing', 'Page content presence', 'warn', emptyPages.slice(0, 25).join('\n'));
      if (pages.length > coveredPages.length) {
        addCheck(report, 'Coverage', 'Responsive browser matrix coverage', 'warn', 'The browser matrix covered ' + coveredPages.length + ' of ' + pages.length + ' HTML routes because this run is capped at ' + MAX_BROWSER_PAGES + ' routes. Static source audits covered all generated HTML routes.');
      } else {
        addCheck(report, 'Coverage', 'Responsive browser matrix coverage', 'pass', 'Every discovered HTML route was tested at all ' + WIDTHS.length + ' viewport widths.');
      }
      if (sandboxNotes.length) addCheck(report, 'Browser testing', 'Isolated test limitations', 'info', sandboxNotes.slice(0, 20).join('\n'));
    }
    stageStatus('browser', 'done', report.browser.completed + ' actual isolated browser viewport check(s) completed.');
    renderFindings(report);

    stageStatus('truth', 'running', 'Summarizing only observed test results.');
    addCheck(report, 'Integrations', 'Live integration verification', 'info', 'This report verifies source and isolated browser behavior only. Real email delivery, database writes, sign-in, payments, bookings and authenticated API behavior remain unverified unless separately tested against safe test services.');
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
        browser: { total: 0, completed: 0, pagesTested: 0, pagesAvailable: 0, widths: WIDTHS.slice() },
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
      message: 'The new build did not pass its automatic post-build quality gate; the last known project state was restored.'
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
  function findingsForRepair(report) {
    return (report && report.checks || []).filter(function (item) {
      return (item.status === 'fail' || item.status === 'warn') && item.group !== 'Coverage';
    }).slice(0, 35).map(function (item) {
      return '- [' + item.status.toUpperCase() + '] ' + item.group + ' — ' + item.title + (item.file ? ' (' + item.file + ')' : '') + '\n  ' + item.detail.slice(0, 700);
    });
  }
  async function repairWithOVYX() {
    if (running) return;
    var studio = getStudio();
    if (!studio || typeof studio.runBuildAgent !== 'function' || !currentReport) {
      toast('The Web Studio build and repair pipeline is not available in this session.', 'warning');
      return;
    }
    var findings = findingsForRepair(currentReport);
    if (!findings.length) {
      toast('No failing or warning checks need a repair.', 'info');
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
      'Verified findings from the completed quality report:',
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
    if (summary) summary.textContent = 'OVYX is attempting one targeted repair using the existing AI provider and build pipeline.';
    var runButton = root && root.querySelector('[data-quality-run]');
    var repairButton = root && root.querySelector('[data-quality-repair]');
    if (runButton) runButton.disabled = true;
    if (repairButton) repairButton.disabled = true;
    emitBuildStage({ stage: 'quality-repair', status: 'running', message: 'A targeted Web Studio quality repair is in progress.' });
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
      if (!changed || !newVerification) throw new Error('The build pipeline did not return a newly verified website change. The previous project was restored.');
      running = false;
      var afterReport = await inspectProject();
      if (issueScore(afterReport) >= scoreBefore) {
        restoreSnapshot(studio, snapshot);
        currentReport = beforeReport;
        renderFindings(beforeReport);
        var note = 'The attempted repair did not reduce the observed quality issues. OVYX restored the previous project and kept its working preview.';
        addCheck(beforeReport, 'Automatic repair', 'Repair verification', 'warn', note);
        beforeReport.finishedAt = new Date().toISOString();
        beforeReport.status = reportStatus(beforeReport);
        beforeReport.counts = countIssues(beforeReport);
        renderFindings(beforeReport);
        toast(note, 'warning');
      } else {
        currentReport = afterReport;
        addCheck(afterReport, 'Automatic repair', 'Repair verification', 'pass', 'OVYX changed the project, passed the built-in source checks, and the quality score improved from ' + scoreBefore + ' to ' + issueScore(afterReport) + '.');
        afterReport.finishedAt = new Date().toISOString();
        afterReport.status = reportStatus(afterReport);
        afterReport.counts = countIssues(afterReport);
        renderFindings(afterReport);
        toast('OVYX repaired the reported website issues and re-ran the quality checks. Review any remaining warnings.', 'success');
        success = true;
      }
    } catch (error) {
      restoreSnapshot(studio, snapshot);
      currentReport = beforeReport;
      addCheck(beforeReport, 'Automatic repair', 'Repair verification', 'warn', trim(error && error.message || 'The repair could not be verified.', 700) + ' The previous website files and preview were restored.');
      beforeReport.finishedAt = new Date().toISOString();
      beforeReport.status = reportStatus(beforeReport);
      beforeReport.counts = countIssues(beforeReport);
      renderFindings(beforeReport);
      toast('The attempted repair was not verified; the previous project was restored.', 'warning');
    } finally {
      running = false;
      if (runButton) runButton.disabled = false;
      if (repairButton) repairButton.disabled = !(currentReport && currentReport.checks.some(function (item) { return item.status === 'fail' || item.status === 'warn'; }));
      emitBuildStage({ stage: success ? 'build-verified' : 'build-failed', status: success ? 'success' : 'warning', message: success ? 'Targeted repair passed a fresh quality check.' : 'Targeted repair did not pass the quality gate.' });
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
    if (!view) return;
    var hosts = view.querySelectorAll('.ovyx-ws-header-actions');
    hosts.forEach(function (host) {
      if (host.querySelector('[data-ovyx-quality-trigger]')) return;
      var trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'ovyx-ws-header-button ovyx-ws-quality-trigger';
      trigger.setAttribute('data-ovyx-quality-trigger', '1');
      trigger.setAttribute('aria-haspopup', 'dialog');
      trigger.setAttribute('aria-controls', ROOT_ID + '-dialog');
      trigger.innerHTML = '<i class="fa-solid fa-shield-halved" aria-hidden="true"></i><span data-ovyx-quality-label>Quality</span><small data-ovyx-quality-dot aria-hidden="true">•</small>';
      trigger.addEventListener('click', function (event) { event.preventDefault(); lastFocused = trigger; setOverlay(true); });
      var preview = host.querySelector('#ws-preview-trigger');
      if (preview) host.insertBefore(trigger, preview); else host.appendChild(trigger);
    });
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
            '- Use a deliberate typography scale, spacing rhythm, composition, appropriate imagery, accessible contrast, responsive layouts and purposeful motion with reduced-motion support.\n' +
            '- Make navigation and requested controls behave meaningfully. Give forms real validation, loading, success and error states; never fake delivery, payment, booking or authentication when the integration is not configured.\n' +
            '- Do not invent contact details, prices, testimonials, certifications, business facts, API credentials or connected-service status. Keep missing integrations clearly unverified.\n' +
            '- Use generated project files as the source of truth. The existing test and preview gate must be able to inspect the result; do not claim browser tests ran unless they did.\n' +
            '- Return complete valid file contents or supported structured edits for the requested task; do not silently drop requested routes or working features.';
        }
        if (isBuild) {
          buildInFlight = true;
          emitBuildStage({ stage: 'ai-generation', status: 'running', message: 'OVYX is generating website files from the current brief.' });
        }
        try {
          var result = await originalCallAI.call(this, next, token);
          if (isBuild) emitBuildStage({ stage: 'artifact-received', status: 'success', message: 'The AI response returned to Web Studio; the build pipeline will validate its files.' });
          return result;
        } catch (error) {
          if (isBuild) {
            buildInFlight = false;
            emitBuildStage({ stage: 'build-failed', status: 'error', message: 'The AI build request failed before a verified preview was ready.' });
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
        if (buildInFlight) emitBuildStage({ stage: 'files-applied', status: 'success', message: 'The returned file changes were applied to the Web Studio project graph.' });
        return value;
      }
      qualityApplyAIResult.__ovyxQualityEvents = true;
      studio.applyAIResult = qualityApplyAIResult;
    }
    if (typeof studio.runTests === 'function' && !studio.runTests.__ovyxQualityEvents) {
      var originalTests = studio.runTests;
      function qualityRunTests() {
        if (buildInFlight) emitBuildStage({ stage: 'source-tests', status: 'running', message: 'Running the existing project source tests.' });
        var result = originalTests.apply(this, arguments);
        if (buildInFlight) emitBuildStage({ stage: 'source-tests', status: result && result.ok ? 'success' : 'warning', message: result && result.ok ? 'The existing source tests passed.' : 'The source tests reported issues; see the report or console.' });
        return result;
      }
      qualityRunTests.__ovyxQualityEvents = true;
      studio.runTests = qualityRunTests;
    }
    if (typeof studio.renderPreview === 'function' && !studio.renderPreview.__ovyxQualityEvents) {
      var originalPreview = studio.renderPreview;
      function qualityRenderPreview() {
        var value = originalPreview.apply(this, arguments);
        if (buildInFlight) emitBuildStage({ stage: 'preview-refresh', status: 'success', message: 'Web Studio refreshed its preview using the project graph.' });
        return value;
      }
      qualityRenderPreview.__ovyxQualityEvents = true;
      studio.renderPreview = qualityRenderPreview;
    }
    if (typeof studio.runBuildAgent === 'function' && !studio.runBuildAgent.__ovyxQualityEvents) {
      var originalBuild = studio.runBuildAgent;
      var depth = 0;
      async function qualityRunBuildAgent() {
        var outer = depth === 0;
        var repairCall = arguments[1] === true;
        var state = window.KernelState || {};
        var beforeProject = clone(state.activeProject || {});
        var beforeGraph = clone(getGraph(studio));
        var beforeBuildSnapshot = outer && !repairCall ? captureSnapshot(studio) : null;
        depth += 1;
        if (outer) {
          buildInFlight = true;
          emitBuildStage({ stage: 'planning', status: 'running', message: 'Web Studio accepted the build request and is preparing its source graph.' });
        }
        try {
          var value = await originalBuild.apply(this, arguments);
          if (outer) {
            var afterProject = window.KernelState && window.KernelState.activeProject || {};
            var afterGraph = getGraph(studio);
            var changed = typeof studio.diffFiles === 'function' ? studio.diffFiles(beforeGraph, afterGraph).length > 0 : JSON.stringify(beforeGraph) !== JSON.stringify(afterGraph);
            var verified = changed && text(afterProject.ovyxBuildVerifiedAt) && text(afterProject.ovyxBuildVerifiedAt) !== text(beforeProject.ovyxBuildVerifiedAt);
            buildInFlight = false;
            if (!verified) {
              emitBuildStage({
                stage: 'build-failed',
                status: 'warning',
                message: 'No newly verified website change was observed; the last good preview remains authoritative.'
              });
            } else if (repairCall) {
              emitBuildStage({
                stage: 'build-verified',
                status: 'success',
                message: 'The targeted repair passed built-in source verification; the quality repair flow will run its own follow-up checks.'
              });
            } else {
              emitBuildStage({
                stage: 'quality-inspection',
                status: 'running',
                message: 'Source checks passed. Web Studio is now inspecting the actual generated routes and responsive browser previews before marking the build ready.'
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
                await rejectBuildForQuality(
                  studio,
                  beforeBuildSnapshot,
                  'The automatic quality inspection did not complete' + (inspectionError ? ': ' + inspectionError + '.' : '.')
                );
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
                  await rejectBuildForQuality(
                    studio,
                    beforeBuildSnapshot,
                    'The generated website still had failing or warning quality findings after the single bounded repair attempt.'
                  );
                } else {
                  addCheck(repairedReport, 'Automatic build gate', 'Post-build quality gate', 'pass',
                    'The generated files passed source checks, the isolated browser matrix, and one evidence-based repair/re-check pass. Any route-coverage or live-integration limitations remain explicitly reported.');
                  finalizeQualityReport(repairedReport);
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
            emitBuildStage({ stage: 'build-failed', status: 'error', message: 'The build failed. The existing Web Studio recovery path decides whether to restore the last good preview.' });
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
        run: performInspection,
        getReport: function () { return clone(currentReport); },
        close: function () { setOverlay(false); },
        version: '1.0.0'
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