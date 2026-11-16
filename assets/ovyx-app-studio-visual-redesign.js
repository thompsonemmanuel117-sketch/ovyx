(function () {
  'use strict';
  if (window.__OVYX_APP_STUDIO_VISUAL_REDESIGN_V1__) return;
  window.__OVYX_APP_STUDIO_VISUAL_REDESIGN_V1__ = true;

  const ROOT = '#view-appstudio';
  const STYLE_ID = 'ovyx-app-studio-visual-redesign-style';
  let observer;
  let queued = false;

  const $ = (root, selector) => root && root.querySelector(selector);

  function refineCopy(root) {
    // The Premium Polish runtime owns the helper's live, project-aware guidance.
    // Do not rewrite it here: competing observers would continuously undo each other.
    const copy = [
      ['.ovyx-as-hero__desc', 'Analyze. Build. Verify. Release.'],
      ['.ovyx-as-workspace-dock .ovyx-as-kicker', 'PROJECT'],
      ['.ovyx-as-workspace-dock h2', 'Your project']
    ];
    for (const [selector, value] of copy) {
      const node = $(root, selector);
      if (node && node.textContent.trim() !== value) node.textContent = value;
    }
    const status = $(root, '.ovyx-as-workspace-status');
    if (status && status.textContent.trim() === 'Project status updates as you build.') status.textContent = 'Project status';
    const openProjects = $(root, '[data-ovyx-as-workspace-action="projects"]');
    if (openProjects && openProjects.textContent.trim() !== 'Projects') openProjects.textContent = 'Projects';
    const more = $(root, '.ovyx-as-workspace-more > summary');
    if (more && more.textContent.trim() !== 'More') more.textContent = 'More';
  }

  function compose(root) {
    const hero = $(root, '#ovyx-app-studio-experience');
    const dock = $(root, '#ovyx-app-studio-workspace-dock');
    // The guided flow leads; project status follows it. No feature panel is
    // detached, hidden, recreated or moved across its existing owner.
    if (hero && dock && hero.nextElementSibling !== dock) hero.after(dock);
    root.classList.add('ovyx-as-visual-redesign');
    refineCopy(root);
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID) || !document.head) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '#view-appstudio.ovyx-as-visual-redesign{color:var(--as-text,var(--text,#f4f6f8))!important;background:var(--as-canvas,var(--bg,#080b11))!important;--as-surface:var(--card,#11161f);--as-border:var(--border,rgba(255,255,255,.12));flex-direction:column!important;gap:clamp(12px,1.5vw,18px)!important;min-height:0!important;height:auto!important;padding-bottom:max(12px,env(safe-area-inset-bottom))!important;scroll-padding-block:16px}',
      '#view-appstudio.ovyx-as-visual-redesign>*{flex:0 0 auto!important;min-height:0!important;max-width:none!important;box-sizing:border-box!important}',
      '#view-appstudio .ovyx-as-hero{padding:clamp(18px,2.4vw,30px)!important;border-radius:22px!important;border:1px solid color-mix(in srgb,var(--as-border,rgba(255,255,255,.12)) 72%,var(--as-accent,#c2a36b) 28%)!important}',
      '#view-appstudio .ovyx-as-hero__top{align-items:center!important;gap:20px!important}',
      '#view-appstudio .ovyx-as-hero h1{max-width:760px!important;margin:0!important;font-size:clamp(27px,4vw,44px)!important;line-height:1.06!important;letter-spacing:-.055em!important}',
      '#view-appstudio .ovyx-as-hero__desc{margin:9px 0 0!important;font-size:clamp(12px,.95vw,14px)!important;line-height:1.45!important}',
      '#view-appstudio .ovyx-as-hero__helper{margin:10px 0 0!important;font-size:11px!important;line-height:1.4!important}',
      '#view-appstudio .ovyx-as-flow{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:9px!important;margin-top:20px!important}',
      '#view-appstudio .ovyx-as-flow>a{display:grid!important;grid-template-columns:auto minmax(0,1fr)!important;grid-template-rows:auto auto!important;align-items:center!important;gap:4px 10px!important;min-width:0!important;min-height:72px!important;padding:12px 13px!important;border-radius:13px!important;text-decoration:none!important;transition:transform .18s ease,border-color .18s ease,background .18s ease!important}',
      '#view-appstudio .ovyx-as-flow__number{grid-row:1/3!important;align-self:center!important;display:grid!important;place-items:center!important;width:29px!important;height:29px!important;border-radius:9px!important;background:color-mix(in srgb,var(--as-accent,#c2a36b) 15%,transparent)!important;color:var(--as-accent,#c2a36b)!important;font-size:11px!important;font-weight:800!important}',
      '#view-appstudio .ovyx-as-flow__copy{display:grid!important;gap:3px!important;min-width:0!important}',
      '#view-appstudio .ovyx-as-flow__copy b{font-size:13px!important;font-weight:750!important}',
      '#view-appstudio .ovyx-as-flow__copy small{font-size:10px!important;line-height:1.3!important}',
      '#view-appstudio .ovyx-as-flow__state{grid-column:2!important;font-size:9px!important;line-height:1.25!important}',
      '#view-appstudio .ovyx-as-flow>a.is-current{border-color:color-mix(in srgb,var(--as-accent,#c2a36b) 72%,var(--as-border,transparent))!important;background:color-mix(in srgb,var(--as-accent,#c2a36b) 9%,var(--as-surface,#11161f))!important}',
      '#view-appstudio .ovyx-as-flow>a.is-complete .ovyx-as-flow__number{background:color-mix(in srgb,#2f9d70 20%,transparent)!important;color:#48bd8a!important}',
      '#view-appstudio .ovyx-as-workspace-dock{padding:15px 17px!important;border-radius:17px!important}',
      '#view-appstudio .ovyx-as-workspace-dock__heading{margin-bottom:10px!important}',
      '#view-appstudio .ovyx-as-workspace-dock h2{font-size:15px!important;letter-spacing:-.025em!important}',
      '#view-appstudio .ovyx-as-project-state{gap:8px!important;margin-bottom:10px!important}',
      '#view-appstudio .ovyx-as-project-state__item{padding:10px 12px!important;border-radius:12px!important}',
      '#view-appstudio .ovyx-as-project-state__item span{font-size:10px!important;letter-spacing:.01em!important}',
      '#view-appstudio .ovyx-as-project-state__item strong{font-size:12px!important;line-height:1.35!important}',
      '#view-appstudio .ovyx-as-workspace-status{min-height:0!important;margin:7px 1px 0!important;font-size:10px!important}',
      '#view-appstudio :is(.ovyx-ua-panel,.ovyx-lb-panel,.ovyx-lb-brain,.ovyx-lb-release){width:100%!important;max-width:none!important;min-height:0!important;margin:0!important;padding:clamp(16px,2vw,23px)!important;border-radius:18px!important}',
      '#view-appstudio :is(.ovyx-ua-panel h3,.ovyx-lb-heading h4,.ovyx-lb-brain h4,.ovyx-lb-release h4){font-size:clamp(17px,1.6vw,21px)!important;line-height:1.2!important;margin-top:0!important}',
      '#view-appstudio :is(.ovyx-ua-panel p,.ovyx-lb-panel p,.ovyx-lb-brain p,.ovyx-lb-release p){font-size:12px!important;line-height:1.55!important}',
      '#view-appstudio :is(.ovyx-as-disclosure,.ovyx-as-identity,.ovyx-as-report-details,.ovyx-as-legacy-conversion){border-radius:15px!important}',
      '#view-appstudio .ovyx-as-disclosure__summary{min-height:54px!important;padding:12px 15px!important;gap:10px!important}',
      '#view-appstudio .ovyx-as-disclosure__copy{font-size:13px!important;font-weight:750!important}',
      '#view-appstudio .ovyx-as-disclosure__hint{font-size:10px!important;line-height:1.35!important}',
      '#view-appstudio :is(.ovyx-ua-panel,.ovyx-lb-panel,.ovyx-lb-brain,.ovyx-lb-release,.ovyx-as-disclosure,.ovyx-as-workspace-dock){overflow-wrap:anywhere!important}',
      '#view-appstudio :is(.ovyx-ua-panel,.ovyx-lb-panel,.ovyx-lb-brain,.ovyx-lb-release) :is(input,select,textarea){max-width:100%!important;min-width:0!important}',
      '#view-appstudio :is(.ovyx-ua-primary,.ovyx-lb-generate,.ovyx-lb-brain-run,.ovyx-lb-release-btn,.ovyx-as-workspace-action.is-primary){min-height:42px!important;padding:10px 16px!important;border-radius:11px!important;background:linear-gradient(135deg,#dfc994,#b9975a)!important;color:#17140e!important;border:1px solid #c5a66c!important;font-weight:780!important}',
      '#view-appstudio :is(.ovyx-lb-save,.ovyx-ua-secondary,.ovyx-as-workspace-action:not(.is-primary)){min-height:40px!important;padding:9px 13px!important;border-radius:10px!important}',
      '#view-appstudio :is(a,button,summary,input,select,textarea):focus-visible{outline:2px solid var(--as-accent,#c2a36b)!important;outline-offset:3px!important}',
      '#view-appstudio :is(.ovyx-as-flow>a,.ovyx-as-workspace-action,.ovyx-as-disclosure__summary,.ovyx-as-workspace-more>summary){-webkit-tap-highlight-color:transparent}',
      '@media(max-width:900px){#view-appstudio .ovyx-as-flow{grid-template-columns:repeat(2,minmax(0,1fr))!important}}',
      '@media(max-width:600px){#view-appstudio.ovyx-as-visual-redesign{gap:11px!important;padding-left:12px!important;padding-right:12px!important;padding-bottom:max(10px,env(safe-area-inset-bottom))!important}#view-appstudio .ovyx-as-hero{padding:16px!important;border-radius:17px!important}#view-appstudio .ovyx-as-hero h1{font-size:clamp(26px,8vw,34px)!important}#view-appstudio .ovyx-as-flow{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:7px!important;margin-top:15px!important}#view-appstudio .ovyx-as-flow>a{min-height:66px!important;padding:9px!important;gap:4px 8px!important}#view-appstudio .ovyx-as-flow__copy b{font-size:12px!important}#view-appstudio .ovyx-as-flow__copy small{font-size:9px!important}#view-appstudio .ovyx-as-flow__state{font-size:8px!important}#view-appstudio .ovyx-as-project-state{grid-template-columns:repeat(2,minmax(0,1fr))!important}#view-appstudio .ovyx-as-workspace-dock{padding:12px!important;border-radius:15px!important}#view-appstudio :is(.ovyx-ua-panel,.ovyx-lb-panel,.ovyx-lb-brain,.ovyx-lb-release){padding:14px!important;border-radius:15px!important}#view-appstudio .ovyx-as-disclosure__summary{display:grid!important;grid-template-columns:auto minmax(0,1fr) auto!important}#view-appstudio .ovyx-as-disclosure__hint{grid-column:2!important}}',
      '@media(prefers-reduced-motion:reduce){#view-appstudio *{animation:none!important;transition:none!important;scroll-behavior:auto!important}}',
      /* Workbench redesign: change the composition, not just the decoration. */
      '#view-appstudio.ovyx-as-visual-redesign{gap:14px!important;padding:clamp(12px,2vw,24px)!important;background:radial-gradient(ellipse at 50% 0%,color-mix(in srgb,var(--as-accent,#c2a36b) 10%,transparent),transparent 42%),var(--as-canvas,#080b11)!important}',
      '#view-appstudio .ovyx-as-hero{padding:clamp(16px,2vw,24px)!important;border-radius:18px!important;background:linear-gradient(135deg,color-mix(in srgb,var(--as-surface,#11161f) 96%,var(--as-accent,#c2a36b) 4%),var(--as-canvas,#080b11))!important;border-color:var(--as-border,rgba(255,255,255,.12))!important;box-shadow:0 14px 34px color-mix(in srgb,var(--as-canvas,#080b11) 75%,transparent)!important}',
      '#view-appstudio .ovyx-as-hero__top{align-items:flex-start!important}',
      '#view-appstudio .ovyx-as-hero h1{font-size:clamp(25px,3.3vw,38px)!important;line-height:1.04!important;max-width:620px!important}',
      '#view-appstudio .ovyx-as-hero__mark{width:52px!important;height:52px!important;flex-basis:52px!important;padding:8px!important;border-radius:15px!important}',
      '#view-appstudio .ovyx-as-flow{grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:7px!important;margin-top:16px!important}',
      '#view-appstudio .ovyx-as-flow>a{grid-template-columns:25px minmax(0,1fr)!important;grid-template-rows:1fr!important;min-height:48px!important;padding:8px 10px!important;gap:7px!important;border-radius:11px!important;background:color-mix(in srgb,var(--as-surface,#11161f) 86%,transparent)!important;border-color:var(--as-border,rgba(255,255,255,.12))!important}',
      '#view-appstudio .ovyx-as-flow__number{grid-row:1!important;width:25px!important;height:25px!important;border-radius:8px!important;font-size:10px!important}',
      '#view-appstudio .ovyx-as-flow__copy{align-self:center!important;gap:0!important}',
      '#view-appstudio .ovyx-as-flow__copy b{font-size:12px!important;color:var(--as-text,#f4f6f8)!important}',
      '#view-appstudio .ovyx-as-flow__copy small,#view-appstudio .ovyx-as-flow__state{display:none!important}',
      '#view-appstudio .ovyx-as-hero__helper{margin-top:10px!important;font-size:11px!important;color:var(--as-muted,#aeb8c7)!important}',
      '#view-appstudio .ovyx-as-workspace-dock{display:grid!important;grid-template-columns:minmax(0,1fr)!important;gap:8px!important;padding:12px 14px!important;border-radius:15px!important;background:var(--as-surface,#11161f)!important;border-color:var(--as-border,rgba(255,255,255,.12))!important;box-shadow:none!important}',
      '#view-appstudio .ovyx-as-workspace-dock__heading{margin:0!important}',
      '#view-appstudio .ovyx-as-workspace-dock__heading .ovyx-as-kicker{margin:0 0 3px!important;font-size:9px!important}',
      '#view-appstudio .ovyx-as-workspace-dock h2{font-size:15px!important;color:var(--as-text,#f4f6f8)!important}',
      '#view-appstudio .ovyx-as-project-state{grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:6px!important;margin:0!important}',
      '#view-appstudio .ovyx-as-project-state__item{gap:3px!important;padding:8px!important;border-radius:9px!important;background:color-mix(in srgb,var(--as-canvas,#080b11) 54%,var(--as-surface,#11161f))!important;border-color:var(--as-border,rgba(255,255,255,.12))!important}',
      '#view-appstudio .ovyx-as-project-state__item span{font-size:9px!important;color:var(--as-muted,#aeb8c7)!important}',
      '#view-appstudio .ovyx-as-project-state__item strong{font-size:10px!important;color:var(--as-text,#f4f6f8)!important;line-height:1.25!important}',
      '#view-appstudio .ovyx-as-workspace-overview{display:grid!important;gap:7px!important}',
      '#view-appstudio .ovyx-as-workspace-actions{margin:0!important;gap:7px!important}',
      '#view-appstudio .ovyx-as-workspace-action,#view-appstudio .ovyx-as-workspace-more>summary{min-height:34px!important;padding:7px 11px!important}',
      '#view-appstudio .ovyx-as-workspace-status{margin:0!important;min-height:0!important;font-size:10px!important}',
      '#view-appstudio .ovyx-as-stage-meta{display:grid!important;grid-template-columns:auto auto minmax(0,1fr) auto!important;align-items:center!important;gap:8px!important;margin:0 0 10px!important;padding:0 0 9px!important;border-bottom:1px solid var(--as-border,rgba(255,255,255,.12))!important}',
      '#view-appstudio .ovyx-as-stage-meta__title{display:none!important}',
      '#view-appstudio .ovyx-as-stage-meta__index{width:27px!important;height:27px!important;flex:0 0 27px!important;border-radius:8px!important}',
      '#view-appstudio .ovyx-as-stage-meta__label{font-size:10px!important;letter-spacing:.14em!important;color:var(--as-accent,#c2a36b)!important}',
      '#view-appstudio .ovyx-as-stage-meta__status{margin-left:auto!important;font-size:10px!important}',
      '#view-appstudio :is(.ovyx-ua-panel,.ovyx-lb-panel,.ovyx-lb-brain,.ovyx-lb-release,.ovyx-app-brand-dna){color:var(--as-text,#f4f6f8)!important;background:var(--as-surface,#11161f)!important;border:1px solid var(--as-border,rgba(255,255,255,.12))!important;border-radius:16px!important;box-shadow:none!important}',
      '#view-appstudio :is(.ovyx-ua-panel h3,.ovyx-ua-panel h4,.ovyx-lb-panel h4,.ovyx-lb-panel h5,.ovyx-lb-brain h5,.ovyx-lb-release h5,.ovyx-app-brand-dna h3){color:var(--as-text,#f4f6f8)!important}',
      '#view-appstudio :is(.ovyx-ua-panel p,.ovyx-ua-panel label,.ovyx-ua-panel li,.ovyx-lb-panel p,.ovyx-lb-panel label,.ovyx-lb-brain p,.ovyx-lb-release p,.ovyx-app-brand-dna,.ovyx-app-brand-dna__field,.ovyx-app-brand-dna__color){color:var(--as-muted,#aeb8c7)!important}',
      '#view-appstudio :is(.ovyx-ua-section,.ovyx-ua-stat,.ovyx-ua-page,.ovyx-ua-asset,.ovyx-ua-color,.ovyx-lb-preview,.ovyx-lb-source-file,.ovyx-lb-brain-finding,.ovyx-lb-brain-summary,.ovyx-lb-release-diagnostics,.ovyx-app-brand-dna__field,.ovyx-app-brand-dna__color,.ovyx-app-brand-dna__logo-preview){color:var(--as-text,#f4f6f8)!important;background:color-mix(in srgb,var(--as-surface,#11161f) 84%,var(--as-canvas,#080b11) 16%)!important;border-color:var(--as-border,rgba(255,255,255,.12))!important}',
      '#view-appstudio :is(input,textarea,select,.ovyx-ua-input,.ovyx-lb-input,.ovyx-app-brand-dna input[type=text],.ovyx-app-brand-dna textarea){color:var(--as-text,#f4f6f8)!important;background:var(--as-canvas,#080b11)!important;border:1px solid var(--as-border,rgba(255,255,255,.16))!important;box-shadow:none!important}',
      '#view-appstudio :is(input,textarea,select)::placeholder{color:var(--as-muted,#aeb8c7)!important;opacity:.8!important}',
      '#view-appstudio :is(button,a,summary,input,textarea,select):focus-visible{outline:2px solid var(--as-accent,#c2a36b)!important;outline-offset:3px!important}',
      '#view-appstudio .ovyx-as-disclosure{border-color:var(--as-border,rgba(255,255,255,.12))!important;background:var(--as-surface,#11161f)!important;box-shadow:none!important}',
      '#view-appstudio .ovyx-as-disclosure__summary{min-height:52px!important;padding:10px 13px!important}',
      '#view-appstudio .ovyx-as-disclosure__copy{color:var(--as-text,#f4f6f8)!important;font-size:12px!important}',
      '#view-appstudio .ovyx-as-disclosure__hint{color:var(--as-muted,#aeb8c7)!important}',
      '#view-appstudio :is(.ovyx-ua-primary,.ovyx-lb-generate,.ovyx-lb-brain-run,.ovyx-lb-release-btn.publish,.ovyx-app-brand-dna__actions [data-brand-save]){background:linear-gradient(135deg,#dfca9b,#b99a60)!important;color:#17140e!important;border:1px solid #b99a60!important}',
      '#view-appstudio :is(.ovyx-ua-secondary,.ovyx-lb-save,.ovyx-lb-release-btn.secondary,.ovyx-app-brand-dna__actions button,.ovyx-app-brand-dna__upload button){background:color-mix(in srgb,var(--as-surface,#11161f) 90%,var(--as-text,#f4f6f8) 10%)!important;color:var(--as-text,#f4f6f8)!important;border:1px solid var(--as-border,rgba(255,255,255,.14))!important}',
      '@media(max-width:720px){#view-appstudio.ovyx-as-visual-redesign{padding-bottom:12px!important}#view-appstudio .ovyx-as-flow{grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:5px!important}#view-appstudio .ovyx-as-flow>a{min-height:42px!important;padding:6px!important;grid-template-columns:21px minmax(0,1fr)!important;gap:5px!important}#view-appstudio .ovyx-as-flow__number{width:21px!important;height:21px!important;font-size:9px!important}#view-appstudio .ovyx-as-flow__copy b{font-size:10px!important}#view-appstudio .ovyx-as-project-state{grid-template-columns:repeat(2,minmax(0,1fr))!important}}',
      '@media(max-width:420px){#view-appstudio.ovyx-as-visual-redesign{padding-left:10px!important;padding-right:10px!important}#view-appstudio .ovyx-as-hero{padding:14px!important}#view-appstudio .ovyx-as-hero h1{font-size:clamp(24px,7.3vw,30px)!important}#view-appstudio .ovyx-as-hero__mark{width:40px!important;height:40px!important;flex-basis:40px!important}#view-appstudio .ovyx-as-flow__copy b{font-size:9px!important}#view-appstudio .ovyx-as-disclosure__hint{display:none!important}#view-appstudio .ovyx-as-workspace-dock{padding:11px!important}}',
      '@media(prefers-reduced-motion:reduce){#view-appstudio *{animation:none!important;transition:none!important;scroll-behavior:auto!important}}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function schedule(root) {
    if (queued) return;
    queued = true;
    Promise.resolve().then(() => {
      queued = false;
      if (root && root.isConnected) compose(root);
    });
  }

  function start() {
    installStyles();
    const root = document.querySelector(ROOT);
    if (!root) return;
    compose(root);
    if (observer) return;
    observer = new MutationObserver(() => schedule(document.querySelector(ROOT)));
    observer.observe(root, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
  window.addEventListener('ovyx:link-app-generated', start);
  window.addEventListener('ovyx:project-brain-updated', start);
  window.addEventListener('ovyx:app-studio-release-updated', start);
})();
