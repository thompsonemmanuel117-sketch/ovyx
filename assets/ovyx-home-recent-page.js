/* OVYX Recent — dedicated website-only history page and Home declutter. */
(() => {
  'use strict';
  if (window.__OVYX_RECENT_PAGE_V1__) return;
  window.__OVYX_RECENT_PAGE_V1__ = true;
  const $ = (selector, root = document) => root.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const setText = (node, value) => { if (node && node.textContent !== value) node.textContent = value; };
  let query = '';
  function projects() {
    const store = window.ProjectStore;
    const api = window.OVYXHomeRecentWebsiteGallery;
    return (api?.sortWebsites?.(store?.list?.() || window.KernelState?.projects || []) || [])
      .filter(project => api?.isWebsite?.(project));
  }
  function ensureView() {
    const viewport = document.getElementById('view-router-viewport');
    if (!viewport) return null;
    let view = document.getElementById('view-recent');
    if (view) return view;
    view = document.createElement('section');
    view.id = 'view-recent';
    view.className = 'ovyx-recent-view hidden';
    view.setAttribute('aria-label', 'Recent websites');
    view.setAttribute('aria-hidden', 'true');
    view.innerHTML = '<div class="ovyx-recent-wrap"><header class="ovyx-recent-header"><div><span class="ovyx-recent-kicker">OVYX / RECENT</span><h1>Recent</h1><p>Your websites, in the order you last worked on them.</p></div><label class="ovyx-recent-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input id="ovyx-recent-search" type="search" placeholder="Search websites…" aria-label="Search recent websites"></label></header><div class="ovyx-recent-count" id="ovyx-recent-count" aria-live="polite"></div><div class="ovyx-recent-grid" id="ovyx-recent-grid"></div></div>';
    viewport.appendChild(view);
    const input = document.getElementById('ovyx-recent-search');
    input?.addEventListener('input', () => { query = input.value.trim().toLocaleLowerCase(); render(); });
    return view;
  }
  function render() {
    if (!ensureView()) return;
    const api = window.OVYXHomeRecentWebsiteGallery;
    const grid = document.getElementById('ovyx-recent-grid');
    const count = document.getElementById('ovyx-recent-count');
    if (!grid || !api) return;
    const all = projects();
    const filtered = all.filter(project => String(project.name || project.pages?.[0]?.name || 'Untitled website').toLocaleLowerCase().includes(query));
    if (count) count.textContent = query ? filtered.length + ' of ' + all.length + ' websites' : all.length + (all.length === 1 ? ' website' : ' websites');
    if (!filtered.length) {
      grid.innerHTML = '<div class="ovyx-recent-empty">' + (all.length ? 'No websites match that search.' : 'Your built websites will appear here.') + '</div>';
      return;
    }
    grid.innerHTML = filtered.map(project => {
      const id = esc(project.id || '');
      const name = esc(project.name || project.pages?.[0]?.name || 'Untitled website');
      const preview = esc(api.previewImage(project));
      const date = api.formatDate(project);
      return '<article class="v59-home-website-card ovyx-recent-card"><button class="v59-home-website-preview" type="button" data-ovyx-recent-open="' + id + '" aria-label="Open ' + name + '"><img src="' + preview + '" alt="Preview of ' + name + '" loading="lazy" decoding="async"><span class="v59-home-preview-open">Open website <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i></span></button><div class="v59-home-website-info"><h2>' + name + '</h2><time class="v59-home-website-date"' + (date.iso ? ' datetime="' + esc(date.iso) + '"' : '') + '>' + esc(date.label) + '</time></div></article>';
    }).join('');
  }
  function isHome() {
    return String(window.KernelState?.activeView || '').replace(/^view-/,'') === 'home';
  }
  function syncBell() {
    const root = document.getElementById('ovyx-account-notifications-root');
    const bell = document.getElementById('ovyx-notification-bell');
    if (!root || !bell) return;
    // Hide only the floating trigger on Home. Keep the root mounted and visible
    // so the authenticated Inbox panel can still open from its existing entry point.
    bell.style.setProperty('visibility', isHome() ? 'hidden' : '', 'important');
    bell.style.setProperty('pointer-events', isHome() ? 'none' : '', 'important');
    root.setAttribute('data-ovyx-home-hidden', isHome() ? 'true' : 'false');
  }
  function navSetup() {
    document.querySelectorAll('aside nav button[data-nav="recent-projects"]').forEach(button => {
      button.dataset.nav = 'recent';
      const title = button.querySelector('.ovyx-nav-copy b'); setText(title, 'Recent');
      const subtitle = button.querySelector('.ovyx-nav-copy small'); setText(subtitle, 'Your built websites');
      if (button.getAttribute('onclick') !== "Router.go('recent')") button.setAttribute('onclick', "Router.go('recent')");
    });
    document.querySelectorAll('#mobile-drawer button[onclick*="home-recent-anchor"]').forEach(button => {
      if (button.getAttribute('data-mobile-nav') !== 'recent') button.setAttribute('data-mobile-nav', 'recent');
      if (button.getAttribute('onclick') !== "Router.go('recent'); MobileDrawer.close()") button.setAttribute('onclick', "Router.go('recent'); MobileDrawer.close()");
      const small = button.querySelector('small'); setText(small, 'Your built websites');
      const span = button.querySelector('span'); if (span && span.firstChild?.nodeType === 3 && span.firstChild.textContent !== 'Recent') span.firstChild.textContent = 'Recent';
    });
    const heading = $('#home-recent-anchor .v59-section-head h2'); setText(heading, 'Recent');
    const viewAll = $('#home-recent-anchor .v59-section-head button');
    if (viewAll) { setText(viewAll, 'View all →'); if (viewAll.getAttribute('data-ovyx-open-recent') !== 'true') viewAll.setAttribute('data-ovyx-open-recent', 'true'); if (viewAll.hasAttribute('onclick')) viewAll.removeAttribute('onclick'); }
  }
  function onClick(event) {
    const nav = event.target?.closest?.('button[data-nav="recent"],button[data-mobile-nav="recent"],[data-ovyx-open-recent]');
    if (nav) {
      event.preventDefault(); event.stopImmediatePropagation();
      ensureView(); render(); window.Router?.go?.('recent'); return;
    }
    const open = event.target?.closest?.('[data-ovyx-recent-open]');
    if (open) {
      event.preventDefault(); event.stopPropagation();
      const id = open.getAttribute('data-ovyx-recent-open');
      const exists = (window.KernelState?.projects || []).some(project => String(project.id || '') === String(id));
      if (exists) window.ProjectStore?.open?.(id);
      else window.showToast?.('This website could not be found. Refresh your projects and try again.', 'error');
    }
  }
  function boot() {
    ensureView(); navSetup(); syncBell();
    document.addEventListener('click', onClick, true);
    window.addEventListener('ovyx:view-changed', () => { navSetup(); syncBell(); if (String(window.KernelState?.activeView) === 'recent') render(); }, { passive: true });
    const modeLabel = $('.v59-model-label');
    if (modeLabel) modeLabel.hidden = true;
    const selector = document.getElementById('v59-ai-mode-select');
    if (selector) Array.from(selector.options).forEach(option => { option.textContent = option.textContent.replace(/^OVYX\s+/i, ''); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
  window.OVYXRecentWebsitesPage = Object.freeze({ render, projects, open: () => { ensureView(); render(); window.Router?.go?.('recent'); } });
})();
