(function () {
  'use strict';
  if (window.__OVYX_PROJECT_SHARING_V1__) return;
  window.__OVYX_PROJECT_SHARING_V1__ = true;

  const rootId = 'view-sharing';
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  const state = { projectId: '', project: null, shares: [], activity: [], collaborators: [], busy: false, notice: '', publicShare: null, publicProject: null, memberRequests: [], token: '' };
  const activeProject = () => window.KernelState?.activeProject || window.ProjectStore?.activeProject || null;
  const user = () => window.firebase?.auth?.().currentUser || window.auth?.currentUser || null;
  async function request(path, options = {}) {
    const current = user();
    const token = current?.getIdToken ? await current.getIdToken() : '';
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (token) headers.Authorization = 'Bearer ' + token;
    const response = await fetch(path, { ...options, headers, cache: 'no-store' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.ok === false) throw new Error(body.error || 'The sharing request could not be completed.');
    return body;
  }
  function page() { return document.getElementById(rootId); }
  function ensurePage() {
    let host = page();
    if (host && host.querySelector('.ovx-share-shell')) return host;
    const viewport = document.getElementById('view-router-viewport');
    if (!viewport) return null;
    host = host || document.createElement('section');
    host.id = rootId;
    host.className = 'hidden ovyx-share-page';
    host.setAttribute('aria-label', 'Project sharing and collaboration');
    host.innerHTML = '<div class="ovx-share-shell"><div class="ovx-share-header"><div><div class="ovx-share-eyebrow">OVYX / PROJECT SHARING</div><h1>Sharing &amp; collaboration</h1><p>Control who can view or edit your project. Your work stays private until you choose to share it.</p></div><span class="ovx-share-private"><i></i> PRIVATE BY DEFAULT</span></div><div class="ovx-share-projectbar"><label for="ovx-share-project">PROJECT</label><select id="ovx-share-project" data-share-project aria-label="Choose project"></select><button type="button" data-share-refresh>Refresh</button></div><div class="ovx-share-notice" aria-live="polite" data-share-notice></div><section class="ovx-share-panel ovx-share-inbox"><div class="ovx-share-access-head"><div><span>YOUR INBOX</span><h2>Project access requests</h2><p>Requests sent directly to your OVYX account. You decide whether to accept them.</p></div><strong data-member-inbox-count>0 PENDING</strong></div><div class="ovx-share-member-inbox" data-member-inbox><div class="ovx-share-empty">No pending access requests.</div></div></section><div class="ovx-share-grid"><section class="ovx-share-panel ovx-share-create"><div class="ovx-share-panel-head"><div><span>01 / VIEW ACCESS</span><h2>Create a view-only link</h2><p>Anyone with the link can view the shared project summary and open its published website. Links expire after 30 days.</p></div><i class="fa-solid fa-link"></i></div><button class="ovx-share-primary" type="button" data-share-create> <i class="fa-solid fa-plus"></i> Create share link</button><div class="ovx-share-created" data-share-created hidden></div></section><section class="ovx-share-panel ovx-share-invite"><div class="ovx-share-panel-head"><div><span>02 / TEAM ACCESS</span><h2>Invite by email</h2><p>Invite someone using the email address they use for OVYX.</p></div><i class="fa-regular fa-envelope"></i></div><form data-share-invite-form><label>Email address<input type="email" name="email" autocomplete="email" placeholder="teammate@example.com" required maxlength="320"></label><label>Permission<select name="role"><option value="viewer">Viewer · Can view</option><option value="editor">Editor · Can edit</option></select></label><button class="ovx-share-primary" type="submit"><i class="fa-solid fa-paper-plane"></i> Send invitation</button></form></section><section class="ovx-share-panel ovx-share-member"><div class="ovx-share-panel-head"><div><span>03 / OVYX MEMBER</span><h2>Share with an OVYX member</h2><p>Send an in-app access request to an existing verified OVYX account. They must accept before access is granted.</p></div><i class="fa-solid fa-user-plus"></i></div><form data-share-member-form><label>Member email<input type="email" name="email" autocomplete="email" placeholder="member@ovyx.app" required maxlength="320"></label><label>Permission<select name="role"><option value="viewer">Viewer · Can view</option><option value="editor">Editor · Can edit</option></select></label><button class="ovx-share-primary" type="submit"><i class="fa-solid fa-user-plus"></i> Send access request</button></form></section></div><section class="ovx-share-panel ovx-share-access"><div class="ovx-share-access-head"><div><span>ACCESS CONTROL</span><h2>People and links</h2><p>Review active links, pending invitations and accepted collaborators.</p></div><strong data-share-count>0 SHARES</strong></div><div class="ovx-share-list" data-share-list><div class="ovx-share-empty">Choose a project to manage its sharing settings.</div></div></section><section class="ovx-share-panel ovx-share-team"><div class="ovx-share-access-head"><div><span>TEAM PRESENCE</span><h2>Recently active</h2><p>People who have opened this project in OVYX recently.</p></div><strong data-presence-count>0 ACTIVE</strong></div><div class="ovx-share-presence-list" data-presence-list><div class="ovx-share-empty">No collaborator activity yet.</div></div></section><section class="ovx-share-panel ovx-share-activity"><div class="ovx-share-access-head"><div><span>PROJECT HISTORY</span><h2>Recent activity</h2><p>A simple record of what has changed in this project.</p></div><strong>ACTIVITY</strong></div><div class="ovx-share-activity-list" data-activity-list><div class="ovx-share-empty">Activity will appear here.</div></div></section><div class="ovx-share-footnote"><i class="fa-solid fa-shield-halved"></i><span>Only the project owner can create links, invite collaborators, change permissions or revoke access. Private project data is never exposed by the share link.</span></div></div>';
    viewport.appendChild(host);
    host.querySelector('[data-share-refresh]').addEventListener('click', load);
    host.querySelector('[data-share-project]').addEventListener('change', event => { state.projectId = event.target.value; load(); });
    host.querySelector('[data-share-create]').addEventListener('click', createLink);
    host.querySelector('[data-share-invite-form]').addEventListener('submit', invite);
    host.querySelector('[data-share-member-form]').addEventListener('submit', sendMemberRequest);
    host.querySelector('[data-member-inbox]').addEventListener('click', manageMemberRequest);
    host.querySelector('[data-share-list]').addEventListener('click', manageShare);
    host.querySelector('[data-share-list]').addEventListener('change', manageShare);
    return host;
  }
  function notice(message, error = false) {
    const host = page()?.querySelector('[data-share-notice]');
    if (!host) return;
    host.textContent = message || '';
    host.dataset.error = error ? 'true' : 'false';
  }
  function projectOptions() {
    const projects = Array.isArray(window.KernelState?.projects) ? window.KernelState.projects.filter(item => item?.sharingAccess?.owner !== false) : [];
    const active = activeProject();
    const selected = state.projectId || String(active?.id || '');
    if (active?.id && active?.sharingAccess?.owner !== false && !projects.some(item => String(item.id) === String(active.id))) projects.unshift(active);
    return { projects, selected };
  }
  function renderProjects() {
    const select = page()?.querySelector('#ovx-share-project');
    if (!select) return;
    const { projects, selected } = projectOptions();
    select.innerHTML = projects.length
      ? projects.map(project => '<option value="' + escapeHtml(project.id) + '">' + escapeHtml(project.name || project.title || 'Untitled project') + '</option>').join('')
      : '<option value="">No projects found</option>';
    if (selected && projects.some(item => String(item.id) === selected)) select.value = selected;
    else if (projects[0]) { state.projectId = String(projects[0].id); select.value = state.projectId; }
    else { state.projectId = ''; select.value = ''; }
  }
  function renderInbox() {
    const host = page();
    if (!host) return;
    const list = host.querySelector('[data-member-inbox]');
    const count = host.querySelector('[data-member-inbox-count]');
    const requests = Array.isArray(state.memberRequests) ? state.memberRequests : [];
    count.textContent = requests.length + ' PENDING';
    list.innerHTML = requests.length ? requests.map(item => '<article class="ovx-share-member-row"><div class="ovx-share-member-row-main"><strong>' + escapeHtml(item.projectName) + '</strong><small>' + escapeHtml(item.ownerName || item.ownerEmail) + ' · Wants to add you as ' + escapeHtml(item.role) + '</small></div><div class="ovx-share-member-actions"><button type="button" data-member-accept="' + escapeHtml(item.shareId) + '" data-project-id="' + escapeHtml(item.projectId) + '">Accept</button><button type="button" data-member-decline="' + escapeHtml(item.shareId) + '" data-project-id="' + escapeHtml(item.projectId) + '">Decline</button></div></article>').join('') : '<div class="ovx-share-empty">No pending access requests.</div>';
  }

  function render() {
    const host = page();
    if (!host) return;
    const list = host.querySelector('[data-share-list]');
    const count = host.querySelector('[data-share-count]');
    const items = state.shares;
    count.textContent = items.length + (items.length === 1 ? ' SHARE' : ' SHARES');
    if (!items.length) {
      list.innerHTML = '<div class="ovx-share-empty"><i class="fa-solid fa-lock"></i><strong>This project is private</strong><span>No active share links or invitations yet.</span></div>';
    } else {
      list.innerHTML = items.map(item => {
        const status = item.status === 'accepted' ? (item.type === 'member' ? 'Member accepted' : 'Accepted') : item.status === 'pending' ? 'Awaiting acceptance' : item.status === 'active' ? (item.type === 'invite' ? 'Invitation sent' : 'Active link') : item.status === 'declined' ? 'Declined' : 'Revoked';
        const label = item.type === 'invite' ? (item.email || 'Email invitation') : item.type === 'member' ? (item.email || 'OVYX member') : 'View-only share link';
        const icon = item.type === 'invite' ? 'regular fa-envelope' : item.type === 'member' ? 'solid fa-user' : 'solid fa-link';
        const canEditRole = ['invite', 'member'].includes(item.type) && !['revoked', 'declined'].includes(item.status);
        return '<article class="ovx-share-row" data-share-row="' + escapeHtml(item.id) + '"><span class="ovx-share-row-icon"><i class="fa-' + icon + '"></i></span><div class="ovx-share-row-main"><strong>' + escapeHtml(label) + '</strong><small>' + escapeHtml(status) + ' · Created ' + escapeHtml(item.createdAt ? new Date(item.createdAt).toLocaleDateString() : 'recently') + '</small></div>' + (canEditRole ? '<select data-role="' + escapeHtml(item.id) + '" aria-label="Change permission"><option value="viewer"' + (item.role === 'viewer' ? ' selected' : '') + '>Viewer</option><option value="editor"' + (item.role === 'editor' ? ' selected' : '') + '>Editor</option></select>' : '<span class="ovx-share-role">' + escapeHtml(item.role).toUpperCase() + '</span>') + (!['revoked', 'declined'].includes(item.status) ? '<button type="button" class="ovx-share-revoke" data-revoke="' + escapeHtml(item.id) + '">Revoke</button>' : '<span class="ovx-share-revoked">' + (item.status === 'declined' ? 'Declined' : 'Revoked') + '</span>') + '</article>';
      }).join('');
    }
    const presence = host.querySelector('[data-presence-list]');
    const people = Array.isArray(state.collaborators) ? state.collaborators : [];
    host.querySelector('[data-presence-count]').textContent = people.filter(person => person.active).length + ' ACTIVE';
    presence.innerHTML = people.length ? people.map(person => '<div class="ovx-share-presence-row"><span class="ovx-share-presence-dot' + (person.active ? ' is-active' : '') + '"></span><div><strong>' + escapeHtml(person.name) + '</strong><small>' + escapeHtml(person.email) + ' · ' + (person.active ? 'Active now' : 'Last seen ' + escapeHtml(person.lastSeenAt ? new Date(person.lastSeenAt).toLocaleString() : 'recently')) + '</small></div><em>' + escapeHtml(person.role) + '</em></div>').join('') : '<div class="ovx-share-empty">No collaborator activity yet.</div>';
    const activity = host.querySelector('[data-activity-list]');
    const events = Array.isArray(state.activity) ? state.activity : [];
    const labels = { invitation_accepted:'Accepted an invitation', invitation_sent:'Sent an invitation', share_link_created:'Created a view-only link', access_revoked:'Revoked project access', permission_changed:'Changed a collaborator permission', project_updated:'Updated the project', member_request_sent:'Sent a direct member request', member_request_accepted:'Accepted a direct member request', member_request_declined:'Declined a direct member request' };
    activity.innerHTML = events.length ? events.map(item => '<div class="ovx-share-activity-row"><span class="ovx-share-activity-mark"></span><div><strong>' + escapeHtml(labels[item.event] || 'Project activity') + '</strong><small>' + escapeHtml(item.actorName) + ' · ' + escapeHtml(item.createdAt ? new Date(item.createdAt).toLocaleString() : 'Recently') + '</small></div></div>').join('') : '<div class="ovx-share-empty">No activity recorded yet.</div>';
  }
  async function load() {
    const host = ensurePage();
    if (!host) return;
    if (state.token) return loadPublicShare();
    renderProjects();
    try { const inbox = await request('/api/project-sharing?inbox=1'); state.memberRequests = Array.isArray(inbox.requests) ? inbox.requests : []; }
    catch { state.memberRequests = []; }
    renderInbox();
    if (!state.projectId) { state.shares = []; render(); notice(state.memberRequests.length ? '' : 'Create a project first to start sharing.'); return; }
    state.busy = true;
    notice('Loading project access…');
    try {
      const data = await request('/api/project-sharing?projectId=' + encodeURIComponent(state.projectId));
      state.project = data.project;
      state.shares = Array.isArray(data.shares) ? data.shares : [];
      state.activity = Array.isArray(data.activity) ? data.activity : [];
      state.collaborators = Array.isArray(data.collaborators) ? data.collaborators : [];
      render();
      notice('');
    } catch (error) {
      state.shares = [];
      render();
      notice(error.message, true);
    } finally { state.busy = false; }
  }
  async function createLink() {
    if (!state.projectId || state.busy) return;
    state.busy = true;
    try {
      const data = await request('/api/project-sharing', { method: 'POST', body: JSON.stringify({ action: 'create-link', projectId: state.projectId }) });
      const target = page().querySelector('[data-share-created]');
      target.hidden = false;
      target.innerHTML = '<span>Share link ready · expires in 30 days</span><div><input readonly aria-label="Share link" value="' + escapeHtml(data.shareUrl) + '"><button type="button" data-copy-link>Copy link</button></div>';
      target.querySelector('[data-copy-link]').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(data.shareUrl); notice('Share link copied.'); }
        catch { target.querySelector('input').select(); notice('Select and copy the link.'); }
      });
      await load();
      notice('View-only link created. It will expire in 30 days.');
    } catch (error) { notice(error.message, true); }
    finally { state.busy = false; }
  }
  async function invite(event) {
    event.preventDefault();
    if (!state.projectId || state.busy) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    state.busy = true;
    try {
      await request('/api/project-sharing', { method: 'POST', body: JSON.stringify({ action: 'invite', projectId: state.projectId, email: values.get('email'), role: values.get('role') }) });
      form.reset();
      await load();
      notice('Invitation sent. The recipient must sign in with the invited email address to accept.');
    } catch (error) { notice(error.message, true); }
    finally { state.busy = false; }
  }
  async function sendMemberRequest(event) {
    event.preventDefault();
    if (!state.projectId || state.busy) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    state.busy = true;
    try {
      const data = await request('/api/project-sharing', { method: 'POST', body: JSON.stringify({ action: 'send-member-request', projectId: state.projectId, email: values.get('email'), role: values.get('role') }) });
      form.reset();
      await load();
      notice(data.message || 'If this is an eligible verified OVYX account, an access request will appear in its inbox.');
    } catch (error) { notice(error.message, true); }
    finally { state.busy = false; }
  }
  async function manageMemberRequest(event) {
    const acceptId = event.target?.dataset?.memberAccept;
    const declineId = event.target?.dataset?.memberDecline;
    if (!acceptId && !declineId) return;
    const shareId = acceptId || declineId;
    const projectId = event.target?.dataset?.projectId;
    const action = acceptId ? 'accept-member-request' : 'decline-member-request';
    try {
      await request('/api/project-sharing', { method: 'POST', body: JSON.stringify({ action, projectId, shareId }) });
      await load();
      notice(acceptId ? 'You accepted the request. The project is now available in your Projects list.' : 'You declined the access request.');
      if (acceptId) window.dispatchEvent(new CustomEvent('ovyx:projects-refresh'));
    } catch (error) { notice(error.message, true); }
  }

  async function manageShare(event) {
    const revokeId = event.target?.dataset?.revoke;
    const roleId = event.target?.dataset?.role;
    if (!revokeId && !roleId) return;
    try {
      if (revokeId) {
        if (!window.confirm('Revoke this access? The link or invitation will stop working.')) return;
        await request('/api/project-sharing', { method: 'POST', body: JSON.stringify({ action: 'revoke', projectId: state.projectId, shareId: revokeId }) });
        notice('Access revoked.');
      } else {
        await request('/api/project-sharing', { method: 'POST', body: JSON.stringify({ action: 'change-role', projectId: state.projectId, shareId: roleId, role: event.target.value }) });
        notice('Permission updated.');
      }
      await load();
    } catch (error) { notice(error.message, true); }
  }
  async function loadPublicShare() {
    const params = new URLSearchParams(location.search);
    const token = params.get('ovyx-share') || '';
    const owner = params.get('owner') || '';
    const projectId = params.get('projectId') || '';
    try {
      const data = await request('/api/project-sharing?token=' + encodeURIComponent(token) + '&owner=' + encodeURIComponent(owner) + '&projectId=' + encodeURIComponent(projectId));
      state.publicShare = data.share;
      state.publicProject = data.project;
      const host = page();
      const project = data.project;
      host.innerHTML = '<div class="ovx-share-public"><div class="ovx-share-eyebrow">OVYX / SHARED PROJECT</div><span class="ovx-share-private"><i></i> VIEW-ONLY ACCESS</span><h1>' + escapeHtml(project.name) + '</h1><p>' + escapeHtml(project.description || 'A project shared with you through OVYX.') + '</p><div class="ovx-share-public-meta">' + escapeHtml(project.pageCount) + ' pages · ' + escapeHtml(project.status) + '</div>' + (project.publishedUrl ? '<div class="ovx-share-preview"><div class="ovx-share-preview-head"><span>LIVE WEBSITE PREVIEW</span><a href="' + escapeHtml(project.publishedUrl) + '" target="_blank" rel="noopener noreferrer">Open in new tab ↗</a></div><iframe title="Read-only preview of ' + escapeHtml(project.name) + '" src="' + escapeHtml(project.publishedUrl) + '" loading="lazy" referrerpolicy="no-referrer" sandbox="allow-scripts allow-forms allow-popups"></iframe></div>' : '<p class="ovx-share-public-note">This project has not been published yet, so a live website preview is not available. This link only shows the safe project summary.</p>') + (data.share.type === 'invite' ? '<button type="button" class="ovx-share-primary" data-accept-invite>Accept invitation as ' + escapeHtml(data.share.role) + '</button>' : '') + '</div>';
      const accept = host.querySelector('[data-accept-invite]');
      if (accept) accept.addEventListener('click', async () => {
        if (!user()) { notice('Sign in with the email address that received this invitation, then return here to accept it.', true); return; }
        accept.disabled = true;
        try {
          await request('/api/project-sharing', { method: 'POST', body: JSON.stringify({ action: 'accept-invite', token, ownerEmail: owner, projectId }) });
          accept.textContent = 'Invitation accepted';
          notice('You now have ' + data.share.role + ' access to this project.');
        } catch (error) { accept.disabled = false; notice(error.message, true); }
      });
    } catch (error) {
      page().innerHTML = '<div class="ovx-share-public"><div class="ovx-share-eyebrow">OVYX / SHARED PROJECT</div><h1>This link is unavailable</h1><p>' + escapeHtml(error.message) + '</p><a href="/" class="ovx-share-primary">Return to OVYX</a></div>';
    }
  }
  async function heartbeat() {
    const project = activeProject();
    const current = user();
    if (!project?.id || !current) return;
    try { await request('/api/project-sharing', { method: 'POST', body: JSON.stringify({ action: 'presence', projectId: String(project.id) }) }); }
    catch { /* Presence must never interrupt editing. */ }
  }
  function open() {
    const host = ensurePage();
    if (!host) return;
    if (!state.token) load();
    window.Router?.go?.('sharing');
  }
  function boot() {
    ensurePage();
    const params = new URLSearchParams(location.search);
    state.token = params.get('ovyx-share') || '';
    if (state.token) {
      window.Router?.go?.('sharing');
      loadPublicShare();
    }
    heartbeat();
    window.setInterval(() => { heartbeat(); if (state.projectId && page() && !page().classList.contains('hidden')) load(); }, 30000);
    window.addEventListener('ovyx:view-changed', event => {
      heartbeat();
      if (event.detail?.view === 'sharing') {
        if (state.token) loadPublicShare();
        else load();
      }
    });
  }
  window.OVYXProjectSharing = Object.freeze({ open, load, version: 1 });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();