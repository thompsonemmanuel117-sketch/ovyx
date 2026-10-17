(function () {
  'use strict';
  if (window.__OVYX_APP_STUDIO_BRAND_DNA_V1__) return;
  window.__OVYX_APP_STUDIO_BRAND_DNA_V1__ = true;
  const API = '/api/app-studio/brand-profile';
  const PANEL_ID = 'ovyx-app-studio-brand-dna-panel';
  const nativeFetch = window.fetch.bind(window);
  const keys = ['primary', 'secondary', 'accent', 'background', 'surface', 'text', 'muted'];
  const state = { appName: '', appId: '', boundId: '', logoDataUrl: null, colors: {}, layoutRules: [], dirty: false, hasProfile: false };
  const q = (root, selector) => root.querySelector(selector);
  const clean = (value, max) => String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max || 160);
  const validHex = value => /^#[0-9a-f]{6}$/i.test(String(value || ''));
  const $auth = () => { try { return window.firebase && window.firebase.auth && window.firebase.auth().currentUser || null; } catch (_) { return null; } };
  function setStatus(message, kind) {
    const panel = document.getElementById(PANEL_ID), status = panel && q(panel, '[data-brand-status]');
    if (status) { status.textContent = String(message || ''); status.dataset.kind = kind || 'info'; }
  }
  function notify(message, kind) {
    try { const fn = window.showToast || window.toast; if (typeof fn === 'function') fn(message, kind || 'info'); } catch (_) {}
  }
  function slug(value) { return clean(value, 100).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'app'; }
  function hue(name) { let n=2166136261; for (const c of String(name || 'App')) { n ^= c.charCodeAt(0); n=Math.imul(n,16777619); } return (n>>>0)%360; }
  function hsl(angle,s,l) {
    const h=((angle%360)+360)%360/360,c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs((h*6)%2-1)),m=l-c/2;
    const p=h*6; let a=[c,x,0];
    if(p<1)a=[c,x,0];else if(p<2)a=[x,c,0];else if(p<3)a=[0,c,x];else if(p<4)a=[0,x,c];else if(p<5)a=[x,0,c];else a=[c,0,x];
    return '#'+a.map(v=>Math.round((v+m)*255).toString(16).padStart(2,'0')).join('').toUpperCase();
  }
  function defaults(name) {
    const h=hue(name);
    return {primary:hsl(h,.7,.43),secondary:hsl(h+48,.62,.38),accent:hsl(h+148,.69,.43),background:'#F8FAFC',surface:'#FFFFFF',text:'#172033',muted:'#4B5563'};
  }
  function projectOf(payload) { return payload?.context?.project && typeof payload.context.project === 'object' ? payload.context.project : payload?.project && typeof payload.project === 'object' ? payload.project : {}; }
  function nameFrom(payload) {
    const p=projectOf(payload);
    return clean(state.appName || payload?.appName || payload?.context?.appName || payload?.context?.projectName || p.name || p.title || '',100) || 'My App';
  }
  function isAppStudioRequest(payload,url) {
    if(!/\/api\/ai\/gateway(?:\/|$)/.test(url.pathname))return false;
    const mode=clean(payload?.mode,40).toLowerCase();
    const view=clean(payload?.context?.activeView,40).replace(/^view-/i,'').toLowerCase();
    return view==='appstudio'||['appstudio','app-build','app-fix'].includes(mode);
  }
  function renderLogo() {
    const panel=document.getElementById(PANEL_ID);if(!panel)return;
    const img=q(panel,'[data-brand-logo-preview]'),fallback=q(panel,'[data-brand-logo-fallback]');
    if(state.logoDataUrl){img.src=state.logoDataUrl;img.hidden=false;fallback.hidden=true;}
    else{img.removeAttribute('src');img.hidden=true;fallback.hidden=false;}
  }
  function readDraft() {
    const panel=document.getElementById(PANEL_ID);if(!panel)return null;
    const appName=clean(q(panel,'[data-brand-app-name]').value,100);
    const colors={};
    for(const key of keys){const input=q(panel,'[data-brand-color="'+key+'"]');colors[key]=validHex(input.value)?input.value.toUpperCase():defaults(appName||'My App')[key];}
    const layoutRules=clean(q(panel,'[data-brand-layout-rules]').value,20000).split(/\r?\n/).map(x=>clean(x,500)).filter(Boolean).slice(0,50);
    state.appName=appName;state.colors=colors;state.layoutRules=layoutRules;
    return {appName,colors,layoutRules,logoDataUrl:state.logoDataUrl};
  }
  function applyDraft(profile,name) {
    const panel=document.getElementById(PANEL_ID);if(!panel)return;
    const appName=clean(profile?.appName||profile?.brandName||name||'',100);
    const palette=Object.assign(defaults(appName||'My App'),profile?.colors||{});
    state.appName=appName;state.colors={};
    for(const key of keys){state.colors[key]=validHex(palette[key])?palette[key].toUpperCase():defaults(appName||'My App')[key];q(panel,'[data-brand-color="'+key+'"]').value=state.colors[key];}
    state.logoDataUrl=typeof profile?.logoDataUrl==='string'&&profile.logoDataUrl?profile.logoDataUrl:null;
    state.layoutRules=Array.isArray(profile?.layoutRules)?profile.layoutRules.map(x=>clean(x,500)).filter(Boolean).slice(0,50):[];
    q(panel,'[data-brand-app-name]').value=appName;
    q(panel,'[data-brand-layout-rules]').value=state.layoutRules.join('\n');
    renderLogo();renderPalette();
  }
  function renderPalette() {
    const panel=document.getElementById(PANEL_ID);if(!panel)return;
    for(const key of keys){const input=q(panel,'[data-brand-color="'+key+'"]'),swatch=q(panel,'[data-brand-swatch="'+key+'"]');if(input&&swatch)swatch.style.background=input.value;}
  }
  async function api(url,init) {
    const user=$auth();
    if(!user||typeof user.getIdToken!=='function')throw Object.assign(new Error('Sign in to save a separate brand for this app.'),{code:'AUTH_REQUIRED'});
    const token=await user.getIdToken(false),headers=new Headers(init?.headers||{});
    headers.set('Accept','application/json');headers.set('Authorization','Bearer '+token);
    if(init?.body&&!headers.has('Content-Type'))headers.set('Content-Type','application/json');
    const response=await nativeFetch(url,Object.assign({},init||{},{credentials:'same-origin',cache:'no-store',headers}));
    const data=await response.json().catch(()=>({}));
    if(!response.ok||data.ok===false)throw Object.assign(new Error(data.error||data.message||('App brand request failed (HTTP '+response.status+').')),{code:data.code||'APP_BRAND_REQUEST_FAILED',status:response.status});
    return data;
  }
  async function loadProfile(id,name,preserveDraft) {
    setStatus('Loading the saved brand for '+name+'…','busy');
    const data=await api(API+'?id='+encodeURIComponent(id),{method:'GET'});
    state.appId=id;state.boundId=id;state.hasProfile=!!data.profile;
    if(data.profile){applyDraft(data.profile,name);state.dirty=false;setStatus('Loaded saved Brand DNA for '+state.appName+'.','success');}
    else if(!preserveDraft){applyDraft({appName:name,colors:defaults(name),layoutRules:[],logoDataUrl:null},name);state.dirty=true;setStatus('New app identity ready. Save it or generate to create its separate profile.','info');}
    else{state.appName=name;q(document.getElementById(PANEL_ID),'[data-brand-app-name]').value=name;state.dirty=true;setStatus('Unsaved custom brand retained for this new app.','info');}
    return data.profile||null;
  }
  async function saveProfile(id) {
    const draft=readDraft();
    if(!draft||!draft.appName)throw Object.assign(new Error('Enter an app / brand name in the Brand DNA panel.'),{code:'APP_BRAND_NAME_REQUIRED'});
    setStatus('Saving Brand DNA for '+draft.appName+'…','busy');
    const data=await api(API+'?id='+encodeURIComponent(id),{method:'PUT',body:JSON.stringify({appId:id,appName:draft.appName,logoDataUrl:draft.logoDataUrl,colors:draft.colors,layoutRules:draft.layoutRules})});
    state.appId=id;state.boundId=id;state.hasProfile=true;state.dirty=false;
    setStatus('Saved and verified on the server. This identity will be used for this app’s generated screens.','success');
    return data.profile;
  }
  async function prepare(payload) {
    if(!document.getElementById(PANEL_ID))return payload; // Preserve current App Studio if a deployment serves an older view shell.
    const name=nameFrom(payload),id=slug(name);
    const dirty=state.dirty;
    if(!state.appName)applyDraft({appName:name,colors:defaults(name),logoDataUrl:null,layoutRules:[]},name);
    if(state.boundId!==id)await loadProfile(id,name,dirty);
    if(!state.hasProfile||state.dirty||state.appId!==id)await saveProfile(id);
    payload.context=Object.assign({},payload.context||{},{activeView:'appstudio',appName:state.appName,appBrandId:id});
    return payload;
  }
  function buildPanel() {
    const panel=document.createElement('section');panel.id=PANEL_ID;panel.className='ovyx-app-brand-dna';
    panel.setAttribute('aria-labelledby','ovyx-app-brand-dna-title');
    panel.innerHTML=[
      '<div class="ovyx-app-brand-dna__heading"><div><p class="ovyx-app-brand-dna__eyebrow">APP STUDIO / IDENTITY SYSTEM</p><h3 id="ovyx-app-brand-dna-title">Brand DNA</h3><p class="ovyx-app-brand-dna__intro">Give this app its own real logo, colour system and screen-wide identity. It stays separate from OVYX Studio.</p></div><span class="ovyx-app-brand-dna__version">PER APP</span></div>',
      '<div class="ovyx-app-brand-dna__grid"><label class="ovyx-app-brand-dna__field">App / brand name<input data-brand-app-name maxlength="100" type="text" placeholder="e.g. Velora Homes" autocomplete="organization" required></label>',
      '<div class="ovyx-app-brand-dna__field"><span>Full-colour logo (PNG)</span><div class="ovyx-app-brand-dna__logo-row"><div class="ovyx-app-brand-dna__logo-preview"><img data-brand-logo-preview alt="App logo preview" hidden><span data-brand-logo-fallback>LOGO</span></div><div class="ovyx-app-brand-dna__upload"><input data-brand-logo-file type="file" accept="image/png,.png"><small>Transparent PNG recommended · max 600 KB</small><button type="button" data-brand-remove-logo>Remove logo</button></div></div></div></div>',
      '<div class="ovyx-app-brand-dna__colors" aria-label="App brand palette">',
      ...keys.map(key=>'<label class="ovyx-app-brand-dna__color"><span>'+key.charAt(0).toUpperCase()+key.slice(1)+'</span><span class="ovyx-app-brand-dna__swatch" data-brand-swatch="'+key+'"></span><input data-brand-color="'+key+'" type="color" aria-label="'+key+' brand colour"></label>'),
      '</div><label class="ovyx-app-brand-dna__field ovyx-app-brand-dna__rules"><span>Brand / layout rules <small>(optional)</small></span><textarea data-brand-layout-rules rows="2" maxlength="20000" placeholder="e.g. rounded cards, preserve logo clear space, avoid neon gradients"></textarea></label>',
      '<div class="ovyx-app-brand-dna__footer"><p data-brand-status role="status" aria-live="polite">Choose an app name and its own identity. Brand edits are saved before generation.</p><div class="ovyx-app-brand-dna__actions"><button type="button" data-brand-load>Load saved brand</button><button type="button" data-brand-defaults>New palette</button><button type="button" data-brand-save>Save Brand DNA</button></div></div>'
    ].join('');
    return panel;
  }
  function addStyles() {
    if(document.getElementById('ovyx-app-brand-dna-style'))return;
    const style=document.createElement('style');style.id='ovyx-app-brand-dna-style';
    style.textContent=[
      '.ovyx-app-brand-dna{box-sizing:border-box;display:block;width:100%;max-width:1100px;margin:0 auto 20px;padding:20px;border-radius:18px;border:1px solid rgba(255,255,255,.13);background:linear-gradient(145deg,#161921,#090b10);color:#f3f4f6;box-shadow:0 16px 42px rgba(0,0,0,.18);font:inherit;line-height:1.45;grid-column:1/-1;flex:0 0 100%;order:-1;}',
      '.ovyx-app-brand-dna *{box-sizing:border-box}.ovyx-app-brand-dna__heading{display:flex;gap:16px;justify-content:space-between;align-items:flex-start;margin-bottom:18px}.ovyx-app-brand-dna__eyebrow{font-size:10px;letter-spacing:.17em;font-weight:800;color:#d6b467;margin:0 0 7px}.ovyx-app-brand-dna h3{font-size:20px;line-height:1.2;font-weight:750;color:#fff;margin:0 0 6px}.ovyx-app-brand-dna__intro{font-size:12px;color:#a7afbd;margin:0;max-width:660px}.ovyx-app-brand-dna__version{font-size:10px;color:#cbd5e1;border:1px solid rgba(255,255,255,.13);border-radius:999px;padding:5px 9px}',
      '.ovyx-app-brand-dna__grid{display:grid;grid-template-columns:minmax(220px,1fr) minmax(270px,1.1fr);gap:14px}.ovyx-app-brand-dna__field{display:flex;flex-direction:column;gap:8px;min-width:0;font-size:12px;font-weight:650;color:#e5e7eb}.ovyx-app-brand-dna input[type=text],.ovyx-app-brand-dna textarea{width:100%;min-width:0;border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:10px 12px;background:#0b0d12;color:#f9fafb;font:inherit;font-weight:450}.ovyx-app-brand-dna textarea{resize:vertical;min-height:54px}.ovyx-app-brand-dna :is(input,textarea,button):focus-visible{outline:2px solid #d6b467;outline-offset:3px}',
      '.ovyx-app-brand-dna__logo-row{display:flex;align-items:center;gap:12px;min-height:88px}.ovyx-app-brand-dna__logo-preview{display:grid;place-items:center;flex:0 0 88px;width:88px;height:88px;padding:8px;border:1px solid rgba(255,255,255,.13);border-radius:14px;background:repeating-conic-gradient(#181b22 0 25%,#101218 0 50%) 50%/14px 14px}.ovyx-app-brand-dna__logo-preview img{display:block;max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain}.ovyx-app-brand-dna__logo-preview span{font-size:11px;color:#9ca3af;font-weight:800;letter-spacing:.1em}.ovyx-app-brand-dna__upload{display:flex;flex-direction:column;gap:7px;min-width:0;font-size:11px;color:#9ca3af}.ovyx-app-brand-dna__upload input{max-width:100%;font-size:11px;color:#d1d5db}.ovyx-app-brand-dna__upload button,.ovyx-app-brand-dna__actions button{border:1px solid rgba(255,255,255,.16);border-radius:9px;padding:8px 10px;background:rgba(255,255,255,.04);color:#f3f4f6;font:inherit;font-size:11px;font-weight:700;cursor:pointer}.ovyx-app-brand-dna__upload button{align-self:flex-start}',
      '.ovyx-app-brand-dna__colors{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px;margin:16px 0}.ovyx-app-brand-dna__color{display:flex;flex-direction:column;gap:6px;min-width:0;color:#cbd5e1;font-size:10px;font-weight:700}.ovyx-app-brand-dna__swatch{display:block;height:24px;border-radius:7px;border:1px solid rgba(255,255,255,.16);background:#334155}.ovyx-app-brand-dna__color input[type=color]{width:100%;height:28px;padding:2px;border:1px solid rgba(255,255,255,.14);border-radius:7px;background:#0b0d12;cursor:pointer}.ovyx-app-brand-dna__rules{margin-bottom:16px}.ovyx-app-brand-dna__rules small{font-size:10px;color:#9ca3af;font-weight:500}',
      '.ovyx-app-brand-dna__footer{display:flex;align-items:center;justify-content:space-between;gap:14px;padding-top:13px;border-top:1px solid rgba(255,255,255,.10)}.ovyx-app-brand-dna__footer [data-brand-status]{font-size:11px;color:#a7afbd;margin:0;max-width:460px}.ovyx-app-brand-dna__footer [data-kind=success]{color:#86efac}.ovyx-app-brand-dna__footer [data-kind=error]{color:#fca5a5}.ovyx-app-brand-dna__footer [data-kind=busy]{color:#fcd34d}.ovyx-app-brand-dna__actions{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:7px}.ovyx-app-brand-dna__actions [data-brand-save]{background:#f3f4f6;color:#111827;border-color:#f3f4f6}.ovyx-app-brand-dna button:disabled{opacity:.55;cursor:wait}',
      '@media(max-width:740px){.ovyx-app-brand-dna{padding:14px;border-radius:14px}.ovyx-app-brand-dna__grid{grid-template-columns:minmax(0,1fr)}.ovyx-app-brand-dna__colors{grid-template-columns:repeat(4,minmax(0,1fr))}.ovyx-app-brand-dna__footer{align-items:stretch;flex-direction:column}.ovyx-app-brand-dna__actions{justify-content:stretch}.ovyx-app-brand-dna__actions button{flex:1}}@media(max-width:400px){.ovyx-app-brand-dna__colors{grid-template-columns:repeat(3,minmax(0,1fr))}.ovyx-app-brand-dna__logo-row{align-items:flex-start;flex-direction:column}}'
    ].join('');
    document.head.appendChild(style);
  }
  function bindPanel(panel) {
    const name=q(panel,'[data-brand-app-name]');
    name.addEventListener('input',()=>{state.appName=clean(name.value,100);state.dirty=true;});
    for(const key of keys)q(panel,'[data-brand-color="'+key+'"]').addEventListener('input',()=>{state.dirty=true;renderPalette();});
    q(panel,'[data-brand-layout-rules]').addEventListener('input',()=>{state.dirty=true;});
    q(panel,'[data-brand-logo-file]').addEventListener('change',event=>{
      const file=event.target.files&&event.target.files[0];if(!file)return;
      if(file.type!=='image/png'||file.size>600000){event.target.value='';setStatus('Choose a PNG logo no larger than 600 KB.','error');return;}
      const reader=new FileReader();
      reader.onload=()=>{const data=String(reader.result||'');if(!/^data:image\/png;base64,/.test(data)){setStatus('The selected file did not produce a valid PNG.','error');return;}state.logoDataUrl=data;state.dirty=true;renderLogo();setStatus('Original full-colour logo loaded. Save it to keep it with this app.','info');};
      reader.onerror=()=>setStatus('The selected logo could not be read.','error');reader.readAsDataURL(file);
    });
    q(panel,'[data-brand-remove-logo]').addEventListener('click',()=>{state.logoDataUrl=null;q(panel,'[data-brand-logo-file]').value='';state.dirty=true;renderLogo();setStatus('Logo removed from this app draft.','info');});
    q(panel,'[data-brand-defaults]').addEventListener('click',()=>{const name=clean(q(panel,'[data-brand-app-name]').value,100)||'My App';const palette=defaults(name);for(const key of keys)q(panel,'[data-brand-color="'+key+'"]').value=palette[key];state.dirty=true;renderPalette();setStatus('A distinct app-specific palette is ready.','info');});
    q(panel,'[data-brand-load]').addEventListener('click',async()=>{const name=clean(q(panel,'[data-brand-app-name]').value,100);if(!name){setStatus('Enter an app name before loading its saved brand.','error');return;}try{const profile=await loadProfile(slug(name),name,false);if(!profile)setStatus('No saved brand exists for this app yet.','info');}catch(error){setStatus(error.message||'Could not load this app brand.','error');}});
    q(panel,'[data-brand-save]').addEventListener('click',async()=>{const name=clean(q(panel,'[data-brand-app-name]').value,100);if(!name){setStatus('Enter an app name before saving its brand.','error');return;}try{await saveProfile(slug(name));}catch(error){setStatus(error.message||'Could not save this app brand.','error');}});
  }
  function renderPanel() {
    if(document.getElementById(PANEL_ID))return;
    const root=document.querySelector('#view-app-studio,#view-appstudio,[data-view="app-studio"],[data-view="appstudio"],[data-app-studio-root]');
    if(!root||!root.isConnected)return;
    const panel=buildPanel();root.insertBefore(panel,root.firstElementChild);addStyles();
    applyDraft({appName:'',colors:defaults('My App'),logoDataUrl:null,layoutRules:[]},'');
    state.appName='';q(panel,'[data-brand-app-name]').value='';state.dirty=false;state.hasProfile=false;state.boundId='';
    bindPanel(panel);
  }
  window.fetch=async function(input,init) {
    let url;try{url=new URL(input instanceof Request?input.url:String(input),window.location.href);}catch(_){return nativeFetch(input,init);}
    const isRequest=typeof Request!=='undefined'&&input instanceof Request;
    const settings=init||{};
    let requestText=typeof settings.body==='string'?settings.body:'';
    if(!requestText&&isRequest&&!settings.body){try{requestText=await input.clone().text();}catch(_){}}
    if(!requestText||!isAppStudioRequest((()=>{try{return JSON.parse(requestText);}catch(_){return null;}})(),url))return nativeFetch(input,init);
    let payload;try{payload=JSON.parse(requestText);}catch(_){return nativeFetch(input,init);}
    try {
      await prepare(payload);
      const body=JSON.stringify(payload);
      if(isRequest&&!settings.body)return nativeFetch(new Request(input,Object.assign({},settings,{body})));
      return nativeFetch(input,Object.assign({},settings,{body}));
    } catch(error) {
      setStatus(error.message||'App Brand DNA could not be saved; generation was paused.','error');
      notify('App Brand DNA could not be saved. Generation was paused to protect this app’s identity.','error');
      throw error;
    }
  };
  function init() {
    renderPanel();
    const observer=new MutationObserver(()=>renderPanel());observer.observe(document.body,{childList:true,subtree:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();