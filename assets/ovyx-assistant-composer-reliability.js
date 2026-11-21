(function () {
  'use strict';
  if (window.__OVYX_ASSISTANT_COMPOSER_RELIABILITY_V1__) return;
  window.__OVYX_ASSISTANT_COMPOSER_RELIABILITY_V1__ = true;

  const STYLE_ID = 'ovyx-assistant-composer-reliability';
  let frame = 0;
  let lastFocused = false;

  function activePage() {
    return document.body?.classList.contains('ovyx-ai-assistant-page-active') &&
      document.getElementById('view-ai-assistant');
  }

  function inputNode() {
    return document.querySelector('#view-ai-assistant #bot-chat-input');
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      @media (max-width: 767px) {
        body.ovyx-ai-assistant-page-active #view-ai-assistant,
        body.ovyx-ai-assistant-page-active #view-ai-assistant #kernel-brain-bot-panel {
          min-height: 0 !important;
          box-sizing: border-box !important;
        }
        body.ovyx-ai-assistant-page-active #view-ai-assistant #kernel-brain-bot-panel {
          display: flex !important;
          flex-direction: column !important;
          left: 0 !important;
          margin-left: 0 !important;
        }
        body.ovyx-ai-assistant-page-active #view-ai-assistant #kernel-brain-bot-panel #bot-chat-history {
          flex: 1 1 0% !important;
          min-height: 0 !important;
          overflow-y: auto !important;
          overscroll-behavior-y: contain !important;
          -webkit-overflow-scrolling: touch !important;
        }
        body.ovyx-ai-assistant-page-active #view-ai-assistant #kernel-brain-bot-panel > div:last-child {
          flex: 0 0 auto !important;
          min-height: 0 !important;
          padding-bottom: max(10px, env(safe-area-inset-bottom)) !important;
        }
        body.ovyx-ai-assistant-page-active #view-ai-assistant .ovyx-native-composer {
          display: flex !important;
          align-items: flex-end !important;
          gap: 8px !important;
          width: 100% !important;
          min-width: 0 !important;
          box-sizing: border-box !important;
        }
        body.ovyx-ai-assistant-page-active #view-ai-assistant #bot-chat-input {
          display: block !important;
          flex: 1 1 0% !important;
          width: 0 !important;
          min-width: 0 !important;
          min-height: 48px !important;
          max-height: min(144px, 24dvh) !important;
          height: 48px;
          box-sizing: border-box !important;
          margin: 0 !important;
          padding: 11px 12px !important;
          border: 0 !important;
          outline: 0 !important;
          resize: none !important;
          overflow-x: hidden !important;
          overflow-y: auto !important;
          overscroll-behavior: contain !important;
          -webkit-overflow-scrolling: touch !important;
          line-height: 1.45 !important;
          touch-action: pan-y !important;
        }
        body.ovyx-ai-assistant-page-active #view-ai-assistant .ovyx-native-send,
        body.ovyx-ai-assistant-page-active #view-ai-assistant [data-ovyx-native-attach] {
          flex: 0 0 44px !important;
          width: 44px !important;
          min-width: 44px !important;
          height: 44px !important;
          align-self: flex-end !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function syncViewport() {
    const page = activePage();
    if (!page) return;
    const viewport = window.visualViewport;
    if (viewport) {
      const visualHeight = Math.max(1, Math.round(viewport.height));
      const layoutHeight = Math.max(1, Math.round(window.innerHeight || visualHeight));
      // Android Chrome can report a non-zero visualViewport offset while its
      // browser chrome settles, even when the keyboard is closed. Applying
      // that offset to the entire routed page shifts the Assistant away from
      // the top edge. Only compensate for viewport panning when the keyboard
      // is actually reducing the visible height.
      const keyboardOpen = visualHeight < layoutHeight - 120;
      const visualOffset = keyboardOpen ? Math.max(0, Math.round(viewport.offsetTop || 0)) : 0;
      page.style.setProperty('--ovyx-assistant-visual-height', visualHeight + 'px');
      page.style.setProperty('--ovyx-assistant-visual-offset', visualOffset + 'px');
    }
  }

  function resizeInput(input) {
    if (!input || !input.isConnected) return;
    const page = activePage();
    if (!page || !page.contains(input)) return;
    const max = Math.max(72, Math.min(144, Math.round((window.visualViewport?.height || window.innerHeight || 640) * 0.24)));
    input.style.height = 'auto';
    const height = Math.max(48, Math.min(input.scrollHeight || 48, max));
    input.style.height = height + 'px';
    input.style.overflowY = (input.scrollHeight > max + 1) ? 'auto' : 'hidden';
  }

  function schedule(input) {
    if (frame) return;
    const run = function () {
      frame = 0;
      syncViewport();
      resizeInput(inputNode() || input);
    };
    frame = typeof window.requestAnimationFrame === 'function' ? window.requestAnimationFrame(run) : window.setTimeout(run, 16);
  }

  function onFocusChange() {
    const focused = document.activeElement === inputNode();
    if (focused !== lastFocused) lastFocused = focused;
    schedule(inputNode());
  }

  document.addEventListener('input', function (event) {
    if (event.target?.matches?.('#view-ai-assistant #bot-chat-input')) schedule(event.target);
  }, true);
  document.addEventListener('focusin', function (event) {
    if (event.target?.matches?.('#view-ai-assistant #bot-chat-input')) onFocusChange();
  }, true);
  document.addEventListener('focusout', function (event) {
    if (event.target?.matches?.('#view-ai-assistant #bot-chat-input')) schedule(event.target);
  }, true);
  document.addEventListener('click', function (event) {
    if (event.target?.closest?.('#view-ai-assistant [data-ovyx-native-send]')) schedule(inputNode());
  }, true);
  window.addEventListener('resize', function () { schedule(inputNode()); }, { passive: true });
  window.addEventListener('orientationchange', function () { schedule(inputNode()); }, { passive: true });
  window.visualViewport?.addEventListener?.('resize', function () { schedule(inputNode()); }, { passive: true });
  window.visualViewport?.addEventListener?.('scroll', function () { schedule(inputNode()); }, { passive: true });

  function boot() {
    installStyles();
    schedule(inputNode());
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
  window.addEventListener('ovyx:view-changed', boot, { passive: true });
  window.OVYXAssistantComposerReliability = Object.freeze({ version: 1, refresh: boot });
})();