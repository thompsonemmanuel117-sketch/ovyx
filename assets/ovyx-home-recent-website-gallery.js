/* OVYX Home dashboard — visual website gallery.
   Home-only presentation and local pin preferences; existing project ownership,
   persistence, navigation, generation and Web Studio runtime remain authoritative. */
(() => {
  'use strict';
  if (window.__OVYX_HOME_RECENT_WEBSITE_GALLERY_V1__) return;
  window.__OVYX_HOME_RECENT_WEBSITE_GALLERY_V1__ = true;
  const byId = id => document.getElementById(id);
  const PIN_KEY = 'ovyx.home-pinned-websites.v1';
  let memoryPins = [];
  function uid() {
    try { return String(window.firebase?.auth?.().currentUser?.uid || '').trim() || 'guest'; }
    catch (_) { return 'guest'; }
  }
  function pinStorageKey() { return PIN_KEY + '.' + uid(); }
  function readPins() {
    try {
      const parsed = JSON.parse(localStorage.getItem(pinStorageKey()) || '[]');
      if (Array.isArray(parsed)) memoryPins = parsed.map(String);
    } catch (_) {}
    return new Set(memoryPins);
  }
  function writePins(pins) {
    memoryPins = Array.from(pins);
    try { localStorage.setItem(pinStorageKey(), JSON.stringify(memoryPins)); } catch (_) {}
  }
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }
  function timestamp(project) {
    const raw = project?.updatedAt ?? project?.modifiedAt ?? project?.updated_at
      ?? project?.createdAt ?? project?.created_at ?? 0;
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    const value = String(raw || '').trim();
    if (!value) return 0;
    if (/^\d+(?:\.\d+)?$/.test(value)) return Number(value) || 0;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  function isWebsite(project) {
    if (!project || typeof project !== 'object') return false;
    const type = [
      project.type, project.kind, project.projectType, project.project_type,
      project.category, project.builderType, project.target
    ].filter(Boolean).join(' ').toLowerCase();
    if (/\b(app|mobile|ios|android|desktop|game)\b/.test(type)) return false;
    return Array.isArray(project.pages) && project.pages.length > 0;
  }
  function safeImageUrl(value) {
    const url = String(value || '').trim();
    return /^(https?:\/\/|data:image\/(?:png|jpe?g|webp|gif|avif|svg\+xml);)/i.test(url) ? url : '';
  }
  function suppliedPreview(project) {
    const candidates = [
      project.previewImage, project.previewUrl, project.thumbnailUrl, project.thumbnail,
      project.screenshotUrl, project.screenshot, project.coverImage, project.ogImage,
      project.preview?.image, project.preview?.url
    ];
    const asset = Array.isArray(project.assets)
      ? project.assets.find(item => /image/i.test(String(item?.type || item?.mimeType || '')) && (item?.dataUrl || item?.url || item?.src))
      : null;
    if (asset) candidates.push(asset.dataUrl, asset.url, asset.src);
    for (const candidate of candidates) {
      const valid = safeImageUrl(candidate);
      if (valid) return valid;
    }
    return '';
  }
  function svgPreview(project) {
    const page = project?.pages?.[0] || {};
    const section = page?.sections?.[0] || {};
    const content = section.content || {};
    const styles = section.styles || {};
    const title = String(content.heading || page.name || project.name || 'Your website').slice(0, 48);
    const subtitle = String(content.subheading || content.description || 'A website created with OVYX').slice(0, 92);
    const bg = /^#[0-9a-f]{3,8}$/i.test(String(styles.background || '')) ? styles.background : '#111827';
    const fg = /^#[0-9a-f]{3,8}$/i.test(String(styles.color || '')) ? styles.color : '#f8fafc';
    const esc = value => String(value).replace(/[&<>"']/g, char => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    })[char]);
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">' +
      '<rect width="960" height="540" fill="#090b10"/><rect x="26" y="24" width="908" height="492" rx="18" fill="' + bg + '"/>' +
      '<rect x="26" y="24" width="908" height="42" rx="18" fill="#080a0e" opacity=".92"/>' +
      '<circle cx="52" cy="45" r="5" fill="#f87171"/><circle cx="72" cy="45" r="5" fill="#fbbf24"/><circle cx="92" cy="45" r="5" fill="#34d399"/>' +
      '<rect x="350" y="35" width="260" height="18" rx="9" fill="#ffffff" opacity=".09"/>' +
      '<rect x="78" y="130" width="804" height="310" rx="12" fill="#ffffff" opacity=".035"/>' +
      '<text x="480" y="242" text-anchor="middle" font-family="Arial,sans-serif" font-size="44" font-weight="700" fill="' + fg + '">' + esc(title) + '</text>' +
      '<text x="480" y="292" text-anchor="middle" font-family="Arial,sans-serif" font-size="19" fill="' + fg + '" opacity=".72">' + esc(subtitle) + '</text>' +
      '<rect x="390" y="340" width="180" height="48" rx="10" fill="#c2a36b"/>' +
      '<text x="480" y="370" text-anchor="middle" font-family="Arial,sans-serif" font-size="15" font-weight="700" fill="#101010">' + esc(content.cta || 'Explore') + '</text></svg>';
    return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
  }
  function previewImage(project) { return suppliedPreview(project) || svgPreview(project); }
  function formatDate(project) {
    const value = timestamp(project);
    if (!value) return { iso: '', label: 'Date not available' };
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return { iso: '', label: 'Date not available' };
    return {
      iso: date.toISOString(),
      label: new Intl.DateTimeFormat(undefined, {
        month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
      }).format(date)
    };
  }
  function sortWebsites(projects) {
    const pins = readPins();
    return (Array.isArray(projects) ? projects : [])
      .filter(isWebsite)
      .map((project, index) => ({ project, index, updated: timestamp(project), pinned: pins.has(String(project.id)) }))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated - a.updated || a.index - b.index)
      .map(item => item.project);
  }
  function card(project) {
    const id = String(project.id || '');
    const pinned = readPins().has(id);
    const name = escapeHtml(project.name || project.pages?.[0]?.name || 'Untitled website');
    const image = escapeHtml(previewImage(project));
    const date = formatDate(project);
    const dateText = escapeHtml(date.label);
    const dateIso = escapeHtml(date.iso);
    return '<article class="v59-home-website-card" data-ovyx-website-card="' + escapeHtml(id) + '">' +
      '<button class="v59-home-website-preview" type="button" data-ovyx-website-open="' + escapeHtml(id) + '" aria-label="Open ' + name + '">' +
      '<img src="' + image + '" alt="Preview of ' + name + '" loading="lazy" decoding="async">' +
      '<span class="v59-home-preview-open">Open website <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i></span></button>' +
      '<div class="v59-home-website-info"><div class="v59-home-website-title-row"><h3 title="' + name + '">' + name + '</h3>' +
      '<button class="v59-home-pin' + (pinned ? ' is-pinned' : '') + '" type="button" data-ovyx-website-pin="' + escapeHtml(id) +
      '" aria-pressed="' + (pinned ? 'true' : 'false') + '" aria-label="' + (pinned ? 'Unpin' : 'Pin') + ' ' + name +
      '" title="' + (pinned ? 'Unpin website' : 'Pin website') + '"><i class="fa-solid fa-thumbtack" aria-hidden="true"></i></button></div>' +
      '<time class="v59-home-website-date"' + (dateIso ? ' datetime="' + dateIso + '"' : '') + '>' + dateText + '</time>' +
      '<div class="v59-home-website-actions"><button type="button" data-ovyx-website-open="' + escapeHtml(id) +
      '"><i class="fa-solid fa-pen-to-square" aria-hidden="true"></i> Edit website</button></div></div></article>';
  }
  function renderHome() {
    const host = byId('home-projects-grid');
    if (!host) return;
    const store = window.ProjectStore;
    const items = sortWebsites(store?.list?.() || window.KernelState?.projects || []).slice(0, 3);
    if (!items.length) {
      host.innerHTML = '<div class="v59-home-website-empty" role="status"><span class="v59-home-website-empty-mark" aria-hidden="true">◇</span>' +
        '<div><strong>Your websites will appear here</strong><p>Build your first website and its visual preview will show up in Recent Projects.</p></div>' +
        '<button type="button" data-ovyx-home-create>Start building <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button></div>';
      return;
    }
    host.innerHTML = items.map(card).join('');
  }
  function projectById(id) {
    return (window.KernelState?.projects || []).find(project => String(project?.id || '') === String(id)) || null;
  }
  function openProject(id) {
    if (!projectById(id)) {
      window.showToast?.('This website could not be found. Refresh your projects and try again.', 'error');
      return;
    }
    window.ProjectStore?.open?.(id);
  }
  function togglePin(id) {
    const project = projectById(id);
    if (!project || !isWebsite(project)) return;
    const pins = readPins();
    const wasPinned = pins.has(String(id));
    if (wasPinned) pins.delete(String(id));
    else pins.add(String(id));
    writePins(pins);
    renderHome();
    window.showToast?.(wasPinned ? 'Website unpinned.' : 'Website pinned to the top of Recent Projects.', 'success');
  }
  function handleClick(event) {
    const pin = event.target?.closest?.('[data-ovyx-website-pin]');
    if (pin) {
      event.preventDefault(); event.stopPropagation();
      togglePin(pin.getAttribute('data-ovyx-website-pin')); return;
    }
    const open = event.target?.closest?.('[data-ovyx-website-open]');
    if (open) {
      event.preventDefault(); event.stopPropagation();
      openProject(open.getAttribute('data-ovyx-website-open')); return;
    }
    const create = event.target?.closest?.('[data-ovyx-home-create]');
    if (create) {
      event.preventDefault();
      if (typeof window.ProjectStore?.createPromptModal === 'function') window.ProjectStore.createPromptModal();
      else window.Router?.go?.('projects');
    }
  }
  function install() {
    const store = window.ProjectStore;
    if (!store || store.__ovyxHomeRecentWebsiteGalleryV1) return false;
    store.renderHome = renderHome;
    store.__ovyxHomeRecentWebsiteGalleryV1 = true;
    document.addEventListener('click', handleClick);
    renderHome();
    return true;
  }
  function boot() {
    if (install()) return;
    let attempts = 0;
    const retry = () => { if (install() || ++attempts >= 20) return; setTimeout(retry, 50); };
    retry();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
  window.OVYXHomeRecentWebsiteGallery = { isWebsite, sortWebsites, previewImage, formatDate, renderHome, togglePin };
})();