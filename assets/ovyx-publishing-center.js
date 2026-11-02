(function () {
  'use strict';
  if (window.__OVYX_PUBLISHING_CENTER_V1__) return;
  window.__OVYX_PUBLISHING_CENTER_V1__ = true;

  var STYLE_ID = 'ovyx-publishing-center-style';
  var ROOT_ID = 'ovyx-publishing-center';
  var API = '/api/publishing';

  function clean(value, max) { return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max || 500); }
  function studio() { return window.WebStudio && typeof window.WebStudio === 'object' ? window.WebStudio : null; }
  function project() { return window.KernelState && window.KernelState.activeProject || null; }
  function toast(message, kind) {
    try { if (typeof window.showToast === 'function') window.showToast(message, kind || 'info'); else if (typeof window.toast === 'function') window.toast(message, kind || 'info'); } catch (_) {}
  }
  function authUser() {
    try { return window.firebase && typeof window.firebase.auth === 'function' ? window.firebase.auth().currentUser : null; } catch (_) { return null; }
  }
  async function token() {
    var user = authUser();
    if (!user || typeof user.getIdToken !== 'function') throw new Error('Sign in to OVYX before publishing.');
    return user.getIdToken(true);
  }
  function currentProject() {
    var p = project(), w = studio();
    if (!p || !w) throw new Error('Open a saved website in Web Studio first.');
    if (typeof w.ensureProjectGraph === 'function') w.ensureProjectGraph();
    var id = clean(p.id || p.projectId || p.uid, 160);
    var name = clean(p.name || p.title || 'site', 100);
    var files = {};
    var graphFiles = w.graph && w.graph.files;
    if (!graphFiles || typeof graphFiles !== 'object') throw new Error('The website source files are not ready. Save the project and try again.');
    Object.keys(graphFiles).forEach(function (path) {
      var record = graphFiles[path];
      if (record && typeof record.content === 'string' && record.content.length && !path.endsWith('/')) files[path] = { content: record.content, contentType: record.contentType || undefined };
    });
    if (!id || !Object.keys(files).length) throw new Error('Save the website before publishing it.');
    return { projectId: id, projectName: name, files: files };
  }
  async function request(path, options) {
    var idToken = await token();
    var init = Object.assign({ credentials: 'same-origin' }, options || {});
    init.headers = Object.assign({ Accept: 'application/json', Authorization: 'Bearer ' + idToken }, options && options.headers || {});
    var response = await fetch(path, init);
    var body = await response.json().catch(function () { return {}; });
    if (!response.ok || body.success === false) throw new Error(clean(body.error || body.message || 'The publishing request could not be completed.', 300));
    return body;
  }
  function apiGet(p) {
    var q = new URLSearchParams({ projectId: p.projectId, projectName: p.projectName });
    return request(API + '?' + q.toString(), { method: 'GET' });
  }
  function apiPost(p, action, extra) {
    return request(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ projectId: p.projectId, projectName: p.projectName, action: action }, extra || {}))
    });
  }
  function style() {
    if (document.getElementById(STYLE_ID)) return;
    var node = document.createElement('style');
    node.id = STYLE_ID;
    node.textContent = '#'+ROOT_ID+'{position:fixed;right:22px;bottom:22px;z-index:9998;font:500 13px/1.45 Inter,system-ui,sans-serif;color:#f5f5f5}#'+ROOT_ID+' .ovyx-pub-trigger{border:1px solid rgba(232,182,79,.55);background:linear-gradient(135deg,#19150d,#080808);color:#f6d995;border-radius:13px;padding:12px 17px;box-shadow:0 12px 40px #0008;cursor:pointer;font-weight:700}#'+ROOT_ID+' .ovyx-pub-trigger:hover{border-color:#e8b64f;background:#211a0e}#'+ROOT_ID+' .ovyx-pub-modal{position:fixed;inset:0;background:#000b;display:flex;align-items:center;justify-content:center;padding:18px;z-index:9999}#'+ROOT_ID+' .ovyx-pub-card{width:min(720px,100%);max-height:min(84vh,780px);overflow:auto;background:#090909;border:1px solid #ffffff20;border-radius:20px;box-shadow:0 24px 100px #000c;padding:22px}#'+ROOT_ID+' .ovyx-pub-head{display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid #ffffff18;padding-bottom:14px;margin-bottom:18px}#'+ROOT_ID+' h2{font-size:17px;margin:0;color:#fff}#'+ROOT_ID+' .ovyx-pub-muted{color:#9b9b9b;font-size:12px}#'+ROOT_ID+' .ovyx-pub-close{border:0;background:#ffffff10;color:#ddd;border-radius:9px;width:34px;height:34px;cursor:pointer}#'+ROOT_ID+' .ovyx-pub-actions{display:flex;flex-wrap:wrap;gap:9px;margin:14px 0}#'+ROOT_ID+' button.ovyx-pub-action{border:1px solid #ffffff20;background:#151515;color:#eee;border-radius:10px;padding:10px 13px;cursor:pointer}#'+ROOT_ID+' button.ovyx-pub-primary{background:#e8b64f;color:#17120a;border-color:#e8b64f;font-weight:700}#'+ROOT_ID+' button:disabled{opacity:.45;cursor:not-allowed}#'+ROOT_ID+' .ovyx-pub-section{border:1px solid #ffffff16;border-radius:13px;padding:14px;margin:12px 0;background:#ffffff04}#'+ROOT_ID+' .ovyx-pub-section strong{color:#fff}#'+ROOT_ID+' .ovyx-pub-row{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}#'+ROOT_ID+' .ovyx-pub-domain-form{display:flex;gap:8px;margin-top:12px}#'+ROOT_ID+' input.ovyx-pub-input{min-width:0;flex:1;background:#111;border:1px solid #ffffff26;color:#fff;border-radius:9px;padding:11px 12px}#'+ROOT_ID+' .ovyx-pub-status{margin-top:10px;color:#c9b17c;font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere}#'+ROOT_ID+' .ovyx-pub-empty{padding:16px;color:#999;text-align:center;border:1px dashed #ffffff20;border-radius:12px}#'+ROOT_ID+' .ovyx-pub-pill{font-size:11px;border:1px solid #ffffff25;border-radius:99px;padding:3px 8px;color:#cfcfcf}#'+ROOT_ID+' .ovyx-pub-danger{color:#ffb2a8!important}#'+ROOT_ID+' code{color:#f0cf88;overflow-wrap:anywhere}#'+ROOT_ID+' .ovyx-pub-hint{font-size:12px;color:#a7a7a7;margin-top:8px}';
    document.head.appendChild(node);
  }
  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }
  function activeView() {
    var view = document.getElementById('view-web-studio');
    if (!view) return !!studio();
    var css = window.getComputedStyle(view);
    return css.display !== 'none' && css.visibility !== 'hidden' && view.getAttribute('aria-hidden') !== 'true';
  }
  function mount() {
    if (!activeView() || !project() || !studio()) {
      var old = document.getElementById(ROOT_ID);
      if (old) old.remove();
      return;
    }
    if (document.getElementById(ROOT_ID)) return;
    style();
    var root = el('div');
    root.id = ROOT_ID;
    var trigger = el('button', 'ovyx-pub-trigger', 'Publish website');
    trigger.type = 'button';
    trigger.addEventListener('click', openCenter);
    root.appendChild(trigger);
    document.body.appendChild(root);
  }
  function statusLine(node, message, error) {
    node.textContent = message || '';
    node.classList.toggle('ovyx-pub-danger', !!error);
  }
  function openCenter() {
    var p;
    try { p = currentProject(); } catch (error) { toast(error.message, 'warning'); return; }
    style();
    var root = document.getElementById(ROOT_ID);
    if (!root) { mount(); root = document.getElementById(ROOT_ID); }
    if (!root) return;
    var old = root.querySelector('.ovyx-pub-modal'); if (old) old.remove();
    var modal = el('div', 'ovyx-pub-modal');
    modal.addEventListener('click', function (event) { if (event.target === modal) modal.remove(); });
    var card = el('section', 'ovyx-pub-card');
    card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true'); card.setAttribute('aria-label', 'Website publishing');
    var head = el('div', 'ovyx-pub-head');
    var titleWrap = el('div');
    titleWrap.appendChild(el('h2', '', 'Publish website'));
    titleWrap.appendChild(el('div', 'ovyx-pub-muted', p.projectName + ' · Cloudflare Pages'));
    head.appendChild(titleWrap);
    var close = el('button', 'ovyx-pub-close', '×'); close.type = 'button'; close.setAttribute('aria-label', 'Close publishing center'); close.addEventListener('click', function () { modal.remove(); }); head.appendChild(close);
    card.appendChild(head);
    var status = el('div', 'ovyx-pub-status'); card.appendChild(status);
    var releases = el('div'); var domains = el('div');
    var actions = el('div', 'ovyx-pub-actions');
    var preview = el('button', 'ovyx-pub-action', 'Create preview'); preview.type = 'button';
    var publish = el('button', 'ovyx-pub-action ovyx-pub-primary', 'Publish to production'); publish.type = 'button';
    actions.append(preview, publish); card.appendChild(actions);
    var domainSection = el('div', 'ovyx-pub-section');
    domainSection.appendChild(el('strong', '', 'Custom domain'));
    domainSection.appendChild(el('div', 'ovyx-pub-hint', 'Connect a domain you own, including .com and .com.ng. Cloudflare provisions HTTPS after DNS and domain validation.'));
    var form = el('form', 'ovyx-pub-domain-form');
    var input = el('input', 'ovyx-pub-input'); input.type = 'text'; input.placeholder = 'yourdomain.com'; input.autocomplete = 'url'; input.maxLength = 253; input.setAttribute('aria-label', 'Custom domain name');
    var add = el('button', 'ovyx-pub-action ovyx-pub-primary', 'Connect domain'); add.type = 'submit';
    form.append(input, add); domainSection.appendChild(form); card.appendChild(domainSection);
    var domainList = el('div'); card.appendChild(domainList);
    card.appendChild(el('div', 'ovyx-pub-muted', 'Releases · successful production releases can be restored if a newer release has a problem.'));
    card.appendChild(releases);
    modal.appendChild(card); root.appendChild(modal);

    function setBusy(value) { [preview, publish, add].forEach(function (button) { button.disabled = !!value; }); }
    async function refresh() {
      try {
        var data = await apiGet(p);
        if (data.requiresFirstDeployment) statusLine(status, 'No release yet. Publish a preview or production release first; the first domain connection can also initialize your Pages project.');
        releases.replaceChildren(); domainList.replaceChildren();
        if (!data.releases || !data.releases.length) releases.appendChild(el('div', 'ovyx-pub-empty', 'No production releases yet. Publish your first release.'));
        (data.releases || []).forEach(function (release) {
          var box = el('div', 'ovyx-pub-section');
          var row = el('div', 'ovyx-pub-row');
          var left = el('div'); left.appendChild(el('strong', '', release.createdAt ? new Date(release.createdAt).toLocaleString() : 'Production release'));
          left.appendChild(el('div', 'ovyx-pub-muted', release.stage + ' · ' + release.status + ' · ' + release.deploymentId.slice(0, 12)));
          row.appendChild(left); row.appendChild(el('span', 'ovyx-pub-pill', release.environment));
          box.appendChild(row);
          if (release.url) { var link = el('a', 'ovyx-pub-hint', release.url); link.href = release.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; box.appendChild(link); }
          if (release.canRollback) {
            var rollback = el('button', 'ovyx-pub-action', 'Restore this release'); rollback.type = 'button';
            rollback.addEventListener('click', async function () {
              if (!window.confirm('Restore this production release? Your current production release will be replaced.')) return;
              try { setBusy(true); statusLine(status, 'Restoring the selected production release…'); await apiPost(p, 'rollback', { deploymentId: release.deploymentId }); statusLine(status, 'The rollback request was accepted. Refreshing release history…'); await refresh(); }
              catch (error) { statusLine(status, error.message, true); }
              finally { setBusy(false); }
            });
            box.appendChild(rollback);
          }
          releases.appendChild(box);
        });
        if (!data.domains || !data.domains.length) domainList.appendChild(el('div', 'ovyx-pub-empty', 'No custom domains connected.'));
        (data.domains || []).forEach(function (domain) {
          var box = el('div', 'ovyx-pub-section');
          var row = el('div', 'ovyx-pub-row');
          var left = el('div'); left.appendChild(el('strong', '', domain.name)); left.appendChild(el('div', 'ovyx-pub-muted', domain.httpsReady ? 'HTTPS active' : 'Domain ' + domain.status + ' · HTTPS pending'));
          row.appendChild(left); row.appendChild(el('span', 'ovyx-pub-pill', domain.status)); box.appendChild(row);
          var dns = domain.dns || {};
          var hint = 'DNS: ' + (dns.type || 'CNAME') + ' · ' + (dns.name || domain.name) + ' → ' + (dns.target || 'Cloudflare Pages');
          box.appendChild(el('div', 'ovyx-pub-hint', hint));
          if (domain.validation && domain.validation.txtValue) box.appendChild(el('div', 'ovyx-pub-hint', 'TXT verification: ' + domain.validation.txtName + ' = ' + domain.validation.txtValue));
          if (domain.validation && domain.validation.error) box.appendChild(el('div', 'ovyx-pub-hint ovyx-pub-danger', domain.validation.error));
          var controls = el('div', 'ovyx-pub-actions');
          if (!domain.httpsReady) {
            var retry = el('button', 'ovyx-pub-action', 'Retry verification'); retry.type = 'button';
            retry.addEventListener('click', async function () { try { setBusy(true); await apiPost(p, 'retry-domain', { domain: domain.name }); statusLine(status, 'Domain verification was retried.'); await refresh(); } catch (error) { statusLine(status, error.message, true); } finally { setBusy(false); } });
            controls.appendChild(retry);
          }
          var remove = el('button', 'ovyx-pub-action', 'Disconnect'); remove.type = 'button';
          remove.addEventListener('click', async function () { if (!window.confirm('Disconnect ' + domain.name + ' from this website?')) return; try { setBusy(true); await apiPost(p, 'remove-domain', { domain: domain.name }); statusLine(status, 'Domain disconnected.'); await refresh(); } catch (error) { statusLine(status, error.message, true); } finally { setBusy(false); } });
          controls.appendChild(remove); box.appendChild(controls); domainList.appendChild(box);
        });
      } catch (error) { statusLine(status, error.message, true); }
    }
    async function deploy(action) {
      try {
        setBusy(true);
        statusLine(status, action === 'publish' ? 'Preparing production release…' : 'Preparing preview deployment…');
        var payload = await request('/api/deploy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(Object.assign({}, p, { action: action, files: p.files }))
        });
        var deployment = payload.deployment || {};
        if (!deployment.deploymentId) throw new Error('The publishing service did not return a release ID.');
        statusLine(status, 'Upload complete. Waiting for Cloudflare to finish deployment…');
        var q = new URLSearchParams({ projectId: p.projectId, projectName: p.projectName, deploymentId: deployment.deploymentId });
        var finalState = null;
        for (var attempt = 0; attempt < 90; attempt++) {
          await new Promise(function (resolve) { window.setTimeout(resolve, 2000); });
          var result = await request('/api/deployment-status?' + q.toString(), { method: 'GET' });
          finalState = result.deployment || {};
          statusLine(status, 'Cloudflare: ' + (finalState.stage || 'starting') + ' · ' + (finalState.status || 'queued'));
          if (finalState.stage === 'deploy' && finalState.status === 'success') break;
          if (finalState.status === 'failure' || finalState.status === 'canceled') throw new Error('Cloudflare deployment failed during ' + (finalState.stage || 'deployment') + '. Your previous production release remains available.');
        }
        if (!finalState || finalState.stage !== 'deploy' || finalState.status !== 'success') throw new Error('Cloudflare is still processing this release. Check the release history again shortly.');
        if (finalState.url) { var url = el('a', 'ovyx-pub-hint', 'Open published website: ' + finalState.url); url.href = finalState.url; url.target = '_blank'; url.rel = 'noopener noreferrer'; status.appendChild(url); }
        else statusLine(status, 'Deployment succeeded. The live URL is available in release history.');
        toast(action === 'publish' ? 'Website published successfully.' : 'Preview deployment is ready.', 'success');
        window.dispatchEvent(new CustomEvent('ovyx:publishing-center-deployed', { detail: { action: action, deployment: finalState } }));
        await refresh();
      } catch (error) { statusLine(status, error.message, true); toast(error.message, 'error'); }
      finally { setBusy(false); }
    }
    preview.addEventListener('click', function () { deploy('deploy'); });
    publish.addEventListener('click', function () { deploy('publish'); });
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      var domain = clean(input.value, 253);
      if (!domain) { statusLine(status, 'Enter the domain you want to connect.', true); return; }
      try { setBusy(true); statusLine(status, 'Registering custom domain with Cloudflare…'); await apiPost(p, 'add-domain', { domain: domain }); input.value = ''; statusLine(status, 'Domain added. Follow the DNS instructions below and wait for validation and HTTPS activation.'); await refresh(); }
      catch (error) { statusLine(status, error.message, true); }
      finally { setBusy(false); }
    });
    refresh();
    close.focus();
  }

  function boot() {
    mount();
    var observer = new MutationObserver(function () { mount(); });
    if (document.body) observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'aria-hidden'] });
    window.addEventListener('ovyx:project-loaded', mount);
    window.addEventListener('ovyx:project-saved', mount);
    window.addEventListener('ovyx:webstudio-ready', mount);
    window.setInterval(mount, 1800);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
