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
      toast('OVYX Auto selects an available AI model for your request.', 'info');
      return;
    }
    const label = PROVIDERS[selected];
    if (!label) return;

    const user = (() => {
      try { return window.firebase?.auth?.()?.currentUser || null; } catch (_) { return null; }
    })();
    if (!user || typeof user.getIdToken !== 'function') {
      toast('Sign in to check AI availability.', 'warning');
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
        if (response.status === 401) throw new Error('Your session has expired. Sign in again to check AI availability.');
        if (response.status === 403) throw new Error('Your account can't perform this check.');
        throw new Error('Could not check ' + label + ' right now. Please try again.');
      }
      if (data.connected === true && data.status === 'READY') {
        toast(data.message || label + ' is ready to use.', 'success');
      } else {
        const message = data.message || (This AI option isn't available right now. Try OVYX Auto or choose another available option.');
        toast(message, data.status === 'NOT_CONFIGURED' ? 'warning' : 'error');
      }
    } catch (error) {
      if (error?.name === 'AbortError' && activeChecks.get(select) !== controller) {
        return; // A newer selection superseded this result; do not show a stale toast.
      }
      if (error?.name === 'AbortError') {
        toast('The availability check took too long. Try again or choose another AI option.', 'warning');
      } else {
        toast(error?.message || 'AI availability could not be checked right now. Please try again.', 'error');
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
