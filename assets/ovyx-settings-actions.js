(function(){
'use strict';
if(window.__OVYX_SETTINGS_ACTIONS_V1__)return;
window.__OVYX_SETTINGS_ACTIONS_V1__=true;

const NOTIFY_KEY='ovyx.notifications.v1';
const WORKSPACE_KEY='ovyx.settings.integrity.v83';
const TOGGLE_KEY='ovyx.settings.toggles.v34';
const DATA_KEY='ovyx.data.layer.v1';
const THEME_KEY='ovyx.theme.lab.v1';
const NOTIFY_DEFAULTS={
  projectActivity:true,generationCompleted:true,deploymentStatus:true,aiUsageWarnings:true,
  billing:true,emailProductUpdates:true,emailSecurityAlerts:true
};
const AI_DEFAULTS={
  mode:'balanced',model:'automatic',provider:'gemini',explain:true,preserve:true,confirmDestructive:false,
  contextFiles:true,contextPage:true,contextGithub:true,routing:'automatic',fallback:'automatic',
  contextLimit:'automatic',generationBudget:'automatic'
};
const WORKSPACE_DEFAULTS={
  openBehavior:'Web Studio',autosave:true,cloudSync:true,confirmDelete:true,inspector:true,livePreview:true,
  aiSafe:true,editorMode:'build',workspaceName:'Creative Workspace',dataEndpoint:''
};
const SERVER_SCOPES=['notifications','workspace','ai'];
let remoteSettings=null;
let remoteScopes=new Set();
let remoteLoadPromise=null;
let lastWorkspaceRoute='webstudio';
let projectSaveWrapped=false;
let projectOpenWrapped=false;
const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>Array.from(root.querySelectorAll(selector));
const user=()=>{try{return window.firebase?.auth?.().currentUser||null}catch{return null}};
const esc=value=>String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
const jsonRead=(key,fallback={})=>{try{const value=JSON.parse(localStorage.getItem(key)||'null');return value&&typeof value==='object'&&!Array.isArray(value)?value:fallback}catch{return fallback}};
const localWrite=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}};
const notify=(message,type='info')=>{try{if(typeof window.toast==='function')window.toast(message,type);else if(typeof window.showToast==='function')window.showToast(message,type);else console.info('[OVYX Settings]',message)}catch{}};
const currentUid=()=>String(user()?.uid||'');
const aiKey=()=>{try{return window.OVYXAIStorageKey?.()||'ovyx.ai.preferences.v1'}catch{return 'ovyx.ai.preferences.v1'}};
const profileKey=()=>currentUid()?'ovyx.profile.v2.user.'+currentUid():'ovyx.profile.v2.guest';
const workspacePrefs=()=>Object.assign({},WORKSPACE_DEFAULTS,jsonRead(WORKSPACE_KEY,{}));
const notificationPrefs=()=>Object.assign({},NOTIFY_DEFAULTS,jsonRead(NOTIFY_KEY,{}));
const aiPrefs=()=>Object.assign({},AI_DEFAULTS,jsonRead(aiKey(),{}));
const dataPrefs=()=>Object.assign({endpoint:'',projectSync:true},jsonRead(DATA_KEY,{}));
const routeName=value=>String(value||'').replace(/^view-/,'').toLowerCase();
const isSettingsRoute=value=>['settings','settings-main'].includes(routeName(value));
const isWorkspaceDestination=value=>['webstudio','appstudio','game-studio','app-studio'].includes(routeName(value));

