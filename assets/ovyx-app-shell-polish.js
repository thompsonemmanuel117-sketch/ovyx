// OVYX App Shell polish runtime v1.0.1 — contrast-safe appearance, compact App Studio spacing, integrated Home dock.
(function () {
  'use strict';
  if (window.__OVYX_APP_SHELL_POLISH_V1__) return;
  window.__OVYX_APP_SHELL_POLISH_V1__ = true;

  const THEME_LAB_KEY = 'ovyx.theme.lab.v1';
  let contrastNoticeShown = false;

  function hex(value, fallback) {
    const candidate = String(value || '').trim();
    return /^#[0-9a-f]{6}$/i.test(candidate) ? candidate.toUpperCase() : fallback;
  }

  function rgb(value) {
    const color = hex(value, '#000000').slice(1);
    return [0, 2, 4].map(index => parseInt(color.slice(index, index + 2), 16) / 255)
      .map(channel => channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4));
  }

  function luminance(value) {
    const channels = rgb(value);
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  }

  function contrast(a, b) {
    const first = luminance(a);
    const second = luminance(b);
    return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
  }

  function minimumContrast(candidate, surfaces) {
    return Math.min.apply(null, surfaces.map(surface => contrast(candidate, surface)));
  }

  function bestColor(candidates, surfaces) {
    return candidates.map(color => hex(color, '#FFFFFF'))
      .sort((a, b) => minimumContrast(b, surfaces) - minimumContrast(a, surfaces))[0];
  }

  function contrastSafeTheme(theme) {
    const next = Object.assign({}, theme || {});
    const background = hex(next.backgroundColor, '#050607');
    const card = hex(next.cardColor, '#0B0D10');
    const surfaces = [background, card];
    const originalText = hex(next.textColor, '#F8FAFC');
    const originalMuted = hex(next.mutedColor, '#94A3B8');
    const originalAccent = hex(next.accentColor, '#E8B64F');
    const originalBorder = hex(next.borderColor, '#1B222A');
    let corrected = false;

    next.backgroundColor = background;
    next.cardColor = card;
    next.sidebarColor = hex(next.sidebarColor, background);

    if (minimumContrast(originalText, surfaces) < 4.5) {
      next.textColor = bestColor(['#FFFFFF', '#111827'], surfaces);
      corrected = true;
    } else next.textColor = originalText;

    if (minimumContrast(originalMuted, surfaces) < 4.5) {
      next.mutedColor = bestColor(['#94A3B8', '#64748B', '#475569', next.textColor], surfaces);
      corrected = true;
    } else next.mutedColor = originalMuted;

    if (minimumContrast(originalAccent, surfaces) < 3) {
      next.accentColor = bestColor([originalAccent, '#E8B64F', '#D97706', '#6FD7FF', '#B99CFF', '#FFFFFF', '#111827'], surfaces);
      corrected = true;
    } else next.accentColor = originalAccent;

    if (minimumContrast(originalBorder, [card]) < 1.5) {
      next.borderColor = bestColor(['#475569', '#64748B', '#CBD5E1', '#334155'], [card]);
      corrected = true;
    } else next.borderColor = originalBorder;

    if (corrected) {
      document.documentElement.dataset.ovyxContrastAdjusted = 'true';
      if (!contrastNoticeShown) {
        contrastNoticeShown = true;
        try { window.showToast?.('A few theme colours were adjusted to keep text and controls readable.', 'info'); } catch (_) {}
      }
    } else {
      delete document.documentElement.dataset.ovyxContrastAdjusted;
      contrastNoticeShown = false;
    }
    return next;
  }

  function applyEffectiveTheme(theme) {
    const safe = contrastSafeTheme(theme || {});
    const root = document.documentElement;
    const variables = {
      '--bg': safe.backgroundColor, '--app-bg': safe.backgroundColor,
      '--sidebar': safe.sidebarColor, '--card': safe.cardColor,
      '--border': safe.borderColor, '--text': safe.textColor,
      '--muted': safe.mutedColor, '--accent': safe.accentColor,
      '--app-border': safe.borderColor, '--app-text': safe.textColor,
      '--app-muted': safe.mutedColor, '--app-accent': safe.accentColor,
      '--black-canvas': safe.backgroundColor, '--graphite': safe.cardColor,
      '--titanium': safe.borderColor, '--soft-white': safe.textColor,
      '--steel': safe.mutedColor, '--ovyx-canvas': safe.backgroundColor,
      '--ovyx-graphite': safe.cardColor, '--ovyx-titanium': safe.borderColor,
      '--ovyx-white': safe.textColor, '--ovyx-steel': safe.mutedColor,
      '--ovyx-gold': safe.accentColor, '--ov-bg': safe.backgroundColor,
      '--ov-panel': safe.cardColor, '--ov-elev': safe.cardColor,
      '--ov-text': safe.textColor, '--ov-secondary': safe.mutedColor,
      '--ov-muted': safe.mutedColor, '--ov-border': safe.borderColor,
      '--ov-accent': safe.accentColor
    };
    Object.keys(variables).forEach(key => root.style.setProperty(key, variables[key]));
    root.style.backgroundColor = safe.backgroundColor;
    [document.body, document.getElementById('app-container'), document.getElementById('app-root'),
      document.getElementById('main-content'), document.getElementById('view-router-viewport')]
      .filter(Boolean).forEach(element => {
        element.style.setProperty('background-color', safe.backgroundColor, 'important');
        element.style.setProperty('color', safe.textColor, 'important');
      });
    [document.getElementById('app-sidebar'), document.getElementById('mobile-drawer')]
      .filter(Boolean).forEach(element => element.style.setProperty('background-color', safe.sidebarColor, 'important'));
    return safe;
  }

  function installThemeBridge() {
    const context = window.ThemeContext;
    const lab = window.OVYXThemeLab;
    if (!context || !lab || typeof context.get !== 'function' || typeof context.preview !== 'function') return false;
    if (context.__ovyxContrastBridgeV1) return true;

    // Keep canonical saved/exported colors untouched. Only the effective CSS
    // surface is adjusted after ThemeContext applies the user's original values.
    document.addEventListener('ovyx:theme-applied', function (event) {
      applyEffectiveTheme(event.detail?.effective || context.get());
    });
    applyEffectiveTheme(context.get());
    context.__ovyxContrastBridgeV1 = true;

    const originalApply = typeof lab.apply === 'function' ? lab.apply.bind(lab) : null;
    lab.apply = function () {
      const theme = typeof lab.activeTheme === 'function' ? lab.activeTheme() : null;
      if (!theme) return originalApply ? originalApply() : false;
      const current = context.get();
      const mapped = Object.assign({}, current, {
        backgroundColor: hex(theme.bg, current.backgroundColor || '#050607'),
        sidebarColor: hex(theme.bg, current.sidebarColor || '#050607'),
        cardColor: hex(theme.panel, current.cardColor || '#0B0D10'),
        textColor: hex(theme.text, current.textColor || '#F8FAFC'),
        mutedColor: hex(theme.muted || theme.secondary, current.mutedColor || '#94A3B8'),
        accentColor: hex(theme.accent, current.accentColor || '#E8B64F'),
        borderColor: hex(theme.border, current.borderColor || '#1B222A'),
        mode: luminance(hex(theme.bg, '#050607')) > 0.45 ? 'light' : 'dark'
      });
      context.preview(mapped);
      try { lab.renderState?.(); } catch (_) {}
      return true;
    };

    // Theme Lab exports the canonical ThemeContext field names, while
    // older custom-theme records use bg/panel/text/accent. Accept both formats
    // so an exported theme can always be imported back as a new Custom entry.
    const originalImport = typeof lab.import === 'function' ? lab.import.bind(lab) : null;
    lab.import = function () {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json,.json';
      input.style.position = 'fixed';
      input.style.left = '-10000px';
      input.style.width = '1px';
      input.style.height = '1px';
      // Keep the chooser attached while the browser dispatches its change event.
      document.body.appendChild(input);
      input.addEventListener('cancel', function () { input.remove(); }, { once: true });
      input.onchange = function () {
        const file = input.files && input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function () {
          try {
            const source = JSON.parse(reader.result);
            if (!source || typeof source !== 'object' || Array.isArray(source)) {
              throw new Error('Invalid OVYX theme schema.');
            }
            const imported = {
              name: String(source.name || 'Imported Theme').replace(/[\\u0000-\\u001f\\u007f]/g, ' ').trim().slice(0, 48) || 'Imported Theme',
              bg: source.bg || source.backgroundColor,
              panel: source.panel || source.cardColor,
              elev: source.elev || source.elevationColor || source.cardColor || source.panel,
              text: source.text || source.textColor,
              secondary: source.secondary || source.mutedColor || source.textColor,
              muted: source.muted || source.mutedColor || source.secondary,
              accent: source.accent || source.accentColor,
              border: source.border || source.borderColor
            };
            const validColor = value => typeof value === 'string' && value.length <= 48
              && !/[;{}]/.test(value) && !/(?:url|var)\s*\(/i.test(value)
              && window.CSS?.supports?.('color', value) === true;
            if (!['bg', 'panel', 'elev', 'text', 'secondary', 'muted', 'accent'].every(key => validColor(imported[key]))) {
              throw new Error('Invalid OVYX theme schema.');
            }
            const stem = 'custom_' + imported.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 28) + '_' + Date.now().toString(36);
            let id = stem;
            let suffix = 2;
            while (lab.state.customThemes && lab.state.customThemes[id]) id = stem + '_' + suffix++;
            lab.state.custom = Object.assign({}, lab.state.custom || {}, imported);
            lab.state.customThemes = Object.assign({}, lab.state.customThemes || {}, { [id]: imported });
            lab.state.active = id;
            localStorage.setItem(THEME_LAB_KEY, JSON.stringify(lab.state));
            lab.apply();
            try { lab.renderState?.(); } catch (_) {}
            try { window.OVYXSettings?.renderThemeCards?.(); } catch (_) {}
            try { window.showToast?.('Theme imported.', 'success'); } catch (_) {}
          } catch (error) {
            try { window.showToast?.(error.message || 'Theme import failed.', 'error'); } catch (_) {}
            const status = document.getElementById('settings-save-status');
            if (status) status.textContent = 'Theme import failed: ' + (error.message || 'Invalid theme file.');
          }
          input.remove();
        };
        reader.onerror = function () {
          try { window.showToast?.('Theme import failed while reading the file.', 'error'); } catch (_) {}
          const status = document.getElementById('settings-save-status');
          if (status) status.textContent = 'Theme import failed while reading the file.';
          input.remove();
        };
        reader.readAsText(file);
      };
      input.click();
    };
    lab.set = function (id) {
      this.state.active = String(id || 'obsidian');
      try { localStorage.setItem(THEME_LAB_KEY, JSON.stringify(this.state)); } catch (_) {}
      this.apply();
      try { window.showToast?.('Theme preview applied. Save Appearance to keep it.', 'info'); } catch (_) {}
      return this.state.active;
    };

    window.addEventListener('ovyx:theme-applied', function (event) {
      if (event.detail?.reason === 'save') {
        try {
          const active = lab.state?.active || 'obsidian';
          const state = JSON.parse(localStorage.getItem(THEME_LAB_KEY) || '{}');
          state.active = active;
          localStorage.setItem(THEME_LAB_KEY, JSON.stringify(Object.assign({}, state, lab.state || {})));
        } catch (_) {}
      }
    });
    return true;
  }

  function addLayoutStyles() {
    if (document.getElementById('ovyx-app-shell-polish-style')) return;
    const style = document.createElement('style');
    style.id = 'ovyx-app-shell-polish-style';
    style.textContent = [
      '#view-appstudio{padding-bottom:22px!important}',
      '#view-appstudio>*:last-child{margin-bottom:0!important}',
      '#ovyx-launch-toasts .ovyx-launch-toast,#ovyx-launch-toasts .ovyx-launch-toast *{pointer-events:none!important}',
      '@media(max-width:767px){#view-appstudio{padding-bottom:calc(16px + env(safe-area-inset-bottom,0px))!important}}',
      '@media(max-width:767px){#view-router-viewport{padding-bottom:calc(76px + env(safe-area-inset-bottom,0px))!important}#view-home .v59-dashboard-shell{padding-bottom:108px!important}body[data-ovyx-v58-home="1"],body[data-ovyx-v57-view="home"]{padding-bottom:0!important}}',
      '@media(max-width:767px){#ovyx-v52-bottom-bar{position:fixed!important;left:0!important;right:0!important;bottom:0!important;width:100%!important;height:calc(64px + env(safe-area-inset-bottom,0px))!important;box-sizing:border-box!important;padding:4px 8px calc(4px + env(safe-area-inset-bottom,0px))!important;border:1px solid var(--border,#1B222A)!important;border-bottom:0!important;border-radius:18px 18px 0 0!important;background:linear-gradient(180deg,color-mix(in srgb,var(--card,#0B0D10) 96%,var(--bg,#050607)),var(--bg,#050607))!important;color:var(--text,#F8FAFC)!important;box-shadow:0 -12px 32px rgba(0,0,0,.28)!important;backdrop-filter:blur(22px)!important;-webkit-backdrop-filter:blur(22px)!important}#ovyx-v52-bottom-bar button{min-height:48px!important;border-radius:12px!important;color:var(--muted,#94A3B8)!important;font-size:9px!important}#ovyx-v52-bottom-bar button.is-active{color:var(--accent,#E8B64F)!important;background:color-mix(in srgb,var(--accent,#E8B64F) 12%,var(--card,#0B0D10))!important}#ovyx-v52-bottom-bar button.is-active:before{background:var(--accent,#E8B64F)!important}#ovyx-v52-bottom-bar .v52-bottom-create{align-self:center!important;margin-top:0!important;height:48px!important;border:1px solid color-mix(in srgb,var(--accent,#E8B64F) 48%,var(--border,#1B222A))!important;background:color-mix(in srgb,var(--accent,#E8B64F) 14%,var(--card,#0B0D10))!important;color:var(--accent,#E8B64F)!important;box-shadow:none!important}#ovyx-v52-bottom-bar .v52-bottom-create b{background:var(--accent,#E8B64F)!important;color:#111!important}}',
      '@media(prefers-reduced-motion:reduce){#ovyx-v52-bottom-bar *,#view-appstudio *{transition:none!important;animation:none!important}}'
    ].join('\n');
    (document.body || document.head).appendChild(style);
  }

  function boot() {
    addLayoutStyles();
    installThemeBridge();
    if (!window.ThemeContext || !window.OVYXThemeLab) {
      let attempts = 0;
      const retry = function () {
        attempts += 1;
        if (installThemeBridge() || attempts >= 20) return;
        window.setTimeout(retry, 50);
      };
      window.setTimeout(retry, 0);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
