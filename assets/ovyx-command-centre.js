(() => {
  'use strict';
  if (window.__OVYX_COMMAND_CENTRE_V1__) return;
  window.__OVYX_COMMAND_CENTRE_V1__ = true;

  const byId = id => document.getElementById(id);

  // Remove any stale copy left by an older cached runtime. The Home dashboard
  // now relies on its original built-in overview and does not mount a second one.
  function removeDuplicateHomeOverview() {
    byId('ovyx-command-centre')?.remove();
  }

  function enhanceAdminOverview() {
    const view = byId('view-admin-overview');
    if (!view || !window.OVYXAdminWorkspace?.isAuthorized?.()) return;
    view.classList.add('ovyx-cc-admin-view');
    const heading = view.querySelector(':scope > div h2');
    const description = view.querySelector(':scope > div p');
    if (heading) heading.textContent = 'Platform Command Centre';
    if (description) description.textContent = 'Owner-only operational overview. Live checks below report only the services and records they actually verify.';
    const headingWrap = heading?.parentElement;
    if (headingWrap) {
      headingWrap.classList.add('ovyx-cc-admin-heading');
      if (view.firstElementChild !== headingWrap) view.insertBefore(headingWrap, view.firstElementChild);
    }
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

  function onViewChanged(event) {
    const route = String(event?.detail?.view || window.KernelState?.activeView || '').replace(/^view-/, '');
    if (route === 'home') removeDuplicateHomeOverview();
    if (route === 'admin-overview') {
      enhanceAdminOverview();
      window.setTimeout(enhanceAdminOverview, 180);
    }
  }

  function boot() {
    removeDuplicateHomeOverview();
    window.addEventListener('ovyx:view-changed', onViewChanged, { passive: true });
    window.addEventListener('ovyx-owner-state', () => {
      if (window.OVYXAdminWorkspace?.isAuthorized?.()) window.setTimeout(enhanceAdminOverview, 120);
    }, { passive: true });
    if (String(window.KernelState?.activeView || '').replace(/^view-/, '') === 'admin-overview') {
      enhanceAdminOverview();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
