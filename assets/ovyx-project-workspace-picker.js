(function () {
  'use strict';
  if (window.__OVYX_PROJECT_WORKSPACE_PICKER_V1__) return;
  window.__OVYX_PROJECT_WORKSPACE_PICKER_V1__ = true;

  const STORE = () => window.ProjectStore;
  const state = () => window.KernelState || {};
  const escapeLabel = value => String(value || '').trim() || 'Untitled project';

  function createPicker() {
    let dialog = document.getElementById('ovyx-project-workspace-picker');
    if (dialog) return dialog;

    const style = document.createElement('style');
    style.id = 'ovyx-project-workspace-picker-style';
    style.textContent = `
      #ovyx-project-workspace-picker {
        width: min(560px, calc(100vw - 28px));
        max-width: 560px;
        max-height: min(78dvh, 680px);
        padding: 0;
        overflow: hidden;
        color: #f2f2f0;
        background: #090a0c;
        border: 1px solid rgba(255,255,255,.12);
        border-radius: 17px;
        box-shadow: 0 32px 110px rgba(0,0,0,.68);
      }
      #ovyx-project-workspace-picker::backdrop {
        background: rgba(0,0,0,.74);
        backdrop-filter: blur(9px);
        -webkit-backdrop-filter: blur(9px);
      }
      #ovyx-project-workspace-picker .ovx-picker-shell {
        display: flex;
        flex-direction: column;
        max-height: min(78dvh, 680px);
      }
      #ovyx-project-workspace-picker .ovx-picker-head {
        padding: 19px 20px 15px;
        border-bottom: 1px solid rgba(255,255,255,.075);
      }
      #ovyx-project-workspace-picker .ovx-picker-kicker {
        color: #85858a;
        font: 800 8px/1.4 'JetBrains Mono',monospace;
        letter-spacing: .16em;
        text-transform: uppercase;
      }
      #ovyx-project-workspace-picker h2 {
        margin: 7px 0 0;
        color: #f3f3f1;
        font: 800 20px/1.15 Inter,ui-sans-serif,sans-serif;
        letter-spacing: -.035em;
      }
      #ovyx-project-workspace-picker .ovx-picker-description {
        margin: 6px 0 0;
        color: #85858b;
        font: 500 11px/1.5 Inter,ui-sans-serif,sans-serif;
      }
      #ovyx-project-workspace-picker .ovx-picker-search-wrap {
        padding: 13px 18px 9px;
      }
      #ovyx-project-workspace-picker .ovx-picker-search {
        width: 100%;
        min-height: 42px;
        padding: 0 12px;
        color: #f2f2f0;
        background: #050607;
        border: 1px solid rgba(255,255,255,.10);
        border-radius: 9px;
        outline: none;
        font: 600 11px Inter,ui-sans-serif,sans-serif;
      }
      #ovyx-project-workspace-picker .ovx-picker-search:focus {
        border-color: rgba(232,182,79,.56);
        box-shadow: 0 0 0 3px rgba(232,182,79,.08);
      }
      #ovyx-project-workspace-picker .ovx-picker-list {
        min-height: 90px;
        overflow: auto;
        padding: 3px 12px 12px;
        overscroll-behavior: contain;
      }
      #ovyx-project-workspace-picker .ovx-picker-project {
        display: flex;
        width: 100%;
        min-height: 62px;
        align-items: center;
        gap: 12px;
        padding: 10px 11px;
        color: #e7e7e5;
        text-align: left;
        background: transparent;
        border: 1px solid transparent;
        border-radius: 10px;
        cursor: pointer;
      }
      #ovyx-project-workspace-picker .ovx-picker-project:hover,
      #ovyx-project-workspace-picker .ovx-picker-project:focus-visible {
        background: rgba(255,255,255,.045);
        border-color: rgba(255,255,255,.09);
        outline: none;
      }
      #ovyx-project-workspace-picker .ovx-picker-project[aria-current="true"] {
        background: rgba(232,182,79,.065);
        border-color: rgba(232,182,79,.22);
      }
      #ovyx-project-workspace-picker .ovx-picker-mark {
        display: grid;
        width: 34px;
        height: 34px;
        flex: 0 0 34px;
        place-items: center;
        color: #e8b64f;
        background: rgba(232,182,79,.075);
        border: 1px solid rgba(232,182,79,.16);
        border-radius: 9px;
        font: 500 19px/1 Inter,sans-serif;
      }
      #ovyx-project-workspace-picker .ovx-picker-copy {
        min-width: 0;
        flex: 1;
      }
      #ovyx-project-workspace-picker .ovx-picker-name {
        display: block;
        overflow: hidden;
        color: #e9e9e7;
        font: 750 11px/1.35 Inter,ui-sans-serif,sans-serif;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #ovyx-project-workspace-picker .ovx-picker-meta {
        display: block;
        margin-top: 4px;
        overflow: hidden;
        color: #77777d;
        font: 600 8px/1.3 'JetBrains Mono',monospace;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #ovyx-project-workspace-picker .ovx-picker-current {
        color: #e8b64f;
        font: 800 7px/1.3 'JetBrains Mono',monospace;
        letter-spacing: .08em;
        text-transform: uppercase;
      }
      #ovyx-project-workspace-picker .ovx-picker-empty {
        padding: 26px 14px;
        color: #85858b;
        text-align: center;
        font: 500 10px/1.5 Inter,ui-sans-serif,sans-serif;
      }
      #ovyx-project-workspace-picker .ovx-picker-empty strong {
        display: block;
        margin-bottom: 5px;
        color: #e5e5e3;
        font-size: 12px;
      }
      #ovyx-project-workspace-picker .ovx-picker-foot {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 12px 18px;
        border-top: 1px solid rgba(255,255,255,.075);
        background: rgba(255,255,255,.012);
      }
      #ovyx-project-workspace-picker .ovx-picker-count {
        color: #77777d;
        font: 700 8px/1.3 'JetBrains Mono',monospace;
      }
      #ovyx-project-workspace-picker .ovx-picker-actions {
        display: flex;
        gap: 7px;
      }
      #ovyx-project-workspace-picker .ovx-picker-actions button {
        min-height: 35px;
        padding: 0 11px;
        border: 1px solid rgba(255,255,255,.10);
        border-radius: 8px;
        color: #b7b7bb;
        background: #101114;
        font: 750 9px Inter,ui-sans-serif,sans-serif;
        cursor: pointer;
      }
      #ovyx-project-workspace-picker .ovx-picker-actions button:focus-visible {
        outline: 2px solid rgba(232,182,79,.8);
        outline-offset: 2px;
      }
      #ovyx-project-workspace-picker [data-picker-create] {
        color: #090909;
        background: #e8b64f;
        border-color: #e8b64f;
      }
      @media (max-width: 560px) {
        #ovyx-project-workspace-picker {
          width: calc(100vw - 20px);
          max-height: min(82dvh, 720px);
          border-radius: 14px;
        }
        #ovyx-project-workspace-picker .ovx-picker-shell {
          max-height: min(82dvh, 720px);
        }
        #ovyx-project-workspace-picker .ovx-picker-head {
          padding: 16px 15px 12px;
        }
        #ovyx-project-workspace-picker .ovx-picker-foot {
          align-items: flex-start;
          flex-direction: column;
          padding: 11px 14px;
        }
        #ovyx-project-workspace-picker .ovx-picker-actions {
          width: 100%;
        }
        #ovyx-project-workspace-picker .ovx-picker-actions button {
          flex: 1;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        #ovyx-project-workspace-picker *,
        #ovyx-project-workspace-picker *::before,
        #ovyx-project-workspace-picker *::after {
          scroll-behavior: auto !important;
          transition-duration: .01ms !important;
          animation-duration: .01ms !important;
        }
      }
    `;
    document.head.appendChild(style);

    dialog = document.createElement('dialog');
    dialog.id = 'ovyx-project-workspace-picker';
    dialog.setAttribute('aria-labelledby', 'ovx-picker-title');
    dialog.setAttribute('aria-describedby', 'ovx-picker-description');
    dialog.innerHTML = `
      <div class="ovx-picker-shell">
        <header class="ovx-picker-head">
          <div class="ovx-picker-kicker">OVYX / WORKSPACE</div>
          <h2 id="ovx-picker-title">Switch project</h2>
          <p class="ovx-picker-description" id="ovx-picker-description">Choose a saved project to continue working. Your projects stay in their existing account workspace.</p>
        </header>
        <div class="ovx-picker-search-wrap">
          <input class="ovx-picker-search" type="search" autocomplete="off" placeholder="Search your projects…" aria-label="Search projects" />
        </div>
        <div class="ovx-picker-list" role="listbox" aria-label="Saved projects"></div>
        <footer class="ovx-picker-foot">
          <span class="ovx-picker-count" aria-live="polite"></span>
          <div class="ovx-picker-actions">
            <button type="button" data-picker-close>Close</button>
            <button type="button" data-picker-create>Create project</button>
          </div>
        </footer>
      </div>
    `;
    document.body.appendChild(dialog);

    const search = dialog.querySelector('.ovx-picker-search');
    const list = dialog.querySelector('.ovx-picker-list');
    const count = dialog.querySelector('.ovx-picker-count');
    let opener = null;

    function close() {
      if (dialog.open) dialog.close();
      if (opener?.isConnected) opener.focus();
    }

    function render() {
      const all = typeof STORE()?.list === 'function' ? STORE().list() : [];
      const query = search.value.trim().toLocaleLowerCase();
      const filtered = all.filter(project => {
        const haystack = [project?.name, project?.description, project?.status]
          .map(value => String(value || '')).join(' ').toLocaleLowerCase();
        return !query || haystack.includes(query);
      });
      list.replaceChildren();
      count.textContent = filtered.length + ' of ' + all.length + ' projects';

      if (!filtered.length) {
        const empty = document.createElement('div');
        empty.className = 'ovx-picker-empty';
        const title = document.createElement('strong');
        title.textContent = all.length ? 'No matching projects' : 'No saved projects yet';
        const detail = document.createElement('span');
        detail.textContent = all.length
          ? 'Try another search term or clear your search.'
          : 'Create your first project to start building in OVYX.';
        empty.append(title, detail);
        list.appendChild(empty);
        return;
      }

      const activeId = String(state().activeProject?.id || '');
      filtered.forEach(project => {
        const id = String(project?.id || '');
        if (!id) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'ovx-picker-project';
        button.dataset.projectId = id;
        button.setAttribute('role', 'option');
        const active = id === activeId;
        button.setAttribute('aria-selected', String(active));
        if (active) button.setAttribute('aria-current', 'true');

        const mark = document.createElement('span');
        mark.className = 'ovx-picker-mark';
        mark.setAttribute('aria-hidden', 'true');
        mark.textContent = '◇';

        const copy = document.createElement('span');
        copy.className = 'ovx-picker-copy';
        const name = document.createElement('span');
        name.className = 'ovx-picker-name';
        name.textContent = escapeLabel(project.name);
        const pages = Array.isArray(project.pages) ? project.pages.length : 0;
        const status = String(project.status || 'draft').toUpperCase();
        const meta = document.createElement('span');
        meta.className = 'ovx-picker-meta';
        meta.textContent = status + ' · ' + pages + (pages === 1 ? ' PAGE' : ' PAGES');

        copy.append(name, meta);
        button.append(mark, copy);
        if (active) {
          const current = document.createElement('span');
          current.className = 'ovx-picker-current';
          current.textContent = 'Current';
          button.appendChild(current);
        }
        button.addEventListener('click', () => {
          const selectedId = button.dataset.projectId;
          const exists = (typeof STORE()?.list === 'function' ? STORE().list() : [])
            .some(item => String(item?.id || '') === selectedId);
          if (!exists) {
            render();
            return;
          }
          close();
          STORE().open(selectedId);
        });
        list.appendChild(button);
      });
    }

    search.addEventListener('input', render);
    dialog.querySelector('[data-picker-close]').addEventListener('click', close);
    dialog.querySelector('[data-picker-create]').addEventListener('click', () => {
      close();
      STORE()?.createPromptModal?.();
    });
    dialog.addEventListener('click', event => {
      if (event.target === dialog) close();
    });
    dialog.addEventListener('close', () => {
      search.value = '';
      render();
    });

    dialog._ovyxOpen = source => {
      opener = source && source.nodeType === 1 && typeof source.focus === 'function' ? source : document.activeElement;
      render();
      if (!dialog.open) dialog.showModal();
      requestAnimationFrame(() => search.focus());
    };
    dialog._ovyxRender = render;
    return dialog;
  }

  function install() {
    const projectStore = STORE();
    if (!projectStore || typeof projectStore.list !== 'function' || projectStore.__OVYXWorkspacePickerV1) return false;
    const original = projectStore.showWorkspacePicker;
    projectStore.showWorkspacePicker = function () {
      const picker = createPicker();
      picker._ovyxOpen(document.activeElement);
      return true;
    };
    projectStore.showWorkspacePicker.__original = original;
    projectStore.__OVYXWorkspacePickerV1 = true;
    window.OVYXWorkspacePicker = {
      open: () => projectStore.showWorkspacePicker(),
      close: () => document.getElementById('ovyx-project-workspace-picker')?.close(),
      render: () => document.getElementById('ovyx-project-workspace-picker')?._ovyxRender?.(),
      version: 1
    };
    return true;
  }

  if (!install()) {
    let attempts = 0;
    const retry = setInterval(() => {
      attempts += 1;
      if (install() || attempts >= 40) clearInterval(retry);
    }, 100);
  }
})();