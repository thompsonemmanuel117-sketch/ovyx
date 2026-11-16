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
