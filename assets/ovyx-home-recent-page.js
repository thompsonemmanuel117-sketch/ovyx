/* OVYX dashboard declutter — Projects is the single full-library destination. */
(() => {
  'use strict';
  if (window.__OVYX_RECENT_PAGE_V2__) return;
  window.__OVYX_RECENT_PAGE_V2__ = true;

  const $ = (selector, root = document) => root.querySelector(selector);
  const setText = (node, value) => {
    if (node && node.textContent !== value) node.textContent = value;
  };

  function isHome() {
    return String(window.KernelState?.activeView || '').replace(/^view-/, '') === 'home';
  }

  function syncBell() {
    const root = document.getElementById('ovyx-account-notifications-root');
    const bell = document.getElementById('ovyx-notification-bell');
    if (!root || !bell) return;
    // Keep the authenticated Inbox mounted; hide only its floating Home trigger.
    bell.style.setProperty('visibility', isHome() ? 'hidden' : '', 'important');
    bell.style.setProperty('pointer-events', isHome() ? 'none' : '', 'important');
    root.setAttribute('data-ovyx-home-hidden', isHome() ? 'true' : 'false');
  }

  function navSetup() {
    // Projects is the only full-library destination. Remove duplicate sidebar shortcuts.
    document.querySelectorAll('aside nav button[data-nav="recent-projects"], #mobile-drawer button[onclick*="home-recent-anchor"]')
      .forEach(button => button.remove());

    // The dashboard is an overview, not a second launcher for the same tools.
    $('#view-home .v59-workspace-section')?.remove();

    const heading = $('#home-recent-anchor .v59-section-head h2');
    setText(heading, 'Recent websites');

    const eyebrow = $('#home-recent-anchor .v59-section-head .v59-eyebrow');
    setText(eyebrow, 'RECENT');

    const viewAll = $('#home-recent-anchor .v59-section-head button');
    if (viewAll) {
      setText(viewAll, 'View all →');
      viewAll.removeAttribute('onclick');
      viewAll.setAttribute('data-ovyx-open-projects', 'true');
      viewAll.setAttribute('aria-label', 'View all projects');
    }
  }

  function onClick(event) {
    const trigger = event.target?.closest?.('[data-ovyx-open-projects]');
    if (!trigger) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.Router?.go?.('projects');
  }

  function boot() {
    navSetup();
    syncBell();
    document.addEventListener('click', onClick, true);
    window.addEventListener('ovyx:view-changed', () => {
      navSetup();
      syncBell();
    }, { passive: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();

  window.OVYXRecentWebsitesPage = Object.freeze({
    open: () => window.Router?.go?.('projects'),
    sync: () => { navSetup(); syncBell(); }
  });
})();
