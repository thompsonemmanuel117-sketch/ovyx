(function () {
  'use strict';
  if (window.__OVYX_NATIVE_ASSISTANT_WORKSPACE_V1__) return;
  window.__OVYX_NATIVE_ASSISTANT_WORKSPACE_V1__ = true;

  const $ = id => document.getElementById(id);
  const panel = () => $('kernel-brain-bot-panel');
  const allowedRoutes = new Set(['home','projects','webstudio','appstudio','workspace','templates','settings','pricing','faq','inbox']);
  const nativeModes = /^(workspace-assistant|workspace-copilot(?:-v2|-advanced|-native)?|ovyx-native-assistant)$/i;
  const NATIVE_RESPONSE_BOT_MARK = "<svg viewBox=\"0 0 64 64\" aria-hidden=\"true\"><ellipse cx=\"32\" cy=\"56\" rx=\"18\" ry=\"4.5\" fill=\"#000\" opacity=\".42\"/><path d=\"M20 18 16 10l12 4h8l12-4-4 8 3 9-3 18q-2 8-12 9-10-1-12-9l-3-18Z\" fill=\"#b88b42\" stroke=\"#ffe7a5\" stroke-width=\"1.3\"/><path d=\"M21 24q1-7 11-7t11 7v13q-1 7-11 8-10-1-11-8Z\" fill=\"#111c27\" stroke=\"#9aaec2\" stroke-opacity=\".8\"/><path d=\"M25 29q0-3.5 3-3.5t3 3.5v2q0 3-3 3t-3-3Zm10 0q0-3.5 3-3.5t3 3.5v2q0 3-3 3t-3-3Z\" fill=\"#71efff\"/><path d=\"M27 39q5 4 10 0\" fill=\"none\" stroke=\"#b8faff\" stroke-width=\"1.7\" stroke-linecap=\"round\"/><path d=\"M21 22q11-9 22 0\" fill=\"none\" stroke=\"#fff2c9\" stroke-opacity=\".8\" stroke-width=\"2.2\" stroke-linecap=\"round\"/><path d=\"M32 14V8\" stroke=\"#f8d88b\" stroke-width=\"2\" stroke-linecap=\"round\"/><circle cx=\"32\" cy=\"7\" r=\"3\" fill=\"#f8d88b\" stroke=\"#fff3c9\"/></svg>";
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
      #kernel-brain-bot-panel.ovyx-native-workspace .ovyx-native-brand-copy{display:flex!important;flex-direction:column!important;gap:0!important;min-width:0!important;align-items:flex-start!important}
      #kernel-brain-bot-panel.ovyx-native-workspace .ovyx-native-title{display:block!important;min-width:0!important;color:#f5f7fa!important;font:800 16px/1.2 Inter,system-ui,sans-serif!important;letter-spacing:-.025em!important}
      #kernel-brain-bot-panel.ovyx-native-workspace .ovyx-native-subtitle{display:flex!important;align-items:center!important;gap:6px!important;margin-top:5px!important;color:#929ba8!important;font:600 10px/1.3 Inter,system-ui,sans-serif!important;letter-spacing:0!important;text-transform:none!important;white-space:normal!important}
      #kernel-brain-bot-panel.ovyx-native-workspace .ovyx-native-status-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:#58d7b5;box-shadow:0 0 0 3px rgba(88,215,181,.09);flex:0 0 6px}
      #kernel-brain-bot-panel.ovyx-native-workspace .ovyx-native-head-actions{display:flex!important;align-items:center!important;gap:6px!important;flex:0 0 auto!important;margin-left:auto!important}
      #kernel-brain-bot-panel.ovyx-native-workspace .ovyx-native-more{
        width:38px!important;height:38px!important;display:grid!important;place-items:center!important;border:1px solid rgba(255,255,255,.1)!important;
        border-radius:12px!important;background:rgba(255,255,255,.035)!important;color:#dce2ea!important;cursor:pointer!important;font-size:21px!important;line-height:1!important;
      }
      #kernel-brain-bot-panel.ovyx-native-workspace .ovyx-native-more:hover,#kernel-brain-bot-panel.ovyx-native-workspace .ovyx-ai-assistant-close:hover{background:rgba(255,255,255,.085)!important;border-color:rgba(255,255,255,.18)!important;color:#fff!important}
      #kernel-brain-bot-panel.ovyx-native-workspace .ovyx-ai-assistant-close{position:static!important;inset:auto!important;top:auto!important;right:auto!important;width:38px!important;min-width:38px!important;height:38px!important;margin:0!important;padding:0!important;display:grid!important;place-items:center!important;border:1px solid rgba(255,255,255,.08)!important;border-radius:12px!important;color:#c7ced8!important;background:transparent!important;flex:0 0 38px!important}
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
      #kernel-brain-bot-panel.ovyx-native-workspace #bot-chat-history>.ovyx-native-message{display:flex!important;flex-direction:column!important;align-self:flex-start!important;gap:6px!important;width:fit-content!important;max-width:92%!important;padding:12px 15px!important;border:1px solid rgba(255,255,255,.08)!important;border-radius:15px 15px 15px 5px!important;background:rgba(255,255,255,.028)!important}
      #kernel-brain-bot-panel.ovyx-native-workspace #bot-chat-history>.ovyx-native-message.is-user{align-self:flex-end!important;border-color:rgba(142,163,203,.15)!important;border-radius:15px 15px 5px 15px!important;background:rgba(120,145,190,.10)!important}
      #kernel-brain-bot-panel.ovyx-native-workspace .ovyx-native-message-label{color:#8290a2!important;font:800 9px/1.2 Inter,system-ui,sans-serif!important;letter-spacing:.09em!important;text-transform:uppercase!important}
      #kernel-brain-bot-panel.ovyx-native-workspace .ovyx-native-message.is-user .ovyx-native-message-label{color:#bed0ed!important}
      #kernel-brain-bot-panel.ovyx-native-workspace .ovyx-native-message-body{white-space:pre-wrap!important;overflow-wrap:anywhere!important;color:#e1e5eb!important;font:450 13px/1.7 Inter,system-ui,sans-serif!important}

      #kernel-brain-bot-panel.ovyx-native-workspace #bot-chat-history>.ovyx-native-message{display:flex!important;flex-direction:row!important;align-items:flex-start!important;align-self:stretch!important;gap:10px!important;width:100%!important;max-width:100%!important;padding:0!important;border:0!important;border-radius:0!important;background:transparent!important;overflow:visible!important}
      #kernel-brain-bot-panel.ovyx-native-workspace #bot-chat-history>.ovyx-native-message.is-user{justify-content:flex-end!important}
      #kernel-brain-bot-panel.ovyx-native-workspace .ovyx-native-response-avatar{position:relative!important;isolation:isolate!important;display:grid!important;place-items:center!important;width:38px!important;height:38px!important;flex:0 0 38px!important;padding:1px!important;border-radius:13px!important;background:conic-gradient(from 20deg,#e8c16b,#53d8ee,#8d7cff,#e8c16b)!important;box-shadow:0 5px 18px rgba(0,0,0,.4),0 0 22px rgba(92,212,233,.08)!important;perspective:280px!important}
      #kernel-brain-bot-panel.ovyx-native-workspace .ovyx-native-response-avatar:before{content:"";position:absolute;inset:-4px;border:1px solid rgba(89,221,239,.28);border-radius:16px;z-index:-1;animation:ovyxNativeResponseOrbit 9s linear infinite}
      #kernel-brain-bot-panel.ovyx-native-workspace .ovyx-native-response-avatar:after{content:"";position:absolute;top:4px;left:6px;width:12px;height:5px;border-radius:50%;background:rgba(255,255,255,.58);filter:blur(3px);pointer-events:none}
      #kernel-brain-bot-panel.ovyx-native-workspace .ovyx-native-response-avatar svg{width:35px!important;height:35px!important;display:block!important;border-radius:12px!important;background:radial-gradient(circle at 28% 20%,#536a7a 0, #1a2631 38%,#05070a 82%)!important;filter:drop-shadow(0 3px 4px rgba(0,0,0,.65))!important;transform:rotateY(-10deg) rotateX(5deg)!important;animation:ovyxNativeResponseFloat 4.8s ease-in-out infinite!important}
      #kernel-brain-bot-panel.ovyx-native-workspace .ovyx-native-message-content{min-width:0!important;max-width:calc(100% - 48px)!important;flex:0 1 auto!important;padding:12px 14px!important;border:1px solid rgba(255,255,255,.08)!important;border-radius:4px 15px 15px 15px!important;background:linear-gradient(145deg,rgba(255,255,255,.045),rgba(255,255,255,.018))!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.025)!important}
      #kernel-brain-bot-panel.ovyx-native-workspace .ovyx-native-message.is-user .ovyx-native-message-content{max-width:88%!important;border-radius:15px 4px 15px 15px!important;border-color:rgba(142,163,203,.2)!important;background:linear-gradient(145deg,rgba(106,132,178,.16),rgba(106,132,178,.065))!important}
      #kernel-brain-bot-panel.ovyx-native-workspace .ovyx-native-message-content .ovyx-native-message-label{margin-bottom:6px!important}
      #kernel-brain-bot-panel.ovyx-native-workspace .ovyx-native-message.is-error .ovyx-native-message-content{border-color:rgba(248,113,133,.22)!important;background:linear-gradient(145deg,rgba(248,113,133,.07),rgba(255,255,255,.015))!important}
      #kernel-brain-bot-panel.ovyx-native-workspace .ovyx-native-message.is-error .ovyx-native-message-body{color:#fecdd3!important}
      #kernel-brain-bot-panel.ovyx-native-workspace .ovyx-native-welcome-brand{display:flex!important;align-items:center!important;gap:10px!important;margin-bottom:8px!important}
      #kernel-brain-bot-panel.ovyx-native-workspace .ovyx-native-welcome-brand .ovyx-native-response-avatar{width:34px!important;height:34px!important;flex-basis:34px!important}
      #kernel-brain-bot-panel.ovyx-native-workspace .ovyx-native-welcome-brand .ovyx-native-response-avatar svg{width:31px!important;height:31px!important}
      @keyframes ovyxNativeResponseOrbit{to{transform:rotate(360deg)}}@keyframes ovyxNativeResponseFloat{0%,100%{transform:translateY(0) rotateY(-10deg) rotateX(5deg)}50%{transform:translateY(-2px) rotateY(8deg) rotateX(1deg)}}
      @media(max-width:640px){#kernel-brain-bot-panel.ovyx-native-workspace .ovyx-native-response-avatar{width:34px!important;height:34px!important;flex-basis:34px!important}#kernel-brain-bot-panel.ovyx-native-workspace .ovyx-native-response-avatar svg{width:31px!important;height:31px!important}#kernel-brain-bot-panel.ovyx-native-workspace .ovyx-native-message-content{padding:10px 11px!important}}
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
        #kernel-brain-bot-panel.ovyx-native-workspace .ovyx-native-more,#kernel-brain-bot-panel.ovyx-native-workspace .ovyx-ai-assistant-close{width:36px!important;min-width:36px!important;height:36px!important;flex-basis:36px!important}
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
    const conversational = !/workspace-copilot-advanced/i.test(String(payload.mode || ''));
    const sentMessages = Array.isArray(payload.messages)
      ? payload.messages.filter(m => m && (m.role === 'user' || m.role === 'assistant')).slice(-12)
      : null;
    const nextMessages = sentMessages || [
      ...(conversational ? history : []),
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
      if (!sentMessages && conversational && prompt) {
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
    const welcomeHead = document.createElement('div');
    welcomeHead.className = 'ovyx-native-welcome-brand';
    welcomeHead.append(makeBotAvatar(), strong);
    bubble.append(welcomeHead, body, footer);
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
      const copy = document.createElement('div');
      copy.className = 'ovyx-native-brand-copy';
      label.replaceWith(copy);
      copy.append(label, subtitle);
    }

    let actionBar = head.querySelector('.ovyx-native-head-actions');
    if (!actionBar) {
      actionBar = document.createElement('div');
      actionBar.className = 'ovyx-native-head-actions';
      head.appendChild(actionBar);
    }
    let moreTrigger = actionBar.querySelector('[data-ovyx-native-more]');
    if (!moreTrigger) {
      moreTrigger = document.createElement('button');
      moreTrigger.type = 'button';
      moreTrigger.className = 'ovyx-native-more';
      moreTrigger.dataset.ovyxNativeMore = '1';
      moreTrigger.setAttribute('aria-label', 'Open assistant actions');
      moreTrigger.setAttribute('aria-haspopup', 'menu');
      moreTrigger.setAttribute('aria-expanded', 'false');
      moreTrigger.title = 'Assistant actions';
      moreTrigger.textContent = '⋯';
      actionBar.insertBefore(moreTrigger, actionBar.firstChild);
    }
    const close = head.querySelector('.ovyx-ai-assistant-close');
    if (close && close.parentElement !== actionBar) actionBar.appendChild(close);

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
        let input = $('bot-chat-input');
        if (input && input.tagName !== 'TEXTAREA') {
          const textarea = document.createElement('textarea');
          textarea.id = input.id;
          textarea.className = input.className;
          textarea.value = input.value || '';
          textarea.rows = 1;
          textarea.setAttribute('aria-label', 'Message OVYX AI');
          textarea.setAttribute('placeholder', 'Ask OVYX about your workspace…');
          input.replaceWith(textarea);
          input = textarea;
        }
        if (input) {
          input.setAttribute('aria-label', 'Message OVYX AI');
          input.setAttribute('placeholder', 'Ask OVYX about your workspace…');
          input.removeAttribute('onkeydown');
          input.setAttribute('rows', '1');
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

  function bindMenuTrigger() {
    const p = panel();
    const trigger = p?.querySelector('[data-ovyx-native-more]');
    if (!p || !trigger || trigger.dataset.ovyxNativeToggleBound === '1') return;
    trigger.dataset.ovyxNativeToggleBound = '1';
    trigger.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      const menu = p.querySelector('.ovyx-native-menu');
      if (!menu) return;
      const opening = menu.hidden;
      menu.hidden = !opening;
      trigger.setAttribute('aria-expanded', String(opening));
      if (opening) menu.querySelector('[role="menuitem"]')?.focus();
    });
  }

  function makeBotAvatar() {
    const avatar = document.createElement('span');
    avatar.className = 'ovyx-native-response-avatar';
    avatar.setAttribute('aria-label', 'OVYX AI');
    avatar.innerHTML = NATIVE_RESPONSE_BOT_MARK;
    return avatar;
  }

  function pushMessage(raw) {
    const root = $('bot-chat-history');
    const text = String(raw ?? '').slice(0, 30000);
    if (!root) {
      const fallback = $('kernel-bot-stdout');
      if (fallback) {
        const row = document.createElement('div');
        row.textContent = text;
        fallback.appendChild(row);
      }
      return null;
    }
    const isUser = /^USER:\s*/i.test(text);
    const isError = /^OVYX\s+ERROR:/i.test(text);
    const bodyText = text.replace(/^USER:\s*/i, '').replace(/^OVYX(?:\s+ERROR)?:\s*/i, '');
    const row = document.createElement('div');
    row.className = 'ovyx-native-message ' + (isUser ? 'is-user' : 'is-assistant') + (isError ? ' is-error' : '');
    row.dataset.ovyxNativeMessage = '1';
    if (!isUser) row.appendChild(makeBotAvatar());
    const content = document.createElement('div');
    content.className = 'ovyx-native-message-content';
    const label = document.createElement('div');
    label.className = 'ovyx-native-message-label';
    label.textContent = isUser ? 'You' : 'OVYX AI';
    const body = document.createElement('div');
    body.className = 'ovyx-native-message-body';
    body.textContent = bodyText || text;
    content.append(label, body);
    row.appendChild(content);
    root.appendChild(row);
    root.scrollTop = root.scrollHeight;
    return row;
  }
  function push(text) {
    const bot = window.WorkspaceBrainBot;
    if (typeof bot?.pushMsg === 'function') bot.pushMsg('OVYX: ' + String(text));
    else pushMessage('OVYX: ' + String(text));
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


  function localWorkspaceSnapshot() {
    const state = window.KernelState || {};
    const currentUser = getUser();
    const localProjects = Array.isArray(window.ProjectStore?.list?.())
      ? window.ProjectStore.list()
      : (Array.isArray(state.projects) ? state.projects : []);
    const active = state.activeProject || window.ProjectStore?.current || null;
    const graph = active && active.id === state.activeProject?.id ? window.WebStudio?.graph : null;
    const files = graph?.files || active?.files || {};
    const fileRows = Object.entries(files).slice(0, 24).map(([path, value]) => ({
      path,
      content: String(typeof value === 'string' ? value : value?.content || '').slice(0, 1400),
    }));
    const inventory = localProjects.slice(0, 60).map(project => ({
      id: project.id,
      name: project.name || 'Untitled project',
      status: project.status || 'draft',
      pagesCount: Array.isArray(project.pages) ? project.pages.length : 0,
    }));
    const activeProject = active ? {
      id: active.id || null,
      name: active.name || 'Untitled project',
      description: String(active.description || '').slice(0, 1200),
      status: active.status || 'draft',
      pages: (Array.isArray(active.pages) ? active.pages : []).slice(0, 60).map(page => ({
        id: page.id || null,
        name: page.name || page.slug || 'Page',
        slug: page.slug || '',
        sectionsCount: Array.isArray(page.sections) ? page.sections.length : 0,
      })),
      filePaths: Object.keys(files).slice(0, 120),
      fileCount: Object.keys(files).length,
    } : null;
    return {
      version: 1,
      account: { uid: currentUser?.uid || null, signedIn: !!currentUser },
      workspace: {
        name: $('sidebar-workspace-label')?.textContent?.trim() || 'OVYX Workspace',
        currentView: String(state.activeView || 'home').replace(/^view-/, ''),
        tier: String(state.userTier || window.__OVYX_SERVER_ENTITLEMENTS?.planTier || 'free'),
      },
      projectInventory: inventory,
      serverProjectInventory: inventory,
      activeProject,
      activeProjectSource: fileRows,
      activeAssets: [],
      connections: [],
      contextSource: 'local-workspace-snapshot',
    };
  }

  function syncWorkspaceBadge(context, limited = false) {
    const currentUser = getUser();
    const project = context?.activeProject;
    const workspace = context?.workspace;
    const label = $('bot-context-node-id');
    const status = $('bot-context-node-type');
    if (label) {
      label.textContent = project?.name
        ? 'WORKSPACE · ' + String(project.name).slice(0, 90)
        : 'OVYX WORKSPACE · ' + String(workspace?.name || 'CHAT READY').slice(0, 80);
      label.title = limited
        ? 'The live workspace scan did not finish. Chat still works with the local workspace snapshot.'
        : 'Workspace details available to OVYX AI.';
    }
    if (status) {
      status.textContent = !currentUser ? 'SIGN IN REQUIRED' : (limited ? 'CHAT READY · LIMITED' : 'NATIVE AI READY');
      status.title = !currentUser
        ? 'Sign in to use the private, account-aware assistant.'
        : (limited ? 'Workspace scan is limited; you can still chat with OVYX AI.' : 'OVYX native AI is ready.');
    }
    const subtitle = panel()?.querySelector('.ovyx-native-subtitle span');
    if (subtitle) subtitle.textContent = currentUser
      ? 'Native AI · workspace-aware'
      : 'Sign in required to chat';
    const dot = panel()?.querySelector('.ovyx-native-status-dot');
    if (dot) {
      dot.style.background = currentUser ? '#58d7b5' : '#e8b64f';
      dot.style.boxShadow = currentUser ? '0 0 0 3px rgba(88,215,181,.09)' : '0 0 0 3px rgba(232,182,79,.09)';
    }
  }

  async function resolveWorkspaceContext() {
    const fallback = localWorkspaceSnapshot();
    let scanned = null;
    let limited = false;
    const scanner = window.OVYXWorkspaceCopilot?.scan;
    if (typeof scanner === 'function') {
      let timer = null;
      try {
        const result = await Promise.race([
          Promise.resolve().then(() => scanner()).then(value => ({ value })),
          new Promise(resolve => { timer = setTimeout(() => resolve({ value: null, timedOut: true }), 1800); }),
        ]);
        scanned = result?.value || null;
        limited = !scanned || typeof scanned !== 'object' || result?.timedOut === true;
      } catch (_) {
        limited = true;
      } finally {
        if (timer) clearTimeout(timer);
      }
    } else {
      limited = true;
    }

    const context = scanned && typeof scanned === 'object' ? scanned : fallback;
    const projectInventory = Array.isArray(context.projectInventory) && context.projectInventory.length
      ? context.projectInventory
      : fallback.projectInventory;
    const merged = {
      ...fallback,
      ...context,
      workspace: context.workspace || fallback.workspace,
      projectInventory,
      serverProjectInventory: Array.isArray(context.serverProjectInventory) && context.serverProjectInventory.length
        ? context.serverProjectInventory
        : fallback.serverProjectInventory,
      activeProject: context.activeProject || fallback.activeProject,
      activeProjectSource: Array.isArray(context.activeProjectSource) && context.activeProjectSource.length
        ? context.activeProjectSource
        : fallback.activeProjectSource,
      contextWarning: limited
        ? 'Live workspace context was unavailable. Use this current browser snapshot when helpful, but continue normal chat.'
        : null,
    };
    syncWorkspaceBadge(merged, limited);
    return { context: merged, limited };
  }

  function watchContextStatus() {
    const label = $('bot-context-node-id');
    const status = $('bot-context-node-type');
    if (!label || label.dataset.ovyxContextWatch === '1') return;
    label.dataset.ovyxContextWatch = '1';
    const observer = new MutationObserver(() => {
      if (!/workspace context unavailable|scanning workspace/i.test(label.textContent || '')) return;
      syncWorkspaceBadge(localWorkspaceSnapshot(), true);
    });
    observer.observe(label, { childList: true, characterData: true, subtree: true });
    if (status) status.textContent = getUser() ? 'CHAT READY' : 'SIGN IN REQUIRED';
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
      const contextResult = await resolveWorkspaceContext();
      const context = contextResult.context;
      const result = await nativeGenerate({
        mode: 'workspace-copilot-native',
        prompt,
        context: {
          workspace: context,
          diagnostics: window.OVYXWorkspaceCopilot?.diagnose?.() || null,
          contextLimited: contextResult.limited,
          contextWarning: context.contextWarning || null,
          assistantPolicy: 'OVYX native workspace assistant; execute only validated safe navigation actions. Context scanning is optional: answer the user normally even if the live scan is unavailable.',
        },
        system: 'Answer as OVYX AI. Be specific to the supplied authenticated workspace. Never claim to have completed an action unless it returned success. For website builds, prepare the user in Web Studio rather than claiming you built it here.',
      });
      syncWorkspaceBadge(context, contextResult.limited);
      bot.pushMsg('OVYX: ' + result.text);
      runActions(result.actions);
    } catch (error) {
      syncWorkspaceBadge(localWorkspaceSnapshot(), true);
      bot.pushMsg('OVYX: ' + String(error?.message || 'OVYX AI could not complete that request.'));
    } finally {
      busy = false;
      input.disabled = false;
      if (sendButton) {
        sendButton.disabled = !String(input.value || '').trim();
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
        // Let the button's own handler toggle the menu. Do not stop the event
        // during ancestor capture, which can prevent the target click handler from running.
        event.preventDefault();
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
      const workspaceTool = event.target.closest('[data-ovyx-ai-scan], [data-ovyx-ai-refresh], [data-ovyx-ai-recover]');
      if (workspaceTool) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        closeMenu();
        if (workspaceTool.hasAttribute('data-ovyx-ai-recover')) {
          Promise.resolve(window.OVYXProjectRecovery?.restore?.(null))
            .then(result => push(result?.ok ? `Recovered ${result.name || 'project'}.` : (result?.error || 'No recoverable deleted project was found.')))
            .catch(error => push(error?.message || 'Project recovery failed.'));
        } else {
          Promise.resolve(window.OVYXWorkspaceCopilot?.scan?.() || window.__OVYX_SCAN_WORKSPACE_CONTEXT__?.(true))
            .then(context => push(`Workspace refreshed · ${context?.projectInventory?.length || 0} projects · ${context?.activeAssets?.length || 0} assets.`))
            .catch(error => push(error?.message || 'Workspace scan failed.'));
        }
        return;
      }
      if (event.target.closest('.ovyx-native-menu button')) closeMenu();
      const sendButton = event.target.closest('[data-ovyx-native-send]');
      if (sendButton) {
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
      input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 140) + 'px';
        const button = panel()?.querySelector('[data-ovyx-native-send]');
        if (button && !busy) button.disabled = !input.value.trim();
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
    if (bot && !bot.__ovyxNativePushMessage) {
      bot.pushMsg = pushMessage;
      bot.__ovyxNativePushMessage = true;
    }
    if (bot && !bot.__ovyxNativeSend) {
      bot.send = send;
      bot.__ovyxNativeSend = true;
      if (typeof bot.open === 'function' && !bot.__ovyxNativeOpen) {
        const originalOpen = bot.open.bind(bot);
        bot.open = function (...args) {
          const result = originalOpen(...args);
          renderChrome();
          bindEvents();
          resolveWorkspaceContext().catch(() => syncWorkspaceBadge(localWorkspaceSnapshot(), true));
          return result;
        };
        bot.__ovyxNativeOpen = true;
      }
    }
    renderChrome();
    bindMenuTrigger();
    bindEvents();
    syncWorkspaceBadge(localWorkspaceSnapshot(), false);
    watchContextStatus();
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