(function () {
  'use strict';
  if (window.__OVYX_IMAGE_GENERATION_V1__) return;
  window.__OVYX_IMAGE_GENERATION_V1__ = true;

  var MODEL_LABEL = 'Cloudflare Workers AI · FLUX.1 schnell';
  var root = null;
  var promptInput = null;
  var statusNode = null;
  var generateButton = null;
  var preview = null;
  var downloadLink = null;
  var busy = false;

  function byId(id) { return document.getElementById(id); }
  function activeWebStudio() {
    var view = byId('view-webstudio');
    return !!view && !view.classList.contains('hidden') &&
      view.getAttribute('aria-hidden') !== 'true' &&
      getComputedStyle(view).display !== 'none' &&
      getComputedStyle(view).visibility !== 'hidden';
  }
  function setStatus(message, isError) {
    if (!statusNode) return;
    statusNode.textContent = String(message || '');
    statusNode.dataset.state = isError ? 'error' : 'normal';
  }
  function authToken() {
    var auth = window.firebase && typeof window.firebase.auth === 'function' ? window.firebase.auth() : null;
    var user = auth && auth.currentUser;
    if (!user || typeof user.getIdToken !== 'function') throw new Error('Sign in to OVYX before generating an image.');
    return user.getIdToken();
  }
  function createUI() {
    if (root) return;
    var style = document.createElement('style');
    style.id = 'ovyx-image-generation-style-v1';
    style.textContent = [
      '#ovyx-image-gen-launch{position:fixed;right:16px;bottom:92px;z-index:9900;display:none;align-items:center;gap:8px;min-height:42px;padding:0 14px;border:1px solid rgba(232,182,79,.5);border-radius:12px;background:#0b0d10;color:#f6c96f;font:800 11px Inter,system-ui,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.35);cursor:pointer}',
      '#ovyx-image-gen-launch[data-visible="true"]{display:flex}',
      '#ovyx-image-gen-backdrop{position:fixed;inset:0;z-index:2147483000;display:none;place-items:center;padding:16px;background:rgba(0,0,0,.78);backdrop-filter:blur(12px)}',
      '#ovyx-image-gen-backdrop.open{display:grid}',
      '.ovyx-image-gen-card{width:min(680px,100%);max-height:min(90dvh,820px);overflow:auto;border:1px solid rgba(255,255,255,.12);background:#08090b;color:#f8fafc;border-radius:18px;box-shadow:0 28px 90px rgba(0,0,0,.5)}',
      '.ovyx-image-gen-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;padding:18px;border-bottom:1px solid rgba(255,255,255,.08)}',
      '.ovyx-image-gen-head h2{margin:0;font:850 17px/1.2 Inter,system-ui,sans-serif}.ovyx-image-gen-head p{margin:6px 0 0;color:#8d96a1;font:500 11px/1.5 Inter,system-ui,sans-serif}',
      '.ovyx-image-gen-close{width:32px;height:32px;border:1px solid rgba(255,255,255,.12);border-radius:9px;background:#111317;color:#d7dce2;cursor:pointer}',
      '.ovyx-image-gen-body{padding:18px;display:grid;gap:12px}.ovyx-image-gen-body label{display:grid;gap:7px;color:#b0b7c0;font:750 10px/1.3 Inter,system-ui,sans-serif}',
      '.ovyx-image-gen-body textarea{width:100%;box-sizing:border-box;min-height:110px;resize:vertical;padding:12px;border:1px solid rgba(255,255,255,.12);border-radius:10px;background:#030405;color:#f8fafc;font:500 12px/1.6 Inter,system-ui,sans-serif;outline:none}',
      '.ovyx-image-gen-body textarea:focus{border-color:rgba(232,182,79,.6);box-shadow:0 0 0 3px rgba(232,182,79,.08)}',
      '.ovyx-image-gen-actions{display:flex;gap:8px;flex-wrap:wrap}.ovyx-image-gen-actions button,.ovyx-image-gen-actions a{display:inline-flex;align-items:center;justify-content:center;min-height:38px;padding:0 13px;border:1px solid rgba(255,255,255,.12);border-radius:9px;background:#111317;color:#e9edf2;text-decoration:none;font:800 10px Inter,system-ui,sans-serif;cursor:pointer}',
      '.ovyx-image-gen-actions .primary{border-color:#e8b64f;background:#e8b64f;color:#090909}.ovyx-image-gen-actions button:disabled{opacity:.55;cursor:wait}',
      '.ovyx-image-gen-status{min-height:18px;color:#929aa4;font:600 10px/1.5 Inter,system-ui,sans-serif;overflow-wrap:anywhere}.ovyx-image-gen-status[data-state="error"]{color:#ff9b9b}',
      '.ovyx-image-gen-preview{display:none;max-width:100%;max-height:46dvh;object-fit:contain;border:1px solid rgba(255,255,255,.1);border-radius:10px;background:#030405}.ovyx-image-gen-preview.visible{display:block}',
      '@media(max-width:600px){#ovyx-image-gen-launch{right:10px;bottom:84px}.ovyx-image-gen-head,.ovyx-image-gen-body{padding:14px}}'
    ].join('');
    document.head.appendChild(style);

    var launch = document.createElement('button');
    launch.type = 'button';
    launch.id = 'ovyx-image-gen-launch';
    launch.setAttribute('aria-haspopup', 'dialog');
    launch.textContent = '✧ Create image';
    launch.addEventListener('click', openModal);
    document.body.appendChild(launch);

    var backdrop = document.createElement('div');
    backdrop.id = 'ovyx-image-gen-backdrop';
    backdrop.setAttribute('role', 'presentation');
    backdrop.innerHTML = '<section class="ovyx-image-gen-card" role="dialog" aria-modal="true" aria-labelledby="ovyx-image-gen-title"><header class="ovyx-image-gen-head"><div><h2 id="ovyx-image-gen-title">OVYX Image Studio</h2><p>Create an original image with Cloudflare Workers AI. Generation uses your OVYX AI allowance.</p></div><button type="button" class="ovyx-image-gen-close" aria-label="Close image studio">×</button></header><div class="ovyx-image-gen-body"><label for="ovyx-image-gen-prompt">Describe the picture you want</label><textarea id="ovyx-image-gen-prompt" maxlength="1800" placeholder="A premium gold diamond logo floating in a dark cinematic studio, elegant lighting, no text…"></textarea><div class="ovyx-image-gen-actions"><button type="button" class="primary" id="ovyx-image-gen-submit">Generate image</button><a id="ovyx-image-gen-download" download="ovyx-generated-image.jpg" hidden>Download image</a></div><div class="ovyx-image-gen-status" id="ovyx-image-gen-status" role="status" aria-live="polite">Model: ' + MODEL_LABEL + '. Your prompt is sent to OVYX’s authenticated server.</div><img class="ovyx-image-gen-preview" id="ovyx-image-gen-preview" alt="Image generated by OVYX"></div></section>';
    document.body.appendChild(backdrop);
    root = backdrop;
    promptInput = byId('ovyx-image-gen-prompt');
    statusNode = byId('ovyx-image-gen-status');
    generateButton = byId('ovyx-image-gen-submit');
    preview = byId('ovyx-image-gen-preview');
    downloadLink = byId('ovyx-image-gen-download');
    backdrop.querySelector('.ovyx-image-gen-close').addEventListener('click', closeModal);
    backdrop.addEventListener('click', function (event) { if (event.target === backdrop) closeModal(); });
    document.addEventListener('keydown', function (event) { if (event.key === 'Escape' && root && root.classList.contains('open')) closeModal(); });
    generateButton.addEventListener('click', generateImage);
    promptInput.addEventListener('keydown', function (event) {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') generateImage();
    });
    window.addEventListener('ovyx:view-changed', syncVisibility);
    var view = byId('view-webstudio');
    if (view && typeof MutationObserver === 'function') {
      new MutationObserver(syncVisibility).observe(view, { attributes: true, attributeFilter: ['class', 'aria-hidden', 'style'] });
    }
    syncVisibility();
  }
  function syncVisibility() {
    var launch = byId('ovyx-image-gen-launch');
    if (launch) launch.dataset.visible = activeWebStudio() ? 'true' : 'false';
    if (!activeWebStudio() && root && root.classList.contains('open') && !busy) closeModal();
  }
  function openModal() {
    if (!root) return;
    root.classList.add('open');
    if (promptInput) promptInput.focus();
  }
  function closeModal() {
    if (busy) return;
    if (root) root.classList.remove('open');
  }
  async function generateImage() {
    if (busy || !promptInput) return;
    var prompt = String(promptInput.value || '').trim();
    if (!prompt) { setStatus('Describe the image first.', true); promptInput.focus(); return; }
    if (prompt.length > 1800) { setStatus('Keep your description to 1,800 characters or fewer.', true); return; }
    busy = true;
    generateButton.disabled = true;
    downloadLink.hidden = true;
    preview.classList.remove('visible');
    preview.removeAttribute('src');
    setStatus('Generating with Cloudflare Workers AI… Keep this window open.');
    try {
      var token = await authToken();
      var response = await fetch('/api/ai/image-generation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ prompt: prompt })
      });
      var data = await response.json().catch(function () { return {}; });
      if (!response.ok || data.ok !== true || typeof data.image !== 'string' || !data.image.startsWith('data:image/')) {
        throw new Error(String(data.error || data.message || 'OVYX could not generate the image. Check your AI allowance and try again.'));
      }
      preview.src = data.image;
      preview.classList.add('visible');
      downloadLink.href = data.image;
      downloadLink.hidden = false;
      setStatus('Image generated successfully. Download it, then upload it to your Web Studio assets when you want to use it on a page.');
    } catch (error) {
      setStatus(error && error.message || 'Image generation failed. Please try again later.', true);
    } finally {
      busy = false;
      generateButton.disabled = false;
    }
  }
  function boot() {
    if (!byId('view-webstudio')) return false;
    createUI();
    return true;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
  [150, 500, 1200, 2500].forEach(function (delay) { setTimeout(boot, delay); });
  window.addEventListener('firebase-auth-state-ready', boot);
})();
