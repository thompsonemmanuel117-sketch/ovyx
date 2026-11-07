(function () {
  'use strict';
  if (window.__OVYX_APP_STUDIO_WORKSPACE_V1__) return;
  window.__OVYX_APP_STUDIO_WORKSPACE_V1__ = true;

  const ROOT = '#view-appstudio';
  const DOCK_ID = 'ovyx-app-studio-workspace-dock';
  const SECTIONS = [
    { id: 'ovyx-app-studio-url-analyzer-panel', key: 'analyze', label: 'Analyze', hint: 'Source and site map' },
    { id: 'ovyx-app-studio-link-builder', key: 'build', label: 'Build', hint: 'App generation and preview' },
    { id: 'ovyx-app-studio-project-brain', key: 'verify', label: 'Verify', hint: 'Quality and runtime checks' },
    { id: 'ovyx-app-studio-release', key: 'release', label: 'Release', hint: 'Export and deployment' }
  ];
  const $ = (root, selector) => root && root.querySelector(selector);
  const text = value => String(value == null ? '' : value);
  const element = (tag, className, value) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = text(value);
    return node;
  };

  function projectSnapshot() {
    const project = window.__OVYX_APP_STUDIO_GENERATED_PROJECT__ || {};
    const brain = window.__OVYX_PROJECT_BRAIN_REPORT__ || {};
    const report = window.__OVYX_URL_ANALYZER_LAST_REPORT__ || {};
    const release = project.releaseState || {};
    const web = release.web || {};
    const mobile = release.mobile || {};
    const releaseRecord = web[release.latestWebKey] || web.production || web.preview || null;
    return {
      name: text(project.name || report.branding?.name || 'Untitled app').slice(0, 100),
      id: text(project.id || '').slice(0, 120),
      files: Object.keys(project.files || {}).length,
      generated: !!project.id,
      saved: project.savedToProjects === true,
      verified: brain.summary?.runtimeChecked === true,
      quality: text(brain.status || 'not-run'),
      release: text(releaseRecord?.status || mobile.status || 'not-started'),
      checkedAt: text(brain.checkedAt || '')
    };
  }

  function buildDock(root) {
    if (!root || document.getElementById(DOCK_ID)) return;
    const dock = element('section', 'ovyx-as-workspace-dock');
    dock.id = DOCK_ID;
    dock.setAttribute('aria-labelledby', 'ovyx-as-workspace-title');
    const heading = element('div', 'ovyx-as-workspace-dock__heading');
    const copy = element('div', '');
    copy.append(element('p', 'ovyx-as-kicker', 'PROJECT WORKSPACE'), element('h2', '', 'Your app workspace'));
    heading.append(copy);
    const overview = element('div', 'ovyx-as-workspace-overview');
    overview.setAttribute('data-ovyx-as-workspace-overview', '');
    const nav = element('nav', 'ovyx-as-workspace-nav');
    nav.setAttribute('aria-label', 'App workspace sections');
    for (const section of SECTIONS) {
      const target = document.getElementById(section.id);
      if (!target || !root.contains(target)) continue;
      const button = element('button', 'ovyx-as-workspace-nav__item');
      button.type = 'button';
      button.dataset.ovyxAsWorkspaceTarget = section.id;
      button.setAttribute('aria-controls', section.id);
      button.append(element('span', 'ovyx-as-workspace-nav__label', section.label), element('small', '', section.hint));
      nav.appendChild(button);
    }
    const actions = element('div', 'ovyx-as-workspace-actions');
    const expand = element('button', 'ovyx-as-workspace-action', 'Expand details');
    expand.type = 'button'; expand.dataset.ovyxAsWorkspaceAction = 'expand';
    const collapse = element('button', 'ovyx-as-workspace-action', 'Collapse details');
    collapse.type = 'button'; collapse.dataset.ovyxAsWorkspaceAction = 'collapse';
    const copySummary = element('button', 'ovyx-as-workspace-action', 'Copy project summary');
    copySummary.type = 'button'; copySummary.dataset.ovyxAsWorkspaceAction = 'copy';
    actions.append(expand, collapse, copySummary);
    const status = element('p', 'ovyx-as-workspace-status', 'Workspace ready. Choose a section or a project action.');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.dataset.ovyxAsWorkspaceStatus = '';
    overview.append(nav, actions, status);
    dock.append(heading, overview);
    const hero = document.getElementById('ovyx-app-studio-experience');
    if (hero && hero.parentNode === root) hero.insertAdjacentElement('afterend', dock);
    else root.insertBefore(dock, root.firstChild);
    dock.addEventListener('click', handleClick);
    refresh(root);
  }

  function announce(dock, message, kind) {
    const status = $(dock, '[data-ovyx-as-workspace-status]');
    if (!status) return;
    status.textContent = text(message);
    status.dataset.kind = kind || 'info';
  }

  function scrollToSection(root, dock, id) {
    const section = document.getElementById(id);
    if (!section || !root.contains(section)) {
      announce(dock, 'That workspace section is not available yet.', 'warning');
      return;
    }
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    section.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    section.setAttribute('tabindex', '-1');
    try { section.focus({ preventScroll: true }); } catch (_) { section.focus(); }
    const button = $(dock, '[data-ovyx-as-workspace-target="' + id + '"]');
    if (button) button.focus({ preventScroll: true });
    announce(dock, 'Opened ' + (SECTIONS.find(item => item.id === id)?.label || 'workspace') + '.', 'success');
    refresh(root);
  }

  async function copySummary(dock) {
    const snapshot = projectSnapshot();
    const lines = [
      'OVYX App Studio project summary',
      'Project: ' + snapshot.name,
      'Project ID: ' + (snapshot.id || 'Not generated'),
      'Generated files: ' + snapshot.files,
      'Saved to OVYX Projects: ' + (snapshot.saved ? 'Yes' : 'No'),
      'Live preview verified: ' + (snapshot.verified ? 'Yes' : 'No'),
      'Quality status: ' + snapshot.quality,
      'Release status: ' + snapshot.release
    ];
    try {
      if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(lines.join('\n'));
      announce(dock, 'Project summary copied. Check the saved, verified and release states before sharing.', 'success');
    } catch (_) {
      announce(dock, 'Clipboard access is unavailable in this browser. You can review the project status above.', 'warning');
    }
  }

  function handleClick(event) {
    const dock = event.currentTarget;
    const target = event.target && event.target.closest && event.target.closest('[data-ovyx-as-workspace-target]');
    if (target) {
      const root = dock.closest(ROOT);
      scrollToSection(root, dock, target.dataset.ovyxAsWorkspaceTarget);
      return;
    }
    const action = event.target && event.target.closest && event.target.closest('[data-ovyx-as-workspace-action]');
    if (!action) return;
    const root = dock.closest(ROOT);
    const details = Array.from(root.querySelectorAll('details'));
    if (action.dataset.ovyxAsWorkspaceAction === 'expand') {
      details.forEach(item => { item.open = true; });
      announce(dock, 'Expanded ' + details.length + ' detail panels.', 'success');
    } else if (action.dataset.ovyxAsWorkspaceAction === 'collapse') {
      details.forEach(item => { item.open = false; });
      announce(dock, 'Collapsed ' + details.length + ' detail panels. Your project data was not changed.', 'success');
    } else if (action.dataset.ovyxAsWorkspaceAction === 'copy') {
      copySummary(dock);
    }
  }

  function refresh(root) {
    const dock = document.getElementById(DOCK_ID);
    if (!dock || !root.contains(dock)) return;
    const snapshot = projectSnapshot();
    const overview = $(dock, '[data-ovyx-as-workspace-overview]');
    if (!overview) return;
    let summary = $(overview, '[data-ovyx-as-project-state]');
    if (!summary) {
      summary = element('div', 'ovyx-as-project-state');
      summary.dataset.ovyxAsProjectState = '';
      overview.insertBefore(summary, overview.firstChild);
    }
    summary.replaceChildren();
    const states = [
      ['Project', snapshot.generated ? snapshot.name : 'Not generated'],
      ['Quality', snapshot.quality],
      ['Cloud save', snapshot.saved ? 'Saved' : 'Device / preview only'],
      ['Release', snapshot.release]
    ];
    for (const pair of states) {
      const item = element('div', 'ovyx-as-project-state__item');
      item.append(element('span', '', pair[0]), element('strong', '', pair[1]));
      summary.appendChild(item);
    }
    const buttons = Array.from(dock.querySelectorAll('[data-ovyx-as-workspace-target]'));
    for (const button of buttons) {
      const section = document.getElementById(button.dataset.ovyxAsWorkspaceTarget);
      button.disabled = !section || !root.contains(section);
    }
  }

  function mount() {
    const root = document.querySelector(ROOT);
    if (!root) return;
    buildDock(root);
    refresh(root);
  }

  let observer;
  function start() {
    mount();
    if (observer || !document.documentElement) return;
    observer = new MutationObserver(() => {
      const root = document.querySelector(ROOT);
      if (!root) return;
      if (!document.getElementById(DOCK_ID)) buildDock(root);
      refresh(root);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('ovyx:link-app-generated', mount);
    window.addEventListener('ovyx:project-brain-updated', mount);
    window.addEventListener('ovyx:app-studio-release-updated', mount);
  }

  function addStyles() {
    if (document.getElementById('ovyx-app-studio-workspace-style')) return;
    const style = element('style', '');
    style.id = 'ovyx-app-studio-workspace-style';
    style.textContent = [
      '.ovyx-as-workspace-dock{width:100%;box-sizing:border-box;padding:18px 20px;border:1px solid rgba(214,180,103,.2);border-radius:18px;background:linear-gradient(145deg,rgba(18,23,32,.94),rgba(8,11,17,.96));box-shadow:0 14px 38px rgba(0,0,0,.16)}',
      '.ovyx-as-workspace-dock__heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:13px}.ovyx-as-workspace-dock__heading h2{margin:0;color:#f1f3f6;font-size:16px;letter-spacing:-.02em}',
      '.ovyx-as-project-state{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:12px}.ovyx-as-project-state__item{display:grid;gap:5px;min-width:0;padding:10px 12px;border:1px solid rgba(255,255,255,.075);border-radius:11px;background:rgba(255,255,255,.025)}.ovyx-as-project-state__item span{color:#8995a5;font-size:10px}.ovyx-as-project-state__item strong{overflow-wrap:anywhere;color:#e5eaf1;font-size:11px;font-weight:700}',
      '.ovyx-as-workspace-nav{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}.ovyx-as-workspace-nav__item{display:grid;gap:5px;min-width:0;padding:10px 12px;text-align:left;border:1px solid rgba(255,255,255,.09);border-radius:11px;background:rgba(255,255,255,.025);color:#edf0f5;cursor:pointer}.ovyx-as-workspace-nav__item:hover:not(:disabled){border-color:rgba(214,180,103,.42);background:rgba(214,180,103,.06)}.ovyx-as-workspace-nav__item:focus-visible,.ovyx-as-workspace-action:focus-visible{outline:2px solid #e0c47d;outline-offset:3px}.ovyx-as-workspace-nav__item:disabled{opacity:.42;cursor:not-allowed}.ovyx-as-workspace-nav__label{font-size:12px;font-weight:750}.ovyx-as-workspace-nav__item small{color:#8d99a9;font-size:10px;line-height:1.4}',
      '.ovyx-as-workspace-actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}.ovyx-as-workspace-action{padding:8px 11px;border:1px solid rgba(255,255,255,.1);border-radius:9px;background:rgba(255,255,255,.035);color:#cbd3df;font-size:10px;font-weight:700;cursor:pointer}.ovyx-as-workspace-status{min-height:16px;margin:10px 1px 0;color:#91a0b2;font-size:10px;line-height:1.5}.ovyx-as-workspace-status[data-kind="success"]{color:#86efac}.ovyx-as-workspace-status[data-kind="warning"]{color:#f5cf80}',
      '#view-appstudio:has(#ovyx-app-studio-workspace-dock) #ovyx-app-studio-workspace-dock{scroll-margin-top:16px}',
      '@media(max-width:720px){.ovyx-as-workspace-dock{padding:14px}.ovyx-as-project-state{grid-template-columns:repeat(2,minmax(0,1fr))}.ovyx-as-workspace-nav{grid-template-columns:repeat(2,minmax(0,1fr))}.ovyx-as-workspace-actions>*{flex:1 1 130px}}',
      '@media(prefers-reduced-motion:reduce){.ovyx-as-workspace-dock *{scroll-behavior:auto!important;animation:none!important;transition:none!important}}'
    ].join('\n');
    document.head.appendChild(style);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { addStyles(); start(); }, { once: true });
  else { addStyles(); start(); }
  window.OVYXAppStudioWorkspace = Object.freeze({ version: 1, sections: SECTIONS.map(item => ({ ...item })), snapshot: projectSnapshot, refresh: mount });
})();