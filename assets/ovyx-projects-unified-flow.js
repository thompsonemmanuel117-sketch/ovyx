(function () {
  'use strict';
  if (window.__OVYX_PROJECTS_UNIFIED_FLOW_V1__) return;
  window.__OVYX_PROJECTS_UNIFIED_FLOW_V1__ = true;

  const STORE = () => window.ProjectStore;
  const escapeHtml = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);

  function removeLegacyContinueLinks() {
    document.querySelectorAll('[data-nav="continue-project"], button[onclick*="continueOvyxProject"]').forEach(button => button.remove());
  }

  function activityLabel(project) {
    const value = project && (project.updatedAt || project.createdAt);
    const timestamp = typeof value === 'number' ? value : Date.parse(String(value || ''));
    if (!Number.isFinite(timestamp) || timestamp <= 0) return 'Saved project';
    try {
      return 'Updated ' + new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(timestamp));
    } catch (_) {
      return 'Saved project';
    }
  }

  function currentProject(projects) {
    const state = window.KernelState || {};
    const active = state.activeProject;
    if (active && active.id) {
      const saved = projects.find(project => String(project.id) === String(active.id));
      if (saved) return saved;
    }
    return projects[0] || null;
  }

  function ensureContinuePanel() {
    const view = document.getElementById('view-projects');
    const header = view && view.querySelector('.ovyx-projects-header');
    if (!header) return null;
    let panel = document.getElementById('ovyx-projects-continue-panel');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'ovyx-projects-continue-panel';
      panel.className = 'ovx-projects-continue';
      panel.setAttribute('aria-label', 'Continue your project');
      header.insertAdjacentElement('afterend', panel);
    }
    return panel;
  }

  function renderContinuePanel() {
    const panel = ensureContinuePanel();
    const store = STORE();
    if (!panel || !store || typeof store.list !== 'function') return;
    const projects = store.list();
    const project = currentProject(Array.isArray(projects) ? projects : []);
    if (!project) {
      panel.innerHTML = '<div class="ovx-projects-continue-copy"><span class="ovx-projects-continue-kicker">YOUR WORKSPACE</span><strong>No project to continue yet</strong><span>Create a project and it will appear here whenever you return.</span></div><button type="button" class="ovx-projects-continue-action" data-continue-create>Create project <span aria-hidden="true">↗</span></button>';
      return;
    }
    const name = escapeHtml(project.name || 'Untitled project');
    const meta = escapeHtml(activityLabel(project));
    const status = escapeHtml(String(project.status || 'draft').replace(/[-_]/g, ' '));
    panel.innerHTML = '<div class="ovx-projects-continue-copy"><span class="ovx-projects-continue-kicker">PICK UP WHERE YOU LEFT OFF</span><strong>' + name + '</strong><span>' + meta + ' <i aria-hidden="true">·</i> ' + status + '</span></div><button type="button" class="ovx-projects-continue-action" data-continue-project="' + escapeHtml(project.id) + '">Continue working <span aria-hidden="true">↗</span></button>';
  }

  function openProject(button) {
    const store = STORE();
    const id = button && button.getAttribute('data-continue-project');
    if (!store || !id || typeof store.open !== 'function' || button.disabled) return;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    const label = button.innerHTML;
    button.textContent = 'Opening…';
    let result;
    try {
      result = store.open(id);
    } catch (error) {
      button.disabled = false;
      button.removeAttribute('aria-busy');
      button.innerHTML = label;
      if (typeof window.showToast === 'function') window.showToast(error && error.message || 'Project could not be opened. Try again.', 'error');
      return;
    }
    Promise.resolve(result).then(opened => {
      if (opened === false) {
        button.disabled = false;
        button.removeAttribute('aria-busy');
        button.innerHTML = label;
        if (typeof window.showToast === 'function') window.showToast('This project could not be opened. Check its workspace and try again.', 'error');
      }
    }).catch(error => {
      button.disabled = false;
      button.removeAttribute('aria-busy');
      button.innerHTML = label;
      if (typeof window.showToast === 'function') window.showToast(error && error.message || 'Project could not be opened. Try again.', 'error');
    });
  }

  function handleContinueAction(event) {
    const createButton = event.target && event.target.closest && event.target.closest('[data-continue-create]');
    if (createButton) {
      event.preventDefault();
      STORE()?.createPromptModal?.();
      return;
    }
    const continueButton = event.target && event.target.closest && event.target.closest('[data-continue-project]');
    if (continueButton) {
      event.preventDefault();
      openProject(continueButton);
    }
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
        modal.dataset.ovyxCreating = '0';
        button.disabled = false;
        button.removeAttribute('aria-busy');
        button.textContent = 'Create Project';
      } else if (modal.dataset.ovyxCreating !== '1') {
        button.disabled = false;
        button.removeAttribute('aria-busy');
        button.textContent = 'Create Project';
      }
    }).observe(modal, { attributes: true, attributeFilter: ['hidden', 'aria-hidden'] });
  }

  function install() {
    removeLegacyContinueLinks();
    renderContinuePanel();
    document.addEventListener('click', handleContinueAction);
    const store = STORE();
    if (store && typeof store.renderProjects === 'function' && !store.__ovyxUnifiedProjectsRender) {
      const originalRender = store.renderProjects.bind(store);
      store.renderProjects = function () {
        const result = originalRender();
        renderContinuePanel();
        return result;
      };
      store.__ovyxUnifiedProjectsRender = true;
    }
    if (window.OvyxProjectsUI && typeof window.OvyxProjectsUI.render === 'function' && !window.OvyxProjectsUI.__ovyxUnifiedProjectsRender) {
      const originalRender = window.OvyxProjectsUI.render.bind(window.OvyxProjectsUI);
      window.OvyxProjectsUI.render = function () {
        const result = originalRender();
        renderContinuePanel();
        return result;
      };
      window.OvyxProjectsUI.__ovyxUnifiedProjectsRender = true;
    }
    const modal = document.getElementById('ovyx-project-create-modal');
    if (modal) enhanceCreateModal(modal);
  }

  const observer = new MutationObserver(records => {
    removeLegacyContinueLinks();
    const modal = document.getElementById('ovyx-project-create-modal');
    if (modal) enhanceCreateModal(modal);
    if (records.some(record => Array.from(record.addedNodes || []).some(node =>
      node.nodeType === 1 && (node.id === 'view-projects' || (node.querySelector && node.querySelector('#view-projects')))
    ))) renderContinuePanel();
  });
  if (document.body) observer.observe(document.body, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();

  window.OVYXProjectsUnifiedFlow = Object.freeze({
    version: 1,
    render: renderContinuePanel,
    refresh: install
  });
})();
