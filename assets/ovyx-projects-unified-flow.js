(function () {
  'use strict';
  if (window.__OVYX_PROJECTS_UNIFIED_FLOW_V1__) return;
  window.__OVYX_PROJECTS_UNIFIED_FLOW_V1__ = true;

  function removeLegacyContinueLinks() {
    document.querySelectorAll('[data-nav="continue-project"], button[onclick*="continueOvyxProject"]').forEach(button => button.remove());
  }

  function installCreateModalStyles() {
    if (document.getElementById('ovyx-projects-unified-flow-style')) return;
    const style = document.createElement('style');
    style.id = 'ovyx-projects-unified-flow-style';
    style.textContent = `
      #ovyx-project-create-modal[hidden]{display:none!important}
      #ovyx-project-create-modal .ovx-create-status{margin:11px 0 0;color:#8b8b91;font:500 9px/1.5 Inter,ui-sans-serif,sans-serif}
      #ovyx-project-create-modal [data-modal-create][aria-busy="true"]{opacity:.72;cursor:wait}
    `;
    document.head.appendChild(style);
  }

  function enhanceCreateModal(modal) {
    if (!modal || modal.dataset.ovyxCreateEnhanced === '1') return;
    modal.dataset.ovyxCreateEnhanced = '1';
    const copy = modal.querySelector('.ovyx-project-modal p');
    if (copy) copy.textContent = 'Name your project. OVYX will save it to your workspace and open it in Web Studio.';
    const shell = modal.querySelector('.ovyx-project-modal');
    if (shell && !shell.querySelector('[data-ovyx-create-status]')) {
      const status = document.createElement('p');
      status.className = 'ovx-create-status';
      status.setAttribute('data-ovyx-create-status', '');
      status.setAttribute('aria-live', 'polite');
      status.textContent = 'You can continue editing and building after it opens.';
      const actions = shell.querySelector('.ovyx-project-modal-actions');
      if (actions) shell.insertBefore(status, actions);
    }
    const button = modal.querySelector('[data-modal-create]');
    const input = modal.querySelector('#ovyx-project-name-input');
    if (!button || !input || modal.dataset.ovyxCreateGuard === '1') return;
    modal.dataset.ovyxCreateGuard = '1';
    modal.addEventListener('click', event => {
      const submit = event.target && event.target.closest && event.target.closest('[data-modal-create]');
      if (!submit) return;
      if (modal.dataset.ovyxCreating === '1') {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (!String(input.value || '').trim()) return;
      modal.dataset.ovyxCreating = '1';
      submit.disabled = true;
      submit.setAttribute('aria-busy', 'true');
      submit.textContent = 'Creating…';
      const status = modal.querySelector('[data-ovyx-create-status]');
      if (status) status.textContent = 'Creating your project and opening Web Studio…';
    }, true);
    new MutationObserver(() => {
      if (modal.hidden || modal.getAttribute('aria-hidden') === 'true') {
        modal.style.setProperty('display', 'none', 'important');
        modal.dataset.ovyxCreating = '0';
        button.disabled = false;
        button.removeAttribute('aria-busy');
        button.textContent = 'Create Project';
      } else {
        modal.style.removeProperty('display');
        if (modal.dataset.ovyxCreating !== '1') {
          button.disabled = false;
          button.removeAttribute('aria-busy');
          button.textContent = 'Create Project';
        }
      }
    }).observe(modal, { attributes: true, attributeFilter: ['hidden', 'aria-hidden'] });
  }

  function install() {
    installCreateModalStyles();
    removeLegacyContinueLinks();
    const modal = document.getElementById('ovyx-project-create-modal');
    if (modal) enhanceCreateModal(modal);
  }

  const observer = new MutationObserver(() => {
    removeLegacyContinueLinks();
    const modal = document.getElementById('ovyx-project-create-modal');
    if (modal) enhanceCreateModal(modal);
  });
  if (document.body) observer.observe(document.body, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();

  window.OVYXProjectsUnifiedFlow = Object.freeze({
    version: 2,
    refresh: install
  });
})();
