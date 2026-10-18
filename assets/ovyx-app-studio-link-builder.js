(function () {
  'use strict';
  if (window.__OVYX_APP_STUDIO_LINK_BUILDER_V1__) return;
  window.__OVYX_APP_STUDIO_LINK_BUILDER_V1__ = true;

  const PANEL_ID = 'ovyx-app-studio-url-analyzer-panel';
  const BUILD_ID = 'ovyx-app-studio-link-build';
  const BRAND_ID = 'ovyx-app-studio-brand-dna-panel';
  const $ = (root, selector) => root?.querySelector(selector);
  const clean = (value, max = 180) => String(value == null ? '' : value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, max);
  const validColor = value => /^#[0-9a-f]{6}$/i.test(String(value || ''));
  const colorKeys = ['primary', 'secondary', 'accent', 'background', 'surface', 'text', 'muted'];
  let busy = false;
  let observer = null;

  function safePublicUrl(value) {
    try {
      const url = new URL(String(value || ''));
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
      const host = url.hostname.toLowerCase().replace(/\.$/, '');
      if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
        host.endsWith('.internal') || host.endsWith('.lan') || host === 'metadata.google') return '';
      if (url.port && !['80', '443'].includes(url.port)) return '';
      url.search = '';
      url.hash = '';
      return url.href.slice(0, 1000);
    } catch (_) { return ''; }
  }

  function evidenceFrom(report) {
    const rawSource = report?.source || {};
    const canonicalUrl = safePublicUrl(rawSource.canonicalUrl || rawSource.inputUrl || '');
    if (!canonicalUrl) throw new Error('The analyzer report has no suitable public HTTP or HTTPS source URL. Analyze the URL again.');
    const canonical = new URL(canonicalUrl);
    const rawBrand = report?.branding || {};
    const colors = {};
    const rawColors = rawBrand.colors && typeof rawBrand.colors === 'object' ? rawBrand.colors : {};
    colorKeys.forEach(key => { if (validColor(rawColors[key])) colors[key] = String(rawColors[key]).toUpperCase(); });
    const seenPages = new Set();
    const pages = [];
    const rawPages = Array.isArray(report?.siteMap?.pages) ? report.siteMap.pages : Array.isArray(report?.pages) ? report.pages : [];
    rawPages.slice(0, 6).forEach(page => {
      const url = safePublicUrl(page?.url || '');
      const title = clean(page?.title || page?.path || url, 100);
      if (!title) return;
      const key = url || title;
      if (seenPages.has(key)) return;
      seenPages.add(key);
      pages.push({ title, url, path: clean(page?.path, 220), depth: Math.max(0, Math.min(6, Number(page?.depth) || 0)),
        category: clean(page?.category, 80), status: clean(page?.status, 40), httpStatus: Number.isInteger(Number(page?.httpStatus)) ? Number(page.httpStatus) : null });
    });
    const seenAssets = new Set();
    const assets = [];
    (Array.isArray(report?.assets?.items) ? report.assets.items : []).slice(0, 80).forEach(asset => {
      const url = safePublicUrl(asset?.url || '');
      if (!url || seenAssets.has(url) || assets.length >= 12) return;
      seenAssets.add(url);
      assets.push({ type: clean(asset?.type || 'asset', 32), url, alt: clean(asset?.alt, 120) });
    });
    const summary = report?.summary || {};
    return {
      version: 1,
      source: { canonicalUrl, hostname: canonical.hostname.toLowerCase(), title: clean(rawSource.title || rawSource.pageTitle, 140) },
      summary: { pagesInspected: Math.max(0, Math.min(100, Number(summary.pagesInspected) || 0)),
        internalLinksDiscovered: Math.max(0, Math.min(500, Number(summary.internalLinksDiscovered) || 0)),
        assetsDiscovered: Math.max(0, Math.min(500, Number(summary.assetsDiscovered) || 0)) },
      branding: { name: clean(rawBrand.name || canonical.hostname.split('.')[0], 100), colors,
        logoUrl: safePublicUrl(rawBrand.logo?.url || rawBrand.logoUrl || ''),
        faviconUrl: safePublicUrl(rawBrand.faviconUrl || ''),
        confidence: ['high', 'medium', 'low'].includes(String(rawBrand.confidence || '').toLowerCase()) ? String(rawBrand.confidence).toLowerCase() : 'low' },
      pages, assets
    };
  }

  function status(message, kind) {
    const root = document.getElementById(PANEL_ID);
    const item = $(root, '[data-ua-status]');
    if (item) { item.textContent = String(message || ''); item.dataset.kind = kind || 'info'; }
    if (kind === 'error') {
      try { window.showToast?.(String(message || 'Link-based build failed.'), 'error'); } catch (_) {}
    }
  }

  function addStyles() {
    if (document.getElementById(BUILD_ID + '-styles')) return;
    const style = document.createElement('style');
    style.id = BUILD_ID + '-styles';
    style.textContent = [
      '#' + BUILD_ID + '{margin-top:14px;padding:14px;border:1px solid rgba(214,180,103,.28);border-radius:13px;background:linear-gradient(135deg,rgba(214,180,103,.075),rgba(255,255,255,.018))}',
      '#' + BUILD_ID + ' .ovyx-link-build__eyebrow{font:800 9px/1.2 ui-monospace,monospace;letter-spacing:.14em;color:#d6b467;text-transform:uppercase;margin:0 0 7px}',
      '#' + BUILD_ID + ' h4{font-size:15px;font-weight:800;color:#fff;margin:0 0 6px}',
      '#' + BUILD_ID + ' p{font-size:12px;line-height:1.55;color:#a1a1aa;margin:0 0 12px}',
      '#' + BUILD_ID + ' button{width:100%;min-height:42px;border:1px solid rgba(214,180,103,.45);border-radius:10px;padding:10px 14px;background:#e8c779;color:#12110e;font-size:12px;font-weight:850;cursor:pointer}',
      '#' + BUILD_ID + ' button:disabled{opacity:.55;cursor:wait}',
      '#' + BUILD_ID + ' [data-link-build-status]{min-height:18px;margin:9px 0 0;color:#8f949b;font-size:11px}',
      '#' + BUILD_ID + ' [data-link-build-status][data-kind="error"]{color:#fda4af}',
      '#' + BUILD_ID + ' [data-link-build-status][data-kind="success"]{color:#86efac}',
      '@media(max-width:600px){#' + BUILD_ID + '{padding:11px}}'
    ].join('');
    document.head.appendChild(style);
  }

  function insertAction() {
    const panel = document.getElementById(PANEL_ID);
    const results = $(panel, '[data-ua-results]');
    const report = window.__OVYX_URL_ANALYZER_LAST_REPORT__;
    if (!panel || !results || !report || !results.isConnected) return;
    if (document.getElementById(BUILD_ID)) return;
    const card = document.createElement('section');
    card.id = BUILD_ID;
    card.setAttribute('aria-labelledby', BUILD_ID + '-title');
    card.innerHTML = '<p class="ovyx-link-build__eyebrow">STAGE 3 · LINK-BASED BUILD</p>' +
      '<h4 id="' + BUILD_ID + '-title">Turn this URL into an editable app</h4>' +
      '<p>Generate a real one-page project using the analyzed source, detected identity and saved App Studio Brand DNA. OVYX will open its editable source in the live Web Studio preview—not a screenshot.</p>' +
      '<button type="button" data-link-build-run>Generate project in Live Preview</button>' +
      '<p data-link-build-status role="status" aria-live="polite">Ready to generate one page with working section navigation. Multiple routes can be added after the first page is verified.</p>';
    const button = $(card, '[data-link-build-run]');
    button.addEventListener('click', () => generate(card, report));
    results.appendChild(card);
    addStyles();
  }

  function slug(value) {
    return clean(value, 100).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'link-app';
  }

  function appNameFor(report) {
    const input = $(document.getElementById(BRAND_ID), '[data-brand-app-name]');
    const current = clean(input?.value, 100);
    const generic = !current || /^(?:my app|untitled app|new app)$/i.test(current);
    const suggested = clean(report?.branding?.name || report?.source?.hostname?.split('.')[0] || 'Link App', 100);
    return generic ? suggested : current;
  }

  function updateNewBrandIdentity(appName, evidence, changedName) {
    const panel = document.getElementById(BRAND_ID);
    if (!panel) return;
    const nameInput = $(panel, '[data-brand-app-name]');
    if (nameInput && nameInput.value !== appName) {
      nameInput.value = appName;
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    // Import source colours for a new identity. A previously saved Brand DNA
    // profile remains authoritative when the user deliberately chose its name.
    if (changedName) {
      Object.entries(evidence.branding.colors || {}).forEach(([key, value]) => {
        const input = $(panel, '[data-brand-color="' + key + '"]');
        if (input && validColor(value)) {
          input.value = value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
    }
  }

  async function waitFor(predicate, label, timeout = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try { if (predicate()) return; } catch (_) {}
      await new Promise(resolve => setTimeout(resolve, 60));
    }
    throw new Error(label || 'The live editor did not become ready. Please retry.');
  }

  function normalizeGeneratedFiles(rawFiles, webStudio) {
    if (!rawFiles || typeof rawFiles !== 'object' || Array.isArray(rawFiles)) throw new Error('The generator returned no editable source files. No project was opened.');
    const files = {};
    for (const [rawPath, rawValue] of Object.entries(rawFiles)) {
      const path = String(rawPath || '').trim().replace(/^\/+/, '');
      if (!path || path.length > 400 || path.includes('\\') || path.split('/').some(part => part === '..' || part === '.') ||
        /^(?:node_modules|dist|build|coverage|\.git|\.env)(?:\/|$)/i.test(path) ||
        !/\.(?:html?|css|m?js|json|svg|txt|md)$/i.test(path)) continue;
      const content = typeof rawValue === 'string' ? rawValue : rawValue && typeof rawValue === 'object'
        ? rawValue.content ?? rawValue.text ?? rawValue.source ?? rawValue.code : null;
      if (typeof content !== 'string' || !content.trim() || content.length > 120000) continue;
      files[path] = { type: webStudio?.mime?.(path) || (/\.html?$/i.test(path) ? 'text/html' : /\.css$/i.test(path) ? 'text/css' : /\.js$/i.test(path) ? 'text/javascript' : 'text/plain'), content, updatedAt: Date.now() };
    }
    let htmlPaths = Object.keys(files).filter(path => /\.html?$/i.test(path));
    if (htmlPaths.length !== 1) throw new Error('The first link-based build must contain exactly one real HTML page. The response did not meet that contract; no project was opened.');
    if (!files['src/styles.css'] || !files['src/main.js']) throw new Error('The generated project is missing its shared stylesheet or navigation runtime. OVYX kept the current project unchanged.');
    const sourceHome = htmlPaths[0];
    if (sourceHome !== 'src/pages/Home.html') {
      files['src/pages/Home.html'] = { ...files[sourceHome], updatedAt: Date.now() };
      delete files[sourceHome];
      htmlPaths = ['src/pages/Home.html'];
    }
    return { files, homePath: htmlPaths[0] };
  }

  async function installAndOpenProject(response, appName, evidence) {
    const webStudio = window.WebStudio;
    if (!webStudio || typeof webStudio.renderPreview !== 'function' || typeof webStudio.ensureProjectGraph !== 'function') {
      throw new Error('The real Web Studio project graph/preview is unavailable in this session. No screenshot fallback was used.');
    }
    const generated = normalizeGeneratedFiles(response.files, webStudio);
    const now = Date.now();
    const projectId = 'proj_link_' + now.toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    const responseProject = response.project && typeof response.project === 'object' ? response.project : {};
    const homeHtml = generated.files[generated.homePath].content;
    const homePage = { id: 'page_home_' + now.toString(36), name: 'Home', slug: 'home', route: '/', url: '/', __ovyxFile: generated.homePath,
      html: homeHtml, source: homeHtml, renderedHtml: homeHtml, sections: [] };
    const project = {
      ...responseProject,
      id: projectId,
      name: appName,
      description: 'Generated from ' + evidence.source.canonicalUrl + ' using the Stage 2 URL Analyzer.',
      createdAt: now,
      updatedAt: now,
      pages: [homePage],
      assets: Array.isArray(responseProject.assets) ? responseProject.assets : [],
    };
    const graph = { version: 2, entry: generated.homePath, files: generated.files, updatedAt: now };
    project.ovyxGraph = graph;
    const state = window.KernelState;
    if (!state) throw new Error('The project workspace state is unavailable. The generated files were not installed.');
    state.projects = Array.isArray(state.projects) ? state.projects.filter(item => item?.id !== projectId) : [];
    state.projects.unshift(project);
    state.activeProject = project;
    webStudio.graph = graph;
    webStudio.activePageIndex = 0;
    webStudio.selectedNodeId = null;
    window.ProjectStore?.save?.();

    const router = window.Router;
    if (!router || typeof router.go !== 'function') throw new Error('The Web Studio route is unavailable. The generated source remains uninstalled.');
    router.go('webstudio');
    await waitFor(() => String(window.KernelState?.activeView || '').toLowerCase() === 'webstudio' &&
      !!document.getElementById('ws-canvas-iframe') && !!window.WebStudio, 'The Web Studio preview did not open.');
    // Reapply the exact generated graph after navigation, because route restoration
    // may hydrate an older project's graph while the Web Studio shell is mounting.
    window.KernelState.activeProject = project;
    window.WebStudio.graph = graph;
    window.WebStudio.activePageIndex = 0;
    window.WebStudio.syncGraphToProject?.();
    window.WebStudio.render?.();
    window.WebStudio.renderPreview();
    if (typeof window.WebStudio.openPreviewFull === 'function') window.WebStudio.openPreviewFull();
    await waitFor(() => {
      const frame = document.getElementById('ws-canvas-iframe');
      const doc = frame?.contentDocument;
      return !!(frame && String(frame.srcdoc || '').length > 80 && doc?.documentElement && /<body/i.test(frame.srcdoc));
    }, 'The generated project files were saved, but the live preview did not render in the real editor.');
    window.__OVYX_LAST_LINK_BUILD__ = { projectId, projectName: appName, sourceUrl: evidence.source.canonicalUrl,
      entry: generated.homePath, fileCount: Object.keys(generated.files).length, previewRendered: true };
    return { projectId, fileCount: Object.keys(generated.files).length };
  }

  async function generate(card, originalReport) {
    if (busy) return;
    busy = true;
    const button = $(card, '[data-link-build-run]');
    const output = $(card, '[data-link-build-status]');
    if (button) { button.disabled = true; button.textContent = 'Generating real source files…'; }
    const say = (message, kind = 'info') => { if (output) { output.textContent = String(message || ''); output.dataset.kind = kind; } };
    try {
      if (!window.OVYXAIService || typeof window.OVYXAIService.generate !== 'function') throw new Error('The connected AI generator is unavailable. Check AI connectivity and retry.');
      if (!window.KernelState || !window.Router) throw new Error('The App Studio project workspace is not ready. Reopen App Studio and retry.');
      say('Preparing URL evidence and app-specific branding…');
      const evidence = evidenceFrom(originalReport);
      const detected = clean(originalReport?.branding?.name || evidence.source.hostname.split('.')[0], 100);
      const current = clean($(document.getElementById(BRAND_ID), '[data-brand-app-name]')?.value, 100);
      const changedName = !current || /^(?:my app|untitled app|new app)$/i.test(current);
      const appName = appNameFor(originalReport);
      updateNewBrandIdentity(appName, evidence, changedName);
      const projectId = 'proj_link_' + Date.now().toString(36);
      const seedProject = { id: projectId, name: appName, description: 'Link-based app from ' + evidence.source.canonicalUrl, pages: [], assets: [] };
      const prompt = 'Generate the first link-based app page from the URL Analyzer evidence for ' + detected +
        '. Build one responsive Home page with source-inspired branding and functional in-page navigation only; do not create multiple routes in this first pass.';
      say('Sending the inspected source and Brand DNA to the structured website generator…');
      const response = await window.OVYXAIService.generate({
        mode: 'app-build',
        provider: 'automatic',
        prompt,
        maxTokens: 20000,
        context: { activeView: 'appstudio', appStudioLinkBuild: true, appName, appBrandId: slug(appName),
          project: seedProject, files: {}, urlAnalyzerSource: evidence }
      });
      if (!response || response.ok === false) throw new Error(response?.message || response?.error || 'The website generator did not return a usable response.');
      if (response.needsUserInput) throw new Error(response.clarification?.message || response.text || 'The website needs additional information before it can be generated.');
      if (!response.files || typeof response.files !== 'object') throw new Error(response.message || 'The generator returned no editable files. No project was created.');
      say('Source files received. Installing the editable project and opening the live preview…');
      const opened = await installAndOpenProject(response, appName, evidence);
      say('Live preview is open. ' + opened.fileCount + ' editable source files were installed in project “' + appName + '”.', 'success');
      try { window.showToast?.('Generated ' + appName + ' and opened its real live preview.', 'success'); } catch (_) {}
    } catch (error) {
      say(error?.message || 'Link-based generation failed. No screenshot fallback was used.', 'error');
      status(error?.message || 'Link-based generation failed. No screenshot fallback was used.', 'error');
    } finally {
      busy = false;
      if (button) { button.disabled = false; button.textContent = 'Generate project in Live Preview'; }
    }
  }

  function observePanel() {
    const root = document.getElementById(PANEL_ID);
    if (!root) return;
    const results = $(root, '[data-ua-results]');
    if (!results || results.dataset.linkBuildObserved === '1') return;
    results.dataset.linkBuildObserved = '1';
    const run = () => {
      if (window.__OVYX_URL_ANALYZER_LAST_REPORT__) insertAction();
    };
    observer?.disconnect();
    observer = new MutationObserver(run);
    observer.observe(results, { childList: true, subtree: true });
    run();
  }

  function boot() {
    observePanel();
    const documentObserver = new MutationObserver(() => observePanel());
    documentObserver.observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();