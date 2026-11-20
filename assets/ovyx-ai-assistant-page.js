(function () {
  'use strict';
  if (window.__OVYX_AI_ASSISTANT_PAGE_V1__) return;
  window.__OVYX_AI_ASSISTANT_PAGE_V1__ = true;

  const PAGE_ID = 'view-ai-assistant';
  const PANEL_ID = 'kernel-brain-bot-panel';
  const ROUTE = 'ai-assistant';
  let returnRoute = 'home';
  let openingFromBot = false;
  let originalOpen = null;
  let originalClose = null;

  const normalizeRoute = value => String(value || '').replace(/^view-/i, '').trim().toLowerCase();

  function viewport() { return document.getElementById('view-router-viewport'); }
  function panel() { return document.getElementById(PANEL_ID); }
  function page() { return document.getElementById(PAGE_ID); }

  function currentRoute() {
    const stateRoute = normalizeRoute(window.KernelState?.activeView);
    if (stateRoute) return stateRoute;
    const root = viewport();
    if (!root) return 'home';
    const visible = Array.from(root.children).filter(node =>
      node instanceof HTMLElement && node.tagName === 'SECTION' &&
      /^view-[a-z0-9-]+$/i.test(node.id || '') && !node.classList.contains('hidden')
    );
    return visible.length === 1 ? normalizeRoute(visible[0].id) : 'home';
  }

  function panelIsOpen() {
    const node = panel();
    if (!node || node.classList.contains('hidden') || node.hidden) return false;
    const style = window.getComputedStyle(node);
    return style.display !== 'none' && style.visibility !== 'hidden' && node.getClientRects().length > 0;
  }

  function validReturnRoute(value) {
    const route = normalizeRoute(value);
    return route && route !== ROUTE && document.getElementById('view-' + route) ? route : 'home';
  }

  function mountPage() {
    const root = viewport();
    const assistant = panel();
    if (!root || !assistant) return false;

    let surface = page();
    if (!surface) {
      surface = document.createElement('section');
      surface.id = PAGE_ID;
      surface.className = 'ovyx-ai-assistant-page hidden';
      surface.setAttribute('aria-label', 'OVYX AI Assistant');
      surface.setAttribute('aria-hidden', 'true');
      surface.setAttribute('tabindex', '-1');
      surface.dataset.ovyxAiAssistantPage = '1';
      root.appendChild(surface);
    } else if (surface.parentElement !== root) {
      root.appendChild(surface);
    }

    // Reuse the one production Assistant panel. Do not clone its composer,
    // transcript, action menu, or event handlers into a second chat surface.
    if (assistant.parentElement !== surface) surface.appendChild(assistant);

    assistant.classList.remove(
      'fixed', 'top-14', 'right-0', 'bottom-0', 'w-80', 'z-40',
      'shadow-2xl', 'animate-fade-in', 'select-none'
    );
    assistant.setAttribute('role', 'region');
    assistant.setAttribute('aria-label', 'OVYX AI Assistant workspace');

    const close = assistant.querySelector('.ovyx-ai-assistant-close');
    if (close) {
      close.setAttribute('aria-label', 'Back to previous page');
      close.title = 'Back to previous page';
    }
    const input = assistant.querySelector('#bot-chat-input');
    if (input) input.placeholder = 'Ask OVYX about your workspace, projects or next step…';
    return true;
  }

  function setPageState(active) {
    document.body?.classList.toggle('ovyx-ai-assistant-page-active', active);
    const currentPage = page();
    if (currentPage) {
      currentPage.dataset.active = active ? 'true' : 'false';
      if (active) {
        currentPage.setAttribute('aria-label', 'OVYX AI Assistant');
        document.getElementById('mobile-current-view')?.replaceChildren(
          document.createTextNode('AI Assistant')
        );
      }
    }
  }

  function installRoute() {
    const bot = window.WorkspaceBrainBot;
    const router = window.Router;
    if (!bot || !router || typeof router.go !== 'function' ||
        typeof bot.open !== 'function' || typeof bot.close !== 'function' ||
        bot.__OVYX_AI_ASSISTANT_PAGE_WRAPPED) return false;
    if (!mountPage()) return false;

    // Wait until the native runtime has installed its public open wrapper.
    if (bot.__ovyxNativeOpen !== true) return false;

    originalOpen = bot.open.bind(bot);
    originalClose = bot.close.bind(bot);
    const baseGo = router.go;

    bot.open = function (...args) {
      mountPage();
      const current = currentRoute();
      if (current !== ROUTE) {
        returnRoute = validReturnRoute(current);
        openingFromBot = true;
        try { router.go(ROUTE); }
        finally { openingFromBot = false; }
      }
      const result = originalOpen.apply(bot, args);
      setPageState(true);
      return result;
    };

    bot.close = function (...args) {
      const wasOnAssistantPage = currentRoute() === ROUTE;
      const result = originalClose.apply(bot, args);
      if (wasOnAssistantPage) {
        const destination = validReturnRoute(returnRoute);
        returnRoute = 'home';
        router.go(destination);
      }
      setPageState(false);
      return result;
    };

    router.go = function (view, ...args) {
      mountPage();
      const requested = normalizeRoute(view);
      const before = currentRoute();
      if (requested === ROUTE && before !== ROUTE && !openingFromBot) {
        returnRoute = validReturnRoute(before);
      }

      const result = baseGo.call(router, view, ...args);
      const after = currentRoute();

      if (after === ROUTE) {
        setPageState(true);
        if (!openingFromBot && !panelIsOpen()) originalOpen.apply(bot, []);
      } else {
        setPageState(false);
        if (before === ROUTE && panelIsOpen()) originalClose.apply(bot, []);
        if (before === ROUTE) returnRoute = 'home';
      }
      return result;
    };

    if (typeof window.switchView === 'function') {
      window.switchView = function (view, ...args) {
        return router.go(view, ...args);
      };
    }

    bot.__OVYX_AI_ASSISTANT_PAGE_WRAPPED = true;
    setPageState(currentRoute() === ROUTE);
    return true;
  }

  function syncRouteState() {
    const active = currentRoute() === ROUTE && !!page() && !page().classList.contains('hidden');
    setPageState(active);
    if (!active && panelIsOpen() && originalClose && currentRoute() !== ROUTE) {
      originalClose.apply(window.WorkspaceBrainBot, []);
      returnRoute = 'home';
    }
  }

  function boot() {
    mountPage();
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      mountPage();
      if (installRoute() || attempts >= 480) window.clearInterval(timer);
    }, 250);

    const root = viewport();
    if (root && !root.dataset.ovyxAiAssistantRouteObserved) {
      root.dataset.ovyxAiAssistantRouteObserved = '1';
      new MutationObserver(syncRouteState).observe(root, {
        childList: false, subtree: false, attributes: true,
        attributeFilter: ['class', 'aria-hidden'],
      });
    }
    window.addEventListener('pageshow', syncRouteState, { passive: true });
    window.addEventListener('popstate', syncRouteState, { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
