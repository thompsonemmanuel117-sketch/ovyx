(function () {
  'use strict';
  if (window.__OVYX_NATIVE_ASSISTANT_WORKSPACE_V1__) return;
  window.__OVYX_NATIVE_ASSISTANT_WORKSPACE_V1__ = true;

  const ROUTES = new Set(['home','projects','webstudio','appstudio','workspace','templates','settings','pricing','faq','inbox']);
  const $ = id => document.getElementById(id);
  const state = { turns: [], busy: false, installed: false, menuOpen: false, context: null, sessionKey: '' };

  function user() {
    try { return window.firebase?.auth?.().currentUser || null; } catch (_) { return null; }
  }
  function currentProject() {
    return window.KernelState?.activeProject || window.ProjectStore?.current || null;
  }
  function toast(message, kind) {
    if (typeof window.showToast === 'function') {
      try { window.showToast(message, kind || 'info'); return; } catch (_) {}
    }
    const node = $('ovyx-native-assistant-toast') || document.createElement('div');
    node.id = 'ovyx-native-assistant-toast';
    node.setAttribute('role', 'status');
    node.textContent = String(message || '');
    node.style.cssText = 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:2147483647;max-width:min(90vw,560px);padding:10px 14px;border:1px solid rgba(232,182,79,.28);border-radius:12px;background:#101115;color:#f5f5f5;font:600 12px/1.5 Inter,system-ui,sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.38)';
    if (!node.isConnected) document.body.appendChild(node);
    clearTimeout(node._ovyxTimeout);
    node._ovyxTimeout = setTimeout(() => node.remove(), 2800);
  }
  function appendElement(parent, tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined && content !== null) node.textContent = String(content);
    parent.appendChild(node);
    return node;
  }
  function setBusy(value) {
    state.busy = !!value;
    const input = $('bot-chat-input');
    const button = $('ovyx-native-send');
    const panel = $('kernel-brain-bot-panel');
    if (input) {
      input.disabled = state.busy;
      input.setAttribute('aria-busy', String(state.busy));
    }
    if (button) {
      button.disabled = state.busy || !String(input?.value || '').trim();
      button.innerHTML = state.busy ? '<span class="ovyx-native-send-spinner" aria-hidden="true"></span>' : '<span aria-hidden="true">↑</span>';
      button.setAttribute('aria-label', state.busy ? 'OVYX AI is responding' : 'Send message to OVYX AI');
    }
    panel?.classList.toggle('ovyx-native-busy', state.busy);
  }
  function persistTurns() {
    const u = user();
    if (!u || !state.sessionKey) return;
    try { sessionStorage.setItem(state.sessionKey, JSON.stringify(state.turns.slice(-14))); } catch (_) {}
  }
  function restoreTurns() {
    const u = user();
    state.sessionKey = u ? 'ovyx.native.assistant.v1.' + u.uid : '';
    state.turns = [];
    if (!state.sessionKey) return;
    try {
      const saved = JSON.parse(sessionStorage.getItem(state.sessionKey) || '[]');
      if (Array.isArray(saved)) state.turns = saved.slice(-14).filter(x =>
        x && (x.role === 'user' || x.role === 'assistant') && typeof x.content === 'string'
      );
    } catch (_) {}
  }
  function renderMessage(role, content, options) {
    const history = $('bot-chat-history');
    if (!history) return null;
    const wrap = appendElement(history, 'article', 'ovyx-native-message ' + (role === 'user' ? 'is-user' : 'is-assistant'));
    wrap.dataset.role = role;
    if (options?.thinking) wrap.classList.add('is-thinking');
    const mark = appendElement(wrap, 'span', 'ovyx-native-avatar', role === 'user' ? 'YOU' : 'O');
    mark.setAttribute('aria-hidden', 'true');
    const body = appendElement(wrap, 'div', 'ovyx-native-message-body');
    appendElement(body, 'div', 'ovyx-native-message-label', role === 'user' ? 'You' : 'OVYX AI');
    appendElement(body, 'div', 'ovyx-native-message-text', content);
    history.scrollTop = history.scrollHeight;
    return wrap;
  }
  function renderWelcome() {
    const history = $('bot-chat-history');
    if (!history) return;
    history.replaceChildren();
    const welcome = renderMessage('assistant', 'I know how OVYX is organized and can inspect your current workspace, explain project status, check connections and diagnostics, and open the right tools. Tell me what you need in plain language.');
    if (!welcome) return;
    const body = welcome.querySelector('.ovyx-native-message-body');
    const suggestions = appendElement(body, 'div', 'ovyx-native-suggestions');
    [
      ['Check my workspace', 'Diagnose my workspace and tell me what needs attention.'],
      ['Show my project', 'Tell me about my active project, pages and files.'],
      ['Open Web Studio', 'Open Web Studio.'],
    ].forEach(item => {
      const btn = appendElement(suggestions, 'button', 'ovyx-native-suggestion', item[0]);
      btn.type = 'button';
      btn.dataset.ovyxPrompt = item[1];
    });
  }
  function rebuildHistory() {
    renderWelcome();
    state.turns.forEach(turn => renderMessage(turn.role, turn.content));
    persistTurns();
  }
  function addMessage(role, content, persist) {
    const normalized = String(content ?? '').trim();
    if (!normalized) return;
    state.turns.push({ role, content: normalized.slice(0, 6000) });
    state.turns = state.turns.slice(-14);
    renderMessage(role, normalized);
    if (persist !== false) persistTurns();
  }
  function setText(el, text) {
    if (el) el.textContent = String(text ?? '');
  }
  function nativePushMsg(message) {
    const raw = String(message ?? '');
    if (/^USER:\s*/i.test(raw)) addMessage('user', raw.replace(/^USER:\s*/i, ''), true);
    else if (/^OVYX ERROR:\s*/i.test(raw)) addMessage('assistant', raw.replace(/^OVYX ERROR:\s*/i, ''), true);
    else addMessage('assistant', raw.replace(/^OVYX:\s*/i, ''), true);
  }
  function contextBadge() {
    const u = user();
    const active = currentProject();
    setText($('bot-context-node-id'), active?.name ? 'PROJECT · ' + active.name : 'WORKSPACE · ' + (document.getElementById('sidebar-workspace-label')?.textContent?.trim() || 'OVYX'));
    setText($('bot-context-node-type'), u ? 'NATIVE ASSISTANT' : 'SIGN IN');
  }
  function ensureChrome() {
    const panel = $('kernel-brain-bot-panel');
    if (!panel) return false;
    panel.setAttribute('aria-label', 'OVYX AI workspace');
    const header = panel.children[0];
    if (header) {
      header.classList.add('ovyx-native-header');
      const title = header.querySelector('.font-bold');
      if (title) title.textContent = 'OVYX AI';
      if (title && !header.querySelector('.ovyx-native-subtitle')) {
        appendElement(title.parentElement, 'small', 'ovyx-native-subtitle', 'Your workspace, understood');
      }
      if (!header.querySelector('[data-ovyx-native-menu-button]')) {
        const group = header.querySelector('.flex.items-center.justify-between') || header;
        const menuButton = appendElement(group, 'button', 'ovyx-native-icon-button', '⋯');
        menuButton.type = 'button';
        menuButton.dataset.ovyxNativeMenuButton = '1';
        menuButton.setAttribute('aria-label', 'More assistant actions');
        menuButton.setAttribute('aria-haspopup', 'menu');
        menuButton.setAttribute('aria-expanded', 'false');
        menuButton.title = 'More actions';
      }
    }
    const contextRow = panel.children[1];
    if (contextRow) contextRow.classList.add('ovyx-native-context');
    const history = $('bot-chat-history');
    if (history) {
      history.classList.add('ovyx-native-history');
      history.setAttribute('role', 'log');
      history.setAttribute('aria-label', 'OVYX AI conversation');
      history.setAttribute('aria-live', 'polite');
      history.setAttribute('aria-relevant', 'additions text');
    }

    const footer = panel.querySelector('#bot-chat-input')?.parentElement;
    const oldInput = $('bot-chat-input');
    if (oldInput && oldInput.tagName !== 'TEXTAREA') {
      const area = document.createElement('textarea');
      area.id = oldInput.id;
      area.className = 'ovyx-native-composer-input';
      area.placeholder = 'Message OVYX AI…';
      area.setAttribute('aria-label', 'Message OVYX AI');
      area.rows = 2;
      area.autocomplete = 'off';
      area.spellcheck = true;
      oldInput.replaceWith(area);
    }
    const input = $('bot-chat-input');
    if (input) {
      input.classList.add('ovyx-native-composer-input');
      input.placeholder = 'Message OVYX AI…';
      input.setAttribute('aria-label', 'Message OVYX AI');
      input.rows = 2;
      input.oninput = function () {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 170) + 'px';
        const send = $('ovyx-native-send');
        if (send) send.disabled = state.busy || !input.value.trim();
      };
      input.onkeydown = function (event) {
        if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
          event.preventDefault();
          if (!state.busy) send();
        }
      };
    }
    if (footer) footer.classList.add('ovyx-native-composer');
    let sendButton = $('ovyx-native-send');
    if (!sendButton) {
      const row = input?.parentElement;
      const buttons = row?.querySelectorAll('button') || [];
      sendButton = buttons.length ? buttons[buttons.length - 1] : null;
      if (sendButton) sendButton.id = 'ovyx-native-send';
    }
    if (sendButton) {
      sendButton.type = 'button';
      sendButton.onclick = () => send();
      sendButton.classList.add('ovyx-native-send');
      sendButton.innerHTML = '<span aria-hidden="true">↑</span>';
      sendButton.setAttribute('aria-label', 'Send message to OVYX AI');
      sendButton.title = 'Send message';
    }

    let menu = $('ovyx-native-more-menu');
    if (!menu) {
      menu = appendElement(panel, 'div', 'ovyx-native-more-menu');
      menu.id = 'ovyx-native-more-menu';
      menu.setAttribute('role', 'menu');
      menu.setAttribute('aria-label', 'OVYX AI tools and shortcuts');
      const row = appendElement(menu, 'div', 'ovyx-native-menu-grid');
      [
        ['new-chat', 'New chat', 'Start a fresh conversation'],
        ['projects', 'Projects', 'Open your project list'],
        ['webstudio', 'Web Studio', 'Build or edit a website'],
        ['settings', 'Settings', 'Manage workspace settings'],
        ['preview', 'Preview', 'View the current preview'],
        ['history', 'History', 'Open project history'],
        ['assets', 'Assets', 'Open project assets'],
        ['sections', 'Sections', 'Edit website sections'],
        ['refresh', 'Refresh context', 'Rescan this workspace'],
      ].forEach(item => {
        const btn = appendElement(row, 'button', 'ovyx-native-menu-item', item[1]);
        btn.type = 'button';
        btn.dataset.ovyxMenuAction = item[0];
        appendElement(btn, 'small', '', item[2]);
        btn.setAttribute('role', 'menuitem');
      });
      appendElement(menu, 'div', 'ovyx-native-menu-divider');
      appendElement(menu, 'div', 'ovyx-native-menu-kicker', 'WORKSPACE TOOLS');
    }
    const details = panel.querySelector('details.ovyx-ai-advanced');
    if (details && menu && !menu.contains(details)) {
      details.open = true;
      const summary = details.querySelector('summary');
      if (summary) summary.hidden = true;
      details.classList.add('ovyx-native-tool-group');
      const body = details.querySelector('.ovyx-ai-advanced-body');
      if (body) body.classList.add('ovyx-native-tool-grid');
      menu.appendChild(details);
    }
    const oldHint = panel.querySelector('.ovyx-native-footer-note');
    const outerFooter = panel.children[3];
    if (!oldHint && outerFooter) appendElement(outerFooter, 'div', 'ovyx-native-footer-note', 'OVYX native workspace assistant · Enter to send · Shift + Enter for a new line');
    if (history && !history.dataset.ovyxNativeWelcome) {
      history.dataset.ovyxNativeWelcome = '1';
      restoreTurns();
      rebuildHistory();
    }
    contextBadge();
    return true;
  }

  function showMenu(open) {
    const menu = $('ovyx-native-more-menu');
    const button = document.querySelector('[data-ovyx-native-menu-button]');
    if (!menu || !button) return;
    state.menuOpen = open === undefined ? !state.menuOpen : !!open;
    menu.classList.toggle('is-open', state.menuOpen);
    menu.setAttribute('aria-hidden', String(!state.menuOpen));
    button.setAttribute('aria-expanded', String(state.menuOpen));
  }

  async function getWorkspaceContext(force) {
    const u = user();
    const cached = window.__OVYX_WORKSPACE_AI_CONTEXT;
    if (!force && cached?.uid === u?.uid && Number(cached.expiresAt) > Date.now() && cached.value) {
      state.context = cached.value;
      return cached.value;
    }
    const scan = window.OVYXWorkspaceCopilot?.scan;
    if (typeof scan === 'function') {
      const result = await scan();
      state.context = result;
      contextBadge();
      return result;
    }
    const p = currentProject();
    const localProjects = window.ProjectStore?.list?.() || window.KernelState?.projects || [];
    const result = {
      workspace: { name: $('sidebar-workspace-label')?.textContent?.trim() || 'OVYX Workspace', tier: window.KernelState?.userTier || 'free', currentView: window.KernelState?.activeView || 'home' },
      activeProject: p ? { id:p.id, name:p.name, status:p.status || 'draft', pages:p.pages || [], filePaths:Object.keys(window.WebStudio?.graph?.files || {}), fileCount:Object.keys(window.WebStudio?.graph?.files || {}).length } : null,
      projectInventory: localProjects.slice(0,100).map(x=>({ id:x.id, name:x.name || 'Untitled project', status:x.status || 'draft', pagesCount:x.pages?.length || 0 })),
      activeAssets: [], connections: [],
    };
    state.context = result;
    return result;
  }

  function actionAllowed(action) {
    return action && typeof action === 'object' &&
      ['navigate','open_project','open_history','open_assets','open_sections','open_preview','refresh_context','run_project_scan','restore_deleted_project'].includes(String(action.type || '').toLowerCase());
  }
  async function performActions(actions) {
    if (!Array.isArray(actions)) return;
    for (const action of actions.slice(0, 6).filter(actionAllowed)) {
      const type = String(action.type || '').toLowerCase();
      if (type === 'refresh_context') {
        try { await getWorkspaceContext(true); nativePushMsg('OVYX: Workspace context refreshed.'); }
        catch (_) { nativePushMsg('OVYX: I could not refresh the workspace context just now.'); }
        continue;
      }
      if (type === 'run_project_scan') {
        const report = window.OVYXWorkspaceCopilot?.diagnose?.();
        if (!report) { nativePushMsg('OVYX: Workspace diagnostics are not available in this view.'); continue; }
        const errors = Array.isArray(report.runtimeErrors) ? report.runtimeErrors.length : 0;
        const duplicates = Array.isArray(report.duplicateIds) ? report.duplicateIds.length : 0;
        nativePushMsg('OVYX: Workspace diagnostic results\nActive area: ' + (report.activeView || 'unknown') + '\nRouter: ' + (report.routerHealthy ? 'ready' : 'not confirmed ready') + '\nActive editor files: ' + (report.graphFileCount || 0) + '\nRecent runtime errors: ' + errors + '\nDuplicate IDs: ' + duplicates + (errors ? '\nMost recent error: ' + String(report.runtimeErrors[report.runtimeErrors.length - 1]?.message || report.runtimeErrors[report.runtimeErrors.length - 1] || '').slice(0,260) : ''));
        continue;
      }
      if (type === 'navigate') {
        const route = String(action.route || '').replace(/^view-/,'').toLowerCase();
        if (!ROUTES.has(route)) continue;
        if (action.handoffPrompt && route === 'webstudio') {
          window.__OVYX_NATIVE_STUDIO_HANDOFF__ = { prompt: String(action.prompt || '').slice(0,6000), createdAt: Date.now() };
        }
        try { await Promise.resolve(window.Router?.go?.(route)); } catch (_) { /* route feedback below */ }
        if (action.handoffPrompt && route === 'webstudio') {
          const prompt = String(action.prompt || '').slice(0,6000);
          setTimeout(() => {
            const target = $('ws-chat-input');
            if (!target || !prompt) return;
            target.value = prompt;
            target.dispatchEvent(new Event('input',{bubbles:true}));
            target.focus();
            toast('Your prompt is ready in Web Studio. Review it and press Build when you are ready.','success');
          }, 260);
        }
        showMenu(false);
        continue;
      }
      if (type === 'open_project') {
        const id = String(action.projectId || '');
        const exists = (window.ProjectStore?.list?.() || []).some(project => String(project.id) === id);
        if (exists && typeof window.ProjectStore?.open === 'function') {
          window.ProjectStore.open(id);
          nativePushMsg('OVYX: Project opened.');
        } else nativePushMsg('OVYX: I could not verify that project in the current project list, so I did not open it.');
        continue;
      }
      if (type === 'open_history') {
        if (typeof window.WebStudio?.openHistory === 'function') { window.WebStudio.openHistory(); showMenu(false); }
        else nativePushMsg('OVYX: Project history is available from Web Studio.');
        continue;
      }
      if (type === 'open_assets') {
        if (typeof window.OVYXDeepRepairV3?.openAssets === 'function') { window.OVYXDeepRepairV3.openAssets(); showMenu(false); }
        else { await window.Router?.go?.('projects'); nativePushMsg('OVYX: I opened Projects. Select a project to manage its assets.'); }
        continue;
      }
      if (type === 'open_sections') {
        if (typeof window.OVYXDeepRepairV3?.openSections === 'function') { window.OVYXDeepRepairV3.openSections(); showMenu(false); }
        else { await window.Router?.go?.('webstudio'); nativePushMsg('OVYX: I opened Web Studio so you can edit page sections.'); }
        continue;
      }
      if (type === 'open_preview') {
        if (typeof window.WebStudio?.openPreviewFull === 'function') { window.WebStudio.openPreviewFull(); showMenu(false); }
        else { await window.Router?.go?.('webstudio'); nativePushMsg('OVYX: I opened Web Studio. The preview is available there.'); }
        continue;
      }
      if (type === 'restore_deleted_project') {
        const id = String(action.recoveryId || '');
        const recovered = window.OVYXProjectRecovery?.list?.() || [];
        const exists = recovered.some(project => String(project.id) === id);
        if (!exists || typeof window.OVYXProjectRecovery?.restore !== 'function') {
          nativePushMsg('OVYX: The requested recovery record is no longer available. I have not changed any project.');
          continue;
        }
        try {
          const result = await window.OVYXProjectRecovery.restore(id);
          nativePushMsg('OVYX: ' + (result?.ok ? 'Restored ' + (result.name || 'the project') + '.' : (result?.error || 'Project recovery failed.')));
        } catch (error) { nativePushMsg('OVYX: ' + (error?.message || 'Project recovery failed.')); }
      }
    }
  }

  async function runMenuAction(name) {
    showMenu(false);
    if (name === 'new-chat') {
      if (state.busy) { toast('Please let the current reply finish before starting a new chat.','info'); return; }
      state.turns = [];
      rebuildHistory();
      toast('New chat started. Your projects and files are unchanged.','success');
      return;
    }
    if (name === 'refresh') {
      try {
        const context = await getWorkspaceContext(true);
        nativePushMsg('OVYX: Workspace context refreshed. ' + ((context.projectInventory || []).length) + ' projects are visible and ' + ((context.activeAssets || []).length) + ' assets are listed for the active project.');
      } catch (error) { nativePushMsg('OVYX: ' + (error?.message || 'Workspace refresh failed.')); }
      return;
    }
    if (name === 'webstudio') {
      await performActions([{type:'navigate',route:'webstudio'}]); return;
    }
    if (name === 'projects' || name === 'settings') {
      await performActions([{type:'navigate',route:name}]); return;
    }
    if (name === 'preview') { await performActions([{type:'open_preview'}]); return; }
    if (name === 'history') { await performActions([{type:'open_history'}]); return; }
    if (name === 'assets') { await performActions([{type:'open_assets'}]); return; }
    if (name === 'sections') { await performActions([{type:'open_sections'}]); return; }
  }

  function activeFileDetails() {
    const W = window.WebStudio || {};
    const graph = W.graph?.files || {};
    const path = String(W.activeFile || W.activePath || W.selectedFile || window.WorkspaceCode?.activeFile || '');
    const key = path && Object.prototype.hasOwnProperty.call(graph,path) ? path : Object.keys(graph).find(p => /(^|\/)(index\.html|app\.(js|tsx?)|main\.(js|css)|style(s)?\.css)$/i.test(p));
    const value = key ? graph[key] : null;
    const content = typeof value === 'string' ? value : String(value?.content || '');
    return {path:key || path, content, count:Object.keys(graph).length};
  }
  async function runTool(name) {
    if (name === 'refresh') return runMenuAction('refresh');
    if (name === 'scan') {
      try {
        const ctx = await getWorkspaceContext(true);
        nativePushMsg('OVYX: Workspace scan complete.\nProjects visible: ' + ((ctx.projectInventory || []).length) + '\nAssets for active project: ' + ((ctx.activeAssets || []).length) + '\nSaved connections: ' + ((ctx.connections || []).length) + '\nActive project: ' + (ctx.activeProject?.name || 'none selected') + '.');
      } catch (error) { nativePushMsg('OVYX: Workspace scan failed: ' + (error?.message || 'context unavailable')); }
      return;
    }
    if (name === 'diagnose' || name === 'audit') {
      const d = window.OVYXWorkspaceCopilot?.diagnose?.();
      if (!d) { nativePushMsg('OVYX: The diagnostic service is not available right now.'); return; }
      const err = Array.isArray(d.runtimeErrors) ? d.runtimeErrors : [];
      const dup = Array.isArray(d.duplicateIds) ? d.duplicateIds : [];
      nativePushMsg('OVYX: ' + (name === 'audit' ? 'Workspace audit' : 'Diagnostics') + '\nArea: ' + (d.activeView || 'unknown') + '\nRoute mounted: ' + (d.routeExists ? 'yes' : 'not confirmed') + '\nRouter: ' + (d.routerHealthy ? 'ready' : 'not confirmed ready') + '\nEditor files: ' + (d.graphFileCount || 0) + '\nRecent errors: ' + err.length + '\nDuplicate IDs: ' + dup.length + (err.length ? '\nLatest error: ' + String(err[err.length - 1]?.message || err[err.length - 1]).slice(0,300) : '') + (dup.length ? '\nExamples: ' + dup.slice(0,4).join(', ') : ''));
      return;
    }
    if (name === 'file-review') {
      const file = activeFileDetails();
      if (!file.path || !file.content) { nativePushMsg('OVYX: I could not identify a non-empty active file in the current editor graph. Open a file in Workspace or Web Studio first.'); return; }
      const todos = (file.content.match(/\b(TODO|FIXME|XXX)\b/gi) || []).length;
      const errors = (file.content.match(/console\.(error|warn)\s*\(/g) || []).length;
      nativePushMsg('OVYX: Active-file quick review\nFile: ' + file.path + '\nCharacters in current snapshot: ' + file.content.length.toLocaleString() + '\nTODO/FIXME markers: ' + todos + '\nconsole.warn/error calls: ' + errors + '\nFiles in editor graph: ' + file.count + '\nThis is a structural quick scan, not a full semantic code audit.');
      return;
    }
    if (name === 'dependencies') {
      const graph = window.WebStudio?.graph?.files || {};
      const pkgPath = Object.keys(graph).find(path => /(^|\/)package\.json$/i.test(path));
      const raw = pkgPath ? (typeof graph[pkgPath] === 'string' ? graph[pkgPath] : graph[pkgPath]?.content) : null;
      if (!raw) { nativePushMsg('OVYX: No package.json was found in the active editor graph. This project may not use Node dependencies.'); return; }
      try {
        const pkg = JSON.parse(raw);
        const deps = {...(pkg.dependencies || {}), ...(pkg.devDependencies || {})};
        const names = Object.keys(deps);
        nativePushMsg('OVYX: Dependency summary\nPackage file: ' + pkgPath + '\nProject: ' + (pkg.name || currentProject()?.name || 'unknown') + '\nProduction and development dependencies: ' + names.length + '\n' + (names.slice(0,30).map(dep => dep + ' ' + deps[dep]).join('\n') || 'No package dependencies declared.') + (names.length > 30 ? '\n… and ' + (names.length - 30) + ' more.' : ''));
      } catch (_) { nativePushMsg('OVYX: package.json was found but its current contents are not valid JSON.'); }
      return;
    }
    if (name === 'recover') {
      const items = window.OVYXProjectRecovery?.list?.() || [];
      if (!items.length) { nativePushMsg('OVYX: No recoverable deleted-project snapshot is available in this browser session. I have not changed anything.'); return; }
      nativePushMsg('OVYX: I found ' + items.length + ' recoverable project snapshot(s). Type “restore deleted project” in chat or choose a specific recovery action from the recovery tool.');
      return;
    }
  }

  async function send() {
    const input = $('bot-chat-input');
    const prompt = String(input?.value || '').trim();
    if (!prompt || state.busy) return;
    const u = user();
    if (!u) {
      window.OVYXMasterAuth?.openAuth?.();
      toast('Sign in to use OVYX AI.','info');
      return;
    }
    nativePushMsg('USER: ' + prompt);
    if (input) { input.value = ''; input.style.height = 'auto'; }
    setBusy(true);
    const history = $('bot-chat-history');
    const thinking = history ? renderMessage('assistant','OVYX AI is thinking…',{thinking:true}) : null;
    try {
      const token = await u.getIdToken(false);
      let context = null;
      try { context = await getWorkspaceContext(false); }
      catch (_) { context = state.context || {}; }
      const diagnostics = window.OVYXWorkspaceCopilot?.diagnose?.() || null;
      const response = await fetch('/api/ai/ovyx', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': 'Bearer ' + token,
        },
        body: JSON.stringify({
          prompt,
          messages: state.turns.slice(-12),
          context: { workspace: context, diagnostics },
        }),
        signal: AbortSignal.timeout ? AbortSignal.timeout(30000) : undefined,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok === false) {
        throw Object.assign(new Error(result.message || result.error || 'OVYX AI could not answer that request.'), {code:result.code || 'OVYX_ASSISTANT_FAILED', status:response.status});
      }
      thinking?.remove();
      const answer = String(result.text || result.message || '').trim();
      if (!answer) throw new Error('OVYX AI returned an empty response.');
      nativePushMsg('OVYX: ' + answer);
      await performActions(result.actions || []);
    } catch (error) {
      thinking?.remove();
      nativePushMsg('OVYX ERROR: ' + (error?.name === 'TimeoutError' ? 'The request took too long. Please try again.' : (error?.message || 'OVYX AI could not complete the request.')));
    } finally {
      setBusy(false);
      if (input) input.focus();
    }
  }

  function onDocumentClick(event) {
    const target = event.target?.closest?.('button');
    if (!target) return;
    if (target.matches('[data-ovyx-native-menu-button]')) {
      event.preventDefault(); event.stopPropagation();
      showMenu(); return;
    }
    const promptButton = target.closest('[data-ovyx-prompt]');
    if (promptButton) {
      const input = $('bot-chat-input');
      if (input) { input.value = promptButton.dataset.ovyxPrompt || ''; input.dispatchEvent(new Event('input',{bubbles:true})); input.focus(); }
      return;
    }
    const menuAction = target.dataset.ovyxMenuAction;
    if (menuAction) {
      event.preventDefault(); event.stopPropagation();
      runMenuAction(menuAction).catch(error => toast(error?.message || 'This action could not be completed.','error'));
      return;
    }
    const toolMap = {
      'data-ovyx-ai-scan':'scan',
      'data-ovyx-ai-refresh':'refresh',
      'data-ovyx-ai-diagnose':'diagnose',
      'data-ovyx-ai-audit':'audit',
      'data-ovyx-ai-file-review':'file-review',
      'data-ovyx-ai-dependency-check':'dependencies',
      'data-ovyx-ai-recover':'recover',
    };
    for (const [attribute, name] of Object.entries(toolMap)) {
      if (target.hasAttribute(attribute)) {
        event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
        runTool(name).catch(error => nativePushMsg('OVYX ERROR: ' + (error?.message || 'Tool failed.')));
        return;
      }
    }
    if (state.menuOpen && !target.closest('#ovyx-native-more-menu')) showMenu(false);
  }

  function install() {
    if (!ensureChrome()) return false;
    const bot = window.WorkspaceBrainBot;
    if (bot) {
      bot.pushMsg = nativePushMsg;
      bot.send = send;
      bot.__OVYX_NATIVE_ASSISTANT_V1 = true;
    }
    contextBadge();
    state.installed = true;
    return true;
  }

  document.addEventListener('click', onDocumentClick, true);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') showMenu(false);
  });
  window.addEventListener('firebase-auth-state-ready', () => {
    restoreTurns(); contextBadge();
    if ($('bot-chat-history')) rebuildHistory();
    install();
  }, {passive:true});
  window.addEventListener('ovyx:view-changed', () => {
    contextBadge();
    setTimeout(install, 100);
  }, {passive:true});
  window.addEventListener('pageshow', () => setTimeout(install, 100), {passive:true});

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true});
  else install();

  let attempts = 0;
  const guard = setInterval(() => {
    install();
    attempts += 1;
    if (attempts >= 28) clearInterval(guard);
  }, 200);

  window.OVYXNativeAssistantWorkspace = {
    send,
    scan: () => getWorkspaceContext(true),
    newChat: () => runMenuAction('new-chat'),
    getState: () => ({busy:state.busy, turnCount:state.turns.length, installed:state.installed}),
  };
})(); 
