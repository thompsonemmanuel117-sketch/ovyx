(function () {
  'use strict';
  if (window.__OVYX_PROJECT_BRAIN_V1__) return;
  window.__OVYX_PROJECT_BRAIN_V1__ = true;
  const text = value => String(value == null ? '' : value);
  const cleanPath = value => {
    const parts = [];
    for (const part of text(value).replace(/\\/g, '/').split('/')) {
      if (!part || part === '.') continue;
      if (part === '..') { if (parts.length) parts.pop(); continue; }
      parts.push(part);
    }
    return parts.join('/');
  };
  const isHtml = path => /\.html?$/i.test(path);
  const isCss = path => /\.css$/i.test(path);
  const isJs = path => /\.m?js$/i.test(path);
  function attributes(raw) {
    const out = {};
    const re = /([^\s"'<>/=]+)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>]+)))?/g;
    let match;
    while ((match = re.exec(text(raw))) !== null) {
      const key = match[1].toLowerCase();
      if (!(key in out)) out[key] = match[2] ?? match[3] ?? match[4] ?? '';
    }
    return out;
  }
  function parseTags(source) {
    const result = [];
    const re = /<([a-z][a-z0-9-]*)\b([^>]*)>/gi;
    let match;
    while ((match = re.exec(text(source))) !== null) result.push({ tag: match[1].toLowerCase(), attrs: attributes(match[2]), raw: match[0], index: match.index });
    return result;
  }
  function normalizeFiles(project) {
    const output = {};
    const input = project && project.files && typeof project.files === 'object' ? project.files : {};
    if (Array.isArray(input)) {
      for (const item of input) {
        const path = cleanPath(item?.path || item?.file || item?.name || '');
        const value = typeof item === 'string' ? item : (item?.content ?? item?.text ?? item?.source ?? item?.code ?? '');
        if (path && text(value)) output[path] = text(value);
      }
    } else {
      for (const [rawPath, value] of Object.entries(input)) {
        const path = cleanPath(rawPath);
        const content = typeof value === 'string' ? value : (value?.content ?? value?.text ?? value?.source ?? value?.code ?? '');
        if (path && text(content)) output[path] = text(content);
      }
    }
    if (!Object.keys(output).some(isHtml) && /<html\b|<!doctype\s+html/i.test(text(project?.entryHtml))) output['index.html'] = text(project.entryHtml);
    return Object.fromEntries(Object.entries(output).slice(0, 80));
  }
  function normalizeRoute(raw) {
    let value = text(raw).trim();
    if (!value) return '';
    try { if (/^[a-z][a-z0-9+.-]*:/i.test(value)) value = new URL(value).pathname; }
    catch (_) { return ''; }
    value = value.split(/[?#]/)[0].replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '').replace(/\/+$/, '').replace(/\.html?$/i, '').toLowerCase();
    return value ? '/' + value.split('/').filter(Boolean).join('/') + '/' : '/';
  }
  function routesFor(project, files) {
    const routes = new Map();
    const add = (route, file) => {
      const key = normalizeRoute(route), path = cleanPath(file);
      if (key && path && files[path]) routes.set(key, path);
    };
    for (const [route, path] of Object.entries(project?.routes && typeof project.routes === 'object' ? project.routes : {})) add(route, path);
    const pages = Object.keys(files).filter(isHtml);
    const entry = pages.find(path => /(^|\/)index\.html?$/i.test(path) ) || pages.find(path => /(^|\/)home\.html?$/i.test(path)) || pages[0];
    if (entry) add('/', entry);
    for (const path of pages) {
      add(path, path);
      const base = path.split('/').pop().replace(/\.html?$/i, '');
      if (/^(index|home)$/i.test(base)) add('/', path); else add(base, path);
      const pagePath = path.replace(/^(src\/)?pages\//i, '').replace(/\.html?$/i, '');
      if (pagePath && !/^(index|home)$/i.test(pagePath)) add(pagePath, path);
    }
    return routes;
  }
  function fileCandidates(ref, currentFile) {
    const raw = text(ref).trim().split(/[?#]/)[0];
    if (!raw || /^(data:|blob:|mailto:|tel:|javascript:|#)/i.test(raw) || raw.startsWith('//')) return [];
    try { const u = new URL(raw); if (/^https?:$/.test(u.protocol)) return []; } catch (_) {}
    const out = [];
    const add = value => { const path = cleanPath(value); if (path && !out.includes(path)) out.push(path); };
    if (raw.startsWith('/')) {
      const root = cleanPath(raw);
      add(root); add('public/' + root); add(root.replace(/^public\//, ''));
    } else {
      const dir = cleanPath(currentFile).split('/').slice(0, -1).join('/');
      add((dir ? dir + '/' : '') + raw); add(raw); add('public/' + raw);
    }
    const base = cleanPath(raw).split('/').pop();
    if (base) { add(base); add('public/' + base); }
    return out;
  }
  function selectorReferences(source) {
    const found = [];
    const add = (kind, value, evidence) => {
      const key = kind + ':' + value;
      if (value && !found.some(item => item.key === key)) found.push({ key, kind, value, evidence: text(evidence).slice(0, 140) });
    };
    const raw = text(source);
    for (const match of raw.matchAll(/getElementById\(\s*(['"])([^'"]+)\1\s*\)/g)) add('id', match[2], match[0]);
    for (const match of raw.matchAll(/querySelector(?:All)?\(\s*(['"])(#[a-zA-Z_][\w:-]*|\.[a-zA-Z_][\w-]*)[^'"]*\1\s*\)/g)) {
      if (match[2].startsWith('#')) add('id', match[2].slice(1), match[0]);
      else add('class', match[2].slice(1), match[0]);
    }
    return found.slice(0, 400);
  }
  function analyze(project, runtimeSnapshot) {
    const files = normalizeFiles(project), paths = Object.keys(files), htmlPaths = paths.filter(isHtml);
    const entry = htmlPaths.find(path => /(^|\/)index\.html?$/i.test(path)) || htmlPaths[0] || '';
    const routes = routesFor(project || {}, files);
    const nodes = [], edges = [], controls = [], findings = [], seen = new Set();
    let linksChecked = 0, dependenciesChecked = 0;
    const addNode = (id, type, label, file, props = {}) => {
      if (!nodes.some(node => node.id === id)) nodes.push({ id, type, label: text(label).slice(0, 100), file: file || '', ...props });
    };
    const addEdge = (from, to, type, evidence) => {
      if (!nodes.some(node => node.id === from) || !nodes.some(node => node.id === to)) return;
      if (!edges.some(edge => edge.from === from && edge.to === to && edge.type === type)) edges.push({ from, to, type, evidence: text(evidence).slice(0, 120) });
    };
    const finding = (severity, code, message, file, evidence, extra = {}) => {
      const row = { severity, code, message, file: file || '', evidence: text(evidence).slice(0, 240), ...extra };
      const key = [severity, code, row.file, row.evidence].join('|');
      if (!seen.has(key) && findings.length < 120) { seen.add(key); findings.push(row); }
    };
    const resolveResource = (ref, from) => fileCandidates(ref, from).find(candidate => Object.hasOwn(files, candidate)) || '';
    const filesByBase = new Map();
    for (const path of paths) {
      addNode('file:' + path, isHtml(path) ? 'page' : isCss(path) ? 'style' : isJs(path) ? 'script' : 'asset', path, path);
      const base = path.split('/').pop().toLowerCase();
      if (!filesByBase.has(base)) filesByBase.set(base, []);
      filesByBase.get(base).push(path);
    }
    if (!paths.length) finding('error', 'EMPTY_PROJECT', 'No generated source files were returned.', '', 'Project files map is empty.');
    if (!entry) finding('error', 'MISSING_HTML_ENTRY', 'No HTML entry page was found in the generated file map.', '', paths.join(', ') || 'No files were returned.');
    else finding('pass', 'HTML_ENTRY_PRESENT', 'HTML entry page exists.', entry, 'Generated HTML file found.');
    if (paths.length) finding('pass', 'SOURCE_FILES_READ', 'Read ' + paths.length + ' source files for dependency checks.', entry, paths.join(', '));

    const allJavaScript = paths.filter(isJs).map(path => files[path]).join('\n');
    const selectors = selectorReferences(allJavaScript);
    for (const path of htmlPaths) {
      const source = files[path], parsed = parseTags(source), ids = new Set(), classes = new Set();
      for (const item of parsed) {
        if (item.attrs.id) ids.add(item.attrs.id);
        text(item.attrs.class || '').split(/\s+/).filter(Boolean).forEach(cls => classes.add(cls));
      }
      const fileNode = 'file:' + path;
      const title = source.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i);
      if (title && text(title[1]).replace(/<[^>]+>/g, '').trim()) finding('pass', 'TITLE_PRESENT', 'Document title is present.', path, text(title[1]).replace(/<[^>]+>/g, '').trim());
      else finding('warning', 'TITLE_MISSING', 'Page has no descriptive document title.', path, 'Expected a non-empty <title>.');
      if (/<meta\b[^>]*name\s*=\s*(['"])viewport\1/i.test(source)) finding('pass', 'VIEWPORT_PRESENT', 'Responsive viewport metadata is present.', path, 'meta[name=viewport]');
      else finding('warning', 'VIEWPORT_MISSING', 'Page has no viewport metadata.', path, '<meta name="viewport" content="width=device-width,initial-scale=1">');

      const formStarts = parsed.filter(item => item.tag === 'form').map(item => item.index);
      const formEnds = [...source.matchAll(/<\/form\s*>/gi)].map(match => match.index);
      for (const item of parsed) {
        const a = item.attrs;
        if (item.tag === 'a') {
          linksChecked++;
          const href = text(a.href).trim();
          const linkId = 'component:' + path + ':link:' + item.index;
          addNode(linkId, 'link', a['aria-label'] || a.title || 'Link', path, { href });
          controls.push({ type: 'link', label: a['aria-label'] || a.title || '', href, file: path, componentId: linkId });
          if (!href) { finding('error', 'LINK_WITHOUT_HREF', 'Anchor has no href destination.', path, item.raw); continue; }
          if (/^(javascript:|data:|file:)/i.test(href)) { finding('error', 'UNSAFE_LINK_SCHEME', 'Anchor uses an unsupported navigation scheme.', path, href); continue; }
          if (/^(https?:)?\/\//i.test(href) || /^(mailto:|tel:)/i.test(href)) { finding('info', 'EXTERNAL_LINK_NOT_FETCHED', 'External destination is present but reachability is not tested by this local project audit.', path, href); continue; }
          if (href.startsWith('#')) {
            let target = href.slice(1);
            try { target = decodeURIComponent(target); } catch (_) {}
            if (!target) finding('warning', 'BARE_FRAGMENT', 'Link points to a bare #; confirm its intended outcome.', path, href);
            else if (!ids.has(target)) finding('error', 'BROKEN_FRAGMENT', 'In-page link target does not exist in this HTML page.', path, href, { target });
            else { finding('pass', 'FRAGMENT_LINK_OK', 'In-page anchor target exists.', path, href, { target }); }
            continue;
          }
          const route = normalizeRoute(href);
          let targetFile = routes.get(route) || '';
          const direct = resolveResource(href, path);
          if (!targetFile && direct && isHtml(direct)) targetFile = direct;
          if (!targetFile) {
            const base = (route.split('/').filter(Boolean).pop() || '').toLowerCase() + '.html';
            const choices = filesByBase.get(base);
            if (choices && choices.length === 1) targetFile = choices[0];
          }
          if (targetFile) { finding('pass', 'ROUTE_TARGET_OK', 'Internal route maps to a generated HTML file.', path, href, { route, targetFile }); addEdge(fileNode, 'file:' + targetFile, 'navigation', href); }
          else finding('error', 'BROKEN_INTERNAL_ROUTE', 'Internal route does not map to a generated HTML file.', path, href, { route });
          continue;
        }

        if (['link', 'script', 'img', 'source', 'video', 'audio'].includes(item.tag)) {
          const attr = item.tag === 'link' ? 'href' : 'src', ref = text(a[attr]).trim();
          if (!ref) {
            if (['script', 'img'].includes(item.tag) || (item.tag === 'link' && /stylesheet/i.test(a.rel || ''))) finding('warning', 'RESOURCE_SOURCE_MISSING', item.tag + ' element has no ' + attr + '.', path, item.raw);
            continue;
          }
          if (/^(https?:)?\/\//i.test(ref) || /^(data:|blob:)/i.test(ref)) {
            if (/^https?:/i.test(ref)) finding('info', 'EXTERNAL_RESOURCE_UNVERIFIED', 'External resource is not downloaded or verified by this audit.', path, ref);
            continue;
          }
          if (item.tag === 'link' && /stylesheet/i.test(a.rel || '')) {
            dependenciesChecked++;
            const target = resolveResource(ref, path);
            if (target && isCss(target)) { finding('pass', 'STYLESHEET_DEPENDENCY_OK', 'Referenced stylesheet exists.', path, ref, { targetFile: target }); addEdge(fileNode, 'file:' + target, 'stylesheet', ref); }
            else finding('error', 'STYLESHEET_DEPENDENCY_MISSING', 'HTML references a stylesheet missing from generated files.', path, ref);
          } else if (item.tag === 'script') {
            dependenciesChecked++;
            const target = resolveResource(ref, path);
            if (target && isJs(target)) { finding('pass', 'SCRIPT_DEPENDENCY_OK', 'Referenced script exists.', path, ref, { targetFile: target }); addEdge(fileNode, 'file:' + target, 'script', ref); }
            else finding('error', 'SCRIPT_DEPENDENCY_MISSING', 'HTML references a script missing from generated files.', path, ref);
          } else if (['img', 'source', 'video', 'audio'].includes(item.tag)) {
            dependenciesChecked++;
            const target = resolveResource(ref, path);
            if (target) { finding('pass', 'LOCAL_ASSET_OK', 'Referenced local asset exists.', path, ref, { targetFile: target }); addEdge(fileNode, 'file:' + target, 'asset', ref); }
            else if (item.tag === 'img') finding('warning', 'LOCAL_IMAGE_NOT_IN_PROJECT', 'Image source is not a generated file; verify it loads in the live preview.', path, ref);
          }
          if (item.tag === 'img' && !('alt' in a)) finding('warning', 'IMAGE_ALT_MISSING', 'Image has no alt attribute.', path, item.raw);
        }

        if (['button', 'input', 'select', 'textarea'].includes(item.tag)) {
          const inForm = formStarts.some((start, index) => start < item.index && (!formEnds.some(end => end > start && end < item.index)));
          const id = text(a.id || ''), type = item.tag === 'input' ? text(a.type || 'text').toLowerCase() : item.tag;
          const label = text(a['aria-label'] || a.title || a.name || id || item.tag).slice(0, 100);
          const before = source.slice(0, item.index);
          const wrappedLabel = before.lastIndexOf('<label') > before.lastIndexOf('</label') && source.indexOf('</label', item.index) >= 0;
          const associatedLabel = id && (source.includes('for="' + id + '"') || source.includes("for='" + id + "'"));
          const buttonText = item.tag === 'button' ? source.slice(item.index + item.raw.length, Math.max(item.index + item.raw.length, source.indexOf('</button', item.index))).replace(/<[^>]+>/g, '').trim() : '';
          const hasLabel = Boolean(a['aria-label'] || a['aria-labelledby'] || wrappedLabel || associatedLabel || buttonText);
          if (!(item.tag === 'input' && type === 'hidden') && !hasLabel) finding('warning', 'CONTROL_LABEL_MISSING', 'Control may not have a programmatic label.', path, item.raw);
          if (a.disabled !== undefined || a['aria-disabled'] === 'true') finding('warning', 'CONTROL_DISABLED', 'Control is disabled in source.', path, item.raw);
          let action = '';
          if (a.onclick) action = 'inline onclick';
          else if (item.tag === 'button' && text(a.type).toLowerCase() === 'submit' && inForm) action = 'Stage 4 form bridge';
          else if (id) {
            const hook = paths.filter(isJs).find(js => files[js].includes("getElementById('" + id + "')") || files[js].includes('getElementById("' + id + '")') || files[js].includes("'#" + id + "'") || files[js].includes('"#' + id + '"'));
            if (hook) action = 'JavaScript selector in ' + hook;
          }
          if (item.tag === 'button' && !action && !inForm) finding('warning', 'BUTTON_ACTION_UNVERIFIED', 'No source evidence of a button handler was found. Side-effecting controls are not clicked automatically.', path, item.raw);
          else if (item.tag === 'button' && action) finding('pass', 'BUTTON_ACTION_EVIDENCE', 'Button has a detectable action path.', path, item.raw, { actionEvidence: action });
          const componentId = 'component:' + path + ':' + (id ? '#' + id : item.tag + ':' + item.index);
          addNode(componentId, item.tag === 'button' ? 'button' : 'control', id ? '#' + id : label, path);
          controls.push({ type, id, label, file: path, disabled: a.disabled !== undefined || a['aria-disabled'] === 'true', actionEvidence: action, componentId });
        }
      }
      const ids = new Set(), classes = new Set();
      for (const item of parsed) {
        if (item.attrs.id) ids.add(item.attrs.id);
        text(item.attrs.class || '').split(/\s+/).filter(Boolean).forEach(cls => classes.add(cls));
      }
      for (const selector of selectors) {
        const exists = selector.kind === 'id' ? ids.has(selector.value) : classes.has(selector.value);
        if (exists) {
          const id = 'component:' + path + ':' + (selector.kind === 'id' ? '#' : '.') + selector.value;
          addNode(id, 'component', (selector.kind === 'id' ? '#' : '.') + selector.value, path);
          for (const js of paths.filter(isJs)) if (files[js].includes(selector.evidence)) addEdge('file:' + js, id, 'script-hook', selector.evidence);
        } else if (selector.kind === 'id') finding('warning', 'JS_TARGET_NOT_IN_HTML', 'JavaScript refers to an ID absent from this HTML file; it may be created dynamically.', path, selector.evidence, { target: selector.value });
      }
      for (const css of paths.filter(isCss)) {
        for (const match of files[css].matchAll(/#([a-zA-Z_][\w:-]*)/g)) if (ids.has(match[1])) {
          const id = 'component:' + path + ':#' + match[1];
          addNode(id, 'component', '#' + match[1], path); addEdge('file:' + css, id, 'style-hook', '#' + match[1]);
        }
        for (const match of files[css].matchAll(/\.([a-zA-Z_][\w-]*)/g)) if (classes.has(match[1])) {
          const id = 'component:' + path + ':.' + match[1];
          addNode(id, 'component', '.' + match[1], path); addEdge('file:' + css, id, 'style-hook', '.' + match[1]);
        }
      }
      for (const tag of parsed.filter(item => item.tag === 'form')) {
        controls.push({ type: 'form', id: tag.attrs.id || '', label: tag.attrs['aria-label'] || tag.attrs.id || 'Form', file: path, actionEvidence: 'Stage 4 local form bridge' });
        addNode('component:' + path + ':form:' + tag.index, 'form', tag.attrs['aria-label'] || tag.attrs.id || 'Form', path);
      }
    }

    for (const path of paths.filter(isCss)) {
      const source = files[path];
      for (const match of source.matchAll(/@import\s+(?:url\()?['"]?([^'")\s;]+)['"]?\s*\)?/gi)) {
        const ref = match[1]; dependenciesChecked++;
        if (/^(https?:)?\/\//i.test(ref)) finding('info', 'EXTERNAL_CSS_IMPORT', 'External CSS import was not fetched or verified.', path, ref);
        else {
          const target = resolveResource(ref, path);
          if (target) { finding('pass', 'CSS_IMPORT_OK', 'CSS import resolves to a generated file.', path, ref, { targetFile: target }); addEdge('file:' + path, 'file:' + target, 'css-import', ref); }
          else finding('error', 'CSS_IMPORT_MISSING', 'CSS imports a local file missing from the project.', path, ref);
        }
      }
      for (const match of source.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi)) {
        const ref = text(match[1]).trim();
        if (!ref || /^(data:|blob:|https?:|\/\/|#)/i.test(ref)) continue;
        dependenciesChecked++;
        const target = resolveResource(ref, path);
        if (target) { finding('pass', 'CSS_ASSET_OK', 'CSS asset reference resolves to a generated file.', path, ref, { targetFile: target }); addEdge('file:' + path, 'file:' + target, 'css-asset', ref); }
        else finding('warning', 'CSS_ASSET_MISSING', 'CSS references an asset not included in project files.', path, ref);
      }
    }
    for (const path of paths.filter(isJs)) {
      const source = files[path];
      for (const match of source.matchAll(/(?:import\s+(?:[^'"]+?\s+from\s+)?|import\s*\(|require\s*\()\s*(['"])(\.{1,2}\/[^'"]+)\1/g)) {
        const ref = match[2]; dependenciesChecked++;
        const target = resolveResource(ref, path);
        if (target) { finding('pass', 'MODULE_IMPORT_OK', 'Local JavaScript import resolves to a generated file.', path, ref, { targetFile: target }); addEdge('file:' + path, 'file:' + target, 'module-import', ref); }
        else finding('error', 'MODULE_IMPORT_MISSING', 'JavaScript imports a local module missing from project files.', path, ref);
      }
      if (/\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\s*\(/.test(source)) {
        const evidence = source.match(/.{0,25}(?:\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\s*\().{0,65}/)?.[0] || 'fetch/XHR/WebSocket';
        finding('warning', 'DIRECT_NETWORK_BLOCKED', 'JavaScript appears to call the network directly; the preview blocks connect-src. Use the authorized OVYXApp bridge or configure a backend.', path, evidence);
      }
    }
    if (runtimeSnapshot && typeof runtimeSnapshot === 'object') {
      const route = text(runtimeSnapshot.route || entry);
      if (runtimeSnapshot.loaded === true && text(runtimeSnapshot.title).trim()) finding('pass', 'LIVE_PREVIEW_LOADED', 'Real preview confirmed a loaded HTML page.', route, 'document.title=' + text(runtimeSnapshot.title).slice(0, 140));
      else finding('error', 'LIVE_PREVIEW_NOT_CONFIRMED', 'Preview did not confirm a loaded HTML page.', route, text(runtimeSnapshot.error || 'No runtime snapshot received.'));
      for (const error of (Array.isArray(runtimeSnapshot.errors) ? runtimeSnapshot.errors : []).slice(0, 10)) finding('error', 'LIVE_RUNTIME_ERROR', 'Live page emitted a JavaScript/runtime error.', route, text(error).slice(0, 200));
      if (runtimeSnapshot.loaded === true) {
        const liveLinks = Array.isArray(runtimeSnapshot.links) ? runtimeSnapshot.links : [];
        const liveControls = Array.isArray(runtimeSnapshot.controls) ? runtimeSnapshot.controls : [];
        const liveForms = Array.isArray(runtimeSnapshot.forms) ? runtimeSnapshot.forms : [];
        finding('pass', 'LIVE_LINKS_INSPECTED', 'Inspected ' + liveLinks.length + ' rendered links in the live preview.', route, liveLinks.slice(0, 10).map(item => item.href || '(no href)').join(', '));
        finding('pass', 'LIVE_CONTROLS_INSPECTED', 'Inspected ' + liveControls.length + ' rendered controls in the live preview.', route, liveControls.slice(0, 10).map(item => item.id || item.type || item.tag).join(', '));
        for (const control of liveControls) if (control.disabled) finding('warning', 'LIVE_CONTROL_DISABLED', 'Rendered control is disabled in current page.', route, [control.tag, control.id, control.label].filter(Boolean).join(' '));
        if (liveForms.length) finding('pass', 'LIVE_FORMS_PRESENT', 'The live page rendered ' + liveForms.length + ' form(s); Stage 4 supplies a local outcome on user submission.', route, liveForms.map(item => item.id || item.name || 'unnamed form').join(', '));
      }
    }
    finding('pass', 'COMPONENT_INDEXED', 'Indexed ' + controls.length + ' links, forms and controls.', '', controls.slice(0, 12).map(item => item.id || item.href || item.label).join(', '));
    const failures = findings.filter(item => item.severity === 'error').length;
    const warnings = findings.filter(item => item.severity === 'warning').length;
    const passes = findings.filter(item => item.severity === 'pass').length;
    const info = findings.filter(item => item.severity === 'info').length;
    return {
      schemaVersion: 1, projectId: text(project?.id), projectName: text(project?.name), checkedAt: new Date().toISOString(),
      status: failures ? 'failed' : warnings ? 'needs-attention' : 'passed',
      summary: {
        files: paths.length, htmlPages: htmlPaths.length, dependencies: edges.filter(edge => /stylesheet|script|asset|import/.test(edge.type)).length,
        componentDependencies: edges.filter(edge => /style-hook|script-hook/.test(edge.type)).length,
        links: linksChecked, controls: controls.length, forms: controls.filter(item => item.type === 'form').length,
        findings: findings.length, passed: passes, warnings, failures, info, runtimeChecked: Boolean(runtimeSnapshot?.loaded)
      },
      graph: { nodes: nodes.slice(0, 600), edges: edges.slice(0, 1200) },
      routes: Object.fromEntries(routes.entries()), controls: controls.slice(0, 300), checks: findings
    };
  }
  function attachPreview(frame, projectId, getProject, onReport) {
    if (!frame || typeof getProject !== 'function' || typeof onReport !== 'function') return () => {};
    const token = 'pbrain-' + text(projectId) + '-' + Math.random().toString(36).slice(2, 12);
    let latestSnapshot = null, timer = 0, disposed = false;
    const emit = () => {
      if (disposed) return;
      try { onReport(analyze(getProject(), latestSnapshot)); }
      catch (error) { console.warn('[OVYX Project Brain]', error); }
    };
    const onMessage = event => {
      if (event.source !== frame.contentWindow) return;
      const packet = event.data && event.data.ovyxProjectBrainSnapshot;
      if (!packet || packet.projectId !== text(projectId) || packet.token !== token) return;
      latestSnapshot = packet.snapshot && typeof packet.snapshot === 'object' ? packet.snapshot : null;
      if (timer) clearTimeout(timer);
      emit();
    };
    const requestSnapshot = () => {
      if (disposed || !frame.contentWindow) return;
      try { frame.contentWindow.postMessage({ ovyxProjectBrainInspect: { projectId: text(projectId), token } }, '*'); } catch (_) {}
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { if (!latestSnapshot) emit(); }, 1800);
    };
    const onLoad = () => { latestSnapshot = null; requestSnapshot(); };
    window.addEventListener('message', onMessage);
    frame.addEventListener('load', onLoad);
    const dispose = () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      frame.removeEventListener('load', onLoad);
    };
    emit();
    dispose.refresh = () => { latestSnapshot = null; emit(); requestSnapshot(); };
    return dispose;
  }
  window.OVYXProjectBrain = Object.freeze({ version: 1, analyze, attachPreview });
})();
