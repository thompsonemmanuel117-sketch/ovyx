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

  function friendlyStatus(value, fallback) {
    const raw = text(value).trim().toLowerCase().replace(/\\s+/g, '-');
    if (!raw) return fallback;
    const labels = {
      'not-run': 'Not checked yet', 'not-started': 'Not started yet',
      'in-progress': 'In progress', running: 'Checking', building: 'Building',
      deploying: 'Publishing', queued: 'Queued', pending: 'In progress',
      passed: 'Passed', success: 'Successful', complete: 'Complete', completed: 'Complete',
      failed: 'Needs attention', error: 'Needs attention', warning: 'Review needed',
      partial: 'Partially checked', healthy: 'Healthy', active: 'Live',
      published: 'Published', ready: 'Ready', cancelled: 'Cancelled', canceled: 'Cancelled',
      unknown: 'Status unavailable'
    };
    if (labels[raw]) return labels[raw];
    return raw.replace(/[_-]+/g, ' ').replace(/^./, first => first.toUpperCase());
  }

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
      quality: friendlyStatus(brain.status, 'Not checked yet'),
      release: friendlyStatus(releaseRecord?.status || mobile.status, 'Not started yet'),
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
    const title = element('h2', '', 'Workspace overview');
    title.id = 'ovyx-as-workspace-title';
    copy.append(element('p', 'ovyx-as-kicker', 'APP WORKSPACE'), title);
    heading.append(copy);
    const overview = element('div', 'ovyx-as-workspace-overview');
    overview.setAttribute('data-ovyx-as-workspace-overview', '');
    const actions = element('div', 'ovyx-as-workspace-actions');
    const openProjects = element('button', 'ovyx-as-workspace-action is-primary', 'Open Projects');
    openProjects.type = 'button'; openProjects.dataset.ovyxAsWorkspaceAction = 'projects';
    const more = element('details', 'ovyx-as-workspace-more');
    const moreSummary = element('summary', '', 'More actions');
    const morePanel = element('div', 'ovyx-as-workspace-more__panel');
    const expand = element('button', 'ovyx-as-workspace-action', 'Expand all details');
    expand.type = 'button'; expand.dataset.ovyxAsWorkspaceAction = 'expand';
    const collapse = element('button', 'ovyx-as-workspace-action', 'Collapse all details');
    collapse.type = 'button'; collapse.dataset.ovyxAsWorkspaceAction = 'collapse';
    const copySummary = element('button', 'ovyx-as-workspace-action', 'Copy project summary');
    copySummary.type = 'button'; copySummary.dataset.ovyxAsWorkspaceAction = 'copy';
    morePanel.append(expand, collapse, copySummary);
    more.append(moreSummary, morePanel);
    actions.append(openProjects, more);
    const status = element('p', 'ovyx-as-workspace-status', 'Project status updates as you build.');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.dataset.ovyxAsWorkspaceStatus = '';
    overview.append(actions, status);
    dock.append(heading, overview);
    // Keep the existing App Workspace as the first App Studio element.
    // This is a presentation-only move; all underlying sections and state remain untouched.
    root.insertBefore(dock, root.firstChild);
    dock.addEventListener('click', handleClick);
    refresh(root);
  }

  function announce(dock, message, kind) {
    const status = $(dock, '[data-ovyx-as-workspace-status]');
    if (!status) return;
    status.textContent = text(message);
    status.dataset.kind = kind || 'info';
  }

  async function copySummary(dock) {
    const snapshot = projectSnapshot();
    const lines = [
      'OVYX App Studio project summary',
      'Project: ' + snapshot.name,
      'Project ID: ' + (snapshot.id || 'Not created yet'),
      'Generated files: ' + snapshot.files,
      'Saved to Projects: ' + (snapshot.saved ? 'Yes' : 'No'),
      'Preview check passed: ' + (snapshot.verified ? 'Yes' : 'No'),
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
    } else if (action.dataset.ovyxAsWorkspaceAction === 'projects') {
      if (typeof window.switchView === 'function') {
        window.switchView('projects');
        announce(dock, 'Opened Projects.', 'success');
      } else if (window.Router && typeof window.Router.go === 'function') {
        window.Router.go('projects');
        announce(dock, 'Opened Projects.', 'success');
      } else {
        announce(dock, 'Projects navigation is unavailable in this session.', 'warning');
      }
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
    const states = [
      ['Project', snapshot.generated ? snapshot.name : 'Not created yet'],
      ['Quality', snapshot.quality],
      ['Save status', snapshot.saved ? 'In Projects' : snapshot.generated ? 'Only on this device' : 'Not saved yet'],
      ['Release', snapshot.release]
    ];
    const signature = JSON.stringify(states);
    if (summary.dataset.snapshot !== signature) {
      summary.dataset.snapshot = signature;
      summary.replaceChildren();
      for (const pair of states) {
        const item = element('div', 'ovyx-as-project-state__item');
      item.append(element('span', '', pair[0]), element('strong', '', pair[1]));
        summary.appendChild(item);
      }
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
      '.ovyx-as-workspace-dock{width:100%;box-sizing:border-box;padding:15px 17px;border:1px solid rgba(214,180,103,.2);border-radius:17px;background:linear-gradient(145deg,rgba(18,23,32,.94),rgba(8,11,17,.96));box-shadow:0 12px 30px rgba(0,0,0,.14)}',
      '.ovyx-as-workspace-dock__heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:13px}.ovyx-as-workspace-dock__heading h2{margin:0;color:#f1f3f6;font-size:16px;letter-spacing:-.02em}',
      '.ovyx-as-project-state{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:12px}.ovyx-as-project-state__item{display:grid;gap:5px;min-width:0;padding:10px 12px;border:1px solid rgba(255,255,255,.075);border-radius:11px;background:rgba(255,255,255,.025)}.ovyx-as-project-state__item span{color:#8995a5;font-size:10px}.ovyx-as-project-state__item strong{overflow-wrap:anywhere;color:#e5eaf1;font-size:11px;font-weight:700}',
      '.ovyx-as-workspace-action:focus-visible,.ovyx-as-workspace-more>summary:focus-visible{outline:2px solid #e0c47d;outline-offset:3px}',
      '.ovyx-as-workspace-actions{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-top:2px}.ovyx-as-workspace-action{min-height:36px;padding:8px 12px;border:1px solid rgba(255,255,255,.12);border-radius:9px;background:rgba(255,255,255,.035);color:#cbd3df;font-size:11px;font-weight:700;cursor:pointer}.ovyx-as-workspace-action.is-primary{border-color:#c2a36b;background:linear-gradient(135deg,#d5bd8a,#b89a60);color:#17140e}.ovyx-as-workspace-more{position:relative}.ovyx-as-workspace-more>summary{display:flex;align-items:center;justify-content:center;min-height:36px;padding:7px 12px;border:1px solid rgba(255,255,255,.12);border-radius:9px;background:rgba(255,255,255,.035);color:#cbd3df;font-size:11px;font-weight:700;cursor:pointer;list-style:none}.ovyx-as-workspace-more>summary::-webkit-details-marker{display:none}.ovyx-as-workspace-more__panel{display:flex;flex-wrap:wrap;gap:7px;margin-top:7px;padding:9px;border:1px solid rgba(255,255,255,.1);border-radius:11px;background:#0b1018}.ovyx-as-workspace-status{min-height:16px;margin:8px 1px 0;color:#91a0b2;font-size:11px;line-height:1.5}.ovyx-as-workspace-status[data-kind="success"]{color:#86efac}.ovyx-as-workspace-status[data-kind="warning"]{color:#f5cf80}',
      '#view-appstudio:has(#ovyx-app-studio-workspace-dock) #ovyx-app-studio-workspace-dock{scroll-margin-top:16px}',
      '@media(max-width:720px){.ovyx-as-workspace-dock{padding:13px}.ovyx-as-project-state{grid-template-columns:repeat(2,minmax(0,1fr))}.ovyx-as-workspace-actions>*{flex:1 1 130px}.ovyx-as-workspace-more__panel>*{flex:1 1 130px}}',
      '@media(prefers-reduced-motion:reduce){.ovyx-as-workspace-dock *{scroll-behavior:auto!important;animation:none!important;transition:none!important}}'
    ].join('\n');
    document.head.appendChild(style);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { addStyles(); start(); }, { once: true });
  else { addStyles(); start(); }
  window.OVYXAppStudioWorkspace = Object.freeze({ version: 1, sections: SECTIONS.map(item => ({ ...item })), snapshot: projectSnapshot, refresh: mount });
})();