(() => {
  'use strict';
  if (window.__OVYX_COMMAND_CENTRE_V1__) return;
  window.__OVYX_COMMAND_CENTRE_V1__ = true;

  const HOME_ID = 'ovyx-command-centre';
  const HEALTH_TIMEOUT_MS = 5000;
  let healthRequest = null;
  let lastHealth = null;

  const byId = id => document.getElementById(id);
  const clean = (value, fallback) => {
    const text = String(value == null ? '' : value).trim();
    return text ? text.slice(0, 180) : fallback;
  };
  const projectList = () => {
    try {
      const rows = window.ProjectStore?.list?.();
      return Array.isArray(rows) ? rows.filter(item => item && typeof item === 'object') : [];
    } catch (_) {
      return [];
    }
  };
  const dateValue = value => {
    if (value == null || value === '') return null;
    const numeric = Number(value);
    const date = new Date(Number.isFinite(numeric) ? numeric : String(value));
    return Number.isNaN(date.getTime()) ? null : date;
  };
  const formatDate = value => {
    const date = dateValue(value);
    return date ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date) : 'Not recorded';
  };
  const relativeDate = value => {
    const date = dateValue(value);
    if (!date) return 'Date not recorded';
    const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return Math.floor(seconds / 60) + ' min ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + ' hr ago';
    if (seconds < 604800) return Math.floor(seconds / 86400) + ' days ago';
    return formatDate(date);
  };

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function action(label, icon, handler, variant) {
    const button = element('button', 'ovyx-cc-action' + (variant ? ' ' + variant : ''));
    button.type = 'button';
    button.setAttribute('data-ovyx-cc-action', label.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
    const glyph = element('i', 'fa-solid ' + icon);
    glyph.setAttribute('aria-hidden', 'true');
    const copy = element('span', '', label);
    button.append(glyph, copy);
    button.addEventListener('click', handler);
    return button;
  }

  function createShell() {
    const host = element('section', 'ovyx-command-centre');
    host.id = HOME_ID;
    host.setAttribute('aria-labelledby', 'ovyx-cc-title');

    const header = element('div', 'ovyx-cc-header');
    const heading = element('div', 'ovyx-cc-heading');
    const eyebrow = element('div', 'ovyx-cc-eyebrow', 'WORKSPACE OVERVIEW');
    const title = element('h2', '', 'Your Command Centre');
    title.id = 'ovyx-cc-title';
    const description = element('p', '', 'A clear view of your projects, recent work and workspace readiness.');
    heading.append(eyebrow, title, description);
    const refresh = action('Refresh overview', 'fa-rotate', () => { void refreshAll(true); }, 'ovyx-cc-action-quiet');
    refresh.id = 'ovyx-cc-refresh';
    header.append(heading, refresh);

    const metrics = element('div', 'ovyx-cc-metrics');
    metrics.setAttribute('aria-label', 'Workspace summary');
    const metricSpecs = [
      ['projects', 'Your projects', 'fa-folder-open'],
      ['drafts', 'Drafts', 'fa-file-pen'],
      ['pages', 'Pages across projects', 'fa-layer-group'],
      ['latest', 'Latest project activity', 'fa-clock']
    ];
    metricSpecs.forEach(([key, label, icon]) => {
      const card = element('article', 'ovyx-cc-metric');
      const top = element('div', 'ovyx-cc-metric-top');
      const name = element('span', '', label);
      const glyph = element('i', 'fa-solid ' + icon);
      glyph.setAttribute('aria-hidden', 'true');
      top.append(name, glyph);
      const value = element('strong', 'ovyx-cc-metric-value', '—');
      value.id = 'ovyx-cc-metric-' + key;
      const detail = element('span', 'ovyx-cc-metric-detail', 'Loading workspace data…');
      detail.id = 'ovyx-cc-metric-' + key + '-detail';
      card.append(top, value, detail);
      metrics.appendChild(card);
    });

    const lower = element('div', 'ovyx-cc-lower');
    const activity = element('section', 'ovyx-cc-panel ovyx-cc-activity');
    activity.setAttribute('aria-labelledby', 'ovyx-cc-activity-title');
    const activityHead = element('div', 'ovyx-cc-panel-head');
    const activityTitle = element('h3', '', 'Recent project activity');
    activityTitle.id = 'ovyx-cc-activity-title';
    const viewAll = element('button', 'ovyx-cc-text-action', 'View all projects');
    viewAll.type = 'button';
    viewAll.addEventListener('click', () => window.Router?.go?.('projects'));
    activityHead.append(activityTitle, viewAll);
    const activityList = element('div', 'ovyx-cc-activity-list');
    activityList.id = 'ovyx-cc-activity-list';
    activity.append(activityHead, activityList);

    const side = element('div', 'ovyx-cc-side');
    const status = element('section', 'ovyx-cc-panel ovyx-cc-status');
    status.setAttribute('aria-labelledby', 'ovyx-cc-status-title');
    const statusHead = element('div', 'ovyx-cc-panel-head');
    const statusTitle = element('h3', '', 'Platform status');
    statusTitle.id = 'ovyx-cc-status-title';
    const statusDot = element('span', 'ovyx-cc-status-dot is-checking');
    statusDot.id = 'ovyx-cc-status-dot';
    statusDot.setAttribute('aria-hidden', 'true');
    statusHead.append(statusTitle, statusDot);
    const statusValue = element('strong', 'ovyx-cc-status-value', 'Checking availability…');
    statusValue.id = 'ovyx-cc-status-value';
    const statusDetail = element('p', 'ovyx-cc-status-detail', 'Checking the public platform health endpoint. This does not test every integration.');
    statusDetail.id = 'ovyx-cc-status-detail';
    status.append(statusHead, statusValue, statusDetail);

    const notifications = element('section', 'ovyx-cc-panel ovyx-cc-notifications');
    notifications.setAttribute('aria-labelledby', 'ovyx-cc-notifications-title');
    const notificationHead = element('div', 'ovyx-cc-panel-head');
    const notificationTitle = element('h3', '', 'Notifications');
    notificationTitle.id = 'ovyx-cc-notifications-title';
    const unread = element('span', 'ovyx-cc-unread', '—');
    unread.id = 'ovyx-cc-unread';
    notificationHead.append(notificationTitle, unread);
    const notificationCopy = element('p', 'ovyx-cc-status-detail', 'Important account updates and announcements.');
    const openNotifications = action('Open notifications', 'fa-bell', () => {
      if (window.OVYXAccountNotifications?.open) window.OVYXAccountNotifications.open();
      else byId('ovyx-notification-bell')?.click();
    }, 'ovyx-cc-action-quiet');
    const notificationList = element('div', 'ovyx-cc-notification-list');
    notificationList.id = 'ovyx-cc-notification-list';
    notifications.append(notificationHead, notificationCopy, notificationList, openNotifications);
    side.append(status, notifications);
    lower.append(activity, side);

    const footer = element('div', 'ovyx-cc-footer');
    const quick = element('div', 'ovyx-cc-quick');
    quick.append(
      action('Create project', 'fa-plus', () => window.ProjectStore?.createPromptModal?.(), 'ovyx-cc-action-primary'),
      action('Open Web Studio', 'fa-wand-magic-sparkles', () => window.Router?.go?.('webstudio')),
      action('Open App Studio', 'fa-mobile-screen-button', () => window.Router?.go?.('appstudio'))
    );
    const freshness = element('span', 'ovyx-cc-freshness', 'Workspace figures are based on projects saved in this account.');
    freshness.id = 'ovyx-cc-freshness';
    footer.append(quick, freshness);

    host.append(header, metrics, lower, footer);
    return host;
  }

  function renderMetrics(projects) {
    const total = projects.length;
    const drafts = projects.filter(project => String(project.status || 'draft').toLowerCase() === 'draft').length;
    const pages = projects.reduce((sum, project) => sum + (Array.isArray(project.pages) ? project.pages.length : 0), 0);
    const latest = projects.find(project => dateValue(project.updatedAt));
    const values = {
      projects: [String(total), total === 1 ? '1 saved project in this account' : total + ' saved projects in this account'],
      drafts: [String(drafts), 'Projects currently marked as drafts'],
      pages: [String(pages), 'Saved pages across your projects'],
      latest: [latest ? relativeDate(latest.updatedAt) : '—', latest ? clean(latest.name, 'Untitled project') + ' · ' + formatDate(latest.updatedAt) : 'No project update recorded yet']
    };
    Object.entries(values).forEach(([key, pair]) => {
      const value = byId('ovyx-cc-metric-' + key);
      const detail = byId('ovyx-cc-metric-' + key + '-detail');
      if (value) value.textContent = pair[0];
      if (detail) detail.textContent = pair[1];
    });
  }

  function renderActivity(projects) {
    const list = byId('ovyx-cc-activity-list');
    if (!list) return;
    list.replaceChildren();
    const recent = projects.filter(project => dateValue(project.updatedAt)).slice(0, 4);
    if (!recent.length) {
      const empty = element('div', 'ovyx-cc-empty');
      empty.append(element('strong', '', 'Your activity will appear here'), element('span', '', 'Create a project or make an update to start building your workspace history.'));
      list.appendChild(empty);
      return;
    }
    recent.forEach(project => {
      const row = element('article', 'ovyx-cc-activity-item');
      const marker = element('span', 'ovyx-cc-activity-marker');
      marker.setAttribute('aria-hidden', 'true');
      const copy = element('div', 'ovyx-cc-activity-copy');
      const title = element('strong', '', clean(project.name, 'Untitled project'));
      const meta = element('span', '', 'Last active · ' + relativeDate(project.updatedAt));
      const open = element('button', 'ovyx-cc-open-project', 'Open');
      open.type = 'button';
      open.addEventListener('click', () => {
        const id = String(project.id || '');
        if (id && window.ProjectStore?.open) window.ProjectStore.open(id);
      });
      copy.append(title, meta);
      row.append(marker, copy, open);
      list.appendChild(row);
    });
  }

  function renderNotifications() {
    const node = byId('ovyx-cc-unread');
    if (!node) return;
    const count = window.OVYXAccountNotifications?.unreadCount?.();
    node.textContent = Number.isFinite(Number(count)) ? String(Math.max(0, Number(count))) : '—';
    node.setAttribute('aria-label', Number.isFinite(Number(count)) ? String(Math.max(0, Number(count))) + ' unread notifications' : 'Notification count unavailable');
    const list = byId('ovyx-cc-notification-list');
    if (!list) return;
    list.replaceChildren();
    const recent = window.OVYXAccountNotifications?.recent?.();
    if (!Array.isArray(recent) || !recent.length) {
      list.appendChild(element('div', 'ovyx-cc-notification-empty', 'No recent announcements to show.'));
      return;
    }
    recent.slice(0, 2).forEach(item => {
      const row = element('div', 'ovyx-cc-notification-item' + (item.unread ? ' is-unread' : ''));
      const title = element('strong', '', clean(item.title, 'OVYX Update'));
      const body = element('span', '', clean(item.body, 'New account update'));
      const meta = element('small', '', clean(item.category, 'product').toUpperCase() + ' · ' + relativeDate(item.createdAt));
      row.append(title, body, meta);
      list.appendChild(row);
    });
  }

  function renderWorkspace() {
    const projects = projectList();
    renderMetrics(projects);
    renderActivity(projects);
    renderNotifications();
  }

  async function checkPlatformHealth(force) {
    if (healthRequest) return healthRequest;
    const status = byId('ovyx-cc-status-value');
    const detail = byId('ovyx-cc-status-detail');
    const dot = byId('ovyx-cc-status-dot');
    if (!status || !detail || !dot) return null;
    status.textContent = 'Checking availability…';
    detail.textContent = 'Checking the public platform health endpoint. This does not test every integration.';
    dot.className = 'ovyx-cc-status-dot is-checking';
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS) : null;
    const started = performance.now();
    healthRequest = (async () => {
      try {
        const response = await fetch('/api/health', {
          method: 'GET',
          headers: { Accept: 'application/json' },
          credentials: 'same-origin',
          cache: 'no-store',
          signal: controller ? controller.signal : undefined
        });
        const payload = await response.json().catch(() => ({}));
        const healthy = response.ok && payload?.ok === true && String(payload?.status || '').toLowerCase() === 'healthy';
        const duration = Math.max(0, Math.round(performance.now() - started));
        lastHealth = { healthy, checkedAt: Date.now(), duration };
        status.textContent = healthy ? 'Platform available' : (response.ok ? 'Attention required' : 'Temporarily unavailable');
        detail.textContent = 'Health endpoint responded in ' + duration + ' ms · checked ' + new Date().toLocaleTimeString() + '. This is a platform check, not an integration test.';
        dot.className = 'ovyx-cc-status-dot ' + (healthy ? 'is-healthy' : 'is-warning');
        return lastHealth;
      } catch (error) {
        lastHealth = { healthy: false, checkedAt: Date.now(), duration: Math.max(0, Math.round(performance.now() - started)) };
        status.textContent = 'Status unavailable';
        detail.textContent = String(error?.name === 'AbortError' ? 'The health check timed out.' : 'The platform health check could not be completed.') + ' Please try again.';
        dot.className = 'ovyx-cc-status-dot is-warning';
        return lastHealth;
      } finally {
        clearTimeout(timer);
        healthRequest = null;
      }
    })();
    return healthRequest;
  }

  async function refreshAll(forceHealth) {
    renderWorkspace();
    if (forceHealth || !lastHealth || Date.now() - lastHealth.checkedAt > 60000) await checkPlatformHealth(!!forceHealth);
    const freshness = byId('ovyx-cc-freshness');
    if (freshness) freshness.textContent = 'Workspace figures use this account’s saved projects · refreshed ' + new Date().toLocaleTimeString() + '.';
  }

  function ensureHome() {
    const home = byId('view-home');
    const shell = home?.querySelector('.v59-dashboard-shell');
    const hero = shell?.querySelector('.v59-hero');
    if (!home || !shell || !hero) return;
    let host = byId(HOME_ID);
    if (!host) {
      host = createShell();
      hero.insertAdjacentElement('afterend', host);
    }
    renderWorkspace();
    if (!home.classList.contains('hidden') && window.KernelState?.activeView === 'home') void checkPlatformHealth(false);
  }

  function enhanceAdminOverview() {
    const view = byId('view-admin-overview');
    if (!view || !window.OVYXAdminWorkspace?.isAuthorized?.()) return;
    view.classList.add('ovyx-cc-admin-view');
    const heading = view.querySelector(':scope > div h2');
    const description = view.querySelector(':scope > div p');
    if (heading) heading.textContent = 'Platform Command Centre';
    if (description) description.textContent = 'Owner-only operational overview. Live checks below report only the services and records they actually verify.';
    const projectStat = byId('adm-stat-projects');
    const metrics = projectStat?.closest('.grid');
    if (metrics) {
      projectStat.closest('.v0-card')?.remove();
      const securityCard = Array.from(metrics.children).find(card => /Security Isolate/i.test(card.textContent || ''));
      securityCard?.remove();
      metrics.classList.add('ovyx-cc-admin-metrics');
      const latencyLabel = metrics.querySelector('.v0-card #adm-stat-latency')?.parentElement?.querySelector('div');
      if (latencyLabel) latencyLabel.textContent = 'AI status check';
      const latencyDetail = byId('adm-stat-latency')?.parentElement?.querySelector('div:last-child');
      if (latencyDetail) latencyDetail.textContent = 'Admin availability request';
    }
    const accountCard = byId('ovyx-owner-overview-cards');
    if (accountCard) {
      const accountLabel = Array.from(accountCard.children).find(card => /Accounts/.test(card.querySelector('.ovyx-owner-live-label')?.textContent || ''));
      if (accountLabel) accountLabel.querySelector('.ovyx-owner-live-label').textContent = 'Account sample';
    }
  }

  function installProjectRefreshHook() {
    const store = window.ProjectStore;
    if (!store || typeof store.save !== 'function' || store.__ovyxCommandCentreHook) return;
    const original = store.save.bind(store);
    store.save = function () {
      const result = original();
      window.requestAnimationFrame(() => {
        renderWorkspace();
      });
      return result;
    };
    store.__ovyxCommandCentreHook = true;
  }

  function onViewChanged(event) {
    const route = String(event?.detail?.view || window.KernelState?.activeView || '').replace(/^view-/, '');
    if (route === 'home') {
      ensureHome();
      installProjectRefreshHook();
      void refreshAll(false);
    }
    if (route === 'admin-overview') { enhanceAdminOverview(); window.setTimeout(enhanceAdminOverview, 180); }
  }

  function boot() {
    ensureHome();
    installProjectRefreshHook();
    window.addEventListener('ovyx:view-changed', onViewChanged, { passive: true });
    window.addEventListener('ovyx-owner-state', () => {
      if (window.OVYXAdminWorkspace?.isAuthorized?.()) window.setTimeout(enhanceAdminOverview, 120);
    }, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && window.KernelState?.activeView === 'home') void refreshAll(false);
    }, { passive: true });
    window.addEventListener('focus', () => {
      if (window.KernelState?.activeView === 'home') renderNotifications();
    }, { passive: true });
    window.addEventListener('ovyx:notifications-updated', renderNotifications, { passive: true });
    window.setInterval(() => {
      if (document.hidden || window.KernelState?.activeView !== 'home') return;
      if (!lastHealth || Date.now() - lastHealth.checkedAt > 60000) void checkPlatformHealth(false);
    }, 60000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();

  window.OVYXCommandCentre = Object.freeze({
    refresh: () => refreshAll(true),
    render: renderWorkspace,
    health: () => lastHealth
  });
})();