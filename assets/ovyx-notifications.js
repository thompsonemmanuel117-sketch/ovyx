(function () {
  'use strict';
  if (window.__OVYX_USER_NOTIFICATIONS_V1__) return;
  window.__OVYX_USER_NOTIFICATIONS_V1__ = true;
  var ROOT = 'ovyx-notification-root';
  var authRef = null, timer = null, userUid = '', open = false, busy = false;
  var cache = { items: [], unread: 0, push: { configured: false, publicKey: '', subscribed: false } };
  var css = [
    '#ovyx-notification-root{position:fixed;top:max(78px,calc(env(safe-area-inset-top) + 62px));right:max(15px,env(safe-area-inset-right));z-index:2147483000;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#f8fafc}',
    '#ovyx-notification-toggle{position:relative;display:grid;place-items:center;width:48px;height:48px;border:1px solid rgba(232,182,79,.45);border-radius:16px;background:rgba(12,14,18,.96);color:#f6d58b;box-shadow:0 10px 28px rgba(0,0,0,.26);backdrop-filter:blur(14px);cursor:pointer;transition:transform .18s ease,border-color .18s ease}',
    '#ovyx-notification-toggle:hover{transform:translateY(-1px);border-color:#e8b64f}#ovyx-notification-toggle:focus-visible,#ovyx-notification-root button:focus-visible{outline:2px solid #e8b64f;outline-offset:3px}',
    '#ovyx-notification-count{position:absolute;top:-7px;right:-7px;min-width:20px;height:20px;padding:0 5px;display:grid;place-items:center;border:2px solid #0c0e12;border-radius:999px;background:#ef626f;color:#fff;font:800 10px/1 Inter,system-ui,sans-serif}',
    '#ovyx-notification-panel{position:absolute;top:58px;right:0;width:min(390px,calc(100vw - 24px));max-height:min(70vh,640px);overflow:auto;border:1px solid rgba(232,182,79,.27);border-radius:18px;background:rgba(13,16,22,.985);box-shadow:0 24px 70px rgba(0,0,0,.42);backdrop-filter:blur(20px)}',
    '.ovyx-notification-head{position:sticky;top:0;z-index:1;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:15px 16px;border-bottom:1px solid rgba(255,255,255,.08);background:rgba(13,16,22,.985)}.ovyx-notification-heading{font-size:14px;font-weight:850;color:#fff}.ovyx-notification-subheading{margin-top:3px;color:#9ca3af;font-size:11px}',
    '.ovyx-notification-head button,.ovyx-notification-device button{border:1px solid rgba(232,182,79,.3);border-radius:9px;padding:7px 9px;background:rgba(232,182,79,.08);color:#f8d887;font-size:11px;font-weight:750;cursor:pointer}.ovyx-notification-head button:disabled,.ovyx-notification-device button:disabled{opacity:.5;cursor:not-allowed}',
    '.ovyx-notification-list{display:grid;gap:1px;padding:7px}.ovyx-notification-empty{padding:28px 16px;color:#a1a1aa;text-align:center;font-size:12px;line-height:1.6}',
    '.ovyx-notification-item{position:relative;display:block;width:100%;padding:12px;text-align:left;border:1px solid transparent;border-radius:12px;background:transparent;color:#e5e7eb;cursor:pointer}.ovyx-notification-item:hover{background:rgba(255,255,255,.045);border-color:rgba(255,255,255,.07)}.ovyx-notification-item.is-unread{background:rgba(232,182,79,.07);border-color:rgba(232,182,79,.13)}.ovyx-notification-title-row{display:flex;gap:8px;align-items:flex-start}.ovyx-notification-item-title{flex:1;font-size:12px;font-weight:800;line-height:1.4;color:#fff}.ovyx-notification-new{flex:0 0 auto;padding:3px 5px;border-radius:5px;background:rgba(232,182,79,.14);color:#f2d18a;font-size:8px;font-weight:900;letter-spacing:.08em}.ovyx-notification-item-body{margin-top:6px;white-space:pre-wrap;overflow-wrap:anywhere;color:#aeb5c0;font-size:11px;line-height:1.55}.ovyx-notification-meta{display:flex;gap:8px;justify-content:space-between;margin-top:7px;color:#828b98;font-size:9px}.ovyx-notification-category{text-transform:uppercase;letter-spacing:.1em;font-weight:800}',
    '.ovyx-notification-device{padding:12px 14px;border-top:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.018)}.ovyx-notification-device-row{display:flex;align-items:center;justify-content:space-between;gap:10px}.ovyx-notification-device-title{color:#f3d38b;font-size:11px;font-weight:800}.ovyx-notification-device-detail{margin-top:5px;color:#929ba8;font-size:10px;line-height:1.5}.ovyx-notification-status{min-height:14px;margin-top:7px;color:#a5b4c5;font-size:10px;line-height:1.4}.ovyx-notification-status[data-kind="error"]{color:#fca5a5}.ovyx-notification-status[data-kind="success"]{color:#86efac}',
    '@media(max-width:480px){#ovyx-notification-root{top:max(70px,calc(env(safe-area-inset-top) + 58px));right:10px}#ovyx-notification-toggle{width:44px;height:44px;border-radius:14px}#ovyx-notification-panel{top:53px;width:calc(100vw - 20px);max-height:72vh}}@media(prefers-reduced-motion:reduce){#ovyx-notification-toggle{transition:none}}'
  ].join('');
  function byId(id) { return document.getElementById(id); }
  function clean(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max || 300); }
  function currentUser() { try { return window.firebase && window.firebase.auth && window.firebase.auth().currentUser || null; } catch (_) { return null; } }
  function safeHref(raw) { try { var url = new URL(String(raw || '/'), window.location.origin); if (!/^https?:$/.test(url.protocol) || url.username || url.password) return window.location.origin + '/'; return url.href; } catch (_) { return window.location.origin + '/'; } }
  async function api(path, options) {
    var user = currentUser(); if (!user || typeof user.getIdToken !== 'function') throw new Error('Sign in to view OVYX notifications.');
    var token = await user.getIdToken(false), opts = options || {}, headers = { Accept: 'application/json', Authorization: 'Bearer ' + token };
    if (opts.body) headers['Content-Type'] = 'application/json';
    var response = await fetch(path, { method: opts.method || 'GET', headers: headers, body: opts.body || undefined, cache: 'no-store' });
    var data = await response.json().catch(function () { return {}; });
    if (!response.ok || data.ok === false) throw new Error(clean(data.message || data.error || 'The notification request failed.', 260));
    return data;
  }
  function addStyles() { if (byId('ovyx-notification-style')) return; var style = document.createElement('style'); style.id = 'ovyx-notification-style'; style.textContent = css; document.head.appendChild(style); }
  function status(message, kind) { var el = byId('ovyx-notification-status'); if (el) { el.textContent = clean(message, 360); el.dataset.kind = kind || 'info'; } }
  function render() {
    var root = byId(ROOT); if (!root) return;
    var toggle = byId('ovyx-notification-toggle'), count = byId('ovyx-notification-count'), panel = byId('ovyx-notification-panel');
    count.textContent = cache.unread > 99 ? '99+' : String(cache.unread); count.hidden = cache.unread < 1;
    toggle.setAttribute('aria-label', cache.unread ? 'Notifications, ' + cache.unread + ' unread' : 'Notifications, no unread messages');
    toggle.setAttribute('aria-expanded', String(open)); panel.hidden = !open;
    var list = byId('ovyx-notification-list'); list.replaceChildren();
    if (!cache.items.length) { var empty = document.createElement('div'); empty.className = 'ovyx-notification-empty'; empty.textContent = 'You are all caught up. New OVYX announcements will appear here.'; list.appendChild(empty); }
    cache.items.slice(0, 50).forEach(function (item) {
      var button = document.createElement('button'); button.type = 'button'; button.className = 'ovyx-notification-item' + (item.unread ? ' is-unread' : '');
      button.dataset.notificationId = clean(item.id, 160);
      var row = document.createElement('div'); row.className = 'ovyx-notification-title-row';
      var title = document.createElement('span'); title.className = 'ovyx-notification-item-title'; title.textContent = clean(item.title || 'OVYX Update', 120); row.appendChild(title);
      if (item.unread) { var fresh = document.createElement('span'); fresh.className = 'ovyx-notification-new'; fresh.textContent = 'NEW'; row.appendChild(fresh); }
      var body = document.createElement('div'); body.className = 'ovyx-notification-item-body'; body.textContent = clean(item.body, 1200);
      var meta = document.createElement('div'); meta.className = 'ovyx-notification-meta';
      var category = document.createElement('span'); category.className = 'ovyx-notification-category'; category.textContent = clean(item.category || 'product', 32);
      var time = document.createElement('time'), parsed = Date.parse(String(item.createdAt || '')); time.textContent = Number.isFinite(parsed) ? new Date(parsed).toLocaleDateString() : 'OVYX announcement';
      meta.append(category, time); button.append(row, body, meta); button.addEventListener('click', function () { openItem(item); }); list.appendChild(button);
    });
    var device = byId('ovyx-notification-device-action');
    device.disabled = busy || !cache.push.configured;
    device.textContent = !cache.push.configured ? 'Phone alerts unavailable' : (cache.push.subscribed ? 'Turn off on this device' : 'Enable phone alerts');
    device.title = !cache.push.configured ? 'Phone alerts are not configured on this deployment.' : (cache.push.subscribed ? 'Disable phone alerts for this device.' : 'Ask permission to enable OVYX phone alerts.');
  }
  async function refresh() {
    if (!currentUser() || busy || String(currentUser().uid || '') !== userUid) return;
    try { var data = await api('/api/notifications'); cache.items = Array.isArray(data.notifications) ? data.notifications : []; cache.unread = Math.max(0, Number(data.unreadCount) || 0); cache.push = { configured: !!data.push?.configured, publicKey: clean(data.push?.publicKey || '', 300), subscribed: !!data.push?.subscribed }; render(); }
    catch (error) { status(clean(error && error.message || 'Notifications could not be refreshed.', 220), 'error'); }
  }
  async function openItem(item) {
    if (!item || !item.id) return;
    var target = safeHref(item.link || '/');
    if (item.unread) {
      try { await api('/api/notifications', { method: 'POST', body: JSON.stringify({ action: 'read', notificationId: item.id }) }); item.unread = false; cache.unread = Math.max(0, cache.unread - 1); render(); }
      catch (error) { status('This message could not be marked as read. ' + clean(error.message, 180), 'error'); return; }
    }
    open = false; render();
    if (new URL(target).origin === location.origin) location.assign(target); else window.open(target, '_blank', 'noopener,noreferrer');
  }
  function decodeKey(value) { var raw = String(value || '').replace(/-/g, '+').replace(/_/g, '/'); raw += '='.repeat((4 - raw.length % 4) % 4); var binary = atob(raw), output = new Uint8Array(binary.length); for (var i = 0; i < binary.length; i++) output[i] = binary.charCodeAt(i); return output; }
  async function togglePush() {
    if (busy) return; busy = true; render();
    try {
      if (!cache.push.configured || !cache.push.publicKey) throw new Error('OVYX phone notifications are not configured yet.');
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) throw new Error('This browser does not support web push. Try a supported browser or installed OVYX app.');
      var registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      var existing = await registration.pushManager.getSubscription();
      if (cache.push.subscribed) {
        await api('/api/notifications', { method: 'POST', body: JSON.stringify({ action: 'unsubscribe', endpoint: existing && existing.endpoint || '' }) });
        if (existing) await existing.unsubscribe();
        cache.push.subscribed = false; status('Phone alerts are disabled for this device.', 'success');
      } else {
        var permission = Notification.permission;
        if (permission === 'default') permission = await Notification.requestPermission();
        if (permission !== 'granted') throw new Error(permission === 'denied' ? 'Notifications are blocked in your browser settings. Allow OVYX notifications there, then try again.' : 'Phone notifications were not enabled.');
        var subscription = existing || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeKey(cache.push.publicKey) });
        var value = typeof subscription.toJSON === 'function' ? subscription.toJSON() : subscription;
        await api('/api/notifications', { method: 'POST', body: JSON.stringify({ action: 'subscribe', subscription: value }) });
        cache.push.subscribed = true; status('OVYX phone alerts are enabled on this device.', 'success');
      }
      await refresh();
    } catch (error) { status(clean(error && error.message || 'Phone notifications could not be changed.', 320), 'error'); }
    finally { busy = false; render(); }
  }
  function removeUI() { if (timer) window.clearInterval(timer); timer = null; byId(ROOT)?.remove(); userUid = ''; cache = { items: [], unread: 0, push: { configured: false, publicKey: '', subscribed: false } }; open = false; }
  function mount(user) {
    if (!user || !user.uid) return;
    if (userUid === String(user.uid) && byId(ROOT)) { refresh(); return; }
    removeUI(); userUid = String(user.uid); addStyles();
    var root = document.createElement('div'); root.id = ROOT;
    root.innerHTML = '<button type="button" id="ovyx-notification-toggle" aria-label="Notifications" aria-expanded="false" aria-controls="ovyx-notification-panel"><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg><span id="ovyx-notification-count" hidden></span></button><section id="ovyx-notification-panel" hidden aria-label="OVYX notifications"><header class="ovyx-notification-head"><div><div class="ovyx-notification-heading">Your notifications</div><div class="ovyx-notification-subheading">Announcements from the OVYX team</div></div><button type="button" id="ovyx-notification-refresh">Refresh</button></header><div class="ovyx-notification-list" id="ovyx-notification-list"></div><footer class="ovyx-notification-device"><div class="ovyx-notification-device-row"><div class="ovyx-notification-device-title">Phone notifications</div><button type="button" id="ovyx-notification-device-action">Enable phone alerts</button></div><div class="ovyx-notification-device-detail">Phone alerts work on supported browsers after you grant permission. You can turn them off here at any time.</div><div class="ovyx-notification-status" id="ovyx-notification-status" role="status" aria-live="polite"></div></footer></section>';
    document.body.appendChild(root);
    byId('ovyx-notification-toggle').addEventListener('click', function () { open = !open; render(); if (open) refresh(); });
    byId('ovyx-notification-refresh').addEventListener('click', refresh);
    byId('ovyx-notification-device-action').addEventListener('click', togglePush);
    document.addEventListener('keydown', onEscape);
    refresh(); timer = window.setInterval(function () { if (!document.hidden && currentUser()) refresh(); }, 60000);
  }
  function onEscape(event) { if (event.key === 'Escape' && open) { open = false; render(); byId('ovyx-notification-toggle')?.focus(); } }
  function bindAuth() { var auth = null; try { auth = window.firebase && typeof window.firebase.auth === 'function' ? window.firebase.auth() : null; } catch (_) {} if (!auth || typeof auth.onAuthStateChanged !== 'function') return false; if (authRef === auth) return true; authRef = auth; auth.onAuthStateChanged(function (user) { if (!user) { removeUI(); return; } mount(user); }); return true; }
  function boot(attempt) { if (bindAuth()) return; if (attempt < 70) window.setTimeout(function () { boot(attempt + 1); }, 200); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { boot(0); }, { once: true }); else boot(0);
  window.addEventListener('firebase-auth-state-ready', function () { window.setTimeout(function () { boot(0); }, 0); });
})();