(function () {
  'use strict';
  if (window.__OVYX_URL_ANALYZER_V1__) return;
  window.__OVYX_URL_ANALYZER_V1__ = true;
  const PANEL_ID = 'ovyx-app-studio-url-analyzer-panel';
  const API = '/api/app-studio/url-analyzer';
  const $ = (root, selector) => root.querySelector(selector);
  const txt = value => String(value == null ? '' : value);
  const colorKeys = ['primary', 'secondary', 'accent', 'background', 'surface', 'text', 'muted'];
  let busy = false;
  function safeUrl(raw) {
    try { const url = new URL(String(raw || '')); return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : ''; }
    catch (_) { return ''; }
  }
  function node(tag, className, value) {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (value !== undefined && value !== null) item.textContent = String(value);
    return item;
  }
  function link(raw, label, className) {
    const href = safeUrl(raw);
    const item = node(href ? 'a' : 'span', className || '', label || raw || '');
    if (href) { item.href = href; item.target = '_blank'; item.rel = 'noopener noreferrer'; item.referrerPolicy = 'no-referrer'; }
    return item;
  }
  function setStatus(message, kind) {
    const panel = document.getElementById(PANEL_ID);
    const target = panel && $(panel, '[data-ua-status]');
    if (!target) return;
    target.textContent = String(message || '');
    target.dataset.kind = kind || 'info';
  }
  function section(parent, heading, description) {
    const item = node('section', 'ovyx-ua-section');
    item.appendChild(node('h4', 'ovyx-ua-section__title', heading));
    if (description) item.appendChild(node('p', 'ovyx-ua-muted', description));
    parent.appendChild(item);
    return item;
  }
  function renderList(parent, values, emptyText) {
    if (!Array.isArray(values) || !values.length) {
      parent.appendChild(node('p', 'ovyx-ua-empty', emptyText || 'Nothing detected in the inspected source.'));
      return;
    }
    const list = node('ul', 'ovyx-ua-list');
    values.forEach(value => list.appendChild(node('li', '', value)));
    parent.appendChild(list);
  }
  function renderReport(report) {
    const panel = document.getElementById(PANEL_ID);
    const results = panel && $(panel, '[data-ua-results]');
    if (!results) return;
    results.replaceChildren();
    window.__OVYX_URL_ANALYZER_LAST_REPORT__ = report;
    const summary = report.summary || {};
    const stats = node('div', 'ovyx-ua-stats');
    [['Pages inspected', summary.pagesInspected || 0], ['Links discovered', summary.internalLinksDiscovered || 0],
      ['Assets found', summary.assetsDiscovered || 0], ['Pages blocked', summary.pagesBlocked || 0]].forEach(([label, count]) => {
      const stat = node('div', 'ovyx-ua-stat');
      stat.append(node('strong', '', count), node('span', '', label));
      stats.appendChild(stat);
    });
    results.appendChild(stats);
    const brand = report.branding || {};
    const brandSection = section(results, 'Detected identity', 'Detected values are based on public HTML and a limited number of stylesheets; they may be incomplete.');
    const brandHead = node('div', 'ovyx-ua-brand-head');
    brandHead.append(node('div', 'ovyx-ua-brand-name', brand.name || report.source?.hostname || 'Unknown website'),
      node('span', 'ovyx-ua-confidence', 'Confidence: ' + txt(brand.confidence || 'low')));
    brandSection.appendChild(brandHead);
    const palette = node('div', 'ovyx-ua-palette');
    const foundColors = brand.colors && typeof brand.colors === 'object' ? brand.colors : {};
    let colorCount = 0;
    colorKeys.forEach(key => {
      const value = txt(foundColors[key] || '');
      if (!/^#[0-9a-f]{6}$/i.test(value)) return;
      colorCount++;
      const swatch = node('div', 'ovyx-ua-color');
      const chip = node('span', 'ovyx-ua-color__chip');
      chip.style.backgroundColor = value;
      chip.setAttribute('aria-label', key + ' ' + value);
      swatch.append(chip, node('span', 'ovyx-ua-color__name', key), node('code', '', value.toUpperCase()));
      palette.appendChild(swatch);
    });
    if (!colorCount) palette.appendChild(node('p', 'ovyx-ua-empty', 'No reliable brand colors were found in inspected evidence.'));
    brandSection.appendChild(palette);
    if (brand.logo && safeUrl(brand.logo.url)) {
      const logo = node('div', 'ovyx-ua-logo-candidate');
      logo.append(node('strong', '', 'Possible logo'), link(brand.logo.url, brand.logo.alt || 'Open detected logo asset'));
      logo.appendChild(node('p', 'ovyx-ua-muted', 'This is a detected URL only; the image is not copied automatically. Upload the logo in Brand DNA to include it in your app.'));
      brandSection.appendChild(logo);
    } else {
      brandSection.appendChild(node('p', 'ovyx-ua-muted', 'No clear logo was detected. It may be embedded in the page styling or rendered dynamically.'));
    }
    if (safeUrl(brand.faviconUrl)) {
      const favicon = node('p', 'ovyx-ua-inline-link');
      favicon.append(node('strong', '', 'Favicon: '), link(brand.faviconUrl, 'Open detected icon'));
      brandSection.appendChild(favicon);
    }
    const apply = node('button', 'ovyx-ua-secondary', 'Use detected palette in Brand DNA');
    apply.type = 'button';
    apply.addEventListener('click', applyDetectedPalette);
    brandSection.appendChild(apply);
    const mapSection = section(results, 'Site map', 'Discovered routes are shown with inspection status. A discovered but uninspected page has not been fetched.');
    const pages = Array.isArray(report.siteMap?.pages) ? report.siteMap.pages : Array.isArray(report.pages) ? report.pages : [];
    if (!pages.length) mapSection.appendChild(node('p', 'ovyx-ua-empty', 'No pages could be inventoried.'));
    else {
      const map = node('ul', 'ovyx-ua-pages');
      pages.forEach(page => {
        const row = node('li', 'ovyx-ua-page');
        row.style.marginLeft = (Math.max(0, Math.min(3, Number(page.depth) || 0)) * 15) + 'px';
        const heading = node('div', 'ovyx-ua-page__heading');
        heading.append(link(page.url, (Number(page.depth) ? '↳ ' : '') + (page.title || page.path || page.url), 'ovyx-ua-page__link'),
          node('span', 'ovyx-ua-page__status', page.status || 'unknown'));
        row.appendChild(heading);
        const detail = [page.category, page.path, page.httpStatus ? 'HTTP ' + page.httpStatus : '', page.warning || ''].filter(Boolean).join(' · ');
        if (detail) row.appendChild(node('p', 'ovyx-ua-muted', detail));
        map.appendChild(row);
      });
      mapSection.appendChild(map);
    }
    if (summary.pageLimitReached) mapSection.appendChild(node('p', 'ovyx-ua-notice', 'The inspection limit was reached. Remaining routes are listed but were not all fetched.'));
    const assetSection = section(results, 'Assets discovered', 'These public asset links were found on inspected pages. Files are not copied automatically.');
    const assets = Array.isArray(report.assets?.items) ? report.assets.items : [];
    if (!assets.length) assetSection.appendChild(node('p', 'ovyx-ua-empty', 'No public assets were identified in inspected source.'));
    else {
      const list = node('ul', 'ovyx-ua-assets');
      assets.slice(0, 80).forEach(asset => {
        const row = node('li', 'ovyx-ua-asset');
        row.append(node('span', 'ovyx-ua-asset__type', asset.type || 'asset'), link(asset.url, asset.url, 'ovyx-ua-asset__url'));
        if (asset.alt) row.appendChild(node('p', 'ovyx-ua-muted', 'Alt: ' + asset.alt));
        list.appendChild(row);
      });
      assetSection.appendChild(list);
    }
    const capability = section(results, 'What this report can and cannot tell us', 'Use these findings to guide app creation.');
    capability.appendChild(node('h5', '', 'Can inspect'));
    renderList(capability, report.capabilities?.can, 'No capabilities returned.');
    capability.appendChild(node('h5', '', 'Cannot prove or reproduce here'));
    renderList(capability, report.capabilities?.cannot, 'No limitations returned.');
    if (Array.isArray(report.limitations) && report.limitations.length) {
      capability.appendChild(node('h5', '', 'Known limitations'));
      renderList(capability, report.limitations, '');
    }
    if (Array.isArray(report.warnings) && report.warnings.length) {
      const warning = section(results, 'Warnings', 'Review these before using the report as a reconstruction brief.');
      renderList(warning, report.warnings, '');
    }
    const source = report.source || {};
    results.appendChild(node('p', 'ovyx-ua-report-foot', 'Source: ' + txt(source.canonicalUrl || source.inputUrl) +
      ' · Analyzed: ' + txt(source.analyzedAt || 'unknown') + '. These findings remain in this tab and are not saved automatically.'));
  }
  function applyDetectedPalette() {
    const report = window.__OVYX_URL_ANALYZER_LAST_REPORT__;
    const dna = document.getElementById('ovyx-app-studio-brand-dna-panel');
    if (!report || !dna) { setStatus('Brand DNA is unavailable. Review the detected colors and configure branding manually.', 'error'); return; }
    const nameInput = dna.querySelector('[data-brand-app-name]');
    if (nameInput && report.branding?.name) {
      nameInput.value = String(report.branding.name).slice(0, 100);
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const detected = report.branding?.colors || {};
    let applied = 0;
    colorKeys.forEach(key => {
      const value = txt(detected[key] || '');
      if (!/^#[0-9a-f]{6}$/i.test(value)) return;
      const input = dna.querySelector('[data-brand-color="' + key + '"]');
      if (!input) return;
      input.value = value.toUpperCase();
      input.dispatchEvent(new Event('input', { bubbles: true }));
      applied++;
    });
    setStatus(applied
      ? 'Transferred ' + applied + ' detected colour(s) and the site name. Review the details in Brand DNA and save your changes. The source logo was not copied automatically.'
      : 'No reliable colors were available to transfer. Configure Brand DNA manually.', applied ? 'success' : 'info');
    if (dna.scrollIntoView) dna.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  async function analyze() {
    if (busy) return;
    const panel = document.getElementById(PANEL_ID);
    const input = panel && $(panel, '[data-ua-url]');
    const button = panel && $(panel, '[data-ua-analyze]');
    const raw = txt(input && input.value).trim();
    if (!raw) { setStatus('Enter a public website URL first.', 'error'); if (input) input.focus(); return; }
    busy = true;
    if (button) { button.disabled = true; button.textContent = 'Inspecting public pages…'; }
    setStatus('Validating the URL, checking public DNS and robots.txt, then inspecting a limited set of public pages and assets.', 'busy');
    try {
      const user = window.firebase && window.firebase.auth && window.firebase.auth().currentUser;
      if (!user || typeof user.getIdToken !== 'function') throw new Error('Sign in to OVYX to analyze a website.');
      const token = await user.getIdToken(false);
      const response = await fetch(API, {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ url: raw }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok !== true || !data.report) throw new Error(String(data.message || data.error || 'OVYX could not analyze this website.'));
      renderReport(data.report);
      setStatus('Analysis complete. Review the sitemap, branding evidence, assets and limitations before continuing.', 'success');
    } catch (error) {
      const results = panel && $(panel, '[data-ua-results]');
      if (results) results.replaceChildren();
      window.__OVYX_URL_ANALYZER_LAST_REPORT__ = null;
      setStatus(error && error.message ? error.message : 'OVYX could not analyze this website.', 'error');
    } finally {
      busy = false;
      const current = document.getElementById(PANEL_ID);
      const submit = current && $(current, '[data-ua-analyze]');
      if (submit) { submit.disabled = false; submit.textContent = 'Analyze website'; }
    }
  }
  function buildPanel() {
    const panel = node('section', 'ovyx-ua-panel');
    panel.id = PANEL_ID;
    panel.setAttribute('aria-labelledby', 'ovyx-ua-title');
    const header = node('div', 'ovyx-ua-header');
    const title = node('div', '');
    title.append(node('p', 'ovyx-ua-eyebrow', 'APP STUDIO / WEBSITE ANALYSIS'), node('h3', '', 'URL Analyzer'),
      node('p', 'ovyx-ua-muted', 'Inspect a public website to identify its structure, branding and relevant assets.'));
    header.append(title, node('span', 'ovyx-ua-chip', 'SOURCE ANALYSIS'));
    panel.appendChild(header);
    const form = node('form', 'ovyx-ua-form');
    const label = node('label', 'ovyx-ua-label', 'Website URL');
    const input = node('input', 'ovyx-ua-input');
    input.type = 'url'; input.inputMode = 'url'; input.autocomplete = 'url'; input.spellcheck = false;
    input.required = true; input.maxLength = 2048; input.placeholder = 'https://example.com';
    input.setAttribute('data-ua-url', '');
    label.appendChild(input);
    const button = node('button', 'ovyx-ua-primary', 'Analyze website');
    button.type = 'submit'; button.setAttribute('data-ua-analyze', '');
    form.append(label, button);
    form.addEventListener('submit', event => { event.preventDefault(); analyze(); });
    panel.appendChild(form);
    const statusNode = node('p', 'ovyx-ua-status', 'Enter a public website URL. OVYX respects access controls and does not run source scripts or copy assets automatically.');
    statusNode.setAttribute('role', 'status'); statusNode.setAttribute('aria-live', 'polite'); statusNode.setAttribute('data-ua-status', '');
    panel.appendChild(statusNode);
    const results = node('div', 'ovyx-ua-results');
    results.setAttribute('data-ua-results', '');
    panel.appendChild(results);
    return panel;
  }
  function addStyles() {
    if (document.getElementById('ovyx-url-analyzer-style')) return;
    const style = node('style', '');
    style.id = 'ovyx-url-analyzer-style';
    style.textContent = [
      '.ovyx-ua-panel{box-sizing:border-box;width:100%;max-width:1100px;margin:0 auto 20px;padding:20px;border:1px solid rgba(255,255,255,.14);border-radius:18px;background:linear-gradient(145deg,#171b24,#090b10);color:#f3f4f6;box-shadow:0 14px 38px rgba(0,0,0,.16);font:inherit;line-height:1.45;grid-column:1/-1;flex:0 0 100%;}',
      '.ovyx-ua-panel *{box-sizing:border-box;min-width:0}.ovyx-ua-header{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:15px}.ovyx-ua-eyebrow{font-size:10px;font-weight:800;letter-spacing:.16em;color:#d6b467;margin:0 0 6px}.ovyx-ua-panel h3{font-size:20px;color:#fff;margin:0 0 5px}.ovyx-ua-panel h4{font-size:14px;color:#fff;margin:0 0 7px}.ovyx-ua-panel h5{font-size:12px;color:#e5e7eb;margin:13px 0 5px}.ovyx-ua-muted{font-size:11px;color:#a7afbd;margin:5px 0 0;overflow-wrap:anywhere}.ovyx-ua-chip{white-space:nowrap;font-size:10px;padding:5px 9px;border:1px solid rgba(255,255,255,.15);border-radius:999px;color:#d1d5db}.ovyx-ua-form{display:flex;align-items:flex-end;gap:10px}.ovyx-ua-label{display:flex;flex-direction:column;gap:6px;flex:1;font-size:12px;color:#e5e7eb;font-weight:650}.ovyx-ua-input{width:100%;border:1px solid rgba(255,255,255,.16);border-radius:10px;padding:11px 12px;background:#0b0d12;color:#fff;font:inherit;font-weight:450;outline-offset:3px}.ovyx-ua-panel :is(input,button,a):focus-visible{outline:2px solid #d6b467;outline-offset:3px}.ovyx-ua-primary,.ovyx-ua-secondary{border:1px solid #d6b467;border-radius:10px;padding:11px 13px;background:#d6b467;color:#18140b;font:inherit;font-size:11px;font-weight:800;cursor:pointer}.ovyx-ua-secondary{background:transparent;color:#f3dca4;border-color:rgba(214,180,103,.6);margin-top:10px}.ovyx-ua-primary:disabled{opacity:.65;cursor:wait}.ovyx-ua-status{font-size:11px;color:#a7afbd;margin:10px 0 0}.ovyx-ua-status[data-kind=error]{color:#fca5a5}.ovyx-ua-status[data-kind=success]{color:#86efac}.ovyx-ua-status[data-kind=busy]{color:#fcd34d}.ovyx-ua-results{display:grid;gap:10px;margin-top:14px}.ovyx-ua-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.ovyx-ua-stat{padding:10px;border:1px solid rgba(255,255,255,.1);border-radius:11px;background:rgba(255,255,255,.035);display:flex;flex-direction:column;gap:3px}.ovyx-ua-stat strong{font-size:19px;color:#fff}.ovyx-ua-stat span,.ovyx-ua-color__name{font-size:10px;color:#a7afbd}.ovyx-ua-section{padding:14px;border:1px solid rgba(255,255,255,.1);border-radius:13px;background:rgba(255,255,255,.025)}.ovyx-ua-brand-head{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap}.ovyx-ua-brand-name{font-size:15px;color:#fff;font-weight:750;overflow-wrap:anywhere}.ovyx-ua-confidence,.ovyx-ua-page__status{font-size:10px;color:#d1d5db;background:rgba(255,255,255,.06);border-radius:999px;padding:4px 7px}.ovyx-ua-palette{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.ovyx-ua-color{display:grid;grid-template-columns:28px auto;column-gap:7px;align-items:center;border:1px solid rgba(255,255,255,.09);border-radius:9px;padding:7px;min-width:125px}.ovyx-ua-color__chip{grid-row:span 2;width:27px;height:27px;border:1px solid rgba(255,255,255,.2);border-radius:7px}.ovyx-ua-color code{font-size:10px;color:#f3f4f6}.ovyx-ua-logo-candidate{display:grid;gap:4px;margin-top:10px;font-size:11px}.ovyx-ua-panel a{color:#a9d6ff;text-decoration:underline;text-underline-offset:2px;overflow-wrap:anywhere}.ovyx-ua-inline-link{font-size:11px}.ovyx-ua-pages,.ovyx-ua-assets,.ovyx-ua-list{list-style:none;padding:0;margin:8px 0 0;display:grid;gap:8px}.ovyx-ua-page,.ovyx-ua-asset{padding:9px;border:1px solid rgba(255,255,255,.08);border-radius:9px;background:rgba(0,0,0,.12)}.ovyx-ua-page__heading{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}.ovyx-ua-page__link{font-size:11px;font-weight:700}.ovyx-ua-asset{display:grid;grid-template-columns:95px minmax(0,1fr);gap:6px}.ovyx-ua-asset__type{font-size:10px;color:#e4c77e;text-transform:uppercase;overflow-wrap:anywhere}.ovyx-ua-asset__url{font-size:10px}.ovyx-ua-list{padding-left:17px;list-style:disc;gap:5px}.ovyx-ua-list li,.ovyx-ua-empty,.ovyx-ua-notice{font-size:11px;color:#d1d5db;overflow-wrap:anywhere}.ovyx-ua-notice{padding:9px;border-radius:9px;background:rgba(214,180,103,.08);border:1px solid rgba(214,180,103,.22)}.ovyx-ua-report-foot{font-size:10px;color:#8d96a5;overflow-wrap:anywhere;margin:2px 0 0}',
      '@media(max-width:620px){.ovyx-ua-panel{padding:13px;border-radius:14px}.ovyx-ua-form{align-items:stretch;flex-direction:column}.ovyx-ua-primary{width:100%}.ovyx-ua-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.ovyx-ua-section{padding:10px}.ovyx-ua-asset{grid-template-columns:72px minmax(0,1fr)}.ovyx-ua-page__heading{flex-direction:column;gap:5px}}'
    ].join('\n');
    document.head.appendChild(style);
  }
  function mount() {
    if (document.getElementById(PANEL_ID)) return;
    const root = document.querySelector('#view-app-studio,#view-appstudio,[data-view="app-studio"],[data-view="appstudio"],[data-app-studio-root]');
    if (!root || !root.isConnected) return;
    addStyles();
    const panel = buildPanel();
    const brand = document.getElementById('ovyx-app-studio-brand-dna-panel');
    if (brand && brand.parentElement === root) brand.insertAdjacentElement('afterend', panel);
    else root.insertBefore(panel, root.firstElementChild);
  }
  function init() {
    mount();
    const observer = new MutationObserver(mount);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('click', event => {
      const nav = event.target && event.target.closest && event.target.closest('[data-view="app-studio"],[data-view="appstudio"],[data-view-target="app-studio"],[href="#view-app-studio"]');
      if (nav) Promise.resolve().then(mount);
    }, true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();