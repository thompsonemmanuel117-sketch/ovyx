(function () {
  'use strict';
  if (window.__OVYX_APP_STUDIO_DESIGN_SYSTEM_V1__) return;
  window.__OVYX_APP_STUDIO_DESIGN_SYSTEM_V1__ = true;

  const ROOT = '#view-appstudio';
  const STYLE_ID = 'ovyx-app-studio-design-system-style';

  function install() {
    if (document.getElementById(STYLE_ID) || !document.head) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      /* Presentation-only layer: all existing App Studio sections and controls stay mounted. */
      '#view-appstudio{--as-canvas:var(--bg,#080b11);--as-surface:var(--card,#11161f);--as-text:var(--text,#f4f6f8);--as-muted:var(--muted,#aeb8c7);--as-border:var(--border,rgba(255,255,255,.12));--as-accent:#c2a36b;--as-action-ink:#17140e;box-sizing:border-box!important;gap:clamp(14px,1.65vw,22px)!important;padding:clamp(14px,2vw,30px) clamp(12px,2.2vw,32px) max(14px,env(safe-area-inset-bottom))!important;min-height:0!important;scroll-padding-block:20px;background:radial-gradient(ellipse at 50% -12%,color-mix(in srgb,var(--as-accent) 8%,transparent),transparent 43%),var(--as-canvas)!important;color:var(--as-text)!important}',
      '#view-appstudio>*{min-width:0!important;max-width:none!important;box-sizing:border-box!important}',
      '#view-appstudio :is(.ovyx-as-hero,.ovyx-as-workspace-dock,.ovyx-as-disclosure,.ovyx-ua-panel,.ovyx-lb-panel,.ovyx-lb-brain,.ovyx-lb-release,#app-studio-clean-canvas .as4-shell){border:1px solid color-mix(in srgb,var(--as-border) 82%,var(--as-accent) 18%)!important;border-radius:19px!important;background:linear-gradient(145deg,color-mix(in srgb,var(--as-surface) 96%,var(--as-text) 4%),var(--as-surface))!important;color:var(--as-text)!important;box-shadow:0 14px 38px color-mix(in srgb,var(--as-canvas) 78%,transparent)!important}',
      '#view-appstudio .ovyx-as-hero{padding:clamp(20px,2.6vw,32px)!important;overflow:hidden;isolation:isolate}',
      '#view-appstudio .ovyx-as-hero__copy{max-width:820px!important}',
      '#view-appstudio .ovyx-as-hero h1{font-size:clamp(29px,3.8vw,44px)!important;line-height:1.04!important;letter-spacing:-.052em!important;color:var(--as-text)!important}',
      '#view-appstudio .ovyx-as-hero__desc{max-width:620px!important;margin-top:10px!important;font-size:14px!important;line-height:1.55!important;color:var(--as-muted)!important}',
      '#view-appstudio .ovyx-as-hero__mark{width:62px!important;height:62px!important;flex-basis:62px!important;border-radius:17px!important}',
      '#view-appstudio .ovyx-as-flow{grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:9px!important;margin-top:20px!important}',
      '#view-appstudio .ovyx-as-flow>a{min-height:76px!important;padding:12px!important;grid-template-columns:30px minmax(0,1fr)!important;column-gap:9px!important;border:1px solid var(--as-border)!important;border-radius:13px!important;background:color-mix(in srgb,var(--as-surface) 88%,var(--as-text) 12%)!important;color:var(--as-text)!important}',
      '#view-appstudio .ovyx-as-flow>a.is-current{border-color:color-mix(in srgb,var(--as-accent) 72%,var(--as-border))!important;background:linear-gradient(140deg,color-mix(in srgb,var(--as-accent) 13%,var(--as-surface)),var(--as-surface))!important;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--as-accent) 16%,transparent)!important}',
      '#view-appstudio .ovyx-as-flow__number{width:30px!important;height:30px!important;border-radius:9px!important}',
      '#view-appstudio .ovyx-as-flow__copy b{font-size:13px!important;color:var(--as-text)!important}',
      '#view-appstudio .ovyx-as-flow__copy small{font-size:10px!important;color:var(--as-muted)!important}',
      '#view-appstudio .ovyx-as-flow__state{font-size:10px!important;color:var(--as-muted)!important}',
      '#view-appstudio .ovyx-as-flow>a.is-current .ovyx-as-flow__state{color:var(--as-accent)!important}',
      '#view-appstudio .ovyx-as-hero__helper{margin-top:10px!important;font-size:11px!important;line-height:1.5!important;color:var(--as-muted)!important}',
      '#view-appstudio .ovyx-as-workspace-dock{display:grid!important;grid-template-columns:minmax(0,1fr)!important;gap:12px!important;padding:17px 18px!important}',
      '#view-appstudio .ovyx-as-workspace-dock__heading{margin:0!important}',
      '#view-appstudio .ovyx-as-workspace-dock__heading h2{font-size:17px!important;letter-spacing:-.035em!important;color:var(--as-text)!important}',
      '#view-appstudio .ovyx-as-workspace-dock .ovyx-as-kicker{margin-bottom:4px!important;color:var(--as-accent)!important}',
      '#view-appstudio .ovyx-as-workspace-overview{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;align-items:center!important;gap:10px 14px!important}',
      '#view-appstudio .ovyx-as-project-state{grid-column:1;grid-row:1;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:7px!important;margin:0!important}',
      '#view-appstudio .ovyx-as-project-state__item{padding:9px 10px!important;border:1px solid var(--as-border)!important;border-radius:11px!important;background:color-mix(in srgb,var(--as-surface) 84%,var(--as-text) 16%)!important}',
      '#view-appstudio .ovyx-as-project-state__item span{font-size:10px!important;color:var(--as-muted)!important}',
      '#view-appstudio .ovyx-as-project-state__item strong{font-size:12px!important;color:var(--as-text)!important}',
      '#view-appstudio .ovyx-as-workspace-actions{grid-column:2;grid-row:1;display:flex!important;align-items:center!important;justify-content:flex-end!important;gap:8px!important}',
      '#view-appstudio .ovyx-as-workspace-status{grid-column:1/-1;grid-row:2;margin:0!important;font-size:10px!important;color:var(--as-muted)!important}',
      '#view-appstudio .ovyx-as-workspace-action{min-height:40px!important;padding:9px 13px!important;border:1px solid var(--as-border)!important;border-radius:10px!important;background:color-mix(in srgb,var(--as-surface) 88%,var(--as-text) 12%)!important;color:var(--as-text)!important;font-size:12px!important;font-weight:650!important}',
      '#view-appstudio .ovyx-as-workspace-action.is-primary{border-color:#b89a60!important;background:linear-gradient(135deg,#d7c18f,#b89a60)!important;color:#17140e!important;font-weight:780!important}',
      '#view-appstudio .ovyx-as-workspace-more>summary{min-height:40px!important;display:flex;align-items:center;padding:8px 12px!important;border:1px solid var(--as-border)!important;border-radius:10px!important;background:color-mix(in srgb,var(--as-surface) 88%,var(--as-text) 12%)!important;color:var(--as-text)!important;font-size:12px!important}',
      '#view-appstudio .ovyx-as-workspace-more__panel{z-index:3;min-width:190px;padding:7px!important;border:1px solid var(--as-border)!important;border-radius:12px!important;background:var(--as-surface)!important;box-shadow:0 16px 34px rgba(0,0,0,.25)!important}',
      '#view-appstudio :is(.ovyx-ua-panel,.ovyx-lb-panel,.ovyx-lb-brain,.ovyx-lb-release){padding:clamp(16px,2vw,25px)!important;border-radius:18px!important;scroll-margin-top:20px}',
      '#view-appstudio :is(.ovyx-ua-header,.ovyx-lb-heading,.ovyx-lb-brain-heading,.ovyx-lb-release-heading){margin-bottom:14px!important}',
      '#view-appstudio :is(.ovyx-ua-panel h3,.ovyx-ua-panel h4,.ovyx-ua-panel h5,.ovyx-lb-panel h4,.ovyx-lb-panel h5,.ovyx-lb-brain h4,.ovyx-lb-release h4,.ovyx-app-brand-dna h3){color:var(--as-text)!important;letter-spacing:-.025em!important}',
      '#view-appstudio :is(.ovyx-ua-panel p,.ovyx-ua-panel label,.ovyx-ua-panel li,.ovyx-lb-panel p,.ovyx-lb-panel label,.ovyx-lb-panel li,.ovyx-lb-brain p,.ovyx-lb-release p,.ovyx-app-brand-dna__field){color:var(--as-muted)!important}',
      '#view-appstudio :is(.ovyx-as-stage-meta,.ovyx-ua-section,.ovyx-ua-stat,.ovyx-ua-page,.ovyx-ua-asset,.ovyx-lb-preview,.ovyx-lb-source-list,.ovyx-lb-source-file,.ovyx-lb-brain-findings,.ovyx-lb-brain-graph,.ovyx-lb-release-diagnostics,.ovyx-app-brand-dna__field,.ovyx-app-brand-dna__color){border-color:var(--as-border)!important;background:color-mix(in srgb,var(--as-surface) 90%,var(--as-text) 10%)!important;color:var(--as-text)!important}',
      '#view-appstudio :is(.ovyx-ua-panel input,.ovyx-ua-panel select,.ovyx-ua-panel textarea,.ovyx-lb-panel input:not([type=color]):not([type=file]),.ovyx-lb-panel select,.ovyx-lb-panel textarea,.ovyx-app-brand-dna input[type=text],.ovyx-app-brand-dna textarea){min-height:44px!important;border:1px solid var(--as-border)!important;border-radius:10px!important;background:var(--as-canvas)!important;color:var(--as-text)!important;box-shadow:none!important}',
      '#view-appstudio :is(input,textarea,select)::placeholder{color:var(--as-muted)!important;opacity:.86}',
      '#view-appstudio :is(.ovyx-ua-primary,.ovyx-lb-generate,.ovyx-lb-brain-run,.ovyx-lb-release-btn.publish,.ovyx-app-brand-dna__actions [data-brand-save]){min-height:42px!important;border:1px solid #b89a60!important;border-radius:10px!important;background:linear-gradient(135deg,#d7c18f,#b89a60)!important;color:#17140e!important;font-weight:780!important;box-shadow:0 7px 18px rgba(194,163,107,.14)!important}',
      '#view-appstudio :is(.ovyx-ua-secondary,.ovyx-lb-save,.ovyx-lb-release-btn.secondary,.ovyx-app-brand-dna__actions button:not([data-brand-save]),.ovyx-app-brand-dna__upload button){min-height:40px!important;border:1px solid var(--as-border)!important;border-radius:10px!important;background:color-mix(in srgb,var(--as-surface) 86%,var(--as-text) 14%)!important;color:var(--as-text)!important}',
      '#view-appstudio :is(.ovyx-as-disclosure,.ovyx-as-report-details){border:1px solid var(--as-border)!important;border-radius:14px!important;background:color-mix(in srgb,var(--as-surface) 96%,var(--as-text) 4%)!important;box-shadow:none!important}',
      '#view-appstudio .ovyx-as-disclosure__summary{min-height:58px!important;padding:12px 15px!important;gap:10px!important}',
      '#view-appstudio .ovyx-as-disclosure__copy{font-size:13px!important;color:var(--as-text)!important}',
      '#view-appstudio .ovyx-as-disclosure__hint{font-size:10px!important;color:var(--as-muted)!important}',
      '#view-appstudio :is(.ovyx-lb-files,.ovyx-lb-brain-findings,.ovyx-lb-brain-graph){border:1px solid var(--as-border)!important;border-radius:12px!important;background:color-mix(in srgb,var(--as-surface) 94%,var(--as-text) 6%)!important}',
      '#view-appstudio :is(.ovyx-lb-files summary,.ovyx-lb-brain-findings summary,.ovyx-lb-brain-graph summary,.ovyx-lb-preview-header,.ovyx-lb-preview-header span,.ovyx-lb-source-file strong){color:var(--as-text)!important}',
      '#view-appstudio :is(button,a,summary,input,select,textarea):focus-visible{outline:2px solid #e0c58d!important;outline-offset:3px!important}',
      '#view-appstudio :is(button,a,summary){max-width:100%;overflow-wrap:anywhere}',
      '#view-appstudio button{line-height:1.4!important;white-space:normal!important}',
      '#view-appstudio :is(.ovyx-as-flow>a,.ovyx-as-workspace-action,.ovyx-as-disclosure__summary,.ovyx-lb-save,.ovyx-lb-release-btn,.ovyx-ua-primary,.ovyx-lb-generate):disabled{opacity:.58;cursor:not-allowed!important}',
      '#view-appstudio .ovyx-lb-frame{max-width:100%!important;border:1px solid var(--as-border)!important;border-radius:12px!important}',
      '#view-appstudio .ovyx-as-stage-meta{border-color:var(--as-border)!important}',
      '@media(max-width:900px){#view-appstudio .ovyx-as-flow{grid-template-columns:repeat(2,minmax(0,1fr))!important}#view-appstudio .ovyx-as-workspace-overview{grid-template-columns:minmax(0,1fr)!important}#view-appstudio .ovyx-as-project-state{grid-column:1;grid-row:1;grid-template-columns:repeat(2,minmax(0,1fr))!important}#view-appstudio .ovyx-as-workspace-actions{grid-column:1;grid-row:2;justify-content:flex-start!important}#view-appstudio .ovyx-as-workspace-status{grid-row:3}}',
      '@media(max-width:560px){#view-appstudio{gap:12px!important;padding:12px 11px max(14px,env(safe-area-inset-bottom))!important}#view-appstudio :is(.ovyx-as-hero,.ovyx-as-workspace-dock,.ovyx-ua-panel,.ovyx-lb-panel,.ovyx-lb-brain,.ovyx-lb-release){border-radius:15px!important}#view-appstudio .ovyx-as-hero{padding:17px!important}#view-appstudio .ovyx-as-hero h1{font-size:clamp(26px,8vw,33px)!important}#view-appstudio .ovyx-as-hero__desc{font-size:12px!important}#view-appstudio .ovyx-as-hero__mark{display:none!important}#view-appstudio .ovyx-as-flow{gap:7px!important;margin-top:15px!important}#view-appstudio .ovyx-as-flow>a{min-height:67px!important;padding:9px!important}#view-appstudio .ovyx-as-flow__copy small{font-size:9px!important}#view-appstudio .ovyx-as-workspace-dock{padding:14px!important}#view-appstudio .ovyx-as-workspace-actions{flex-wrap:wrap!important}#view-appstudio :is(.ovyx-ua-panel,.ovyx-lb-panel,.ovyx-lb-brain,.ovyx-lb-release){padding:14px!important}#view-appstudio .ovyx-lb-preview{margin-top:13px!important}#view-appstudio .ovyx-lb-frame{min-height:260px!important}}',
      '@media(max-width:360px){#view-appstudio .ovyx-as-flow>a{grid-template-columns:25px minmax(0,1fr)!important;column-gap:6px!important;padding:8px!important}#view-appstudio .ovyx-as-flow__number{width:25px!important;height:25px!important}#view-appstudio .ovyx-as-flow__copy b{font-size:11px!important}#view-appstudio .ovyx-as-flow__state{font-size:9px!important}}',
      '@media(prefers-reduced-motion:reduce){#view-appstudio{scroll-behavior:auto!important}#view-appstudio *,#view-appstudio *::before,#view-appstudio *::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function simplifyVisibleCopy() {
    const root = document.querySelector(ROOT);
    if (!root) return;
    const title = root.querySelector('#ovyx-as-title');
    const description = root.querySelector('.ovyx-as-hero__desc');
    if (title && title.textContent !== 'Build apps. Beautifully.') title.textContent = 'Build apps. Beautifully.';
    if (description && description.textContent !== 'Analyze a site, create your app, and get it ready to launch.') {
      description.textContent = 'Analyze a site, create your app, and get it ready to launch.';
    }
    const shortHints = ['Website', 'Create', 'Quality', 'Launch'];
    root.querySelectorAll('.ovyx-as-flow__copy small').forEach((node, index) => {
      if (shortHints[index] && node.textContent !== shortHints[index]) node.textContent = shortHints[index];
    });
    const workspaceTitle = root.querySelector('#ovyx-as-workspace-title');
    if (workspaceTitle && workspaceTitle.textContent !== 'Your workspace') workspaceTitle.textContent = 'Your workspace';
  }

  function start() {
    install();
    simplifyVisibleCopy();
    const root = document.querySelector(ROOT);
    if (root && !root.dataset.ovyxDesignSystem) root.dataset.ovyxDesignSystem = 'v1';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();