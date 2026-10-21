(() => {
  'use strict';
  if (window.__OVYX_ACCOUNT_NOTIFICATIONS_V1__) return;
  window.__OVYX_ACCOUNT_NOTIFICATIONS_V1__ = true;
  const API_NOTIFICATIONS = '/api/notifications';
  const API_PUSH = '/api/notifications/push';
  const API_PROFILE = '/api/settings/profile';
  const BRAND_ICON = '/assets/ovyx-brand-mark.svg';
  let activeUid = '';
  let authListener = null;
  let currentNotifications = [];
  let refreshInFlight = null;
  let pushBusy = false;
  let browserSubscription = null;
  let refreshTimer = null;
  const $ = (selector, root = document) => root.querySelector(selector);
  const clean = (value, max = 1000) => String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max);
  const make = (tag, className, content) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = String(content);
    return node;
  };
  function getAuth() {
    try { return window.firebase && typeof window.firebase.auth === 'function' ? window.firebase.auth() : null; }
    catch (_) { return null; }
  }
  function getUser() {
    try { return getAuth()?.currentUser || null; } catch (_) { return null; }
  }
  async function api(path, method = 'GET', body = null) {
    const user = getUser();
    if (!user || typeof user.getIdToken !== 'function') throw new Error('Sign in to use OVYX notifications.');
    const token = await user.getIdToken();
    if (!token) throw new Error('Your OVYX session needs to be refreshed. Sign in again.');
    const headers = { Accept: 'application/json', Authorization: 'Bearer ' + token };
    const options = { method, headers, credentials: 'same-origin', cache: 'no-store' };
    if (body !== null) { headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(body); }
    const response = await fetch(path, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok !== true) throw new Error(clean(data.error || data.message || 'This notification action could not be completed.', 300));
    return data;
  }
  function injectStyles() {
    if ($('#ovyx-account-notification-styles')) return;
    const style = make('style');
    style.id = 'ovyx-account-notification-styles';
    style.textContent =
      '#ovyx-account-notifications-root{position:fixed;z-index:2147482000;top:calc(env(safe-area-inset-top,0px) + 14px);right:calc(env(safe-area-inset-right,0px) + 14px);font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif;color:#f8fafc}' +
      '#ovyx-account-notifications-root *{box-sizing:border-box}' +
      '.ovyx-bell-button{position:relative;width:48px;height:48px;display:grid;place-items:center;border:1px solid rgba(223,194,129,.4);border-radius:16px;background:linear-gradient(145deg,rgba(21,29,48,.97),rgba(9,13,25,.98));color:#f6d98d;box-shadow:0 12px 36px rgba(0,0,0,.22);cursor:pointer;backdrop-filter:blur(16px);transition:transform .2s,border-color .2s}' +
      '.ovyx-bell-button:hover{transform:translateY(-2px);border-color:#e6c97f}.ovyx-bell-button svg{width:22px;height:22px}' +
      '.ovyx-bell-button:focus-visible,.ovyx-notice-close:focus-visible,.ovyx-notice-action:focus-visible,.ovyx-notice-item:focus-visible{outline:3px solid #e6c97f;outline-offset:3px}' +
      '.ovyx-notice-badge{position:absolute;top:-7px;right:-7px;min-width:21px;height:21px;padding:0 5px;display:none;align-items:center;justify-content:center;border-radius:999px;background:#e34f63;color:#fff;border:2px solid #0b1020;font-size:10px;font-weight:900;line-height:1}' +
      '.ovyx-notice-badge.is-visible{display:flex;animation:ovyxBadgePop .25s ease-out both}' +
      '.ovyx-notice-panel{position:absolute;top:58px;right:0;width:min(370px,calc(100vw - 26px));max-height:min(580px,calc(100dvh - 92px));display:flex;flex-direction:column;overflow:hidden;border:1px solid rgba(215,190,133,.24);border-radius:22px;background:rgba(13,19,33,.98);box-shadow:0 24px 70px rgba(0,0,0,.36);backdrop-filter:blur(20px)}' +
      '.ovyx-notice-panel[hidden]{display:none}.ovyx-notice-head{display:flex;align-items:center;gap:11px;padding:18px 17px 14px;border-bottom:1px solid rgba(255,255,255,.08)}' +
      '.ovyx-notice-head img{width:35px;height:35px;flex:0 0 35px;border-radius:11px}.ovyx-notice-heading{flex:1;min-width:0}.ovyx-notice-heading strong{display:block;font-size:15px;color:#fff}.ovyx-notice-heading span{display:block;margin-top:3px;font-size:11px;color:#aeb8ca}' +
      '.ovyx-notice-close{width:30px;height:30px;border:0;border-radius:9px;background:rgba(255,255,255,.07);color:#e7ebf4;font-size:20px;cursor:pointer}.ovyx-notice-status{padding:12px 17px;color:#b9c3d5;font-size:12px;line-height:1.5}' +
      '.ovyx-notice-list{padding:0 10px 10px;overflow:auto;overscroll-behavior:contain}.ovyx-notice-empty{margin:2px 6px 8px;padding:20px 14px;border:1px dashed rgba(255,255,255,.15);border-radius:15px;text-align:center;color:#aab4c7;font-size:12px;line-height:1.6}' +
      '.ovyx-notice-item{position:relative;display:block;width:100%;margin:4px 0;padding:13px;text-align:left;border:1px solid rgba(255,255,255,.07);border-radius:14px;background:rgba(255,255,255,.035);color:#f8fafc;cursor:pointer}.ovyx-notice-item:hover{background:rgba(255,255,255,.075);border-color:rgba(230,201,127,.28)}' +
      '.ovyx-notice-item.is-unread{background:linear-gradient(100deg,rgba(222,184,91,.11),rgba(255,255,255,.025));border-color:rgba(230,201,127,.2)}.ovyx-notice-item-title{display:block;padding-right:15px;font-size:13px;font-weight:800;line-height:1.4}' +
      '.ovyx-notice-item-body{display:block;margin-top:5px;color:#c3cbda;font-size:12px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}.ovyx-notice-item-meta{display:block;margin-top:8px;color:#8e9bb1;font-size:10px}.ovyx-notice-unread-dot{position:absolute;right:12px;top:16px;width:7px;height:7px;border-radius:99px;background:#e8c36f;box-shadow:0 0 0 3px rgba(232,195,111,.13)}' +
      '.ovyx-notice-footer{padding:12px 14px;border-top:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.018)}.ovyx-notice-action{width:100%;padding:10px 12px;border:1px solid rgba(230,201,127,.3);border-radius:11px;background:rgba(230,201,127,.1);color:#f4dc9f;font-size:12px;font-weight:800;cursor:pointer}.ovyx-notice-action:disabled{opacity:.55;cursor:wait}.ovyx-notice-push-status{margin-top:8px;color:#aeb8ca;font-size:11px;line-height:1.45}' +
      '.ovyx-welcome-overlay{position:fixed;inset:0;z-index:2147481990;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(6,10,20,.12);backdrop-filter:blur(1px);pointer-events:none;animation:ovyxWelcomeFade .35s ease-out both}' +
      '.ovyx-welcome-card{position:relative;width:min(470px,100%);padding:29px 27px 24px;overflow:hidden;pointer-events:none;text-align:center;border:1px solid rgba(234,207,144,.44);border-radius:28px;background:radial-gradient(ellipse at 50% -15%,rgba(227,190,106,.22),transparent 55%),linear-gradient(145deg,rgba(22,31,51,.98),rgba(8,13,25,.99));color:#f8fafc;box-shadow:0 30px 100px rgba(0,0,0,.38);animation:ovyxWelcomeRise .62s cubic-bezier(.2,.8,.2,1) both}' +
      '.ovyx-welcome-spark{display:block;margin:0 auto 14px;font-size:29px;color:#e9c975;filter:drop-shadow(0 0 13px rgba(235,199,121,.5));animation:ovyxSparkle 2.3s ease-in-out infinite}.ovyx-welcome-logo{display:block;width:64px;height:64px;object-fit:contain;margin:0 auto 15px;border-radius:19px;box-shadow:0 7px 24px rgba(0,0,0,.25)}' +
      '.ovyx-welcome-eyebrow{font-size:10px;font-weight:800;letter-spacing:3.2px;color:#e9c975;text-transform:uppercase}.ovyx-welcome-title{margin:11px 0 9px;font-size:clamp(24px,5vw,33px);line-height:1.18;letter-spacing:-.8px;font-weight:850;color:#fff;overflow-wrap:anywhere}.ovyx-welcome-name{color:#f0d58c;text-shadow:0 0 24px rgba(235,199,121,.2)}' +
      '.ovyx-welcome-copy{max-width:340px;margin:0 auto;color:#c4ccda;font-size:13px;line-height:1.7}.ovyx-welcome-footer{display:flex;align-items:center;justify-content:center;gap:7px;margin-top:21px;color:#97a5ba;font-size:10px;letter-spacing:.8px;text-transform:uppercase}.ovyx-welcome-footer span{width:5px;height:5px;border-radius:50%;background:#dfbd6a;box-shadow:0 0 10px rgba(223,189,106,.8)}' +
      '.ovyx-welcome-dismiss{position:absolute;top:12px;right:12px;width:31px;height:31px;pointer-events:auto;border:0;border-radius:10px;background:rgba(255,255,255,.08);color:#eef2f8;font-size:20px;cursor:pointer}' +
      '@keyframes ovyxWelcomeFade{from{opacity:0}to{opacity:1}}@keyframes ovyxWelcomeRise{from{opacity:0;transform:translateY(18px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}@keyframes ovyxSparkle{0%,100%{transform:translateY(0) rotate(-5deg) scale(1)}50%{transform:translateY(-4px) rotate(7deg) scale(1.08)}}@keyframes ovyxBadgePop{from{opacity:0;transform:scale(.7)}to{opacity:1;transform:scale(1)}}' +
      '@media(max-width:480px){#ovyx-account-notifications-root{top:calc(env(safe-area-inset-top,0px) + 10px);right:calc(env(safe-area-inset-right,0px) + 10px)}.ovyx-bell-button{width:44px;height:44px;border-radius:14px}.ovyx-notice-panel{top:52px;width:min(360px,calc(100vw - 20px));max-height:calc(100dvh - 78px)}.ovyx-welcome-card{padding:27px 20px 22px;border-radius:23px}.ovyx-welcome-title{font-size:27px}}' +
      '@media(prefers-reduced-motion:reduce){.ovyx-welcome-overlay,.ovyx-welcome-card,.ovyx-welcome-spark,.ovyx-notice-badge.is-visible{animation:none!important;transition:none!important}}';
    document.head.appendChild(style);
  }
  function createWidget() {
    let root = $('#ovyx-account-notifications-root');
    if (root) return root;
    injectStyles();
    root = make('div');
    root.id = 'ovyx-account-notifications-root';
    root.hidden = true;
    const bell = make('button', 'ovyx-bell-button');
    bell.type = 'button'; bell.id = 'ovyx-notification-bell'; bell.setAttribute('aria-label', 'Open notifications'); bell.setAttribute('aria-haspopup', 'dialog'); bell.setAttribute('aria-expanded', 'false');
    bell.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>';
    const badge = make('span', 'ovyx-notice-badge', '0'); badge.id = 'ovyx-notification-badge'; badge.setAttribute('aria-label', 'Unread notifications'); bell.appendChild(badge);
    const panel = make('section', 'ovyx-notice-panel'); panel.id = 'ovyx-notification-panel'; panel.hidden = true; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'OVYX account notifications');
    const head = make('div', 'ovyx-notice-head');
    const logo = make('img'); logo.src = BRAND_ICON; logo.alt = ''; logo.width = 35; logo.height = 35;
    const heading = make('div', 'ovyx-notice-heading'); heading.append(make('strong', '', 'Your notifications'), make('span', '', 'Important updates from OVYX'));
    const close = make('button', 'ovyx-notice-close', '×'); close.id = 'ovyx-notification-close'; close.type = 'button'; close.setAttribute('aria-label', 'Close notifications'); head.append(logo, heading, close);
    const status = make('div', 'ovyx-notice-status', 'Loading your account updates…'); status.id = 'ovyx-notification-status'; status.setAttribute('role', 'status');
    const list = make('div', 'ovyx-notice-list'); list.id = 'ovyx-notification-list';
    const footer = make('div', 'ovyx-notice-footer');
    const pushButton = make('button', 'ovyx-notice-action', 'Enable phone alerts'); pushButton.id = 'ovyx-notification-push-button'; pushButton.type = 'button';
    const pushStatus = make('div', 'ovyx-notice-push-status', 'Phone alerts appear when you allow notifications on this device.'); pushStatus.id = 'ovyx-notification-push-status';
    footer.append(pushButton, pushStatus); panel.append(head, status, list, footer); root.append(bell, panel); document.body.appendChild(root);
    bell.addEventListener('click', () => { panel.hidden = !panel.hidden; bell.setAttribute('aria-expanded', String(!panel.hidden)); if (!panel.hidden) { void refreshNotifications(true); void refreshPushButton(); } });
    close.addEventListener('click', () => closePanel(root));
    pushButton.addEventListener('click', () => { if (pushBusy) return; if (browserSubscription) void disablePhonePush(root); else void enablePhonePush(root); });
    list.addEventListener('click', event => { const button = event.target instanceof Element ? event.target.closest('[data-ovyx-notification-id]') : null; if (!button) return; const item = currentNotifications.find(entry => String(entry.id) === String(button.dataset.ovyxNotificationId)); if (item) void openNotification(item); });
    return root;
  }
  function closePanel(root = $('#ovyx-account-notifications-root')) {
    if (!root) return; const panel = $('#ovyx-notification-panel', root); if (panel) panel.hidden = true; $('#ovyx-notification-bell', root)?.setAttribute('aria-expanded', 'false');
  }
  function setStatus(message) { const node = $('#ovyx-notification-status'); if (node) node.textContent = clean(message, 500); }
  function setPushStatus(message) { const node = $('#ovyx-notification-push-status'); if (node) node.textContent = clean(message, 500); }
  function updateOperatingSystemBadge(count) {
    try {
      if (count > 0 && typeof navigator.setAppBadge === 'function') {
        Promise.resolve(navigator.setAppBadge(count)).catch(() => {});
      } else if (count <= 0 && typeof navigator.clearAppBadge === 'function') {
        Promise.resolve(navigator.clearAppBadge()).catch(() => {});
      }
    } catch (_) {}
  }
  function isIOSInstalledAppRequired() {
    const ios = /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && Number(navigator.maxTouchPoints || 0) > 1);
    const standalone = navigator.standalone === true ||
      (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches);
    return ios && !standalone;
  }
  function setUnreadCount(value) {
    const badge = $('#ovyx-notification-badge'); const bell = $('#ovyx-notification-bell');
    const count = Math.max(0, Math.floor(Number(value) || 0));
    updateOperatingSystemBadge(count);
    if (!badge || !bell) return;
    badge.textContent = count > 99 ? '99+' : count > 9 ? '9+' : String(count);
    badge.classList.toggle('is-visible', count > 0);
    bell.setAttribute('aria-label', count ? 'Open notifications, ' + count + ' unread' : 'Open notifications');
  }
  function formatDate(value) {
    if (!value) return 'Just announced'; const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Just announced' : date.toLocaleString();
  }
  function renderItems(items) {
    const list = $('#ovyx-notification-list'); if (!list) return; list.replaceChildren();
    if (!items.length) { list.appendChild(make('div', 'ovyx-notice-empty', 'You’re all caught up. New OVYX updates will appear here.')); return; }
    items.slice(0, 30).forEach(item => {
      const button = make('button', 'ovyx-notice-item' + (item.unread ? ' is-unread' : ''));
      button.type = 'button'; button.dataset.ovyxNotificationId = String(item.id || '');
      button.setAttribute('aria-label', (item.unread ? 'Unread: ' : '') + clean(item.title || 'OVYX Update', 120));
      if (item.unread) { const dot = make('span', 'ovyx-notice-unread-dot'); dot.setAttribute('aria-hidden', 'true'); button.appendChild(dot); }
      const title = make('span', 'ovyx-notice-item-title', clean(item.title || 'OVYX Update', 120));
      const body = make('span', 'ovyx-notice-item-body', clean(item.body || '', 1000));
      const meta = make('span', 'ovyx-notice-item-meta', clean(item.category || 'product', 40).toUpperCase() + ' · ' + formatDate(item.createdAt));
      button.append(title, body, meta); list.appendChild(button);
    });
  }
  async function refreshNotifications(force) {
    const user = getUser(); if (!user) return;
    if (refreshInFlight && !force) return refreshInFlight;
    const uid = String(user.uid || '');
    const task = (async () => {
      try {
        const data = await api(API_NOTIFICATIONS); if (getUser()?.uid !== uid) return;
        currentNotifications = Array.isArray(data.notifications) ? data.notifications : [];
        setUnreadCount(data.unreadCount); renderItems(currentNotifications);
        setStatus(currentNotifications.length ? (Number(data.unreadCount || 0) ? 'You have ' + data.unreadCount + ' unread update(s).' : 'No unread messages.') : 'No broadcasts yet.');
      } catch (error) { setStatus(error.message || 'Notifications are temporarily unavailable.'); }
    })();
    refreshInFlight = task; try { await task; } finally { if (refreshInFlight === task) refreshInFlight = null; }
  }
  async function openNotification(item) {
    if (!getUser()) return;
    if (item.unread) {
      try { await api(API_NOTIFICATIONS, 'POST', { action: 'read', notificationId: String(item.id || '') }); item.unread = false; item.readAt = new Date().toISOString(); setUnreadCount(currentNotifications.filter(entry => entry.unread).length); renderItems(currentNotifications); }
      catch (_) { setStatus('This message could not be marked as read. The link will still open.'); }
    }
    closePanel();
    try { const target = new URL(clean(item.link || '/', 500), window.location.origin); if (target.protocol !== 'https:' && target.protocol !== 'http:') return; if (target.origin === window.location.origin) window.location.assign(target.href); else window.open(target.href, '_blank', 'noopener,noreferrer'); } catch (_) {}
  }
  function urlBase64ToUint8Array(value) {
    const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/'); const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4); const raw = window.atob(padded); const output = new Uint8Array(raw.length);
    for (let index = 0; index < raw.length; index += 1) output[index] = raw.charCodeAt(index); return output;
  }
  async function refreshPushButton() {
    const button = $('#ovyx-notification-push-button'); if (!button) return;
    if (isIOSInstalledAppRequired()) {
      button.hidden = false;
      button.disabled = true;
      button.textContent = 'Add OVYX to Home Screen';
      browserSubscription = null;
      setPushStatus('On iPhone or iPad, add OVYX to your Home Screen and open that installed app before enabling phone alerts.');
      return;
    }
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) { button.hidden = true; setPushStatus('This browser does not support phone push notifications. In-app updates remain available.'); return; }
    button.hidden = false;
    try {
      if (Notification.permission === 'denied') { browserSubscription = null; button.textContent = 'Phone alerts blocked'; button.disabled = true; setPushStatus('Notifications are blocked in browser settings. Allow them there to enable OVYX phone alerts.'); return; }
      button.disabled = false; const registration = await navigator.serviceWorker.getRegistration('/'); browserSubscription = registration ? await registration.pushManager.getSubscription() : null;
      button.textContent = browserSubscription ? 'Disable phone alerts on this device' : 'Enable phone alerts';
      setPushStatus(browserSubscription ? 'Phone alerts are enabled on this device. You can turn them off here.' : 'Enable alerts to receive OVYX broadcasts in your phone notification tray. Your browser will ask permission first.');
    } catch (_) { browserSubscription = null; button.disabled = false; button.textContent = 'Enable phone alerts'; setPushStatus('Phone alert status could not be checked. Try enabling it again.'); }
  }
  async function enablePhonePush(root) {
    const button = $('#ovyx-notification-push-button', root); if (pushBusy) return; pushBusy = true;
    if (button) { button.disabled = true; button.textContent = 'Enabling…'; }
    try {
      if (isIOSInstalledAppRequired()) throw new Error('On iPhone or iPad, first add OVYX to your Home Screen and open the installed app, then enable phone alerts.');
      if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('This browser does not support push notifications. You can still read updates in OVYX.');
      const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Notification permission was not granted. Allow OVYX notifications in your browser to continue.');
      const config = await api(API_PUSH); if (config.pushConfigured !== true || !config.vapidPublicKey) throw new Error(config.reason || 'OVYX phone notifications have not been configured by the site administrator yet.');
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' }); await navigator.serviceWorker.ready;
      browserSubscription = await registration.pushManager.getSubscription();
      if (!browserSubscription) browserSubscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(config.vapidPublicKey) });
      await api(API_PUSH, 'POST', { action: 'subscribe', subscription: browserSubscription.toJSON() });
      setPushStatus('Phone alerts are enabled on this device.');
    } catch (error) { setPushStatus(error.message || 'Phone alerts could not be enabled.'); }
    finally { pushBusy = false; await refreshPushButton(); }
  }
  async function disablePhonePush(root) {
    const button = $('#ovyx-notification-push-button', root); if (pushBusy || !browserSubscription) return; pushBusy = true;
    if (button) { button.disabled = true; button.textContent = 'Disabling…'; }
    try { const endpoint = browserSubscription.endpoint; await api(API_PUSH, 'POST', { action: 'unsubscribe', endpoint }); await browserSubscription.unsubscribe(); browserSubscription = null; setPushStatus('Phone alerts are disabled on this device.'); }
    catch (error) { setPushStatus(error.message || 'Phone alerts could not be disabled completely. Try again.'); }
    finally { pushBusy = false; await refreshPushButton(); }
  }
  function emailDisplayName(user) {
    const email = clean(user?.email, 320); const local = email.includes('@') ? email.slice(0, email.indexOf('@')) : '';
    const words = local.replace(/[._+-]+/g, ' ').split(/\s+/).filter(Boolean);
    return words.map(word => word.charAt(0).toLocaleUpperCase() + word.slice(1)).join(' ').slice(0, 80) || 'there';
  }
  async function preferredDisplayName(user) {
    try { const data = await api(API_PROFILE); const saved = clean(data?.profile?.displayName, 80); if (saved) return saved; } catch (_) {}
    return clean(user?.displayName, 80) || emailDisplayName(user);
  }
  function isFirstLogin(user) {
    const creation = Date.parse(user?.metadata?.creationTime || ''); const lastSignIn = Date.parse(user?.metadata?.lastSignInTime || '');
    return Number.isFinite(creation) && Number.isFinite(lastSignIn) && Math.abs(lastSignIn - creation) < 5 * 60 * 1000;
  }
  function dismissWelcome(node) {
    if (!node || !node.isConnected) return; node.style.transition = 'opacity .2s ease'; node.style.opacity = '0'; window.setTimeout(() => node.remove(), 220);
  }
  async function showWelcome(user) {
    const uid = String(user?.uid || ''); if (!uid || getUser()?.uid !== uid) return;
    const displayName = await preferredDisplayName(user); if (getUser()?.uid !== uid) return;
    $('#ovyx-welcome-overlay')?.remove();
    const overlay = make('div', 'ovyx-welcome-overlay'); overlay.id = 'ovyx-welcome-overlay'; overlay.setAttribute('role', 'status'); overlay.setAttribute('aria-live', 'polite');
    const card = make('section', 'ovyx-welcome-card');
    const close = make('button', 'ovyx-welcome-dismiss', '×'); close.type = 'button'; close.setAttribute('aria-label', 'Dismiss welcome message'); close.addEventListener('click', () => dismissWelcome(overlay));
    const spark = make('div', 'ovyx-welcome-spark', '✦'); spark.setAttribute('aria-hidden', 'true');
    const logo = make('img', 'ovyx-welcome-logo'); logo.src = BRAND_ICON; logo.alt = 'OVYX'; logo.width = 64; logo.height = 64;
    const eyebrow = make('div', 'ovyx-welcome-eyebrow', 'A workspace made for you');
    const heading = make('h2', 'ovyx-welcome-title');
    heading.append(document.createTextNode(isFirstLogin(user) ? 'Welcome to OVYX, ' : 'Welcome back, '));
    const name = make('span', 'ovyx-welcome-name', displayName); name.id = 'ovyx-welcome-name'; heading.append(name, document.createTextNode('!'));
    const copy = make('p', 'ovyx-welcome-copy', 'Your space is ready. Bring your ideas, build boldly, and make something meaningful today.');
    const footer = make('div', 'ovyx-welcome-footer'); const pulse = make('span'); pulse.setAttribute('aria-hidden', 'true'); footer.append(pulse, document.createTextNode('Your OVYX account is ready'));
    card.append(close, spark, logo, eyebrow, heading, copy, footer); overlay.appendChild(card); document.body.appendChild(overlay);
    window.setTimeout(() => dismissWelcome(overlay), 7200);
  }
  function syncAuth() {
    const user = getUser(); const root = createWidget();
    if (!user || !user.uid) {
      activeUid = ''; currentNotifications = []; setUnreadCount(0); root.hidden = true; closePanel(root); $('#ovyx-welcome-overlay')?.remove();
      if (refreshTimer) { window.clearInterval(refreshTimer); refreshTimer = null; } return;
    }
    root.hidden = false; const uid = String(user.uid);
    if (uid !== activeUid) {
      activeUid = uid; currentNotifications = []; setUnreadCount(0); closePanel(root); void refreshNotifications(true); void showWelcome(user);
      if (refreshTimer) window.clearInterval(refreshTimer);
      refreshTimer = window.setInterval(() => { if (getUser()?.uid === uid) void refreshNotifications(false); }, 60000);
    }
  }
  function bindAuth() {
    const auth = getAuth();
    if (auth && auth !== authListener && typeof auth.onAuthStateChanged === 'function') { authListener = auth; auth.onAuthStateChanged(() => syncAuth()); }
    syncAuth();
  }
  function boot() {
    createWidget(); bindAuth();
    window.addEventListener('firebase-auth-state-ready', bindAuth, { passive: true });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && getUser()) void refreshNotifications(false); });
    window.addEventListener('focus', () => { if (getUser()) void refreshNotifications(false); }, { passive: true });
    document.addEventListener('click', event => {
      if (!getUser()) return;
      const target = event.target instanceof Element ? event.target.closest('#profile-save-action,[data-save-profile]') : null; if (!target) return;
      const uid = String(getUser()?.uid || '');
      window.setTimeout(async () => { const user = getUser(); if (!user || String(user.uid) !== uid) return; const savedName = await preferredDisplayName(user); const nameNode = $('#ovyx-welcome-name'); if (nameNode && savedName) nameNode.textContent = savedName; }, 1500);
    }, true);
    window.OVYXAccountNotifications = Object.freeze({
      refresh: () => refreshNotifications(true),
      open: () => { const root = createWidget(); root.hidden = false; const panel = $('#ovyx-notification-panel', root); panel.hidden = false; void refreshNotifications(true); void refreshPushButton(); },
      unreadCount: () => currentNotifications.filter(item => item.unread).length
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})();
