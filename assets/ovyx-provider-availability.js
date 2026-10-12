(function () {
  'use strict';
  if (window.__OVYX_PROVIDER_AVAILABILITY_V1__) return;
  window.__OVYX_PROVIDER_AVAILABILITY_V1__ = true;

  const PROVIDERS = Object.freeze({
    gemini: 'Gemini',
    deepseek: 'DeepSeek',
    anthropic: 'Claude',
    claude: 'Claude',
    openai: 'OpenAI',
  });
  const activeChecks = new WeakMap();

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

  function selectedProvider(select) {
    const raw = String(select?.value || 'automatic').trim().toLowerCase();
    return raw === 'claude' ? 'anthropic' : raw;
  }

  async function checkProvider(select) {
    const previous = activeChecks.get(select);
    if (previous) previous.abort();
    activeChecks.delete(select);
    if (select) select.removeAttribute('aria-busy');
    const selected = selectedProvider(select);
    if (!selected || selected === 'automatic') {
      toast('OVYX Auto chooses an available AI brain based on the task and configured providers.', 'info');
      return;
    }
    const label = PROVIDERS[selected];
    if (!label) return;

    const user = (() => {
      try { return window.firebase?.auth?.()?.currentUser || null; } catch (_) { return null; }
    })();
    if (!user || typeof user.getIdToken !== 'function') {
      toast('Please sign in to check ' + label + ' availability.', 'warning');
      return;
    }

    const controller = new AbortController();
    activeChecks.set(select, controller);
    const timeout = setTimeout(() => controller.abort(), 9000);
    select.setAttribute('aria-busy', 'true');

    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/ai/provider-availability?provider=' + encodeURIComponent(selected), {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json', Authorization: 'Bearer ' + idToken },
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401) throw new Error('Your sign-in has expired. Sign in again to check this AI brain.');
        if (response.status === 403) throw new Error('Your account is not allowed to check this AI brain.');
        throw new Error('Could not check ' + label + ' right now. Please try again.');
      }
      if (data.connected === true && data.status === 'READY') {
        toast(data.message || label + ' is connected and ready.', 'success');
      } else {
        const message = data.message || (label + ' is not available right now. Please try again later, or connect your own AI Brain in Universal Connections to continue building.');
        toast(message, data.status === 'NOT_CONFIGURED' ? 'warning' : 'error');
      }
    } catch (error) {
      if (error?.name === 'AbortError') {
        toast('The ' + label + ' availability check timed out. Try again or connect your own AI Brain in Universal Connections.', 'warning');
      } else {
        toast(error?.message || label + ' could not be checked right now.', 'error');
      }
    } finally {
      clearTimeout(timeout);
      if (activeChecks.get(select) === controller) {
        activeChecks.delete(select);
        select.removeAttribute('aria-busy');
      }
    }
  }

  document.addEventListener('change', event => {
    const select = event.target;
    if (!select || select.id !== 'v59-model-select') return;
    // Delegate once at document level so rebuilt selectors and repeated changes work.
    void checkProvider(select);
  });

  window.OVYXProviderAvailability = {
    check(select) { return checkProvider(select || document.getElementById('v59-model-select')); },
  };
})();
