import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
const notificationsScript=fs.readFileSync(new URL('../assets/ovyx-notifications.js',import.meta.url),'utf8');
const welcomeScript=fs.readFileSync(new URL('../assets/ovyx-auth-welcome.js',import.meta.url),'utf8');
const browser=await chromium.launch({headless:true});
try {
 for(const target of [{name:'desktop',viewport:{width:1280,height:900}},{name:'mobile',viewport:{width:390,height:844}}]){
  const page=await browser.newPage({viewport:target.viewport});page.setDefaultTimeout(15000);
  const errors=[],calls=[];let read=false,subscribed=false;
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://notification-fixture.test/**',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(request.isNavigationRequest()&&url.pathname==='/'){await route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main>OVYX test workspace</main></body></html>'});return;}
   if(url.pathname==='/api/settings/profile'){await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,profile:{displayName:'Amara Workspace',workspaceName:'Studio'}})});return;}
   if(url.pathname==='/api/notifications'){
    if(request.method()==='GET'){await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,unreadCount:read?0:1,notifications:[{id:'broadcast_1',title:'A new OVYX feature',body:'Your workspace has a new announcement.',category:'product',link:'https://notifications.example.test/article',createdAt:'2026-10-20T00:00:00.000Z',unread:!read}],push:{configured:true,publicKey:'BElongPublicKeyFixtureOnly',subscribed,activeDeviceCount:subscribed?1:0}})});return;}
    const payload=request.postDataJSON();calls.push(payload);if(payload.action==='read')read=true;if(payload.action==='subscribe')subscribed=true;if(payload.action==='unsubscribe')subscribed=false;
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,action:payload.action,subscribed,readAt:new Date().toISOString()})});return;
   }
   if(url.pathname==='/assets/ovyx-mark.svg'){await route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>'});return;}
   await route.fulfill({status:404,body:'not found'});
  });
  await page.goto('https://notification-fixture.test/');
  await page.evaluate(()=>{
   window.__user={uid:'notification-test-user',email:'user@example.test',displayName:'Firebase Name',metadata:{creationTime:'2025-01-01T00:00:00Z',lastSignInTime:'2026-10-20T00:00:00Z'},async getIdToken(){return'browser-test-token';}};
   window.firebase={auth(){return{get currentUser(){return window.__user;},onAuthStateChanged(callback){Promise.resolve().then(()=>callback(window.__user));return function(){};}};}};
   class FakeNotification{} FakeNotification.permission='default';FakeNotification.requestPermission=async function(){FakeNotification.permission='granted';return'granted';};
   Object.defineProperty(window,'Notification',{configurable:true,value:FakeNotification});
   const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/fixture',keys:{p256dh:'A'.repeat(87),auth:'B'.repeat(22)},toJSON(){return{endpoint:this.endpoint,keys:this.keys};},async unsubscribe(){return true;}};
   const registration={pushManager:{async getSubscription(){return null;},async subscribe(){return subscription;}}};
   Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:{async register(){return registration;},async getRegistration(){return registration;}}});
   Object.defineProperty(window,'PushManager',{configurable:true,value:function PushManager(){}});
  });
  await page.addScriptTag({content:notificationsScript});await page.addScriptTag({content:welcomeScript});
  await page.waitForSelector('#ovyx-notification-toggle');await page.waitForSelector('#ovyx-welcome-overlay');
  await page.waitForFunction(()=>document.getElementById('ovyx-welcome-title')?.textContent.includes('Amara Workspace'));
  assert.equal(await page.locator('#ovyx-notification-count').textContent(),'1','['+target.name+'] unread badge count');
  assert.equal(await page.locator('#ovyx-welcome-title').textContent(),'Welcome back, Amara Workspace!','['+target.name+'] prefer saved workspace name');
  await page.locator('#ovyx-notification-toggle').click();await page.getByText('A new OVYX feature').waitFor();
  await page.locator('#ovyx-notification-device-action').click();
  await page.waitForFunction(()=>document.getElementById('ovyx-notification-device-action')?.textContent==='Turn off on this device');
  assert.ok(calls.some(item=>item.action==='subscribe'),'['+target.name+'] phone alerts should save a subscription');
  await page.locator('[data-notification-id="broadcast_1"]').click();
  await page.waitForFunction(()=>document.getElementById('ovyx-notification-count')?.hidden===true);
  assert.ok(calls.some(item=>item.action==='read'),'['+target.name+'] opening an announcement marks it as read');
  assert.deepEqual(errors,[],'['+target.name+'] no browser errors');
  await page.close();
 }
 console.log('OVYX notification/welcome browser checks passed at desktop and mobile sizes.');
} finally {await browser.close();}
