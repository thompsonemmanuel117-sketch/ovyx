import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const baseURL=String(process.env.OVYX_E2E_BASE_URL||'').trim();
if(!baseURL)throw new Error('OVYX_E2E_BASE_URL must point to the local OVYX Pages app.');
const browser=await chromium.launch({headless:true});
try{
  for(const target of [
    {name:'desktop',viewport:{width:1440,height:960}},
    {name:'mobile',viewport:{width:390,height:844},isMobile:true,hasTouch:true}
  ]){
    const page=await browser.newPage({viewport:target.viewport,isMobile:!!target.isMobile,hasTouch:!!target.hasTouch});
    page.setDefaultTimeout(15000);
    const pageErrors=[];
    page.on('pageerror',error=>pageErrors.push(String(error?.stack||error?.message||error)));
    await page.goto(baseURL,{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForFunction(()=>{const link=document.querySelector('link[href*="ovyx-platform-design-system.css"]');if(!link?.sheet)return false;try{return Array.from(link.sheet.cssRules).some(rule=>String(rule.href||rule.cssText||'').includes('ovyx-premium-experience.css'))}catch{return false}});
    await page.waitForFunction(()=>!!document.getElementById('view-master-auth')&&!!document.getElementById('view-home'));
    const platform=await page.evaluate(()=>{
      const home=document.getElementById('view-home');
      const studio=document.getElementById('view-webstudio');
      const auth=document.getElementById('view-master-auth');
      const lockup=auth.querySelector('.ovyx-auth-diamond');
      // This is a presentation fixture, not a router test: reveal the existing
      // routed sign-in section even when the shell initially hides inactive views.
      auth.hidden=false;
      auth.removeAttribute('hidden');
      auth.classList.remove('hidden');
      auth.style.setProperty('display','block','important');
      const layout=auth.querySelector('.ovyx-auth-layout');
      const card=auth.querySelector('.ovyx-master-auth-card');
      const input=auth.querySelector('#ovyx-master-auth-email');
      const homeStyle=getComputedStyle(home);
      const studioStyle=getComputedStyle(studio);
      const authStyle=getComputedStyle(auth);
      const layoutStyle=getComputedStyle(layout);
      const cardStyle=getComputedStyle(card);
      const inputStyle=getComputedStyle(input);
      const result={
        homeWidth:home.getBoundingClientRect().width,homeViewportWidth:home.parentElement.clientWidth,
        homeMaxWidth:homeStyle.maxWidth,
        studioMaxWidth:studioStyle.maxWidth,
        studioWidth:studio.getBoundingClientRect().width,
        authVisible:authStyle.display!=='none',
        authColumns:layoutStyle.gridTemplateColumns.split(' ').length,
        cardRadius:parseFloat(cardStyle.borderTopLeftRadius),
        inputRadius:parseFloat(inputStyle.borderTopLeftRadius),
        brandTransform:getComputedStyle(lockup).transform,
        authFormPresent:!!auth.querySelector('#ovyx-master-auth-form'),
        oauthButtonsPresent:!!auth.querySelector('#ovyx-auth-google-btn')&&!!auth.querySelector('#ovyx-auth-github-btn')
      };
      auth.classList.add('hidden');
      return result;
    });
    assert.ok(platform.homeWidth>=platform.homeViewportWidth-1,'['+target.name+'] routed platform pages should use the full available width.');
    assert.equal(platform.homeMaxWidth,'none','['+target.name+'] page section must not retain a narrow max-width.');
    assert.ok(platform.studioWidth>=0,'['+target.name+'] Web Studio remains mounted.');
    assert.equal(platform.authVisible,true,'['+target.name+'] secure sign-in view should be revealable.');
    assert.ok(platform.cardRadius>=16,'['+target.name+'] sign-in card should have premium rounded geometry.');
    assert.ok(platform.inputRadius>=8,'['+target.name+'] sign-in fields should have refined rounded geometry.');
    assert.equal(platform.authFormPresent,true,'['+target.name+'] existing sign-in form must remain present.');
    assert.equal(platform.oauthButtonsPresent,true,'['+target.name+'] existing Google and GitHub sign-in actions must remain present.');
    if(target.name==='desktop')assert.ok(platform.authColumns>=2,'Desktop sign-in should retain its two-column editorial layout.');
    else assert.equal(platform.authColumns,1,'Mobile sign-in should stack into one readable column.');
    assert.deepEqual(pageErrors,[],'['+target.name+'] page must not emit browser errors.');
    console.log('OVYX premium platform experience passed on '+target.name+'.');
    await page.close();
  }

  const authRoutesPage=await browser.newPage({viewport:{width:1280,height:900}});
  const authRouteErrors=[];
  authRoutesPage.on('pageerror',error=>authRouteErrors.push(String(error?.stack||error?.message||error)));
  await authRoutesPage.goto(baseURL+'/login',{waitUntil:'domcontentloaded',timeout:60000});
  await authRoutesPage.waitForFunction(()=>window.OVYXAuthRoutes?.current()==='login',{timeout:30000});
  assert.equal(await authRoutesPage.locator('#ovyx-master-auth-form').getAttribute('data-mode'),'signin','/login must render the existing sign-in mode.');
  await authRoutesPage.locator('#ovyx-auth-create').click();
  await authRoutesPage.waitForFunction(()=>location.pathname==='/signup'&&document.getElementById('ovyx-master-auth-form')?.dataset.mode==='signup');
  assert.equal(await authRoutesPage.locator('.ovyx-auth-provider-grid').isHidden(),true,'/signup must not present OAuth providers that are existing-account-only.');
  await authRoutesPage.locator('#ovyx-auth-create').click();
  await authRoutesPage.waitForFunction(()=>location.pathname==='/login'&&document.getElementById('ovyx-master-auth-form')?.dataset.mode==='signin');
  await authRoutesPage.locator('#ovyx-auth-forgot').click();
  await authRoutesPage.waitForFunction(()=>location.pathname==='/forgot-password'&&window.OVYXAuthRoutes?.current()==='forgot');
  assert.equal(await authRoutesPage.locator('#ovyx-master-auth-password').isVisible(),false,'/forgot-password must not request a password.');
  await authRoutesPage.goto(baseURL+'/verify-email',{waitUntil:'domcontentloaded',timeout:60000});
  await authRoutesPage.waitForFunction(()=>window.OVYXAuthRoutes?.current()==='verify'&&!!document.getElementById('ovyx-auth-verify-panel')&&!document.getElementById('ovyx-auth-verify-panel').hidden,{timeout:30000});
  assert.equal(await authRoutesPage.locator('#ovyx-auth-resend-verification').isVisible(),true,'/verify-email must provide a resend action.');
  await authRoutesPage.goto(baseURL+'/auth/callback',{waitUntil:'domcontentloaded',timeout:60000});
  await authRoutesPage.waitForFunction(()=>location.pathname==='/login'&&window.OVYXAuthRoutes?.current()==='login',{timeout:30000});
  assert.deepEqual(authRouteErrors,[],'Authentication route transitions must not emit browser errors.');
  console.log('OVYX standalone login, signup, password recovery, verification and callback routes passed.');
  await authRoutesPage.close();
}finally{await browser.close();}
