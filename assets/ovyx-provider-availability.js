(function () {
  'use strict';
  if (window.__OVYX_PROVIDER_AVAILABILITY_V2__) return;
  window.__OVYX_PROVIDER_AVAILABILITY_V2__ = true;

  const activeChecks = new WeakMap();
  const CLOUDFARE_OPTION = 'automatic';

  function toast(message, kind) {
    const type = ['success', 'error', 'warning', 'info'].includes(kind) ? kind : 'info';
    try {
      if (typeof window.showToast === 'function') {
        window.showToast(String(message || ''), type);
        return;
      }
    } catch (_) {}
    try {
      window.dispatchEvent(new CustomEvent('ovyx:notification', {
        detail: { message: String(message || ''), type },
      }));
    } catch (_) {}
  }

  function normalizeSelector(select) {
    if (!select || select.id !== 'v59-model-select') return;
    const valid = select.options.length === 1 &&
      select.options[0].value === CLOUDFARE_OPTION &&
      select.options[0].textContent === 'Cloudflare Workers AI';
    if (valid) return;
    select.replaceChildren();
    const option = document.createElement('option');
    option.value = CLOUDFARE_OPTION;
    option.textContent = 'Cloudflare Workers AI';
    select.appendChild(option);
    select.value = CLOUDFARE_OPTION;
    select.setAttribute('aria-label', 'AI engine: Cloudflare Workers AI');
    select.dataset.ovyxCloudflareOnly = 'true';
  }

  function normalizeAllSelectors(root = document) {
    if (root.matches?.('#v59-model-select')) normalizeSelector(root);
    root.querySelectorAll?.('#v59-model-select').forEach(normalizeSelector);
  }

  async function checkProvider(select) {
    if (!select) return;
    const previous = activeChecks.get(select);
    if (previous?.running) previous.controller.abort();
    const controller = new AbortController();
    activeChecks.set(select, { controller, running: true });
    const timeout = setTimeout(() => controller.abort(), 9000);
    select?.setAttribute('aria-busy', 'true');
    try {
      const user = (() => {
        try { return window.firebase?.auth?.()?.currentUser || null; } catch (_) { return null; }
      })();
      if (!user || typeof user.getIdToken !== 'function') {
        toast('Sign in to check Cloudflare AI availability.', 'warning');
        return;
      }
      const token = await user.getIdToken();
      const response = await fetch('/api/ai/provider-availability?provider=cloudflare-workers-ai', {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401) throw new Error('Your session has expired. Sign in again to check Cloudflare AI.');
        if (response.status === 403) throw new Error('Your account cannot perform this check.');
        throw new Error(data.message || 'Cloudflare AI availability could not be checked. Please try again.');
      }
      if (data.connected === true && data.status === 'READY') {
        toast(data.message || 'Cloudflare Workers AI is ready.', 'success');
      } else {
        toast(data.message || 'The Cloudflare Workers AI binding is not configured on this deployment.', 'warning');
      }
    } catch (error) {
      if (error?.name === 'AbortError' && activeChecks.get(select)?.controller !== controller) return;
      toast(error?.message || 'Cloudflare AI availability could not be checked. Please try again.', 'error');
    } finally {
      clearTimeout(timeout);
      if (activeChecks.get(select)?.controller === controller) {
        activeChecks.delete(select);
        select?.removeAttribute('aria-busy');
      }
    }
  }

  document.addEventListener('change', event => {
    const select = event.target;
    if (!select || select.id !== 'v59-model-select') return;
    normalizeSelector(select);
    void checkProvider(select);
  });

  function boot() {
    normalizeAllSelectors();
    if (typeof MutationObserver === 'function' && document.documentElement) {
      const observer = new MutationObserver(records => {
        for (const record of records) {
          for (const node of record.addedNodes || []) {
            if (node.nodeType === 1) normalizeAllSelectors(node);
          }
        }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();

  window.OVYXProviderAvailability = {
    check(select) {
      const target = select || document.getElementById('v59-model-select');
      if (target) normalizeSelector(target);
      return checkProvider(target);
    },
  };
})();