async function api(path,options={}){
  const active=user();
  if(!active?.getIdToken)throw Object.assign(new Error('Sign in to save this setting to your OVYX account.'),{code:'AUTH_REQUIRED'});
  const token=await active.getIdToken(false);
  const headers={Accept:'application/json',Authorization:'Bearer '+token,...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})};
  const response=await fetch(path,{...options,headers,credentials:'same-origin',cache:'no-store',redirect:'error'});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok||payload?.ok===false)throw Object.assign(new Error(payload?.message||payload?.error||('Request failed (HTTP '+response.status+').')),{status:response.status,code:payload?.code||payload?.error||'SETTINGS_REQUEST_FAILED'});
  return payload;
}
function hasKeys(value){return !!value&&typeof value==='object'&&Object.keys(value).length>0}
function legacyScope(scope){
  if(scope==='notifications')return Object.assign({},NOTIFY_DEFAULTS,jsonRead(NOTIFY_KEY,{}));
  if(scope==='ai')return Object.assign({},AI_DEFAULTS,jsonRead(aiKey(),{}));
  const old=workspacePrefs();
  const toggles=jsonRead(TOGGLE_KEY,{});
  const data=dataPrefs();
  const profile=jsonRead(profileKey(),{});
  old.workspaceName=String(profile.workspace||old.workspaceName||'Creative Workspace').slice(0,60);
  old.cloudSync=typeof data.projectSync==='boolean'?data.projectSync:old.cloudSync;
  old.dataEndpoint=String(data.endpoint||old.dataEndpoint||'');
  if(typeof toggles.autosave==='boolean')old.autosave=toggles.autosave;
  if(typeof toggles.confirmDelete==='boolean')old.confirmDelete=toggles.confirmDelete;
  if(typeof toggles.inspector==='boolean')old.inspector=toggles.inspector;
  if(typeof toggles.livePreview==='boolean')old.livePreview=toggles.livePreview;
  if(typeof toggles.aiSafe==='boolean')old.aiSafe=toggles.aiSafe;
  if(typeof toggles.notifyBuild==='boolean')jsonRead; 
  if(!['build','plan','ask','fix','last-used'].includes(String(old.editorMode||''))){
    const previous=String(old.editorMode||'').toLowerCase();
    old.editorMode=previous==='last used'||previous==='last-used'?'last-used':'build';
  }
  if(!['Web Studio','Last active view','Project overview'].includes(old.openBehavior))old.openBehavior='Web Studio';
  return Object.assign({},WORKSPACE_DEFAULTS,old);
}
function scopeHasLegacy(scope){
  if(scope==='notifications')return !!localStorage.getItem(NOTIFY_KEY);
  if(scope==='ai')return !!localStorage.getItem(aiKey());
  return !!(localStorage.getItem(WORKSPACE_KEY)||localStorage.getItem(DATA_KEY)||localStorage.getItem(profileKey())||localStorage.getItem(TOGGLE_KEY));
}
function applyScopeLocal(scope,value){
  const copy=Object.assign({},value||{});
  if(scope==='notifications')localWrite(NOTIFY_KEY,Object.assign({},NOTIFY_DEFAULTS,copy));
  if(scope==='ai'){
    localWrite(aiKey(),Object.assign({},AI_DEFAULTS,copy));
    window.OVYXAI=Object.assign({},window.OVYXAI||{},copy);
  }
  if(scope==='workspace'){
    localWrite(WORKSPACE_KEY,Object.assign({},WORKSPACE_DEFAULTS,copy));
    const toggles=jsonRead(TOGGLE_KEY,{});
    toggles.autosave=copy.autosave!==false;
    toggles.confirmDelete=copy.confirmDelete!==false;
    toggles.inspector=copy.inspector!==false;
    toggles.livePreview=copy.livePreview!==false;
    toggles.aiSafe=copy.aiSafe!==false;
    localWrite(TOGGLE_KEY,toggles);
    const data=Object.assign({},dataPrefs(),{endpoint:String(copy.dataEndpoint||''),projectSync:copy.cloudSync!==false});
    localWrite(DATA_KEY,data);
    const oldProfile=jsonRead(profileKey(),{});
    if(copy.workspaceName)oldProfile.workspace=String(copy.workspaceName).slice(0,60);
    localWrite(profileKey(),oldProfile);
    if(remoteSettings)remoteSettings.workspace=Object.assign({},WORKSPACE_DEFAULTS,copy);
  }
  window.OVYXUserSettings=Object.assign({},window.OVYXUserSettings||{},{[scope]:copy});
}
async function persistScope(scope,value,{quiet=false}={}){
  applyScopeLocal(scope,value);
  if(!user()){
    if(!quiet)notify('Saved on this device. Sign in to sync this setting to your OVYX account.','info');
    return {ok:false,localOnly:true};
  }
  try{
    const result=await api('/api/settings/preferences',{method:'PUT',body:JSON.stringify({scope,settings:value})});
    remoteSettings=result.settings||remoteSettings||{};
    if(remoteSettings[scope])applyScopeLocal(scope,remoteSettings[scope]);
    remoteScopes.add(scope);
    if(!quiet)notify('Setting saved to your OVYX account.','success');
    return {ok:true,data:result};
  }catch(error){
    if(!quiet)notify('Saved on this device, but account sync failed: '+String(error.message||'Retry from Settings.'),'error');
    return {ok:false,error};
  }
}
async function hydrateAccountSettings(){
  if(!user())return;
  if(remoteLoadPromise)return remoteLoadPromise;
  remoteLoadPromise=(async()=>{
    try{
      const response=await api('/api/settings/preferences',{method:'GET'});
      const savedScopes=new Set(Array.isArray(response.savedScopes)?response.savedScopes:[]);
      remoteScopes=savedScopes;
      remoteSettings=response.settings||{};
      for(const scope of SERVER_SCOPES){
        if(savedScopes.has(scope)){
          applyScopeLocal(scope,remoteSettings[scope]||{});
          continue;
        }
        const previous=legacyScope(scope);
        if(scopeHasLegacy(scope)){
          const saved=await persistScope(scope,previous,{quiet:true});
          if(saved.ok){
            remoteScopes.add(scope);
            remoteSettings=saved.data?.settings||remoteSettings;
          }
        }else{
          applyScopeLocal(scope,remoteSettings[scope]||({notifications:NOTIFY_DEFAULTS,workspace:WORKSPACE_DEFAULTS,ai:AI_DEFAULTS}[scope]));
        }
      }
      dispatchPreferencesChanged();
      return true;
    }catch(error){
      console.warn('[OVYX Settings] account settings could not be loaded:',String(error?.code||error?.message||'unavailable').slice(0,120));
      return false;
    }finally{remoteLoadPromise=null}
  })();
  return remoteLoadPromise;
}
function dispatchPreferencesChanged(){
  try{window.dispatchEvent(new CustomEvent('ovyx:settings-preferences-changed',{detail:{settings:window.OVYXUserSettings||{},source:'account-persistence'}}))}catch{}
  applyLivePreview(workspacePrefs().livePreview);
  installProjectStoreHook();
  installProjectOpenHook();
}
function activeView(){
  return routeName(window.KernelState?.activeView||window.__OVYX_BOOT_ROUTE||'');
}
function setRoute(route){
  try{window.Router?.go?.(route)}catch(error){notify('Could not open '+route+'.','error')}
}
function setStatus(element,message,type){
  if(!element)return;
  element.textContent=message;
  element.dataset.state=type||'ready';
}
function normalizeEndpoint(value){
  const text=String(value||'').trim().replace(/\/+$/,'');
  if(!text)return '';
  let parsed;
  try{parsed=new URL(text)}catch{return null}
  const sameOrigin=parsed.origin===window.location.origin;
  if(!(parsed.protocol==='https:'||sameOrigin)||parsed.username||parsed.password||parsed.search||parsed.hash)return null;
  return parsed.href.replace(/\/+$/,'');
}
function prefsWithWorkspace(patch){
  return Object.assign({},WORKSPACE_DEFAULTS,workspacePrefs(),remoteSettings?.workspace||{},patch||{});
}
function persistWorkspaceNow(patch,quiet=false){
  const next=prefsWithWorkspace(patch);
  return persistScope('workspace',next,{quiet});
}
function updateDataEndpointLocal(endpoint,cloudSync){
  const current=dataPrefs();
  current.endpoint=endpoint;
  current.projectSync=cloudSync!==false;
  localWrite(DATA_KEY,current);
}
function cloudSyncEnabled(){
  const remote=remoteSettings?.workspace;
  if(remote&&typeof remote.cloudSync==='boolean')return remote.cloudSync;
  const p=workspacePrefs();
  return typeof p.cloudSync==='boolean'?p.cloudSync:dataPrefs().projectSync!==false;
}
function installProjectStoreHook(){
  const store=window.ProjectStore;
  if(!store||typeof store.save!=='function'||store.__ovyxSettingsCloudSyncHook)return;
  const original=store.save.bind(store);
  store.save=function(){
    const args=arguments;
    if(cloudSyncEnabled())return original.apply(this,args);
    // Preserve the local project save while suppressing only the auto cloud queue.
    const previous=window.ProjectCloudSync;
    window.ProjectCloudSync=previous||{settingsCloudSyncDisabled:true};
    try{return original.apply(this,args)}
    finally{if(previous===undefined)delete window.ProjectCloudSync;else window.ProjectCloudSync=previous}
  };
  store.__ovyxSettingsCloudSyncHook=true;
}
function installProjectOpenHook(){
  const store=window.ProjectStore;
  if(!store||typeof store.open!=='function'||store.__ovyxSettingsOpenHook)return;
  const original=store.open.bind(store);
  store.open=function(id){
    const result=original(id);
    const settings=workspacePrefs();
    const behavior=String(remoteSettings?.workspace?.openBehavior||settings.openBehavior||'Web Studio');
    setTimeout(()=>{
      if(behavior==='Project overview')setRoute('projects');
      else if(behavior==='Last active view'&&lastWorkspaceRoute&&lastWorkspaceRoute!=='settings')setRoute(lastWorkspaceRoute);
      else setRoute('webstudio');
    },0);
    return result;
  };
  store.__ovyxSettingsOpenHook=true;
}
function applyLivePreview(enabled){
  const previewNodes=$$('#view-webstudio .ovyx-ws-inline-preview, #view-webstudio #ws-inline-preview');
  previewNodes.forEach(node=>{
    if(enabled===false){node.dataset.ovyxHiddenBySetting='1';node.hidden=true;node.style.setProperty('display','none','important')}
    else if(node.dataset.ovyxHiddenBySetting==='1'){delete node.dataset.ovyxHiddenBySetting;node.hidden=false;node.style.removeProperty('display')}
  });
}
function htmlInput(label,description,id,type,value){
  return '<div class="ovyx-pref-row"><div class="ovyx-pref-copy"><b>'+esc(label)+'</b><small>'+esc(description)+'</small></div><div class="ovyx-pref-control">'+
    (type==='select'?'<select class="ovyx-pref-select" id="'+esc(id)+'">'+value+'</select>':type==='input'?'<input class="ovyx-pref-input" id="'+esc(id)+'" value="" maxlength="60">':'<button type="button" class="ovyx-notify-toggle" id="'+esc(id)+'" role="switch" aria-checked="'+String(!!value)+'" aria-label="'+esc(label)+'"><span></span></button>')+
    '</div></div>';
}
function ensureWorkspaceControls(){
  const panel=$('[data-settings-panel="workspace"]');
  if(!panel)return;
  let section=$('#ovyx-settings-workspace-controls',panel);
  if(!section){
    section=document.createElement('section');
    section.id='ovyx-settings-workspace-controls';
    section.className='ovyx-settings-workspace-controls';
    section.innerHTML=
      '<div class="ovyx-panel-head"><div class="ovyx-panel-kicker">WORKSPACE / PROJECT DEFAULTS</div><h2>Project defaults</h2><p>These choices are stored on your OVYX account when signed in. Local project saves always remain available.</p></div>'+
      '<div class="ovyx-pref-group"><div class="ovyx-pref-label">PROJECT OPENING</div>'+
      htmlInput('Open behavior','Where a selected project should open','ovyx-open-behavior','select','<option value="Web Studio">Web Studio</option><option value="Last active view">Last active view</option><option value="Project overview">Project overview</option>')+
      htmlInput('Automatic cloud sync','When enabled, OVYX queues project saves to your account cloud storage. Local saves remain on either setting.','ovyx-auto-cloud-sync','toggle',true)+
      htmlInput('Confirm destructive actions','Use OVYX confirmation before deleting project data.','ovyx-confirm-delete','toggle',true)+
      htmlInput('Show inspector','Show the project property inspector in Web Studio.','ovyx-show-inspector','toggle',true)+
      htmlInput('Show live preview','Show the preview surface in Web Studio.','ovyx-show-live-preview','toggle',true)+
      htmlInput('Safer AI edits','Ask OVYX AI to preserve existing work and confirm destructive changes.','ovyx-ai-safe-setting','toggle',true)+
      '<div class="ovyx-theme-actions"><button type="button" class="ovyx-settings-btn primary" id="ovyx-settings-workspace-save">Save Workspace Settings</button><button type="button" class="ovyx-settings-btn" id="ovyx-settings-cloud-sync-now">Sync Project Now</button></div>'+
      '<div class="ovyx-connection-note" id="ovyx-settings-workspace-status" aria-live="polite">Ready. Local saves remain enabled.</div>';
    panel.prepend(section);
  }
  const state=prefsWithWorkspace({});
  const open=$('#ovyx-open-behavior',section);
  if(open)open.value=state.openBehavior||'Web Studio';
  [
    ['#ovyx-auto-cloud-sync',state.cloudSync!==false],['#ovyx-confirm-delete',state.confirmDelete!==false],
    ['#ovyx-show-inspector',state.inspector!==false],['#ovyx-show-live-preview',state.livePreview!==false],
    ['#ovyx-ai-safe-setting',state.aiSafe!==false]
  ].forEach(([selector,enabled])=>{const el=$(selector,section);if(el)el.setAttribute('aria-checked',String(!!enabled))});
  setTimeout(installProjectStoreHook,0);
  return section;
}
function toggleFromButton(button){return String(button?.getAttribute('aria-checked'))!=='true'}
async function saveWorkspaceFromUI(){
  const section=$('#ovyx-settings-workspace-controls');
  if(!section)return;
  const endpoint=String($('#ovyx-data-endpoint')?.value||dataPrefs().endpoint||'').trim();
  const cleanEndpoint=normalizeEndpoint(endpoint);
  if(cleanEndpoint===null){setStatus($('#ovyx-settings-workspace-status'),'Data API endpoint must be HTTPS and must not contain credentials, query strings or fragments.','error');notify('Invalid Data API endpoint.','error');return}
  const next={
    ...prefsWithWorkspace({}),
    openBehavior:$('#ovyx-open-behavior',section)?.value||'Web Studio',
    autosave:$('#ovyx-auto-cloud-sync',section)?.getAttribute('aria-checked')!=='false',
    cloudSync:$('#ovyx-auto-cloud-sync',section)?.getAttribute('aria-checked')!=='false',
    confirmDelete:$('#ovyx-confirm-delete',section)?.getAttribute('aria-checked')!=='false',
    inspector:$('#ovyx-show-inspector',section)?.getAttribute('aria-checked')!=='false',
    livePreview:$('#ovyx-show-live-preview',section)?.getAttribute('aria-checked')!=='false',
    aiSafe:$('#ovyx-ai-safe-setting',section)?.getAttribute('aria-checked')!=='false',
    dataEndpoint:cleanEndpoint
  };
  setStatus($('#ovyx-settings-workspace-status'),'Saving to your OVYX account…','ready');
  const result=await persistWorkspaceNow(next,true);
  updateDataEndpointLocal(cleanEndpoint,next.cloudSync);
  applyLivePreview(next.livePreview);
  installProjectStoreHook();
  if(result.ok){
    setStatus($('#ovyx-settings-workspace-status'),'Workspace settings saved to your account.','ok');
    notify('Workspace settings saved.','success');
  }else if(result.localOnly){
    setStatus($('#ovyx-settings-workspace-status'),'Saved on this device only. Sign in to synchronize account preferences.','warning');
    notify('Saved locally. Account sync is unavailable until you sign in.','info');
  }else{
    setStatus($('#ovyx-settings-workspace-status'),'Saved locally, but server sync failed: '+String(result.error?.message||'Retry this save.'),'error');
    notify('Workspace settings account sync failed.','error');
  }
}
async function syncCurrentProject(){
  const status=$('#ovyx-settings-workspace-status')||$('#ovyx-data-result');
  if(!user()){setStatus(status,'Sign in to synchronize a project with your OVYX account.','error');notify('Sign in before cloud sync.','info');return}
  if(!cloudSyncEnabled()){setStatus(status,'Automatic cloud sync is off. Turn it on and save before synchronizing.','warning');return}
  const project=window.KernelState?.activeProject||null;
  setStatus(status,'Synchronizing with the OVYX project service…','ready');
  try{
    if(project&&window.OVYXProjectCloudSync?.save){
      window.OVYXProjectCloudSync.save(project);
      await new Promise(resolve=>setTimeout(resolve,800));
    }
    if(window.OVYXProjectCloudSync?.syncNow)await window.OVYXProjectCloudSync.syncNow();
    const result=await api('/api/projects',{method:'GET'});
    const projects=Array.isArray(result.projects)?result.projects:[];
    if(project&&projects.some(item=>String(item.id)===String(project.id))){
      setStatus(status,'Verified: '+project.name+' is stored in your OVYX account project collection.','ok');
      notify('Project cloud sync verified.','success');
    }else if(!project){
      setStatus(status,'Cloud project list refreshed ('+projects.length+' project'+(projects.length===1?'':'s')+'). No active project was selected to save.','ok');
      notify('Cloud project list refreshed.','success');
    }else{
      setStatus(status,'The project service responded, but the selected project was not returned by the server. Review account ownership and retry.','error');
      notify('Project sync was not verified.','error');
    }
  }catch(error){
    setStatus(status,'Project sync failed: '+String(error.message||'The server did not confirm the operation.'),'error');
    notify('Project sync failed.','error');
  }
}
function addDataLayerStatus(){
  const panel=$('[data-settings-panel="workspace"]');
  if(!panel)return;
  const result=$('#ovyx-data-result',panel);
  if(result&&!result.dataset.ovyxSafeNotice){
    result.dataset.ovyxSafeNotice='1';
    result.textContent='The external Data API is optional and is not OVYX project storage by itself. OVYX project sync uses the authenticated /api/projects service. A successful HTTP response alone does not prove PostgreSQL is connected.';
  }
  const sync=$('#ovyx-data-sync',panel);
  if(sync)sync.setAttribute('aria-checked',String(cloudSyncEnabled()));
  const endpoint=$('#ovyx-data-endpoint',panel);
  if(endpoint&&!endpoint.value&&dataPrefs().endpoint)endpoint.value=dataPrefs().endpoint;
}
async function testDataApi(){
  const endpointInput=$('#ovyx-data-endpoint');
  const result=$('#ovyx-data-result');
  const endpoint=normalizeEndpoint(endpointInput?.value||dataPrefs().endpoint||'');
  if(endpoint===null||!endpoint){setStatus(result,'Enter a valid HTTPS data API endpoint. The external endpoint will be tested without browser cookies or credentials.','error');notify('Enter a valid HTTPS endpoint.','error');return}
  setStatus(result,'Testing the external API health endpoint without account cookies…','ready');
  try{
    const response=await fetch(endpoint+'/health',{
      method:'GET',headers:{Accept:'application/json'},credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',
      mode:'cors',signal:typeof AbortSignal?.timeout==='function'?AbortSignal.timeout(7000):undefined
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error('HTTP '+response.status);
    const database=payload?.database;
    const verified=database===true||String(database?.status||database||'').toLowerCase()==='connected'||database?.connected===true;
    if(verified){
      setStatus(result,'API reachable (HTTP '+response.status+'). Its response reports a connected database; this report comes from the external server and has not independently tested project CRUD.','ok');
      notify('Data API reachable; server reports a database connection.','success');
    }else{
      setStatus(result,'API reachable (HTTP '+response.status+'), but its response did not verify a database connection. PostgreSQL remains unverified and OVYX project storage is still provided by /api/projects.','warning');
      notify('Data API reachable; database connection not verified.','info');
    }
  }catch(error){
    setStatus(result,'Data API test failed: '+String(error.message||'Network request failed')+'. OVYX did not send your sign-in cookies or Firebase token to this external endpoint.','error');
    notify('Data API test failed.','error');
  }
}
function validColors(value){
  const keys=['bg','panel','elev','text','secondary','muted','accent'];
  if(!value||typeof value!=='object')return false;
  return keys.every(key=>/^#[0-9a-f]{6}$/i.test(String(value[key]||'')));
}
function storeThemeState(lab){
  try{localStorage.setItem(THEME_KEY,JSON.stringify(lab.state));return true}catch{return false}
}
function applyThemeEntry(name,theme){
  const lab=window.OVYXThemeLab;
  if(!lab?.state)return false;
  if(!validColors(theme))throw new Error('Theme must include valid 6-digit hex values for every required color.');
  const id='custom_'+String(name||theme.name||'theme').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,28)+'_'+Date.now().toString(36);
  const saved=Object.assign({},theme,{name:String(name||theme.name||'Custom OVYX Theme').trim().slice(0,60)});
  lab.state.custom=Object.assign({},saved);
  lab.state.customThemes=Object.assign({},lab.state.customThemes||{},{[id]:saved});
  lab.state.active=id;
  storeThemeState(lab);
  lab.apply?.();
  window.OVYXSettings?.renderThemeCards?.();
  window.ThemeContext?.save?.();
  notify('Custom theme saved on this device.','success');
  return true;
}
function installThemeControls(){
  const lab=window.OVYXThemeLab;
  if(!lab?.state)return;
  $$('[data-theme-field]').forEach(input=>{
    if(input.dataset.ovyxSettingsThemeInput)return;
    input.dataset.ovyxSettingsThemeInput='1';
    const update=()=>{
      const key=input.dataset.themeField;
      const value=input.value;
      if(!key)return;
      if(input.type==='color'&&!/^#[0-9a-f]{6}$/i.test(value))return;
      try{lab.update?.(key,value)}catch{}
    };
    input.addEventListener('input',update);
    input.addEventListener('change',update);
  });
  const name=$('[data-theme-name]');
  if(name&&!name.dataset.ovyxSettingsThemeName){
    name.dataset.ovyxSettingsThemeName='1';
    name.addEventListener('input',()=>{if(lab.state.custom)lab.state.custom.name=name.value.slice(0,60)});
  }
}
function handleThemeClick(event,target){
  const lab=window.OVYXThemeLab;
  if(!lab?.state)return false;
  if(target.matches('[data-theme-save]')){
    event.preventDefault();event.stopImmediatePropagation();
    try{
      const name=String($('[data-theme-name]')?.value||'My OVYX Theme').trim()||'My OVYX Theme';
      if(!validColors(lab.state.custom||lab.activeTheme()))throw new Error('Choose valid theme colors before saving.');
      lab.saveCustom?.();
      window.ThemeContext?.save?.();
    }catch(error){notify(error.message||'Theme could not be saved.','error')}
    return true;
  }
  if(target.matches('[data-theme-duplicate]')){
    event.preventDefault();event.stopImmediatePropagation();
    try{
      const base=Object.assign({},lab.activeTheme());
      applyThemeEntry(String(base.name||'Theme')+' Copy',base);
    }catch(error){notify(error.message||'Theme could not be duplicated.','error')}
    return true;
  }
  if(target.matches('[data-theme-import]')){
    event.preventDefault();event.stopImmediatePropagation();
    const picker=document.createElement('input');picker.type='file';picker.accept='application/json,.json';
    picker.onchange=()=>{
      const file=picker.files?.[0];if(!file)return;
      if(file.size>64*1024){notify('Theme file must be smaller than 64 KB.','error');return}
      const reader=new FileReader();
      reader.onerror=()=>notify('Theme file could not be read.','error');
      reader.onload=()=>{
        try{
          const parsed=JSON.parse(String(reader.result||''));
          if(!validColors(parsed))throw new Error('This file is not a valid OVYX theme.');
          applyThemeEntry(String(parsed.name||file.name.replace(/\.json$/i,'')),parsed);
        }catch(error){notify(error.message||'Theme import failed.','error')}
      };
      reader.readAsText(file);
    };
    picker.click();return true;
  }
  if(target.matches('[data-theme-export]')){
    event.preventDefault();event.stopImmediatePropagation();
    const theme=Object.assign({},lab.activeTheme());
    const blob=new Blob([JSON.stringify(theme,null,2)],{type:'application/json'});
    const anchor=document.createElement('a');const url=URL.createObjectURL(blob);
    anchor.href=url;anchor.download='ovyx-theme.json';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    notify('Theme file exported.','success');return true;
  }
  if(target.matches('[data-theme-delete]')){
    event.preventDefault();event.stopImmediatePropagation();
    if(!String(lab.state.active||'').startsWith('custom_')){
      if(String(lab.state.active)==='custom'){
        lab.state.custom=Object.assign({},lab.state.custom,lab.activeTheme());
        lab.state.active='obsidian';storeThemeState(lab);lab.apply?.();window.OVYXSettings?.renderThemeCards?.();
        notify('Unsaved custom draft cleared.','success');
      }else notify('Built-in OVYX theme presets cannot be deleted.','info');
      return true;
    }
    if(!confirm('Delete this custom theme from this device?'))return true;
    lab.deleteActive?.();window.ThemeContext?.save?.();return true;
  }
  if(target.matches('[data-theme-reset]')){
    event.preventDefault();event.stopImmediatePropagation();
    if(!confirm('Reset the Theme Lab to OVYX defaults and remove all custom themes from this device?'))return true;
    lab.reset?.();window.ThemeContext?.reset?.();return true;
  }
  return false;
}
function legacyAIStateFromControls(){
  const current=aiPrefs();
  const panel=$('[data-settings-panel="ai"]');
  if(!panel)return current;
  const modeButton=$('[data-ai-mode].active, [data-ai-mode].selected',panel);
  if(modeButton)current.mode=modeButton.dataset.aiMode||current.mode;
  const model=$('#set-ai-model',panel),provider=$('#set-provider',panel),routing=$('#set-ai-routing',panel),fallback=$('#set-ai-fallback',panel);
  if(model)current.model=model.value;
  if(provider)current.provider=provider.value;
  if(routing){
    const value=routing.value.toLowerCase();
    current.routing=value.includes('preferred')?'preferred-first':value.includes('priority')?'provider-priority':'automatic';
  }
  if(fallback){
    const value=fallback.value.toLowerCase();
    current.fallback=value.includes('stop')?'stop':value.includes('next')?'next-available':'automatic';
  }
  const contextLimit=$('#set-ai-context-limit',panel),budget=$('#set-ai-generation-budget',panel);
  if(contextLimit)current.contextLimit=contextLimit.value.toLowerCase();
  if(budget)current.generationBudget=budget.value.toLowerCase();
  $$('[data-ai-pref]',panel).forEach(input=>{if(input.dataset.aiPref)current[input.dataset.aiPref]=!!input.checked});
  return current;
}
function prepareAIPanel(){
  const panel=$('[data-settings-panel="ai"]');
  if(!panel)return;
  const adv=$('.ovyx-ai-advanced-body',panel);
  if(adv){
    const selects=$$('select',adv);
    selects.forEach(select=>{
      const row=select.closest('.ovyx-pref-row');
      const label=String($('.ovyx-pref-copy b',row)?.textContent||'').toLowerCase();
      if(label.includes('context limits'))select.id='set-ai-context-limit';
      if(label.includes('generation budget'))select.id='set-ai-generation-budget';
    });
  }
  const st=aiPrefs();
  const selects=[
    ['#set-ai-model',st.model],
    ['#set-provider',st.provider],
    ['#set-ai-routing',st.routing==='preferred-first'?'Preferred model first':st.routing==='provider-priority'?'Provider priority':'Automatic'],
    ['#set-ai-fallback',st.fallback==='stop'?'Stop and notify me':st.fallback==='next-available'?'Next available provider':'Automatic'],
    ['#set-ai-context-limit',st.contextLimit],
    ['#set-ai-generation-budget',st.generationBudget]
  ];
  selects.forEach(([selector,value])=>{const el=$(selector,panel);if(el)el.value=value});
  $$('[data-ai-mode]',panel).forEach(button=>button.classList.toggle('active',button.dataset.aiMode===st.mode));
}
async function saveAIFromUI(reset=false){
  const panel=$('[data-settings-panel="ai"]');
  const next=reset?Object.assign({},AI_DEFAULTS):legacyAIStateFromControls();
  if(reset&&panel){
    $$('[data-ai-pref]',panel).forEach(input=>{input.checked=!!next[input.dataset.aiPref]});
    $$('[data-ai-mode]',panel).forEach(button=>button.classList.toggle('active',button.dataset.aiMode===next.mode));
    const defaults={'#set-ai-model':next.model,'#set-provider':next.provider,'#set-ai-routing':'Automatic','#set-ai-fallback':'Automatic','#set-ai-context-limit':'automatic','#set-ai-generation-budget':'automatic'};
    Object.entries(defaults).forEach(([selector,value])=>{const el=$(selector,panel);if(el)el.value=value});
  }
  const result=await persistScope('ai',next,{quiet:true});
  const status=getStatusElement(panel,'ovyx-settings-ai-status');
  setStatus(status,result.ok?'AI preferences saved to your account.':result.localOnly?'Saved on this device only. Sign in to synchronize AI preferences.':'Saved locally, but AI account sync failed: '+String(result.error?.message||'Retry this save.'),result.ok?'ok':result.localOnly?'warning':'error');
  if(result.ok)notify(reset?'AI preferences reset and synchronized.':'AI preferences saved to your account.','success');
  else notify('AI preferences remain local; account sync needs attention.','error');
  return result;
}
function getStatusElement(panel,id){
  if(!panel)return null;
  let status=$('#'+id,panel);
  if(!status){
    status=document.createElement('div');status.id=id;status.className='ovyx-connection-note';status.setAttribute('aria-live','polite');
    const actions=$('.ovyx-theme-actions',panel);
    if(actions)actions.after(status);else panel.appendChild(status);
  }
  return status;
}
function enhanceEditorPanel(){
  const panel=$('[data-settings-panel="editor"]');
  if(!panel)return;
  const selects=$$('select',panel);
  const mode=selects.find(select=>String(select.closest('.ovyx-pref-row')?.textContent||'').toLowerCase().includes('default web studio mode'))||selects[0];
  if(mode){
    mode.id='set-editor-mode';
    mode.innerHTML='<option value="build">Build</option><option value="plan">Plan</option><option value="ask">Ask</option><option value="fix">Fix</option><option value="last-used">Last used</option>';
    mode.value=workspacePrefs().editorMode||'build';
  }
}
function applyEditorMode(){
  const selected=String(workspacePrefs().editorMode||'build');
  if(selected==='last-used')return;
  if(activeView()==='webstudio'&&window.WebStudio?.setMode)window.WebStudio.setMode(selected);
}
function applyDeleteConfirm(){
  const state=workspacePrefs();
  const key=TOGGLE_KEY;
  const toggles=jsonRead(key,{});
  toggles.confirmDelete=state.confirmDelete!==false;
  localWrite(key,toggles);
  try{window.dispatchEvent(new CustomEvent('ovyx:settings-preferences-changed',{detail:{scope:'workspace',settings:state}}))}catch{}
}
async function saveProfileFromUI(){
  const nameInput=$('#set-profile-name'),workspaceInput=$('#set-workspace-name');
  const name=String(nameInput?.value||'').trim();
  const workspaceName=String(workspaceInput?.value||'').trim();
  if(!name){notify('Display name cannot be empty.','error');nameInput?.focus();return}
  if(name.length>60||!workspaceName||workspaceName.length>60){notify('Display name and workspace name must be between 1 and 60 characters.','error');return}
  const profile=jsonRead(profileKey(),{});
  profile.name=name;profile.workspace=workspaceName;
  localWrite(profileKey(),profile);
  const displayNodes=$$('#settings-display-name-text, #sidebar-user-display-name, #profile-name-heading');
  displayNodes.forEach(node=>node.textContent=name);
  const sidebar=$('#sidebar-workspace-label');if(sidebar)sidebar.textContent=workspaceName;
  try{window.OVYXProfile?.applyAvatar?.()}catch{}
  let accountProfileSynced=false;
  let authError=null;
  const active=user();
  if(active){
    try{await active.updateProfile({displayName:name});accountProfileSynced=true}
    catch(error){authError=error}
  }
  const saved=await persistWorkspaceNow(Object.assign({},legacyScope('workspace'),{workspaceName}),true);
  if(saved.ok&&(!active||accountProfileSynced)){
    notify('Profile and workspace settings saved to your account.','success');
  }else if(!active){
    notify('Profile saved on this device. Sign in to synchronize workspace settings.','info');
  }else if(authError){
    notify('Workspace name synced; Firebase display-name update failed: '+String(authError.message||'Try signing in again.'),'error');
  }else{
    notify('Profile saved locally, but workspace account sync failed.','error');
  }
}
async function deleteCurrentAccount(){
  const active=user();
  if(!active?.getIdToken){notify('Sign in before deleting your account.','error');return}
  if(!confirm('Permanently delete your OVYX account, its projects, saved connections, profile data and account storage? This cannot be undone.'))return;
  const buttons=['#profile-delete-action','#ovyx-security-delete'].map(selector=>$(selector)).filter(Boolean);
  buttons.forEach(button=>{button.disabled=true;button.setAttribute('aria-busy','true')});
  try{
    const token=await active.getIdToken(true);
    const response=await fetch('/api/account/delete',{
      method:'POST',credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json',Authorization:'Bearer '+token,'X-OVYX-Account-Deletion':'CONFIRM'}
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok||data.ok!==true||data.deleted!==true)throw Object.assign(new Error(data?.message||data?.error||'The server did not confirm account deletion.'),{code:data?.code||'ACCOUNT_DELETE_FAILED',status:response.status});
    try{await window.firebase?.auth?.().signOut()}catch{}
    try{
      const uid=String(active.uid||'');
      ['ovyx.profile.v2.user.'+uid,aiKey()].forEach(key=>{try{localStorage.removeItem(key)}catch{}});
      if(window.OVYXAI)window.OVYXAI={};
      window.__OVYX_AUTH_STATE_READY__=false;
      window.__OVYX_ROOT_AUTH_VERIFIED=false;
    }catch{}
    notify('Your OVYX account and server-side account data were deleted.','success');
    setRoute('home');
  }catch(error){
    const message=error?.code==='REAUTH_REQUIRED'
      ?'For security, sign out, sign back in, and retry account deletion.'
      :String(error?.message||'Account deletion failed.');
    notify(message,'error');
  }finally{buttons.forEach(button=>{button.disabled=false;button.removeAttribute('aria-busy')})}
}
async function loadQuotaAndBilling(){
  const status=$('#ovyx-settings-billing-status');
  const panel=$('[data-settings-panel="plan"]');
  try{
    const balance=await api('/api/tokens/balance',{method:'GET'});
    const monthlyLimit=Math.max(0,Number(balance.monthlyLimit||balance.monthlyTokenLimit||0));
    const remaining=Math.max(0,Number(balance.current_monthly_tokens??balance.baseRemaining??0));
    const used=Math.max(0,monthlyLimit-remaining);
    const usedEl=$('#ovyx-bill-used',panel),limitEl=$('.ovyx-billing-limit',panel),bar=$('#ovyx-bill-bar',panel);
    if(usedEl)usedEl.textContent=used.toLocaleString();
    if(limitEl)limitEl.textContent='/ '+monthlyLimit.toLocaleString()+' tokens · '+String(balance.plan||'account').toUpperCase();
    if(bar)bar.style.width=(monthlyLimit?Math.min(100,Math.round(used/monthlyLimit*100)):0)+'%';
    const usage=$('[data-settings-panel="usage"]');
    if(usage){
      const chip=$('#set-token-meter',usage);
      if(chip)chip.textContent=used.toLocaleString()+' / '+monthlyLimit.toLocaleString();
      let daily=usage.querySelector('#ovyx-settings-daily-prompts');
      if(!daily){daily=document.createElement('div');daily.id='ovyx-settings-daily-prompts';daily.className='ovyx-connection-note';usage.appendChild(daily)}
      daily.textContent='Daily prompts remaining: '+Math.max(0,Number(balance.daily_prompts_allowance||0)).toLocaleString()+' / '+Math.max(0,Number(balance.dailyLimit||0)).toLocaleString()+'. Source: authenticated server quota.';
    }
  }catch(error){
    if(status)setStatus(status,'Live usage could not be verified: '+String(error.message||'server unavailable'),'error');
  }
  try{
    const data=await api('/api/account/billing-history',{method:'GET'});
    renderBillingHistory(data.payments||[]);
  }catch(error){
    renderBillingHistory(null,String(error.message||'Billing history unavailable.'));
  }
}
function renderBillingHistory(payments,errorText){
  const panel=$('[data-settings-panel="plan"]');
  if(!panel)return;
  let box=$('#ovyx-settings-server-billing-history',panel);
  if(!box){
    box=document.createElement('div');box.id='ovyx-settings-server-billing-history';box.className='ovyx-pref-group';
    const old=Array.from(panel.querySelectorAll('.ovyx-pref-group')).find(el=>String(el.textContent||'').includes('BILLING HISTORY'));
    if(old)old.replaceWith(box);else panel.appendChild(box);
  }
  if(errorText){
    box.innerHTML='<div class="ovyx-pref-label">SERVER BILLING HISTORY</div><div class="ovyx-empty-state">Could not load verified billing history: '+esc(errorText)+'</div><button type="button" class="ovyx-settings-btn" id="ovyx-billing-refresh">Retry billing history</button>';
  }else{
    const rows=(Array.isArray(payments)?payments:[]).map(row=>{
      const amount=Number(row.amount);
      const pretty=(row.currency==='NGN'?'₦':row.currency==='USD'?'$':String(row.currency||'')+' ')+(Number.isFinite(amount)?amount.toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:2}):'—');
      const date=row.createdAt||row.date;
      const dateText=date&&Number.isFinite(Date.parse(date))?new Date(date).toLocaleString():'Date not available';
      return '<div class="ovyx-billing-history-row"><div><b>'+esc(row.label||row.plan||'OVYX purchase')+'</b><small>'+esc(dateText)+' · '+esc(row.provider||'provider unavailable')+' · '+esc(row.reference||'')+'</small></div><span class="ovyx-billing-amount">'+esc(pretty)+'</span><small>'+esc(String(row.status||'pending').replace(/-/g,' '))+'</small></div>';
    }).join('');
    box.innerHTML='<div class="ovyx-pref-label">SERVER BILLING HISTORY</div>'+
      (rows?'<div class="ovyx-billing-history">'+rows+'</div>':'<div class="ovyx-empty-state">No server-recorded payments were found for this account yet. Entries appear after checkout creates a payment order.</div>')+
      '<button type="button" class="ovyx-settings-btn" id="ovyx-billing-refresh">Refresh billing history</button>'+
      '<div class="ovyx-connection-note">Payment status is read from OVYX server records; browser-stored billing history is not treated as proof of payment.</div>';
  }
  $('#ovyx-billing-refresh',box)?.addEventListener('click',()=>{setStatus(box,'Refreshing verified billing history…','ready');loadQuotaAndBilling()});
  const upgrade=$('#ovyx-upgrade-btn',panel);
  upgrade?.addEventListener('click',()=>setRoute('pricing'));
}
function enhancePanels(){
  const workspace=ensureWorkspaceControls();
  addDataLayerStatus();
  prepareAIPanel();
  enhanceEditorPanel();
  installThemeControls();
  if(workspace){
    const panel=$('[data-settings-panel="workspace"]');
    const mode=$('#set-editor-mode');
    if(mode&&!mode.dataset.ovyxSettingsBound){
      mode.dataset.ovyxSettingsBound='1';
      mode.addEventListener('change',async()=>{
        const result=await persistWorkspaceNow({editorMode:mode.value},true);
        applyEditorMode();
        if(!result.ok)notify('Editor mode saved locally but could not sync to your account.','error');
        else notify('Default Web Studio mode saved.','success');
      });
    }
  }
  const plan=$('[data-settings-panel="plan"]');
  if(plan&&!plan.dataset.ovyxServerBillingLoaded){
    plan.dataset.ovyxServerBillingLoaded='1';
    setTimeout(loadQuotaAndBilling,0);
  }
  const usage=$('[data-settings-panel="usage"]');
  if(usage&&!usage.dataset.ovyxServerQuotaLoaded){usage.dataset.ovyxServerQuotaLoaded='1';setTimeout(loadQuotaAndBilling,0)}
  const security=$('[data-settings-panel="security"]');
  if(security){
    const stat=Array.from(security.querySelectorAll('.ovyx-security-stat')).find(el=>String($('.ovyx-security-stat span',el)?.textContent||'').toLowerCase().includes('active sessions'));
    if(stat){
      const value=$('b',stat);if(value)value.textContent='Current browser shown';
      let note=$('#ovyx-session-enumeration-note',security);
      if(!note){note=document.createElement('div');note.id='ovyx-session-enumeration-note';note.className='ovyx-connection-note';note.textContent='Other active sessions cannot be enumerated by this screen. “Log Out All Devices” revokes Firebase refresh-token sessions and then signs this browser out.';stat.after(note)}
    }
  }
  if(!window.__OVYX_BILLING_ACTION_PATCHED__){
    const oldUpgrade=$('#ovyx-upgrade-btn',plan);
    if(oldUpgrade){oldUpgrade.addEventListener('click',()=>setRoute('pricing'));window.__OVYX_BILLING_ACTION_PATCHED__=true}
  }
}
function handleWorkspaceToggle(event,target){
  event.preventDefault();event.stopImmediatePropagation();
  const id=target.id,enabled=toggleFromButton(target);
  target.setAttribute('aria-checked',String(enabled));
  const map={
    'ovyx-auto-cloud-sync':{cloudSync:enabled,autosave:enabled},
    'ovyx-confirm-delete':{confirmDelete:enabled},
    'ovyx-show-inspector':{inspector:enabled},
    'ovyx-show-live-preview':{livePreview:enabled},
    'ovyx-ai-safe-setting':{aiSafe:enabled},
    'ovyx-data-sync':{cloudSync:enabled,autosave:enabled}
  };
  const patch=map[id];
  if(!patch)return;
  persistWorkspaceNow(patch,true).then(result=>{
    applyLivePreview(workspacePrefs().livePreview);
    installProjectStoreHook();
    const data=dataPrefs();data.projectSync=cloudSyncEnabled();localWrite(DATA_KEY,data);
    const status=$('#ovyx-settings-workspace-status')||$('#ovyx-data-result');
    if(result.ok)setStatus(status,'Preference saved to your OVYX account.','ok');
    else setStatus(status,result.localOnly?'Preference saved only on this device.':'Local setting applied; server sync failed.','warning');
  });
}
function bind(){
  document.addEventListener('click',event=>{
    const target=event.target?.closest?.('button');
    if(!target)return;
    if(target.id==='profile-save-action'){
      event.preventDefault();event.stopImmediatePropagation();saveProfileFromUI();return;
    }
    if(target.id==='profile-delete-action'||target.id==='ovyx-security-delete'){
      event.preventDefault();event.stopImmediatePropagation();deleteCurrentAccount();return;
    }
    if(target.id==='set-ai-save'){
      event.preventDefault();event.stopImmediatePropagation();saveAIFromUI(false);return;
    }
    if(target.id==='set-ai-reset'){
      event.preventDefault();event.stopImmediatePropagation();saveAIFromUI(true);return;
    }
    if(target.id==='notify-save'){
      event.preventDefault();event.stopImmediatePropagation();
      persistScope('notifications',notificationPrefs(),{quiet:true}).then(result=>{
        const panel=$('[data-settings-panel="notifications"]');
        const status=getStatusElement(panel,'ovyx-settings-notify-status');
        setStatus(status,result.ok?'Notification preferences saved to your OVYX account.':result.localOnly?'Saved on this device only.':'Local preferences saved, but account sync failed.',result.ok?'ok':result.localOnly?'warning':'error');
        notify(result.ok?'Notification preferences saved to your account.':'Notification account sync failed.','info');
      });return;
    }
    if(target.id==='notify-reset'){
      event.preventDefault();event.stopImmediatePropagation();
      applyScopeLocal('notifications',NOTIFY_DEFAULTS);
      $$('[data-notify]').forEach(toggle=>toggle.setAttribute('aria-checked',String(!!NOTIFY_DEFAULTS[toggle.dataset.notify])));
      persistScope('notifications',NOTIFY_DEFAULTS,{quiet:true}).then(result=>notify(result.ok?'Notification preferences reset on your account.':result.localOnly?'Notification preferences reset on this device.':'Reset is local; account sync failed.',result.ok?'success':'info'));
      return;
    }
    if(target.id==='ovyx-settings-workspace-save'){event.preventDefault();event.stopImmediatePropagation();saveWorkspaceFromUI();return}
    if(target.id==='ovyx-settings-cloud-sync-now'){event.preventDefault();event.stopImmediatePropagation();syncCurrentProject();return}
    if(target.id==='ovyx-data-save'){
      event.preventDefault();event.stopImmediatePropagation();
      const endpoint=normalizeEndpoint($('#ovyx-data-endpoint')?.value||'');
      if(endpoint===null){setStatus($('#ovyx-data-result'),'Enter a valid HTTPS data API endpoint.','error');notify('Invalid Data API endpoint.','error');return}
      const enabled=$('#ovyx-data-sync')?.getAttribute('aria-checked')!=='false';
      updateDataEndpointLocal(endpoint,enabled);
      persistWorkspaceNow({dataEndpoint:endpoint,cloudSync:enabled,autosave:enabled},true).then(result=>{
        const status=$('#ovyx-data-result');
        if(result.ok)setStatus(status,'Data API endpoint and project sync preference saved to your OVYX account. The endpoint remains an optional external API and is not automatically used as OVYX project storage.','ok');
        else setStatus(status,result.localOnly?'Settings saved on this device only.':'Saved locally; server sync failed.','warning');
      });return;
    }
    if(target.id==='ovyx-data-test'){event.preventDefault();event.stopImmediatePropagation();testDataApi();return}
    if(target.id==='ovyx-data-sync'){handleWorkspaceToggle(event,target);return}
    if(['ovyx-auto-cloud-sync','ovyx-confirm-delete','ovyx-show-inspector','ovyx-show-live-preview','ovyx-ai-safe-setting'].includes(target.id)){handleWorkspaceToggle(event,target);return}
    if(target.matches('[data-theme-save],[data-theme-duplicate],[data-theme-import],[data-theme-export],[data-theme-delete],[data-theme-reset]')){
      handleThemeClick(event,target);return;
    }
    if(target.matches('[data-ai-mode]')){
      setTimeout(()=>saveAIFromUI(false),0);return;
    }
    if(target.id==='ovyx-token-boost-btn'){event.preventDefault();event.stopImmediatePropagation();setRoute('pricing');return}
  },true);
  document.addEventListener('change',event=>{
    const target=event.target;
    if(target?.id==='set-editor-mode'){
      persistWorkspaceNow({editorMode:target.value},true).then(result=>{
        applyEditorMode();
        if(!result.ok)notify('Editor mode changed locally, but account sync failed.','error');
        else notify('Web Studio default mode updated.','success');
      });
    }
    if(target?.id==='set-open-behavior'){
      persistWorkspaceNow({openBehavior:target.value},true).then(result=>notify(result.ok?'Project opening preference saved.':'Project opening preference remains local until account sync succeeds.',result.ok?'success':'warning'));
    }
    if(target?.matches?.('[data-notify]')){
      setTimeout(()=>persistScope('notifications',notificationPrefs(),{quiet:true}).then(result=>{
        if(!result.ok)notify(result.localOnly?'Notification preference saved on this device only.':'Could not sync notification preferences to your account.','warning');
      }),0);
    }
  },true);
  document.addEventListener('click',event=>{
    const target=event.target?.closest?.('[data-notify]');
    if(target)setTimeout(()=>persistScope('notifications',notificationPrefs(),{quiet:true}).then(result=>{
      if(!result.ok)notify(result.localOnly?'Notification preference saved on this device only.':'Could not sync notification preferences to your account.','warning');
    }),0);
  },true);
  document.addEventListener('click',event=>{
    const target=event.target?.closest?.('[data-theme]');if(!target)return;
    setTimeout(()=>{try{window.ThemeContext?.save?.();window.OVYXThemeLab?.apply?.()}catch{}},0);
  },true);
}
function patchSettings(){
  const settings=window.OVYXSettings;
  if(settings&&!settings.__ovyxSettingsActionsWrapped){
    const originalShow=typeof settings.show==='function'?settings.show.bind(settings):null;
    if(originalShow){
      settings.show=function(id){
        const result=originalShow(id);
        setTimeout(enhancePanels,0);
        setTimeout(enhancePanels,80);
        return result;
      };
    }
    settings.__ovyxSettingsActionsWrapped=true;
  }
  enhancePanels();
}
function onViewChanged(event){
  const view=routeName(event?.detail?.view||window.KernelState?.activeView||'');
  if(isWorkspaceDestination(view))lastWorkspaceRoute=view;
  if(view==='settings')setTimeout(patchSettings,0);
  setTimeout(installProjectStoreHook,0);
  setTimeout(installProjectOpenHook,0);
}
function init(){
  bind();
  patchSettings();
  hydrateAccountSettings().then(()=>{patchSettings();dispatchPreferencesChanged()});
  installProjectStoreHook();installProjectOpenHook();
  window.addEventListener('ovyx:view-changed',onViewChanged,{passive:true});
  window.addEventListener('ovyx-settings-rendered',()=>setTimeout(patchSettings,0),{passive:true});
  window.addEventListener('firebase-auth-state-ready',()=>{hydrateAccountSettings().then(()=>{patchSettings();dispatchPreferencesChanged()})},{passive:true});
  window.addEventListener('ovyx-auth-state-ready',()=>{hydrateAccountSettings().then(()=>{patchSettings();dispatchPreferencesChanged()})},{passive:true});
  const auth=window.firebase?.auth?.();
  if(auth?.onAuthStateChanged)auth.onAuthStateChanged(()=>{remoteLoadPromise=null;hydrateAccountSettings().then(()=>{patchSettings();dispatchPreferencesChanged()})});
  const observer=new MutationObserver(()=>{
    if(!window.__OVYX_SETTINGS_ACTIONS_QUEUED__){
      window.__OVYX_SETTINGS_ACTIONS_QUEUED__=true;
      queueMicrotask(()=>{window.__OVYX_SETTINGS_ACTIONS_QUEUED__=false;patchSettings()});
    }
  });
  const root=$('#view-settings');
  if(root)observer.observe(root,{subtree:true,childList:true});
  setTimeout(patchSettings,250);
  setTimeout(patchSettings,1000);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
window.OVYXSettingsActions={
  hydrate:hydrateAccountSettings,
  refresh:patchSettings,
  getPreferences:()=>({notifications:notificationPrefs(),workspace:workspacePrefs(),ai:aiPrefs()}),
  save: persistScope,
  syncProject:syncCurrentProject,
  testDataApi:testDataApi
};
})();