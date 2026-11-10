import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseURL = String(process.env.OVYX_E2E_BASE_URL || '').trim();
if (!baseURL) throw new Error('OVYX_E2E_BASE_URL must point to the local OVYX Pages app.');

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', error => errors.push(String(error?.stack || error?.message || error)));
  await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => Array.from(document.styleSheets).some(sheet =>
    String(sheet.href || '').includes('ovyx-mobile-shell-quality.css')));
  await page.waitForFunction(() => !!document.getElementById('ovyx-v52-bottom-bar') && !!document.getElementById('view-home'));

  const result = await page.evaluate(async () => {
    window.ThemeContext?.set?.({mode:'light',backgroundColor:'#F8FAFC',sidebarColor:'#F1F3F6',cardColor:'#FFFFFF',borderColor:'#CBD5E1',textColor:'#111827',mutedColor:'#475569',accentColor:'#F59E0B'});
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    document.body.classList.add('ovyx-v88-dock-home');
    const dock = document.getElementById('ovyx-v52-bottom-bar');
    const home = dock.querySelector('[data-v52-bottom="home"]');
    const create = dock.querySelector('.v52-bottom-create');
    home.classList.add('is-active');
    dock.style.setProperty('display', 'grid', 'important');
    dock.style.setProperty('visibility', 'visible', 'important');
    dock.style.setProperty('opacity', '1', 'important');
    const rect = dock.getBoundingClientRect();
    const createRect = create.getBoundingClientRect();
    const active = getComputedStyle(home);
    const dockStyle = getComputedStyle(dock);
    const shell = document.querySelector('#view-home .v59-dashboard-shell');
    return {
      viewportWidth: document.documentElement.clientWidth,
      dockLeft: rect.left,
      dockRight: document.documentElement.clientWidth - rect.right,
      dockHeight: rect.height,
      dockBackground: dockStyle.backgroundColor,
      createHeight: createRect.height,
      createMarginTop: getComputedStyle(create).marginTop,
      activeColor: active.color,
      homeBottomPadding: shell ? getComputedStyle(shell).paddingBottom : '',
      homeTag: home.tagName,
      homeClass: home.className,
      homeStyle: home.getAttribute('style') || '',
      homeInlineColor: home.style.getPropertyValue('color'),
      homeInlineColorPriority: home.style.getPropertyPriority('color'),
      rootClass: document.documentElement.className,
      rootMode: document.documentElement.dataset.ovyxMode || '',
      bodyClass: document.body.className,
      qualityStylesheet: Array.from(document.styleSheets).map(sheet => sheet.href || 'inline').filter(href => href.includes('ovyx-mobile-shell-quality.css')),
      lightSelectorMatches: document.documentElement.matches('html:is(.ovyx-light,[data-ovyx-mode="light"])'),
      activeSelectorMatches: home.matches('#ovyx-v52-bottom-bar [data-v52-bottom="home"].is-active'),
      accentVariable: getComputedStyle(home).getPropertyValue('--accent').trim(),
      lightAccentVariable: getComputedStyle(home).getPropertyValue('--ovyx-light-accent-strong').trim(),
      matchingRules: (() => { const found = []; let order = 0; const walk = (rules, source) => Array.from(rules || []).forEach(rule => { order += 1; if (rule.cssRules) { walk(rule.cssRules, source); return; } if (!rule.selectorText || !rule.style || !rule.style.getPropertyValue('color')) return; try { if (home.matches(rule.selectorText)) found.push({ order, source, selector: rule.selectorText, color: rule.style.getPropertyValue('color'), important: rule.style.getPropertyPriority('color') }); } catch (_) {} }); Array.from(document.styleSheets).forEach(sheet => { try { walk(sheet.cssRules, sheet.href || 'inline'); } catch (_) {} }); return found.slice(-30); })()
    };
  });

  console.log('OVYX mobile dock diagnostic: ' + JSON.stringify(result));
  assert.ok(result.dockLeft >= 8 && result.dockRight >= 8,
    'Mobile dock must float inside the viewport instead of stretching edge-to-edge.');
  assert.ok(result.dockHeight >= 62 && result.dockHeight <= 66,
    'Mobile dock must remain a compact 64px control surface.');
  assert.ok(result.createHeight >= 52 && result.createHeight <= 56,
    'New action must align inside the dock without floating above it.');
  assert.equal(result.createMarginTop, '0px',
    'New action must not use the legacy negative lift.');
  assert.equal(result.activeColor, 'rgb(111, 84, 40)',
    'Light-mode active navigation text must use the contrast-safe accent.');
  assert.ok(Number.parseFloat(result.homeBottomPadding) >= 100,
    'Dashboard content must reserve at least 100px of scroll clearance for the fixed dock.');

  const authDockState = await page.evaluate(() => {
    const dock = document.getElementById('ovyx-v52-bottom-bar');
    const auth = document.getElementById('view-master-auth');
    document.body.classList.add('ovyx-auth-open');
    document.documentElement.classList.add('ovyx-auth-open');
    auth?.classList.remove('hidden');
    auth?.setAttribute('aria-hidden', 'false');
    window.OVYXDashboardNavigationAuthority?.sync();
    return {
      dockDisplay: getComputedStyle(dock).display,
      dockVisibility: getComputedStyle(dock).visibility,
      viewportPadding: getComputedStyle(document.getElementById('view-router-viewport')).paddingBottom
    };
  });
  assert.equal(authDockState.dockDisplay, 'none',
    'The Home dock must be hidden while the full-screen authentication overlay is open.');
  assert.equal(authDockState.dockVisibility, 'hidden',
    'Authentication must not leave an interactive dashboard dock underneath the login screen.');
  assert.equal(authDockState.viewportPadding, '0px',
    'The authentication screen must not inherit the dashboard dock clearance.');
  const dockMatrix = await page.evaluate(() => {
    const dock=document.getElementById('ovyx-v52-bottom-bar'),viewport=document.getElementById('view-router-viewport');
    const sections=Array.from(viewport?.querySelectorAll(':scope > section')||[]),body=document.body,root=document.documentElement;
    const drawer=document.getElementById('mobile-drawer'),backdrop=document.getElementById('mobile-drawer-backdrop');
    const runAll=()=>{window.OVYXV57?.syncDock?.();window.OVYXV58?.syncDock?.();window.OVYXMobileShellAuthority?.sync?.();window.OVYXMobileDockAuthority?.sync?.();window.OVYXDashboardNavigationAuthority?.sync?.();return getComputedStyle(dock).display;};
    const route=id=>{sections.forEach(section=>{const active=section.id==='view-'+id;section.classList.toggle('hidden',!active);if(active)section.style.removeProperty('display');});window.KernelState=window.KernelState||{};window.KernelState.activeView=id;body.classList.remove('ovyx-auth-open','ovyx-drawer-open','ovyx-mobile-drawer-open','ovyx-ws-mobile-nav-open','ovyx-v58-assistant-open');root.classList.remove('ovyx-auth-open');if(drawer){drawer.classList.add('-translate-x-full');drawer.classList.remove('open','is-open');drawer.setAttribute('aria-hidden','true');}if(backdrop){backdrop.classList.add('hidden');backdrop.setAttribute('aria-hidden','true');}const auth=document.getElementById('view-master-auth');if(auth){auth.classList.add('hidden');auth.setAttribute('aria-hidden','true');auth.style.removeProperty('display');}return runAll();};
    const home=route('home');body.classList.add('ovyx-drawer-open');if(drawer){drawer.classList.remove('-translate-x-full');drawer.setAttribute('aria-hidden','false');}const drawerOpen=runAll();
    route('home');body.classList.add('ovyx-auth-open');root.classList.add('ovyx-auth-open');const authOpen=runAll();
    route('home');body.classList.add('ovyx-v58-assistant-open');const assistantOpen=runAll();
    route('home');let management=document.getElementById('ovyx-website-management'),created=false;if(!management){management=document.createElement('div');management.id='ovyx-website-management';document.body.appendChild(management);created=true;}const oldStyle=management.getAttribute('style'),oldClass=management.getAttribute('class');management.classList.remove('hidden');management.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;display:block!important;visibility:visible!important;opacity:1!important;';const managementOpen=runAll();if(created)management.remove();else{if(oldStyle==null)management.removeAttribute('style');else management.setAttribute('style',oldStyle);if(oldClass==null)management.removeAttribute('class');else management.setAttribute('class',oldClass);}
    const appStudio=sections.some(s=>s.id==='view-appstudio')?route('appstudio'):'missing';
    route('home');
    const settingsView=document.getElementById('view-settings'),settingsOldStyle=settingsView?.getAttribute('style'),settingsWasHidden=settingsView?.classList.contains('hidden');
    if(settingsView){settingsView.classList.remove('hidden');settingsView.style.removeProperty('display');}
    const settings=runAll();
    if(settingsView){if(settingsWasHidden)settingsView.classList.add('hidden');else settingsView.classList.remove('hidden');if(settingsOldStyle==null)settingsView.removeAttribute('style');else settingsView.setAttribute('style',settingsOldStyle);}
    const adminFixture=document.createElement('div');adminFixture.id='view-admin-dock-regression-fixture';adminFixture.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;display:block!important;visibility:visible!important;opacity:1!important;';document.body.appendChild(adminFixture);
    const adminOpen=runAll();adminFixture.remove();
    const restoredHome=route('home');
    return {home,drawerOpen,authOpen,assistantOpen,managementOpen,appStudio,settings,adminOpen,restoredHome};
  });
  assert.equal(dockMatrix.home,'grid','The existing mobile dock must remain available on Home.');
  for(const key of ['drawerOpen','authOpen','assistantOpen','managementOpen','appStudio','settings','adminOpen'])assert.equal(dockMatrix[key],'none','The dashboard dock must be hidden during '+key+': '+JSON.stringify(dockMatrix));
  assert.equal(dockMatrix.restoredHome,'grid','Returning to Home must restore the existing dock.');
  const darkGoldState = await page.evaluate(async () => {
    const theme=window.ThemeContext,previous=theme?.get?.();
    theme?.set?.({mode:'dark',accentColor:'#F59E0B'});
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const host=document.querySelector('#view-home');if(!host)return 'missing';
    const probe=document.createElement('span');probe.className='text-amber-400';probe.textContent='Accent probe';host.appendChild(probe);
    const color=getComputedStyle(probe).color;probe.remove();
    if(previous)theme.set(previous);
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    return color;
  });
  assert.equal(darkGoldState,'rgb(232, 182, 79)','Platform gold utilities must use the restrained champagne brand colour.');
  const lightThemeState = await page.evaluate(async () => {
    const root=document.documentElement,theme=window.ThemeContext,previousTheme=theme?.get?.(),previousMode=root.getAttribute('data-ovyx-mode');
    if(theme?.set)theme.set({mode:'light',backgroundColor:'#F8FAFC',sidebarColor:'#F1F3F6',cardColor:'#FFFFFF',borderColor:'#CBD5E1',textColor:'#111827',mutedColor:'#475569',accentColor:'#6F5428'});
    else root.setAttribute('data-ovyx-mode','light');
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const studio=document.getElementById('view-appstudio'),surface=studio?.querySelector('.as4-shell');
    const canvas=document.getElementById('app-studio-clean-canvas'),home=document.getElementById('view-home'),probe=document.createElement('span');probe.className='text-amber-400';if(home)home.appendChild(probe);const gold=home?getComputedStyle(probe).color:'missing';probe.remove();const result={studioBackground:studio?getComputedStyle(studio).backgroundColor:'missing',studioText:studio?getComputedStyle(studio).color:'missing',canvasBackground:canvas?getComputedStyle(canvas).backgroundColor:'missing',surfaceBackground:surface?getComputedStyle(surface).backgroundColor:'missing',surfaceText:surface?getComputedStyle(surface).color:'missing',gold};
    if(previousTheme&&theme?.set)theme.set(previousTheme);else if(previousMode==null)root.removeAttribute('data-ovyx-mode');else root.setAttribute('data-ovyx-mode',previousMode);
    return result;
  });
  assert.equal(lightThemeState.studioBackground,'rgb(248, 250, 252)','App Studio must use the neutral light canvas rather than retaining its hard-coded dark gradient.');
  assert.equal(lightThemeState.studioText,'rgb(24, 33, 47)','App Studio text must remain readable in Light appearance.');
  assert.equal(lightThemeState.canvasBackground,'rgb(245, 247, 250)','The App Studio full-screen background canvas must not cover Light appearance with black.');
  assert.equal(lightThemeState.gold,'rgb(111, 84, 40)','Light appearance must preserve the selected contrast-safe muted-gold theme accent rather than bright yellow.');
  if(lightThemeState.surfaceBackground!=='missing')assert.equal(lightThemeState.surfaceBackground,'rgb(255, 255, 255)','App Studio workspace panels must become clean white surfaces in Light appearance.');

  const dashboardActionState = await page.evaluate(() => {
    const root = document.documentElement, theme = window.ThemeContext, previousTheme = theme?.get?.(), previousMode = root.getAttribute('data-ovyx-mode');
    theme?.set?.({mode:'light',backgroundColor:'#F8FAFC',sidebarColor:'#F1F3F6',cardColor:'#FFFFFF',borderColor:'#CBD5E1',textColor:'#111827',mutedColor:'#475569',accentColor:'#6F5428'});
    const home = document.getElementById('view-home');
    const probe = document.createElement('button');
    probe.className = 'v59-build-btn';
    probe.style.backgroundImage = 'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 10 10%27%3E%3Cpath d=%27M1 5h8%27 stroke=%27black%27/%3E%3C/svg%3E")';
    home?.appendChild(probe);
    const artwork = getComputedStyle(probe).backgroundImage;
    probe.remove();
    const login = Array.from(document.querySelectorAll('#ovyx-topbar button, #ovyx-topbar a, header button, header a'))
      .find(node => /^log\\s*in$/i.test((node.innerText || node.textContent || '').trim()));
    const realBuildButton = home?.querySelector('.v59-build-btn');
    const realArtwork = realBuildButton ? getComputedStyle(realBuildButton).backgroundImage : 'not-found';
    const result = { artwork, realArtwork, loginColor: login ? getComputedStyle(login).color : 'not-found' };
    if (previousTheme && theme?.set) theme.set(previousTheme);
    else if (previousMode == null) root.removeAttribute('data-ovyx-mode');
    else root.setAttribute('data-ovyx-mode', previousMode);
    return result;
  });
  assert.match(dashboardActionState.artwork, /^url\\(/, 'The dashboard Build/send action must retain its existing icon artwork.');
  assert.match(dashboardActionState.realArtwork, /^url\\(/, 'The actual dashboard Build/send button must retain its arrow artwork in Light appearance.');
  if (dashboardActionState.loginColor !== 'not-found') {
    assert.equal(dashboardActionState.loginColor, 'rgb(24, 33, 47)', 'The Log In action must remain readable in Light appearance.');
  }

  assert.deepEqual(errors, [], 'Mobile shell must not emit browser errors.');
  console.log('OVYX mobile dock geometry and light-theme browser checks passed.');
  await page.close();
} finally {
  await browser.close();
}
