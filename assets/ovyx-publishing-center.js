(function () {
  'use strict';
  if (window.__OVYX_PUBLISHING_CENTER_V2__) return;
  window.__OVYX_PUBLISHING_CENTER_V2__ = true;

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
    var id = clean(p.id || p.projectId, 160);
    var name = clean(p.name || p.title || 'site', 100);
    var files = {};
    var graphFiles = w.graph && w.graph.files;
    if (!graphFiles || typeof graphFiles !== 'object') throw new Error('The website source files are not ready. Save the project and try again.');
    Object.keys(graphFiles).forEach(function (path) {
      var record = graphFiles[path];
      var content = typeof record === 'string' ? record : record && record.content;
      if (typeof content === 'string' && content.length && !path.endsWith('/')) {
        files[path] = { content: content, contentType: record && typeof record === 'object' ? record.contentType || undefined : undefined };
      }
    });
    if (!id || !Object.keys(files).length) throw new Error('Save the website before publishing it.');
    return { projectId: id, projectName: name, files: files };
  }
  async function request(path, options) {
    var idToken = await token();
    var init = Object.assign({ credentials: 'same-origin', cache: 'no-store' }, options || {});
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
    node.textContent = '#'+ROOT_ID+'{margin:14px 0 4px;color:#f5f5f5;font:500 12px/1.5 Inter,system-ui,sans-serif}#'+ROOT_ID+' .ovyx-pub-card{width:100%;background:linear-gradient(145deg,#0d0d0d,#080808);border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:15px;box-shadow:0 12px 36px #0005}#'+ROOT_ID+' .ovyx-pub-head{display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid #ffffff18;padding-bottom:12px;margin-bottom:12px}#'+ROOT_ID+' h3{font-size:13px;margin:0;color:#fff;font-weight:750}#'+ROOT_ID+' .ovyx-pub-muted{color:#999;font-size:11px}#'+ROOT_ID+' .ovyx-pub-actions{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}#'+ROOT_ID+' button.ovyx-pub-action{border:1px solid #ffffff20;background:#151515;color:#eee;border-radius:9px;padding:9px 12px;cursor:pointer;font:700 11px Inter,system-ui,sans-serif}#'+ROOT_ID+' button.ovyx-pub-primary{background:#e8b64f;color:#17120a;border-color:#e8b64f;font-weight:800}#'+ROOT_ID+' button:disabled{opacity:.45;cursor:not-allowed}#'+ROOT_ID+' .ovyx-pub-section{border:1px solid #ffffff16;border-radius:11px;padding:12px;margin:10px 0;background:#ffffff04}#'+ROOT_ID+' .ovyx-pub-row{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}#'+ROOT_ID+' .ovyx-pub-domain-form{display:flex;gap:8px;margin-top:10px}#'+ROOT_ID+' input.ovyx-pub-input{min-width:0;flex:1;background:#111;border:1px solid #ffffff26;color:#fff;border-radius:8px;padding:10px 11px;font:500 12px Inter,system-ui,sans-serif}#'+ROOT_ID+' .ovyx-pub-status{margin:8px 0;color:#c9b17c;font-size:11px;white-space:pre-wrap;overflow-wrap:anywhere}#'+ROOT_ID+' .ovyx-pub-empty{padding:12px;color:#999;text-align:center;border:1px dashed #ffffff20;border-radius:10px;font-size:11px}#'+ROOT_ID+' .ovyx-pub-pill{font-size:10px;border:1px solid #ffffff25;border-radius:99px;padding:3px 8px;color:#cfcfcf}#'+ROOT_ID+' .ovyx-pub-danger{color:#ffb2a8!important}#'+ROOT_ID+' code{color:#f0cf88;overflow-wrap:anywhere}#'+ROOT_ID+' .ovyx-pub-hint{font-size:11px;color:#a7a7a7;margin-top:7px;overflow-wrap:anywhere}#'+ROOT_ID+' a{color:#e8c77e;text-decoration:underline;overflow-wrap:anywhere}#'+ROOT_ID+' .ovyx-pub-title{font-size:11px;color:#e8c77e;font-weight:800;letter-spacing:.08em;text-transform:uppercase;margin:14px 0 6px}';
    document.head.appendChild(node);
  }
  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }
  function statusLine(node, message, error) {
    node.textContent = message || '';
    node.classList.toggle('ovyx-pub-danger', !!error);
  }
  function enhanceDeployPanel() {
    var host = document.getElementById('ws-deploy-content');
    var w = studio();
    if (!host || !w || !project() || host.querySelector('[data-ovyx-publishing-center]')) return;
    var p;
    try { p = currentProject(); } catch (error) { return; }
    style();

    var legacyDomain = host.querySelector('#ws-deploy-domain');
    var legacyEnv = host.querySelector('#ws-deploy-env');
    if (legacyDomain) { var domainField = legacyDomain.closest('.ovyx-ws-plan-field'); if (domainField) domainField.hidden = true; }
    if (legacyEnv) { var envField = legacyEnv.closest('.ovyx-ws-plan-field'); if (envField) envField.hidden = true; }

    var legacyPublish = host.querySelector('#ws-deploy-run');
    if (legacyPublish) {
      legacyPublish.textContent = 'Publish to production';
      legacyPublish.classList.add('ovyx-pub-action', 'ovyx-pub-primary');
      legacyPublish.onclick = function () { deploy('publish'); };
      legacyPublish.removeAttribute('onclick');
    }

    var root = el('section', 'ovyx-pub-card');
    root.id = ROOT_ID;
    root.setAttribute('data-ovyx-publishing-center', '');
    var head = el('div', 'ovyx-pub-head');
    var heading = el('div');
    heading.appendChild(el('h3', '', 'Publishing & custom domains'));
    heading.appendChild(el('div', 'ovyx-pub-muted', 'Preview, release, connect your domain and restore earlier production versions.'));
    head.appendChild(heading);
    head.appendChild(el('span', 'ovyx-pub-pill', 'CLOUDFLARE PAGES'));
    root.appendChild(head);

    var status = el('div', 'ovyx-pub-status');
    root.appendChild(status);
    var actions = el('div', 'ovyx-pub-actions');
    var preview = el('button', 'ovyx-pub-action', 'Create preview');
    preview.type = 'button';
    actions.appendChild(preview);
    if (!legacyPublish) {
      legacyPublish = el('button', 'ovyx-pub-action ovyx-pub-primary', 'Publish to production');
      legacyPublish.type = 'button';
      actions.appendChild(legacyPublish);
      legacyPublish.addEventListener('click', function () { deploy('publish'); });
    }
    root.appendChild(actions);

    var domainSection = el('div', 'ovyx-pub-section');
    domainSection.appendChild(el('strong', '', 'Custom domain'));
    domainSection.appendChild(el('div', 'ovyx-pub-hint', 'Connect a domain you own, including .com and .com.ng. Cloudflare activates HTTPS after DNS and domain validation. Domain registration is not included.'));
    var form = el('form', 'ovyx-pub-domain-form');
    var input = el('input', 'ovyx-pub-input');
    input.type = 'text';
    input.placeholder = 'yourdomain.com';
    input.autocomplete = 'url';
    input.maxLength = 253;
    input.setAttribute('aria-label', 'Custom domain name');
    input.value = clean(legacyDomain && legacyDomain.value || project()?.ovyxDeploymentDomain || '', 253);
    var add = el('button', 'ovyx-pub-action ovyx-pub-primary', 'Connect domain');
    add.type = 'submit';
    form.append(input, add);
    domainSection.appendChild(form);
    domainSection.appendChild(el('div', 'ovyx-pub-hint', 'Apex domains need their DNS zone on this Cloudflare account. Subdomains use a CNAME to your Pages hostname. Follow the exact DNS record shown after connecting.'));
    root.appendChild(domainSection);

    var domainList = el('div');
    root.appendChild(domainList);
    root.appendChild(el('div', 'ovyx-pub-title', 'Production release history'));
    var releases = el('div');
    root.appendChild(releases);
    root.appendChild(el('div', 'ovyx-pub-hint', 'Service credentials stay in Cloudflare environment settings. This static Pages publishing flow does not upload project secrets.'));

    host.appendChild(root);

    function setBusy(value) {
      preview.disabled = !!value;
      add.disabled = !!value;
      if (legacyPublish) legacyPublish.disabled = !!value;
    }
    async function refresh() {
      try {
        var data = await apiGet(p);
        if (data.requiresFirstDeployment) statusLine(status, 'No release yet. Publish a preview or production release first; the first domain connection can also initialize your Pages project.');
        releases.replaceChildren();
        domainList.replaceChildren();
        if (!data.releases || !data.releases.length) releases.appendChild(el('div', 'ovyx-pub-empty', 'No production releases yet. Publish your first release.'));
        (data.releases || []).forEach(function (release) {
          var box = el('div', 'ovyx-pub-section');
          var row = el('div', 'ovyx-pub-row');
          var left = el('div');
          left.appendChild(el('strong', '', release.createdAt ? new Date(release.createdAt).toLocaleString() : 'Production release'));
          left.appendChild(el('div', 'ovyx-pub-muted', release.stage + ' · ' + release.status + ' · ' + release.deploymentId.slice(0, 12)));
          row.appendChild(left);
          row.appendChild(el('span', 'ovyx-pub-pill', release.environment));
          box.appendChild(row);
          if (release.url) {
            var link = el('a', 'ovyx-pub-hint', release.url);
            link.href = release.url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            box.appendChild(link);
          }
          if (release.canRollback) {
            var rollback = el('button', 'ovyx-pub-action', 'Restore this release');
            rollback.type = 'button';
            rollback.addEventListener('click', async function () {
              if (!window.confirm('Restore this production release? Your current production release will be replaced.')) return;
              try {
                setBusy(true);
                statusLine(status, 'Restoring the selected production release…');
                await apiPost(p, 'rollback', { deploymentId: release.deploymentId });
                statusLine(status, 'The rollback request was accepted. Refreshing release history…');
                await refresh();
              } catch (error) { statusLine(status, error.message, true); }
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
          var left = el('div');
          left.appendChild(el('strong', '', domain.name));
          left.appendChild(el('div', 'ovyx-pub-muted', domain.httpsReady ? 'HTTPS active' : 'Domain ' + domain.status + ' · HTTPS pending'));
          row.appendChild(left);
          row.appendChild(el('span', 'ovyx-pub-pill', domain.status));
          box.appendChild(row);
          var dns = domain.dns || {};
          box.appendChild(el('div', 'ovyx-pub-hint', 'DNS: ' + (dns.type || 'CNAME') + ' · ' + (dns.name || domain.name) + ' → ' + (dns.target || 'Cloudflare Pages')));
          if (domain.validation && domain.validation.txtValue) box.appendChild(el('div', 'ovyx-pub-hint', 'TXT verification: ' + domain.validation.txtName + ' = ' + domain.validation.txtValue));
          if (domain.validation && domain.validation.error) box.appendChild(el('div', 'ovyx-pub-hint ovyx-pub-danger', domain.validation.error));
          if (domain.verification && domain.verification.error) box.appendChild(el('div', 'ovyx-pub-hint ovyx-pub-danger', domain.verification.error));
          var controls = el('div', 'ovyx-pub-actions');
          if (!domain.httpsReady) {
            var retry = el('button', 'ovyx-pub-action', 'Retry verification');
            retry.type = 'button';
            retry.addEventListener('click', async function () {
              try { setBusy(true); await apiPost(p, 'retry-domain', { domain: domain.name }); statusLine(status, 'Domain verification was retried.'); await refresh(); }
              catch (error) { statusLine(status, error.message, true); }
              finally { setBusy(false); }
            });
            controls.appendChild(retry);
          }
          var remove = el('button', 'ovyx-pub-action', 'Disconnect');
          remove.type = 'button';
          remove.addEventListener('click', async function () {
            if (!window.confirm('Disconnect ' + domain.name + ' from this website?')) return;
            try { setBusy(true); await apiPost(p, 'remove-domain', { domain: domain.name }); statusLine(status, 'Domain disconnected.'); await refresh(); }
            catch (error) { statusLine(status, error.message, true); }
            finally { setBusy(false); }
          });
          controls.appendChild(remove);
          box.appendChild(controls);
          domainList.appendChild(box);
        });
      } catch (error) { statusLine(status, error.message, true); }
    }
    async function deploy(action) {
      try {
        if (typeof w.runTests === 'function') {
          var tests = w.runTests(true);
          if (!tests || tests.ok !== true) {
            w.openEngineeringConsole && w.openEngineeringConsole('tests');
            throw new Error('Publishing is blocked until the website quality checks pass.');
          }
        }
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
        if (finalState.url) {
          var link = el('a', 'ovyx-pub-hint', 'Open published website: ' + finalState.url);
          link.href = finalState.url;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          status.appendChild(link);
        } else statusLine(status, 'Deployment succeeded. The live URL is available in release history.');
        var active = project();
        if (active) {
          active.ovyxDeployments = Array.isArray(active.ovyxDeployments) ? active.ovyxDeployments : [];
          active.ovyxDeployments.unshift({ at: Date.now(), status: 'published', url: finalState.url || '' });
          active.ovyxDeployments = active.ovyxDeployments.slice(0, 20);
          try { window.ProjectStore?.save?.(); } catch (_) {}
        }
        toast(action === 'publish' ? 'Website published successfully.' : 'Preview deployment is ready.', 'success');
        window.dispatchEvent(new CustomEvent('ovyx:publishing-center-deployed', { detail: { action: action, deployment: finalState } }));
        await refresh();
      } catch (error) {
        statusLine(status, error.message, true);
        toast(error.message, 'error');
      } finally { setBusy(false); }
    }
    preview.addEventListener('click', function () { deploy('deploy'); });
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      var domain = clean(input.value, 253);
      if (!domain) { statusLine(status, 'Enter the domain you want to connect.', true); return; }
      try {
        setBusy(true);
        statusLine(status, 'Registering custom domain with Cloudflare…');
        await apiPost(p, 'add-domain', { domain: domain });
        var active = project();
        if (active) {
          active.ovyxDeploymentDomain = domain;
          try { window.ProjectStore?.save?.(); } catch (_) {}
        }
        if (legacyDomain) legacyDomain.value = domain;
        input.value = '';
        statusLine(status, 'Domain added. Follow the DNS instructions below and wait for validation and HTTPS activation.');
        await refresh();
      } catch (error) { statusLine(status, error.message, true); }
      finally { setBusy(false); }
    });
    refresh();
  }
  function installDeployHook() {
    var w = studio();
    if (!w || typeof w.openDeployPanel !== 'function' || w.openDeployPanel.__ovyxPublishingCenterWrapped) return;
    var original = w.openDeployPanel;
    var wrapped = function () {
      var result = original.apply(this, arguments);
      window.setTimeout(enhanceDeployPanel, 0);
      return result;
    };
    wrapped.__ovyxPublishingCenterWrapped = true;
    w.openDeployPanel = wrapped;
    var modal = document.getElementById('ws-deploy-modal');
    if (modal && modal.classList.contains('open')) window.setTimeout(enhanceDeployPanel, 0);
  }
  function boot() {
    style();
    installDeployHook();
    var observer = new MutationObserver(function () { installDeployHook(); });
    if (document.body) observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'aria-hidden'] });
    window.addEventListener('ovyx:webstudio-ready', installDeployHook);
    window.addEventListener('ovyx:project-loaded', installDeployHook);
    window.setInterval(installDeployHook, 1200);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
