(function () {
  'use strict';
  if (window.__OVYX_HELP_SUPPORT_EMAIL_V1__) return;
  window.__OVYX_HELP_SUPPORT_EMAIL_V1__ = true;

  const FORM_ID = 'ovyx-help-support-form';
  const $ = (selector, root = document) => root.querySelector(selector);

  function toast(message, kind) {
    try {
      if (typeof window.showToast === 'function') {
        window.showToast(message, kind || 'info');
        return;
      }
    } catch (_) {}
  }

  function statusNode(form) {
    let node = $('#ovyx-help-support-delivery-status', form);
    if (node) return node;
    node = document.createElement('p');
    node.id = 'ovyx-help-support-delivery-status';
    node.setAttribute('role', 'status');
    node.setAttribute('aria-live', 'polite');
    node.style.cssText = 'margin:0 0 14px;padding:12px 14px;border:1px solid rgba(255,255,255,.12);border-radius:12px;font-size:13px;line-height:1.5;display:none';
    form.prepend(node);
    return node;
  }

  function showStatus(form, message, kind) {
    const node = statusNode(form);
    node.textContent = message;
    node.style.display = 'block';
    node.style.borderColor = kind === 'success' ? 'rgba(74,190,130,.45)' : kind === 'error' ? 'rgba(235,100,100,.45)' : 'rgba(255,255,255,.12)';
    node.style.color = kind === 'success' ? '#a7f3c6' : kind === 'error' ? '#fecaca' : 'inherit';
  }

  function getInput(form, id, name) {
    return document.getElementById(id) || $('[name="' + name + '"]', form);
  }

  function bind(form) {
    if (!form || form.dataset.ovyxSupportEmailBound === '1') return;
    form.dataset.ovyxSupportEmailBound = '1';

    form.addEventListener('submit', async event => {
      event.preventDefault();
      event.stopImmediatePropagation();

      const subjectInput = getInput(form, 'ovyx-help-support-subject', 'subject');
      const messageInput = getInput(form, 'ovyx-help-support-message', 'message');
      const categoryInput = getInput(form, '', 'category');
      const subject = String(subjectInput?.value || '').trim();
      const message = String(messageInput?.value || '').trim();
      const category = String(categoryInput?.value || 'other').trim();
      if (subject.length < 4 || message.length < 12) {
        showStatus(form, subject.length < 4
          ? 'Add a short subject before sending.'
          : 'Please describe the issue in a little more detail.', 'error');
        (subject.length < 4 ? subjectInput : messageInput)?.focus();
        return;
      }

      const user = window.firebase?.auth?.()?.currentUser || null;
      if (!user || typeof user.getIdToken !== 'function') {
        showStatus(form, 'Sign in to your OVYX account before contacting Support.', 'error');
        return;
      }

      const submit = $('button[type="submit"],input[type="submit"]', form);
      const previousLabel = submit ? (submit.textContent || submit.value || '') : '';
      if (submit) {
        submit.disabled = true;
        if ('value' in submit && submit.tagName === 'INPUT') submit.value = 'Sending report…';
        else submit.textContent = 'Sending report…';
      }

      const reportId = form.dataset.ovyxSupportReportId ||
        (typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : 'report_' + Date.now() + '_' + Math.random().toString(36).slice(2));
      form.dataset.ovyxSupportReportId = reportId;

      try {
        const token = await user.getIdToken();
        const response = await fetch('/api/support/report', {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': 'Bearer ' + token,
          },
          body: JSON.stringify({
            reportId,
            subject,
            message,
            category,
            page: String(window.Router?.currentRoute || window.KernelState?.activeView || 'help').slice(0, 120),
          }),
        });
        let result = {};
        try { result = await response.json(); } catch (_) {}
        if (!response.ok || result.ok !== true) {
          throw new Error(result.message || 'OVYX could not email your report. Please try again.');
        }

        showStatus(form, 'Your report has been sent to OVYX Support. We have received it.', 'success');
        toast('Your report was sent to OVYX Support.', 'success');
        form.dataset.ovyxSupportReportId = '';
      } catch (error) {
        showStatus(form, error?.message || 'Your report could not be sent. Please try again.', 'error');
        toast(error?.message || 'Your report could not be sent.', 'warning');
      } finally {
        if (submit) {
          submit.disabled = false;
          if ('value' in submit && submit.tagName === 'INPUT') submit.value = previousLabel;
          else submit.textContent = previousLabel;
        }
      }
    }, true);
  }

  function scan() {
    bind(document.getElementById(FORM_ID));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scan, { once: true });
  } else {
    scan();
  }

  if (document.body && typeof MutationObserver === 'function') {
    const observer = new MutationObserver(records => {
      if (records.some(record => record.addedNodes?.length)) scan();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
})();
