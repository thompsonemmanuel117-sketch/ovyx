(function () {
  'use strict';
  if (window.__OVYX_APP_STUDIO_PREMIUM_POLISH_V1__) return;
  window.__OVYX_APP_STUDIO_PREMIUM_POLISH_V1__ = true;

  const ROOT = '#view-appstudio';
  const HERO_ID = 'ovyx-app-studio-experience';
  const IDENTITY_ID = 'ovyx-as-identity-details';
  const LEGACY_ID = 'ovyx-as-existing-conversion';
  let observer;
  let refreshQueued = false;

  const $ = (root, selector) => root && root.querySelector(selector);
  const el = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = String(text);
    return element;
  };

  function buildHero() {
    const hero = el('section', 'ovyx-as-hero');
    hero.id = HERO_ID;
    hero.setAttribute('aria-labelledby', 'ovyx-as-title');
    hero.innerHTML =
      '<div class="ovyx-as-hero__top">' +
        '<div class="ovyx-as-hero__copy">' +
          '<p class="ovyx-as-kicker">OVYX · APP STUDIO</p>' +
          '<h1 id="ovyx-as-title">From website to working app.</h1>' +
          '<p class="ovyx-as-hero__desc">Inspect a website, create a tailored app, verify key interactions, and prepare it for release.</p>' +
        '</div>' +
        '<div class="ovyx-as-hero__mark" aria-hidden="true"><span></span><span></span><span></span><span></span></div>' +
      '</div>' +
      '<nav class="ovyx-as-flow" aria-label="App build steps">' +
        '<a href="#ovyx-app-studio-url-analyzer-panel" data-ovyx-as-step="analyze">' +
          '<span class="ovyx-as-flow__number">01</span><span class="ovyx-as-flow__copy"><b>Analyze</b><small>Inspect a public URL</small></span><span class="ovyx-as-flow__state" data-ovyx-as-step-state>Start here</span>' +
        '</a>' +
        '<a href="#ovyx-app-studio-link-builder" data-ovyx-as-step="generate">' +
          '<span class="ovyx-as-flow__number">02</span><span class="ovyx-as-flow__copy"><b>Build</b><small>Create your app</small></span><span class="ovyx-as-flow__state" data-ovyx-as-step-state>Next</span>' +
        '</a>' +
        '<a href="#ovyx-app-studio-project-brain" data-ovyx-as-step="verify">' +
          '<span class="ovyx-as-flow__number">03</span><span class="ovyx-as-flow__copy"><b>Verify</b><small>Test real behaviour</small></span><span class="ovyx-as-flow__state" data-ovyx-as-step-state>Next</span>' +
        '</a>' +
        '<a href="#ovyx-app-studio-release" data-ovyx-as-step="release">' +
          '<span class="ovyx-as-flow__number">04</span><span class="ovyx-as-flow__copy"><b>Release</b><small>Save, export or publish</small></span><span class="ovyx-as-flow__state" data-ovyx-as-step-state>Next</span>' +
        '</a>' +
      '</nav>' +
      '<p class="ovyx-as-hero__helper" data-ovyx-as-helper aria-live="polite">Start with a public website URL. Advanced options stay tucked away until you need them.</p>';
    return hero;
  }

  function wrapIdentity(root) {
    const panel = document.getElementById('ovyx-app-studio-brand-dna-panel');
    if (!panel || !root.contains(panel) || panel.closest('#' + IDENTITY_ID)) return;
    const details = el('details', 'ovyx-as-disclosure ovyx-as-identity');
    details.id = IDENTITY_ID;
    const summary = el('summary', 'ovyx-as-disclosure__summary');
    summary.append(
      el('span', 'ovyx-as-disclosure__icon', '✳'),
      el('span', 'ovyx-as-disclosure__copy', 'Brand identity'),
      el('span', 'ovyx-as-disclosure__hint', 'Logo · colour palette · layout rules'),
      el('span', 'ovyx-as-disclosure__chevron', '＋')
    );
    details.appendChild(summary);
    panel.parentNode.insertBefore(details, panel);
    details.appendChild(panel);
    details.addEventListener('toggle', () => {
      const icon = $(details, '.ovyx-as-disclosure__chevron');
      if (icon) icon.textContent = details.open ? '−' : '＋';
    });
  }

  function wrapLegacyConversion(root) {
    const canvas = document.getElementById('app-studio-clean-canvas');
    if (!canvas || !root.contains(canvas) || canvas.closest('#' + LEGACY_ID)) return;
    const details = el('details', 'ovyx-as-disclosure ovyx-as-legacy-conversion');
    details.id = LEGACY_ID;
    const summary = el('summary', 'ovyx-as-disclosure__summary');
    summary.append(
      el('span', 'ovyx-as-disclosure__icon', '↗'),
      el('span', 'ovyx-as-disclosure__copy', 'Convert a Web Studio design'),
      el('span', 'ovyx-as-disclosure__hint', 'Continue with an existing design'),
      el('span', 'ovyx-as-disclosure__chevron', '＋')
    );
    details.appendChild(summary);
    canvas.parentNode.insertBefore(details, canvas);
    details.appendChild(canvas);
    const icon = $(details, '.ovyx-as-disclosure__chevron');
    details.addEventListener('toggle', () => { if (icon) icon.textContent = details.open ? '−' : '＋'; });
    try {
      if (sessionStorage.getItem('ovyx.appstudio.entryIntent') === 'convert-web-to-mobile') {
        details.open = true;
        sessionStorage.removeItem('ovyx.appstudio.entryIntent');
      }
    } catch (_) {}
  }

  function groupAnalyzerDetails(root) {
    const results = $(document.getElementById('ovyx-app-studio-url-analyzer-panel'), '[data-ua-results]');
    if (!results || results.querySelector(':scope > .ovyx-as-report-details')) return;
    const children = Array.from(results.children);
    const stats = children.find(item => item.classList.contains('ovyx-ua-stats'));
    const sections = children.filter(item => item.classList.contains('ovyx-ua-section'));
    const detectedIdentity = sections[0];
    if (!stats || !detectedIdentity || sections.length < 2) return;

    const details = el('details', 'ovyx-as-disclosure ovyx-as-report-details');
    details.open = false;
    const summary = el('summary', 'ovyx-as-disclosure__summary');
    const report = window.__OVYX_URL_ANALYZER_LAST_REPORT__ || {};
    const pageCount = Number(report.summary?.pagesDiscovered || 0);
    const assetCount = Number(report.summary?.assetsDiscovered || 0);
    summary.append(
      el('span', 'ovyx-as-disclosure__icon', '⌁'),
      el('span', 'ovyx-as-disclosure__copy', 'Detailed inspection report'),
      el('span', 'ovyx-as-disclosure__hint', pageCount + ' pages reviewed · ' + assetCount + ' images and resources · notes and warnings'),
      el('span', 'ovyx-as-disclosure__chevron', '＋')
    );
    const body = el('div', 'ovyx-as-report-details__body');
    details.append(summary, body);
    const builder = children.find(item => item.id === 'ovyx-app-studio-link-builder');
    const retained = new Set([stats, detectedIdentity, builder, details]);
    for (const child of children) {
      if (retained.has(child)) continue;
      body.appendChild(child);
    }
    if (details.parentElement !== results) {
      const insertAfter = detectedIdentity.nextSibling;
      if (insertAfter) results.insertBefore(details, insertAfter);
      else results.appendChild(details);
    }
    if (builder && builder.parentElement === results) results.appendChild(builder);
    details.addEventListener('toggle', () => {
      const icon = $(details, '.ovyx-as-disclosure__chevron');
      if (icon) icon.textContent = details.open ? '−' : '＋';
    });
  }

  function setStepState(anchor, state, message) {
    if (anchor.dataset.ovyxAsState === state) return;
    anchor.dataset.ovyxAsState = state;
    anchor.classList.toggle('is-complete', state === 'complete');
    anchor.classList.toggle('is-current', state === 'current');
    anchor.classList.toggle('is-pending', state === 'pending');
    const label = $(anchor, '[data-ovyx-as-step-state]');
    if (label && label.textContent !== message) label.textContent = message;
  }

  function refreshFlow() {
    const hero = document.getElementById(HERO_ID);
    if (!hero) return;
    const steps = [...hero.querySelectorAll('[data-ovyx-as-step]')];
    const report = !!window.__OVYX_URL_ANALYZER_LAST_REPORT__;
    const project = !!window.__OVYX_APP_STUDIO_GENERATED_PROJECT__;
    const brain = window.__OVYX_PROJECT_BRAIN_REPORT__;
    const verified = !!(brain && brain.summary && brain.summary.runtimeChecked);
    const artifact = window.__OVYX_APP_STUDIO_GENERATED_PROJECT__;
    const releaseState = artifact?.releaseState || {};
    const production = releaseState.web?.production;
    const productionIsLive = !!(production && production.action === 'publish' &&
      ['active', 'success', 'deployed', 'completed'].includes(String(production.status || '').toLowerCase()));
    const mobile = releaseState.mobile;
    const mobileHasArtifact = Object.values(mobile?.artifacts || {}).some(item => !!(item && (item.downloadUrl || item.url)));
    const mobileCompleted = mobile?.status === 'completed' && mobileHasArtifact;
    const projectSaved = artifact?.savedToProjects === true;
    const latestWebRecord = releaseState.web?.[releaseState.latestWebKey] || null;
    const previewDeployed = !!(latestWebRecord && latestWebRecord.environment !== 'production' &&
      ['active', 'success', 'deployed', 'completed'].includes(String(latestWebRecord.status || '').toLowerCase()));
    const released = productionIsLive || mobileCompleted;
    const states = [
      report ? 'complete' : 'current',
      project ? 'complete' : report ? 'current' : 'pending',
      verified ? (brain.status === 'failed' || brain.status === 'needs-attention' ? 'current' : 'complete') : project ? 'current' : 'pending',
      released ? 'complete' : (projectSaved || previewDeployed || (verified && brain.status !== 'failed')) ? 'current' : 'pending'
    ];
    const messages = [
      states[0] === 'complete' ? 'Done' : 'Start here',
      states[1] === 'complete' ? 'Done' : report ? 'Build next' : 'Next',
      states[2] === 'complete' ? 'Done' : verified ? 'Review findings' : project ? 'Check now' : 'Next',
      released ? (mobileCompleted && !productionIsLive ? 'Build ready' : 'Published') : productionIsLive ? 'Published' : previewDeployed ? 'Preview ready · publish when ready' : projectSaved ? 'Saved · ready for release' : verified && brain.status !== 'failed' ? 'Ready to continue' : 'Next'
    ];
    steps.forEach((anchor, index) => setStepState(anchor, states[index], messages[index]));
    const helper = $(hero, '[data-ovyx-as-helper]');
    if (!helper) return;
    let copy = !report
      ? 'Start with a public website URL. Advanced options stay tucked away until you need them.'
      : !project
        ? 'Website analysis is complete. Use the findings below to create your app.'
        : !verified
          ? 'Your app preview is ready. Quality checks are reviewing its source and visible controls.'
          : (brain.status === 'failed' || brain.status === 'needs-attention')
            ? 'Quality checks found items to review. Review the details before publishing.'
            : productionIsLive
              ? 'Production publish is recorded. Use Release Health to confirm the public site is reachable.'
              : mobileCompleted
                ? 'A mobile build artifact was returned. Review its download/details and verify it before distribution.'
                : previewDeployed
                  ? 'A preview deployment is live. Publish production only after reviewing the preview and release health.'
                  : projectSaved
                    ? 'Your app is saved in OVYX Projects. Export it or create a preview deployment when you are ready.'
                    : 'Checks are complete. Save your app, export it, or deploy a preview when you are ready.';
    if (helper.textContent !== copy) helper.textContent = copy;
  }

  function handlePaletteDisclosure(event) {
    const button = event.target && event.target.closest && event.target.closest('.ovyx-ua-secondary');
    if (!button) return;
    const identity = document.getElementById(IDENTITY_ID);
    if (identity) identity.open = true;
  }

  function handleStepClick(event) {
    const anchor = event.target && event.target.closest && event.target.closest('[data-ovyx-as-step]');
    if (!anchor) return;
    event.preventDefault();
    const name = anchor.dataset.ovyxAsStep;
    const map = {
      analyze: '#ovyx-app-studio-url-analyzer-panel',
      generate: '#ovyx-app-studio-link-builder',
      verify: '#ovyx-app-studio-project-brain',
      release: '#ovyx-app-studio-release'
    };
    let target = document.querySelector(map[name] || '');
    if (!target || (name === 'generate' && !window.__OVYX_APP_STUDIO_GENERATED_PROJECT__ && !window.__OVYX_URL_ANALYZER_LAST_REPORT__)) {
      target = document.querySelector('#ovyx-app-studio-url-analyzer-panel [data-ua-url]');
      if (target && name !== 'analyze') {
        const helper = $(document.getElementById(HERO_ID), '[data-ovyx-as-helper]');
        if (helper) helper.textContent = name === 'generate'
          ? 'Analyze a website first. The app generator becomes available after a successful analysis.'
          : 'Complete the current step to continue. The next step becomes available when it is ready.';
      }
    }
    if (!target) return;
    const behavior = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    const disclosure = target.closest('details');
    if (disclosure) disclosure.open = true;
    if (target.matches('input')) {
      target.scrollIntoView({ behavior, block: 'center' });
      target.focus({ preventScroll: true });
    } else {
      target.scrollIntoView({ behavior, block: 'start' });
    }
  }

  function addStyles() {
    if (document.getElementById('ovyx-app-studio-premium-polish-style')) return;
    const style = el('style', '');
    style.id = 'ovyx-app-studio-premium-polish-style';
    style.textContent = [
      '#view-appstudio{position:relative!important;flex-direction:column!important;align-items:stretch!important;gap:clamp(14px,2vw,22px)!important;box-sizing:border-box!important;width:100%!important;height:100%!important;min-height:0!important;overflow-x:hidden!important;overflow-y:auto!important;overscroll-behavior:contain;padding:clamp(14px,2.7vw,34px) clamp(12px,2.8vw,36px) max(24px,env(safe-area-inset-bottom))!important;scroll-behavior:smooth!important;background:radial-gradient(ellipse at 50% -15%,rgba(194,163,107,.11),transparent 44%),linear-gradient(180deg,#080b11 0%,#05070b 70%,#090b10 100%)!important}',
      '#view-appstudio>*{flex-shrink:0!important;max-width:none!important;width:100%!important;margin-left:auto!important;margin-right:auto!important;min-width:0!important;box-sizing:border-box!important}',
      '#view-appstudio #app-studio-clean-canvas{position:relative!important;inset:auto!important;width:100%!important;height:auto!important;min-height:0!important;overflow:visible!important;pointer-events:auto!important;background:transparent!important;border:0!important;box-shadow:none!important}',
      '#view-appstudio #app-studio-clean-canvas .as4-shell{box-sizing:border-box!important;width:100%!important;min-height:0!important;max-width:none!important;padding:clamp(15px,2vw,24px)!important;margin:0 auto!important;border:1px solid rgba(255,255,255,.09);border-radius:18px;background:linear-gradient(145deg,rgba(18,23,32,.94),rgba(9,12,18,.96));box-shadow:0 18px 45px rgba(0,0,0,.2)}',
      '.ovyx-as-hero{position:relative;overflow:hidden;padding:clamp(19px,3vw,31px);border:1px solid rgba(194,163,107,.25);border-radius:24px;background:radial-gradient(ellipse at 91% 6%,rgba(194,163,107,.13),transparent 30%),linear-gradient(135deg,rgba(20,25,34,.99),rgba(8,11,17,.98));box-shadow:0 22px 60px rgba(0,0,0,.2);animation:ovyx-as-rise .42s cubic-bezier(.2,.7,.25,1) both}',
      '.ovyx-as-hero__top{display:flex;align-items:center;justify-content:space-between;gap:20px}.ovyx-as-hero__copy{max-width:780px}.ovyx-as-kicker{margin:0 0 10px;color:#c2a36b;font:800 10px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.18em}.ovyx-as-hero h1{margin:0;color:#f7f7f5;font-size:clamp(27px,4.2vw,43px);font-weight:760;line-height:1.06;letter-spacing:-.045em}.ovyx-as-hero__desc{max-width:650px;margin:12px 0 0;color:#aeb8c7;font-size:clamp(12px,1.25vw,14px);line-height:1.75}',
      '.ovyx-as-hero__mark{flex:0 0 76px;width:76px;height:76px;display:grid;grid-template-columns:repeat(2,1fr);gap:6px;place-content:center;transform:rotate(-7deg);padding:12px;border:1px solid rgba(194,163,107,.25);border-radius:22px;background:rgba(194,163,107,.04)}.ovyx-as-hero__mark span{border-radius:7px;background:linear-gradient(145deg,#d5bd8a,#947b4c);box-shadow:0 3px 12px rgba(194,163,107,.12)}.ovyx-as-hero__mark span:nth-child(2){opacity:.5}.ovyx-as-hero__mark span:nth-child(3){opacity:.72}.ovyx-as-hero__mark span:nth-child(4){opacity:.28}',
      '.ovyx-as-flow{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:23px}.ovyx-as-flow>a{position:relative;display:grid;grid-template-columns:32px minmax(0,1fr);grid-template-rows:auto auto;align-content:center;column-gap:10px;row-gap:3px;min-width:0;padding:12px;border:1px solid rgba(255,255,255,.085);border-radius:13px;background:rgba(255,255,255,.025);color:inherit;text-decoration:none;transition:transform .18s ease,border-color .18s ease,background .18s ease,box-shadow .18s ease}.ovyx-as-flow>a:hover{transform:translateY(-2px);border-color:rgba(194,163,107,.38);background:rgba(194,163,107,.055)}.ovyx-as-flow>a:focus-visible,.ovyx-as-disclosure summary:focus-visible{outline:2px solid #c2a36b;outline-offset:3px}.ovyx-as-flow__number{grid-row:span 2;align-self:center;display:grid;place-items:center;width:32px;height:32px;border:1px solid rgba(255,255,255,.12);border-radius:10px;background:rgba(0,0,0,.2);color:#aab4c3;font:800 10px/1 ui-monospace,monospace}.ovyx-as-flow__copy{display:grid;gap:4px;align-self:end}.ovyx-as-flow__copy b{font-size:12px;color:#e7ebf1}.ovyx-as-flow__copy small{font-size:10px;line-height:1.4;color:#8895a6}.ovyx-as-flow__state{grid-column:2;font-size:9px;line-height:1.3;color:#8b95a4}.ovyx-as-flow>a.is-current{border-color:rgba(194,163,107,.55);background:linear-gradient(135deg,rgba(194,163,107,.1),rgba(255,255,255,.025));box-shadow:inset 0 0 0 1px rgba(194,163,107,.05)}.ovyx-as-flow>a.is-current .ovyx-as-flow__number{border-color:rgba(194,163,107,.62);background:#c2a36b;color:#19160d}.ovyx-as-flow>a.is-current .ovyx-as-flow__state{color:#bfa16a}.ovyx-as-flow>a.is-complete .ovyx-as-flow__number{border-color:rgba(110,231,183,.42);background:rgba(16,75,61,.6);color:#a7f3d0}.ovyx-as-flow>a.is-complete .ovyx-as-flow__state{color:#86efac}',
      '.ovyx-as-hero__helper{margin:13px 1px 0;color:#98a5b5;font-size:11px;line-height:1.6}',
      '.ovyx-as-disclosure{width:100%;min-width:0;border:1px solid rgba(255,255,255,.095);border-radius:17px;background:linear-gradient(145deg,rgba(17,22,31,.96),rgba(8,11,17,.95));box-shadow:0 12px 34px rgba(0,0,0,.12);overflow:hidden;animation:ovyx-as-rise .38s cubic-bezier(.2,.7,.25,1) both}.ovyx-as-disclosure__summary{display:flex;align-items:center;gap:11px;min-height:66px;padding:14px 17px;list-style:none;cursor:pointer;user-select:none}.ovyx-as-disclosure__summary::-webkit-details-marker{display:none}.ovyx-as-disclosure__summary:hover{background:rgba(255,255,255,.025)}.ovyx-as-disclosure__icon{flex:0 0 34px;width:34px;height:34px;display:grid;place-items:center;border:1px solid rgba(194,163,107,.27);border-radius:11px;color:#c2a36b;background:rgba(194,163,107,.06);font-size:16px}.ovyx-as-disclosure__copy{color:#f1f3f6;font-size:13px;font-weight:750}.ovyx-as-disclosure__hint{margin-left:auto;color:#8895a6;font-size:10px;line-height:1.5;text-align:right}.ovyx-as-disclosure__chevron{flex:0 0 22px;width:22px;height:22px;display:grid;place-items:center;border:1px solid rgba(255,255,255,.12);border-radius:50%;color:#c2a36b;font-size:14px}.ovyx-as-identity[open],.ovyx-as-legacy-conversion[open],.ovyx-as-report-details[open]{padding-bottom:10px}.ovyx-as-identity>.ovyx-app-brand-dna{max-width:none!important;width:calc(100% - 20px)!important;margin:0 10px 0!important;border:0!important;box-shadow:none!important;background:transparent!important;padding:12px!important}.ovyx-as-identity .ovyx-app-brand-dna__heading{padding-bottom:12px}.ovyx-as-identity .ovyx-app-brand-dna__intro{max-width:720px}.ovyx-as-identity .ovyx-app-brand-dna__footer{flex-wrap:wrap}.ovyx-as-identity .ovyx-app-brand-dna__actions{display:flex;gap:7px;flex-wrap:wrap}.ovyx-as-identity .ovyx-app-brand-dna__actions button{transition:transform .16s ease,border-color .16s ease,background .16s ease}.ovyx-as-identity .ovyx-app-brand-dna__actions button:hover{transform:translateY(-1px)}',
      '.ovyx-ua-header .ovyx-ua-chip{display:none!important}.ovyx-lb-panel>.ovyx-lb-heading>.ovyx-lb-eyebrow,.ovyx-lb-release>.ovyx-lb-release-heading>.ovyx-lb-eyebrow{display:none!important}.ovyx-ua-panel{max-width:none!important;margin:0 auto!important;padding:clamp(15px,2.3vw,25px)!important;border-color:rgba(255,255,255,.105)!important;border-radius:21px!important;background:linear-gradient(145deg,rgba(18,23,32,.96),rgba(8,11,17,.97))!important;box-shadow:0 18px 48px rgba(0,0,0,.17)!important}.ovyx-ua-panel .ovyx-ua-eyebrow{letter-spacing:.17em}.ovyx-ua-panel h3{font-size:clamp(19px,2vw,24px)!important;letter-spacing:-.025em}.ovyx-ua-panel .ovyx-ua-input{min-height:45px;border-radius:11px!important;background:#080b11!important;border-color:rgba(255,255,255,.14)!important}.ovyx-ua-primary,.ovyx-lb-generate{min-height:45px;border-radius:11px!important;background:linear-gradient(135deg,#d5bd8a,#a58a54)!important;border-color:#c2a36b!important;color:#18150d!important;box-shadow:0 7px 22px rgba(194,163,107,.12);transition:transform .17s ease,filter .17s ease,box-shadow .17s ease}.ovyx-ua-primary:hover,.ovyx-lb-generate:hover{transform:translateY(-1px);filter:brightness(1.035);box-shadow:0 10px 25px rgba(194,163,107,.17)}.ovyx-ua-primary:disabled,.ovyx-lb-generate:disabled{transform:none;filter:none;box-shadow:none}',
      '.ovyx-ua-stats{gap:9px!important}.ovyx-ua-stat{min-height:74px;padding:14px!important;border-color:rgba(255,255,255,.08)!important;border-radius:13px!important;background:linear-gradient(145deg,rgba(255,255,255,.045),rgba(255,255,255,.015))!important}.ovyx-ua-stat strong{font-size:clamp(19px,2vw,25px)!important;letter-spacing:-.04em}.ovyx-ua-section{border-color:rgba(255,255,255,.08)!important;border-radius:14px!important;background:rgba(0,0,0,.16)!important}.ovyx-ua-page,.ovyx-ua-asset{border-radius:10px!important;background:rgba(255,255,255,.018)!important}.ovyx-ua-color{border-radius:10px!important;background:rgba(255,255,255,.025)}',
      '.ovyx-as-report-details{margin-top:3px}.ovyx-as-report-details__body{display:grid;gap:9px;padding:2px 12px 10px}.ovyx-as-report-details__body>.ovyx-ua-section{margin:0}.ovyx-as-report-details__body>.ovyx-ua-report-foot{padding:7px 2px}.ovyx-as-report-details__body .ovyx-ua-assets{max-height:420px;overflow:auto;padding-right:4px}',
      '.ovyx-lb-panel{max-width:none!important;margin:0 auto!important;padding:clamp(15px,2.5vw,27px)!important;border-radius:22px!important;border-color:rgba(194,163,107,.24)!important;background:radial-gradient(ellipse at 96% 0%,rgba(194,163,107,.07),transparent 30%),linear-gradient(150deg,rgba(17,22,31,.98),rgba(6,9,14,.98))!important;box-shadow:0 22px 62px rgba(0,0,0,.22)!important}.ovyx-lb-heading h4{font-size:clamp(20px,2.3vw,27px)!important;letter-spacing:-.035em}.ovyx-lb-muted{font-size:12px!important;line-height:1.7!important}.ovyx-lb-form{margin-top:20px!important}.ovyx-lb-input{min-height:45px;border-radius:11px!important;background:#080b11!important;border-color:rgba(255,255,255,.14)!important}.ovyx-lb-preview{margin-top:18px!important;padding:12px!important;border-radius:15px!important;border-color:rgba(255,255,255,.1)!important;background:linear-gradient(160deg,rgba(0,0,0,.3),rgba(255,255,255,.018))!important}.ovyx-lb-preview-header{padding:3px 2px 11px!important;letter-spacing:.09em!important}.ovyx-lb-frame{border-radius:11px!important;border-color:#323b48!important;box-shadow:0 8px 26px rgba(0,0,0,.2)}.ovyx-lb-project-actions{align-items:center!important;gap:12px!important}.ovyx-lb-save,.ovyx-lb-release-btn{min-height:42px;border-radius:11px!important;transition:transform .16s ease,filter .16s ease,border-color .16s ease}.ovyx-lb-save:hover,.ovyx-lb-release-btn:not(:disabled):hover{transform:translateY(-1px);filter:brightness(1.08)}.ovyx-lb-brain,.ovyx-lb-release{padding:clamp(13px,2vw,21px)!important;border-radius:17px!important;background:linear-gradient(145deg,rgba(255,255,255,.035),rgba(0,0,0,.1))!important;border-color:rgba(255,255,255,.09)!important}.ovyx-lb-brain-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap}.ovyx-lb-brain-run{margin-top:0!important;min-height:38px;border-radius:10px!important;transition:transform .16s ease,background .16s ease}.ovyx-lb-brain-run:hover:not(:disabled){transform:translateY(-1px)}.ovyx-lb-release{border-color:rgba(110,231,183,.16)!important;background:radial-gradient(ellipse at 100% 0%,rgba(110,231,183,.045),transparent 28%),linear-gradient(145deg,rgba(9,20,19,.7),rgba(8,11,17,.8))!important}.ovyx-lb-release-subheading{margin-top:20px!important;padding-top:16px!important}.ovyx-lb-release-btn{padding:11px 14px!important}.ovyx-lb-release-btn.publish{background:linear-gradient(135deg,rgba(194,163,107,.19),rgba(79,54,17,.52))!important}.ovyx-lb-release-diagnostics{margin-top:13px!important}.ovyx-lb-mobile-grid{gap:14px!important}.ovyx-lb-capabilities{max-width:1000px;font-size:10px!important;line-height:1.7!important;color:#929eae!important}',
      '#view-appstudio :is(.ovyx-as-workspace-nav__label,.ovyx-as-workspace-action,.ovyx-as-workspace-status,.ovyx-as-project-state__item span,.ovyx-as-project-state__item strong,.ovyx-as-hero__desc,.ovyx-as-hero__helper,.ovyx-as-flow__copy b,.ovyx-as-flow__copy small,.ovyx-as-flow__state,.ovyx-as-disclosure__copy,.ovyx-as-disclosure__hint){font-size:clamp(12px,.9vw,14px)!important;line-height:1.55!important}#view-appstudio :is(.ovyx-ua-panel p,.ovyx-ua-panel label,.ovyx-lb-panel p,.ovyx-lb-panel label,.ovyx-lb-brain p,.ovyx-lb-release p){font-size:clamp(13px,1vw,15px)!important;line-height:1.65!important;color:#c0c8d3!important}#view-appstudio :is(.ovyx-ua-panel input,.ovyx-ua-panel select,.ovyx-ua-panel textarea,.ovyx-lb-panel input,.ovyx-lb-panel select,.ovyx-lb-panel textarea){font-size:14px!important;min-height:44px!important}',
      '#view-appstudio :is(input,textarea,select,button,a,summary):focus-visible{outline:2px solid #d5bd8a!important;outline-offset:3px!important}#view-appstudio button{transition:transform .16s ease,filter .16s ease,border-color .16s ease}#view-appstudio button:hover:not(:disabled){filter:brightness(1.045)}#view-appstudio button:disabled{cursor:not-allowed!important}#view-appstudio ::selection{background:rgba(194,163,107,.3);color:#fff}',
      '@keyframes ovyx-as-rise{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:translateY(0)}}@media(max-width:780px){.ovyx-as-flow{grid-template-columns:repeat(2,minmax(0,1fr));margin-top:18px}.ovyx-as-flow>a{padding:11px}.ovyx-as-hero__mark{flex-basis:60px;width:60px;height:60px;border-radius:17px;padding:9px}.ovyx-as-disclosure__summary{gap:9px;padding:12px}.ovyx-as-disclosure__hint{max-width:42%;font-size:9px}.ovyx-as-identity>.ovyx-app-brand-dna{width:100%!important;margin:0!important}.ovyx-as-hero__desc{line-height:1.65}}@media(max-width:480px){.ovyx-as-hero__top{align-items:flex-start}.ovyx-as-hero__mark{flex-basis:42px;width:42px;height:42px;gap:3px;padding:7px;border-radius:13px}.ovyx-as-hero__copy{min-width:0}.ovyx-as-hero h1{font-size:28px}.ovyx-as-flow{gap:6px}.ovyx-as-flow>a{grid-template-columns:28px minmax(0,1fr);column-gap:7px;padding:9px}.ovyx-as-flow__number{width:28px;height:28px}.ovyx-as-flow__copy b{font-size:11px}.ovyx-as-flow__copy small{font-size:9px}.ovyx-as-flow__state{font-size:8px}.ovyx-as-disclosure__summary{min-height:62px}.ovyx-as-disclosure__hint{display:none}.ovyx-as-disclosure__copy{font-size:12px}.ovyx-ua-stats{grid-template-columns:repeat(2,minmax(0,1fr))!important}.ovyx-lb-preview-header{align-items:flex-start}.ovyx-lb-preview-header span{max-width:48%;text-align:right}}@media(prefers-reduced-motion:reduce){#view-appstudio{scroll-behavior:auto!important}#view-appstudio *,#view-appstudio *::before,#view-appstudio *::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}',
      '#view-appstudio .ovyx-as-stage-meta{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin:0 0 15px;padding:0 0 12px;border-bottom:1px solid rgba(255,255,255,.075)}#view-appstudio .ovyx-as-stage-meta__index{display:grid;place-items:center;width:28px;height:28px;border:1px solid rgba(194,163,107,.32);border-radius:9px;background:rgba(194,163,107,.08);color:#d5bd8a;font:800 10px/1 ui-monospace,monospace}#view-appstudio .ovyx-as-stage-meta__label{color:#c2a36b;font:800 9px/1.4 ui-monospace,monospace;letter-spacing:.16em}#view-appstudio .ovyx-as-stage-meta__title{color:#edf0f4;font-size:13px;font-weight:750;letter-spacing:-.015em}#view-appstudio .ovyx-as-stage-meta__status{margin-left:auto;padding:5px 9px;border:1px solid rgba(255,255,255,.1);border-radius:999px;background:rgba(255,255,255,.035);color:#aeb8c7;font-size:10px;font-weight:650;line-height:1.3}#view-appstudio .ovyx-as-stage-meta__status:empty{display:none}#view-appstudio #ovyx-app-studio-link-builder>.ovyx-as-stage-meta{margin-bottom:17px}#view-appstudio #ovyx-app-studio-project-brain>.ovyx-as-stage-meta,#view-appstudio #ovyx-app-studio-release>.ovyx-as-stage-meta{margin-bottom:12px}#view-appstudio .ovyx-lb-release-actions{align-items:stretch}#view-appstudio .ovyx-lb-release-btn{min-width:min(100%,150px)}#view-appstudio .ovyx-lb-release-subheading{display:grid;gap:4px}#view-appstudio .ovyx-lb-brain-findings[open],#view-appstudio .ovyx-lb-brain-graph[open]{padding:8px 10px 10px;border:1px solid rgba(255,255,255,.075);border-radius:11px;background:rgba(255,255,255,.018)}#view-appstudio .ovyx-lb-brain-findings summary,#view-appstudio .ovyx-lb-brain-graph summary{display:flex;align-items:center;min-height:34px}#view-appstudio .ovyx-lb-preview[hidden]{display:none!important}#view-appstudio :is(.ovyx-ua-panel,.ovyx-lb-panel,.ovyx-as-disclosure){scroll-margin-top:18px}@media(max-width:620px){#view-appstudio .ovyx-as-stage-meta{gap:7px;margin-bottom:11px;padding-bottom:10px}#view-appstudio .ovyx-as-stage-meta__title{flex:1 1 calc(100% - 48px);order:3}#view-appstudio .ovyx-as-stage-meta__status{margin-left:auto}#view-appstudio .ovyx-lb-release-btn{min-width:0}}@media(prefers-reduced-motion:reduce){#view-appstudio .ovyx-as-stage-meta *{animation:none!important;transition:none!important}}',
      '#view-appstudio :is(.ovyx-ua-panel,.ovyx-lb-panel,.ovyx-lb-brain,.ovyx-lb-release,.ovyx-app-brand-dna){color:var(--as-text,#f4f6f8)!important;border-color:var(--as-border,rgba(255,255,255,.12))!important;background:linear-gradient(145deg,var(--as-surface,#11161f),color-mix(in srgb,var(--as-surface,#11161f) 82%,var(--as-canvas,#080b11) 18%))!important;box-shadow:0 16px 42px color-mix(in srgb,var(--as-canvas,#080b11) 76%,transparent)!important}',
      '#view-appstudio :is(.ovyx-ua-panel h3,.ovyx-ua-panel h4,.ovyx-ua-panel h5,.ovyx-lb-panel h4,.ovyx-lb-panel h5,.ovyx-lb-brain h4,.ovyx-lb-release h4,.ovyx-app-brand-dna h3,.ovyx-ua-brand-name,.ovyx-ua-stat strong){color:var(--as-text,#f4f6f8)!important}',
      '#view-appstudio :is(.ovyx-ua-panel p,.ovyx-ua-panel label,.ovyx-ua-panel li,.ovyx-lb-panel p,.ovyx-lb-panel label,.ovyx-lb-panel li,.ovyx-lb-brain p,.ovyx-lb-release p,.ovyx-app-brand-dna,.ovyx-app-brand-dna__field,.ovyx-app-brand-dna__color){color:var(--as-muted,#aeb8c7)!important}',
      '#view-appstudio :is(.ovyx-ua-section,.ovyx-ua-stat,.ovyx-ua-page,.ovyx-ua-asset,.ovyx-ua-color,.ovyx-lb-preview,.ovyx-lb-source-file,.ovyx-lb-release-diagnostics,.ovyx-app-brand-dna__logo-preview,.ovyx-app-brand-dna__swatch){border-color:var(--as-border,rgba(255,255,255,.12))!important;background:color-mix(in srgb,var(--as-surface,#11161f) 88%,var(--as-text,#f4f6f8) 12%)!important;color:var(--as-text,#f4f6f8)!important}',
      '#view-appstudio :is(.ovyx-ua-input,.ovyx-lb-input,.ovyx-app-brand-dna input[type=text],.ovyx-app-brand-dna textarea,.ovyx-app-brand-dna input[type=color]){color:var(--as-text,#f4f6f8)!important;background:var(--as-canvas,#080b11)!important;border:1px solid var(--as-border,rgba(255,255,255,.14))!important;box-shadow:none!important;min-height:44px!important}#view-appstudio :is(.ovyx-ua-input,.ovyx-lb-input,.ovyx-app-brand-dna input[type=text],.ovyx-app-brand-dna textarea)::placeholder{color:var(--as-muted,#aeb8c7)!important;opacity:.8}',
      '#view-appstudio :is(.ovyx-ua-primary,.ovyx-lb-generate,.ovyx-lb-brain-run,.ovyx-lb-release-btn.publish,.ovyx-app-brand-dna__actions [data-brand-save]){background:linear-gradient(135deg,#d7c18f,#b89a60)!important;border:1px solid #b89a60!important;color:#17140e!important;box-shadow:0 7px 20px rgba(194,163,107,.13)!important}#view-appstudio :is(.ovyx-ua-secondary,.ovyx-lb-save,.ovyx-lb-release-btn.secondary,.ovyx-app-brand-dna__actions button,.ovyx-app-brand-dna__upload button){background:color-mix(in srgb,var(--as-surface,#11161f) 90%,var(--as-text,#f4f6f8) 10%)!important;border:1px solid var(--as-border,rgba(255,255,255,.14))!important;color:var(--as-text,#f4f6f8)!important}',
      '#view-appstudio :is(.ovyx-ua-status,.ovyx-lb-status,.ovyx-lb-brain-summary,.ovyx-lb-capabilities,.ovyx-app-brand-dna__footer [data-brand-status]){color:var(--as-muted,#aeb8c7)!important}#view-appstudio :is(.ovyx-ua-status[data-kind=success],.ovyx-lb-status[data-kind=success],.ovyx-app-brand-dna__footer [data-kind=success]){color:#21845b!important}#view-appstudio :is(.ovyx-ua-status[data-kind=error],.ovyx-lb-status[data-kind=error],.ovyx-app-brand-dna__footer [data-kind=error]){color:#c44949!important}#view-appstudio :is(.ovyx-ua-status[data-kind=busy],.ovyx-lb-status[data-kind=busy],.ovyx-app-brand-dna__footer [data-kind=busy]){color:#a47724!important}',
      '#view-appstudio :is(.ovyx-lb-preview-header,.ovyx-lb-preview-header span,.ovyx-lb-files summary,.ovyx-lb-brain-graph summary,.ovyx-lb-brain-findings summary,.ovyx-lb-source-file strong,.ovyx-lb-brain-finding){color:var(--as-text,#f4f6f8)!important}#view-appstudio :is(.ovyx-lb-brain-evidence,.ovyx-lb-brain-file){overflow-wrap:anywhere}',
      '#view-appstudio :is(.ovyx-ua-panel,.ovyx-lb-panel,.ovyx-app-brand-dna) :is(button,input,textarea,select,a,summary):focus-visible{outline:2px solid var(--as-accent,#c2a36b)!important;outline-offset:3px!important}#view-appstudio :is(.ovyx-ua-panel,.ovyx-lb-panel,.ovyx-app-brand-dna) button{max-width:100%;white-space:normal;transition:transform .17s ease,filter .17s ease,box-shadow .17s ease}#view-appstudio :is(.ovyx-ua-panel,.ovyx-lb-panel,.ovyx-app-brand-dna) button:hover:not(:disabled){transform:translateY(-1px)}',
      '@media(max-width:720px){#view-appstudio .ovyx-ua-form,#view-appstudio .ovyx-lb-form{align-items:stretch;flex-direction:column}#view-appstudio :is(.ovyx-ua-primary,.ovyx-lb-generate){width:100%}#view-appstudio .ovyx-lb-release-actions{display:flex;flex-wrap:wrap;gap:8px}#view-appstudio .ovyx-lb-release-actions>*{flex:1 1 145px;min-width:0}#view-appstudio .ovyx-app-brand-dna__grid{grid-template-columns:minmax(0,1fr)}#view-appstudio .ovyx-app-brand-dna__footer{align-items:stretch;flex-direction:column}}@media(max-width:420px){#view-appstudio .ovyx-app-brand-dna__colors{grid-template-columns:repeat(3,minmax(0,1fr))}#view-appstudio .ovyx-lb-project-actions>*{flex:1 1 100%}}',
      '#view-appstudio .ovyx-ua-header{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:16px}#view-appstudio .ovyx-ua-eyebrow,#view-appstudio .ovyx-lb-eyebrow{font-size:10px;letter-spacing:.13em;font-weight:800;color:var(--as-accent,#c2a36b)}#view-appstudio .ovyx-ua-form,#view-appstudio .ovyx-lb-form{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:10px;padding:13px;border:1px solid var(--as-border,rgba(255,255,255,.12));border-radius:14px;background:color-mix(in srgb,var(--as-surface,#11161f) 82%,var(--as-canvas,#080b11) 18%)}#view-appstudio :is(.ovyx-ua-label,.ovyx-lb-label){display:grid;gap:7px;font-size:12px;font-weight:700;color:var(--as-text,#f4f6f8)}#view-appstudio .ovyx-ua-results{display:grid;gap:13px;margin-top:16px}#view-appstudio .ovyx-ua-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}#view-appstudio .ovyx-ua-stat{display:grid;gap:5px;min-width:0;padding:13px;border:1px solid var(--as-border,rgba(255,255,255,.12));border-radius:12px;background:color-mix(in srgb,var(--as-surface,#11161f) 88%,var(--as-text,#fff) 12%)}#view-appstudio .ovyx-ua-stat strong{font-size:clamp(18px,2.5vw,24px);font-variant-numeric:tabular-nums;line-height:1.1}#view-appstudio .ovyx-ua-stat span{font-size:10px;line-height:1.35;color:var(--as-muted,#aeb8c7)}#view-appstudio .ovyx-ua-brand-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}#view-appstudio :is(.ovyx-ua-section,.ovyx-ua-pages,.ovyx-ua-assets){min-width:0;padding:14px;border:1px solid var(--as-border,rgba(255,255,255,.12));border-radius:14px;background:color-mix(in srgb,var(--as-surface,#11161f) 91%,var(--as-text,#fff) 9%)}#view-appstudio .ovyx-ua-section__title{margin:0 0 7px;font-size:13px;font-weight:750;letter-spacing:-.01em}#view-appstudio :is(.ovyx-ua-pages,.ovyx-ua-assets){display:grid;gap:8px}#view-appstudio :is(.ovyx-ua-page,.ovyx-ua-asset){min-width:0;padding:11px 12px;border:1px solid var(--as-border,rgba(255,255,255,.12));border-radius:10px;background:color-mix(in srgb,var(--as-surface,#11161f) 86%,var(--as-canvas,#080b11) 14%);transition:border-color .18s ease,transform .18s ease}#view-appstudio :is(.ovyx-ua-page,.ovyx-ua-asset):hover{border-color:color-mix(in srgb,var(--as-accent,#c2a36b) 48%,var(--as-border,transparent));transform:translateY(-1px)}#view-appstudio :is(.ovyx-ua-page__heading,.ovyx-ua-page__link,.ovyx-ua-asset__url){overflow-wrap:anywhere}#view-appstudio .ovyx-ua-list{display:grid;gap:6px;padding-left:18px}#view-appstudio .ovyx-ua-notice{padding:11px 12px;border:1px solid var(--as-border,rgba(255,255,255,.12));border-radius:11px;background:color-mix(in srgb,var(--as-surface,#11161f) 86%,var(--as-canvas,#080b11) 14%)}',
      '#view-appstudio .ovyx-lb-heading{display:grid;gap:6px;margin-bottom:15px}#view-appstudio .ovyx-lb-form{grid-template-columns:repeat(2,minmax(0,1fr))}#view-appstudio .ovyx-lb-form .ovyx-lb-generate{grid-column:1/-1;justify-self:start;min-width:min(100%,190px)}#view-appstudio .ovyx-lb-preview{overflow:hidden;border:1px solid var(--as-border,rgba(255,255,255,.12));border-radius:15px}#view-appstudio .ovyx-lb-preview-header{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;border-bottom:1px solid var(--as-border,rgba(255,255,255,.12));background:color-mix(in srgb,var(--as-surface,#11161f) 86%,var(--as-text,#fff) 14%)}#view-appstudio .ovyx-lb-frame{display:block;width:100%;min-height:320px;background:var(--as-canvas,#080b11)}#view-appstudio .ovyx-lb-files,#view-appstudio .ovyx-lb-source-list{display:grid;gap:7px;padding:12px;border:1px solid var(--as-border,rgba(255,255,255,.12));border-radius:13px;background:color-mix(in srgb,var(--as-surface,#11161f) 91%,var(--as-text,#fff) 9%)}#view-appstudio .ovyx-lb-files summary{cursor:pointer;font-size:12px;font-weight:750}#view-appstudio .ovyx-lb-source-file{display:flex;align-items:center;justify-content:space-between;gap:10px;min-width:0;padding:9px 10px;border:1px solid var(--as-border,rgba(255,255,255,.12));border-radius:9px;overflow-wrap:anywhere}#view-appstudio .ovyx-lb-brain-heading,#view-appstudio .ovyx-lb-release-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}#view-appstudio .ovyx-lb-brain-summary{padding:12px 14px;border:1px solid var(--as-border,rgba(255,255,255,.12));border-radius:12px;background:color-mix(in srgb,var(--as-surface,#11161f) 86%,var(--as-canvas,#080b11) 14%);line-height:1.55}#view-appstudio .ovyx-lb-brain-list{display:grid;gap:8px;margin:10px 0 0;padding:0;list-style:none}#view-appstudio .ovyx-lb-brain-finding{display:grid;gap:7px;padding:12px;border:1px solid var(--as-border,rgba(255,255,255,.12));border-radius:11px;background:color-mix(in srgb,var(--as-surface,#11161f) 90%,var(--as-text,#fff) 10%)}#view-appstudio .ovyx-lb-brain-severity{width:max-content;max-width:100%;padding:3px 8px;border:1px solid var(--as-border,rgba(255,255,255,.14));border-radius:999px;font-size:10px;font-weight:800}#view-appstudio .ovyx-lb-brain-file,#view-appstudio .ovyx-lb-brain-evidence{font-size:11px;line-height:1.55;color:var(--as-muted,#aeb8c7)}#view-appstudio .ovyx-lb-release-subheading{margin:12px 0 8px}#view-appstudio .ovyx-lb-release-diagnostics{display:grid;gap:8px;padding:13px;border:1px solid var(--as-border,rgba(255,255,255,.12));border-radius:12px;background:color-mix(in srgb,var(--as-surface,#11161f) 90%,var(--as-text,#fff) 10%)}#view-appstudio .ovyx-lb-mobile-grid,#view-appstudio .ovyx-lb-platforms{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}#view-appstudio .ovyx-lb-platform{min-width:0;padding:12px;border:1px solid var(--as-border,rgba(255,255,255,.12));border-radius:11px;background:color-mix(in srgb,var(--as-surface,#11161f) 88%,var(--as-text,#fff) 12%)}',
      '#view-appstudio .ovyx-app-brand-dna__heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:15px}#view-appstudio .ovyx-app-brand-dna__grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px}#view-appstudio .ovyx-app-brand-dna__field{display:grid;align-content:start;gap:7px;min-width:0;padding:12px;border:1px solid var(--as-border,rgba(255,255,255,.12));border-radius:12px;background:color-mix(in srgb,var(--as-surface,#11161f) 90%,var(--as-text,#fff) 10%)}#view-appstudio .ovyx-app-brand-dna__logo-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap}#view-appstudio .ovyx-app-brand-dna__logo-preview{display:grid;place-items:center;min-width:68px;min-height:68px;border:1px solid var(--as-border,rgba(255,255,255,.12));border-radius:12px;background:color-mix(in srgb,var(--as-surface,#11161f) 82%,var(--as-canvas,#080b11) 18%)}#view-appstudio .ovyx-app-brand-dna__colors{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}#view-appstudio .ovyx-app-brand-dna__color{display:grid;gap:7px;min-width:0;padding:9px;border:1px solid var(--as-border,rgba(255,255,255,.12));border-radius:10px;background:color-mix(in srgb,var(--as-surface,#11161f) 90%,var(--as-text,#fff) 10%)}#view-appstudio .ovyx-app-brand-dna__swatch{width:100%;height:32px;border-radius:7px;border:1px solid var(--as-border,rgba(255,255,255,.2))}#view-appstudio .ovyx-app-brand-dna__rules{display:grid;gap:8px}#view-appstudio .ovyx-app-brand-dna__footer{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:14px;padding-top:12px;border-top:1px solid var(--as-border,rgba(255,255,255,.12))}',
      '@media(max-width:760px){#view-appstudio .ovyx-ua-stats{grid-template-columns:repeat(2,minmax(0,1fr))}#view-appstudio .ovyx-lb-form{grid-template-columns:minmax(0,1fr)}#view-appstudio .ovyx-lb-form .ovyx-lb-generate{grid-column:auto;width:100%}#view-appstudio :is(.ovyx-lb-mobile-grid,.ovyx-lb-platforms){grid-template-columns:minmax(0,1fr)}#view-appstudio .ovyx-app-brand-dna__grid{grid-template-columns:minmax(0,1fr)}}@media(max-width:460px){#view-appstudio :is(.ovyx-ua-stat,.ovyx-ua-section,.ovyx-lb-brain-finding,.ovyx-lb-release-diagnostics){padding:10px}#view-appstudio .ovyx-ua-form{grid-template-columns:minmax(0,1fr)}#view-appstudio .ovyx-ua-form .ovyx-ua-primary{width:100%}#view-appstudio .ovyx-app-brand-dna__colors{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(prefers-reduced-motion:reduce){#view-appstudio :is(.ovyx-ua-page,.ovyx-ua-asset){transition:none!important;transform:none!important}}'
    ].join('\n');
    document.head.appendChild(style);
  }


  function enhanceStages(root) {
    const stages = [
      { id: 'ovyx-app-studio-url-analyzer-panel', number: '01', label: 'SOURCE', title: 'Understand the website', status: () => window.__OVYX_URL_ANALYZER_LAST_REPORT__ ? 'Reviewed' : 'Waiting' },
      { id: 'ovyx-app-studio-link-builder', number: '02', label: 'CREATE', title: 'Build your app', status: () => window.__OVYX_APP_STUDIO_GENERATED_PROJECT__ ? 'App created' : window.__OVYX_URL_ANALYZER_LAST_REPORT__ ? 'Ready to build' : 'Waiting' },
      { id: 'ovyx-app-studio-project-brain', number: '03', label: 'QUALITY', title: 'Check app behaviour', status: () => {
        const report = window.__OVYX_PROJECT_BRAIN_REPORT__;
        return !report ? 'Not checked' : report.status === 'failed' ? 'Failed checks' : report.status === 'needs-attention' ? 'Review needed' : report.summary?.runtimeChecked ? 'Verified' : 'Source checked';
      } },
      { id: 'ovyx-app-studio-release', number: '04', label: 'RELEASE', title: 'Prepare for launch', status: () => {
        const project = window.__OVYX_APP_STUDIO_GENERATED_PROJECT__;
        const state = project?.releaseState || {};
        const production = state.web?.production;
        const live = production && production.action === 'publish' && ['active','success','deployed','completed'].includes(String(production.status || '').toLowerCase());
        return live ? 'Published' : project?.savedToProjects ? 'Saved · ready' : project ? 'Ready when you are' : 'Waiting';
      } }
    ];
    for (const stage of stages) {
      const panel = document.getElementById(stage.id);
      if (!panel || !root.contains(panel)) continue;
      panel.dataset.ovyxAsStage = stage.label.toLowerCase();
      let meta = panel.querySelector(':scope > .ovyx-as-stage-meta');
      if (!meta) {
        meta = el('div', 'ovyx-as-stage-meta');
        meta.innerHTML = '<span class="ovyx-as-stage-meta__index"></span><span class="ovyx-as-stage-meta__label"></span><span class="ovyx-as-stage-meta__title"></span><span class="ovyx-as-stage-meta__status" role="status" aria-live="polite"></span>';
        panel.insertBefore(meta, panel.firstChild);
      }
      const index = $(meta, '.ovyx-as-stage-meta__index');
      const label = $(meta, '.ovyx-as-stage-meta__label');
      const title = $(meta, '.ovyx-as-stage-meta__title');
      const status = $(meta, '.ovyx-as-stage-meta__status');
      if (index) index.textContent = stage.number;
      if (label) label.textContent = stage.label;
      if (title) title.textContent = stage.title;
      if (status) status.textContent = stage.status();
    }
  }

  function refinePanelCopy(root) {
    const copy = [
      ['.ovyx-ua-panel .ovyx-ua-muted', 'Scan a public site for its pages, brand and useful assets.'],
      ['.ovyx-lb-panel > .ovyx-lb-heading > .ovyx-lb-muted', 'Create an app from the site structure and brand. Preview it before release.'],
      ['.ovyx-app-brand-dna__intro', 'Set the logo, colours and design rules for this app.']
    ];
    for (const [selector, value] of copy) {
      const target = $(root, selector);
      if (target && target.textContent.trim() !== value) target.textContent = value;
    }
  }

  function polish() {
    const root = document.querySelector(ROOT);
    if (!root || !root.isConnected) return;
    if (!document.getElementById(HERO_ID)) {
      root.insertBefore(buildHero(), root.firstElementChild);
    }
    wrapIdentity(root);
    wrapLegacyConversion(root);
    enhanceStages(root);
    refinePanelCopy(root);
    groupAnalyzerDetails(root);
    const findings = document.querySelector('#ovyx-app-studio-project-brain .ovyx-lb-brain-findings');
    if (findings && !findings.dataset.ovyxAsInitial) {
      findings.open = false;
      findings.dataset.ovyxAsInitial = 'true';
    }
    addStyles();
    refreshFlow();
  }

  function queuePolish() {
    if (refreshQueued) return;
    refreshQueued = true;
    Promise.resolve().then(() => {
      refreshQueued = false;
      polish();
    });
  }

  function init() {
    addStyles();
    polish();
    observer = new MutationObserver(queuePolish);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('click', handleStepClick);
    document.addEventListener('click', handlePaletteDisclosure, true);
    window.addEventListener('ovyx:url-analyzer-report-ready', queuePolish);
    window.addEventListener('ovyx:active-web-payload-ready', event => {
      queuePolish();
      if (event.detail?.target === 'app_studio') {
        const legacy = document.getElementById(LEGACY_ID);
        if (legacy) legacy.open = true;
        try { sessionStorage.removeItem('ovyx.appstudio.entryIntent'); } catch (_) {}
      }
    });
    window.addEventListener('ovyx:link-app-generated', queuePolish);
    window.addEventListener('ovyx:project-brain-updated', queuePolish);
    window.addEventListener('ovyx:release-state-updated', queuePolish);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
