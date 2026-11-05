(function () {
  'use strict';
  if (window.__OVYX_CONNECT_CONTROL_CENTER_V1__) return;
  window.__OVYX_CONNECT_CONTROL_CENTER_V1__ = true;

  const PROVIDERS = Object.freeze({
    openai: { label: 'OpenAI', protocol: 'openai-chat', endpoint: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
    anthropic: { label: 'Anthropic Claude', protocol: 'anthropic-messages', endpoint: 'https://api.anthropic.com', model: 'claude-sonnet-4-6' },
    gemini: { label: 'Google Gemini', protocol: 'gemini-generate-content', endpoint: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.5-flash' },
    deepseek: { label: 'DeepSeek', protocol: 'openai-chat', endpoint: 'https://api.deepseek.com', model: 'deepseek-chat' },
    groq: { label: 'Groq', protocol: 'openai-chat', endpoint: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-20b' },
    openrouter: { label: 'OpenRouter', protocol: 'openai-chat', endpoint: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini' },
    custom: { label: 'Custom OpenAI-compatible API', protocol: 'openai-chat', endpoint: '', model: '' }
  });
  const $ = (root, selector) => root.querySelector(selector);
  const notify = (message, kind) => {
    try { const fn = window.showToast || window.toast; if (typeof fn === 'function') fn(message, kind || 'info'); } catch (_) {}
  };
  const currentUser = () => {
    try { return window.firebase && window.firebase.auth && window.firebase.auth().currentUser || null; } catch (_) { return null; }
  };
  async function api(path, options) {
    options = options || {};
    const user = currentUser();
    if (!user) throw new Error('Sign in to manage Universal Connections.');
    const token = await user.getIdToken(false);
    const headers = Object.assign({ Accept: 'application/json', Authorization: 'Bearer ' + token }, options.headers || {});
    const response = await fetch(path, Object.assign({ credentials: 'same-origin', cache: 'no-store', headers }, options, { headers }));
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw Object.assign(new Error(data.message || data.error || 'The connection request failed.'), { code: data.code, status: response.status });
    return data;
  }
  const jsonOptions = body => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const visible = element => !!element && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
  function ensureStyles() {
    if (document.getElementById('ovyx-connect-control-center-styles')) return;
    const style = document.createElement('style');
    style.id = 'ovyx-connect-control-center-styles';
    style.textContent = '.ovyx-connect-cta{position:fixed;right:22px;bottom:22px;z-index:9998;border:1px solid rgba(232,182,79,.5);border-radius:14px;padding:12px 17px;background:linear-gradient(135deg,#17130a,#090909);color:#fff;font:600 13px/1.2 system-ui;box-shadow:0 8px 34px rgba(0,0,0,.42);cursor:pointer}.ovyx-connect-cta:hover{border-color:#e8b64f;transform:translateY(-1px)}.ovyx-connect-overlay{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.78);backdrop-filter:blur(12px);display:flex;align-items:center;justify-content:center;padding:18px}.ovyx-connect-dialog{width:min(560px,100%);max-height:min(88vh,820px);overflow:auto;background:#090909;border:1px solid rgba(255,255,255,.13);border-radius:22px;padding:22px;color:#f5f5f5;box-shadow:0 24px 90px rgba(0,0,0,.65);font:14px/1.5 system-ui}.ovyx-connect-dialog h2{font-size:20px;margin:0 0 5px}.ovyx-connect-dialog p{color:#a1a1aa;margin:0 0 16px}.ovyx-connect-dialog label{display:block;color:#d4d4d8;font-size:12px;margin:12px 0 5px}.ovyx-connect-dialog input,.ovyx-connect-dialog select{width:100%;box-sizing:border-box;background:#111;border:1px solid #333;border-radius:10px;padding:11px 12px;color:#fff;font:inherit}.ovyx-connect-dialog input:focus,.ovyx-connect-dialog select:focus{outline:1px solid #d7a43e;border-color:#d7a43e}.ovyx-connect-dialog .ovyx-connect-actions{display:flex;gap:9px;justify-content:flex-end;margin-top:18px;flex-wrap:wrap}.ovyx-connect-dialog button{border:1px solid #444;border-radius:10px;padding:10px 14px;background:#171717;color:#eee;cursor:pointer;font:600 13px system-ui}.ovyx-connect-dialog button.primary{background:#d7a43e;color:#17120a;border-color:#d7a43e}.ovyx-connect-dialog button:disabled{opacity:.55;cursor:wait}.ovyx-connect-dialog .note{font-size:12px;color:#a1a1aa;background:#111;border:1px solid #272727;border-radius:10px;padding:10px;margin-top:12px}.ovyx-connect-perms{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}.ovyx-connect-perms label{display:flex;align-items:center;gap:7px;margin:0;background:#111;padding:9px;border-radius:9px}.ovyx-connect-perms input{width:auto}';
    document.head.appendChild(style);
  }
  function closeDialog() { document.querySelectorAll('.ovyx-connect-overlay').forEach(node => node.remove()); }
  function dialog(title, description, inner) {
    ensureStyles(); closeDialog();
    const overlay = document.createElement('div'); overlay.className = 'ovyx-connect-overlay'; overlay.setAttribute('role', 'presentation');
    overlay.innerHTML = '<section class="ovyx-connect-dialog" role="dialog" aria-modal="true" aria-label="' + title + '"><h2>' + title + '</h2><p>' + description + '</p>' + inner + '</section>';
    overlay.addEventListener('click', event => { if (event.target === overlay) closeDialog(); });
    document.addEventListener('keydown', function escape(event) { if (event.key === 'Escape') { closeDialog(); document.removeEventListener('keydown', escape); } }, { once: true });
    document.body.appendChild(overlay); return $('.ovyx-connect-dialog', overlay);
  }
  function renderAIForm(root, existing) {
    const options = existing.map(item => '<option value="' + String(item.id).replace(/[^A-Za-z0-9_-]/g, '') + '">' + String(item.name || 'Saved AI provider').replace(/[<>&"]/g, '') + ' · saved key</option>').join('');
    root.innerHTML += '<div class="ovyx-connect-note"></div><label for="ovyx-ai-choice">AI provider connection</label><select id="ovyx-ai-choice"><option value="new">Add a new provider key</option>' + options + '</select><div id="ovyx-ai-new-fields"><label for="ovyx-ai-provider">Provider</label><select id="ovyx-ai-provider">' + Object.entries(PROVIDERS).map(([key, value]) => '<option value="' + key + '">' + value.label + '</option>').join('') + '</select><label for="ovyx-ai-name">Connection name</label><input id="ovyx-ai-name" maxlength="120" value="My AI Provider"><label for="ovyx-ai-endpoint">API endpoint</label><input id="ovyx-ai-endpoint" type="url" autocomplete="url" placeholder="https://api.example.com/v1"><label for="ovyx-ai-model">Model name</label><input id="ovyx-ai-model" maxlength="180" placeholder="Enter the model ID"><label for="ovyx-ai-key">API key</label><input id="ovyx-ai-key" type="password" autocomplete="new-password" maxlength="8000" placeholder="Paste your provider API key" required></div><div class="note">Cloudflare Workers AI remains first. Your personal key is used only after your OVYX monthly, booster and daily AI allowances are exhausted. The key is encrypted on the server and is never placed in your website code.</div><div class="ovyx-connect-actions"><button type="button" data-cancel>Cancel</button><button type="button" class="primary" data-save>Save and enable fallback</button></div>';
    const choice = $('#ovyx-ai-choice', root), provider = $('#ovyx-ai-provider', root), endpoint = $('#ovyx-ai-endpoint', root), model = $('#ovyx-ai-model', root), name = $('#ovyx-ai-name', root), fields = $('#ovyx-ai-new-fields', root), key = $('#ovyx-ai-key', root);
    function applyProvider() { const p = PROVIDERS[provider.value]; endpoint.value = p.endpoint; model.value = p.model; name.value = p.label + ' personal key'; }
    provider.addEventListener('change', applyProvider); applyProvider();
    choice.addEventListener('change', () => { fields.hidden = choice.value !== 'new'; });
    $('[data-cancel]', root).addEventListener('click', closeDialog);
    $('[data-save]', root).addEventListener('click', async event => {
      const button = event.currentTarget; button.disabled = true; button.textContent = 'Saving securely…';
      try {
        let id = choice.value;
        if (id === 'new') {
          const p = PROVIDERS[provider.value];
          const url = new URL(endpoint.value);
          if (url.protocol !== 'https:') throw new Error('The API endpoint must use HTTPS.');
          if (!model.value.trim()) throw new Error('Enter the exact model ID supported by your provider.');
          if (!key.value.trim()) throw new Error('Paste your API key to continue.');
          const saved = await api('/api/settings/connections', jsonOptions({ name: name.value.trim() || p.label, type: 'ai', protocol: p.protocol, endpoint: url.toString(), authMode: 'bearer', model: model.value.trim(), secret: key.value, active: true }));
          id = saved.connection && saved.connection.id;
          key.value = '';
          if (!id) throw new Error('The provider connection was saved but OVYX did not return its ID. Refresh Connections before enabling it.');
        }
        await api('/api/settings/connections', jsonOptions({ action: 'use-ai', id }));
        closeDialog(); notify('Personal AI fallback is enabled. OVYX still uses Cloudflare first.', 'success');
        window.dispatchEvent(new CustomEvent('ovyx:connections-updated'));
      } catch (error) { notify(error.message || 'Could not save the AI connection.', 'error'); button.disabled = false; button.textContent = 'Save and enable fallback'; }
    });
  }
  async function openAIManager() {
    const root = dialog('Personal AI fallback', 'Connect a provider key to your OVYX account.', '<div class="note">Loading your saved AI connections…</div>');
    try {
      const data = await api('/api/settings/connections');
      const existing = (data.connections || []).filter(item => item.type === 'ai' && item.hasSecret && item.active);
      root.innerHTML = '';
      renderAIForm(root, existing);
    } catch (error) { root.innerHTML = '<div class="note">' + String(error.message || 'Unable to load connections.').replace(/[<>&"]/g, '') + '</div><div class="ovyx-connect-actions"><button type="button" data-cancel>Close</button></div>'; $('[data-cancel]', root).addEventListener('click', closeDialog); }
  }
  async function openProjectGrant(connectionId) {
    const root = dialog('Grant project access', 'Choose the saved OVYX project and the exact actions it may perform.', '<div class="note">Loading your projects…</div>');
    try {
      const data = await api('/api/projects');
      const projects = Array.isArray(data.projects) ? data.projects : [];
      if (!projects.length) { root.innerHTML = '<div class="note">Save a project in OVYX first. It will appear here.</div><div class="ovyx-connect-actions"><button type="button" data-cancel>Close</button></div>'; $('[data-cancel]', root).addEventListener('click', closeDialog); return; }
      root.innerHTML = '<label for="ovyx-grant-project">Project</label><select id="ovyx-grant-project">' + projects.map(p => '<option value="' + String(p.id).replace(/[^A-Za-z0-9_-]/g, '') + '">' + String(p.name || p.title || 'Untitled project').replace(/[<>&"]/g, '') + '</option>').join('') + '</select><div class="ovyx-connect-perms"><label><input type="checkbox" value="read" checked> Read</label><label><input type="checkbox" value="write"> Write</label><label><input type="checkbox" value="delete"> Delete</label><label><input type="checkbox" value="execute"> Execute tools</label></div><div class="note">Only selected permissions are granted. You can revoke access later from this same connection manager.</div><div class="ovyx-connect-actions"><button type="button" data-cancel>Cancel</button><button type="button" class="primary" data-grant>Grant access</button></div>';
      $('[data-cancel]', root).addEventListener('click', closeDialog);
      $('[data-grant]', root).addEventListener('click', async event => {
        const button = event.currentTarget; button.disabled = true;
        try {
          const projectId = $('#ovyx-grant-project', root).value;
          const permissions = Array.from(root.querySelectorAll('.ovyx-connect-perms input:checked')).map(input => input.value);
          await api('/api/settings/connection-grants', jsonOptions({ action: 'grant', projectId, connectionId, permissions }));
          closeDialog(); notify('Project access saved with the selected permissions.', 'success');
        } catch (error) { notify(error.message || 'Could not grant project access.', 'error'); button.disabled = false; }
      });
    } catch (error) { root.innerHTML = '<div class="note">' + String(error.message || 'Unable to load projects.').replace(/[<>&"]/g, '') + '</div><div class="ovyx-connect-actions"><button type="button" data-cancel>Close</button></div>'; $('[data-cancel]', root).addEventListener('click', closeDialog); }
  }
  function connectionIdFromAction(action) {
    const values = [action.getAttribute('data-v91-test'), action.getAttribute('data-v91-delete'), action.getAttribute('data-conn-test'), action.getAttribute('data-conn-delete'), action.getAttribute('data-connection-id'), action.getAttribute('data-id')];
    for (const value of values) if (value && /^[A-Za-z0-9_-]{1,100}$/.test(value)) return value;
    return '';
  }
  function decorateProjectGrantActions() {
    document.querySelectorAll('[data-v91-test], [data-v91-delete], [data-conn-test], [data-conn-delete]').forEach(action => {
      const id = connectionIdFromAction(action); if (!id) return;
      let row = action;
      for (let i = 0; row.parentElement && i < 6; i++) {
        row = row.parentElement;
        if (row.querySelector('[data-v91-test], [data-v91-delete], [data-conn-test], [data-conn-delete]')) break;
      }
      if (row.querySelector(':scope > [data-ovyx-project-grant]')) return;
      const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Grant to project'; button.setAttribute('data-ovyx-project-grant', id);
      button.style.cssText = 'margin:6px 4px 4px 0;padding:7px 10px;border:1px solid rgba(255,255,255,.16);border-radius:9px;background:rgba(255,255,255,.05);color:#ddd;font-size:12px;cursor:pointer;';
      button.addEventListener('click', () => openProjectGrant(id)); row.appendChild(button);
    });
  }
  let cta = null;
  function hasConnectionsView() {
    const heading = Array.from(document.querySelectorAll('h1,h2,h3,h4,[role="heading"]')).some(el => visible(el) && /universal connections|connections/i.test(el.textContent || ''));
    const action = Array.from(document.querySelectorAll('[data-v91-test], [data-v91-delete], [data-conn-test], [data-conn-delete]')).some(visible);
    return heading || action;
  }
  function decorate() {
    decorateProjectGrantActions();
    if (!hasConnectionsView()) { if (cta) { cta.remove(); cta = null; } return; }
    if (!cta) {
      ensureStyles(); cta = document.createElement('button'); cta.className = 'ovyx-connect-cta'; cta.id = 'ovyx-connect-ai-cta'; cta.type = 'button'; cta.textContent = '＋ Personal AI fallback'; cta.addEventListener('click', openAIManager); document.body.appendChild(cta);
    }
  }
  function boot() {
    decorate();
    const observer = new MutationObserver(decorate); observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class','style','hidden'] });
    window.addEventListener('ovyx:connections-updated', decorate);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})();
