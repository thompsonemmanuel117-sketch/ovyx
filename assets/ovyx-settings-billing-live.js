'use strict';
(function () {
  if (window.__OVYX_BILLING_SERVER_TRUTH_V1__) return;
  window.__OVYX_BILLING_SERVER_TRUTH_V1__ = true;
  const $ = id => document.getElementById(id);
  const billingState = { subscription: null, quota: null, payments: [], loading: false, loaded: false, errors: [], checkedAt: '', loadedAt: 0 };
  let billingRequest = null;
  const currentUser = () => { try { return window.firebase && window.firebase.auth && window.firebase.auth().currentUser || null; } catch (_) { return null; } };
  const escapeHtml = value => String(value == null ? '' : value).replace(/[&<>\"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' })[char]);
  const formatDate = value => { const date = value ? new Date(value) : null; return date && Number.isFinite(date.getTime()) ? date.toLocaleString() : 'Date not available'; };
  async function getJson(path) {
    const user = currentUser();
    if (!user) throw new Error('Sign in to load account billing information.');
    const token = await user.getIdToken(false);
    const response = await fetch(path, { method: 'GET', credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json', Authorization: 'Bearer ' + token } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(data.message || data.error || ('Request failed (HTTP ' + response.status + ').'));
    return data;
  }
  function render() {
    const panel = document.querySelector('[data-settings-panel="plan"]');
    if (!panel) return;
    const user = currentUser();
    const subscription = billingState.subscription || null;
    const quota = billingState.quota || null;
    const tier = subscription ? String(subscription.planTier || 'free').toUpperCase() : 'UNVERIFIED';
    const subscriptionStatus = subscription ? String(subscription.status || subscription.planTierState || 'unknown').replace(/[_-]+/g, ' ').toUpperCase() : 'NOT VERIFIED';
    const limit = quota ? Math.max(0, Number(quota.monthlyLimit || quota.monthlyLimitTokens || quota.monthly_limit || 0)) : 0;
    const remaining = quota ? Math.max(0, Number(quota.current_monthly_tokens ?? quota.baseRemaining ?? quota.remainingTokens ?? 0)) : 0;
    const used = Math.max(0, limit - remaining);
    const percent = limit > 0 ? Math.min(100, Math.round(used / limit * 100)) : 0;
    const usageValue = quota ? used.toLocaleString() : (billingState.loading ? 'Loading…' : (user ? 'Unavailable' : 'Sign in'));
    const usageLimit = quota ? '/ ' + limit.toLocaleString() + ' tokens' : 'Server balance required';
    const usageDetail = quota ? (remaining.toLocaleString() + ' monthly tokens remaining · ' + Math.max(0, Number(quota.daily_prompts_allowance || 0)).toLocaleString() + ' daily prompts remaining · ' + Math.max(0, Number(quota.boosterTokens || 0)).toLocaleString() + ' booster tokens') : 'Usage is shown only after the authenticated quota service confirms the balance.';
    const errors = billingState.errors.length ? 'Some billing data could not be verified: ' + billingState.errors.join(' · ') : '';
    const statusText = !user ? 'Sign in to load subscription status, token balance and payment history from OVYX servers.' : billingState.loading ? 'Checking your authenticated billing records…' : errors || (billingState.checkedAt ? 'Server data checked at ' + formatDate(billingState.checkedAt) + '. No browser-only balance or payment history is being presented as verified.' : 'Billing data has not been verified yet.');
    const statusTone = (!user || billingState.errors.length) ? 'error' : (billingState.loading ? 'ready' : 'ok');
    const payments = Array.isArray(billingState.payments) ? billingState.payments : [];
    const paymentRows = payments.length ? payments.map(payment => {
      const product = payment.plan ? 'OVYX ' + String(payment.plan).toUpperCase() + ' plan' : (payment.productId || payment.productType || 'OVYX payment');
      const amount = Number.isFinite(Number(payment.amount)) && payment.amount !== null ? escapeHtml(String(payment.currency || '') + ' ' + Number(payment.amount).toLocaleString(undefined, { maximumFractionDigits: 2 })) : 'Amount unavailable';
      const recordStatus = String(payment.status || 'pending').replace(/[_-]+/g, ' ').toUpperCase();
      const details = formatDate(payment.createdAt) + ' · ' + String(payment.provider || payment.paymentMethod || 'payment provider').toUpperCase() + ' · ' + recordStatus;
      return '<div class="ovyx-billing-history-row"><div><b>' + escapeHtml(product) + '</b><small>' + escapeHtml(details) + '</small><small>Reference: ' + escapeHtml(payment.reference || 'Not available') + '</small></div><span class="ovyx-billing-amount">' + amount + '</span></div>';
    }).join('') : '<div class="ovyx-empty-state">' + (!user ? 'Sign in to load payment history.' : billingState.loading ? 'Loading payment history…' : billingState.errors.some(error => error.indexOf('Payment history') === 0) ? 'Payment history could not be verified. No local history was substituted.' : 'No payment orders are recorded for this account.') + '</div>';
    // Keep action buttons mounted across quota/API refreshes. Consumers can hold a live
    // reference to Upgrade/Refresh and their existing event handlers must not be detached.
    const stableControls = {};
    ['ovyx-upgrade-btn', 'ovyx-token-boost-btn', 'ovyx-billing-refresh'].forEach(function (id) {
      const node = panel.querySelector('#' + id);
      if (node) stableControls[id] = node;
    });
    const billingMarkup = '<div id="ovyx-billing-live-root">' +
      '<div class="ovyx-panel-head"><div class="ovyx-panel-kicker">BILLING / PLAN</div><h2>Billing</h2><p>Subscription, quota and recent payment records loaded from authenticated OVYX services.</p></div>' +
      '<div class="ovyx-pref-group"><div class="ovyx-pref-label">PLAN</div><div class="ovyx-pref-row"><div class="ovyx-pref-copy"><b>Current plan</b><small>Server-reported subscription state: ' + escapeHtml(subscriptionStatus) + '</small></div><span class="ovyx-tier-badge">' + escapeHtml(tier) + ' PLAN</span></div>' +
      '<div class="ovyx-pref-row"><div class="ovyx-pref-copy"><b>Last verified payment</b><small>' + escapeHtml(subscription && subscription.lastPaymentAt ? formatDate(subscription.lastPaymentAt) : 'No verified payment date reported') + '</small></div><span class="ovyx-billing-amount">' + escapeHtml(subscription && subscription.amount != null ? String(subscription.currency || '') + ' ' + Number(subscription.amount).toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—') + '</span></div></div>' +
      '<div class="ovyx-billing-meter"><div class="ovyx-pref-label" style="padding:0 0 10px">SERVER AI USAGE</div><div class="ovyx-billing-numbers"><span class="ovyx-billing-used" id="ovyx-billing-server-used">' + escapeHtml(usageValue) + '</span><span class="ovyx-billing-limit">' + escapeHtml(usageLimit) + '</span></div><div class="ovyx-billing-track"><span style="width:' + percent + '%"></span></div><div class="ovyx-billing-reset">' + escapeHtml(usageDetail) + '</div></div>' +
      '<div class="ovyx-pref-group"><div class="ovyx-pref-label">SUBSCRIPTION</div><div class="ovyx-pref-row"><div class="ovyx-pref-copy"><b>' + escapeHtml(subscription ? (subscription.planTier || 'free').toString().toUpperCase() : 'Subscription unavailable') + '</b><small>Upgrade opens OVYX checkout options. A plan changes only after the server verifies payment.</small></div><button class="ovyx-settings-btn primary" id="ovyx-upgrade-btn">View Plans</button></div></div>' +
      '<div class="ovyx-pref-group"><div class="ovyx-pref-label">RECENT PAYMENT HISTORY</div><div class="ovyx-billing-history">' + paymentRows + '</div></div>' +
      '<div class="ovyx-theme-actions"><button type="button" class="ovyx-settings-btn" id="ovyx-billing-refresh" ' + (billingState.loading ? 'disabled' : '') + '>' + (billingState.loading ? 'Checking…' : 'Refresh Billing Data') + '</button><button type="button" class="ovyx-settings-btn" id="ovyx-token-boost-btn">Token Boosters</button></div>' +
      '<div class="ovyx-connection-note" id="ovyx-billing-status" role="status" data-state="' + statusTone + '">' + escapeHtml(statusText) + '</div></div>';
    panel.innerHTML = billingMarkup;
    Object.keys(stableControls).forEach(function (id) {
      const placeholder = panel.querySelector('#' + id);
      if (placeholder && placeholder !== stableControls[id]) placeholder.replaceWith(stableControls[id]);
    });
    const refreshButton = $('ovyx-billing-refresh');
    if (refreshButton) {
      refreshButton.disabled = !!billingState.loading;
      refreshButton.textContent = billingState.loading ? 'Checking…' : 'Refresh Billing Data';
    }
    const upgradeButton = $('ovyx-upgrade-btn');
    if (upgradeButton && upgradeButton.dataset.ovyxBillingActionBound !== '1') {
      upgradeButton.dataset.ovyxBillingActionBound = '1';
      upgradeButton.addEventListener('click', () => window.Router?.go?.('pricing'));
    }
    const tokenButton = $('ovyx-token-boost-btn');
    if (tokenButton && tokenButton.dataset.ovyxBillingActionBound !== '1') {
      tokenButton.dataset.ovyxBillingActionBound = '1';
      tokenButton.addEventListener('click', () => window.Router?.go?.('pricing'));
    }
    if (refreshButton && refreshButton.dataset.ovyxBillingActionBound !== '1') {
      refreshButton.dataset.ovyxBillingActionBound = '1';
      refreshButton.addEventListener('click', () => refresh(true));
    }
  }
  async function refresh(force) {
    if (billingRequest) return billingRequest;
    if (!currentUser()) {
      billingState.subscription = null; billingState.quota = null; billingState.payments = []; billingState.errors = []; billingState.loaded = true; billingState.loading = false; billingState.checkedAt = ''; render(); return;
    }
    if (!force && billingState.loaded && Date.now() - billingState.loadedAt < 30000) { render(); return; }
    billingState.loading = true; billingState.errors = []; render();
    billingRequest = Promise.allSettled([getJson('/api/payments/status'), getJson('/api/tokens/balance'), getJson('/api/payments/history')]).then(results => {
      const names = ['Subscription status', 'Token balance', 'Payment history'];
      results.forEach((result, index) => {
        if (result.status === 'rejected') { billingState.errors.push(names[index] + ': ' + String(result.reason && result.reason.message || 'request failed')); return; }
        const data = result.value;
        if (index === 0) billingState.subscription = data.subscription || null;
        if (index === 1) { billingState.quota = data; billingState.checkedAt = data.checkedAt || billingState.checkedAt; }
        if (index === 2) { billingState.payments = Array.isArray(data.payments) ? data.payments : []; billingState.checkedAt = data.checkedAt || billingState.checkedAt; }
      });
      billingState.loaded = true; billingState.loadedAt = Date.now();
    }).catch(error => { billingState.errors = [String(error && error.message || 'Billing refresh failed.')]; }).finally(() => {
      billingState.loading = false; billingRequest = null; render();
    });
    return billingRequest;
  }
  function install() {
    const settings = window.OVYXSettings;
    if (settings && typeof settings.show === 'function' && !settings.__ovyxBillingServerTruthV1) {
      const originalShow = settings.show.bind(settings);
      settings.show = function (id) { const result = originalShow(id); if (id === 'plan') setTimeout(() => { render(); refresh(true); }, 0); return result; };
      settings.__ovyxBillingServerTruthV1 = true;
    }
    const panel = document.querySelector('[data-settings-panel="plan"]');
    if (panel && !panel.dataset.ovyxBillingObserver) {
      panel.dataset.ovyxBillingObserver = '1';
      const observer = new MutationObserver(() => {
        // Use the legacy usage node only as a signal that the original Plan panel
        // has finished rendering. Once our server-backed panel exists, quota meter
        // refreshes must not replace it or detach its live controls.
        if (!panel.querySelector('#ovyx-billing-live-root') && panel.querySelector('#ovyx-bill-used')) render();
      });
      observer.observe(panel, { childList: true, subtree: true });
    }
    if (settings && settings.current === 'plan') { render(); refresh(true); }
    document.addEventListener('firebase-auth-state-ready', () => { if (window.OVYXSettings && window.OVYXSettings.current === 'plan') refresh(true); }, { passive: true });
  }
  window.OVYXBilling = { refresh: () => refresh(true), state: () => ({ loaded: billingState.loaded, loading: billingState.loading, errors: billingState.errors.slice(), paymentCount: billingState.payments.length }) };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true }); else install();
  setInterval(() => { if (window.OVYXSettings && window.OVYXSettings.current === 'plan') refresh(false); }, 60000);
})();
