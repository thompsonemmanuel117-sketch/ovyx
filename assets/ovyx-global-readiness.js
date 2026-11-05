(function () {
  'use strict';
  if (window.__OVYX_GLOBAL_READINESS_V1__) return;
  window.__OVYX_GLOBAL_READINESS_V1__ = true;

  function publish(payload) {
    if (!payload || payload.schemaVersion !== 1) return;
    window.OVYXGlobalReadiness = Object.freeze(payload);
    var root = document.documentElement;
    if (root && payload.country && payload.country.code) {
      root.dataset.ovyxCountry = payload.country.code;
      if (payload.country.currency) root.dataset.ovyxDisplayCurrency = payload.country.currency;
    }
    if (root && payload.locale) root.dataset.ovyxDetectedLocale = payload.locale;
    if (root && payload.timezone) root.dataset.ovyxTimezone = payload.timezone;
    window.OVYXFormatMoney = function (amount, currency) {
      var selected = String(currency || payload.country && payload.country.currency || payload.checkout && payload.checkout.currency || 'USD').toUpperCase();
      var locale = payload.locale || 'en';
      try {
        return new Intl.NumberFormat(locale, { style: 'currency', currency: selected }).format(Number(amount));
      } catch (_) {
        return new Intl.NumberFormat('en', { style: 'currency', currency: 'USD' }).format(Number(amount));
      }
    };
    window.dispatchEvent(new CustomEvent('ovyx:global-readiness-ready', { detail: window.OVYXGlobalReadiness }));
  }

  function load() {
    fetch('/api/global/readiness', {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    }).then(function (response) {
      if (!response.ok) throw new Error('Global readiness is temporarily unavailable.');
      return response.json();
    }).then(publish).catch(function () {
      // Global defaults are progressive enhancement; never block the app shell.
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load, { once: true });
  else load();
})();
