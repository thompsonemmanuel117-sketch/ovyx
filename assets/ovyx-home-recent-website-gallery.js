/* OVYX Home dashboard — compact recent website previews.
   Existing project ownership, persistence, navigation, generation and Web Studio runtime remain authoritative. */
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
  function safeImageUrl(value, explicitImage = false) {
    const url = String(value || '').trim();
    if (/^data:image\/(?:png|jpe?g|webp|gif|avif|svg\+xml);/i.test(url)) return url;
    if (!/^https?:\/\//i.test(url)) return '';
    return explicitImage || /\.(?:png|jpe?g|webp|gif|avif|svg)(?:[?#]|$)/i.test(url) ? url : '';
  }
  function suppliedPreview(project) {
    const candidates = [
      [project.previewImage, true], [project.thumbnailUrl, true], [project.thumbnail, true],
      [project.screenshotUrl, true], [project.screenshot, true], [project.coverImage, true],
      [project.ogImage, true], [project.preview?.image, true],
      [project.previewUrl, false], [project.preview?.url, false]
    ];
    const asset = Array.isArray(project.assets)
      ? project.assets.find(item => /image/i.test(String(item?.type || item?.mimeType || '')) && (item?.dataUrl || item?.url || item?.src))
      : null;
    if (asset) candidates.push([asset.dataUrl || asset.url || asset.src, true]);
    for (const [candidate, explicitImage] of candidates) {
      const valid = safeImageUrl(candidate, explicitImage);
      if (valid) return valid;
    }
    return '';
  }
  function isBuiltProject(project) {
    if (!project || typeof project !== 'object') return false;
    const status = String(project.status || project.buildStatus || project.build?.status || '').trim().toLowerCase();
    if (['built', 'published', 'ready', 'complete', 'completed', 'success'].includes(status)) return true;
    if (project.publishedUrl || project.deploymentUrl || project.generatedAt || project.lastBuiltAt
      || project.buildCompletedAt || project.lastBuildAt || project.preview?.generatedAt) return true;
    const pages = Array.isArray(project.pages) ? project.pages : [];
    if (pages.length > 1) return true;
    return pages.some(page => {
      const pageName = String(page?.name || 'Home').trim();
      const sections = Array.isArray(page?.sections) ? page.sections : [];
      if (sections.length > 1) return true;
      return sections.some(section => {
        const content = section?.content && typeof section.content === 'object' ? section.content : {};
        const defaults = new Set([pageName, 'A polished ' + pageName + ' experience generated in OVYX.', 'Get Started']);
        return Object.values(content).some(value => typeof value === 'string' && value.trim() && !defaults.has(value.trim()));
      });
    });
  }
  function previewImage(project) { return isBuiltProject(project) ? suppliedPreview(project) : ''; }
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
  function isPinned(id) { return readPins().has(String(id)); }
  function sortPinned(projects) {
    const pins = readPins();
    return (Array.isArray(projects) ? projects : [])
      .map((project, index) => ({ project, index, updated: timestamp(project) }))
      .sort((a, b) => Number(pins.has(String(b.project?.id))) - Number(pins.has(String(a.project?.id)))
        || b.updated - a.updated || a.index - b.index)
      .map(item => item.project);
  }
  function sortWebsites(projects) {
    return sortPinned((Array.isArray(projects) ? projects : []).filter(isWebsite));
  }
  function card(project) {
    const id = String(project.id || '');
    const name = escapeHtml(project.name || project.pages?.[0]?.name || 'Untitled website');
    const image = escapeHtml(previewImage(project));
    const pinned = isPinned(id);
    const date = formatDate(project);
    const dateText = escapeHtml(date.label);
    const dateIso = escapeHtml(date.iso);
    return '<article class="v59-home-website-card" data-ovyx-website-card="' + escapeHtml(id) + '">' +
      '<button class="v59-home-website-preview" type="button" data-ovyx-website-open="' + escapeHtml(id) + '" aria-label="Open ' + name + '">' +
      (image ? '<img src="' + image + '" alt="Actual preview of ' + name + '" loading="lazy" decoding="async">' :
        '<span class="v59-home-no-preview"><i class="fa-regular fa-image" aria-hidden="true"></i><span>Preview appears after build</span></span>') +
      '<span class="v59-home-preview-open">Open project <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i></span></button>' +
      '<div class="v59-home-website-info"><div class="v59-home-website-title-row"><h3 title="' + name + '">' + name + '</h3>' +
      '<button class="v59-home-pin' + (pinned ? ' is-pinned' : '') + '" type="button" data-ovyx-website-pin="' + escapeHtml(id) + '" aria-label="' + (pinned ? 'Unpin ' : 'Pin ') + name + '" aria-pressed="' + (pinned ? 'true' : 'false') + '" title="' + (pinned ? 'Unpin project' : 'Pin project') + '"><i class="fa-solid fa-thumbtack" aria-hidden="true"></i></button></div>' +
      '<time class="v59-home-website-date"' + (dateIso ? ' datetime="' + dateIso + '"' : '') + '>' + dateText + '</time></div></article>';
  }
  function renderHome() {
    const host = byId('home-projects-grid');
    if (!host) return;
    const store = window.ProjectStore;
    const items = sortWebsites(store?.list?.() || window.KernelState?.projects || []).slice(0, 5);
    if (!items.length) {
      host.innerHTML = '<div class="v59-home-website-empty" role="status"><div><strong>No recent websites</strong></div></div>';
      return;
    }
    host.innerHTML = items.map(card).join('');
  }
  function projectById(id) {
    const projects = window.KernelState?.projects || window.ProjectStore?.list?.() || [];
    return projects.find(project => String(project?.id || '') === String(id)) || null;
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
    try {
      if (typeof window.ProjectStore?.renderProjects === 'function') window.ProjectStore.renderProjects();
      else window.OvyxProjectsUI?.render?.();
    } catch (_) {}
    window.dispatchEvent?.(new CustomEvent('ovyx:project-pins-changed', { detail: { id: String(id), pinned: !wasPinned } }));
    window.showToast?.(wasPinned ? 'Project unpinned.' : 'Project pinned to the top of Projects and Recent Projects.', 'success');
  }
  function handleClick(event) {
    const pin = event.target?.closest?.('[data-ovyx-website-pin], [data-ovyx-project-pin]');
    if (pin) {
      event.preventDefault(); event.stopPropagation();
      togglePin(pin.getAttribute('data-ovyx-website-pin') || pin.getAttribute('data-ovyx-project-pin'));
      return;
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
  function installProjectCardEnhancements(store) {
    if (!store || typeof store.card !== 'function' || store.__ovyxProjectPinCardV1) return;
    const originalCard = store.card;
    store.card = function (project, compact) {
      let markup = originalCard.apply(this, arguments);
      if (typeof markup !== 'string' || !project) return markup;
      const id = String(project.id || '');
      const name = escapeHtml(project.name || 'Untitled project');
      const image = escapeHtml(previewImage(project));
      const pinned = isPinned(id);
      const preview = image
        ? '<div class="ovyx-project-preview has-real-preview"><img src="' + image + '" alt="Actual preview of ' + name + '" loading="lazy" decoding="async"></div>'
        : '<div class="ovyx-project-preview ovyx-project-no-preview"><span class="ovyx-project-no-preview-mark"><i class="fa-regular fa-image" aria-hidden="true"></i></span><span>Preview appears after build</span></div>';
      markup = markup.replace(/<div class="ovyx-project-preview">[\s\S]*?<\/div>/, preview);
      const pinButton = '<button type="button" class="ovyx-project-pin' + (pinned ? ' is-pinned' : '') + '" data-ovyx-project-pin="' + escapeHtml(id) + '" aria-label="' + (pinned ? 'Unpin ' : 'Pin ') + name + '" aria-pressed="' + (pinned ? 'true' : 'false') + '" title="' + (pinned ? 'Unpin project' : 'Pin project') + '"><i class="fa-solid fa-thumbtack" aria-hidden="true"></i><span>' + (pinned ? 'Pinned' : 'Pin') + '</span></button>';
      markup = markup.replace('<div class="ovyx-project-foot">', '<div class="ovyx-project-foot">' + pinButton);
      return markup;
    };
    store.card.__original = originalCard;
    store.__ovyxProjectPinCardV1 = true;
  }
  function installProjectListSorting(store) {
    if (!store || typeof store.list !== 'function' || store.__ovyxProjectPinSortV1) return;
    const originalList = store.list;
    store.list = function () { return sortPinned(originalList.apply(this, arguments)); };
    store.list.__original = originalList;
    store.__ovyxProjectPinSortV1 = true;
  }
  function install() {
    const store = window.ProjectStore;
    if (!store) return false;
    installProjectCardEnhancements(store);
    installProjectListSorting(store);
    if (store.__ovyxHomeRecentWebsiteGalleryV1) return true;
    store.renderHome = renderHome;
    const prompt = byId('prompt-home-input');
    if (prompt) {
      prompt.placeholder = 'Describe what you want to build with OVYX…';
      prompt.setAttribute('aria-label', 'Describe your project');
    }
    const buildLabel = byId('v59-build')?.querySelector?.('span');
    if (buildLabel) buildLabel.textContent = 'Build';
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
  window.OVYXHomeRecentWebsiteGallery = { isWebsite, isBuiltProject, isPinned, sortPinned, sortWebsites, previewImage, formatDate, renderHome, togglePin };
})();