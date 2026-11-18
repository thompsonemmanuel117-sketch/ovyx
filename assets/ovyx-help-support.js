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
      if (submit) {
        submit.disabled = true;
        submit.setAttribute('aria-busy', 'true');
      }

      const payloadSignature = [subject, message, category].join('\\n');
      const sameRetryPayload = form.dataset.ovyxSupportPayloadSignature === payloadSignature;
      const reportId = sameRetryPayload && form.dataset.ovyxSupportReportId
        ? form.dataset.ovyxSupportReportId
        : (typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : 'report_' + Date.now() + '_' + Math.random().toString(36).slice(2));
      form.dataset.ovyxSupportReportId = reportId;
      form.dataset.ovyxSupportPayloadSignature = payloadSignature;

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
        form.dataset.ovyxSupportReportId = '';\n        form.dataset.ovyxSupportPayloadSignature = '';
      } catch (error) {
        showStatus(form, error?.message || 'Your report could not be sent. Please try again.', 'error');
        toast(error?.message || 'Your report could not be sent.', 'warning');
      } finally {
        if (submit) {
          submit.disabled = false;
          submit.removeAttribute('aria-busy');
        }
      }
    }, true);
  }

  function enhanceHelpPage() {
    const page = document.getElementById('view-faq');
    if (!page || document.getElementById('ovyx-help-centre-intro')) return;
    const form = document.getElementById(FORM_ID);
    if (!form) return;

    const header = document.createElement('section');
    header.id = 'ovyx-help-centre-intro';
    header.setAttribute('aria-label', 'OVYX Help Centre');
    header.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:space-between;gap:18px 24px;align-items:center;margin:0 0 24px;padding:clamp(20px,3vw,30px);border:1px solid rgba(232,182,79,.22);border-radius:22px;background:radial-gradient(ellipse at 12% 0%,rgba(232,182,79,.10),transparent 52%),linear-gradient(145deg,rgba(255,255,255,.055),rgba(255,255,255,.018));';
    const copy = document.createElement('div');
    copy.style.cssText = 'flex:1 1 280px;min-width:0';
    copy.innerHTML = '<p style="margin:0 0 8px;color:#d9ad58;font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase">OVYX HELP CENTRE</p><h1 style="margin:0;color:var(--text-primary,#fff);font-size:clamp(24px,3vw,34px);line-height:1.12;letter-spacing:-.035em">Your guide to OVYX.</h1><p style="max-width:620px;margin:10px 0 0;color:var(--text-secondary,#a1a1aa);font-size:14px;line-height:1.65">Ask OVYX AI how the platform works, or contact the support team when you need a person.</p>';
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:flex-end';
    const ask = document.createElement('button');
    ask.type = 'button';
    ask.textContent = 'Ask OVYX AI';
    ask.style.cssText = 'min-height:42px;padding:0 17px;border:1px solid rgba(232,182,79,.45);border-radius:12px;background:linear-gradient(135deg,#e8b64f,#b9832c);color:#17120a;font-weight:700;cursor:pointer';
    ask.addEventListener('click', () => {
      const assistant = window.WorkspaceBrainBot;
      if (typeof assistant?.open !== 'function') {
        toast('OVYX AI is not ready yet. Please try again in a moment.', 'warning');
        return;
      }
      assistant.open();
      window.setTimeout(() => {
        const input = document.getElementById('bot-chat-input');
        try { input?.focus({ preventScroll: true }); } catch (_) { input?.focus?.(); }
      }, 180);
    });
    const contact = document.createElement('button');
    contact.type = 'button';
    contact.textContent = 'Contact Support';
    contact.style.cssText = 'min-height:42px;padding:0 16px;border:1px solid rgba(255,255,255,.16);border-radius:12px;background:rgba(255,255,255,.045);color:var(--text-primary,#fff);font-weight:600;cursor:pointer';
    contact.addEventListener('click', () => {
      form.scrollIntoView({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 'auto' : 'smooth', block: 'start' });
      const target = document.getElementById('ovyx-help-support-subject') || form;
      try { target.focus({ preventScroll: true }); } catch (_) {}
    });
    actions.append(ask, contact);
    header.append(copy, actions);
    page.prepend(header);
  }

  function scan() {
    const form = document.getElementById(FORM_ID);
    bind(form);
    enhanceHelpPage();
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
