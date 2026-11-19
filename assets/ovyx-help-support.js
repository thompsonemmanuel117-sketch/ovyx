(function () {
  'use strict';
  if (window.__OVYX_HELP_SUPPORT_EMAIL_V2__) return;
  window.__OVYX_HELP_SUPPORT_EMAIL_V2__ = true;

  const FORM_ID = 'ovyx-help-support-form';
  let supportMoveAttempts = 0;
  const $ = (selector, root = document) => root?.querySelector?.(selector) || null;

  function toast(message, kind) {
    try { window.showToast?.(String(message || ''), kind || 'info'); } catch (_) {}
  }

  function setStatus(form, message, kind) {
    const node = $('#ovyx-help-support-status', form) || $('#ovyx-help-support-delivery-status', form);
    if (!node) return;
    node.textContent = message;
    node.dataset.kind = kind || 'info';
    node.setAttribute('role', 'status');
    node.setAttribute('aria-live', 'polite');
  }

  function supportPage() {
    const viewport = document.getElementById('view-router-viewport');
    if (!viewport) return null;
    let page = document.getElementById('view-support');
    if (page) return page;

    page = document.createElement('section');
    page.id = 'view-support';
    page.className = 'hidden';
    page.setAttribute('aria-hidden', 'true');
    page.setAttribute('aria-label', 'Contact OVYX Support');
    page.innerHTML = `
      <div class="ovyx-support-page">
        <header class="ovyx-support-page-head">
          <div>
            <div class="ovyx-panel-kicker">OVYX / HELP CENTRE / SUPPORT</div>
            <h1>Contact OVYX Support</h1>
            <p>Send a report directly to the OVYX support team. Your request is also saved in the secure support queue.</p>
          </div>
          <div class="ovyx-support-page-actions">
            <button type="button" class="ovyx-support-back" data-ovyx-support-back>Back to Help Centre</button>
            <button type="button" class="ovyx-support-ai" data-ovyx-support-ai>Ask OVYX AI</button>
          </div>
        </header>
        <div class="ovyx-support-page-note">
          <span aria-hidden="true">◆</span>
          <p>Use this page for account issues, bugs and requests that need the OVYX team. For quick how-to questions, OVYX AI is available from the Help Centre.</p>
        </div>
        <div data-ovyx-support-form-mount></div>
      </div>`;
    viewport.appendChild(page);

    const style = document.createElement('style');
    style.id = 'ovyx-support-page-styles';
    style.textContent = `
      #view-support{width:100%;min-height:100%;padding:clamp(18px,3vw,36px);box-sizing:border-box;background:var(--app-bg,#000)}
      .ovyx-support-page{width:min(100%,1040px);margin:0 auto;display:grid;gap:18px}
      .ovyx-support-page-head{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;padding:clamp(20px,3vw,30px);border:1px solid rgba(194,163,107,.2);border-radius:20px;background:radial-gradient(ellipse at 12% 0%,rgba(194,163,107,.10),transparent 55%),linear-gradient(145deg,rgba(255,255,255,.045),rgba(255,255,255,.012))}
      .ovyx-support-page-head h1{margin:8px 0 0;color:var(--app-text,#fff);font:800 clamp(25px,3vw,34px)/1.1 Inter,sans-serif;letter-spacing:-.035em}
      .ovyx-support-page-head p{max-width:620px;margin:9px 0 0;color:var(--app-muted,#9ca3af);font:500 13px/1.6 Inter,sans-serif}
      .ovyx-support-page-actions{display:flex;flex-wrap:wrap;gap:9px;justify-content:flex-end}
      .ovyx-support-page-actions button{min-height:40px;padding:0 14px;border-radius:10px;font:700 11px Inter,sans-serif;cursor:pointer}
      .ovyx-support-back{border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.035);color:var(--app-text,#fff)}
      .ovyx-support-ai{border:1px solid rgba(194,163,107,.4);background:linear-gradient(135deg,#d8b777,#a98545);color:#17130b}
      .ovyx-support-page-note{display:flex;align-items:flex-start;gap:12px;padding:13px 16px;border:1px solid rgba(255,255,255,.08);border-radius:12px;background:rgba(255,255,255,.018)}
      .ovyx-support-page-note>span{color:#c2a36b;font-size:13px}
      .ovyx-support-page-note p{margin:0;color:var(--app-muted,#9ca3af);font:500 11px/1.6 Inter,sans-serif}
      #view-support .ovyx-help-support-inline{margin:0!important;width:100%}
      #view-support .ovyx-help-support-head p{font-size:11px}
      #view-support .ovyx-help-support-grid input,#view-support .ovyx-help-support-grid textarea{font-size:13px}
      #view-support .ovyx-help-support-grid label span{font-size:9px}
      #view-support .ovyx-help-support-foot small{font-size:10px}
      #view-support .ovyx-help-support-foot button{min-height:42px}
      @media(max-width:680px){.ovyx-support-page-head{align-items:stretch;flex-direction:column}.ovyx-support-page-actions{justify-content:stretch}.ovyx-support-page-actions button{flex:1}.ovyx-support-page{gap:13px}}
      @media(prefers-reduced-motion:reduce){#view-support *{scroll-behavior:auto!important;transition-duration:.01ms!important;animation-duration:.01ms!important}}
    `;
    document.head.appendChild(style);

    page.querySelector('[data-ovyx-support-back]')?.addEventListener('click', () => window.Router?.go?.('faq'));
    page.querySelector('[data-ovyx-support-ai]')?.addEventListener('click', () => {
      const assistant = window.WorkspaceBrainBot;
      if (typeof assistant?.open === 'function') assistant.open();
      else toast('OVYX AI is not ready yet. Please try again in a moment.', 'warning');
    });
    return page;
  }

  function moveSupportForm() {
    const page = supportPage();
    if (!page) return false;
    const faq = document.getElementById('view-faq');
    // A legacy Help shell can exist before its support form is mounted.
    // Mount the original form whenever it is absent; checking only for the
    // shell incorrectly skipped this recovery path on delayed boot/mobile.
    if (faq && !document.getElementById(FORM_ID) && typeof window.OVYXMountHelpSupportForm === 'function') {
      try { window.OVYXMountHelpSupportForm(faq); } catch (_) {}
    }
    const mount = $('[data-ovyx-support-form-mount]', page);
    if (!mount) return false;

    // Legacy shell boot paths can mount more than one copy of the same form
    // across the FAQ and standalone page. Prefer the form already in Support,
    // otherwise move the first existing form, then remove only duplicate cards
    // so there is exactly one editable support ticket form in the document.
    const allForms = Array.from(document.querySelectorAll('#' + FORM_ID));
    // A late legacy mount can briefly leave an incomplete shell/form beside
    // the real editable ticket form. Never prefer a stale outside form merely
    // because it appears first: the assistant handoff and submit path require
    // both editable draft controls to exist.
    const hasDraftFields = candidate =>
      !!candidate?.querySelector?.('#ovyx-help-support-subject') &&
      !!candidate?.querySelector?.('#ovyx-help-support-message');
    const form = allForms.find(candidate => !page.contains(candidate) && hasDraftFields(candidate)) ||
      allForms.find(candidate => page.contains(candidate) && hasDraftFields(candidate)) ||
      allForms.find(hasDraftFields) ||
      allForms.find(candidate => !page.contains(candidate)) ||
      page.querySelector('#' + FORM_ID) || allForms[0] || null;
    const card = form?.closest('.ovyx-help-support-inline') || form;
    if (!card) return false;
    if (!hasDraftFields(form)) {
      // Do not advertise a form as ready while it cannot accept the assistant
      // draft. A subsequent legacy mount mutation will trigger reconciliation.
      delete form.dataset.ovyxSupportFormReady;
      return false;
    }
    if (card.parentElement !== mount) mount.appendChild(card);
    Array.from(document.querySelectorAll('#' + FORM_ID)).forEach(duplicate => {
      if (duplicate === form) return;
      const duplicateCard = duplicate.closest('.ovyx-help-support-inline') || duplicate;
      if (duplicateCard !== card) duplicateCard.remove();
    });
    const description = $('.ovyx-help-support-head p', card);
    if (description) description.textContent = 'Describe the issue clearly. OVYX saves a support ticket and sends an email to the support inbox when delivery is available; the status below confirms the actual result.';
    bindSupportForm(form);
    // Consumers such as assistant-feedback handoff must wait until duplicate
    // legacy forms have been removed and this exact form is mounted in Support.
    form.dataset.ovyxSupportFormReady = '1';
    return true;
  }

  function enhanceHelpPage() {
    const page = document.getElementById('view-faq');
    const shell = page?.querySelector('.ovyx-help-shell');
    if (!shell || shell.querySelector('#ovyx-help-centre-intro')) return;
    const header = document.createElement('section');
    header.id = 'ovyx-help-centre-intro';
    header.setAttribute('aria-label', 'OVYX Help Centre');
    header.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:space-between;gap:18px 24px;align-items:center;margin:0 0 8px;padding:clamp(20px,3vw,30px);border:1px solid rgba(194,163,107,.22);border-radius:20px;background:radial-gradient(ellipse at 12% 0%,rgba(194,163,107,.10),transparent 52%),linear-gradient(145deg,rgba(255,255,255,.05),rgba(255,255,255,.015))';
    const copy = document.createElement('div');
    copy.style.cssText = 'flex:1 1 280px;min-width:0';
    copy.innerHTML = '<p style="margin:0 0 8px;color:#c2a36b;font-size:10px;font-weight:800;letter-spacing:.16em">OVYX HELP CENTRE</p><h2 style="margin:0;color:var(--app-text,#fff);font:800 clamp(23px,3vw,32px)/1.1 Inter,sans-serif;letter-spacing:-.035em">Your guide to OVYX.</h2><p style="max-width:620px;margin:9px 0 0;color:var(--app-muted,#9ca3af);font:500 13px/1.6 Inter,sans-serif">OVYX AI is the one place to ask platform questions. For account issues or problems that need a person, open Contact OVYX Support.</p>';
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;flex-wrap:wrap;gap:9px;align-items:center';
    const ask = document.createElement('button');
    ask.type = 'button';
    ask.textContent = 'Ask OVYX AI';
    ask.style.cssText = 'min-height:41px;padding:0 16px;border:1px solid rgba(194,163,107,.42);border-radius:10px;background:linear-gradient(135deg,#d8b777,#a98545);color:#17130b;font:750 11px Inter,sans-serif;cursor:pointer';
    ask.addEventListener('click', () => {
      if (typeof window.WorkspaceBrainBot?.open === 'function') window.WorkspaceBrainBot.open();
      else toast('OVYX AI is not ready yet. Please try again in a moment.', 'warning');
    });
    const contact = document.createElement('button');
    contact.type = 'button';
    contact.textContent = 'Contact OVYX Support';
    contact.style.cssText = 'min-height:41px;padding:0 15px;border:1px solid rgba(255,255,255,.14);border-radius:10px;background:rgba(255,255,255,.035);color:var(--app-text,#fff);font:700 11px Inter,sans-serif;cursor:pointer';
    contact.addEventListener('click', () => window.Router?.go?.('support'));
    actions.append(ask, contact);
    header.append(copy, actions);
    const top = shell.querySelector('.ovyx-help-top');
    shell.insertBefore(header, top || shell.firstChild);

    // The old static FAQ is retained in source for reference, but it must not
    // compete with OVYX AI as a second answer destination in the Help Centre.
    const legacySearch = shell.querySelector('.ovyx-help-top');
    const popular = shell.querySelector('.ovyx-help-popular')?.parentElement;
    const faqSection = shell.querySelector('#ovyx-help-faq-list')?.closest('.ovyx-help-section');
    [legacySearch, popular, faqSection].filter(Boolean).forEach(node => {
      node.hidden = true;
      node.style.setProperty('display', 'none', 'important');
      node.setAttribute('aria-hidden', 'true');
      node.dataset.ovyxSecondaryFaq = 'hidden';
    });
    shell.classList.add('ovyx-help-ai-primary');
    if (!document.getElementById('ovyx-help-ai-primary-styles')) {
      const style = document.createElement('style');
      style.id = 'ovyx-help-ai-primary-styles';
      style.textContent = '.ovyx-help-ai-primary .ovyx-help-lower{grid-template-columns:minmax(0,1fr)!important}.ovyx-help-ai-primary .ovyx-help-lower aside{max-width:100%}';
      document.head.appendChild(style);
    }
  }

  function bindSupportForm(form) {
    if (!form || form.dataset.ovyxSupportEmailBound === '2') return;
    form.dataset.ovyxSupportEmailBound = '2';
    form.addEventListener('submit', async event => {
      event.preventDefault();
      event.stopImmediatePropagation();

      const subjectInput = $('#ovyx-help-support-subject', form);
      const messageInput = $('#ovyx-help-support-message', form);
      const emailInput = $('#ovyx-help-support-email', form);
      const fileInput = $('#ovyx-help-support-attachments', form);
      const subject = String(subjectInput?.value || '').trim();
      const message = String(messageInput?.value || '').trim();
      if (subject.length < 4 || message.length < 12) {
        setStatus(form, subject.length < 4 ? 'Add a short subject before sending.' : 'Please describe the issue in a little more detail.', 'error');
        (subject.length < 4 ? subjectInput : messageInput)?.focus();
        return;
      }

      const user = window.firebase?.auth?.()?.currentUser || null;
      if (!user || typeof user.getIdToken !== 'function') {
        setStatus(form, 'Sign in to your OVYX account before contacting Support.', 'error');
        return;
      }
      if (emailInput && user.email) {
        const verifiedAccountEmail = String(user.email).trim().toLowerCase();
        const enteredEmail = String(emailInput.value || '').trim().toLowerCase();
        if (!enteredEmail) emailInput.value = verifiedAccountEmail;
        else if (enteredEmail !== verifiedAccountEmail) {
          setStatus(form, 'Use the email address verified on your OVYX account so Support can reply securely.', 'error');
          emailInput.focus();
          return;
        }
      }

      const files = Array.from(fileInput?.files || []);
      const totalBytes = files.reduce((sum, file) => sum + Number(file.size || 0), 0);
      if (files.length > 3) {
        setStatus(form, 'Attach at most 3 files.', 'error');
        return;
      }
      if (files.some(file => Number(file.size || 0) > 5 * 1024 * 1024) || totalBytes > 6 * 1024 * 1024) {
        setStatus(form, 'Each attachment must be 5 MB or smaller, with 6 MB total.', 'error');
        return;
      }

      const submit = $('#ovyx-help-support-submit', form);
      if (submit) { submit.disabled = true; submit.setAttribute('aria-busy', 'true'); }
      setStatus(form, 'Sending your report to OVYX Support…', 'info');

      try {
        const token = await user.getIdToken(true);
        const body = new FormData();
        body.append('subject', subject);
        body.append('message', message);
        body.append('projectId', String(window.KernelState?.activeProject?.id || '').slice(0, 120));
        body.append('route', String(window.KernelState?.activeView || 'support').slice(0, 120));
        files.forEach(file => body.append('attachments', file, file.name));

        const response = await fetch('/api/support', {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
          body,
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result.ok !== true || !result.ticket?.ticketId) {
          throw new Error(result.message || result.error?.message || 'Your report could not be submitted. Please try again.');
        }

        const ticketId = String(result.ticket.ticketId);
        if (result.ticket.notificationStatus === 'sent') {
          setStatus(form, 'Report ' + ticketId + ' was emailed to OVYX Support and saved securely. The team can reply to your verified account email.', 'success');
          toast('Your report was sent to OVYX Support.', 'success');
          subjectInput.value = '';
          messageInput.value = '';
          if (fileInput) fileInput.value = '';
          const fileName = $('#ovyx-help-support-file-name', form);
          if (fileName) fileName.textContent = 'No files selected';
        } else {
          setStatus(form, 'Report ' + ticketId + ' is saved in the secure OVYX Support queue, but email delivery was not confirmed. Please do not submit it again; the team can still find it in Admin → Support Tickets.', 'error');
          toast('Your report was saved, but its email could not be confirmed.', 'warning');
        }
      } catch (error) {
        setStatus(form, error?.message || 'Your report could not be sent. Please try again.', 'error');
        toast(error?.message || 'Your report could not be sent.', 'warning');
      } finally {
        if (submit) { submit.disabled = false; submit.removeAttribute('aria-busy'); }
      }
    }, true);
  }

  function queueSupportFormMove() {
    if (moveSupportForm()) {
      supportMoveAttempts = 0;
      return;
    }
    if (supportMoveAttempts >= 20) return;
    supportMoveAttempts += 1;
    window.setTimeout(queueSupportFormMove, 50);
  }

  function patchRouter() {
    const router = window.Router;
    if (!router || typeof router.go !== 'function' || router.__ovyxSupportRouteV2) return;
    const originalGo = router.go.bind(router);
    router.go = function (viewId, ...args) {
      const route = String(viewId || '').replace(/^view-/, '').toLowerCase();
      if (route === 'support') moveSupportForm();
      const result = originalGo(viewId, ...args);
      if (route === 'support') {
        const mobileTitle = document.getElementById('mobile-current-view');
        if (mobileTitle) mobileTitle.textContent = 'Support';
        window.setTimeout(queueSupportFormMove, 0);
      }
      return result;
    };
    router.__ovyxSupportRouteV2 = true;
  }

  function patchLegacySupportEntryPoints() {
    const center = window.OVYXSupportCenter;
    if (center && typeof center.open === 'function' && !center.__ovyxStandalonePageRoute) {
      center.open = function () {
        if (typeof window.Router?.go === 'function') return window.Router.go('support');
        const page = supportPage();
        if (page) {
          page.classList.remove('hidden');
          page.setAttribute('aria-hidden', 'false');
        }
        return 'support';
      };
      center.__ovyxStandalonePageRoute = true;
    }
    if (!document.documentElement.dataset.ovyxSupportChannelsBound) {
      document.documentElement.dataset.ovyxSupportChannelsBound = '1';
      document.addEventListener('click', event => {
        const directChannel = event.target?.closest?.('[data-v34-support-wa],[data-support-whatsapp]');
        if (!directChannel) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        window.Router?.go?.('support');
      }, true);
    }
  }

  // Expose an idempotent readiness hook for assistant-feedback handoff.
  // It reuses the existing form and submit handler; it never clones a ticket form.
  window.OVYXEnsureSupportForm = function () {
    return moveSupportForm();
  };

  function scan() {
    patchRouter();
    patchLegacySupportEntryPoints();
    enhanceHelpPage();
    moveSupportForm();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.setTimeout(scan, 90), { once: true });
  } else {
    window.setTimeout(scan, 90);
  }
  window.addEventListener('ovyx:view-changed', () => window.setTimeout(scan, 30));
  window.addEventListener('load', () => window.setTimeout(scan, 90), { once: true });

  // Reconcile late legacy Help Centre mounts so only one editable form remains in Support.
  const supportFormObserver = new MutationObserver(records => {
    const addedSupportForm = records.some(record => Array.from(record.addedNodes).some(node =>
      node.nodeType === 1 && (node.id === FORM_ID || node.querySelector?.('#' + FORM_ID))
    ));
    if (addedSupportForm) moveSupportForm();
  });
  if (document.documentElement) supportFormObserver.observe(document.documentElement, { childList: true, subtree: true });

  [0, 120, 260, 650, 1500, 3000].forEach(delay => window.setTimeout(patchLegacySupportEntryPoints, delay));
})();