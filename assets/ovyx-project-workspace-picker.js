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
      #ovyx-project-workspace-picker .ovx-picker-project-description{display:block;margin-top:4px;overflow:hidden;color:#8b8b91;font:500 9px/1.4 Inter,ui-sans-serif,sans-serif;text-overflow:ellipsis;white-space:nowrap}
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
    style.textContent += `
      #ovyx-project-workspace-picker .ovx-picker-workspace-row{display:flex;align-items:center;gap:8px;margin-top:15px}
      #ovyx-project-workspace-picker .ovx-picker-workspace-label{flex:0 0 auto;color:#85858a;font:800 8px 'JetBrains Mono',monospace;letter-spacing:.12em}
      #ovyx-project-workspace-picker .ovx-picker-workspace-select{min-width:0;flex:1;height:34px;padding:0 9px;color:#e9e9e7;background:#101114;border:1px solid rgba(255,255,255,.12);border-radius:8px;font:650 10px Inter,ui-sans-serif,sans-serif}
      #ovyx-project-workspace-picker .ovx-picker-workspace-new,#ovyx-project-workspace-picker .ovx-picker-workspace-actions button{min-height:32px;padding:0 10px;color:#e8b64f;background:rgba(232,182,79,.07);border:1px solid rgba(232,182,79,.2);border-radius:8px;font:750 9px Inter,ui-sans-serif,sans-serif;cursor:pointer}
      #ovyx-project-workspace-picker .ovx-picker-workspace-actions{display:flex;gap:6px;margin-top:8px}
      #ovyx-project-workspace-picker .ovx-picker-workspace-actions button{min-height:27px;color:#9c9ca2;background:transparent;border-color:rgba(255,255,255,.09);font-size:8px}
      #ovyx-project-workspace-picker button:disabled,#ovyx-project-workspace-picker select:disabled{opacity:.42;cursor:not-allowed}
      #ovyx-project-workspace-picker .ovx-picker-workspace-form{display:grid;gap:7px;margin-top:9px;padding:10px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.08);border-radius:9px}
      #ovyx-project-workspace-picker .ovx-picker-workspace-form[hidden]{display:none}
      #ovyx-project-workspace-picker .ovx-picker-workspace-form input{width:100%;min-height:34px;padding:0 9px;color:#f2f2f0;background:#050607;border:1px solid rgba(255,255,255,.1);border-radius:7px;font:600 10px Inter,ui-sans-serif,sans-serif}
      #ovyx-project-workspace-picker .ovx-picker-workspace-form div{display:flex;justify-content:flex-end;gap:7px}
      #ovyx-project-workspace-picker .ovx-picker-workspace-form button{min-height:30px;padding:0 10px;color:#b7b7bb;background:#101114;border:1px solid rgba(255,255,255,.1);border-radius:7px;font:700 9px Inter,ui-sans-serif,sans-serif}
      #ovyx-project-workspace-picker .ovx-picker-workspace-form button[type="submit"]{color:#090909;background:#e8b64f;border-color:#e8b64f}
      #ovyx-project-workspace-picker .ovx-picker-workspace-note{min-height:12px;margin:7px 0 0;color:#77777d;font:500 8px/1.45 Inter,ui-sans-serif,sans-serif}
      @media(max-width:560px){#ovyx-project-workspace-picker .ovx-picker-workspace-row{flex-wrap:wrap}#ovyx-project-workspace-picker .ovx-picker-workspace-label{width:100%}#ovyx-project-workspace-picker .ovx-picker-workspace-actions{flex-wrap:wrap}}
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
          <p class="ovx-picker-description" id="ovx-picker-description">Choose a workspace, then open one of its saved projects.</p>
          <div class="ovx-picker-workspace-row">
            <label class="ovx-picker-workspace-label" for="ovx-picker-workspace-select">WORKSPACE</label>
            <select class="ovx-picker-workspace-select" id="ovx-picker-workspace-select" aria-label="Active workspace"></select>
            <button type="button" class="ovx-picker-workspace-new" data-workspace-new>New</button>
          </div>
          <div class="ovx-picker-workspace-actions">
            <button type="button" data-workspace-rename>Rename</button>
            <button type="button" data-workspace-archive>Archive</button>
            <button type="button" data-workspace-restore hidden>Restore</button>
          </div>
          <form class="ovx-picker-workspace-form" data-workspace-create-form hidden>
            <input name="name" maxlength="80" minlength="2" placeholder="Workspace name" aria-label="New workspace name" required />
            <input name="description" maxlength="280" placeholder="Description (optional)" aria-label="Workspace description" />
            <div><button type="button" data-workspace-cancel>Cancel</button><button type="submit">Create workspace</button></div>
          </form>
          <form class="ovx-picker-workspace-form" data-workspace-rename-form hidden>
            <input name="name" maxlength="80" minlength="2" placeholder="Workspace name" aria-label="Rename workspace" required />
            <input name="description" maxlength="280" placeholder="Description (optional)" aria-label="Workspace description" />
            <div><button type="button" data-workspace-rename-cancel>Cancel</button><button type="submit">Save changes</button></div>
          </form>
          <p class="ovx-picker-workspace-note" data-workspace-note aria-live="polite"></p>
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
    const workspaceSelect = dialog.querySelector('#ovx-picker-workspace-select');
    const workspaceNote = dialog.querySelector('[data-workspace-note]');
    const createForm = dialog.querySelector('[data-workspace-create-form]');
    const renameForm = dialog.querySelector('[data-workspace-rename-form]');
    const createButton = dialog.querySelector('[data-picker-create]');
    let opener = null;
    let workspaces = [{ id: 'personal', name: 'Personal workspace', description: 'Your private OVYX workspace.', status: 'active', isDefault: true }];
    let workspaceApiReady = false;
    let workspaceLoadMessage = '';
    let selectedWorkspaceId = 'personal';
    let workspaceAccountKey = '';
    let workspaceLoadGeneration = 0;
    let authListenerInstalled = false;

    function authUser() {
      try { return window.firebase && typeof window.firebase.auth === 'function' ? window.firebase.auth().currentUser : null; }
      catch (_) { return null; }
    }

    function workspaceStorageKey() {
      const user = authUser();
      return 'ovyx.active-workspace.v1.' + String(user?.uid || 'guest');
    }

    function syncWorkspaceAccount() {
      const key = workspaceStorageKey();
      if (workspaceAccountKey && workspaceAccountKey !== key) {
        selectedWorkspaceId = 'personal';
        workspaces = [{ id: 'personal', name: 'Personal workspace', description: 'Your private OVYX workspace.', status: 'active', isDefault: true }];
        workspaceApiReady = false;
      }
      workspaceAccountKey = key;
      return key;
    }

    function persistWorkspaceSelection() {
      try { localStorage.setItem(syncWorkspaceAccount(), selectedWorkspaceId); } catch (_) {}
    }

    function currentWorkspace() {
      return workspaces.find(item => String(item.id) === selectedWorkspaceId) || workspaces.find(item => item.id === 'personal') || workspaces[0];
    }

    function projectWorkspace(project) {
      const value = String(project?.workspaceId || '').trim();
      return /^[A-Za-z0-9_-]{1,120}$/.test(value) ? value : 'personal';
    }

    function projectActivityTimestamp(project) {
      const value = project?.updatedAt || project?.createdAt || '';
      if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
      const raw = String(value);
      const parsed = /^\d{10,13}$/.test(raw) ? Number(raw) : Date.parse(raw);
      return Number.isFinite(parsed) ? parsed : 0;
    }

    async function workspaceRequest(method = 'GET', body = null) {
      const user = authUser();
      if (!user || typeof user.getIdToken !== 'function') throw new Error('Sign in to manage multiple workspaces.');
      const token = await user.getIdToken();
      if (!token) throw new Error('Your OVYX session needs to be refreshed. Sign in again.');
      const headers = { Accept: 'application/json', Authorization: 'Bearer ' + token };
      const options = { method, headers, credentials: 'same-origin', cache: 'no-store' };
      if (body !== null) { headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(body); }
      const response = await fetch('/api/workspaces', options);
      let data = null;
      try { data = await response.json(); } catch (_) {}
      if (!response.ok || !data?.ok) throw new Error(data?.error || 'Workspace request failed (' + response.status + ').');
      return data;
    }

    async function loadWorkspaces() {
      const generation = ++workspaceLoadGeneration;
      const requestAccountKey = syncWorkspaceAccount();
      workspaceApiReady = false;
      workspaceLoadMessage = '';
      renderWorkspaceControls();
      render();
      refreshProjectListing();
      try {
        const data = await workspaceRequest('GET');
        if (generation !== workspaceLoadGeneration || requestAccountKey !== workspaceStorageKey()) return;
        workspaces = Array.isArray(data.workspaces) && data.workspaces.length
          ? data.workspaces
          : [{ id: 'personal', name: 'Personal workspace', status: 'active', isDefault: true }];
        workspaceApiReady = true;
        let stored = '';
        try { stored = localStorage.getItem(requestAccountKey) || ''; } catch (_) {}
        const available = workspaces.find(item => String(item.id) === stored);
        selectedWorkspaceId = available ? String(available.id) : 'personal';
        if (!workspaces.some(item => item.id === selectedWorkspaceId)) selectedWorkspaceId = String(workspaces[0]?.id || 'personal');
        persistWorkspaceSelection();
      } catch (error) {
        if (generation !== workspaceLoadGeneration || requestAccountKey !== workspaceStorageKey()) return;
        workspaces = [{ id: 'personal', name: 'Personal workspace', description: 'Your private OVYX workspace.', status: 'active', isDefault: true }];
        selectedWorkspaceId = 'personal';
        workspaceLoadMessage = error?.message || 'Workspace sync is unavailable. Showing local personal projects.';
      }
      renderWorkspaceControls();
      render();
      refreshProjectListing();
    }

    function refreshProjectListing() {
      try { STORE()?.renderProjects?.(); } catch (_) {}
    }

    function renderWorkspaceControls() {
      workspaceSelect.replaceChildren();
      workspaces.forEach(workspace => {
        const option = document.createElement('option');
        option.value = String(workspace.id);
        option.textContent = String(workspace.name || 'Untitled workspace') + (workspace.status === 'archived' ? ' · Archived' : '');
        workspaceSelect.appendChild(option);
      });
      workspaceSelect.value = selectedWorkspaceId;
      workspaceSelect.disabled = workspaces.length < 2 && !workspaceApiReady;
      const active = currentWorkspace();
      const archived = active?.status === 'archived';
      const activeProject = state().activeProject;
      const activeProjectWorkspace = activeProject ? projectWorkspace(activeProject) : '';
      const activeProjectInSelectedWorkspace = Boolean(activeProjectWorkspace && activeProjectWorkspace === selectedWorkspaceId);
      dialog.querySelector('[data-workspace-rename]').disabled = !workspaceApiReady || !active;
      dialog.querySelector('[data-workspace-archive]').disabled = !workspaceApiReady || !active || active.isDefault || archived || activeProjectInSelectedWorkspace;
      dialog.querySelector('[data-workspace-restore]').hidden = !archived;
      dialog.querySelector('[data-workspace-restore]').disabled = !workspaceApiReady || !archived;
      dialog.querySelector('[data-workspace-new]').disabled = !workspaceApiReady;
      createButton.disabled = archived;
      workspaceNote.textContent = workspaceLoadMessage || (archived
        ? 'Archived workspace · Restore it before opening or editing its projects.'
        : activeProjectInSelectedWorkspace && !active?.isDefault
          ? 'Open a project in another workspace before archiving this one.'
          : workspaceApiReady
            ? (active?.collaboration?.supported === false ? 'Owner-managed workspace · Team invitations are not enabled on this account.' : 'Your workspace projects and activity stay organised together.')
            : 'Sign in to create and switch between additional workspaces.');
    }

    function close() {
      if (dialog.open) dialog.close();
      if (opener?.isConnected) opener.focus();
    }

    function render() {
      const all = typeof STORE()?.list === 'function' ? STORE().list() : [];
      const archivedWorkspace = currentWorkspace()?.status === 'archived';
      const inWorkspace = all.filter(project => projectWorkspace(project) === selectedWorkspaceId)
        .sort((a, b) => projectActivityTimestamp(b) - projectActivityTimestamp(a));
      const query = search.value.trim().toLocaleLowerCase();
      const filtered = inWorkspace.filter(project => {
        const haystack = [project?.name, project?.description, project?.status]
          .map(value => String(value || '')).join(' ').toLocaleLowerCase();
        return !query || haystack.includes(query);
      });
      list.replaceChildren();
      count.textContent = filtered.length + ' of ' + inWorkspace.length + ' projects';

      if (!filtered.length) {
        const empty = document.createElement('div');
        empty.className = 'ovx-picker-empty';
        const title = document.createElement('strong');
        title.textContent = inWorkspace.length ? 'No matching projects' : 'No projects in this workspace yet';
        const detail = document.createElement('span');
        detail.textContent = inWorkspace.length
          ? 'Try another search term or clear your search.'
          : archivedWorkspace
            ? 'Restore this workspace before opening or creating projects.'
            : 'Create a project here, or switch to another workspace.';
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
        button.disabled = archivedWorkspace;
        if (archivedWorkspace) button.title = 'Restore this workspace before opening its projects.';
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
        const updated = projectActivityTimestamp(project);
        const activity = updated ? new Date(updated).toLocaleDateString() : 'No activity date';
        const meta = document.createElement('span');
        meta.className = 'ovx-picker-meta';
        meta.textContent = status + ' · ' + pages + (pages === 1 ? ' PAGE' : ' PAGES') + ' · UPDATED ' + activity;
        copy.append(name, meta);
        if (String(project.description || '').trim()) {
          const description = document.createElement('span');
          description.className = 'ovx-picker-project-description';
          description.textContent = String(project.description).trim();
          copy.appendChild(description);
        }
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
    workspaceSelect.addEventListener('change', () => {
      selectedWorkspaceId = String(workspaceSelect.value || 'personal');
      persistWorkspaceSelection();
      createForm.hidden = true;
      renameForm.hidden = true;
      search.value = '';
      renderWorkspaceControls();
      render();
      refreshProjectListing();
    });
    dialog.querySelector('[data-workspace-new]').addEventListener('click', () => {
      if (!workspaceApiReady) return;
      renameForm.hidden = true;
      createForm.hidden = !createForm.hidden;
      if (!createForm.hidden) createForm.querySelector('[name="name"]').focus();
    });
    dialog.querySelector('[data-workspace-cancel]').addEventListener('click', () => { createForm.reset(); createForm.hidden = true; });
    createForm.addEventListener('submit', async event => {
      event.preventDefault();
      const submit = createForm.querySelector('[type="submit"]');
      submit.disabled = true;
      try {
        const data = await workspaceRequest('POST', {
          action: 'create',
          name: createForm.querySelector('[name="name"]').value,
          description: createForm.querySelector('[name="description"]').value
        });
        if (data.workspace) workspaces.push(data.workspace);
        selectedWorkspaceId = String(data.workspace?.id || 'personal');
        persistWorkspaceSelection();
        createForm.reset();
        createForm.hidden = true;
        renderWorkspaceControls();
        render();
        refreshProjectListing();
      } catch (error) {
        workspaceNote.textContent = error?.message || 'Workspace could not be created.';
      } finally { submit.disabled = false; }
    });
    dialog.querySelector('[data-workspace-rename]').addEventListener('click', () => {
      const active = currentWorkspace();
      if (!workspaceApiReady || !active) return;
      createForm.hidden = true;
      renameForm.querySelector('[name="name"]').value = active.name || '';
      renameForm.querySelector('[name="description"]').value = active.description || '';
      renameForm.hidden = !renameForm.hidden;
      if (!renameForm.hidden) renameForm.querySelector('[name="name"]').focus();
    });
    dialog.querySelector('[data-workspace-rename-cancel]').addEventListener('click', () => { renameForm.reset(); renameForm.hidden = true; });
    renameForm.addEventListener('submit', async event => {
      event.preventDefault();
      const submit = renameForm.querySelector('[type="submit"]');
      const targetWorkspaceId = selectedWorkspaceId;
      submit.disabled = true;
      try {
        const data = await workspaceRequest('POST', {
          action: 'update',
          workspaceId: targetWorkspaceId,
          name: renameForm.querySelector('[name="name"]').value,
          description: renameForm.querySelector('[name="description"]').value
        });
        workspaces = workspaces.map(item => item.id === targetWorkspaceId ? data.workspace : item);
        renameForm.hidden = true;
        renderWorkspaceControls();
      } catch (error) {
        workspaceNote.textContent = error?.message || 'Workspace could not be updated.';
      } finally { submit.disabled = false; }
    });
    dialog.querySelector('[data-workspace-archive]').addEventListener('click', async () => {
      if (!workspaceApiReady || selectedWorkspaceId === 'personal') return;
      const button = dialog.querySelector('[data-workspace-archive]');
      const targetWorkspaceId = selectedWorkspaceId;
      button.disabled = true;
      try {
        const data = await workspaceRequest('POST', { action: 'archive', workspaceId: targetWorkspaceId });
        workspaces = workspaces.map(item => item.id === targetWorkspaceId ? data.workspace : item);
        if (selectedWorkspaceId === targetWorkspaceId) {
          selectedWorkspaceId = 'personal';
          persistWorkspaceSelection();
        }
        renderWorkspaceControls();
        render();
        refreshProjectListing();
      } catch (error) {
        workspaceNote.textContent = error?.message || 'Workspace could not be archived.';
      } finally { renderWorkspaceControls(); }
    });
    dialog.querySelector('[data-workspace-restore]').addEventListener('click', async () => {
      if (!workspaceApiReady) return;
      const button = dialog.querySelector('[data-workspace-restore]');
      const targetWorkspaceId = selectedWorkspaceId;
      button.disabled = true;
      try {
        const data = await workspaceRequest('POST', { action: 'restore', workspaceId: targetWorkspaceId });
        workspaces = workspaces.map(item => item.id === targetWorkspaceId ? data.workspace : item);
        renderWorkspaceControls();
        refreshProjectListing();
      } catch (error) {
        workspaceNote.textContent = error?.message || 'Workspace could not be restored.';
      } finally { renderWorkspaceControls(); }
    });
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
      search.value = '';
      createForm.hidden = true;
      renameForm.hidden = true;
      renderWorkspaceControls();
      render();
      if (!dialog.open) dialog.showModal();
      search.focus({ preventScroll: true });
      requestAnimationFrame(() => {
        if (dialog.open && !dialog.contains(document.activeElement)) search.focus({ preventScroll: true });
      });
      installAuthListener();
      loadWorkspaces();
    };
    dialog._ovyxRender = render;
    installProjectStoreHooks(STORE());
    installAuthListener();
    loadWorkspaces();
    return dialog;

    function installAuthListener() {
      if (authListenerInstalled) return;
      try {
        const auth = window.firebase && typeof window.firebase.auth === 'function' ? window.firebase.auth() : null;
        if (!auth || typeof auth.onAuthStateChanged !== 'function') return;
        authListenerInstalled = true;
        auth.onAuthStateChanged(() => loadWorkspaces());
      } catch (_) {}
    }

    function installProjectStoreHooks(projectStore) {
      if (!projectStore) return;
      if (typeof projectStore.renderProjects === 'function' && !projectStore.__OVYXWorkspaceRenderProjectsV1) {
        const originalRenderProjects = projectStore.renderProjects;
        projectStore.renderProjects = function (...args) {
          const currentState = state();
          const originalProjects = currentState.projects;
          if (!workspaceApiReady || !Array.isArray(originalProjects)) return originalRenderProjects.apply(this, args);
          const filteredProjects = originalProjects.filter(project => projectWorkspace(project) === selectedWorkspaceId)
            .sort((a, b) => projectActivityTimestamp(b) - projectActivityTimestamp(a));
          currentState.projects = filteredProjects;
          let result;
          try {
            result = originalRenderProjects.apply(this, args);
          } catch (error) {
            currentState.projects = originalProjects;
            throw error;
          }
          if (result && typeof result.then === 'function') {
            return result.finally(() => {
              currentState.projects = originalProjects;
            });
          }
          currentState.projects = originalProjects;
          return result;
        };
        projectStore.renderProjects.__original = originalRenderProjects;
        projectStore.__OVYXWorkspaceRenderProjectsV1 = true;
      }
      if (typeof projectStore.open === 'function' && !projectStore.__OVYXWorkspaceOpenV1) {
        const originalOpen = projectStore.open;
        projectStore.open = function (projectId, ...args) {
          const projectInventory = Array.isArray(state().projects)
            ? state().projects
            : (typeof projectStore.list === 'function' ? projectStore.list() : []);
          const project = projectInventory.find(item => String(item?.id || '') === String(projectId || ''));
          if (project) {
            const projectWorkspaceId = projectWorkspace(project);
            const owningWorkspace = workspaces.find(item => String(item.id) === projectWorkspaceId);
            const selectedWorkspace = currentWorkspace();
            if (owningWorkspace?.status === 'archived' || selectedWorkspace?.status === 'archived') {
              projectStore.showWorkspacePicker?.(document.activeElement);
              workspaceNote.textContent = 'This workspace is archived. Restore it before opening or editing its projects.';
              return false;
            }
            selectedWorkspaceId = projectWorkspaceId;
            persistWorkspaceSelection();
            if (!project.workspaceId) project.workspaceId = selectedWorkspaceId;
          }
          const result = originalOpen.call(this, projectId, ...args);
          const syncActiveProjectWorkspace = () => {
            const activeProject = state().activeProject;
            if (activeProject && String(activeProject.id || '') === String(projectId || '') && !activeProject.workspaceId) {
              activeProject.workspaceId = selectedWorkspaceId;
            }
            refreshProjectListing();
          };
          if (result && typeof result.then === 'function') {
            return result.then(value => {
              syncActiveProjectWorkspace();
              return value;
            });
          }
          syncActiveProjectWorkspace();
          return result;
        };
        projectStore.open.__original = originalOpen;
        projectStore.__OVYXWorkspaceOpenV1 = true;
      }
      if (typeof projectStore.save === 'function' && !projectStore.__OVYXWorkspaceSaveV1) {
        const originalSave = projectStore.save;
        projectStore.save = function (...args) {
          const active = state().activeProject;
          if (active && typeof active === 'object') {
            if (!active.workspaceId) active.workspaceId = selectedWorkspaceId || 'personal';
            const projects = Array.isArray(state().projects) ? state().projects : [];
            const stored = projects.find(item => String(item?.id || '') === String(active.id || ''));
            if (stored && !stored.workspaceId) stored.workspaceId = active.workspaceId;
          }
          return originalSave.apply(this, args);
        };
        projectStore.save.__original = originalSave;
        projectStore.__OVYXWorkspaceSaveV1 = true;
      }
    }
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
    createPicker();
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