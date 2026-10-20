(function () {
  'use strict';
  if (window.__OVYX_AUTH_WELCOME_V1__) return;
  window.__OVYX_AUTH_WELCOME_V1__ = true;
  var authRef = null, lastUid = '', activeDialog = null;
  var css = [
    '#ovyx-welcome-overlay{position:fixed;inset:0;z-index:2147482990;display:grid;place-items:center;padding:22px;background:rgba(4,6,10,.70);backdrop-filter:blur(13px);-webkit-backdrop-filter:blur(13px);animation:ovyxWelcomeFade .28s ease-out both;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}',
    '#ovyx-welcome-card{position:relative;width:min(440px,100%);overflow:hidden;padding:32px 27px 25px;border:1px solid rgba(232,182,79,.34);border-radius:25px;background:radial-gradient(circle at 50% 0,rgba(232,182,79,.12),transparent 42%),linear-gradient(145deg,#191c23,#0a0c11);color:#f9fafb;text-align:center;box-shadow:0 32px 100px rgba(0,0,0,.48);animation:ovyxWelcomeCardIn .55s cubic-bezier(.18,.86,.24,1.12) both}',
    '.ovyx-welcome-mark{position:relative;width:88px;height:88px;margin:0 auto 18px;border-radius:24px;box-shadow:0 0 0 1px rgba(232,182,79,.25),0 12px 34px rgba(232,182,79,.15);animation:ovyxWelcomeFloat 2.8s ease-in-out infinite}.ovyx-welcome-mark img{display:block;width:100%;height:100%;border-radius:inherit}.ovyx-welcome-eyebrow{color:#e8b64f;font-size:10px;letter-spacing:.22em;font-weight:900;text-transform:uppercase}.ovyx-welcome-title{margin:10px 0 0;color:#fff;font-size:clamp(23px,5vw,30px);font-weight:850;line-height:1.2;letter-spacing:-.035em;overflow-wrap:anywhere}.ovyx-welcome-name{color:#f5d58e}.ovyx-welcome-copy{max-width:320px;margin:12px auto 0;color:#aeb5c0;font-size:13px;line-height:1.65}.ovyx-welcome-rule{width:58px;height:3px;margin:23px auto;background:linear-gradient(90deg,transparent,#e8b64f,transparent);border-radius:999px}.ovyx-welcome-continue{width:100%;margin-top:2px;padding:13px 18px;border:1px solid #f0cb77;border-radius:12px;background:linear-gradient(135deg,#f5d995,#d9a641);color:#19150c;font:800 13px/1.2 Inter,system-ui,sans-serif;cursor:pointer;box-shadow:0 8px 24px rgba(232,182,79,.16)}.ovyx-welcome-continue:hover{filter:brightness(1.05)}.ovyx-welcome-continue:focus-visible{outline:3px solid #fff;outline-offset:3px}',
    '@keyframes ovyxWelcomeFade{from{opacity:0}to{opacity:1}}@keyframes ovyxWelcomeCardIn{from{opacity:0;transform:translateY(16px) scale(.96);filter:blur(4px)}to{opacity:1;transform:translateY(0) scale(1);filter:blur(0)}}@keyframes ovyxWelcomeFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}@media(prefers-reduced-motion:reduce){#ovyx-welcome-overlay,#ovyx-welcome-card,.ovyx-welcome-mark{animation:none!important}}'
  ].join('');
  function clean(v,max){return String(v==null?'':v).replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max||160);}
  function addStyles(){if(document.getElementById('ovyx-welcome-style'))return;var style=document.createElement('style');style.id='ovyx-welcome-style';style.textContent=css;document.head.appendChild(style);}
  function currentUid(){try{var auth=window.firebase&&typeof window.firebase.auth==='function'&&window.firebase.auth();return String(auth&&auth.currentUser&&auth.currentUser.uid||'');}catch(_){return'';}}
  async function resolveName(user){
    var fallback=clean(user&&(user.displayName||user.email),160)||'there';
    try{var token=await user.getIdToken(false),controller=new AbortController(),timeout=window.setTimeout(function(){controller.abort();},3500);
      try{var response=await fetch('/api/settings/profile',{method:'GET',headers:{Accept:'application/json',Authorization:'Bearer '+token},cache:'no-store',signal:controller.signal});var result=await response.json().catch(function(){return{};});if(response.ok&&result.ok!==false&&result.profile&&clean(result.profile.displayName,160))return clean(result.profile.displayName,160);}
      finally{window.clearTimeout(timeout);}
    }catch(_){}
    return fallback;
  }
  function isNewAccount(user){var created=Date.parse(String(user&&user.metadata&&user.metadata.creationTime||'')),signed=Date.parse(String(user&&user.metadata&&user.metadata.lastSignInTime||''));return Number.isFinite(created)&&(!Number.isFinite(signed)||Math.abs(signed-created)<10*60*1000);}
  function dismiss(){if(!activeDialog)return;var overlay=activeDialog;activeDialog=null;overlay.style.opacity='0';window.setTimeout(function(){overlay.remove();},220);}
  async function show(user){
    if(!user||!user.uid||activeDialog||!document.body)return;
    var marker='ovyx.welcome.v1.'+clean(user.uid,180);try{if(sessionStorage.getItem(marker)==='1')return;sessionStorage.setItem(marker,'1');}catch(_){}
    var name=await resolveName(user);if(!name||!document.body||currentUid()!==String(user.uid))return;
    addStyles();var overlay=document.createElement('div');overlay.id='ovyx-welcome-overlay';overlay.setAttribute('role','presentation');
    overlay.innerHTML='<section id="ovyx-welcome-card" role="dialog" aria-modal="true" aria-labelledby="ovyx-welcome-title" aria-describedby="ovyx-welcome-copy"><div class="ovyx-welcome-mark"><img src="/assets/ovyx-mark.svg" alt="OVYX" width="88" height="88"></div><div class="ovyx-welcome-eyebrow">Your workspace is ready</div><h1 class="ovyx-welcome-title" id="ovyx-welcome-title"></h1><p class="ovyx-welcome-copy" id="ovyx-welcome-copy">Your projects, tools, and workspace are ready when you are.</p><div class="ovyx-welcome-rule" aria-hidden="true"></div><button type="button" class="ovyx-welcome-continue" id="ovyx-welcome-continue">Continue to workspace</button></section>';
    overlay.querySelector('#ovyx-welcome-title').textContent=(isNewAccount(user)?'Welcome to OVYX, ':'Welcome back, ')+name+'!';
    overlay.querySelector('#ovyx-welcome-continue').addEventListener('click',dismiss);
    overlay.addEventListener('click',function(event){if(event.target===overlay)dismiss();});
    function escape(event){if(event.key==='Escape'&&activeDialog===overlay){document.removeEventListener('keydown',escape);dismiss();}}
    document.addEventListener('keydown',escape);document.body.appendChild(overlay);activeDialog=overlay;overlay.querySelector('#ovyx-welcome-continue').focus({preventScroll:true});
  }
  function bindAuth(){var auth=null;try{auth=window.firebase&&typeof window.firebase.auth==='function'?window.firebase.auth():null;}catch(_){}if(!auth||typeof auth.onAuthStateChanged!=='function')return false;if(authRef===auth)return true;authRef=auth;auth.onAuthStateChanged(function(user){if(!user){if(lastUid)try{sessionStorage.removeItem('ovyx.welcome.v1.'+clean(lastUid,180));}catch(_){}lastUid='';dismiss();return;}if(lastUid&&lastUid!==String(user.uid))try{sessionStorage.removeItem('ovyx.welcome.v1.'+clean(lastUid,180));}catch(_){}lastUid=String(user.uid||'');show(user);});return true;}
  function boot(n){if(bindAuth())return;if(n<70)window.setTimeout(function(){boot(n+1);},200);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){boot(0);},{once:true});else boot(0);
  window.addEventListener('firebase-auth-state-ready',function(){window.setTimeout(function(){boot(0);},0);});
})();