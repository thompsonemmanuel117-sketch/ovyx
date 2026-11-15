(() => {
  'use strict';
  if (window.__OVYX_TEMPLATE_LIBRARY_V1__) return;
  window.__OVYX_TEMPLATE_LIBRARY_V1__ = true;

  const state = {
    items: [], category: 'All', query: '', sort: 'newest',
    pageToken: null, loading: false, error: '', currentTier: 'free',
    templatesEnabled: true, generation: 0
  };
  const $ = id => document.getElementById(id);
  const clean = value => String(value ?? '').trim();
  const escapeHtml = value => clean(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const currentUser = () => {
    try { return window.firebase?.auth?.().currentUser || null; } catch (_) { return null; }
  };
  const isTemplatesView = () => String(window.KernelState?.activeView || '').replace(/^view-/, '') === 'templates';
  const rank = { free: 0, pro: 1, max: 2, root: 3 };
  const categoryNames = { SaaS: 'SaaS', Commerce: 'E-commerce', Portfolio: 'Portfolio' };

  function ensureSurface() {
    const view = $('view-templates');
    const feed = $('templates-catalog-feed');
    if (!view || !feed) return null;
    view.classList.add('ovyx-template-library-ready');
    view.setAttribute('aria-labelledby', 'ovyx-template-library-title');
    const head = view.querySelector('.ovyx-template-library-head');
    if (head) {
      const title = head.querySelector('h3');
      const eyebrow = head.querySelector('.ovyx-eyebrow');
      if (title) { title.id = 'ovyx-template-library-title'; title.textContent = 'Find your next starting point'; }
      if (eyebrow) eyebrow.textContent = 'OVYX / TEMPLATE LIBRARY';
      let description = head.querySelector('.ovyx-template-library-description');
      if (!description) {
        description = document.createElement('p');
        description.className = 'ovyx-template-library-description';
        description.textContent = 'Explore published website foundations, preview what is included, then open a working copy in Web Studio.';
        head.querySelector('div')?.appendChild(description);
      }
    }
    let toolbar = $('ovyx-template-library-toolbar');
    if (!toolbar) {
      toolbar = document.createElement('div');
      toolbar.id = 'ovyx-template-library-toolbar';
      toolbar.className = 'ovyx-template-library-toolbar';
      toolbar.innerHTML =
        '<label class="ovyx-template-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>' +
        '<span class="sr-only">Search templates</span><input id="ovyx-template-search-input" type="search" autocomplete="off" placeholder="Search by name or description" aria-label="Search templates by name or description"></label>' +
        '<label class="ovyx-template-sort"><span>Sort</span><select id="ovyx-template-sort-select" aria-label="Sort templates">' +
        '<option value="newest">Recently updated</option><option value="az">Name: A to Z</option></select></label>' +
        '<span id="ovyx-template-result-count" class="ovyx-template-result-count" aria-live="polite"></span>';
      head?.after(toolbar);
    }
    view.querySelectorAll('[data-template-filter]').forEach(button => {
      button.removeAttribute('onclick');
      if (!button.dataset.ovyxTemplateFilterBound) {
        button.dataset.ovyxTemplateFilterBound = '1';
        button.addEventListener('click', () => setCategory(button.dataset.templateFilter || 'All'));
      }
    });
    const search = $('ovyx-template-search-input');
    if (search && !search.dataset.ovyxBound) {
      search.dataset.ovyxBound = '1';
      search.addEventListener('input', () => { state.query = clean(search.value).toLowerCase(); render(); });
    }
    const sort = $('ovyx-template-sort-select');
    if (sort && !sort.dataset.ovyxBound) {
      sort.dataset.ovyxBound = '1';
      sort.addEventListener('change', () => { state.sort = sort.value === 'az' ? 'az' : 'newest'; render(); });
    }
    if (!feed.dataset.ovyxTemplateObserver && typeof MutationObserver === 'function') {
      const observer = new MutationObserver(() => {
        if (isTemplatesView() && !feed.querySelector('.ovyx-template-cards, .ovyx-template-empty')) render();
      });
      observer.observe(feed, { childList: true });
      feed.dataset.ovyxTemplateObserver = '1';
    }
    if (!feed.dataset.ovyxTemplateLibraryBound) {
      feed.dataset.ovyxTemplateLibraryBound = '1';
      feed.addEventListener('click', event => {
        const button = event.target?.closest?.('button[data-ovyx-template-action]');
        if (!button || !feed.contains(button)) return;
        const action = button.dataset.ovyxTemplateAction;
        if (action === 'preview') openPreview(button.dataset.templateId, button);
        if (action === 'use') useTemplate(button.dataset.templateId);
        if (action === 'more') loadTemplates(true);
        if (action === 'retry') loadTemplates(false);
        if (action === 'clear') {
          state.category = 'All'; state.query = ''; state.sort = 'newest';
          if ($('ovyx-template-search-input')) $('ovyx-template-search-input').value = '';
          if ($('ovyx-template-sort-select')) $('ovyx-template-sort-select').value = 'newest';
          render();
        }
      });
    }
    return { view, feed };
  }

  function parseColor(value) {
    const input = clean(value);
    const hex = input.match(/^#([0-9a-f]{6})$/i);
    if (hex) return [0, 2, 4].map(index => parseInt(hex[1].slice(index, index + 2), 16));
    const rgb = input.match(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
    return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : null;
  }

  function contrastInk(value) {
    const rgb = parseColor(value) || [232, 182, 79];
    const channels = rgb.map(channel => {
      const normalized = channel / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
    });
    const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    const blackContrast = (luminance + 0.05) / 0.05;
    const whiteContrast = 1.05 / (luminance + 0.05);
    return blackContrast >= whiteContrast ? '#090909' : '#F8FAFC';
  }

  function syncThemeAccent() {
    const root = document.documentElement;
    const computed = getComputedStyle(root);
    const theme = window.ThemeContext?.get?.() || null;
    let accent = clean(theme?.accentColor);
    if (/^#f59e0b$/i.test(accent)) accent = root.dataset.ovyxMode === 'light' ? '#806331' : '#C2A36B';
    if (!/^#[0-9a-f]{6}$/i.test(accent)) accent = computed.getPropertyValue('--ovyx-platform-accent').trim() ||
      computed.getPropertyValue('--accent').trim() || '#E8B64F';
    root.style.setProperty('--ovyx-template-action-accent', accent);
    root.style.setProperty('--ovyx-template-action-ink', contrastInk(accent));
  }

  function styles() {
    if ($('ovyx-template-library-styles')) return;
    const style = document.createElement('style');
    style.id = 'ovyx-template-library-styles';
    style.textContent = `
      #view-templates.ovyx-template-library-ready{width:100%;max-width:1480px!important;margin:0 auto;padding:clamp(20px,3vw,42px)!important;min-height:calc(100dvh - 60px);background:var(--bg,#050607)!important;color:var(--text,#f8fafc)!important}
      #view-templates .ovyx-template-library-head{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;flex-wrap:wrap;margin-bottom:14px}
      #view-templates .ovyx-template-library-head h3{margin:8px 0 0;color:var(--text,#f8fafc);font-size:clamp(24px,3vw,36px);font-weight:850;letter-spacing:-.045em;line-height:1.05}
      #view-templates .ovyx-template-library-description{max-width:660px;margin:10px 0 0;color:var(--muted,#94a3b8);font-size:12px;line-height:1.65}
      #view-templates #template-filters{gap:7px!important;align-items:center}
      #view-templates [data-template-filter]{min-height:34px;padding:0 13px!important;border:1px solid var(--border,rgba(255,255,255,.12))!important;border-radius:999px!important;background:var(--card,#0b0d10)!important;color:var(--muted,#94a3b8)!important;font:750 10px/1 Inter,system-ui,sans-serif!important;transition:border-color .16s ease,background .16s ease,color .16s ease}
      #view-templates [data-template-filter].v0-filter-active{border-color:color-mix(in srgb,var(--ovyx-template-action-accent,var(--ovyx-platform-accent,#e8b64f)) 48%,var(--border))!important;background:color-mix(in srgb,var(--ovyx-template-action-accent,var(--ovyx-platform-accent,#e8b64f)) 10%,var(--card))!important;color:var(--text,#fff)!important}
      #view-templates .ovyx-template-library-toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:14px 0 18px}
      #view-templates .ovyx-template-search{display:flex;align-items:center;gap:10px;flex:1 1 280px;min-width:0;min-height:44px;padding:0 13px;border:1px solid var(--border,rgba(255,255,255,.12));border-radius:12px;background:var(--card,#0b0d10);color:var(--muted,#94a3b8)}
      #view-templates .ovyx-template-search:focus-within{border-color:var(--ovyx-template-action-accent,var(--ovyx-platform-accent,#e8b64f));box-shadow:0 0 0 3px color-mix(in srgb,var(--ovyx-template-action-accent,var(--ovyx-platform-accent,#e8b64f)) 12%,transparent)}
      #view-templates .ovyx-template-search input{width:100%;min-width:0;border:0;outline:0;background:transparent;color:var(--text,#fff);font-size:12px}
      #view-templates .ovyx-template-search input::placeholder{color:var(--muted,#94a3b8)}
      #view-templates .ovyx-template-sort{display:flex;align-items:center;gap:8px;min-height:44px;padding:0 11px;border:1px solid var(--border,rgba(255,255,255,.12));border-radius:12px;background:var(--card,#0b0d10);color:var(--muted,#94a3b8);font-size:10px}
      #view-templates .ovyx-template-sort select{max-width:155px;border:0;outline:0;background:transparent;color:var(--text,#fff);font-size:11px}
      #view-templates .ovyx-template-sort option{background:var(--card,#0b0d10);color:var(--text,#fff)}
      #view-templates .ovyx-template-result-count{margin-left:auto;color:var(--muted,#94a3b8);font:700 9px/1.4 ui-monospace,monospace}
      #view-templates .ovyx-template-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
      #view-templates .ovyx-template-card{min-width:0;overflow:hidden;border:1px solid var(--border,rgba(255,255,255,.12));border-radius:17px;background:var(--card,#0b0d10);color:var(--text,#f8fafc);transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease}
      #view-templates .ovyx-template-card:hover{transform:translateY(-3px);border-color:color-mix(in srgb,var(--ovyx-template-action-accent,var(--ovyx-platform-accent,#e8b64f)) 42%,var(--border));box-shadow:0 18px 45px rgba(0,0,0,.18)}
      #view-templates .ovyx-template-card-media{position:relative;display:grid;place-items:center;aspect-ratio:16/10;overflow:hidden;border-bottom:1px solid var(--border,rgba(255,255,255,.1));background:linear-gradient(135deg,var(--bg,#050607),var(--card,#0b0d10))}
      #view-templates .ovyx-template-card-media img,#view-templates .ovyx-template-card-media video{width:100%;height:100%;object-fit:cover;display:block}
      #view-templates .ovyx-template-placeholder{width:100%;height:100%;display:flex;flex-direction:column;justify-content:center;gap:12px;padding:22px;background:radial-gradient(circle at 80% 12%,color-mix(in srgb,var(--template-accent,#e8b64f) 20%,transparent),transparent 48%),linear-gradient(135deg,var(--template-background,#050607),var(--card,#0b0d10))}
      #view-templates .ovyx-template-placeholder-mark{width:36px;height:36px;border:1px solid color-mix(in srgb,var(--template-accent,#e8b64f) 45%,transparent);border-radius:11px;display:grid;place-items:center;color:var(--template-accent,#e8b64f);font-size:18px}
      #view-templates .ovyx-template-placeholder-line{height:7px;border-radius:99px;background:rgba(255,255,255,.28);max-width:72%}
      #view-templates .ovyx-template-placeholder-line.short{max-width:42%;opacity:.55}
      #view-templates .ovyx-template-card-content{padding:15px}
      #view-templates .ovyx-template-card-meta{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;color:var(--muted,#94a3b8);font:750 8px/1.4 ui-monospace,monospace;text-transform:uppercase;letter-spacing:.08em}
      #view-templates .ovyx-template-pill{display:inline-flex;align-items:center;gap:5px;padding:5px 7px;border:1px solid var(--border,rgba(255,255,255,.1));border-radius:999px;background:color-mix(in srgb,var(--card,#0b0d10) 85%,transparent);color:var(--muted,#94a3b8)}
      #view-templates .ovyx-template-card h4{margin:0;color:var(--text,#fff);font-size:14px;font-weight:800;letter-spacing:-.02em;overflow-wrap:anywhere}
      #view-templates .ovyx-template-card p{margin:7px 0 0;color:var(--muted,#94a3b8);font-size:11px;line-height:1.6;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
      #view-templates .ovyx-template-card-stats{display:flex;gap:12px;flex-wrap:wrap;margin-top:12px;color:var(--muted,#94a3b8);font:650 8px/1.4 ui-monospace,monospace}
      #view-templates .ovyx-template-card-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:15px}
      #view-templates .ovyx-template-action{min-height:38px;padding:0 10px;border:1px solid var(--border,rgba(255,255,255,.14));border-radius:9px;background:transparent;color:var(--text,#fff);font-size:10px;font-weight:800;cursor:pointer}
      #view-templates .ovyx-template-action.primary{border-color:var(--ovyx-template-action-accent,var(--ovyx-platform-accent,#e8b64f));background:var(--ovyx-template-action-accent,var(--ovyx-platform-accent,#e8b64f));color:var(--ovyx-template-action-ink,#090909)!important}
      #view-templates .ovyx-template-action:disabled{opacity:.55;cursor:not-allowed}
      #view-templates .ovyx-template-empty{grid-column:1/-1;padding:54px 18px;border:1px dashed var(--border,rgba(255,255,255,.14));border-radius:16px;text-align:center;background:var(--card,#0b0d10)}
      #view-templates .ovyx-template-empty h4{margin:0;color:var(--text,#fff);font-size:15px;font-weight:850}
      #view-templates .ovyx-template-empty p{max-width:520px;margin:8px auto 0;color:var(--muted,#94a3b8);font-size:11px;line-height:1.6}
      #view-templates .ovyx-template-empty button{margin-top:14px;min-height:36px;padding:0 13px;border:1px solid var(--border);border-radius:9px;background:transparent;color:var(--text);font-size:10px;font-weight:800}
      #ovyx-template-preview-backdrop{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:16px;background:rgba(0,0,0,.78);backdrop-filter:blur(14px)}
      #ovyx-template-preview-dialog{width:min(1050px,100%);max-height:min(90dvh,900px);overflow:auto;border:1px solid var(--border,rgba(255,255,255,.16));border-radius:18px;background:var(--card,#0b0d10);color:var(--text,#fff);box-shadow:0 28px 100px rgba(0,0,0,.55)}
      #ovyx-template-preview-dialog header{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 17px;border-bottom:1px solid var(--border,rgba(255,255,255,.1));background:var(--card,#0b0d10)}
      #ovyx-template-preview-dialog header h3{margin:0;font-size:14px;font-weight:850}
      #ovyx-template-preview-dialog header button{width:34px;height:34px;border:1px solid var(--border);border-radius:9px;background:transparent;color:var(--text);font-size:18px}
      #ovyx-template-preview-dialog .ovyx-template-preview-layout{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(220px,.8fr);gap:16px;padding:16px}
      #ovyx-template-preview-dialog .ovyx-template-preview-visual{min-height:260px;overflow:hidden;border:1px solid var(--border);border-radius:12px;background:var(--bg,#050607)}
      #ovyx-template-preview-dialog .ovyx-template-preview-visual img,#ovyx-template-preview-dialog .ovyx-template-preview-visual video{width:100%;height:auto;max-height:65dvh;object-fit:contain;display:block}
      #ovyx-template-preview-dialog .ovyx-template-preview-details h4{margin:0 0 9px;font-size:12px;font-weight:850}
      #ovyx-template-preview-dialog .ovyx-template-preview-details p,#ovyx-template-preview-dialog .ovyx-template-preview-details li{color:var(--muted,#94a3b8);font-size:10px;line-height:1.65}
      #ovyx-template-preview-dialog .ovyx-template-preview-details ul{padding-left:17px}
      #ovyx-template-preview-dialog .ovyx-template-preview-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
      #ovyx-template-preview-dialog .ovyx-template-preview-actions button{min-height:38px;padding:0 12px;border:1px solid var(--border);border-radius:9px;background:transparent;color:var(--text);font-size:10px;font-weight:800}
      #ovyx-template-preview-dialog .ovyx-template-preview-actions button.primary{background:var(--ovyx-template-action-accent,var(--ovyx-platform-accent,#e8b64f));border-color:var(--ovyx-template-action-accent,var(--ovyx-platform-accent,#e8b64f));color:var(--ovyx-template-action-ink,#090909)}
      @media(max-width:900px){#view-templates .ovyx-template-cards{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:640px){#view-templates.ovyx-template-library-ready{padding:18px 14px 90px!important}#view-templates .ovyx-template-library-head{align-items:flex-start;display:block}#view-templates #template-filters{margin-top:16px;overflow-x:auto;flex-wrap:nowrap;padding-bottom:4px}#view-templates #template-filters button{flex:none}#view-templates .ovyx-template-library-toolbar{align-items:stretch}#view-templates .ovyx-template-search{flex-basis:100%}#view-templates .ovyx-template-sort{flex:1}#view-templates .ovyx-template-result-count{margin-left:0}#view-templates .ovyx-template-cards{grid-template-columns:1fr}#ovyx-template-preview-dialog .ovyx-template-preview-layout{grid-template-columns:1fr;padding:12px}#ovyx-template-preview-dialog .ovyx-template-preview-visual{min-height:160px}}
      @media(prefers-reduced-motion:reduce){#view-templates .ovyx-template-card{transition:none}#view-templates .ovyx-template-card:hover{transform:none}}
    `;
    document.head.appendChild(style);
  }

  function visibleItems() {
    let items = state.items.filter(item => state.category === 'All' || item.category === state.category);
    if (state.query) items = items.filter(item =>
      [item.title, item.description, item.category].some(value => clean(value).toLowerCase().includes(state.query))
    );
    items = items.slice();
    if (state.sort === 'az') items.sort((a, b) => clean(a.title).localeCompare(clean(b.title)));
    else items.sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
    return items;
  }

  function placeholder(item) {
    const background = escapeHtml(item.background || '#050607');
    const accent = escapeHtml(item.accent || '#E8B64F');
    return '<div class="ovyx-template-placeholder" style="--template-background:' + background + ';--template-accent:' + accent + '">' +
      '<span class="ovyx-template-placeholder-mark">◇</span><span class="ovyx-template-placeholder-line"></span>' +
      '<span class="ovyx-template-placeholder-line short"></span></div>';
  }

  function mediaMarkup(item, large = false) {
    const url = clean(item.previewUrl);
    if (!url) return placeholder(item);
    const video = /\.(?:mp4|webm|mov)(?:[?#]|$)/i.test(url);
    const cls = large ? 'ovyx-template-preview-media' : '';
    return video
      ? '<video class="' + cls + '" src="' + escapeHtml(url) + '" muted playsinline loop preload="metadata" aria-label="' + escapeHtml(item.title) + ' preview"></video>'
      : '<img class="' + cls + '" src="' + escapeHtml(url) + '" alt="' + escapeHtml(item.title) + ' template preview" loading="lazy" decoding="async" referrerpolicy="no-referrer">';
  }

  function renderEmpty(title, description, action = '') {
    return '<div class="ovyx-template-empty"><h4>' + escapeHtml(title) + '</h4><p>' + escapeHtml(description) + '</p>' + action + '</div>';
  }

  function render() {
    const surface = ensureSurface();
    if (!surface) return;
    styles();
    syncThemeAccent();
    const { feed, view } = surface;
    view.classList.add('v57-templates-ready');
    feed.style.setProperty('visibility', 'visible', 'important');
    const items = visibleItems();
    const count = $('ovyx-template-result-count');
    if (count) count.textContent = state.loading ? 'Updating…' : items.length + (items.length === 1 ? ' template' : ' templates');
    surface.view.querySelectorAll('[data-template-filter]').forEach(button => {
      const active = (button.dataset.templateFilter || 'All') === state.category;
      button.classList.toggle('v0-filter-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    if (state.loading && !state.items.length) {
      feed.innerHTML = renderEmpty('Loading the library', 'Published templates are being retrieved securely for your account.');
      return;
    }
    if (state.error) {
      feed.innerHTML = renderEmpty('The template library could not load', state.error + ' Check your connection and try again.',
        '<button type="button" data-ovyx-template-action="retry">Try again</button>');
      return;
    }
    if (!currentUser()) {
      feed.innerHTML = renderEmpty('Sign in to browse templates', 'Your account access is checked securely before template content is shared.');
      return;
    }
    if (!state.items.length) {
      feed.innerHTML = renderEmpty('No published templates yet', 'New OVYX templates will appear here as they are published.');
      return;
    }
    if (!items.length) {
      feed.innerHTML = renderEmpty('No matching templates', 'Try another search or category, or clear your filters.',
        '<button type="button" data-ovyx-template-action="clear">Clear filters</button>');
      return;
    }
    feed.innerHTML = '<div class="ovyx-template-cards col-span-full">' + items.map(item => {
      const locked = item.locked === true;
      const tier = clean(item.requiredTier || 'free').toUpperCase();
      const pageCount = Array.isArray(item.pages) ? item.pages.length : 0;
      const sectionCount = Array.isArray(item.pages) ? item.pages.reduce((sum, page) => sum + (Array.isArray(page?.[2]) ? page[2].length : 0), 0) : 0;
      return '<article class="ovyx-template-card" data-template-card="' + escapeHtml(item.id) + '">' +
        '<div class="ovyx-template-card-media">' + mediaMarkup(item) + '</div>' +
        '<div class="ovyx-template-card-content"><div class="ovyx-template-card-meta"><span class="ovyx-template-pill">' + escapeHtml(categoryNames[item.category] || item.category) + '</span>' +
        '<span class="ovyx-template-pill">' + (locked ? '<i class="fa-solid fa-lock" aria-hidden="true"></i>' : '') + escapeHtml(tier) + '</span></div>' +
        '<h4>' + escapeHtml(item.title) + '</h4><p>' + escapeHtml(item.description || 'A published OVYX website foundation.') + '</p>' +
        '<div class="ovyx-template-card-stats"><span>' + pageCount + (pageCount === 1 ? ' page' : ' pages') + '</span><span>' + sectionCount + (sectionCount === 1 ? ' section' : ' sections') + '</span></div>' +
        '<div class="ovyx-template-card-actions"><button type="button" class="ovyx-template-action" data-ovyx-template-action="preview" data-template-id="' + escapeHtml(item.id) + '">Preview</button>' +
        '<button type="button" class="ovyx-template-action primary" style="background:var(--ovyx-template-action-accent,var(--ovyx-platform-accent,#e8b64f))!important;border-color:var(--ovyx-template-action-accent,var(--ovyx-platform-accent,#e8b64f))!important;color:var(--ovyx-template-action-ink,#090909)!important" data-ovyx-template-action="use" data-template-id="' + escapeHtml(item.id) + '">' + (locked ? 'View plans' : 'Use template') + '</button></div></div></article>';
    }).join('') + '</div>' +
      (state.pageToken ? '<div class="ovyx-template-more"><button type="button" class="ovyx-template-action" data-ovyx-template-action="more">Load more templates</button></div>' : '');
  }

  async function loadTemplates(append = false) {
    const surface = ensureSurface();
    if (!surface) return;
    const user = currentUser();
    if (!user) { state.generation++; state.loading = false; state.items = []; state.error = ''; state.pageToken = null; render(); return; }
    if (state.loading) return;
    const generation = ++state.generation;
    state.loading = true;
    state.error = '';
    render();
    try {
      const token = await user.getIdToken(false);
      const params = new URLSearchParams({ pageSize: '60' });
      if (append && state.pageToken) params.set('pageToken', state.pageToken);
      const response = await fetch('/api/templates/published?' + params.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
        credentials: 'same-origin', cache: 'no-store'
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error?.message || data?.error || data?.message || ('Request failed (' + response.status + ').'));
      if (generation !== state.generation || currentUser()?.uid !== user.uid) return;
      const incoming = Array.isArray(data.templates) ? data.templates : [];
      const merged = append ? state.items.slice() : [];
      const byId = new Map(merged.map(item => [String(item.id), item]));
      incoming.forEach(item => { if (item?.id) byId.set(String(item.id), item); });
      state.items = Array.from(byId.values());
      state.pageToken = data.nextPageToken || null;
      state.currentTier = clean(data.currentTier || 'free').toLowerCase();
      state.templatesEnabled = data.templatesEnabled !== false;
      render();
    } catch (error) {
      if (generation !== state.generation) return;
      state.error = clean(error?.message) || 'The published catalogue is temporarily unavailable.';
      render();
    } finally {
      if (generation === state.generation) { state.loading = false; render(); }
    }
  }

  function setCategory(category) {
    state.category = ['SaaS', 'Commerce', 'Portfolio'].includes(category) ? category : 'All';
    render();
  }

  function openPreview(id, trigger) {
    const item = state.items.find(template => String(template.id) === String(id));
    if (!item) return;
    $('ovyx-template-preview-backdrop')?.remove();
    const backdrop = document.createElement('div');
    backdrop.id = 'ovyx-template-preview-backdrop';
    backdrop.innerHTML = '<section id="ovyx-template-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="ovyx-template-preview-title" tabindex="-1">' +
      '<header><h3 id="ovyx-template-preview-title">' + escapeHtml(item.title) + '</h3><button type="button" data-close-preview aria-label="Close template preview">×</button></header>' +
      '<div class="ovyx-template-preview-layout"><div class="ovyx-template-preview-visual">' + mediaMarkup(item, true) + '</div>' +
      '<div class="ovyx-template-preview-details"><h4>About this template</h4><p>' + escapeHtml(item.description || 'A published OVYX website foundation.') + '</p>' +
      '<h4>Included pages</h4><ul>' + (Array.isArray(item.pages) && item.pages.length ? item.pages.map(page => '<li>' + escapeHtml(page?.[0] || 'Untitled page') + ' · ' + escapeHtml(page?.[1] || '/') + '</li>').join('') : '<li>Page details are not available.</li>') + '</ul>' +
      '<p>' + (item.locked ? 'This template is included with ' + escapeHtml(item.requiredTier || 'a higher plan') + '. Upgrade to use it.' : 'You can customize the copied project in Web Studio.') + '</p>' +
      '<div class="ovyx-template-preview-actions"><button type="button" data-close-preview>Close</button>' +
      '<button type="button" class="primary" data-preview-use="' + escapeHtml(item.id) + '">' + (item.locked ? 'View plans' : 'Use template') + '</button></div></div></div></section>';
    document.body.appendChild(backdrop);
    let onKey;
    const close = () => { backdrop.remove(); if (onKey) document.removeEventListener('keydown', onKey); trigger?.focus?.(); };
    backdrop.querySelectorAll('[data-close-preview]').forEach(button => button.addEventListener('click', close));
    backdrop.querySelector('[data-preview-use]')?.addEventListener('click', () => { close(); useTemplate(item.id); });
    backdrop.addEventListener('click', event => { if (event.target === backdrop) close(); });
    onKey = event => { if (event.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    $('ovyx-template-preview-dialog')?.focus();
  }

  function useTemplate(id) {
    const item = state.items.find(template => String(template.id) === String(id));
    if (!item) return false;
    if (item.locked === true || state.templatesEnabled !== true) {
      window.Router?.go?.('pricing');
      return false;
    }
    const user = currentUser();
    if (!user || !window.KernelState) {
      window.showToast?.('Sign in before adding a template to your projects.', 'warn');
      return false;
    }
    const now = Date.now();
    const safeId = () => {
      try { return 'proj_tpl_' + crypto.randomUUID().replace(/-/g, '').slice(0, 20); }
      catch (_) { return 'proj_tpl_' + now + '_' + Math.random().toString(36).slice(2, 8); }
    };
    const project = {
      id: safeId(), name: item.title, description: item.description || 'Started from a published OVYX template.',
      status: 'draft', createdAt: now, updatedAt: now,
      pages: (Array.isArray(item.pages) ? item.pages : []).map((page, pageIndex) => ({
        id: 'page_tpl_' + now + '_' + pageIndex,
        name: clean(page?.[0]) || (pageIndex === 0 ? 'Home' : 'Page ' + (pageIndex + 1)),
        slug: clean(page?.[1]) || (pageIndex === 0 ? '/' : '/page-' + (pageIndex + 1)),
        sections: (Array.isArray(page?.[2]) ? page[2] : []).map((section, sectionIndex) => ({
          id: 'section_tpl_' + now + '_' + pageIndex + '_' + sectionIndex,
          type: clean(section?.[0]) || 'section',
          content: clean(section?.[1]),
          styles: {
            background: item.background || '#050607',
            color: '#ffffff',
            accent: item.accent || '#E8B64F',
            padding: '4rem 2rem',
            display: 'flex', flexDirection: 'column', gap: '1rem'
          }
        }))
      })),
      assets: [], revisions: [], templateSource: { id: item.id, title: item.title }
    };
    const store = window.ProjectStore;
    if (!store || typeof store.save !== 'function') {
      window.showToast?.('Project saving is unavailable right now. Please try again.', 'error');
      return false;
    }
    const projects = window.KernelState.projects = Array.isArray(window.KernelState.projects) ? window.KernelState.projects : [];
    const previousActive = window.KernelState.activeProject || null;
    projects.unshift(project);
    window.KernelState.activeProject = project;
    try {
      const saved = store.save();
      if (saved === false) throw new Error('The project save was not accepted.');
    } catch (error) {
      window.KernelState.projects = projects.filter(existing => existing?.id !== project.id);
      window.KernelState.activeProject = previousActive;
      console.warn('[OVYX template library] Project save failed:', error);
      window.showToast?.('The template could not be saved to your Projects. Please try again.', 'error');
      return false;
    }
    window.ProjectCloudSync?.scheduleSyncActive?.(320);
    window.showToast?.('Template added to Projects. Cloud sync is starting.', 'success');
    window.Router?.go?.('webstudio');
    window.WebStudio?.render?.();
    return true;
  }

  function patchLegacyStore() {
    if (window.TemplateStore) {
      window.TemplateStore.items = [];
      window.TemplateStore.filter = setCategory;
      window.TemplateStore.render = render;
      window.TemplateStore.use = useTemplate;
    }
    if (window.OVYXV655) {
      window.OVYXV655.fetchPublishedTemplates = () => loadTemplates(false);
      window.OVYXV655.getPublished = () => state.items.slice();
      window.OVYXV655.setFilter = setCategory;
      window.OVYXV655.render = render;
    }
  }

  function boot() {
    styles();
    syncThemeAccent();
    ensureSurface();
    patchLegacyStore();
    if (isTemplatesView()) loadTemplates(false);
    const auth = (() => { try { return window.firebase?.auth?.(); } catch (_) { return null; } })();
    try {
      auth?.onAuthStateChanged?.(user => {
        state.generation++; state.loading = false; state.items = []; state.pageToken = null; state.error = '';
        if (isTemplatesView() && user) loadTemplates(false);
        else render();
      });
    } catch (_) {}
  }

  window.addEventListener('ovyx:view-changed', event => {
    patchLegacyStore();
    if (String(event.detail?.view || '').replace(/^view-/, '') === 'templates') loadTemplates(false);
  }, { passive: true });
  window.addEventListener('firebase-auth-state-ready', () => {
    state.generation++; state.loading = false; state.items = []; state.pageToken = null; state.error = '';
    if (isTemplatesView()) loadTemplates(false); else render();
  }, { passive: true });
  document.addEventListener('ovyx:theme-applied', syncThemeAccent, { passive: true });
  window.addEventListener('ovyx:templates-changed', () => {
    if (isTemplatesView()) loadTemplates(false);
  }, { passive: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();

  window.OVYXTemplateLibrary = {
    load: loadTemplates, render, filter: setCategory, preview: openPreview, use: useTemplate,
    get state() { return { category: state.category, query: state.query, count: state.items.length, loading: state.loading, error: state.error }; }
  };
})();