(function () {
  'use strict';
  if (window.__OVYX_WEBSITE_MANAGEMENT_V1__) return;
  window.__OVYX_WEBSITE_MANAGEMENT_V1__ = true;

  var ROOT = 'ovyx-website-management';
  var activeTab = 'websites';
  var busy = false;
  var panel = null;
  var toast = function (message, kind) { try { window.showToast && window.showToast(message, kind || 'info'); } catch (_) {} };
  var clean = function (value, max) { return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max || 300); };
  var studio = function () { return window.WebStudio && typeof window.WebStudio === 'object' ? window.WebStudio : null; };
  var project = function () { return window.KernelState && window.KernelState.activeProject || null; };
  var activeView = function () { return String(window.KernelState && window.KernelState.activeView || '').replace(/^view-/, '').toLowerCase(); };
  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = String(text);
    return node;
  }
  function style() {
    if (document.getElementById(ROOT + '-style')) return;
    var css = document.createElement('style');
    css.id = ROOT + '-style';
    css.textContent = '#' + ROOT + '-launcher{position:fixed;z-index:99980;right:18px;top:50%;bottom:auto;transform:translateY(-50%);border:1px solid rgba(232,182,79,.55);border-radius:999px;background:#090909;color:#f4f4f4;padding:11px 15px;font:700 12px Inter,system-ui,sans-serif;box-shadow:0 8px 32px #0008;cursor:pointer}#' + ROOT + '{position:fixed;z-index:99990;inset:0 0 0 auto;width:min(460px,100vw);height:100dvh;background:#080808;color:#f5f5f5;border-left:1px solid #ffffff1c;box-shadow:-18px 0 60px #0009;font:500 12px/1.5 Inter,system-ui,sans-serif;display:flex;flex-direction:column}#' + ROOT + '[hidden]{display:none}#' + ROOT + ' *{box-sizing:border-box}#' + ROOT + ' .ovym-head{padding:17px 18px;border-bottom:1px solid #ffffff18;display:flex;align-items:center;justify-content:space-between;gap:12px}#' + ROOT + ' .ovym-head strong{font-size:14px}#' + ROOT + ' .ovym-muted{color:#999}#' + ROOT + ' button,#' + ROOT + ' input{font:inherit}#' + ROOT + ' button{border:1px solid #ffffff24;background:#151515;color:#eee;border-radius:8px;padding:8px 10px;cursor:pointer}#' + ROOT + ' button:disabled{opacity:.45;cursor:wait}#' + ROOT + ' .ovym-primary{background:#e8b64f;color:#17120a;border-color:#e8b64f;font-weight:800}#' + ROOT + ' .ovym-tabs{display:flex;gap:5px;overflow:auto;padding:10px 12px;border-bottom:1px solid #ffffff18}#' + ROOT + ' .ovym-tabs button{white-space:nowrap;font-size:11px}#' + ROOT + ' .ovym-tabs button[aria-selected=true]{border-color:#e8b64f;color:#f4d28c}#' + ROOT + ' .ovym-body{padding:16px;overflow:auto;flex:1}#' + ROOT + ' .ovym-card{border:1px solid #ffffff18;border-radius:10px;padding:12px;margin:0 0 10px;background:#ffffff04}#' + ROOT + ' .ovym-row{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}#' + ROOT + ' .ovym-field{display:grid;gap:5px;margin:12px 0}#' + ROOT + ' input,#' + ROOT + ' textarea{width:100%;border:1px solid #ffffff24;background:#111;color:#fff;border-radius:8px;padding:9px}#' + ROOT + ' textarea{min-height:85px;resize:vertical}#' + ROOT + ' .ovym-status{padding:10px 12px;color:#aaa;border-top:1px solid #ffffff18;min-height:40px}#' + ROOT + ' .ovym-image{max-width:100%;max-height:110px;object-fit:contain;display:block;margin:8px 0;border-radius:6px}#' + ROOT + ' .ovym-danger{color:#ffb1a8}';
    document.head.appendChild(css);
  }
  async function token() {
    var user = window.firebase && typeof window.firebase.auth === 'function' && window.firebase.auth().currentUser;
    if (!user || typeof user.getIdToken !== 'function') throw new Error('Sign in to OVYX to manage your websites.');
    return user.getIdToken();
  }
  async function request(url, options) {
    var idToken = await token();
    var init = Object.assign({ credentials: 'same-origin', cache: 'no-store' }, options || {});
    init.headers = Object.assign({ Accept: 'application/json', Authorization: 'Bearer ' + idToken }, options && options.headers || {});
    var response = await fetch(url, init);
    var body = await response.json().catch(function () { return {}; });
    if (!response.ok || body.ok === false || body.success === false) throw new Error(clean(body.error || body.message || 'The request could not be completed.', 320));
    return body;
  }
  function managementRequest(view) {
    var p = project();
    if (!p || !p.id) throw new Error('Open a saved website in Web Studio first.');
    return request('/api/site-management?projectId=' + encodeURIComponent(p.id) + '&view=' + encodeURIComponent(view || 'settings'));
  }
  function post(action, extra) {
    var p = project();
    if (!p || !p.id) throw new Error('Open a saved website in Web Studio first.');
    return request('/api/site-management?projectId=' + encodeURIComponent(p.id), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ projectId: p.id, action: action }, extra || {}))
    });
  }
  function status(message, isError) {
    var node = panel && panel.querySelector('.ovym-status');
    if (node) { node.textContent = message; node.classList.toggle('ovym-danger', !!isError); }
  }
  function button(parent, label, action, primary) {
    var node = element('button', primary ? 'ovym-primary' : '', label);
    node.type = 'button'; node.addEventListener('click', action); parent.appendChild(node); return node;
  }
  function card(parent, title, detail) {
    var box = element('section', 'ovym-card');
    var heading = element('strong', '', title); box.appendChild(heading);
    if (detail) box.appendChild(element('div', 'ovym-muted', detail));
    parent.appendChild(box); return box;
  }
  function setBusy(value) {
    busy = !!value;
    if (panel) panel.querySelectorAll('button,input,textarea').forEach(function (node) { node.disabled = busy; });
  }
  function open() {
    if (!panel) build();
    panel.hidden = false;
    try { document.querySelectorAll('[data-nav="workspace"],[data-mobile-nav="workspace"]').forEach(function (node) { node.classList.add('active'); node.setAttribute('aria-current','page'); }); } catch (_) {}
    render(activeTab);
  }
  function openWorkspace() {
    try { window.MobileDrawer && window.MobileDrawer.close && window.MobileDrawer.close(); } catch (_) {}
    var route = String(window.KernelState && window.KernelState.activeView || '').toLowerCase();
    if (route !== 'webstudio') {
      if (window.Router && typeof window.Router.go === 'function') window.Router.go('webstudio');
      else if (typeof window.switchView === 'function') window.switchView('webstudio');
      window.setTimeout(open, 120);
    } else open();
    return true;
  }
  function close() { if (panel) panel.hidden = true; }
  function build() {
    panel = element('aside');
    panel.id = ROOT; panel.hidden = true; panel.setAttribute('aria-label', 'Website management');
    var head = element('div', 'ovym-head');
    var brand = element('div'); brand.appendChild(element('strong', '', 'Website Management')); brand.appendChild(element('div', 'ovym-muted', 'Manage your saved website'));
    head.appendChild(brand); button(head, 'Close', close); panel.appendChild(head);
    var tabs = element('nav', 'ovym-tabs'); tabs.setAttribute('aria-label', 'Website management sections');
    [['websites','My Websites'],['content','Content'],['media','Media'],['settings','Settings'],['backups','Backups'],['analytics','Analytics'],['publishing','Publishing']].forEach(function (item) {
      var b = button(tabs, item[1], function () { activeTab = item[0]; render(activeTab); });
      b.dataset.tab = item[0]; b.setAttribute('aria-selected', String(item[0] === activeTab));
    });
    panel.appendChild(tabs);
    panel.appendChild(element('div', 'ovym-body'));
    panel.appendChild(element('div', 'ovym-status', 'Ready.'));
    document.body.appendChild(panel);
    document.addEventListener('keydown', function (event) { if (event.key === 'Escape') close(); });
  }
  function body() { return panel.querySelector('.ovym-body'); }
  function renderError(error) { body().replaceChildren(element('div', 'ovym-card ovym-danger', error && error.message || 'Could not load this section.')); status(error && error.message || 'Could not load this section.', true); }
  async function renderWebsites(root) {
    root.appendChild(element('p', 'ovym-muted', 'Your saved websites and apps are listed here. Publishing status is shown only when saved project records contain it.'));
    var data = await request('/api/projects', { method: 'GET' });
    var projects = Array.isArray(data.projects) ? data.projects : [];
    if (!projects.length) { root.appendChild(element('div', 'ovym-card', 'No saved websites yet. Create and save a website in Web Studio first.')); return; }
    var search = element('input'); search.type = 'search'; search.placeholder = 'Search your websites…'; search.setAttribute('aria-label', 'Search your websites'); root.appendChild(search);
    var list = element('div'); root.appendChild(list);
    function draw() {
      list.replaceChildren();
      var filtered = projects.filter(function (p) { return (clean(p.name || p.title || 'Untitled website', 120) + ' ' + clean(p.description, 240)).toLowerCase().includes(search.value.toLowerCase()); });
      filtered.forEach(function (p) {
        var box = card(list, clean(p.name || p.title || 'Untitled website', 120), 'Updated ' + clean(p.updatedAt || 'date unavailable', 40));
        var row = element('div', 'ovym-row'); row.appendChild(element('span', 'ovym-muted', p.publishedUrl ? 'Published' : 'Saved project'));
        button(row, 'Manage this website', function () { try { if (window.ProjectStore && typeof window.ProjectStore.open === 'function') window.ProjectStore.open(p.id); else throw new Error('The project opener is not available.'); activeTab = 'content'; window.setTimeout(function () { open(); render('content'); }, 180); } catch (error) { status(error.message || 'Could not open this website.', true); } });
        box.appendChild(row);
      });
      if (!filtered.length) list.appendChild(element('div', 'ovym-muted', 'No websites match this search.'));
    }
    search.addEventListener('input', draw); draw();
  }
  async function renderContent(root) {
    var w = studio(); if (!w) throw new Error('Open Web Studio to manage website content.');
    if (typeof w.ensureProjectGraph === 'function') w.ensureProjectGraph();
    var files = w.graph && w.graph.files || {};
    var paths = Object.keys(files).filter(function (path) { return typeof path === 'string' && !path.endsWith('/') && /\.(?:html?|md|json)$/i.test(path); }).sort();
    root.appendChild(element('p', 'ovym-muted', 'These are the pages and content files in your saved website. Open the visual editor or Code Editor to change these files; both use the same website project files.'));
    if (!paths.length) { root.appendChild(element('div', 'ovym-card', 'No editable content files were found in the current project.')); return; }
    paths.forEach(function (path) {
      var record = files[path]; var content = typeof record === 'string' ? record : record && record.content || '';
      var box = card(root, path, clean(content.slice(0, 4000).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' '), 180) || 'Content file');
      if (typeof w.openFile === 'function') button(box, 'Edit this file', function () { w.openFile(path); });
      else box.appendChild(element('div', 'ovym-muted', 'Open this file from the existing Code workspace to edit it.'));
    });
  }
  async function renderMedia(root) {
    var p = project(), store = window.OVYXAssetStore;
    if (!p || !p.id || !store || typeof store.list !== 'function') throw new Error('Project media storage is not available in this session.');
    var upload = element('input'); upload.type = 'file'; upload.accept = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml'; upload.multiple = true; upload.setAttribute('aria-label', 'Upload images'); root.appendChild(upload);
    var add = button(root, 'Upload selected images', async function () {
      if (!upload.files || !upload.files.length) { status('Choose one or more images first.', true); return; }
      try {
        setBusy(true);
        if (upload.files.length > 20) throw new Error('Upload up to 20 images at a time.');
        for (var i = 0; i < upload.files.length; i += 1) {
          var file = upload.files[i];
          if (!/^image\/(?:png|jpeg|webp|gif|svg\+xml)$/i.test(file.type || '') || file.size > 15 * 1024 * 1024) throw new Error(file.name + ' is not a supported image under 15 MB.');
          if (typeof store.upload !== 'function') throw new Error('Image upload is not available in this session.');
          await store.upload(file, p.id, {});
        }
        status('Images uploaded to this website.'); await render('media');
      } catch (error) { status(error.message, true); }
      finally { setBusy(false); }
    }, true);
    var assets = await store.list(p.id);
    var images = (Array.isArray(assets) ? assets : []).filter(function (asset) { return /^image\//i.test(String(asset.contentType || asset.type || '')); });
    root.appendChild(element('p', 'ovym-muted', images.length + ' stored image(s). Uploads use the existing project media storage.'));
    images.forEach(function (asset) {
      var box = card(root, clean(asset.name || 'Image', 120), clean(asset.contentType || asset.type || 'Image', 80));
      if (typeof store.url === 'function') {
        var img = element('img', 'ovym-image'); img.alt = clean(asset.name || 'Project image', 120);
        Promise.resolve(store.url(asset)).then(function (url) { if (url) img.src = url; }).catch(function () {});
        box.appendChild(img);
        button(box, 'Copy image link', async function () {
          var url = await store.url(asset);
          if (!url) throw new Error('No image link is available.');
          await navigator.clipboard.writeText(url); status('Image link copied.');
        });
      }
    });
    if (!images.length) root.appendChild(element('div', 'ovym-muted', 'No images uploaded yet.'));
  }
  async function renderSettings(root) {
    var data = await managementRequest('settings'); var settings = data.settings || {};
    var title = element('input'); title.value = clean(settings.title || '', 120); title.maxLength = 120;
    var description = element('textarea'); description.value = clean(settings.description || '', 320); description.maxLength = 320;
    var language = element('input'); language.value = clean(settings.language || 'en', 12); language.maxLength = 12;
    var navigation = element('textarea'); navigation.value = (Array.isArray(settings.navigation) ? settings.navigation : []).map(function (item) { return clean(item.label, 60) + ' | ' + clean(item.path, 180); }).join('\n');
    navigation.placeholder = 'Home | /\nAbout | /about.html';
    [['SEO title', title],['SEO description', description],['Language code', language],['Navigation links (one label | path per line)', navigation]].forEach(function (item) {
      var wrap = element('label', 'ovym-field'); wrap.appendChild(element('span', '', item[0])); wrap.appendChild(item[1]); root.appendChild(wrap);
    });
    root.appendChild(element('p', 'ovym-muted', 'Saving settings first creates an automatic safety backup. These settings are stored with the project; they do not claim to rewrite the published HTML until applied by the site editor.'));
    button(root, 'Save website settings', async function () {
      try {
        setBusy(true);
        var links = navigation.value.split(/\r?\n/).map(function (line) { var parts = line.split('|'); return { label: clean(parts.shift(), 60), path: clean(parts.join('|'), 180) }; }).filter(function (item) { return item.label && item.path; });
        await post('settings', { settings: { title: title.value, description: description.value, language: language.value, navigation: links } });
        status('Settings saved. An automatic backup was created first.');
      } catch (error) { status(error.message, true); }
      finally { setBusy(false); }
    }, true);
  }
  async function renderBackups(root) {
    button(root, 'Create backup now', async function () {
      try { setBusy(true); var result = await post('backup', { label: 'Manual backup' }); status('Backup created: ' + result.backup.id); await render('backups'); }
      catch (error) { status(error.message, true); } finally { setBusy(false); }
    }, true);
    var data = await managementRequest('backups'); var backups = data.backups || [];
    root.appendChild(element('p', 'ovym-muted', 'A restore first creates another backup of the current website. The newest 20 backups are kept.'));
    if (!backups.length) root.appendChild(element('div', 'ovym-muted', 'No backups yet.'));
    backups.forEach(function (backup) {
      var box = card(root, backup.label, new Date(backup.createdAt).toLocaleString() + ' · ' + Math.round((backup.bytes || 0) / 1024) + ' KB');
      button(box, 'Restore this backup', async function () {
        if (!window.confirm('Restore this earlier website version? OVYX will first save a backup of the current version.')) return;
        try { setBusy(true); await post('restore', { backupId: backup.id }); status('Backup restored. Reopen or refresh the project to load the restored files.'); }
        catch (error) { status(error.message, true); } finally { setBusy(false); }
      });
    });
  }
  async function renderAnalytics(root) {
    var data = await managementRequest('analytics');
    root.appendChild(element('div', 'ovym-card', data.message || 'Verified visitor analytics are not available yet.'));
    root.appendChild(element('p', 'ovym-muted', 'OVYX will show visits only after a real, privacy-aware measurement source is connected. No estimated or invented traffic is displayed.'));
  }
  async function renderPublishing(root) {
    root.appendChild(element('p', 'ovym-muted', 'Use the existing Publishing Centre for previews, production releases, domains and safe rollback.'));
    button(root, 'Open Publishing Centre', function () {
      var w = studio();
      if (w && typeof w.openDeployPanel === 'function') w.openDeployPanel();
      else status('Open Web Studio to access Publishing Centre.', true);
    }, true);
  }
  async function render(tab) {
    if (!panel) return;
    activeTab = tab || activeTab;
    panel.querySelectorAll('[data-tab]').forEach(function (node) { node.setAttribute('aria-selected', String(node.dataset.tab === activeTab)); });
    var root = body(); root.replaceChildren(); status('Loading ' + activeTab + '…');
    try {
      if (activeTab === 'websites') await renderWebsites(root);
      else if (activeTab === 'content') await renderContent(root);
      else if (activeTab === 'media') await renderMedia(root);
      else if (activeTab === 'settings') await renderSettings(root);
      else if (activeTab === 'backups') await renderBackups(root);
      else if (activeTab === 'analytics') await renderAnalytics(root);
      else if (activeTab === 'publishing') await renderPublishing(root);
      status('Ready.');
    } catch (error) { renderError(error); }
  }
  function install() {
    style();
    return true;
  }
  function boot() {
    style();
    install();
    window.addEventListener('ovyx:webstudio-ready', install);
    window.addEventListener('ovyx:project-loaded', install);
    window.addEventListener('ovyx:project-activated', install);
    window.addEventListener('ovyx:view-changed', function () { window.setTimeout(install, 60); });
    var attempts = 0;
    var retry = window.setInterval(function () { if (install() || ++attempts >= 90) window.clearInterval(retry); }, 1000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
  window.OVYXWebsiteManagement = { open: open, openWorkspace: openWorkspace, close: close, refresh: function () { return render(activeTab); } };
})();