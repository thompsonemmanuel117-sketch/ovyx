(() => {
  'use strict';
  if (window.__OVYX_INBOX_EXPERIENCE_V1__) return;
  window.__OVYX_INBOX_EXPERIENCE_V1__ = true;

  const API = '/api/notifications';
  const PUSH_API = '/api/notifications/push';
  const $ = (selector, root = document) => root.querySelector(selector);
  const clean = (value, max = 1200) => String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max);
  let activeUid = '';
  let items = [];
  let filter = 'all';
  let search = '';
  let nextPageToken = null;
  let loading = false;
  let saving = false;
  let routeActive = false;
  let refreshTimer = null;
  let browserSubscription = null;
  let pushBusy = false;

  function user() {
    try { return window.firebase?.auth?.()?.currentUser || null; }
    catch (_) { return null; }
  }

  function isInboxRoute() {
    const route = String(window.KernelState?.activeView || '').replace(/^view-/, '').toLowerCase();
    const view = $('#view-inbox');
    return route === 'inbox' && !!view && !view.classList.contains('hidden');
  }

  async function api(path, method = 'GET', body = null) {
    const account = user();
    if (!account || typeof account.getIdToken !== 'function') throw new Error('Sign in to view your notifications.');
    const token = await account.getIdToken();
    if (!token) throw new Error('Your session needs to be refreshed. Sign in again.');
    const headers = { Accept: 'application/json', Authorization: 'Bearer ' + token };
    const options = { method, headers, credentials: 'same-origin', cache: 'no-store' };
    if (body !== null) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    const response = await fetch(path, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok !== true) {
      throw new Error(clean(data.message || data.error || 'This notification action could not be completed.', 300));
    }
    return data;
  }

  function injectStyles() {
    if ($('#ovyx-inbox-experience-styles')) return;
    const style = document.createElement('style');
    style.id = 'ovyx-inbox-experience-styles';
    style.textContent = [
      '#view-inbox{min-height:100%;background:var(--ov-bg,#050607)!important;color:var(--ov-text,#f5f6f7)}',
      '#view-inbox .v34-inbox-shell{width:min(1160px,100%);margin:0 auto;padding:clamp(18px,3vw,34px) clamp(12px,2.4vw,28px) 84px}',
      '#view-inbox .v34-inbox-head{align-items:center;padding:0 0 22px;border-bottom:1px solid rgba(255,255,255,.09)}',
      '#view-inbox .v34-inbox-head h1{font-size:clamp(26px,3vw,34px);letter-spacing:-.045em}',
      '#view-inbox .v34-inbox-head p{max-width:520px;font-size:12px;line-height:1.6;color:#9ca3af}',
      '#view-inbox .v34-inbox-head-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '#view-inbox .v34-status-pill{font-size:9px;padding:7px 10px}',
      '#view-inbox .v34-inbox-toolbar{display:flex;align-items:center;gap:7px;flex-wrap:wrap;padding:18px 0 14px}',
      '#view-inbox .v34-inbox-filter{font-size:11px;padding:8px 12px;border:1px solid rgba(255,255,255,.08);border-radius:999px;color:#aeb4bf;background:rgba(255,255,255,.025)}',
      '#view-inbox .v34-inbox-filter.active{color:#f4d58c;background:rgba(232,182,79,.09);border-color:rgba(232,182,79,.28)}',
      '#view-inbox .ovyx-inbox-search{flex:1 1 220px;min-width:160px;max-width:360px;margin-left:auto;min-height:38px;padding:0 12px;border:1px solid rgba(255,255,255,.1);border-radius:10px;background:rgba(255,255,255,.035);color:#f5f6f7;font:500 12px Inter,system-ui,sans-serif;outline:none}',
      '#view-inbox .ovyx-inbox-search:focus{border-color:rgba(232,182,79,.55);box-shadow:0 0 0 3px rgba(232,182,79,.1)}',
      '#view-inbox .v34-inbox-list{display:grid;gap:8px}',
      '#view-inbox .ovyx-inbox-day{margin:16px 2px 2px;color:#89919e;font:750 9px JetBrains Mono,monospace;letter-spacing:.12em;text-transform:uppercase}',
      '#view-inbox .v34-inbox-item{grid-template-columns:34px minmax(0,1fr) auto;gap:13px;padding:15px 16px;border-radius:14px;background:rgba(255,255,255,.025);border-color:rgba(255,255,255,.075);transition:border-color .18s,background .18s,transform .18s}',
      '#view-inbox .v34-inbox-item:hover{transform:translateY(-1px);background:rgba(255,255,255,.045);border-color:rgba(232,182,79,.2)}',
      '#view-inbox .v34-inbox-item.unread{background:linear-gradient(100deg,rgba(232,182,79,.075),rgba(255,255,255,.022));border-color:rgba(232,182,79,.22)}',
      '#view-inbox .ovyx-inbox-icon{width:34px;height:34px;border-radius:10px;background:rgba(232,182,79,.07);border:1px solid rgba(232,182,79,.14);color:#e8c77d;font-size:13px}',
      '#view-inbox .v34-inbox-item b{font-size:12px;line-height:1.45;color:#f4f5f7}',
      '#view-inbox .v34-inbox-item p{font-size:12px;line-height:1.6;color:#aeb5c0;overflow-wrap:anywhere}',
      '#view-inbox .v34-inbox-meta{font:600 9px/1.5 JetBrains Mono,monospace;color:#78818e;letter-spacing:.02em}',
      '#view-inbox .v34-inbox-actions{align-items:center;flex-wrap:wrap;justify-content:flex-end}',
      '#view-inbox .v34-inbox-actions button{font:650 10px Inter,system-ui,sans-serif;padding:7px 9px;border-radius:8px;color:#cbd0d8;background:rgba(255,255,255,.035)}',
      '#view-inbox .v34-inbox-actions button[data-inbox-open]{color:#f1d58e;border-color:rgba(232,182,79,.25);background:rgba(232,182,79,.08)}',
      '#view-inbox .v34-inbox-empty{padding:58px 20px;border:1px dashed rgba(255,255,255,.14);background:rgba(255,255,255,.012);font:500 12px/1.6 Inter,system-ui,sans-serif;color:#8e97a4}',
      '#view-inbox .v34-inbox-empty b{font-size:14px;color:#e5e7eb}',
      '#view-inbox .ovyx-inbox-status{min-height:18px;margin:0 0 8px;color:#8e97a4;font:500 11px/1.5 Inter,system-ui,sans-serif}',
      '#view-inbox .ovyx-inbox-more{display:block;margin:16px auto 0;padding:10px 16px;border:1px solid rgba(255,255,255,.12);border-radius:10px;background:rgba(255,255,255,.035);color:#e6e8ec;font:650 11px Inter,system-ui,sans-serif;cursor:pointer}',
      '#view-inbox .ovyx-inbox-more:disabled,#view-inbox button:disabled{opacity:.55;cursor:wait}',
      '#view-inbox button:focus-visible,#view-inbox input:focus-visible{outline:2px solid #e8b64f;outline-offset:3px}',
      '@media(max-width:700px){#view-inbox .v34-inbox-shell{padding:18px 12px 76px}#view-inbox .v34-inbox-head{align-items:flex-start;gap:14px}#view-inbox .v34-inbox-head-actions{width:100%;justify-content:space-between}#view-inbox .ovyx-inbox-search{order:2;max-width:none;margin:4px 0 0;flex-basis:100%}#view-inbox .v34-inbox-item{grid-template-columns:30px minmax(0,1fr);gap:10px;padding:13px}#view-inbox .ovyx-inbox-icon{width:30px;height:30px}#view-inbox .v34-inbox-actions{grid-column:2;justify-content:flex-start}#view-inbox .v34-inbox-filter{padding:8px 10px}}',
      '@media(prefers-reduced-motion:reduce){#view-inbox .v34-inbox-item{transition:none!important}#view-inbox .v34-inbox-item:hover{transform:none}}'
    ].join('');
    document.head.appendChild(style);
  }

  function make(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = String(value);
    return node;
  }

  function ensureControls() {
    const view = $('#view-inbox');
    const toolbar = $('.v34-inbox-toolbar', view);
    const list = $('#v34-inbox-list');
    const actions = $('.v34-inbox-head-actions', view);
    if (!view || !toolbar || !list || !actions) return false;

    const description = $('.v34-inbox-head p', view);
    if (description) description.textContent = 'Important updates from your OVYX workspace, in one place.';

    if (!$('#ovyx-inbox-status', view)) {
      const status = make('div', 'ovyx-inbox-status');
      status.id = 'ovyx-inbox-status';
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      toolbar.insertAdjacentElement('beforebegin', status);
    }

    if (!$('#ovyx-inbox-push-toggle', view)) {
      const push = make('button', 'ovyx-settings-btn', 'Enable phone alerts');
      push.type = 'button';
      push.id = 'ovyx-inbox-push-toggle';
      push.addEventListener('click', togglePhonePush);
      actions.appendChild(push);
      const pushStatus = make('span', 'ovyx-inbox-push-status');
      pushStatus.id = 'ovyx-inbox-push-status';
      pushStatus.className = 'ovyx-inbox-status';
      pushStatus.setAttribute('role', 'status');
      pushStatus.setAttribute('aria-live', 'polite');
      actions.insertAdjacentElement('afterend', pushStatus);
    }

    if (!$('#ovyx-inbox-search', view)) {
      const input = make('input', 'ovyx-inbox-search');
      input.id = 'ovyx-inbox-search';
      input.type = 'search';
      input.autocomplete = 'off';
      input.placeholder = 'Search notifications';
      input.setAttribute('aria-label', 'Search notifications');
      input.addEventListener('input', () => {
        search = clean(input.value, 160).toLowerCase();
        render();
      });
      toolbar.appendChild(input);
    }

    const existingFilters = Array.from(toolbar.querySelectorAll('[data-inbox-filter]'));
    const categories = [
      ['all', 'All'],
      ['unread', 'Unread'],
      ['product', 'Product'],
      ['account', 'Account'],
      ['security', 'Security'],
      ['maintenance', 'Maintenance']
    ];
    categories.forEach(([key, label]) => {
      let button = existingFilters.find(item => item.dataset.inboxFilter === key);
      if (!button) {
        button = make('button', 'v34-inbox-filter', label);
        button.type = 'button';
        button.dataset.inboxFilter = key;
        toolbar.insertBefore(button, $('#ovyx-inbox-search', toolbar));
      } else {
        button.textContent = label;
      }
      button.setAttribute('aria-pressed', String(filter === key));
      if (button.dataset.ovyxInboxBound !== '1') {
        button.dataset.ovyxInboxBound = '1';
        button.addEventListener('click', () => {
          filter = key;
          toolbar.querySelectorAll('[data-inbox-filter]').forEach(item => {
            item.classList.toggle('active', item.dataset.inboxFilter === filter);
            item.setAttribute('aria-pressed', String(item.dataset.inboxFilter === filter));
          });
          render();
        });
      }
    });

    const markAll = $('#v34-inbox-mark-all', view);
    if (markAll && markAll.dataset.ovyxInboxBound !== '1') {
      markAll.dataset.ovyxInboxBound = '1';
      markAll.addEventListener('click', markAllRead);
    }

    if (!$('#ovyx-inbox-load-more', view)) {
      const more = make('button', 'ovyx-inbox-more', 'Load older notifications');
      more.type = 'button';
      more.id = 'ovyx-inbox-load-more';
      more.hidden = true;
      more.addEventListener('click', loadOlder);
      list.insertAdjacentElement('afterend', more);
    }
    list.setAttribute('aria-live', 'polite');
    list.setAttribute('aria-busy', String(loading));
    return true;
  }

  function setStatus(message) {
    const node = $('#ovyx-inbox-status');
    if (node) node.textContent = clean(message, 400);
  }

  function setPushStatus(message) {
    const node = $('#ovyx-inbox-push-status');
    if (node) node.textContent = clean(message, 300);
  }

  function iconFor(item) {
    const category = clean(item.category || 'product', 40).toLowerCase();
    if (category === 'security') return 'fa-shield-halved';
    if (category === 'account') return 'fa-user';
    if (category === 'maintenance') return 'fa-wrench';
    return 'fa-bullhorn';
  }

  function dateFor(item) {
    const date = new Date(item.createdAt || '');
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function dayLabel(date) {
    if (!date) return 'RECENT';
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const diff = Math.floor((today - day) / 86400000);
    if (diff <= 0) return 'TODAY';
    if (diff === 1) return 'YESTERDAY';
    if (diff < 7) return 'THIS WEEK';
    return 'EARLIER';
  }

  function visibleItems() {
    return items.filter(item => {
      const category = clean(item.category || 'product', 40).toLowerCase();
      if (filter === 'unread' && !item.unread) return false;
      if (filter === 'product' && category !== 'product') return false;
      if (filter === 'account' && !['account', 'security'].includes(category)) return false;
      if (filter === 'security' && category !== 'security') return false;
      if (filter === 'maintenance' && category !== 'maintenance') return false;
      if (search) {
        const haystack = [item.title, item.body, category].map(value => clean(value, 1200).toLowerCase()).join(' ');
        if (!haystack.includes(search)) return false;
      }
      return true;
    });
  }

  function updateBadges() {
    const unread = items.filter(item => item.unread).length;
    const count = $('#v34-inbox-unread-count');
    if (count) count.textContent = String(unread);
    const badge = $('#desktop-inbox-badge');
    if (badge) {
      badge.hidden = unread === 0;
      badge.textContent = String(Math.min(unread, 99));
      badge.setAttribute('aria-label', unread + ' unread notifications');
    }
    const markAll = $('#v34-inbox-mark-all');
    if (markAll) markAll.disabled = saving || unread === 0;
    window.dispatchEvent(new CustomEvent('ovyx:notifications-updated', { detail: { unreadCount: unread } }));
  }

  function openTarget(raw) {
    const value = clean(raw, 500);
    if (!value) return;
    try {
      const target = new URL(value, window.location.origin);
      if (!['https:', 'http:'].includes(target.protocol)) return;
      if (target.origin !== window.location.origin) {
        window.open(target.href, '_blank', 'noopener,noreferrer');
        return;
      }
      if (target.hash && (!target.pathname || target.pathname === '/')) {
        window.location.assign(target.href);
        return;
      }
      if (window.Router?.go && target.pathname.startsWith('/')) {
        const route = target.pathname.replace(/^\/+/, '').split('/')[0];
        if (route) {
          window.Router.go(route);
          return;
        }
      }
      window.location.assign(target.href);
    } catch (_) {}
  }

  async function setReadState(item, unread) {
    if (!item || saving) return;
    saving = true;
    setStatus(unread ? 'Marking notification as unread…' : 'Marking notification as read…');
    try {
      await api(API, 'POST', {
        action: unread ? 'unread' : 'read',
        notificationId: String(item.id || '')
      });
      item.unread = unread;
      item.readAt = unread ? null : new Date().toISOString();
      render();
      setStatus(unread ? 'Notification marked as unread.' : 'Notification marked as read.');
    } catch (error) {
      setStatus(error.message || 'This notification could not be updated. Try again.');
    } finally {
      saving = false;
      updateBadges();
    }
  }

  async function markAllRead() {
    if (saving || !items.some(item => item.unread)) return;
    saving = true;
    updateBadges();
    setStatus('Marking notifications as read…');
    try {
      const result = await api(API, 'POST', { action: 'read-all' });
      items.forEach(item => { item.unread = false; item.readAt = result.readAt || new Date().toISOString(); });
      render();
      setStatus('All loaded notifications are marked as read.');
    } catch (error) {
      setStatus(error.message || 'Notifications could not be marked as read. Try again.');
    } finally {
      saving = false;
      updateBadges();
    }
  }

  function render() {
    const list = $('#v34-inbox-list');
    if (!list) return;
    const filtered = visibleItems();
    list.replaceChildren();
    list.setAttribute('aria-busy', String(loading || saving));

    if (!user()) {
      const empty = make('div', 'v34-inbox-empty');
      empty.append(make('b', '', 'Sign in to view your Inbox'), make('span', '', 'Your account notifications will appear here after you sign in.'));
      list.appendChild(empty);
    } else if (loading && !items.length) {
      const empty = make('div', 'v34-inbox-empty');
      empty.append(make('b', '', 'Loading your notifications'), make('span', '', 'Checking your latest OVYX updates.'));
      list.appendChild(empty);
    } else if (!filtered.length) {
      const empty = make('div', 'v34-inbox-empty');
      const heading = search || filter !== 'all' ? 'No matching notifications' : 'You’re all caught up';
      const copy = search || filter !== 'all'
        ? 'Try another filter or search term.'
        : 'New OVYX announcements will appear here when they are published.';
      empty.append(make('b', '', heading), make('span', '', copy));
      list.appendChild(empty);
    } else {
      let previousDay = '';
      filtered.forEach(item => {
        const date = dateFor(item);
        const label = dayLabel(date);
        if (label !== previousDay) {
          list.appendChild(make('div', 'ovyx-inbox-day', label));
          previousDay = label;
        }
        const row = make('article', 'v34-inbox-item' + (item.unread ? ' unread' : ''));
        row.dataset.inboxId = String(item.id || '');
        const icon = make('div', 'v34-inbox-icon');
        const glyph = make('i');
        glyph.className = 'fa-solid ' + iconFor(item);
        glyph.setAttribute('aria-hidden', 'true');
        icon.appendChild(glyph);
        const content = make('div');
        const title = make('b', '', clean(item.title || 'OVYX update', 120));
        const body = make('p', '', clean(item.body || '', 1200));
        const meta = make('div', 'v34-inbox-meta', clean(item.category || 'product', 40).toUpperCase() + ' · ' + (date ? date.toLocaleString() : 'JUST ANNOUNCED'));
        content.append(title, body, meta);
        const actions = make('div', 'v34-inbox-actions');
        if (item.link) {
          const open = make('button', '', 'Open');
          open.type = 'button';
          open.dataset.inboxOpen = '1';
          open.addEventListener('click', () => {
            if (item.unread) void setReadState(item, false);
            openTarget(item.link);
          });
          actions.appendChild(open);
        }
        const read = make('button', '', item.unread ? 'Mark read' : 'Mark unread');
        read.type = 'button';
        read.dataset.inboxRead = '1';
        read.addEventListener('click', () => void setReadState(item, item.unread));
        actions.appendChild(read);
        row.append(icon, content, actions);
        list.appendChild(row);
      });
    }

    const more = $('#ovyx-inbox-load-more');
    if (more) {
      more.hidden = !nextPageToken;
      more.disabled = loading;
      more.textContent = loading ? 'Loading…' : 'Load older notifications';
    }
    updateBadges();
  }

  async function refresh(reset = true) {
    if (loading || !user()) return;
    loading = true;
    ensureControls();
    setStatus('Syncing your Inbox…');
    if (reset) {
      items = [];
      nextPageToken = null;
    }
    render();
    try {
      const query = nextPageToken && !reset ? '?pageToken=' + encodeURIComponent(nextPageToken) : '';
      const data = await api(API + query);
      const incoming = Array.isArray(data.notifications) ? data.notifications : [];
      if (reset) items = incoming;
      else {
        const known = new Set(items.map(item => String(item.id)));
        items.push(...incoming.filter(item => !known.has(String(item.id))));
      }
      nextPageToken = data.nextPageToken || null;
      setStatus(items.length ? 'Showing ' + items.length + ' notification(s).' : 'Your Inbox is up to date.');
    } catch (error) {
      setStatus(error.message || 'Notifications are temporarily unavailable.');
    } finally {
      loading = false;
      render();
    }
  }

  async function loadOlder() {
    if (!nextPageToken || loading) return;
    await refresh(false);
  }

  function urlBase64ToUint8Array(value) {
    const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
    const raw = window.atob(padded);
    const output = new Uint8Array(raw.length);
    for (let index = 0; index < raw.length; index += 1) output[index] = raw.charCodeAt(index);
    return output;
  }

  function isIOSInstalledAppRequired() {
    const ios = /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && Number(navigator.maxTouchPoints || 0) > 1);
    const standalone = navigator.standalone === true ||
      (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches);
    return ios && !standalone;
  }

  async function refreshPushControl() {
    const button = $('#ovyx-inbox-push-toggle');
    if (!button || !user()) return;
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      button.hidden = true;
      setPushStatus('Phone alerts are not supported in this browser. Your in-app Inbox will still work.');
      return;
    }
    button.hidden = false;
    if (isIOSInstalledAppRequired()) {
      button.disabled = true;
      button.textContent = 'Add OVYX to Home Screen';
      setPushStatus('On iPhone or iPad, add OVYX to your Home Screen and open the installed app before enabling phone alerts.');
      return;
    }
    try {
      const registration = await navigator.serviceWorker.getRegistration('/');
      browserSubscription = registration ? await registration.pushManager.getSubscription() : null;
      button.disabled = false;
      button.textContent = browserSubscription ? 'Disable phone alerts' : 'Enable phone alerts';
      const config = await api(PUSH_API);
      if (!browserSubscription && config.pushConfigured !== true) {
        button.disabled = true;
        setPushStatus(config.reason || 'Phone alerts are not configured for this OVYX deployment yet.');
      } else {
        setPushStatus(browserSubscription
          ? 'Phone alerts are enabled on this device.'
          : 'Enable phone alerts to receive important OVYX announcements outside the app.');
      }
    } catch (error) {
      button.disabled = false;
      button.textContent = browserSubscription ? 'Disable phone alerts' : 'Enable phone alerts';
      setPushStatus(error.message || 'Phone alert settings could not be checked.');
    }
  }

  async function togglePhonePush() {
    const button = $('#ovyx-inbox-push-toggle');
    if (!button || pushBusy) return;
    pushBusy = true;
    button.disabled = true;
    try {
      if (browserSubscription) {
        await api(PUSH_API, 'POST', { action: 'unsubscribe', endpoint: browserSubscription.endpoint });
        await browserSubscription.unsubscribe();
        browserSubscription = null;
        setPushStatus('Phone alerts are disabled on this device.');
      } else {
        if (isIOSInstalledAppRequired()) throw new Error('Add OVYX to your Home Screen and open the installed app before enabling phone alerts.');
        const config = await api(PUSH_API);
        if (config.pushConfigured !== true || !config.vapidPublicKey) {
          throw new Error(config.reason || 'Phone alerts are not configured for this OVYX deployment yet.');
        }
        if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
          throw new Error('This browser does not support phone alerts.');
        }
        const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
        if (permission !== 'granted') throw new Error('Notification permission was not granted. Allow OVYX notifications in your browser settings.');
        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        await navigator.serviceWorker.ready;
        browserSubscription = await registration.pushManager.getSubscription();
        if (!browserSubscription) {
          browserSubscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(config.vapidPublicKey)
          });
        }
        await api(PUSH_API, 'POST', { action: 'subscribe', subscription: browserSubscription.toJSON() });
        setPushStatus('Phone alerts are enabled on this device.');
      }
    } catch (error) {
      setPushStatus(error.message || 'Phone alert settings could not be updated.');
    } finally {
      pushBusy = false;
      await refreshPushControl();
    }
  }

  function startRefreshTimer() {
    if (refreshTimer) window.clearInterval(refreshTimer);
    refreshTimer = window.setInterval(() => {
      if (routeActive && !document.hidden && user()) void refresh(true);
    }, 60000);
  }

  function syncRoute() {
    const active = isInboxRoute();
    if (active === routeActive) return;
    routeActive = active;
    if (refreshTimer) {
      window.clearInterval(refreshTimer);
      refreshTimer = null;
    }
    if (routeActive) {
      ensureControls();
      void refresh(true);
      void refreshPushControl();
      startRefreshTimer();
    }
  }

  function bindLegacyBridge() {
    const legacy = window.OVYXNotifications;
    if (!legacy || legacy.__ovyxServerInboxBridge) return;
    legacy.__ovyxServerInboxBridge = true;
    legacy.subscribe = () => {
      if (isInboxRoute()) void refresh(true);
    };
    legacy.render = render;
    legacy.markRead = id => {
      const item = items.find(entry => String(entry.id) === String(id));
      if (item) return setReadState(item, false);
      return Promise.resolve();
    };
    legacy.markAll = markAllRead;
    legacy.renderHistory = () => {
      const host = $('#v34-broadcast-history');
      if (!host) return;
      host.replaceChildren();
      items.slice(0, 20).forEach(item => {
        const entry = make('div', 'v34-history-item');
        const content = make('div');
        content.append(make('b', '', clean(item.title || 'OVYX update', 120)));
        content.append(make('small', '', clean(item.body || '', 240)));
        const date = dateFor(item);
        entry.append(content, make('time', '', date ? date.toLocaleString() : 'Just announced'));
        host.appendChild(entry);
      });
    };
  }

  function onAuthChanged(account) {
    const uid = String(account?.uid || '');
    if (uid !== activeUid) {
      activeUid = uid;
      items = [];
      nextPageToken = null;
      if (routeActive) {
        ensureControls();
        if (uid) {
          void refresh(true);
          void refreshPushControl();
        } else {
          setStatus('Sign in to view your notifications.');
          render();
        }
      }
    }
    bindLegacyBridge();
  }

  function boot() {
    injectStyles();
    ensureControls();
    bindLegacyBridge();
    window.addEventListener('ovyx:view-changed', () => {
      window.setTimeout(syncRoute, 0);
      window.setTimeout(bindLegacyBridge, 0);
    }, { passive: true });
    window.addEventListener('focus', () => {
      if (routeActive && user()) void refresh(true);
    }, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && routeActive && user()) void refresh(true);
    });
    try {
      const auth = window.firebase?.auth?.();
      if (auth && typeof auth.onAuthStateChanged === 'function') auth.onAuthStateChanged(onAuthChanged);
    } catch (_) {}
    syncRoute();
    const router = window.Router;
    if (router && typeof router.go === 'function' && !router.__ovyxInboxExperience) {
      const original = router.go.bind(router);
      router.go = function (view) {
        const result = original(view);
        window.setTimeout(syncRoute, 0);
        return result;
      };
      router.__ovyxInboxExperience = true;
    }
    window.OVYXInboxExperience = Object.freeze({
      refresh: () => refresh(true),
      markAllRead,
      unreadCount: () => items.filter(item => item.unread).length,
      notifications: () => items.map(item => ({ ...item }))
    });
  }

  if (document.body) boot();
  else document.addEventListener('DOMContentLoaded', boot, { once: true });
})();