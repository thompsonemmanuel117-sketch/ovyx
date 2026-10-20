(function () {
  'use strict';
  if (window.__OVYX_WS_FULLSTACK_UPGRADE_V1__) return;
  window.__OVYX_WS_FULLSTACK_UPGRADE_V1__ = true;

  var STYLE_ID = 'ovyx-ws-fullstack-upgrade-style-v1';
  var OVERLAY_ID = 'ovyx-ws-fullstack-upgrade-overlay';
  var BUTTON_ATTR = 'data-ovyx-fullstack-upgrade';
  var studioRef = null;
  var running = false;
  var lastFocus = null;

  function clean(value, max) {
    return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max || 260);
  }
  function clone(value) {
    try { return JSON.parse(JSON.stringify(value)); } catch (_) { return value == null ? null : value; }
  }
  function contentOf(value) {
    if (typeof value === 'string') return value;
    if (!value || typeof value !== 'object') return '';
    var text = value.content != null ? value.content : value.text != null ? value.text : value.source != null ? value.source : value.code;
    return typeof text === 'string' ? text : '';
  }
  function getStudio() {
    return window.WebStudio && typeof window.WebStudio === 'object' ? window.WebStudio : null;
  }
  function currentProject(studio) {
    return window.KernelState && window.KernelState.activeProject || studio && studio.project || {};
  }
  function projectKey(studio) {
    var project = currentProject(studio);
    var id = clean(project && (project.id || project.projectId || project.slug || project.name), 100);
    return 'ovyx.webstudio.fullstack.upgrade.v1.' + (id ? id.toLowerCase().replace(/[^a-z0-9_-]+/g, '-') : 'current-project');
  }
  function hasMeaningfulWebsite(files) {
    return Object.keys(files || {}).some(function (path) {
      if (!/\.(?:html?|jsx?|tsx?|vue|svelte)$/i.test(path)) return false;
      var source = contentOf(files[path]).trim();
      return source.length >= 350 && /<(?:html|body|main|header|nav|section|article|form|div)\b/i.test(source);
    });
  }
  function toast(message, kind) {
    try {
      if (typeof window.showToast === 'function') window.showToast(clean(message, 400), kind || 'info');
      else if (typeof window.toast === 'function') window.toast(clean(message, 400), kind || 'info');
    } catch (_) {}
  }
  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }
  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '#'+OVERLAY_ID+'{position:fixed;inset:0;z-index:100100;background:rgba(3,5,8,.76);backdrop-filter:blur(12px);display:grid;place-items:center;padding:18px;overflow-y:auto}',
      '#'+OVERLAY_ID+'[hidden]{display:none!important}',
      '#'+OVERLAY_ID+' .ovyx-ws-fs-dialog{position:relative;width:min(100%,620px);max-height:min(90vh,820px);overflow:auto;border:1px solid rgba(226,190,125,.3);border-radius:22px;background:radial-gradient(ellipse at 92% 0,rgba(197,156,85,.13),transparent 38%),linear-gradient(145deg,#171b22,#0b0e12 75%);box-shadow:0 26px 100px rgba(0,0,0,.55);color:#f2f3f5;font:500 13px/1.6 Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}',
      '#'+OVERLAY_ID+' .ovyx-ws-fs-head{padding:26px 28px 14px;display:flex;gap:18px;align-items:flex-start}',
      '#'+OVERLAY_ID+' .ovyx-ws-fs-mark{width:48px;height:48px;flex:0 0 48px;display:grid;place-items:center;border:1px solid rgba(232,197,130,.35);border-radius:15px;background:rgba(210,173,107,.1);color:#e9c989;font-size:23px}',
      '#'+OVERLAY_ID+' .ovyx-ws-fs-heading{flex:1;min-width:0}',
      '#'+OVERLAY_ID+' .ovyx-ws-fs-kicker{font-size:9px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#d7b978;margin-bottom:6px}',
      '#'+OVERLAY_ID+' h2{font-size:clamp(21px,4vw,29px);line-height:1.16;letter-spacing:-.035em;margin:0;color:#fff;font-weight:750}',
      '#'+OVERLAY_ID+' .ovyx-ws-fs-lead{font-size:12px;line-height:1.7;color:#b9c0cc;margin:10px 0 0}',
      '#'+OVERLAY_ID+' .ovyx-ws-fs-close{flex:0 0 auto;border:0;border-radius:9px;width:34px;height:34px;background:rgba(255,255,255,.06);color:#cbd2dc;font-size:22px;cursor:pointer}',
      '#'+OVERLAY_ID+' .ovyx-ws-fs-body{padding:8px 28px 22px}',
      '#'+OVERLAY_ID+' .ovyx-ws-fs-benefits{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:14px 0 17px}',
      '#'+OVERLAY_ID+' .ovyx-ws-fs-benefit{border:1px solid rgba(255,255,255,.09);border-radius:13px;padding:12px;background:rgba(255,255,255,.025);min-width:0}',
      '#'+OVERLAY_ID+' .ovyx-ws-fs-benefit b{display:block;font-size:11px;color:#f2d9a5;margin-bottom:4px}',
      '#'+OVERLAY_ID+' .ovyx-ws-fs-benefit span{display:block;color:#aeb7c4;font-size:10px;line-height:1.55}',
      '#'+OVERLAY_ID+' .ovyx-ws-fs-note{padding:12px 13px;border-left:2px solid #c7a76a;background:rgba(199,167,106,.075);border-radius:0 10px 10px 0;color:#c2cad5;font-size:10px;line-height:1.65}',
      '#'+OVERLAY_ID+' .ovyx-ws-fs-note b{color:#f0d8a8}',
      '#'+OVERLAY_ID+' .ovyx-ws-fs-actions{display:flex;flex-wrap:wrap;gap:9px;padding:18px 28px 24px;border-top:1px solid rgba(255,255,255,.08)}',
      '#'+OVERLAY_ID+' .ovyx-ws-fs-primary,#'+OVERLAY_ID+' .ovyx-ws-fs-secondary{min-height:42px;border-radius:10px;padding:10px 15px;font:750 11px/1.3 Inter,system-ui,sans-serif;cursor:pointer}',
      '#'+OVERLAY_ID+' .ovyx-ws-fs-primary{flex:1 1 220px;border:1px solid #e1c184;background:linear-gradient(135deg,#f3ddb0,#c49b54);color:#17130b;box-shadow:0 6px 22px rgba(191,151,80,.13)}',
      '#'+OVERLAY_ID+' .ovyx-ws-fs-secondary{border:1px solid rgba(255,255,255,.13);background:rgba(255,255,255,.04);color:#d0d6df}',
      '#'+OVERLAY_ID+' button:focus-visible{outline:2px solid #f1d7a0;outline-offset:3px}',
      '#'+OVERLAY_ID+' .ovyx-ws-fs-progress{padding:0 28px 24px;color:#cbd2dc;font-size:11px}',
      '#'+OVERLAY_ID+' .ovyx-ws-fs-progress[hidden]{display:none!important}',
      '#'+OVERLAY_ID+' .ovyx-ws-fs-spinner{display:inline-block;width:14px;height:14px;margin-right:8px;vertical-align:-3px;border:2px solid rgba(233,201,137,.26);border-top-color:#e9c989;border-radius:50%;animation:ovyxFsSpin .8s linear infinite}',
      '#view-webstudio .ovyx-ws-fullstack-trigger{display:inline-flex;align-items:center;gap:6px;border-color:rgba(224,190,126,.28)!important;color:#e9ce97!important}',
      '#view-webstudio .ovyx-ws-fullstack-trigger:focus-visible{outline:2px solid #e9ce97;outline-offset:2px}',
      '@keyframes ovyxFsSpin{to{transform:rotate(360deg)}}',
      '@media(max-width:520px){#'+OVERLAY_ID+'{padding:10px}#'+OVERLAY_ID+' .ovyx-ws-fs-head{padding:20px 18px 10px;gap:12px}#'+OVERLAY_ID+' .ovyx-ws-fs-mark{width:40px;height:40px;flex-basis:40px;border-radius:12px}#'+OVERLAY_ID+' .ovyx-ws-fs-body{padding:8px 18px 18px}#'+OVERLAY_ID+' .ovyx-ws-fs-benefits{grid-template-columns:1fr}#'+OVERLAY_ID+' .ovyx-ws-fs-actions{padding:15px 18px 19px}#'+OVERLAY_ID+' .ovyx-ws-fs-progress{padding:0 18px 19px}}',
      '@media(prefers-reduced-motion:reduce){#'+OVERLAY_ID+' .ovyx-ws-fs-spinner{animation:none}}'
    ].join('\n');
    (document.head || document.documentElement).appendChild(style);
  }
  function closeModal() {
    var overlay = document.getElementById(OVERLAY_ID);
    if (overlay) overlay.remove();
    if (lastFocus && document.contains(lastFocus)) {
      try { lastFocus.focus(); } catch (_) {}
    }
  }
  function ensureOverlay() {
    var overlay = document.getElementById(OVERLAY_ID);
    if (overlay) return overlay;
    ensureStyles();
    overlay = element('div');
    overlay.id = OVERLAY_ID;
    overlay.setAttribute('data-ovyx-fs-overlay', '1');
    overlay.setAttribute('role', 'presentation');
    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) closeModal();
    });
    var dialog = element('section', 'ovyx-ws-fs-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'ovyx-ws-fs-title');
    dialog.setAttribute('aria-describedby', 'ovyx-ws-fs-lead');
    dialog.tabIndex = -1;
    var head = element('header', 'ovyx-ws-fs-head');
    head.appendChild(element('div', 'ovyx-ws-fs-mark', '↗'));
    var heading = element('div', 'ovyx-ws-fs-heading');
    heading.appendChild(element('div', 'ovyx-ws-fs-kicker', 'OVYX WEB STUDIO · FULL-STACK MODE'));
    var title = element('h2', '', 'Your design is the beginning. Want the working system behind it?');
    title.id = 'ovyx-ws-fs-title';
    heading.appendChild(title);
    var lead = element('p', 'ovyx-ws-fs-lead', 'Upgrade this website into an integration-ready web application. OVYX will inspect what you built and generate the backend structure and real workflow logic that fits the project—without throwing away your design.');
    lead.id = 'ovyx-ws-fs-lead';
    heading.appendChild(lead);
    head.appendChild(heading);
    var close = element('button', 'ovyx-ws-fs-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close full-stack upgrade offer');
    close.addEventListener('click', closeModal);
    head.appendChild(close);
    dialog.appendChild(head);

    var body = element('div', 'ovyx-ws-fs-body');
    var benefits = element('div', 'ovyx-ws-fs-benefits');
    [
      ['Backend and APIs', 'Generate server-side endpoints and validation for the features this website actually needs.'],
      ['Data and business logic', 'Add appropriate data models, persistence adapters and domain-specific workflows.'],
      ['Accounts and permissions', 'Prepare authentication and authorization only where the product requires them.'],
      ['Integration handoff', 'Create an environment-variable example and a clear setup guide for the backend services to connect.']
    ].forEach(function (item) {
      var card = element('div', 'ovyx-ws-fs-benefit');
      card.appendChild(element('b', '', item[0]));
      card.appendChild(element('span', '', item[1]));
      benefits.appendChild(card);
    });
    body.appendChild(benefits);
    var note = element('div', 'ovyx-ws-fs-note');
    var noteLabel = element('b', '', 'Important: ');
    note.appendChild(noteLabel);
    note.appendChild(document.createTextNode('OVYX can generate the code and connection points, but your database, auth, email, payments or other external services must still be connected and tested where needed. It will never invent credentials or pretend an unconnected service is live.'));
    body.appendChild(note);
    dialog.appendChild(body);

    var progress = element('div', 'ovyx-ws-fs-progress');
    progress.setAttribute('role', 'status');
    progress.setAttribute('aria-live', 'polite');
    progress.hidden = true;
    dialog.appendChild(progress);
    var actions = element('footer', 'ovyx-ws-fs-actions');
    var yes = element('button', 'ovyx-ws-fs-primary', 'Yes — upgrade my website');
    yes.type = 'button';
    yes.setAttribute('data-ovyx-fs-confirm', '1');
    yes.addEventListener('click', function () {
      if (studioRef) startUpgrade(studioRef, progress, actions, yes);
    });
    var later = element('button', 'ovyx-ws-fs-secondary', 'Not now');
    later.type = 'button';
    later.addEventListener('click', closeModal);
    actions.appendChild(yes);
    actions.appendChild(later);
    dialog.appendChild(actions);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    return overlay;
  }
  function showModal(studio, automatic) {
    studioRef = studio || getStudio();
    if (!studioRef || running) return;
    if (automatic) {
      try {
        if (localStorage.getItem(projectKey(studioRef) + '.offer-seen') === '1') return;
        localStorage.setItem(projectKey(studioRef) + '.offer-seen', '1');
      } catch (_) {}
    }
    lastFocus = document.activeElement;
    var overlay = ensureOverlay();
    overlay.hidden = false;
    var dialog = overlay.querySelector('[role="dialog"]');
    try { (overlay.querySelector('[data-ovyx-fs-confirm]') || dialog).focus(); } catch (_) {}
  }
  function captureSnapshot(studio) {
    var state = window.KernelState || {};
    var project = state.activeProject || currentProject(studio);
    var graph;
    try { graph = typeof studio.snapshotGraph === 'function' ? studio.snapshotGraph() : clone(studio.graph); } catch (_) { graph = clone(studio.graph); }
    return {
      projectId: clean(project && project.id, 120),
      project: clone(project || {}),
      projects: clone(state.projects || []),
      graph: clone(graph || { version: 2, entry: 'src/pages/Home.html', files: {} }),
      historyStack: clone(studio.historyStack || []),
      historyPointer: Number(studio.historyPointer == null ? -1 : studio.historyPointer)
    };
  }
  function restoreSnapshot(studio, snapshot) {
    try {
      var state = window.KernelState;
      if (state) {
        state.projects = clone(snapshot.projects || []);
        state.activeProject = state.projects.find(function (item) { return clean(item && item.id, 120) === snapshot.projectId; }) || clone(snapshot.project || {});
      }
      studio.graph = clone(snapshot.graph || { version: 2, entry: 'src/pages/Home.html', files: {} });
      if (state && state.activeProject) state.activeProject.ovyxGraph = studio.graph;
      studio.historyStack = clone(snapshot.historyStack || []);
      studio.historyPointer = snapshot.historyPointer;
      try { if (typeof studio.syncGraphToProject === 'function') studio.syncGraphToProject(); } catch (_) {}
      try { if (studio.graphKeyPrefix && window.localStorage) localStorage.setItem(studio.graphKeyPrefix + ((state && state.activeProject && state.activeProject.id) || 'unknown'), JSON.stringify(studio.graph)); } catch (_) {}
      try { if (window.ProjectStore && ProjectStore.save) ProjectStore.save(); } catch (_) {}
      try { if (window.ProjectStore && ProjectStore.renderHome) ProjectStore.renderHome(); } catch (_) {}
      try { if (window.ProjectStore && ProjectStore.renderProjects) ProjectStore.renderProjects(); } catch (_) {}
      try { if (studio.renderPreview) studio.renderPreview(); } catch (_) {}
      try { if (studio.render) studio.render(); } catch (_) {}
      return true;
    } catch (_) { return false; }
  }
  function currentGraph(studio) {
    try { if (typeof studio.ensureProjectGraph === 'function') studio.ensureProjectGraph(); } catch (_) {}
    return clone(studio.graph || window.KernelState && window.KernelState.activeProject && window.KernelState.activeProject.ovyxGraph || { files: {} }) || { files: {} };
  }
  function changedFiles(before, after) {
    var a = before && before.files || {};
    var b = after && after.files || {};
    var all = Array.from(new Set(Object.keys(a).concat(Object.keys(b))));
    return all.filter(function (path) { return contentOf(a[path]) !== contentOf(b[path]); }).sort();
  }
  function buildPrompt() {
    return [
      'OVYX WEB STUDIO — FULL-STACK UPGRADE',
      '',
      'Upgrade the CURRENT generated website into an integration-ready, genuinely functional full-stack web application appropriate to the project. This is an implementation task, not a redesign proposal and not a generic scaffold.',
      '',
      'FIRST: inspect the entire current project graph, its routes, its existing stack and deployment target, and every existing control/form/user journey. Identify the real product purpose and the smallest backend architecture that can support it. Write down an internal feature-to-implementation plan, then execute it in the actual source files.',
      '',
      'PRESERVE THE WEBSITE: retain its visual identity, responsive layouts, copy, routes, SEO/metadata, accessibility, and all working interactions. Do not replace it with a starter template, rebuild unrelated pages, remove existing features, or change its stack without a concrete compatibility reason.',
      '',
      'IMPLEMENT THE FEATURES THAT ACTUALLY EXIST OR WERE EXPLICITLY REQUESTED:',
      '- Create server-side API endpoints or server actions for workflows that need privileged logic or persistence. Validate inputs on the server and return consistent success and error responses.',
      '- Add data models and a database schema/migration or provider-neutral persistence interface suitable for the current stack. No fake records as a substitute for production data; sample data must be clearly identified and isolated.',
      '- Add authentication and server-side authorization only where the product needs accounts, private data or roles. Never trust client-provided role/user IDs as authorization.',
      '- Connect frontend features to the new API/data layer, including pending, empty, validation, success and failure states. Forms must not display success until the server confirms it; filters and matching must operate on the actual available data.',
      '- For commerce, bookings, property matching, dashboards or other domain-specific features, implement the domain rules that are relevant to this website. Do not add unrelated features. Do not claim a reservation, payment, message delivery or account action is complete unless a real configured service confirms it.',
      '- Keep all secrets server-side. Add a safe .env.example with variable names and placeholder values only, never real credentials or secrets.',
      '- Use existing dependencies and provider integrations when possible. Avoid introducing an unrelated framework or large dependency set. Choose an architecture compatible with the current project/runtime and deployment target.',
      '',
      'BACKEND CONNECTION HANDOFF:',
      '- Where the current project or user has not supplied credentials, database URLs, auth configuration, email services, payment-provider keys or other external configuration, do NOT fabricate them and do NOT use fake success responses.',
      '- Implement real adapter interfaces/API contracts and the portions that can work without credentials; isolate missing configuration so it is obvious what must be connected.',
      '- Create or update FULL_STACK_SETUP.md (or a clearly named equivalent if one already exists) with the detected stack, architecture, every generated API route, required data model/migrations, exact environment variables, where to obtain/configure them, local setup/migration commands that actually match this repository, deployment requirements, and an ordered checklist for connecting the real backend/provider.',
      '- Clearly separate generated and source-verified code from integrations that still require external credentials or a live-service test.',
      '',
      'VERIFICATION AND SAFETY:',
      '- Add focused tests for the critical business logic, server endpoints, validation, authorization and failure states, using the test tools available in this project.',
      '- Run the available source tests and preserve existing tests. Fix regressions caused by this upgrade before reporting completion.',
      '- Never claim the website is fully connected or production-ready merely because the source files were generated. State exactly which services are connected, which need configuration, and which runtime/integration checks were not possible.',
      '- Make minimal, deliberate changes. If part of the request cannot be implemented safely with the available runtime or evidence, preserve the site, create a clear integration boundary and document the limitation rather than pretending it works.',
      '',
      'Deliver the implementation in the current project files; do not answer with a plan alone.'
    ].join('\n');
  }
  function setProgress(progress, actions, yes, message, busy) {
    if (progress) {
      progress.hidden = false;
      progress.textContent = '';
      if (busy) {
        progress.appendChild(element('span', 'ovyx-ws-fs-spinner'));
        progress.appendChild(document.createTextNode(message));
      } else {
        progress.textContent = message;
      }
    }
    if (yes) yes.disabled = !!busy;
    Array.prototype.forEach.call(actions ? actions.querySelectorAll('button') : [], function (button) {
      if (button !== yes) button.disabled = !!busy;
    });
  }
  async function startUpgrade(studio, progress, actions, yes) {
    if (running) return;
    if (!studio || typeof studio.runBuildAgent !== 'function') {
      setProgress(progress, actions, yes, 'The build agent is not available in this session. Your website has not been changed.', false);
      toast('Full-stack upgrade is unavailable right now. No website changes were made.', 'warning');
      return;
    }
    var snapshot = captureSnapshot(studio);
    var before = currentGraph(studio);
    if (!Object.keys(before.files || {}).length) {
      setProgress(progress, actions, yes, 'No generated project files were found. Build or open a website first, then try again.', false);
      return;
    }
    running = true;
    setProgress(progress, actions, yes, 'Inspecting your website and implementing the required backend layer…', true);
    toast('Full-stack upgrade started. OVYX is inspecting the project and generating implementation files.', 'info');
    try {
      var token = Number(studio.requestEpoch || 0);
      await studio.runBuildAgent(buildPrompt(), true, token, [], {
        projectId: snapshot.projectId,
        project: clone(snapshot.project),
        projects: clone(snapshot.projects),
        graph: clone(snapshot.graph)
      });
      var after = currentGraph(studio);
      var changed = changedFiles(before, after);
      if (!changed.length) throw new Error('The build agent did not produce any changed project files. The website was left unchanged.');
      var testResult = null;
      if (typeof studio.runTests === 'function') {
        testResult = await studio.runTests(false);
        if (testResult && testResult.ok === false) throw new Error(clean(testResult.summary || 'The source tests did not pass after the upgrade.', 500));
      }
      var qualityMessage = '';
      var quality = window.OVYXWebStudioQuality;
      if (quality && typeof quality.run === 'function') {
        try {
          var report = await quality.run();
          var checks = report && Array.isArray(report.checks) ? report.checks : [];
          var failed = checks.filter(function (check) { return check && check.status === 'fail' && check.group !== 'Coverage'; });
          if (failed.length) qualityMessage = ' The quality review still reports ' + failed.length + ' issue(s); review the Quality panel before release.';
        } catch (_) {
          qualityMessage = ' Browser-level quality checks could not complete in this run.';
        }
      } else {
        qualityMessage = ' Browser-level quality checks were not available in this session.';
      }
      try { if (typeof studio.renderPreview === 'function') studio.renderPreview(); } catch (_) {}
      try { if (typeof studio.render === 'function') studio.render(); } catch (_) {}
      var resultTitle = 'Full-stack implementation generated';
      var resultBody = 'OVYX updated ' + changed.length + ' project file(s).' +
        (testResult && testResult.ok === true ? ' Available source tests passed.' : ' Source-test status is unverified.') +
        ' The website design and existing workflows should be reviewed in the preview. External services are not considered live until you connect and test them.' + qualityMessage +
        ' Open FULL_STACK_SETUP.md in the project files for the exact connection checklist.';
      setProgress(progress, actions, yes, resultTitle + '. ' + resultBody, false);
      if (progress) progress.setAttribute('data-status', 'complete');
      try {
        localStorage.setItem(projectKey(studio) + '.upgrade-state', JSON.stringify({
          status: 'generated-awaiting-connection',
          changedFiles: changed,
          generatedAt: new Date().toISOString(),
          sourceTestsPassed: !!(testResult && testResult.ok === true)
        }));
      } catch (_) {}
      var finish = element('button', 'ovyx-ws-fs-primary', 'Done');
      finish.type = 'button';
      finish.addEventListener('click', closeModal);
      if (actions) {
        actions.textContent = '';
        actions.appendChild(finish);
      }
      toast('Full-stack code generated. Connect the listed services in FULL_STACK_SETUP.md before treating the site as live.', 'success');
    } catch (error) {
      var message = clean(error && error.message || 'The full-stack upgrade did not pass verification.', 600);
      var restored = restoreSnapshot(studio, snapshot);
      setProgress(progress, actions, yes, message + (restored ? ' The previous project snapshot was restored to protect the existing website.' : ' Check the project version history before continuing.'), false);
      if (progress) progress.setAttribute('data-status', 'failed');
      toast('Full-stack upgrade did not pass verification. ' + (restored ? 'Your previous website was restored.' : 'Review the project state before continuing.'), 'warning');
    } finally {
      running = false;
    }
  }
  function ensureButtons() {
    var view = document.getElementById('view-webstudio');
    if (!view) return;
    var hosts = view.querySelectorAll('.ovyx-ws-header-actions');
    Array.prototype.forEach.call(hosts, function (host) {
      if (host.querySelector('[' + BUTTON_ATTR + ']')) return;
      var button = element('button', 'ovyx-ws-header-button ovyx-ws-fullstack-trigger');
      button.type = 'button';
      button.setAttribute(BUTTON_ATTR, '1');
      button.setAttribute('aria-haspopup', 'dialog');
      button.setAttribute('aria-label', 'Upgrade this website to full-stack functionality');
      var icon = element('i', 'fa-solid fa-code');
      icon.setAttribute('aria-hidden', 'true');
      button.appendChild(icon);
      button.appendChild(element('span', '', 'Full-stack'));
      button.addEventListener('click', function (event) {
        event.preventDefault();
        showModal(getStudio(), false);
      });
      var preview = host.querySelector('#ws-preview-trigger');
      if (preview) host.insertBefore(button, preview); else host.appendChild(button);
    });
  }
  function install() {
    var studio = getStudio();
    var view = document.getElementById('view-webstudio');
    if (!studio || !view) return false;
    studioRef = studio;
    ensureStyles();
    ensureButtons();
    return true;
  }
  var attempts = 0;
  function boot() {
    if (install()) return;
    if (attempts++ < 80) window.setTimeout(boot, 200);
  }
  window.addEventListener('ovyx:webstudio-initial-site-built', function () {
    window.setTimeout(function () { showModal(getStudio(), true); }, 150);
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && document.getElementById(OVERLAY_ID)) closeModal();
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
  window.addEventListener('ovyx:view-changed', function () { window.setTimeout(boot, 0); });
  window.addEventListener('firebase-auth-state-ready', function () { window.setTimeout(boot, 0); });
})();