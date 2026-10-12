(function () {
  'use strict';
  if (window.__OVYX_NATIVE_ASSISTANT_WORKSPACE_V1__) return;
  window.__OVYX_NATIVE_ASSISTANT_WORKSPACE_V1__ = true;

  const $ = id => document.getElementById(id);
  const panel = () => $('kernel-brain-bot-panel');
  const allowedRoutes = new Set(['home','projects','webstudio','appstudio','workspace','templates','settings','pricing','faq','inbox']);
  const nativeModes = /^(workspace-assistant|workspace-copilot(?:-v2|-advanced|-native)?|ovyx-native-assistant)$/i;
  let busy = false;
  let history = [];
  let conversationId = newConversationId();

  function newConversationId() {
    try { return 'ovyx-' + crypto.randomUUID(); }
    catch (_) { return 'ovyx-' + Date.now().toString(36) + Math.random().toString(36).slice(2); }
  }

  function injectStyles() {
    if ($('ovyx-native-assistant-workspace-style')) return;
    const style = document.createElement('style');
    style.id = 'ovyx-native-assistant-workspace-style';
    style.textContent = `
      #kernel-brain-bot-panel.ovyx-native-workspace{
        position:fixed!important;inset:clamp(12px,2.6vh,28px) clamp(12px,2.5vw,32px) auto auto!important;
        width:min(760px,calc(100vw - 24px))!important;height:min(900px,calc(100dvh - 24px))!important;max-height:calc(100dvh - 24px)!important;
        min-height:min(540px,calc(100dvh - 24px))!important;z-index:2147482000!important;
        border:1px solid rgba(255,255,255,.12)!important;border-radius:24px!important;
        background:radial-gradient(ellipse at 15% 0%,rgba(70,90,140,.11),transparent 40%),#090a0c!important;
        color:#e9edf2!important;box-shadow:0 34px 110px rgba(0,0,0,.72),0 0 0 1px rgba(255,255,255,.025)!important;
        overflow:hidden!important;backdrop-filter:blur(26px)!important;-webkit-backdrop-filter:blur(26px)!important;
        font-family:Inter,ui-sans-serif,system-ui,sans-serif!important;user-select:text!important;
      }
      #kernel-brain-bot-panel.ovyx-native-workspace>div:first-child{
        flex:0 0 auto!important;display:flex!important;align-items:center!important;gap:12px!important;
        padding:16px 18px!important;border-bottom:1px solid rgba(255,255,255,.075)!important;
        background:rgba(11,12,15,.92)!important;min-height:76px!important;
      }
      #kernel-brain-bot-panel.ovyx-native-workspace>div:first-child>div:first-child{min-width:0!important;gap:11px!important;align-items:center!important}
      #kernel-brain-bot-panel.ovyx-native-workspace .ovyx-ai-character{width:38px!important;height:38px!important;flex:0 0 38px!important}
      #kernel-brain-bot-panel.ovyx-native-workspace .ovyx-ai-character svg{width:38px!important;height:38px!important}
      #kernel-brain-bot-panel.ovyx-native-workspace .ovyx-native-title{display:block!important;min-width:0!important;color:#f5f7fa!important;font:800 16px/1.2 Inter,system-ui,sans-serif!important;letter-spacing:-.025em!important}
      #kernel-brain-bot-panel.ovyx-native-workspace .ovyx-native-subtitle{display:flex!important;align-items:center!important;gap:6px!important;margin-top:5px!important;color:#929ba8!important;font:600 10px/1.3 Inter,system-ui,sans-serif!important;letter-spacing:0!important;text-transform:none!important;white-space:normal!important}
      #kernel-brain-bot-panel.ovyx-native-workspace .ovyx-native-status-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:#58d7b5;box-shadow:0 0 0 3px rgba(88,215,181,.09);flex:0 0 6px}
      #kernel-brain-bot-panel.ovyx-native-workspace .ovyx-native-head-actions{display:flex!important;align-items:center!important;gap:6px!important;flex:0 0 auto!important;margin-left:auto!important}
      #kernel-brain-bot-panel.ovyx-native-workspace .ovyx-native-more{
        width:38px!important;height:38px!important;display:grid!important;place-items:center!important;border:1px solid rgba(255,255,255,.1)!important;
        border-radius:12px!important;background:rgba(255,255,255,.035)!important;color:#dce2ea!important;cursor:pointer!important;font-size:21px!important;line-height:1!important;
      }
      #kernel-brain-bot-panel.ovyx-native-workspace .ovyx-native-more:hover,#kernel-brain-bot-panel.ovyx-native-workspace .ovyx-ai-assistant-close:hover{background:rgba(255,255,255,.085)!important;border-color:rgba(255,255,255,.18)!important;color:#fff!important}
      #kernel-brain-bot-panel.ovyx-native-workspace .ovyx-ai-assistant-close{width:38px!important;height:38px!important;display:grid!important;place-items:center!important;border:1px solid rgba(255,255,255,.08)!important;border-radius:12px!important;color:#c7ced8!important;background:transparent!important;flex:0 0 38px!important}
      #kernel-brain-bot-panel.ovyx-native-workspace .ovyx-native-menu{
        position:absolute!important;z-index:20!important;top:64px!important;right:58px!important;width:min(300px,calc(100vw - 44px))!important;max-height:min(66dvh,540px)!important;overflow:auto!important;
        padding:8px!important;border:1px solid rgba(255,255,255,.13)!important;border-radius:16px!important;background:#111317!important;
        box-shadow:0 24px 72px rgba(0,0,0,.7)!important;display:flex!important;flex-direction:column!important;gap:4px!important;
      }
      #kernel-brain-bot-panel.ovyx-native-workspace .ovyx-native-menu[hidden]{display:none!important}
      #kernel-brain-bot-panel.ovyx-native-workspace .ovyx-native-menu-label{padding:8px 9px 6px!important;color:#748091!important;font:800 9px/1 Inter,system-ui,sans-serif!important;letter-spacing:.13em!important;text-transform:uppercase!important}
      #kernel-brain-bot-panel.ovyx-native-workspace .ovyx-native-menu button{
        min-height:38px!important;width:100%!important;display:flex!important;align-items:center!important;gap:10px!important;
        padding:9px 10px!important;border:1px solid transparent!important;border-radius:10px!important;background:transparent!important;
        color:#dce2e9!important;text-align:left!important;font:650 12px/1.35 Inter,system-ui,sans-serif!important;cursor:pointer!important;
      }
      #kernel-brain-bot-panel.ovyx-native-workspace .ovyx-native-menu button:hover{background:rgba(255,255,255,.055)!important;border-color:rgba(255,255,255,.055)!important}
      #kernel-brain-bot-panel.ovyx-native-workspace .ovyx-native-menu button i{width:15px!important;text-align:center!important;color:#9daec4!important}
      #kernel-brain-bot-panel.ovyx-native-workspace .ovyx-native-menu .ovyx-native-menu-divider{height:1px!important;background:rgba(255,255,255,.08)!important;margin:5px 3px!important;flex:0 0 1px!important}
      #kernel-brain-bot-panel.ovyx-native-workspace .ovyx-native-menu .ovyx-ai-advanced-body{display:flex!important;flex-direction:column!important;gap:4px!important;padding:0!important}
      #kernel-brain-bot-panel.ovyx-native-workspace .ovyx-native-menu .ovyx-ai-advanced-body>div{display:flex!important;flex-direction:column!important;gap:4px!important}
      #kernel-brain-bot-panel.ovyx-native-workspace .ovyx-native-menu .v53-ai-tool{min-height:38px!important;height:auto!important;max-width:none!important;margin:0!important;padding:9px 10px!important;border:1px solid transparent!important;border-radius:10px!important;background:transparent!important;color:#dce2e9!important;display:flex!important;align-items:center!important;gap:9px!important;text-align:left!important;font:650 12px/1.35 Inter,system-ui,sans-serif!important}
      #kernel-brain-bot-panel.ovyx-native-workspace>div:nth-child(2){
        flex:0 0 auto!important;display:flex!important;align-items:center!important;justify-content:space-between!important;gap:8px!important;flex-wrap:wrap!important;
        padding:10px 18px!important;background:rgba(255,255,255,.018)!important;border-bottom:1px solid rgba(255,255,255,.06)!important;
      }
      #kernel-brain-bot-panel.ovyx-native-workspace>div:nth-child(2)>div:first-child{font:750 8px/1 Inter,system-ui,sans-serif!important;color:#717d8a!important;letter-spacing:.13em!important}
      #kernel-brain-bot-panel.ovyx-native-workspace #bot-context-node-id{font:650 11px/1.4 Inter,system-ui,sans-serif!important;color:#c8d1dc!important;max-width:65%!important}
      #kernel-brain-bot-panel.ovyx-native-workspace #bot-context-node-type{font:750 8px/1.2 Inter,system-ui,sans-serif!important;color:#9ba9bb!important;border-radius:999px!important;padding:5px 8px!important;background:rgba(255,255,255,.04)!important}
      #kernel-brain-bot-panel.ovyx-native-workspace #bot-chat-history{
        flex:1 1 auto!important;min-height:0!important;overflow:auto!important;overscroll-behavior:contain!important;
        padding:20px clamp(14px,3vw,28px)!important;display:flex!important;flex-direction:column!important;gap:12px!important;
        background:linear-gradient(180deg,rgba(255,255,255,.008),transparent 26%)!important;
        font:450 13px/1.75 Inter,system-ui,sans-serif!important;color:#d9dee5!important;
      }
      #kernel-brain-bot-panel.ovyx-native-workspace #bot-chat-history>div{max-width:100%!important;white-space:pre-wrap!important;overflow-wrap:anywhere!important;padding:13px 15px!important;border:1px solid rgba(255,255,255,.075)!important;border-radius:15px!important;background:rgba(255,255,255,.025)!important;color:#d9dee5!important;font:450 13px/1.7 Inter,system-ui,sans-serif!important}
      #kernel-brain-bot-panel.ovyx-native-workspace #bot-chat-history>div:has(.text-brand-cyan){border-color:rgba(84,203,231,.12)!important}
      #kernel-brain-bot-panel.ovyx-native-workspace #bot-chat-history .text-brand-cyan{color:#7ee6e8!important;font-weight:800!important}
      #kernel-brain-bot-panel.ovyx-native-workspace #bot-chat-history .text-brand-gold{color:#e8c36f!important}
      #kernel-brain-bot-panel.ovyx-native-workspace #bot-chat-history .ovyx-native-welcome{background:linear-gradient(140deg,rgba(70,95,155,.08),rgba(255,255,255,.018))!important;border-color:rgba(142,163,203,.13)!important}
      #kernel-brain-bot-panel.ovyx-native-workspace #bot-chat-history .ovyx-native-welcome strong{color:#f6f8fb!important;font-weight:800!important}
      #kernel-brain-bot-panel.ovyx-native-workspace>div:last-child{
        flex:0 0 auto!important;padding:11px 14px max(13px,env(safe-area-inset-bottom))!important;background:#0c0d10!important;
        border-top:1px solid rgba(255,255,255,.085)!important;display:flex!important;flex-direction:column!important;gap:9px!important;
      }
      #kernel-brain-bot-panel.ovyx-native-workspace .ovyx-native-composer-hint{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:8px!important;padding:0 4px!important;color:#778291!important;font:600 9px/1.35 Inter,system-ui,sans-serif!important}
      #kernel-brain-bot-panel.ovyx-native-workspace .ovyx-native-composer-hint kbd{border:1px solid rgba(255,255,255,.12)!important;border-radius:5px!important;padding:2px 5px!important;color:#aeb8c4!important;font:700 9px/1.2 ui-monospace,monospace!important}
      #kernel-brain-bot-panel.ovyx-native-workspace .ovyx-native-composer{display:flex!important;align-items:flex-end!important;gap:9px!important;padding:8px!important;border:1px solid rgba(255,255,255,.11)!important;border-radius:16px!important;background:#08090b!important;box-shadow:0 6px 24px rgba(0,0,0,.18)!important}
      #kernel-brain-bot-panel.ovyx-native-workspace #bot-chat-input{min-width:0!important;flex:1!important;min-height:46px!important;max-height:140px!important;resize:vertical!important;padding:12px 10px!important;border:0!important;outline:0!important;border-radius:10px!important;background:transparent!important;color:#f4f6f8!important;font:500 13px/1.55 Inter,system-ui,sans-serif!important;box-shadow:none!important}
      #kernel-brain-bot-panel.ovyx-native-workspace #bot-chat-input::placeholder{color:#6f7987!important}
      #kernel-brain-bot-panel.ovyx-native-workspace .ovyx-native-send{width:42px!important;height:42px!important;display:grid!important;place-items:center!important;border:0!important;border-radius:12px!important;background:#e9edf1!important;color:#111317!important;font-size:16px!important;font-weight:900!important;flex:0 0 42px!important;cursor:pointer!important}
      #kernel-brain-bot-panel.ovyx-native-workspace .ovyx-native-send:disabled{opacity:.35!important;cursor:not-allowed!important}
      #kernel-brain-bot-panel.ovyx-native-workspace .ovyx-native-send[aria-busy="true"]{opacity:.65!important}
      @media(max-width:640px){
        #kernel-brain-bot-panel.ovyx-native-workspace{inset:0!important;width:100vw!important;height:100dvh!important;min-height:0!important;max-height:none!important;border-radius:0!important;border-left:0!important;border-right:0!important}
        #kernel-brain-bot-panel.ovyx-native-workspace>div:first-child{padding:calc(11px + env(safe-area-inset-top)) 12px 11px!important;min-height:69px!important}
        #kernel-brain-bot-panel.ovyx-native-workspace .ovyx-ai-character,#kernel-brain-bot-panel.ovyx-native-workspace .ovyx-ai-character svg{width:34px!important;height:34px!important;flex-basis:34px!important}
        #kernel-brain-bot-panel.ovyx-native-workspace .ovyx-native-title{font-size:14px!important}
        #kernel-brain-bot-panel.ovyx-native-workspace .ovyx-native-subtitle{font-size:9px!important}
        #kernel-brain-bot-panel.ovyx-native-workspace .ovyx-native-more,#kernel-brain-bot-panel.ovyx-native-workspace .ovyx-ai-assistant-close{width:36px!important;height:36px!important;flex-basis:36px!important}
        #kernel-brain-bot-panel.ovyx-native-workspace .ovyx-native-menu{top:calc(62px + env(safe-area-inset-top))!important;right:52px!important}
        #kernel-brain-bot-panel.ovyx-native-workspace>div:nth-child(2){padding:9px 12px!important}
        #kernel-brain-bot-panel.ovyx-native-workspace #bot-context-node-id{max-width:75%!important}
        #kernel-brain-bot-panel.ovyx-native-workspace #bot-chat-history{padding:16px 12px!important;font-size:12px!important}
        #kernel-brain-bot-panel.ovyx-native-workspace #bot-chat-history>div{padding:11px 12px!important;font-size:12px!important}
        #kernel-brain-bot-panel.ovyx-native-workspace>div:last-child{padding:9px 10px max(10px,env(safe-area-inset-bottom))!important}
        #kernel-brain-bot-panel.ovyx-native-workspace .ovyx-native-composer-hint{font-size:8px!important}
      }
      @media(prefers-reduced-motion:reduce){#kernel-brain-bot-panel.ovyx-native-workspace *,#kernel-brain-bot-panel.ovyx-native-workspace *::before,#kernel-brain-bot-panel.ovyx-native-workspace *::after{scroll-behavior:auto!important;animation:none!important;transition:none!important}}
    `;
    document.head.appendChild(style);
  }

  function getUser() {
    try { return window.firebase?.auth?.().currentUser || null; }
    catch (_) { return null; }
  }

  function readToken() {
    const u = getUser();
    if (!u || typeof u.getIdToken !== 'function') {
      return Promise.reject(Object.assign(new Error('Sign in to use OVYX AI.'), { code: 'AUTH_REQUIRED' }));
    }
    return u.getIdToken(false);
  }

  function normalizeResponse(value) {
    if (!value || typeof value !== 'object') return { text: String(value || ''), actions: [] };
    return {
      ...value,
      text: String(value.text || value.answer || value.message || '').trim(),
      actions: Array.isArray(value.actions) ? value.actions : [],
    };
  }

  async function nativeGenerate(payload = {}, options = {}) {
    const prompt = String(payload.prompt || payload.message || '').trim();
    const sentMessages = Array.isArray(payload.messages)
      ? payload.messages.filter(m => m && (m.role === 'user' || m.role === 'assistant')).slice(-12)
      : null;
    const nextMessages = sentMessages || [
      ...history,
      ...(prompt ? [{ role: 'user', content: prompt }] : []),
    ];
    if (!nextMessages.length) throw new Error('Please enter a message for OVYX AI.');
    const token = await readToken();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 56000);
    try {
      const response = await fetch('/api/ai/ovyx', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify({
          prompt,
          messages: nextMessages,
          system: String(payload.system || '').slice(0, 7000),
          context: payload.context || {},
          project: payload.project || null,
          files: payload.files || null,
          conversationId,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw Object.assign(new Error(data?.message || data?.error || 'OVYX AI is unavailable right now.'), {
          status: response.status, code: data?.code || 'OVYX_NATIVE_AI_FAILED',
        });
      }
      const result = normalizeResponse(data);
      if (!result.text) throw new Error('OVYX AI returned an empty reply.');
      if (!sentMessages && prompt) {
        history = [...history, { role: 'user', content: prompt }, { role: 'assistant', content: result.text }].slice(-12);
      }
      return result;
    } catch (error) {
      if (error?.name === 'AbortError') throw Object.assign(new Error('OVYX AI took too long to respond. Please try again.'), { code: 'OVYX_NATIVE_AI_TIMEOUT' });
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  function insertWelcome() {
    const root = $('bot-chat-history');
    if (!root) return;
    root.replaceChildren();
    const bubble = document.createElement('div');
    bubble.className = 'ovyx-native-welcome';
    const strong = document.createElement('strong');
    strong.textContent = 'Welcome to OVYX AI';
    const body = document.createElement('div');
    body.textContent = 'Your project-aware workspace assistant. Ask about your projects, files, assets, settings, connections, quotas or next steps. OVYX AI can navigate the workspace and prepare tasks for the right tool.';
    const footer = document.createElement('div');
    footer.style.cssText = 'margin-top:10px;color:#7c8998;font-size:10px;font-weight:600;';
    footer.textContent = 'OVYX native engine · No third-party API key setup';
    bubble.append(strong, body, footer);
    root.appendChild(bubble);
  }

  function renderChrome() {
    const p = panel();
    if (!p) return false;
    injectStyles();
    p.classList.add('ovyx-native-workspace');
    const head = p.firstElementChild;
    const historyRoot = $('bot-chat-history');
    if (!head || !historyRoot) return false;

    const brand = head.firstElementChild;
    const label = brand?.querySelector('.font-bold') || brand?.querySelector('span:last-child');
    if (label && !label.dataset.ovyxNativeTitle) {
      label.dataset.ovyxNativeTitle = '1';
      label.textContent = 'OVYX AI';
      label.classList.add('ovyx-native-title');
      const subtitle = document.createElement('span');
      subtitle.className = 'ovyx-native-subtitle';
      subtitle.innerHTML = '<i class="ovyx-native-status-dot" aria-hidden="true"></i><span>Workspace assistant · no API key setup</span>';
      label.parentElement?.appendChild(subtitle);
    }

    let actionBar = head.querySelector('.ovyx-native-head-actions');
    if (!actionBar) {
      actionBar = document.createElement('div');
      actionBar.className = 'ovyx-native-head-actions';
      actionBar.innerHTML = '<button type="button" class="ovyx-native-more" data-ovyx-native-more aria-label="Open assistant actions" aria-haspopup="menu" aria-expanded="false" title="Assistant actions">⋯</button>';
      const close = head.querySelector('.ovyx-ai-assistant-close');
      if (close) actionBar.appendChild(close);
      head.appendChild(actionBar);
    }

    let menu = head.querySelector('.ovyx-native-menu');
    if (!menu) {
      menu = document.createElement('div');
      menu.className = 'ovyx-native-menu';
      menu.hidden = true;
      menu.setAttribute('role', 'menu');
      menu.innerHTML = '<div class="ovyx-native-menu-label">Conversation</div>' +
        '<button type="button" role="menuitem" data-ovyx-native-action="new-chat"><i class="fa-regular fa-pen-to-square" aria-hidden="true"></i>New chat</button>' +
        '<button type="button" role="menuitem" data-ovyx-native-action="copy-chat"><i class="fa-regular fa-copy" aria-hidden="true"></i>Copy conversation</button>' +
        '<button type="button" role="menuitem" data-ovyx-native-action="help"><i class="fa-regular fa-circle-question" aria-hidden="true"></i>What can OVYX AI do?</button>' +
        '<div class="ovyx-native-menu-divider"></div><div class="ovyx-native-menu-label">Workspace tools</div>';
      const advanced = p.querySelector('.ovyx-ai-advanced');
      const advancedBody = advanced?.querySelector('.ovyx-ai-advanced-body');
      if (advancedBody) {
        while (advancedBody.firstElementChild) menu.appendChild(advancedBody.firstElementChild);
        advanced.remove();
      }
      menu.insertAdjacentHTML('beforeend',
        '<button type="button" role="menuitem" data-ovyx-native-action="open-webstudio"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>Open Web Studio</button>');
      head.appendChild(menu);
    }

    const contextBlock = p.children[1];
    if (contextBlock && contextBlock !== head && !contextBlock.dataset.ovyxNativeCompact) {
      contextBlock.dataset.ovyxNativeCompact = '1';
      const liveLabel = contextBlock.firstElementChild;
      if (liveLabel) liveLabel.textContent = 'YOUR WORKSPACE';
    }
    const footer = p.lastElementChild;
    if (footer && !footer.dataset.ovyxNativeComposer) {
      footer.dataset.ovyxNativeComposer = '1';
      const existingInputRow = footer.querySelector('#bot-chat-input')?.parentElement;
      if (existingInputRow) {
        existingInputRow.classList.add('ovyx-native-composer');
        const input = $('bot-chat-input');
        if (input) {
          input.setAttribute('aria-label', 'Message OVYX AI');
          input.setAttribute('placeholder', 'Ask OVYX about your workspace…');
          input.removeAttribute('onkeydown');
        }
        const send = existingInputRow.querySelector('button');
        if (send) {
          send.classList.add('ovyx-native-send');
          send.setAttribute('aria-label', 'Send message');
          send.innerHTML = '<i class="fa-solid fa-arrow-up" aria-hidden="true"></i>';
          send.removeAttribute('onclick');
          send.dataset.ovyxNativeSend = '1';
        }
        const hint = document.createElement('div');
        hint.className = 'ovyx-native-composer-hint';
        hint.innerHTML = '<span>OVYX AI can help you navigate and understand your project</span><span><kbd>Enter</kbd> send · <kbd>Shift + Enter</kbd> new line</span>';
        existingInputRow.insertAdjacentElement('beforebegin', hint);
      }
    }
    const welcome = historyRoot.querySelector('.p-2\.5.rounded-lg.bg-ovyx-black');
    if (welcome && !welcome.dataset.ovyxNativeWelcome) {
      welcome.dataset.ovyxNativeWelcome = '1';
      welcome.classList.add('ovyx-native-welcome');
    }
    return true;
  }

  function closeMenu() {
    const p = panel();
    const menu = p?.querySelector('.ovyx-native-menu');
    const trigger = p?.querySelector('[data-ovyx-native-more]');
    if (menu) menu.hidden = true;
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
  }

  function push(text) {
    const bot = window.WorkspaceBrainBot;
    if (typeof bot?.pushMsg === 'function') bot.pushMsg('OVYX: ' + String(text));
  }

  function runActions(actions) {
    if (!Array.isArray(actions)) return;
    for (const action of actions.slice(0, 6)) {
      const type = String(action?.type || '').toLowerCase();
      if (type === 'navigate') {
        const route = String(action.route || '').replace(/^view-/i, '').toLowerCase();
        if (!allowedRoutes.has(route)) continue;
        window.Router?.go?.(route);
        if (route === 'webstudio' && String(action.prompt || '').trim()) {
          const brief = String(action.prompt).slice(0, 1500);
          [220, 650, 1100].forEach(delay => setTimeout(() => {
            const input = $('ws-chat-input');
            if (!input || document.body.classList.contains('ovyx-webstudio-active') === false) return;
            if (input.value.trim()) return;
            input.value = brief;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.focus();
          }, delay));
        }
        continue;
      }
      if (type === 'open_project') {
        const id = String(action.projectId || '');
        const found = window.ProjectStore?.list?.()?.some(item => String(item.id) === id);
        if (found) window.ProjectStore.open(id);
        continue;
      }
      if (type === 'refresh_context') {
        window.OVYXWorkspaceCopilot?.scan?.().then(() => push('Workspace context refreshed.')).catch(e => push(e?.message || 'Workspace refresh failed.'));
        continue;
      }
      if (type === 'run_project_scan') {
        const report = window.OVYXWorkspaceCopilot?.diagnose?.();
        push(report ? JSON.stringify(report, null, 2) : 'Workspace diagnostics are not available yet.');
        continue;
      }
      if (type === 'open_history') window.WebStudio?.openHistory?.();
      else if (type === 'open_assets') window.OVYXDeepRepairV3?.openAssets?.();
      else if (type === 'open_sections') window.OVYXDeepRepairV3?.openSections?.();
      else if (type === 'open_preview') window.WebStudio?.openPreviewFull?.();
    }
  }

  async function send() {
    const input = $('bot-chat-input');
    const prompt = String(input?.value || '').trim();
    if (!prompt || busy) return;
    if (!getUser()) {
      window.OVYXMasterAuth?.openAuth?.();
      push('Please sign in before using OVYX AI.');
      return;
    }
    const bot = window.WorkspaceBrainBot;
    if (!bot || typeof bot.pushMsg !== 'function') return;

    busy = true;
    const sendButton = panel()?.querySelector('[data-ovyx-native-send]');
    if (sendButton) {
      sendButton.disabled = true;
      sendButton.setAttribute('aria-busy', 'true');
      sendButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>';
    }
    input.disabled = true;
    bot.pushMsg('USER: ' + prompt);
    input.value = '';
    try {
      let context = null;
      try { context = await window.OVYXWorkspaceCopilot?.scan?.(); } catch (_) {
        context = window.__OVYX_WORKSPACE_AI_CONTEXT?.value || null;
      }
      const result = await nativeGenerate({
        mode: 'workspace-copilot-native',
        prompt,
        context: {
          workspace: context,
          diagnostics: window.OVYXWorkspaceCopilot?.diagnose?.() || null,
          assistantPolicy: 'OVYX native workspace assistant; execute only validated safe navigation actions.',
        },
        project: context?.activeProject || null,
        files: context?.activeProjectSource || null,
        system: 'Answer as OVYX AI. Be specific to the supplied authenticated workspace. Never claim to have completed an action unless it returned success. For website builds, prepare the user in Web Studio rather than claiming you built it here.',
      });
      bot.pushMsg('OVYX: ' + result.text);
      runActions(result.actions);
    } catch (error) {
      bot.pushMsg('OVYX: ' + String(error?.message || 'OVYX AI could not complete that request.'));
    } finally {
      busy = false;
      input.disabled = false;
      if (sendButton) {
        sendButton.disabled = false;
        sendButton.removeAttribute('aria-busy');
        sendButton.innerHTML = '<i class="fa-solid fa-arrow-up" aria-hidden="true"></i>';
      }
      input.focus();
      const root = $('bot-chat-history');
      if (root) root.scrollTop = root.scrollHeight;
    }
  }

  function menuAction(action) {
    const root = $('bot-chat-history');
    if (action === 'new-chat') {
      history = [];
      conversationId = newConversationId();
      closeMenu();
      insertWelcome();
      return;
    }
    if (action === 'copy-chat') {
      const text = String(root?.innerText || '').trim();
      if (!text) return;
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(() => push('Conversation copied to clipboard.')).catch(() => push('Copy was blocked by this browser.'));
      } else {
        push('Clipboard access is not available in this browser.');
      }
      closeMenu();
      return;
    }
    if (action === 'help') {
      closeMenu();
      push('Try asking: “Scan my workspace”, “What is wrong with this project?”, “Open my project settings”, “Explain the current project”, “Check my connections”, or “Prepare a website brief in Web Studio”. I only perform validated workspace actions and will tell you when something needs your approval.');
      return;
    }
    if (action === 'open-webstudio') {
      closeMenu();
      window.Router?.go?.('webstudio');
      setTimeout(() => $('ws-chat-input')?.focus(), 350);
      return;
    }
  }

  function bindEvents() {
    const p = panel();
    if (!p || p.dataset.ovyxNativeEvents === '1') return;
    p.dataset.ovyxNativeEvents = '1';
    p.addEventListener('click', event => {
      const trigger = event.target.closest('[data-ovyx-native-more]');
      if (trigger) {
        event.preventDefault();
        event.stopPropagation();
        const menu = p.querySelector('.ovyx-native-menu');
        if (!menu) return;
        const open = menu.hidden;
        menu.hidden = !open;
        trigger.setAttribute('aria-expanded', String(open));
        return;
      }
      const actionButton = event.target.closest('[data-ovyx-native-action]');
      if (actionButton) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        menuAction(actionButton.dataset.ovyxNativeAction);
        return;
      }
      const send = event.target.closest('[data-ovyx-native-send]');
      if (send) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        send();
      }
    }, true);
    const input = $('bot-chat-input');
    if (input && input.dataset.ovyxNativeKeyboard !== '1') {
      input.dataset.ovyxNativeKeyboard = '1';
      input.addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          event.stopPropagation();
          send();
        }
      });
    }
    document.addEventListener('click', event => {
      if (!event.target.closest('#kernel-brain-bot-panel .ovyx-native-menu, #kernel-brain-bot-panel [data-ovyx-native-more]')) closeMenu();
    }, true);
  }

  function installNativeRouting() {
    const service = window.OVYXAIService;
    if (service && typeof service.generate === 'function' && !service.__ovyxNativeWorkspaceRoute) {
      const previous = service.generate.bind(service);
      const routed = function (payload = {}, options = {}) {
        if (nativeModes.test(String(payload?.mode || ''))) return nativeGenerate(payload, options);
        return previous(payload, options);
      };
      routed.__ovyxNativeWorkspaceRoute = true;
      service.generate = routed;
      service.__ovyxNativeWorkspaceRoute = true;
    }
    const bot = window.WorkspaceBrainBot;
    if (bot && !bot.__ovyxNativeSend) {
      bot.send = send;
      bot.__ovyxNativeSend = true;
      if (typeof bot.open === 'function' && !bot.__ovyxNativeOpen) {
        const originalOpen = bot.open.bind(bot);
        bot.open = function (...args) {
          const result = originalOpen(...args);
          renderChrome();
          bindEvents();
          try { window.OVYXWorkspaceCopilot?.scan?.().catch(() => {}); } catch (_) {}
          return result;
        };
        bot.__ovyxNativeOpen = true;
      }
    }
    renderChrome();
    bindEvents();
  }

  function boot() {
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      installNativeRouting();
      if ((window.WorkspaceBrainBot?.__ovyxNativeSend && window.OVYXAIService?.__ovyxNativeWorkspaceRoute) || attempts >= 80) clearInterval(timer);
    }, 250);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
  window.addEventListener('ovyx:view-changed', () => setTimeout(installNativeRouting, 80), { passive: true });
  window.addEventListener('firebase-auth-state-ready', () => setTimeout(installNativeRouting, 100), { passive: true });
  window.addEventListener('pageshow', () => setTimeout(installNativeRouting, 100), { passive: true });
  window.OVYXNativeAssistant = {
    reset() { history = []; conversationId = newConversationId(); },
    send,
    render: renderChrome,
    native: true,
  };
})();