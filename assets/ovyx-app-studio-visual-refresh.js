(function () {
  'use strict';
  if (window.__OVYX_APP_STUDIO_VISUAL_REFRESH_V1__) return;
  window.__OVYX_APP_STUDIO_VISUAL_REFRESH_V1__ = true;

  const STYLE_ID = 'ovyx-app-studio-visual-refresh-style';
  const ROOT = '#view-appstudio';

  function install() {
    if (document.getElementById(STYLE_ID) || !document.head) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      /* Theme tokens follow the active Appearance settings without changing
         the canonical colours saved or exported by Theme Lab. */
      '#view-appstudio{--as-canvas:var(--bg,#080b11);--as-surface:var(--card,#11161f);--as-text:var(--text,#f4f6f8);--as-muted:var(--muted,#aeb8c7);--as-border:var(--border,rgba(255,255,255,.12));--as-accent:#c2a36b;--as-gold-ink:#17140e;box-sizing:border-box!important;padding-bottom:22px!important;min-height:0!important;background:radial-gradient(ellipse at 50% -12%,color-mix(in srgb,var(--as-accent) 9%,transparent),transparent 43%),var(--as-canvas)!important;color:var(--as-text)!important;scroll-behavior:smooth}',
      '#view-appstudio>*{min-width:0!important;max-width:none!important;box-sizing:border-box!important}',
      '#view-appstudio :is(.ovyx-as-hero,.ovyx-as-workspace-dock,.ovyx-as-disclosure,.ovyx-ua-panel,.ovyx-lb-panel,.ovyx-lb-brain,.ovyx-lb-release,#app-studio-clean-canvas .as4-shell){color:var(--as-text)!important;border-color:color-mix(in srgb,var(--as-border) 82%,var(--as-accent) 18%)!important;background:linear-gradient(145deg,color-mix(in srgb,var(--as-surface) 94%,var(--as-text) 6%),var(--as-surface))!important;box-shadow:0 16px 42px color-mix(in srgb,var(--as-canvas) 78%,transparent)!important}',
      '#view-appstudio .ovyx-as-hero{position:relative;isolation:isolate;overflow:hidden;border-radius:22px!important;animation:ovyx-as-enter .42s cubic-bezier(.2,.7,.25,1) both}',
      '#view-appstudio .ovyx-as-hero:after{content:"";position:absolute;z-index:-1;inset:0;pointer-events:none;background:radial-gradient(ellipse at 92% 0%,color-mix(in srgb,var(--as-accent) 13%,transparent),transparent 38%)}',
      '#view-appstudio :is(.ovyx-as-hero h1,.ovyx-as-disclosure__copy,.ovyx-as-workspace-dock h2,.ovyx-lb-heading h4,.ovyx-ua-panel h3,.ovyx-lb-brain h4,.ovyx-lb-release h4){color:var(--as-text)!important;letter-spacing:-.035em}',
      '#view-appstudio :is(.ovyx-as-hero__desc,.ovyx-as-hero__helper,.ovyx-as-disclosure__hint,.ovyx-as-flow__copy small,.ovyx-as-flow__state,.ovyx-as-workspace-status,.ovyx-as-project-state__item span,.ovyx-ua-panel p,.ovyx-lb-panel p,.ovyx-lb-brain p,.ovyx-lb-release p,.ovyx-lb-muted){color:var(--as-muted)!important}',
      '#view-appstudio :is(.ovyx-as-kicker,.ovyx-as-disclosure__icon,.ovyx-as-disclosure__chevron){color:var(--as-accent)!important}',
      '#view-appstudio :is(.ovyx-as-flow>a,.ovyx-as-workspace-nav__item,.ovyx-as-project-state__item,.ovyx-as-workspace-action,.ovyx-ua-stat,.ovyx-ua-section,.ovyx-ua-page,.ovyx-ua-asset,.ovyx-lb-preview,.ovyx-lb-source-list,.ovyx-lb-brain-findings,.ovyx-lb-release-diagnostics){color:var(--as-text)!important;border-color:color-mix(in srgb,var(--as-border) 86%,transparent)!important;background:color-mix(in srgb,var(--as-surface) 90%,var(--as-text) 10%)!important}',
      '#view-appstudio :is(.ovyx-as-flow>a:hover,.ovyx-as-workspace-nav__item:hover:not(:disabled),.ovyx-as-workspace-action:hover:not(:disabled)){border-color:color-mix(in srgb,var(--as-accent) 55%,var(--as-border))!important;background:color-mix(in srgb,var(--as-surface) 88%,var(--as-accent) 12%)!important}',
      '#view-appstudio :is(.ovyx-as-flow__copy b,.ovyx-as-workspace-nav__label,.ovyx-as-project-state__item strong,.ovyx-lb-preview-header,.ovyx-lb-preview-header span,.ovyx-lb-source-list strong){color:var(--as-text)!important}',
      '#view-appstudio :is(.ovyx-ua-panel input,.ovyx-ua-panel select,.ovyx-ua-panel textarea,.ovyx-lb-panel input,.ovyx-lb-panel select,.ovyx-lb-panel textarea){color:var(--as-text)!important;background:color-mix(in srgb,var(--as-surface) 82%,var(--as-canvas) 18%)!important;border:1px solid var(--as-border)!important;border-radius:11px!important;min-height:44px!important;box-shadow:none!important}',
      '#view-appstudio :is(input,select,textarea)::placeholder{color:var(--as-muted)!important;opacity:.82}',
      '#view-appstudio :is(.ovyx-ua-primary,.ovyx-lb-generate,.ovyx-lb-brain-run,.ovyx-lb-release-btn){min-height:42px!important;border-radius:11px!important;border:1px solid color-mix(in srgb,var(--as-accent) 72%,#fff 28%)!important;background:linear-gradient(135deg,#d7c18f,#b89a60)!important;color:var(--as-gold-ink)!important;font-weight:750!important;box-shadow:0 7px 20px rgba(194,163,107,.14)!important;transition:transform .18s ease,box-shadow .18s ease,filter .18s ease}',
      '#view-appstudio :is(.ovyx-ua-primary,.ovyx-lb-generate,.ovyx-lb-brain-run,.ovyx-lb-release-btn):hover:not(:disabled){transform:translateY(-1px);filter:brightness(1.035);box-shadow:0 10px 25px rgba(194,163,107,.2)!important}',
      '#view-appstudio :is(.ovyx-lb-save,.ovyx-as-workspace-action,.ovyx-ua-secondary){min-height:38px!important;border-radius:10px!important;color:var(--as-text)!important;border:1px solid var(--as-border)!important;background:color-mix(in srgb,var(--as-surface) 90%,var(--as-text) 10%)!important}',
      '#view-appstudio :is(.ovyx-lb-preview,.ovyx-lb-frame){max-width:100%!important}',
      '#view-appstudio .ovyx-lb-frame{border:1px solid var(--as-border)!important;border-radius:12px!important}',
      '#view-appstudio :is(.ovyx-as-flow>a,.ovyx-as-workspace-nav__item,.ovyx-as-workspace-action,.ovyx-as-disclosure__summary,.ovyx-lb-save,.ovyx-lb-release-btn,.ovyx-ua-primary,.ovyx-lb-generate):focus-visible{outline:2px solid var(--as-accent)!important;outline-offset:3px!important}',
      '#view-appstudio :is(.ovyx-as-disclosure,.ovyx-ua-panel,.ovyx-lb-panel,.ovyx-lb-brain,.ovyx-lb-release,.ovyx-as-workspace-dock){animation:ovyx-as-enter .38s cubic-bezier(.2,.7,.25,1) both}',
      '#view-appstudio :is(.ovyx-as-disclosure,.ovyx-ua-panel,.ovyx-lb-panel,.ovyx-lb-brain,.ovyx-lb-release,.ovyx-as-workspace-dock):nth-child(2){animation-delay:35ms}',
      '#view-appstudio :is(.ovyx-as-disclosure,.ovyx-ua-panel,.ovyx-lb-panel,.ovyx-lb-brain,.ovyx-lb-release,.ovyx-as-workspace-dock):nth-child(3){animation-delay:65ms}',
      '@keyframes ovyx-as-enter{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:translateY(0)}}',
      '@media(max-width:720px){#view-appstudio{gap:14px!important;padding-left:12px!important;padding-right:12px!important;padding-bottom:22px!important}#view-appstudio :is(.ovyx-as-hero,.ovyx-as-workspace-dock,.ovyx-ua-panel,.ovyx-lb-panel,.ovyx-lb-brain,.ovyx-lb-release){border-radius:16px!important}#view-appstudio .ovyx-lb-project-actions{display:flex!important;flex-wrap:wrap!important;gap:8px!important}#view-appstudio .ovyx-lb-project-actions>*{min-width:0;max-width:100%}}',
      '@media(max-width:480px){#view-appstudio .ovyx-as-hero h1{font-size:clamp(25px,8vw,30px)!important;line-height:1.08!important}#view-appstudio .ovyx-as-flow{gap:7px!important}#view-appstudio :is(.ovyx-ua-panel,.ovyx-lb-panel,.ovyx-lb-brain,.ovyx-lb-release){padding:14px!important}#view-appstudio .ovyx-lb-project-actions>*{flex:1 1 135px!important}}',
      '@media(prefers-reduced-motion:reduce){#view-appstudio{scroll-behavior:auto!important}#view-appstudio *,#view-appstudio *:before,#view-appstudio *:after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function compactCopy() {
    const title = document.querySelector('#view-appstudio #ovyx-as-title');
    if (title && title.textContent !== 'Build apps, beautifully.') title.textContent = 'Build apps, beautifully.';
    const description = document.querySelector('#view-appstudio .ovyx-as-hero__desc');
    if (description && description.textContent !== 'Analyze a site. Build, verify and release your app.') {
      description.textContent = 'Analyze a site. Build, verify and release your app.';
    }
    const generate = document.querySelector('#view-appstudio [data-ovyx-as-step="generate"] .ovyx-as-flow__copy b');
    if (generate && generate.textContent !== 'Build') generate.textContent = 'Build';
    const labels = document.querySelectorAll('#view-appstudio .ovyx-as-flow__copy small');
    const concise = ['Inspect a site', 'Create your app', 'Run quality checks', 'Save or publish'];
    labels.forEach((label, index) => {
      if (concise[index] && label.textContent !== concise[index]) label.textContent = concise[index];
    });
  }

  function observe() {
    const root = document.querySelector(ROOT);
    if (!root || root.dataset.ovyxVisualRefreshObserved === 'true') return;
    root.dataset.ovyxVisualRefreshObserved = 'true';
    const observer = new MutationObserver(() => {
      if (document.getElementById(STYLE_ID)) compactCopy();
    });
    observer.observe(root, { childList: true, subtree: true });
    compactCopy();
  }

  function start() {
    install();
    observe();
    if (!document.getElementById(STYLE_ID)) {
      const observer = new MutationObserver(() => {
        install();
        observe();
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
