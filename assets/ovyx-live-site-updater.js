(function () {
  'use strict';
  if (window.__OVYX_LIVE_SITE_UPDATER_V1__) return;
  window.__OVYX_LIVE_SITE_UPDATER_V1__ = true;

  var ROOT = 'ovyx-live-site-updater';
  var MODAL = ROOT + '-modal';
  var activeResolution = null;
  var busy = false;
  var launcher = null;

  function clean(value, max) {
    return String(value == null ? '' : value).replace(/[\\u0000-\\u001f\\u007f]/g, ' ').trim().slice(0, max || 500);
  }
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = String(text);
    return node;
  }
  function clone(value) { return JSON.parse(JSON.stringify(value == null ? null : value)); }
  function state() { return window.KernelState || (window.KernelState = {}); }
  function studio() { return window.WebStudio && typeof window.WebStudio === 'object' ? window.WebStudio : null; }
  function authUser() {
    try { return window.firebase && typeof window.firebase.auth === 'function' ? window.firebase.auth().currentUser : null; }
    catch (_) { return null; }
  }
  async function token() {
    var user = authUser();
    if (!user || typeof user.getIdToken !== 'function') throw new Error('Sign in to OVYX before updating a live website.');
    return user.getIdToken(true);
  }
  async function request(path, options) {
    var idToken = await token();
    var init = Object.assign({ credentials: 'same-origin', cache: 'no-store' }, options || {});
    init.headers = Object.assign({ Accept: 'application/json', Authorization: 'Bearer ' + idToken }, options && options.headers || {});
    var response = await fetch(path, init);
    var body = await response.json().catch(function () { return {}; });
    if (!response.ok || body.success === false || body.ok === false) {
      throw new Error(clean(body.error || body.message || 'The request could not be completed.', 500));
    }
    return body;
  }
  function styles() {
    if (document.getElementById(ROOT + '-style')) return;
    var style = el('style');
    style.id = ROOT + '-style';
    style.textContent =
      '#' + ROOT + '-launcher{position:fixed;z-index:99970;right:18px;bottom:18px;border:1px solid rgba(232,182,79,.6);border-radius:999px;background:#090909;color:#f5d58d;padding:11px 15px;font:750 12px Inter,system-ui,sans-serif;box-shadow:0 8px 30px #0008;cursor:pointer}' +
      '#' + ROOT + '-launcher[hidden]{display:none}' +
      '#' + MODAL + '{position:fixed;z-index:99999;inset:0;background:rgba(0,0,0,.78);backdrop-filter:blur(10px);display:grid;place-items:center;padding:18px;color:#f5f5f5;font:500 13px/1.55 Inter,system-ui,sans-serif}' +
      '#' + MODAL + '[hidden]{display:none}' +
      '#' + MODAL + ' *{box-sizing:border-box}' +
      '#' + MODAL + ' .ovyx-live-card{width:min(560px,100%);max-height:min(90dvh,820px);overflow:auto;background:#090909;border:1px solid #ffffff20;border-radius:18px;padding:20px;box-shadow:0 24px 80px #000b}' +
      '#' + MODAL + ' .ovyx-live-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:16px}' +
      '#' + MODAL + ' .ovyx-live-head h2{margin:0;color:#fff;font-size:17px;font-weight:800}' +
      '#' + MODAL + ' .ovyx-live-muted{color:#a1a1aa;font-size:12px;margin:6px 0 0}' +
      '#' + MODAL + ' .ovyx-live-field{display:grid;gap:6px;margin:14px 0}' +
      '#' + MODAL + ' label{color:#ddd;font-size:11px;font-weight:750}' +
      '#' + MODAL + ' input,#' + MODAL + ' textarea{width:100%;border:1px solid #ffffff24;border-radius:9px;background:#111;color:#fff;padding:11px;font:500 13px Inter,system-ui,sans-serif;outline:none}' +
      '#' + MODAL + ' input:focus,#' + MODAL + ' textarea:focus{border-color:#e8b64f}' +
      '#' + MODAL + ' textarea{min-height:110px;resize:vertical}' +
      '#' + MODAL + ' .ovyx-live-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:15px}' +
      '#' + MODAL + ' button{border:1px solid #ffffff25;border-radius:9px;background:#171717;color:#eee;padding:10px 13px;font:750 11px Inter,system-ui,sans-serif;cursor:pointer}' +
      '#' + MODAL + ' button:disabled{opacity:.45;cursor:wait}' +
      '#' + MODAL + ' button.ovyx-live-primary{background:#e8b64f;color:#17120a;border-color:#e8b64f}' +
      '#' + MODAL + ' .ovyx-live-status{white-space:pre-wrap;overflow-wrap:anywhere;border:1px solid #ffffff18;border-radius:10px;background:#ffffff05;padding:11px;margin-top:13px;color:#c7c7c7;font-size:11px}' +
      '#' + MODAL + ' .ovyx-live-status[data-kind=error]{color:#ffb4aa;border-color:#ffb4aa55}' +
      '#' + MODAL + ' .ovyx-live-status[data-kind=success]{color:#a7e6bd;border-color:#86d9a955}' +
      '#' + MODAL + ' .ovyx-live-match{border:1px solid #e8b64f45;border-radius:10px;padding:12px;margin-top:12px;background:#e8b64f08}' +
      '#' + MODAL + ' .ovyx-live-match strong{color:#f2d28c}' +
      '#' + MODAL + ' .ovyx-live-note{font-size:10px;color:#999;margin-top:12px}' +
      '@media(max-width:600px){#' + ROOT + '-launcher{right:12px;bottom:12px;padding:10px 12px}#' + MODAL + ' .ovyx-live-card{padding:16px}}';
    document.head.appendChild(style);
  }
  function setStatus(node, message, kind) {
    if (!node) return;
    node.textContent = message || '';
    node.dataset.kind = kind || 'info';
  }
  function getProjectById(id) {
    return (Array.isArray(state().projects) ? state().projects : []).find(function (item) {
      return item && String(item.id) === String(id);
    }) || null;
  }
  async function ensureProjectLoaded(id) {
    var found = getProjectById(id);
    if (found) return found;
    var data = await request('/api/projects', { method: 'GET' });
    var projects = Array.isArray(data.projects) ? data.projects : [];
    state().projects = projects;
    if (window.ProjectStore && typeof window.ProjectStore.renderProjects === 'function') window.ProjectStore.renderProjects();
    found = getProjectById(id);
    if (!found) throw new Error('The matching website is no longer in this signed-in account. No website was changed.');
    return found;
  }
  function buildUpdatePrompt(instruction, resolution) {
    return [
      'OVYX EXISTING LIVE WEBSITE UPDATE — PRODUCTION-SAFE SCOPED EDIT',
      '',
      'The owner has supplied a URL that OVYX has authenticated and matched to this exact saved project in this account. Update this existing project only. The deployment target is the existing production Pages project and its currently attached hostname: ' + resolution.canonicalUrl,
      'Never create a new project, new Pages project, new deployment destination, new hostname, new custom domain or a replacement website. Do not change the existing project ID, its hosting target or its domain mapping.',
      '',
      'FIRST inspect the complete saved project graph, framework, routes, components, APIs, schemas, migrations, dependencies, integrations and current behavior. Understand what this website does before editing. Reuse existing code and services. Identify the smallest safe set of files to change.',
      '',
      'OWNER REQUEST:',
      instruction,
      '',
      'IMPLEMENTATION RULES:',
      '- Make the requested changes in the existing project source files, not just a plan, screenshot or description.',
      '- Preserve the existing brand, layout, page content, URLs/routes, responsive behavior, accessibility, SEO, metadata and all unrelated working features unless the owner explicitly asks to change them.',
      '- Do not rebuild the site from scratch, replace the framework, delete unrelated files, create duplicate APIs or overwrite user content outside the requested scope.',
      '- Keep existing project data, Firebase identity, database schemas and integrations intact. If a schema/data change is necessary, prefer additive/backward-compatible changes and document migration/rollback steps. Do not run destructive production migrations.',
      '- Connect every changed frontend control to the real existing backend/API. Never add fake data, mock success, fake payments, fake bookings or pretend an external service is connected.',
      '- Keep credentials and secrets server-side. Never copy private keys, API tokens, .env files or customer data into browser code or exported source.',
      '- The current production publisher supports static assets and compatible root _worker.js output. It does not deploy a functions/ directory. Do not add functions/ routes that this existing target would silently fail to publish. If the requested feature requires an unsupported runtime/binding, preserve the current website and explain the exact backend deployment requirement instead of claiming it is live.',
      '- Support the actual audience and countries specified by the owner. Do not assume Nigeria, NGN, USD, one language, one date format, one timezone, one tax regime or one payment provider. Use locale-aware Intl APIs, ISO currency/country codes and IANA timezones where appropriate; do not invent exchange rates, taxes, legal requirements or provider availability.',
      '- Keep the current hosting project and domain. A production publish must update the existing project, not provision another one.',
      '',
      'VERIFY:',
      '- Run the available Web Studio source/quality tests after editing. Fix issues caused by this change before reporting success.',
      '- Confirm all requested changes are represented in the actual project files. If the build/test gate fails, do not publish.',
      '- Never report a provider or backend operation as live unless the target runtime and real service have been verified.',
      '- Deliver the changes in the existing project graph. Do not answer with a plan alone.'
    ].join('\n');
  }
  function cloneGraph(studioRef) {
    if (typeof studioRef.ensureProjectGraph === 'function') studioRef.ensureProjectGraph();
    var graph = studioRef.graph || state().activeProject && state().activeProject.ovyxGraph;
    if (!graph || !graph.files || !Object.keys(graph.files).length) throw new Error('The saved website source files are not ready. Open the project again and retry.');
    return clone(graph);
  }
  function changedPaths(before, after) {
    var a = before && before.files || {}, b = after && after.files || {};
    return Array.from(new Set(Object.keys(a).concat(Object.keys(b)))).filter(function (path) {
      var left = a[path], right = b[path];
      return String(typeof left === 'string' ? left : left && left.content || '') !== String(typeof right === 'string' ? right : right && right.content || '');
    }).sort();
  }
  function restoreProject(studioRef, snapshot) {
    var s = state();
    s.projects = (Array.isArray(s.projects) ? s.projects : []).map(function (item) {
      return item && String(item.id) === String(snapshot.project.id) ? clone(snapshot.project) : item;
    });
    s.activeProject = clone(snapshot.project);
    studioRef.graph = clone(snapshot.graph);
    s.activeProject.ovyxGraph = clone(snapshot.graph);
    try { studioRef.syncGraphToProject && studioRef.syncGraphToProject(); } catch (_) {}
    try { window.ProjectStore && window.ProjectStore.save && window.ProjectStore.save(); } catch (_) {}
    try { studioRef.renderPreview && studioRef.renderPreview(); } catch (_) {}
    try { studioRef.render && studioRef.render(); } catch (_) {}
  }
  function projectFilesForDeploy(graph) {
    var files = {};
    Object.keys(graph.files || {}).forEach(function (path) {
      var normalized = String(path || '').replace(/\\\\/g, '/').replace(/^\\.\\//, '');
      if (!normalized || normalized.startsWith('/') || normalized.split('/').includes('..')) throw new Error('The updated project contains an unsafe file path. No deployment was started.');
      if (normalized === 'functions' || normalized.startsWith('functions/')) throw new Error('This website now contains a functions/ backend folder, which the current production publisher cannot deploy. The live website was not changed. The generated source will be restored so the published version and saved project do not drift.');
      var record = graph.files[path];
      var content = typeof record === 'string' ? record : record && record.content;
      if (typeof content !== 'string') throw new Error('A project file could not be packaged safely: ' + clean(path, 120));
      files[normalized] = { content: content, contentType: record && typeof record === 'object' ? record.contentType || undefined : undefined };
    });
    if (!Object.keys(files).length) throw new Error('No website files are available to publish.');
    return files;
  }
  async function publishExistingProject(project, resolution, graph, statusNode) {
    var files = projectFilesForDeploy(graph);
    setStatus(statusNode, 'Publishing the verified changes to the existing website project…');
    var response = await request('/api/deploy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: String(project.id),
        projectName: String(project.name || project.title || 'site'),
        pagesProjectName: String(resolution.pagesProjectName || ''),
        action: 'publish',
        files: files
      })
    });
    var deploymentId = response.deployment && response.deployment.deploymentId;
    if (!deploymentId) throw new Error('The existing hosting project did not return a deployment ID. The live site was not confirmed as updated.');
    var query = new URLSearchParams({
      projectId: String(project.id),
      projectName: String(project.name || project.title || 'site'),
      pagesProjectName: String(resolution.pagesProjectName || ''),
      deploymentId: String(deploymentId)
    });
    var finalState = null;
    for (var attempt = 0; attempt < 90; attempt += 1) {
      await new Promise(function (resolve) { window.setTimeout(resolve, 2000); });
      var checked = await request('/api/deployment-status?' + query.toString(), { method: 'GET' });
      finalState = checked.deployment || {};
      if (finalState.stage === 'deploy' && finalState.status === 'success' && finalState.environment === 'production') break;
      if (finalState.status === 'failure' || finalState.status === 'canceled') {
        throw new Error('The production deployment failed. Cloudflare keeps the previous successful production release available.');
      }
    }
    if (!finalState || finalState.stage !== 'deploy' || finalState.status !== 'success' || finalState.environment !== 'production') {
      throw new Error('Cloudflare is still processing the production update. Check Publishing → release history before retrying; do not create another website.');
    }
    var canonical = 'https://' + resolution.canonicalUrl.replace(/^https:\/\//i, '').split('/')[0];
    project.ovyxDeployments = Array.isArray(project.ovyxDeployments) ? project.ovyxDeployments : [];
    project.ovyxDeployments.unshift({ at: Date.now(), status: 'published', url: canonical, deploymentId: String(deploymentId), action: 'live-site-update' });
    if (finalState.pagesProjectName) project.ovyxPagesProjectName = String(finalState.pagesProjectName);
    project.ovyxDeployments = project.ovyxDeployments.slice(0, 30);
    if (resolution.matchedBy === 'connected-custom-domain') project.ovyxDeploymentDomain = canonical.replace(/^https:\/\//, '');
    try { window.ProjectStore && window.ProjectStore.save && window.ProjectStore.save(); } catch (_) {}
    try { window.OVYXProjectCloudSync && window.OVYXProjectCloudSync.save && window.OVYXProjectCloudSync.save(project); } catch (_) {}
    return { url: canonical, deployment: finalState };
  }
  function setBusy(value, statusNode, findButton, updateButton, closeButton) {
    busy = !!value;
    [findButton, updateButton, closeButton].forEach(function (button) { if (button) button.disabled = busy; });
    if (statusNode && busy) statusNode.dataset.kind = 'info';
  }
  function openModal() {
    var modal = document.getElementById(MODAL);
    if (!modal) return;
    modal.hidden = false;
    activeResolution = null;
    var match = modal.querySelector('.ovyx-live-match');
    var update = modal.querySelector('[data-live-update]');
    if (match) { match.hidden = true; match.textContent = ''; }
    if (update) update.disabled = true;
    var statusNode = modal.querySelector('.ovyx-live-status');
    setStatus(statusNode, 'Paste a link published from this OVYX account. OVYX will verify the link against your saved projects before opening any source files.', 'info');
    var input = modal.querySelector('[data-live-url]');
    if (input) { input.value = ''; input.focus(); }
    var prompt = modal.querySelector('[data-live-instruction]');
    if (prompt) prompt.value = '';
  }
  function closeModal() {
    if (busy) return;
    var modal = document.getElementById(MODAL);
    if (modal) modal.hidden = true;
  }
  function ensureUI() {
    if (!document.getElementById(ROOT + '-launcher')) {
      launcher = el('button', '', 'Update live website');
      launcher.id = ROOT + '-launcher';
      launcher.type = 'button';
      launcher.addEventListener('click', openModal);
      document.body.appendChild(launcher);
    } else launcher = document.getElementById(ROOT + '-launcher');
    if (!document.getElementById(MODAL)) {
      var overlay = el('div');
      overlay.id = MODAL;
      overlay.hidden = true;
      overlay.innerHTML =
        '<section class="ovyx-live-card" role="dialog" aria-modal="true" aria-labelledby="ovyx-live-title">' +
          '<header class="ovyx-live-head"><div><h2 id="ovyx-live-title">Update an existing live website</h2><p class="ovyx-live-muted">Paste your published link. OVYX will find its saved project, edit the real source files and update the same production website.</p></div><button type="button" data-live-close aria-label="Close">✕</button></header>' +
          '<div class="ovyx-live-field"><label for="ovyx-live-url">Published website link</label><input id="ovyx-live-url" data-live-url type="url" inputmode="url" placeholder="https://yourwebsite.com" autocomplete="url"></div>' +
          '<div class="ovyx-live-field"><label for="ovyx-live-instruction">What should the AI change?</label><textarea id="ovyx-live-instruction" data-live-instruction placeholder="Example: Change the hero section, add a contact form, update the product page…"></textarea></div>' +
          '<div class="ovyx-live-match" data-live-match hidden></div>' +
          '<div class="ovyx-live-status" data-live-status role="status" aria-live="polite"></div>' +
          '<div class="ovyx-live-actions"><button type="button" data-live-find>Find my website</button><button type="button" class="ovyx-live-primary" data-live-update disabled>Update this live website</button></div>' +
          '<p class="ovyx-live-note">Security: OVYX only edits a project owned by the signed-in account and verifies the live domain against the existing hosting project. It does not download source code from random public websites or move your domain.</p>' +
        '</section>';
      document.body.appendChild(overlay);
      overlay.querySelector('[data-live-close]').addEventListener('click', closeModal);
      overlay.addEventListener('click', function (event) { if (event.target === overlay) closeModal(); });
      overlay.querySelector('[data-live-url]').addEventListener('input', function () {
        activeResolution = null;
        overlay.querySelector('[data-live-match]').hidden = true;
        overlay.querySelector('[data-live-update]').disabled = true;
      });
      overlay.querySelector('[data-live-find]').addEventListener('click', findWebsite);
      overlay.querySelector('[data-live-update]').addEventListener('click', updateWebsite);
      document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && !busy) closeModal();
      });
    }
    styles();
    syncVisibility();
  }
  function syncVisibility() {
    if (!launcher) launcher = document.getElementById(ROOT + '-launcher');
    if (!launcher) return;
    var active = String(state().activeView || '').replace(/^view-/, '').toLowerCase();
    launcher.hidden = active !== 'webstudio';
  }
  async function findWebsite() {
    if (busy) return;
    var modal = document.getElementById(MODAL);
    var input = modal.querySelector('[data-live-url]');
    var statusNode = modal.querySelector('[data-live-status]');
    var findButton = modal.querySelector('[data-live-find]');
    var updateButton = modal.querySelector('[data-live-update]');
    var value = clean(input.value, 2048);
    if (!value) { setStatus(statusNode, 'Paste the HTTPS link of your published website first.', 'error'); return; }
    setBusy(true, statusNode, findButton, updateButton);
    try {
      setStatus(statusNode, 'Checking your account and verifying which saved project owns this live link…', 'info');
      var result = await request('/api/publishing?resolveUrl=' + encodeURIComponent(value), { method: 'GET' });
      if (!result.site || result.site.sameProject !== true || !result.site.projectId) throw new Error('OVYX could not verify the website project. No changes were made.');
      activeResolution = result.site;
      var match = modal.querySelector('[data-live-match]');
      match.replaceChildren();
      match.appendChild(el('strong', '', result.site.projectName));
      match.appendChild(el('div', 'ovyx-live-muted', result.site.canonicalUrl));
      match.appendChild(el('div', 'ovyx-live-muted', 'Matched using ' + (result.site.matchedBy === 'connected-custom-domain' ? 'a domain connected to this project' : 'the project’s Pages hostname') + '.'));
      match.hidden = false;
      updateButton.disabled = false;
      setStatus(statusNode, 'Website verified. OVYX found the matching project in your account. Review your requested changes, then choose Update this live website.', 'success');
    } catch (error) {
      activeResolution = null;
      setStatus(statusNode, clean(error.message || 'Website lookup failed.', 500), 'error');
    } finally { setBusy(false, statusNode, findButton, updateButton); }
  }
  async function updateWebsite() {
    if (busy || !activeResolution) return;
    var modal = document.getElementById(MODAL);
    var instruction = clean(modal.querySelector('[data-live-instruction]').value, 12000);
    var statusNode = modal.querySelector('[data-live-status]');
    var findButton = modal.querySelector('[data-live-find]');
    var updateButton = modal.querySelector('[data-live-update]');
    var closeButton = modal.querySelector('[data-live-close]');
    if (!instruction) { setStatus(statusNode, 'Tell the AI what you want changed before updating the website.', 'error'); return; }
    if (!window.confirm('OVYX will edit the saved project and publish the result to its existing production website. The domain will not be changed. Continue?')) return;
    setBusy(true, statusNode, findButton, updateButton, closeButton);
    var studioRef = studio();
    var snapshot = null;
    var published = false;
    try {
      if (!studioRef || typeof studioRef.runBuildAgent !== 'function') throw new Error('The Web Studio build agent is not ready. Open Web Studio and try again.');
      var project = await ensureProjectLoaded(activeResolution.projectId);
      if (!window.ProjectStore || typeof window.ProjectStore.open !== 'function') throw new Error('The saved project opener is unavailable. No website was changed.');
      window.ProjectStore.open(String(activeResolution.projectId));
      await new Promise(function (resolve) { window.setTimeout(resolve, 150); });
      studioRef = studio();
      if (!studioRef) throw new Error('Web Studio could not open the selected website.');
      var active = state().activeProject;
      if (!active || String(active.id) !== String(activeResolution.projectId)) throw new Error('OVYX could not activate the matched website. No files were changed.');
      var before = cloneGraph(studioRef);
      snapshot = { project: clone(active), graph: before };
      setStatus(statusNode, 'Creating a safety backup of the saved website before editing…', 'info');
      await request('/api/site-management?projectId=' + encodeURIComponent(active.id), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: active.id, action: 'backup', label: 'Before AI live website update' })
      });
      setStatus(statusNode, 'AI is studying the existing pages, code, backend and integrations before making your requested changes…', 'info');
      var epoch = Number(studioRef.requestEpoch || 0);
      await studioRef.runBuildAgent(buildUpdatePrompt(instruction, activeResolution), true, epoch, [], {
        projectId: String(active.id),
        project: clone(active),
        projects: clone(state().projects || []),
        graph: clone(before)
      });
      var after = cloneGraph(studioRef);
      var changed = changedPaths(before, after);
      if (!changed.length) throw new Error('The AI did not produce any source-file changes. Your published website was not touched.');
      var tests = typeof studioRef.runTests === 'function' ? await studioRef.runTests(true) : null;
      if (!tests || tests.ok !== true) {
        try { studioRef.openEngineeringConsole && studioRef.openEngineeringConsole('tests'); } catch (_) {}
        throw new Error(clean(tests && tests.summary || 'The website quality checks did not pass. OVYX will not publish this update.', 500));
      }
      active = state().activeProject && String(state().activeProject.id) === String(active.id) ? state().activeProject : active;
      active.ovyxGraph = clone(after);
      try { window.ProjectStore && window.ProjectStore.save && window.ProjectStore.save(); } catch (_) {}
      setStatus(statusNode, 'Source checks passed. Publishing to the same production project and preserving the current domain…', 'info');
      var publishedResult = await publishExistingProject(active, activeResolution, after, statusNode);
      published = true;
      try { studioRef.renderPreview && studioRef.renderPreview(); } catch (_) {}
      try { studioRef.render && studioRef.render(); } catch (_) {}
      setStatus(statusNode, 'Website updated successfully. ' + changed.length + ' source file(s) changed. Your existing link is still ' + publishedResult.url + '. The previous project backup is available in Manage Website → Backups.', 'success');
      updateButton.disabled = true;
      findButton.disabled = true;
      toast('Your existing website was updated on its current link.', 'success');
    } catch (error) {
      if (snapshot && !published) {
        try { restoreProject(studioRef || studio(), snapshot); } catch (_) {}
      }
      setStatus(statusNode, clean(error.message || 'The live website update failed.', 600) + (snapshot && !published ? ' The previous saved project snapshot was restored. The previous live production release remains in place.' : ''), 'error');
      toast('The live website was not confirmed as updated. Review the message in the update panel.', 'error');
    } finally {
      busy = false;
      [findButton, updateButton, closeButton].forEach(function (button) { if (button) button.disabled = false; });
      if (published && updateButton) updateButton.disabled = true;
    }
  }
  function toast(message, kind) {
    try { if (typeof window.showToast === 'function') window.showToast(message, kind || 'info'); } catch (_) {}
  }
  function boot() {
    ensureUI();
    window.addEventListener('ovyx:view-changed', syncVisibility);
    window.addEventListener('ovyx:project-loaded', syncVisibility);
    window.addEventListener('firebase-auth-state-ready', syncVisibility);
    var attempts = 0;
    var timer = window.setInterval(function () {
      if (document.getElementById('view-webstudio') || ++attempts > 50) {
        ensureUI();
        window.clearInterval(timer);
      }
    }, 500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();