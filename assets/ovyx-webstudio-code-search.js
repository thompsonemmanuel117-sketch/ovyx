(function () {
  'use strict';
  if (window.__OVYX_WEBSTUDIO_CODE_SEARCH_V1__) return;
  window.__OVYX_WEBSTUDIO_CODE_SEARCH_V1__ = true;
  var STYLE_ID='ovyx-webstudio-code-search-style-v1';
  var ATTRS=['data-file-path','data-ovyx-file-path','data-path','data-pathname','data-file','data-filename'];
  var panel=null,input=null,results=null,message=null,trigger=null,closeTimer=null;
  var MAX_RESULTS=60;

  function addStyles(){
    if(document.getElementById(STYLE_ID))return;
    var style=document.createElement('style');style.id=STYLE_ID;
    style.textContent=[
      '.ovyx-sidebar-logo-clip-safe{overflow:visible!important;clip-path:none!important;animation:none!important;transform:none!important;transition:none!important}',
      '.ovyx-sidebar-logo-clip-safe img,.ovyx-sidebar-logo-clip-safe svg,.ovyx-sidebar-logo-clip-safe picture{display:block!important;object-fit:contain!important;object-position:center!important;overflow:visible!important;clip-path:none!important;animation:none!important;transform:none!important;transition:none!important}',
      '[data-ovyx-code-search-trigger]{display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:7px!important;flex:0 0 auto!important;min-height:34px!important;padding:7px 10px!important;border:1px solid rgba(255,255,255,.13)!important;border-radius:8px!important;background:rgba(255,255,255,.035)!important;color:#dce3ec!important;font:700 10px/1.2 Inter,system-ui,sans-serif!important;white-space:nowrap!important;cursor:pointer!important;transition:border-color .16s ease,background .16s ease,color .16s ease!important}',
      '[data-ovyx-code-search-trigger]:hover,[data-ovyx-code-search-trigger][aria-expanded=true]{border-color:rgba(232,182,79,.48)!important;background:rgba(232,182,79,.08)!important;color:#f4d89c!important}',
      '[data-ovyx-code-search-trigger]:focus-visible,.ovyx-code-search-close:focus-visible,.ovyx-code-search-result:focus-visible{outline:2px solid #e8b64f!important;outline-offset:2px!important}',
      '.ovyx-code-search-popover{position:fixed;z-index:2147483600;width:min(420px,calc(100vw - 24px));max-height:min(460px,calc(100dvh - 24px));display:flex;flex-direction:column;gap:10px;padding:13px;border:1px solid rgba(255,255,255,.14);border-radius:15px;background:linear-gradient(150deg,rgba(20,23,28,.99),rgba(9,11,14,.99));color:#f3f5f8;box-shadow:0 24px 78px rgba(0,0,0,.58);font:500 12px/1.5 Inter,system-ui,sans-serif;opacity:0;visibility:hidden;transform:translate3d(0,-8px,0) scale(.985);transform-origin:top right;pointer-events:none;transition:opacity .17s ease,transform .17s ease,visibility .17s ease;overscroll-behavior:contain}',
      '.ovyx-code-search-popover[hidden]{display:none!important}.ovyx-code-search-popover.is-open{opacity:1;visibility:visible;transform:translate3d(0,0,0) scale(1);pointer-events:auto}',
      '.ovyx-code-search-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}.ovyx-code-search-title{color:#f0d8a6;font-size:9px;font-weight:850;letter-spacing:.14em;text-transform:uppercase}',
      '.ovyx-code-search-close{display:grid;place-items:center;flex:0 0 28px;width:28px;height:28px;padding:0;border:1px solid rgba(255,255,255,.1);border-radius:8px;background:rgba(255,255,255,.035);color:#cbd3dd;font-size:18px;line-height:1;cursor:pointer}',
      '.ovyx-code-search-input-row{display:flex;align-items:center;gap:9px;min-width:0;padding:10px 11px;border:1px solid rgba(255,255,255,.12);border-radius:10px;background:rgba(0,0,0,.24);color:#aeb8c5}.ovyx-code-search-input-row:focus-within{border-color:rgba(232,182,79,.6);box-shadow:0 0 0 3px rgba(232,182,79,.08)}',
      '.ovyx-code-search-input-row svg{flex:0 0 16px;width:16px;height:16px}.ovyx-code-search-input{width:100%;min-width:0;padding:0;border:0;outline:0!important;background:transparent;color:#f4f6f8;font:500 12px/1.45 Inter,system-ui,sans-serif}.ovyx-code-search-input::placeholder{color:#7f8996}',
      '.ovyx-code-search-message{margin:0;padding:9px 4px;color:#8994a2;font-size:10px;line-height:1.5}.ovyx-code-search-message[hidden],.ovyx-code-search-results[hidden]{display:none!important}',
      '.ovyx-code-search-results{display:flex;flex-direction:column;gap:4px;min-height:0;max-height:310px;overflow:auto;padding:0 2px 2px 0;margin:0;list-style:none;overscroll-behavior:contain}',
      '.ovyx-code-search-result{display:flex;align-items:center;gap:10px;width:100%;min-width:0;padding:9px 10px;border:1px solid transparent;border-radius:9px;background:transparent;color:#e8edf3;text-align:left;cursor:pointer}.ovyx-code-search-result:hover{border-color:rgba(232,182,79,.23);background:rgba(232,182,79,.07)}',
      '.ovyx-code-search-filetype{display:grid;place-items:center;flex:0 0 29px;width:29px;height:31px;border:1px solid rgba(255,255,255,.08);border-radius:8px;background:rgba(255,255,255,.035);color:#b5c0ce;font:800 7px/1.1 ui-monospace,monospace;text-transform:uppercase}',
      '.ovyx-code-search-filecopy{display:block;min-width:0;flex:1}.ovyx-code-search-filename{display:block;overflow:hidden;color:#f1f4f7;font-size:11px;font-weight:700;line-height:1.35;text-overflow:ellipsis;white-space:nowrap}.ovyx-code-search-filepath{display:block;margin-top:3px;overflow:hidden;color:#8792a0;font:9px/1.35 ui-monospace,monospace;text-overflow:ellipsis;white-space:nowrap}',
      '.ovyx-code-search-footer{display:flex;align-items:center;justify-content:space-between;gap:8px;padding-top:4px;border-top:1px solid rgba(255,255,255,.07);color:#7e8996;font-size:9px}.ovyx-code-search-footer kbd{padding:2px 5px;border:1px solid rgba(255,255,255,.12);border-radius:5px;color:#b6c0cd;font:700 8px/1.2 ui-monospace,monospace}',
      '@media(max-width:520px){.ovyx-code-search-popover{padding:11px;border-radius:13px}.ovyx-code-search-results{max-height:min(280px,42dvh)}[data-ovyx-code-search-trigger]{gap:5px!important;padding:7px 8px!important;font-size:9px!important}}',
      '@media(prefers-reduced-motion:reduce){.ovyx-sidebar-logo-clip-safe,.ovyx-sidebar-logo-clip-safe img,.ovyx-sidebar-logo-clip-safe svg,.ovyx-code-search-popover{animation:none!important;transition:none!important}}'
    ].join('\n');
    (document.head||document.documentElement).appendChild(style);
  }
  function nodeText(node){
    var cls=typeof node.className==='string'?node.className:node.getAttribute('class')||'';
    return [node.id||'',cls,node.getAttribute('aria-label')||'',node.getAttribute('title')||'',node.getAttribute('src')||'',node.getAttribute('alt')||''].join(' ');
  }
  function isLogo(node){
    var tag=String(node.tagName||'').toLowerCase(),text=nodeText(node);
    if(tag==='img')return /(?:ovyx|logo|brand(?:-mark|-lockup)?|wordmark)/i.test(text);
    if(tag==='svg')return /(?:logo|brand|wordmark|ovyx)/i.test(text);
    return /(?:sidebar[-_ ]?logo|brand[-_ ]?(?:mark|lockup|logo)|logo[-_ ]?(?:wrap|container|mark)|wordmark)/i.test(text)&&!!node.querySelector('img,svg,picture');
  }
  function markLogo(node,sidebar){
    if(!node||node===sidebar||!sidebar.contains(node))return;
    node.classList.add('ovyx-sidebar-logo-clip-safe');
    var wrapper=node.closest('[class*="logo" i],[class*="brand" i],[id*="logo" i],[id*="brand" i]');
    if(!wrapper&&node.parentElement&&node.parentElement!==sidebar&&node.parentElement.children.length<=3)wrapper=node.parentElement;
    if(wrapper&&wrapper!==sidebar)wrapper.classList.add('ovyx-sidebar-logo-clip-safe');
  }
  function fixSidebarLogos(){
    var roots=[];
    document.querySelectorAll('#app-sidebar,#mobile-drawer,#ovyx-desktop-sidebar,#ws-sidebar,#webstudio-sidebar,[id*="sidebar" i],[class*="sidebar" i]').forEach(function(node){if(!roots.includes(node))roots.push(node);});
    roots.forEach(function(sidebar){
      sidebar.querySelectorAll('img,svg,[class*="logo" i],[class*="brand" i],[id*="logo" i],[id*="brand" i]').forEach(function(node){
        if(isLogo(node))markLogo(node,sidebar);
        if(/(?:logo|brand|wordmark)/i.test(nodeText(node))&&node.querySelector&&node.querySelector('img,svg,picture')){
          markLogo(node,sidebar);node.querySelectorAll('img,svg,picture').forEach(function(child){markLogo(child,sidebar);});
        }
      });
    });
  }
  function safePath(value){
    if(typeof value!=='string')return '';
    var path=value.trim().replace(/\\/g,'/');
    if(!path||path.charAt(0)==='/'||/^[a-z]:/i.test(path)||/[\u0000-\u001f\u007f]/.test(path))return '';
    var parts=path.replace(/^\.\//,'').split('/');
    if(parts.some(function(part){return !part||part==='.'||part==='..'||part==='__proto__'||part==='constructor'||part==='prototype';}))return '';
    return parts.join('/');
  }
  function graphFiles(){
    var studio=window.WebStudio&&typeof window.WebStudio==='object'?window.WebStudio:null;
    try{if(studio&&typeof studio.ensureProjectGraph==='function')studio.ensureProjectGraph();}catch(_){}
    var project=window.KernelState&&window.KernelState.activeProject||{};
    var graph=studio&&studio.graph||project.ovyxGraph||project.graph,bag=graph&&graph.files&&typeof graph.files==='object'?graph.files:{};
    return Object.keys(bag).map(function(raw){var path=safePath(raw);return path?{path:path,basename:path.split('/').pop()}:null;}).filter(Boolean).sort(function(a,b){return a.path.localeCompare(b.path);});
  }
  function codeRoot(){return document.querySelector('.ovyx-ws-code-root')||document.getElementById('ws-code-workspace-host');}
  function makeIcon(){
    var ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
    svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.8');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');
    var circle=document.createElementNS(ns,'circle');circle.setAttribute('cx','11');circle.setAttribute('cy','11');circle.setAttribute('r','6.5');
    var line=document.createElementNS(ns,'line');line.setAttribute('x1','16');line.setAttribute('y1','16');line.setAttribute('x2','21');line.setAttribute('y2','21');svg.append(circle,line);return svg;
  }
  function ensureTrigger(header){
    var existing=header.querySelector('[data-ovyx-code-search-trigger]');if(existing)return existing;
    var button=document.createElement('button');button.type='button';button.setAttribute('data-ovyx-code-search-trigger','1');button.setAttribute('aria-label','Search this website’s files');button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-expanded','false');button.title='Search website files (Ctrl/⌘+P)';
    button.appendChild(makeIcon());var label=document.createElement('span');label.textContent='Find file';button.appendChild(label);
    button.addEventListener('click',function(event){event.preventDefault();event.stopPropagation();if(panel&&!panel.hidden&&panel.classList.contains('is-open'))closePanel(true);else openPanel();});
    var before=header.querySelector('[data-ovyx-project-export-group],#ovyx-code-download,[data-ovyx-code-save],#ovyx-code-save');
    if(before&&before.parentNode===header)header.insertBefore(button,before);else header.appendChild(button);return button;
  }
  function createPanel(){
    if(panel)return panel;
    panel=document.createElement('section');panel.className='ovyx-code-search-popover';panel.hidden=true;panel.id='ovyx-code-search-panel';panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Search project files');panel.setAttribute('aria-hidden','true');
    var heading=document.createElement('div');heading.className='ovyx-code-search-heading';
    var title=document.createElement('strong');title.className='ovyx-code-search-title';title.textContent='Search project files';heading.appendChild(title);
    var close=document.createElement('button');close.type='button';close.className='ovyx-code-search-close';close.setAttribute('aria-label','Cancel file search');close.title='Close search';close.textContent='×';close.addEventListener('click',function(){closePanel(true);});heading.appendChild(close);
    var row=document.createElement('label');row.className='ovyx-code-search-input-row';row.appendChild(makeIcon());
    input=document.createElement('input');input.type='search';input.className='ovyx-code-search-input';input.setAttribute('aria-label','Search website files');input.setAttribute('aria-controls','ovyx-code-search-results');input.autocomplete='off';input.spellcheck=false;input.placeholder='Search files, pages, scripts…';input.addEventListener('input',function(){renderResults(input.value);});row.appendChild(input);
    message=document.createElement('p');message.className='ovyx-code-search-message';message.setAttribute('role','status');message.setAttribute('aria-live','polite');message.textContent='Start typing to find a file in this website.';
    results=document.createElement('ul');results.className='ovyx-code-search-results';results.id='ovyx-code-search-results';results.setAttribute('role','listbox');results.hidden=true;
    var footer=document.createElement('div');footer.className='ovyx-code-search-footer';var note=document.createElement('span');note.textContent='Searches this project only';footer.appendChild(note);
    var shortcut=document.createElement('span'),kbd=document.createElement('kbd');kbd.textContent='Esc';shortcut.append('Close ',kbd);footer.appendChild(shortcut);
    panel.append(heading,row,message,results,footer);document.body.appendChild(panel);return panel;
  }
  function renderResults(rawQuery){
    if(!panel||!input||!results||!message)return;
    var query=String(rawQuery||'').trim().toLowerCase();results.textContent='';results.hidden=true;message.hidden=false;
    if(!query){message.textContent='Start typing to find a file in this website.';return;}
    var files=graphFiles();if(!files.length){message.textContent='No saved website files are available yet. Build or open a website first.';return;}
    var terms=query.split(/\s+/).filter(Boolean),matches=files.filter(function(file){return terms.every(function(term){return file.path.toLowerCase().indexOf(term)>=0;});}).slice(0,MAX_RESULTS);
    if(!matches.length){message.textContent='No website files match “'+String(rawQuery).trim().slice(0,80)+'”.';return;}
    message.textContent=matches.length+(matches.length===1?' matching file':' matching files');results.hidden=false;
    matches.forEach(function(file){
      var li=document.createElement('li'),button=document.createElement('button');button.type='button';button.className='ovyx-code-search-result';button.setAttribute('role','option');button.setAttribute('data-ovyx-search-result-path',file.path);
      var ext=file.basename.indexOf('.')>=0?file.basename.split('.').pop().slice(0,5):'FILE';
      var type=document.createElement('span');type.className='ovyx-code-search-filetype';type.textContent=ext.toUpperCase()||'FILE';type.setAttribute('aria-hidden','true');
      var copy=document.createElement('span');copy.className='ovyx-code-search-filecopy';
      var name=document.createElement('span');name.className='ovyx-code-search-filename';name.textContent=file.basename;
      var fullPath=document.createElement('span');fullPath.className='ovyx-code-search-filepath';fullPath.textContent=file.path;
      copy.append(name,fullPath);button.append(type,copy);
      button.addEventListener('click',async function(){var opened=await openProjectFile(file.path);if(!opened){message.hidden=false;message.textContent='The file is in this project, but its editor could not be opened automatically. Try the project’s file list.';return;}closePanel(false);});
      li.appendChild(button);results.appendChild(li);
    });
  }
  function normalizedPath(value){return safePath(String(value||'').replace(/\\/g,'/')).toLowerCase();}
  function findExistingFileRow(path){
    var root=codeRoot();if(!root)return null;var target=normalizedPath(path),found=[],selector='[role="treeitem"],[role="option"],[data-file-path],[data-ovyx-file-path],[data-path],[data-pathname],[data-file],[data-filename],button,a,[tabindex]';
    root.querySelectorAll(selector).forEach(function(node){if(node===trigger||node===panel||(panel&&panel.contains(node)))return;
      var values=ATTRS.map(function(attr){return node.getAttribute(attr)||'';});values.push(node.getAttribute('aria-label')||'',node.getAttribute('title')||'');
      if(values.some(function(value){return normalizedPath(value)===target;}))found.push(node);});
    if(found.length)return found[0];var files=graphFiles(),base=path.split('/').pop().toLowerCase();
    if(files.filter(function(file){return file.basename.toLowerCase()===base;}).length!==1)return null;
    root.querySelectorAll(selector).forEach(function(node){if(node===trigger||node===panel||(panel&&panel.contains(node)))return;
      var text=String(node.textContent||'').replace(/\s+/g,' ').trim().toLowerCase(),labels=[node.getAttribute('aria-label')||'',node.getAttribute('title')||''].map(function(v){return v.trim().toLowerCase();});
      if(text===base||labels.indexOf(base)>=0)found.push(node);});
    return found[0]||null;
  }
  async function openProjectFile(path){
    var targets=[window.OVYXCodeWorkspace,window.OVYXWebStudioCodeWorkspace,window.CodeWorkspace,window.WebStudio].filter(function(item,index,list){return item&&list.indexOf(item)===index;});
    var methods=['openFile','openCodeFile','openProjectFile','selectFile','selectCodeFile','setActiveFile','loadFile'];
    for(var i=0;i<targets.length;i++)for(var j=0;j<methods.length;j++){if(typeof targets[i][methods[j]]!=='function')continue;
      try{var result=await targets[i][methods[j]].call(targets[i],path);if(result!==false){window.dispatchEvent(new CustomEvent('ovyx:webstudio-file-search-select',{detail:{path:path,projectId:String((window.KernelState&&window.KernelState.activeProject&&window.KernelState.activeProject.id)||'')}}));return true;}}catch(_){}
    }
    var row=findExistingFileRow(path);if(row){row.click();window.dispatchEvent(new CustomEvent('ovyx:webstudio-file-search-select',{detail:{path:path,projectId:String((window.KernelState&&window.KernelState.activeProject&&window.KernelState.activeProject.id)||'')}}));return true;}return false;
  }
  function positionPanel(){
    if(!panel||panel.hidden||!trigger)return;var rect=trigger.getBoundingClientRect(),width=Math.min(420,Math.max(0,window.innerWidth-24));
    panel.style.left=Math.min(Math.max(12,rect.right-width),Math.max(12,window.innerWidth-width-12))+'px';panel.style.right='auto';
    var top=rect.bottom+8,height=panel.getBoundingClientRect().height||320;if(top+height>window.innerHeight-12)top=Math.max(12,rect.top-height-8);
    panel.style.top=Math.min(Math.max(12,top),Math.max(12,window.innerHeight-100))+'px';
  }
  function openPanel(){
    if(closeTimer)window.clearTimeout(closeTimer);closeTimer=null;if(!trigger)return;createPanel();panel.hidden=false;panel.setAttribute('aria-hidden','false');trigger.setAttribute('aria-expanded','true');renderResults('');positionPanel();
    window.requestAnimationFrame(function(){if(panel&&!panel.hidden)panel.classList.add('is-open');});
    window.setTimeout(function(){if(input&&panel&&!panel.hidden)input.focus();},20);
  }
  function closePanel(returnFocus){
    if(!panel||panel.hidden)return;if(closeTimer)window.clearTimeout(closeTimer);if(trigger)trigger.setAttribute('aria-expanded','false');panel.setAttribute('aria-hidden','true');panel.classList.remove('is-open');
    if(input)input.value='';renderResults('');closeTimer=window.setTimeout(function(){if(panel){panel.hidden=true;closeTimer=null;}},190);
    if(returnFocus&&trigger&&document.contains(trigger))window.setTimeout(function(){try{trigger.focus();}catch(_){}},0);
  }
  function sync(){
    addStyles();fixSidebarLogos();var root=codeRoot();
    var header=document.getElementById('ovyx-code-project-header')||(root&&root.querySelector('[data-ovyx-code-header],header'))||document.querySelector('#ws-code-workspace-host header');
    if(!root||!header)return;if(trigger&&!document.contains(trigger))trigger=null;
    if(!trigger)trigger=ensureTrigger(header);else if(trigger.parentElement!==header)header.appendChild(trigger);createPanel();
  }
  document.addEventListener('click',function(event){if(!panel||panel.hidden||!panel.classList.contains('is-open'))return;var target=event.target;if((trigger&&trigger.contains(target))||panel.contains(target))return;closePanel(false);},true);
  document.addEventListener('keydown',function(event){
    if(event.key==='Escape'&&panel&&!panel.hidden&&panel.classList.contains('is-open')){event.preventDefault();closePanel(true);return;}
    if((event.ctrlKey||event.metaKey)&&String(event.key||'').toLowerCase()==='p'&&codeRoot()){event.preventDefault();if(panel&&!panel.hidden&&panel.classList.contains('is-open'))closePanel(false);else openPanel();}
  });
  window.addEventListener('resize',positionPanel);window.addEventListener('scroll',positionPanel,true);window.addEventListener('ovyx:view-changed',sync);window.addEventListener('firebase-auth-state-ready',sync);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync,{once:true});else sync();
  if(document.body&&typeof MutationObserver==='function'){var observer=new MutationObserver(sync);observer.observe(document.body,{childList:true,subtree:true});}
  window.OVYXWebStudioCodeSearch=Object.freeze({version:'1.0.0',refresh:sync,open:openPanel,close:closePanel,search:function(query){var q=String(query||'').trim().toLowerCase();if(!q)return[];return graphFiles().filter(function(file){return file.path.toLowerCase().indexOf(q)>=0;}).slice(0,MAX_RESULTS).map(function(file){return file.path;});}});
})();