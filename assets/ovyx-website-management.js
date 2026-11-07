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
    css.textContent = '#' + ROOT + '-launcher{position:fixed;z-index:99980;right:18px;top:50%;bottom:auto;transform:translateY(-50%);border:1px solid rgba(232,182,79,.55);border-radius:999px;background:#090909;color:#f4f4f4;padding:11px 15px;font:700 12px Inter,system-ui,sans-serif;box-shadow:0 8px 32px #0008;cursor:pointer}#' + ROOT + '{position:fixed;z-index:99990;inset:0 0 0 auto;width:100vw;height:100dvh;background:#080808;color:#f5f5f5;border:0;box-shadow:none;font:500 13px/1.55 Inter,system-ui,sans-serif;display:flex;flex-direction:column}#' + ROOT + '[hidden]{display:none}#' + ROOT + ' *{box-sizing:border-box}#' + ROOT + ' .ovym-head{padding:17px 18px;border-bottom:1px solid #ffffff18;display:flex;align-items:center;justify-content:space-between;gap:12px}#' + ROOT + ' .ovym-head strong{font-size:14px}#' + ROOT + ' .ovym-muted{color:#999}#' + ROOT + ' button,#' + ROOT + ' input{font:inherit}#' + ROOT + ' button{border:1px solid #ffffff24;background:#151515;color:#eee;border-radius:8px;padding:8px 10px;cursor:pointer}#' + ROOT + ' button:disabled{opacity:.45;cursor:wait}#' + ROOT + ' .ovym-primary{background:#e8b64f;color:#17120a;border-color:#e8b64f;font-weight:800}#' + ROOT + ' .ovym-tabs{display:flex;flex-wrap:wrap;gap:7px;overflow:visible;padding:12px 16px;border-bottom:1px solid #ffffff18}#' + ROOT + ' .ovym-tabs button{white-space:normal;flex:1 1 125px;min-height:40px;font-size:12px}#' + ROOT + ' .ovym-tabs button[aria-selected=true]{border-color:#e8b64f;color:#f4d28c}#' + ROOT + ' .ovym-body{padding:clamp(16px,3vw,32px);overflow:auto;flex:1;min-height:0;display:flex;flex-direction:column;gap:12px}#' + ROOT + ' .ovym-auth-state{margin:auto;width:min(560px,100%);padding:clamp(22px,4vw,36px);text-align:center;border:1px solid #ffffff1c;border-radius:14px;background:linear-gradient(145deg,#ffffff08,#ffffff02)}#' + ROOT + ' .ovym-auth-state strong{display:block;font-size:16px;margin-bottom:8px}#' + ROOT + ' .ovym-auth-state p{margin:0;color:#aaa}#' + ROOT + ' .ovym-card{border:1px solid #ffffff18;border-radius:10px;padding:12px;margin:0 0 10px;background:#ffffff04}#' + ROOT + ' .ovym-row{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}#' + ROOT + ' .ovym-field{display:grid;gap:5px;margin:12px 0}#' + ROOT + ' input,#' + ROOT + ' textarea{width:100%;border:1px solid #ffffff24;background:#111;color:#fff;border-radius:8px;padding:9px}#' + ROOT + ' textarea{min-height:85px;resize:vertical}#' + ROOT + ' .ovym-status{padding:10px 12px;color:#aaa;border-top:1px solid #ffffff18;min-height:40px}#' + ROOT + ' .ovym-image{max-width:100%;max-height:110px;object-fit:contain;display:block;margin:8px 0;border-radius:6px}#' + ROOT + ' .ovym-danger{color:#ffb1a8}#' + ROOT + ' .ovym-download-grid{display:grid;grid-template-columns:1fr;gap:10px}#' + ROOT + ' .ovym-download-card{border:1px solid #ffffff1c;border-radius:12px;padding:14px;background:linear-gradient(145deg,#ffffff08,#ffffff02)}#' + ROOT + ' .ovym-download-top{display:flex;align-items:center;gap:10px}#' + ROOT + ' .ovym-download-icon{width:36px;height:36px;display:grid;place-items:center;border-radius:9px;background:#e8b64f18;color:#f0c66f;font-size:15px}#' + ROOT + ' .ovym-download-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap}#' + ROOT + ' .ovym-download-tag{font-size:9px;letter-spacing:.08em;color:#d9b96d;border:1px solid #d9b96d55;border-radius:20px;padding:2px 6px}#' + ROOT + ' .ovym-download-info{font-size:10px;color:#b8b8b8;padding:8px 0;min-height:30px}#' + ROOT + ' .ovym-download-action{width:100%;margin-top:4px}#' + ROOT + ' .ovym-download-note{border:1px solid #d9b96d35;border-radius:10px;padding:12px;margin-top:4px;background:#e8b64f08}#' + ROOT + ' .ovym-download-note p{margin:6px 0 0}';
    css.textContent += '.ovym-dashboard-bottom-nav-hidden{display:none!important}';
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
    if (node) { node.hidden = false; node.textContent = message; node.classList.toggle('ovym-danger', !!isError); }
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
  function findDashboardBottomNav() {
    var labels = ['home', 'build', 'new', 'code', 'more'];
    var nodes = document.querySelectorAll('body *');
    var best = null;
    nodes.forEach(function (candidate) {
      if (!candidate || candidate.id === ROOT || (candidate.closest && candidate.closest('#' + ROOT))) return;
      var rect = candidate.getBoundingClientRect ? candidate.getBoundingClientRect() : null;
      if (!rect || rect.height < 36 || rect.height > 180 || rect.width < Math.min(260, window.innerWidth * 0.55)) return;
      if (rect.bottom < window.innerHeight - 8 || rect.top > window.innerHeight - 1) return;
      var text = String(candidate.innerText || candidate.textContent || '').toLowerCase().replace(/\s+/g, ' ');
      if (!labels.every(function (label) { return new RegExp('(^|\\\\s)' + label + '($|\\\\s)').test(text); })) return;
      var node = candidate, depth = 0, fixed = null;
      while (node && node !== document.body && depth < 10) {
        var computed = window.getComputedStyle ? window.getComputedStyle(node) : null;
        if (computed && computed.position === 'fixed') { var fixedRect = node.getBoundingClientRect(); if (fixedRect.height <= 180 && fixedRect.width >= Math.min(260, window.innerWidth * 0.55)) fixed = node; break; }
        node = node.parentElement; depth += 1;
      }
      var target = fixed || candidate;
      if (!best || target.getBoundingClientRect().height < best.getBoundingClientRect().height) best = target;
    });
    return best;
  }
  function setDashboardBottomNavHidden(hidden) {
    var hiddenClass = 'ovym-dashboard-bottom-nav-hidden';
    if (hidden) {
      var target = findDashboardBottomNav();
      if (target && !target.classList.contains(hiddenClass)) target.classList.add(hiddenClass);
    } else {
      document.querySelectorAll('.' + hiddenClass).forEach(function (node) { node.classList.remove(hiddenClass); });
    }
  }
  function watchDashboardBottomNav() {
    if (window.__OVYX_MANAGE_WEBSITE_NAV_OBSERVER__) return;
    if (!window.MutationObserver || !document.body) return;
    window.__OVYX_MANAGE_WEBSITE_NAV_OBSERVER__ = new MutationObserver(function () {
      if (panel && !panel.hidden) setDashboardBottomNavHidden(true);
    });
    window.__OVYX_MANAGE_WEBSITE_NAV_OBSERVER__.observe(document.body, { childList: true, subtree: true });
  }
  function open() {
    if (!panel) build();
    panel.hidden = false;
    setDashboardBottomNavHidden(true);
    watchDashboardBottomNav();
    try {
      document.querySelectorAll('[data-nav],[data-mobile-nav]').forEach(function (node) {
        var selected = node.getAttribute('data-nav') === 'workspace' || node.getAttribute('data-mobile-nav') === 'workspace';
        node.classList.toggle('active', selected);
        if (node.hasAttribute('data-nav')) { node.classList.toggle('text-white', selected); node.classList.toggle('bg-white/[0.08]', selected); }
        if (selected) node.setAttribute('aria-current', 'page'); else node.removeAttribute('aria-current');
      });
    } catch (_) {}
    render(activeTab);
  }
  function openWorkspace() {
    try { window.MobileDrawer && window.MobileDrawer.close && window.MobileDrawer.close(); } catch (_) {}
    open();
    return true;
  }
  function close() {
    if (panel) panel.hidden = true;
    setDashboardBottomNavHidden(false);
    try {
      var route = activeView();
      document.querySelectorAll('[data-nav],[data-mobile-nav]').forEach(function (node) {
        var key = node.getAttribute('data-nav') || node.getAttribute('data-mobile-nav');
        var selected = key === route;
        node.classList.toggle('active', selected);
        if (node.hasAttribute('data-nav')) { node.classList.toggle('text-white', selected); node.classList.toggle('bg-white/[0.08]', selected); }
        if (selected) node.setAttribute('aria-current', 'page'); else node.removeAttribute('aria-current');
      });
    } catch (_) {}
  }
  function build() {
    panel = element('aside');
    panel.id = ROOT; panel.hidden = true; panel.setAttribute('aria-label', 'Website management');
    var head = element('div', 'ovym-head');
    var brand = element('div'); brand.appendChild(element('strong', '', 'Website Management')); brand.appendChild(element('div', 'ovym-muted', 'Manage your saved website'));
    head.appendChild(brand); button(head, 'Close', close); panel.appendChild(head);
    var tabs = element('nav', 'ovym-tabs'); tabs.setAttribute('aria-label', 'Website management sections');
    [['websites','My Websites'],['content','Pages & Content'],['media','Media Library'],['downloads','Downloads'],['settings','Website Settings'],['backups','Backups'],['analytics','Analytics'],['publishing','Publishing']].forEach(function (item) {
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
  function renderError(error) { var message = clean(error && error.message || 'Could not load this section.', 320); var state = element('section', 'ovym-auth-state'); var heading = message.toLowerCase().indexOf('sign in to ovyx') === 0 ? 'Sign in required' : 'Unable to load this section'; state.appendChild(element('strong', '', heading)); state.appendChild(element('p', 'ovym-danger', message)); body().replaceChildren(state); var footer = panel && panel.querySelector('.ovym-status'); if (footer) { footer.hidden = true; footer.textContent = ''; footer.classList.remove('ovym-danger'); } }
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
        button(row, 'Manage this website', function () { try { if (window.ProjectStore && typeof window.ProjectStore.open === 'function') window.ProjectStore.open(p.id); else throw new Error('The project opener is not available.'); if (!window.KernelState || !window.KernelState.activeProject || String(window.KernelState.activeProject.id) !== String(p.id)) throw new Error('That saved website could not be opened in the current project workspace.'); activeTab = 'content'; window.setTimeout(function () { open(); }, 180); } catch (error) { status(error.message || 'Could not open this website.', true); } });
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
    button(root, 'Open Code Editor', function () { var target = w.activeCodeFile || (typeof w.entryFile === 'function' ? w.entryFile() : ''); if (!target || typeof w.openCodeEditor !== 'function') { status('The Code Editor is not ready. Open Web Studio and try again.', true); return; } close(); w.openCodeEditor(target); }, true);
    if (!paths.length) { root.appendChild(element('div', 'ovym-card', 'No editable content files were found in the current project.')); return; }
    paths.forEach(function (path) {
      var record = files[path]; var content = typeof record === 'string' ? record : record && record.content || '';
      var box = card(root, path, clean(content.slice(0, 4000).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' '), 180) || 'Content file');
      if (typeof w.openCodeEditor === 'function') button(box, 'Edit in Code Editor', function () { close(); w.openCodeEditor(path); });
      else box.appendChild(element('div', 'ovym-muted', 'The Code Editor is not available in this session.'));
    });
  }
  async function renderMedia(root) {
    var p = project(), store = window.OVYXAssetStore;
    if (!p || !p.id || !store || typeof store.list !== 'function') throw new Error('Project media storage is not available in this session.');
    var upload = element('input'); upload.type = 'file'; upload.accept = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml'; upload.multiple = true; upload.setAttribute('aria-label', 'Upload images'); root.appendChild(upload);
    button(root, 'Upload selected images', async function () {
      if (!upload.files || !upload.files.length) { status('Choose one or more images first.', true); return; }
      try {
        setBusy(true);
        if (upload.files.length > 20) throw new Error('Upload up to 20 images at a time.');
        for (var i = 0; i < upload.files.length; i += 1) {
          var file = upload.files[i];
          if (!/^image\/(?:png|jpeg|webp|gif|svg\+xml)$/i.test(file.type || '') || file.size > 15 * 1024 * 1024) throw new Error(file.name + ' is not a supported image under 15 MB.');
          if (typeof store.upload !== 'function') throw new Error('Image upload is not available in this session.');
          status('Uploading image ' + (i + 1) + ' of ' + upload.files.length + '…');
          await store.upload(file, p.id, {});
        }
        status('Images uploaded to this website.'); await render('media');
      } catch (error) { status(error.message, true); }
      finally { setBusy(false); }
    }, true);
    var assets = await store.list(p.id);
    var images = (Array.isArray(assets) ? assets : []).filter(function (asset) { return /^image\//i.test(String(asset.contentType || asset.type || '')); });
    var search = element('input'); search.type = 'search'; search.placeholder = 'Search images by filename or type…'; search.setAttribute('aria-label', 'Search website images'); root.appendChild(search);
    var summary = element('p', 'ovym-muted', ''); root.appendChild(summary);
    var list = element('div'); root.appendChild(list);
    function drawImages() {
      list.replaceChildren();
      var query = search.value.trim().toLowerCase();
      var filtered = images.filter(function (asset) {
        return (clean(asset.name || 'Image', 180) + ' ' + clean(asset.contentType || asset.type || 'Image', 100)).toLowerCase().includes(query);
      });
      var totalBytes = images.reduce(function (sum, asset) { return sum + Math.max(0, Number(asset.size) || 0); }, 0);
      summary.textContent = images.length + ' stored image(s) · ' + (totalBytes < 1024 * 1024 ? Math.round(totalBytes / 1024) + ' KB' : (totalBytes / (1024 * 1024)).toFixed(1) + ' MB') + (filtered.length !== images.length ? ' · ' + filtered.length + ' matching' : '');
      filtered.forEach(function (asset) {
        var box = card(list, clean(asset.name || 'Image', 120), clean(asset.contentType || asset.type || 'Image', 80) + (Number(asset.size) > 0 ? ' · ' + (Number(asset.size) / 1024).toFixed(1) + ' KB' : ''));
        if (typeof store.url === 'function') {
          var img = element('img', 'ovym-image'); img.alt = clean(asset.name || 'Project image', 120);
          Promise.resolve(store.url(asset)).then(function (url) { if (url && img.isConnected) img.src = url; }).catch(function () {});
          box.appendChild(img);
          button(box, 'Copy image link', async function () {
            var url = await store.url(asset);
            if (!url) throw new Error('No image link is available.');
            if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') await navigator.clipboard.writeText(url);
            else throw new Error('Clipboard access is unavailable. Open the image and copy its address instead.');
            status('Image link copied.');
          });
        }
        button(box, 'Delete image', async function () {
          if (!asset || !/^asset_[A-Za-z0-9_-]{8,120}$/.test(String(asset.id || '')) || !asset.storagePath) {
            status('This image is missing its verified storage reference and cannot be safely deleted.', true);
            return;
          }
          if (!window.confirm('Permanently delete "' + clean(asset.name || 'this image', 120) + '" from this website? This cannot be undone.')) return;
          try {
            setBusy(true);
            var firebase = window.firebase;
            var storage = firebase && typeof firebase.storage === 'function' ? firebase.storage() : null;
            if (!storage || typeof storage.ref !== 'function') throw new Error('Secure project storage is unavailable. The image was not deleted.');
            try {
              await storage.ref(String(asset.storagePath)).delete();
            } catch (storageError) {
              // A previous attempt may have removed the object before its metadata request failed.
              if (String(storageError && storageError.code || '') !== 'storage/object-not-found') throw storageError;
            }
            await request('/api/assets?projectId=' + encodeURIComponent(p.id), {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ projectId: p.id, assetId: asset.id })
            });
            status('Image deleted from website storage.');
            await render('media');
          } catch (error) { status(clean(error && error.message || 'Image deletion failed.', 300), true); }
          finally { setBusy(false); }
        });
      });
      if (!filtered.length) list.appendChild(element('div', 'ovym-muted', images.length ? 'No images match this search.' : 'No images uploaded yet.'));
    }
    search.addEventListener('input', drawImages);
    drawImages();
  }
  async function renderDownloads(root) {
    var current = project();
    if (!current || !current.id) throw new Error('Open a saved website in Web Studio before downloading its files.');
    var exporter = window.OVYXWebStudioProjectExport;
    if (!exporter || typeof exporter.export !== 'function' || typeof exporter.inspect !== 'function') {
      throw new Error('The secure project export engine is still loading. Refresh Web Studio and try again.');
    }
    root.appendChild(element('p', 'ovym-muted', 'Download the source files for the currently open website. Each ZIP is prepared from the same saved project graph and uses OVYX’s existing export and safety checks.'));
    var grid = element('div', 'ovym-download-grid');
    root.appendChild(grid);
    var options = [
      { mode: 'complete', title: 'Complete project', tag: 'RECOMMENDED', description: 'Frontend + backend together, including shared project files, configuration, setup instructions and retrievable media assets.', action: 'Download complete ZIP', icon: 'fa-box-archive' },
      { mode: 'website-only', title: 'Frontend only', tag: 'WEBSITE', description: 'Website pages, browser scripts, styles and retrievable media. Recognized backend implementation files are excluded.', action: 'Download frontend ZIP', icon: 'fa-window-maximize' },
      { mode: 'backend-only', title: 'Backend only', tag: 'SERVER', description: 'Recognized API/server code, database schemas, migrations and related setup files. Frontend pages and styles are excluded.', action: 'Download backend ZIP', icon: 'fa-database' }
    ];
    options.forEach(function (option) {
      var box = element('section', 'ovym-download-card');
      var top = element('div', 'ovym-download-top');
      var icon = element('span', 'ovym-download-icon'); icon.setAttribute('aria-hidden', 'true');
      var glyph = element('i'); glyph.className = 'fa-solid ' + option.icon; icon.appendChild(glyph);
      top.appendChild(icon);
      var meta = element('div', 'ovym-download-meta');
      meta.appendChild(element('strong', '', option.title));
      meta.appendChild(element('span', 'ovym-download-tag', option.tag));
      top.appendChild(meta); box.appendChild(top);
      box.appendChild(element('p', 'ovym-muted', option.description));
      var info = element('div', 'ovym-download-info', 'Checking project files…');
      info.setAttribute('aria-live', 'polite'); box.appendChild(info);
      var action = button(box, option.action, async function () {
        var active = project();
        if (!active || String(active.id) !== String(current.id)) {
          status('The active website changed. Reopen Downloads for the website you want to export.', true);
          return;
        }
        if (action.disabled) return;
        action.disabled = true;
        action.textContent = 'Preparing ZIP…';
        status('Preparing ' + option.title.toLowerCase() + ' for download. Keep this tab open.');
        try {
          var result = await exporter.export({ mode: option.mode });
          if (!result || !result.ok) throw new Error(result && result.error || (result && result.busy ? 'Another ZIP export is already running. Please wait and try again.' : 'The ZIP export did not complete.'));
          status(result.fileCount + ' file(s) packaged. Check your browser downloads and the OVYX export notification.' + (result.excludedCount ? ' ' + result.excludedCount + ' file(s) were excluded; review the ZIP manifest.' : ''));
        } catch (error) {
          status(clean(error && error.message || 'The ZIP could not be prepared.', 300), true);
        } finally {
          action.disabled = false;
          action.textContent = option.action;
        }
      }, option.mode === 'complete');
      action.classList.add('ovym-download-action');
      grid.appendChild(box);
      try {
        var report = exporter.inspect({ mode: option.mode });
        if (!report || !report.ok) {
          info.textContent = report && report.error || 'This export is not available for the current project.';
          info.classList.add('ovym-danger');
          action.disabled = true;
        } else {
          info.textContent = report.fileCount + ' source file(s) detected · ' + clean(report.framework || 'Framework not identified', 80) + (report.excludedCount ? ' · ' + report.excludedCount + ' file(s) may be excluded by safety rules' : '');
        }
      } catch (error) {
        info.textContent = clean(error && error.message || 'Could not inspect this export.', 240);
        info.classList.add('ovym-danger');
        action.disabled = true;
      }
    });
    var note = element('div', 'ovym-download-note');
    note.appendChild(element('strong', '', 'A quick safety note'));
    note.appendChild(element('p', 'ovym-muted', 'OVYX never puts private API keys, Firebase credentials or Cloudflare secrets into a download. ZIPs include setup notes and manifests describing detected files and exclusions. Some external services still need their own credentials and deployment setup after extraction.'));
    root.appendChild(note);
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
      else if (activeTab === 'downloads') await renderDownloads(root);
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