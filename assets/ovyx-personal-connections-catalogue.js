(function () {
  'use strict';
  if (window.__OVYX_PERSONAL_CONNECTIONS_CATALOGUE_V1__) return;
  window.__OVYX_PERSONAL_CONNECTIONS_CATALOGUE_V1__ = true;

  const SERVICES = Object.freeze([
    { id:'openai', name:'OpenAI', category:'AI providers', logo:'openai', type:'ai', provider:'openai', method:'Personal AI API key', oauth:'Not used', adapter:'AI Brain only', detail:'Personal fallback only; never exposed to project code.' },
    { id:'anthropic', name:'Anthropic Claude', category:'AI providers', logo:'anthropic', type:'ai', provider:'anthropic', method:'Personal AI API key', oauth:'Not used', adapter:'AI Brain only', detail:'Personal fallback only; never exposed to project code.' },
    { id:'gemini', name:'Google Gemini', category:'AI providers', logo:'googlegemini', type:'ai', provider:'gemini', method:'Personal AI API key', oauth:'Not used', adapter:'AI Brain only', detail:'Personal fallback only; never exposed to project code.' },
    { id:'deepseek', name:'DeepSeek', category:'AI providers', logo:'deepseek', type:'ai', provider:'deepseek', method:'Personal AI API key', oauth:'Not used', adapter:'AI Brain only', detail:'Personal fallback only; never exposed to project code.' },
    { id:'groq', name:'Groq', category:'AI providers', logo:'groq', type:'ai', provider:'groq', method:'Personal AI API key', oauth:'Not used', adapter:'AI Brain only', detail:'Personal fallback only; never exposed to project code.' },
    { id:'openrouter', name:'OpenRouter', category:'AI providers', logo:'openrouter', type:'ai', provider:'openrouter', method:'Personal AI API key', oauth:'Not used', adapter:'AI Brain only', detail:'Personal fallback only; never exposed to project code.' },

    { id:'stripe', name:'Stripe', category:'Payments', logo:'stripe', type:'http', auth:'bearer', method:'Secret API key · Bearer', oauth:'Not available in this centre', adapter:'Not ready', detail:'No native project payment adapter is registered here.' },
    { id:'paystack', name:'Paystack', category:'Payments', logo:'paystack', type:'http', auth:'bearer', method:'Secret API key · Bearer', oauth:'Not available in this centre', adapter:'Platform payments only', detail:'OVYX platform checkout routes are separate from project adapters.' },
    { id:'flutterwave', name:'Flutterwave', category:'Payments', logo:'flutterwave', type:'http', auth:'bearer', method:'Secret API key · Bearer', oauth:'Not available in this centre', adapter:'Not ready', detail:'A project-specific payment adapter and webhook verification are still required.' },
    { id:'opay', name:'OPay', category:'Payments', logo:'opay', type:'http', enabled:false, method:'Signed API credentials', oauth:'Not available in this centre', adapter:'Not ready', detail:'The signed request protocol needs a dedicated adapter; generic API keys are not enough.' },

    { id:'resend', name:'Resend', category:'Messaging', logo:'resend', type:'http', auth:'bearer', method:'API key · Bearer', oauth:'Not available in this centre', adapter:'Not ready', detail:'No native project email-delivery adapter is registered yet.' },
    { id:'sendgrid', name:'SendGrid', category:'Messaging', logo:'sendgrid', type:'http', auth:'bearer', method:'API key · Bearer', oauth:'Not available in this centre', adapter:'Not ready', detail:'No native project email-delivery adapter is registered yet.' },
    { id:'twilio', name:'Twilio', category:'Messaging', logo:'twilio', type:'http', auth:'basic', method:'Account SID + token · Basic', oauth:'Not available in this centre', adapter:'Not ready', detail:'No native project SMS/voice adapter is registered yet.' },
    { id:'whatsapp', name:'WhatsApp Cloud API', category:'Messaging', logo:'whatsapp', type:'http', auth:'bearer', method:'Access token · Bearer', oauth:'Not available in this centre', adapter:'Not ready', detail:'No native project messaging adapter is registered yet.' },

    { id:'slack', name:'Slack', category:'Work & CRM', logo:'slack', type:'http', auth:'bearer', method:'OAuth 2.0 authorization code', oauth:'OAuth supported · server setup required', oauthService:'slack', adapter:'Generic HTTPS adapter ready', detail:'OAuth credentials are encrypted and refresh is supported when token rotation is enabled. Provider-specific Slack workflows are not advertised.' },
    { id:'discord', name:'Discord', category:'Work & CRM', logo:'discord', type:'http', auth:'bearer', method:'OAuth 2.0 authorization code + PKCE', oauth:'OAuth supported · server setup required', oauthService:'discord', adapter:'Generic HTTPS adapter ready', detail:'Account consent, identity verification and token refresh are supported. Discord-specific bot workflows are not advertised.' },
    { id:'notion', name:'Notion', category:'Work & CRM', logo:'notion', type:'http', auth:'bearer', method:'OAuth 2.0 authorization code', oauth:'OAuth supported · server setup required', oauthService:'notion', adapter:'Generic HTTPS adapter ready', detail:'Workspace consent and identity verification are supported. Notion-Version is supplied on requests; provider-specific workflows are not advertised.' },
    { id:'airtable', name:'Airtable', category:'Work & CRM', logo:'airtable', type:'http', auth:'bearer', method:'Personal access token · Bearer', oauth:'OAuth connector not available here', adapter:'Not ready', detail:'Airtable-specific base and record adapter is not registered.' },
    { id:'hubspot', name:'HubSpot', category:'Work & CRM', logo:'hubspot', type:'http', auth:'bearer', method:'Private app token · Bearer', oauth:'OAuth connector not available here', adapter:'Not ready', detail:'A HubSpot-specific CRM adapter and scope mapping are not registered.' },
    { id:'salesforce', name:'Salesforce', category:'Work & CRM', logo:'salesforce', type:'http', enabled:false, method:'OAuth 2.0 required', oauth:'Required · not available here', adapter:'Not ready', detail:'Do not paste a temporary token; OAuth lifecycle and Salesforce adapter are not implemented here.' },

    { id:'shopify', name:'Shopify', category:'Commerce', logo:'shopify', type:'http', auth:'bearer', method:'Admin API access token · Bearer', oauth:'OAuth connector not available here', adapter:'Not ready', detail:'A Shopify-specific store, product and order adapter is not registered.' },
    { id:'woocommerce', name:'WooCommerce', category:'Commerce', logo:'woocommerce', type:'http', auth:'basic', method:'Consumer key + secret · Basic', oauth:'Not available in this centre', adapter:'Not ready', detail:'A WooCommerce-specific store and webhook adapter is not registered.' },

    { id:'supabase', name:'Supabase', category:'Data & storage', logo:'supabase', type:'http', auth:'api-key', method:'Project API key · API key', oauth:'Not available in this centre', adapter:'Not ready', detail:'No Supabase-specific database/auth adapter is registered for project actions.' },
    { id:'cloudflare', name:'Cloudflare', category:'Data & storage', logo:'cloudflare', type:'http', auth:'bearer', method:'API token · Bearer', oauth:'Not available in this centre', adapter:'Not ready', detail:'Existing OVYX Cloudflare environment bindings are not the same as a user project adapter.' },
    { id:'googledrive', name:'Google Drive', category:'Data & storage', logo:'googledrive', type:'http', auth:'bearer', method:'OAuth 2.0 authorization code + PKCE', oauth:'OAuth supported · server setup required', oauthService:'googledrive', adapter:'Generic HTTPS adapter ready', detail:'Least-privilege drive.file scope, account verification and token refresh are supported through the generic HTTPS adapter.' },
    { id:'googlesheets', name:'Google Sheets', category:'Data & storage', logo:'googlesheets', type:'http', auth:'bearer', method:'OAuth 2.0 authorization code + PKCE', oauth:'OAuth supported · server setup required', oauthService:'googlesheets', adapter:'Generic HTTPS adapter ready', detail:'Spreadsheet scope, account verification and token refresh are supported through the generic HTTPS adapter.' },
    { id:'googlecalendar', name:'Google Calendar', category:'Data & storage', logo:'googlecalendar', type:'http', auth:'bearer', method:'OAuth 2.0 authorization code + PKCE', oauth:'OAuth supported · server setup required', oauthService:'googlecalendar', adapter:'Generic HTTPS adapter ready', detail:'Calendar events scope, account verification and token refresh are supported through the generic HTTPS adapter.' },

    { id:'github', name:'GitHub', category:'Developer tools', logo:'github', type:'http', auth:'bearer', method:'Personal access token · Bearer', oauth:'Separate GitHub account flow exists', adapter:'Not ready', detail:'The separate GitHub account OAuth flow is not a project connection adapter.' },
    { id:'figma', name:'Figma', category:'Developer tools', logo:'figma', type:'http', auth:'bearer', method:'Personal access token · Bearer', oauth:'OAuth connector not available here', adapter:'Not ready', detail:'A Figma-specific file, comments and webhook adapter is not registered.' },

    { id:'custom-http', name:'Custom HTTPS API', category:'Custom', logo:'custom', type:'http', auth:'bearer', method:'Bearer · API key · Basic · None', oauth:'Bring your own provider OAuth is not supported', adapter:'Generic HTTPS adapter ready', detail:'Generic project requests are supported with explicit per-project permissions; this is not a provider-specific workflow.' }
  ]);

  const CATEGORIES = ['All services','AI providers','Payments','Messaging','Work & CRM','Commerce','Data & storage','Developer tools','Custom'];
  const $ = (selector, root = document) => root.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char]));
  let category = 'All services';
  let query = '';
  let oauthReadiness = {};

  function styles() {
    if ($('#pc-catalogue-styles')) return;
    const style = document.createElement('style');
    style.id = 'pc-catalogue-styles';
    style.textContent = '.pc-catalogue{margin:0 0 17px;padding:17px;border:1px solid #ffffff18;border-radius:17px;background:linear-gradient(145deg,#ffffff08,#ffffff03)}.pc-cat-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}.pc-cat-title{font-size:15px;font-weight:850;color:#f4f4f5}.pc-cat-subtitle{font-size:11px;color:#9298a2;line-height:1.6;margin-top:4px;max-width:720px}.pc-cat-summary{font-size:10px;color:#d7b56e;border:1px solid #d7a64e44;border-radius:99px;padding:6px 9px;white-space:nowrap}.pc-cat-tools{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin:14px 0 11px}.pc-cat-filters{display:flex;gap:6px;flex-wrap:wrap}.pc-cat-filter{border:1px solid #ffffff18;background:#111316;color:#a1a1aa;border-radius:99px;padding:7px 10px;font-size:10px;font-weight:750;cursor:pointer}.pc-cat-filter[aria-pressed=true]{color:#f1c875;border-color:#d7a64e88;background:#d7a64e18}.pc-cat-search{width:min(250px,100%);min-width:170px;border:1px solid #ffffff20;background:#0b0c0e;color:#eee;border-radius:9px;padding:9px 10px;font:inherit;font-size:11px}.pc-cat-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.pc-cat-card{min-width:0;padding:12px;border:1px solid #ffffff16;border-radius:13px;background:#08090bd9;display:flex;flex-direction:column;gap:9px}.pc-cat-card-top{display:flex;align-items:center;gap:9px;min-width:0}.pc-cat-logo{width:35px;height:35px;flex:none;display:grid;place-items:center;border:1px solid #ffffff20;border-radius:10px;background:#17191d;overflow:hidden;color:#e8bd69;font-size:13px;font-weight:850}.pc-cat-logo img{position:absolute;inset:0;margin:auto;width:24px;height:24px;object-fit:contain;z-index:1;background:#17191d}.pc-cat-name{font-size:12px;font-weight:800;color:#f4f4f5;overflow-wrap:anywhere}.pc-cat-kind{font-size:9px;color:#9298a2;margin-top:2px}.pc-cat-tags{display:flex;gap:5px;flex-wrap:wrap}.pc-cat-tag{font-size:9px;line-height:1.35;padding:4px 6px;border-radius:7px;border:1px solid #ffffff16;color:#b8bec8;background:#ffffff05}.pc-cat-tag.ready{color:#9fe0b2;border-color:#3e9b5d55;background:#1a6b3420}.pc-cat-tag.limited{color:#e6c37a;border-color:#c18c3b55;background:#a36b1718}.pc-cat-detail{font-size:10px;line-height:1.5;color:#9298a2;min-height:30px}.pc-cat-action{margin-top:auto;display:flex;justify-content:flex-end}.pc-cat-connect{border:1px solid #d7a64e66;background:#d7a64e14;color:#f0cc83;border-radius:8px;padding:7px 10px;font-size:10px;font-weight:800;cursor:pointer}.pc-cat-connect:disabled{opacity:.45;cursor:not-allowed}.pc-cat-empty{grid-column:1/-1;text-align:center;padding:20px;color:#9298a2;font-size:11px;border:1px dashed #ffffff22;border-radius:11px}.pc-cat-footnote{margin-top:11px;padding:10px 11px;border-radius:10px;background:#ffffff05;border:1px solid #ffffff12;color:#9298a2;font-size:10px;line-height:1.6}.pc-cat-footnote b{color:#e7e7e7}@media(max-width:900px){.pc-cat-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:560px){.pc-catalogue{padding:13px}.pc-cat-grid{grid-template-columns:1fr}.pc-cat-search{width:100%;max-width:none}}';
    document.head.appendChild(style);
  }

  function logo(service) {
    const label = esc(service.name.slice(0, 1).toUpperCase());
    const slug = encodeURIComponent(service.logo);
    const image = service.logo === 'custom' ? '' : '<img src="https://cdn.simpleicons.org/' + slug + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">';
    return '<span class="pc-cat-logo" aria-label="' + esc(service.name) + ' logo">' + image + '<span>' + label + '</span></span>';
  }

  function card(service) {
    const ready = service.adapter === 'Generic HTTPS adapter ready';
    const limited = service.adapter === 'AI Brain only' || service.adapter === 'Platform payments only';
    const oauthConfigured = !service.oauthService || oauthReadiness[service.oauthService]?.configured === true;
    const oauthLabel = service.oauthService ? (oauthConfigured ? 'OAuth: configured' : 'OAuth: setup required') : service.oauth;
    const canConnect = service.enabled !== false && oauthConfigured;
    const buttonLabel = service.type === 'ai' ? 'Open AI setup' : service.oauthService ? (oauthConfigured ? 'Connect with OAuth' : 'OAuth setup required') : canConnect ? 'Connect' : 'Not available yet';
    return '<article class="pc-cat-card" data-pc-cat-card data-pc-cat-name="' + esc((service.name + ' ' + service.category + ' ' + service.method).toLowerCase()) + '">' +
      '<div class="pc-cat-card-top">' + logo(service) + '<div style="min-width:0"><div class="pc-cat-name">' + esc(service.name) + '</div><div class="pc-cat-kind">' + esc(service.category) + '</div></div></div>' +
      '<div class="pc-cat-tags"><span class="pc-cat-tag">' + esc(service.method) + '</span><span class="pc-cat-tag ' + (service.oauth.toLowerCase().includes('not available') || service.oauth.toLowerCase().includes('not yet') ? 'limited' : '') + '">OAuth: ' + esc(oauthLabel) + '</span><span class="pc-cat-tag ' + (ready ? 'ready' : limited ? 'limited' : '') + '">Project adapter: ' + esc(service.adapter) + '</span></div>' +
      '<div class="pc-cat-detail">' + esc(service.detail) + '</div>' +
      '<div class="pc-cat-action"><button class="pc-cat-connect" type="button" data-pc-cat-connect="' + esc(service.id) + '"' + (canConnect ? '' : ' disabled') + '>' + esc(buttonLabel) + '</button></div></article>';
  }

  function render(panel) {
    const existing = $('.pc-catalogue', panel);
    if (!existing) return;
    const grid = $('[data-pc-cat-grid]', existing);
    if (!grid) return;
    const rows = SERVICES.filter(service => {
      const categoryMatch = category === 'All services' || service.category === category;
      const searchMatch = !query || (service.name + ' ' + service.category + ' ' + service.method + ' ' + service.oauth + ' ' + service.adapter).toLowerCase().includes(query);
      return categoryMatch && searchMatch;
    });
    grid.innerHTML = rows.length ? rows.map(card).join('') : '<div class="pc-cat-empty">No services match that search. Try another name or category.</div>';
    existing.querySelectorAll('[data-pc-cat-filter]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.pcCatFilter === category)));
    grid.querySelectorAll('[data-pc-cat-connect]').forEach(button => button.addEventListener('click', () => connect(button.dataset.pcCatConnect, panel)));
  }

  function catalogue(panel) {
    const section = document.createElement('section');
    section.className = 'pc-catalogue';
    section.setAttribute('aria-label', 'Service catalogue');
    section.innerHTML = '<div class="pc-cat-head"><div><div class="pc-cat-title">Service catalogue</div><div class="pc-cat-subtitle">Browse recognizable services, see the connection method OVYX can accept today, and check OAuth and project-adapter readiness before connecting.</div></div><span class="pc-cat-summary">1 generic project adapter · 0 native provider adapters</span></div>' +
      '<div class="pc-cat-tools"><div class="pc-cat-filters">' + CATEGORIES.map(item => '<button type="button" class="pc-cat-filter" data-pc-cat-filter="' + esc(item) + '" aria-pressed="' + String(item === category) + '">' + esc(item) + '</button>').join('') + '</div><input class="pc-cat-search" type="search" data-pc-cat-search placeholder="Find a service…" aria-label="Search service catalogue"></div>' +
      '<div class="pc-cat-grid" data-pc-cat-grid></div>' +
      '<div class="pc-cat-footnote"><b>What “ready” means:</b> the generic HTTPS adapter can call an owner-supplied endpoint after a project is explicitly granted permission. It does not provide provider-specific workflows. AI keys are for the personal Brain fallback only. OVYX platform payment routes and the separate GitHub account OAuth flow are not counted as generated-project adapters. OAuth-enabled services use a real consent and callback flow when the server app credentials are configured. They still use the generic HTTPS adapter; native provider workflows are shown only after separately verified adapters are implemented.</div>';
    panel.insertBefore(section, $('.pc-stats', panel));
    section.querySelectorAll('[data-pc-cat-filter]').forEach(button => button.addEventListener('click', () => { category = button.dataset.pcCatFilter; render(panel); }));
    $('[data-pc-cat-search]', section).addEventListener('input', event => { query = event.target.value.toLowerCase().trim(); render(panel); const input = $('[data-pc-cat-search]', section); input.focus(); input.setSelectionRange(query.length, query.length); });
    render(panel);
  }

  function connect(id, panel) {
    const service = SERVICES.find(item => item.id === id);
    if (!service || service.enabled === false) return;
    if (service.oauthService) {
      window.dispatchEvent(new CustomEvent('ovyx:connection-oauth-start', { detail:{ service:service.oauthService } }));
      return;
    }
    if (service.type === 'ai') {
      const button = $('[data-ovyx-personal-ai-manager]', panel);
      if (!button) return;
      button.click();
      const preselectProvider = (attempts) => {
        const select = $('#ovyx-ai-provider');
        if (select && select.querySelector('option[value="' + service.provider + '"]')) {
          select.value = service.provider;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          return;
        }
        if (attempts > 0) setTimeout(() => preselectProvider(attempts - 1), 100);
      };
      preselectProvider(30);
      return;
    }
    const add = $('[data-pc-add]', panel);
    if (!add) return;
    add.click();
    requestAnimationFrame(() => {
      const dialog = $('.pc-overlay .pc-dialog[aria-label="Add a Personal Connection"]');
      if (!dialog) return;
      const name = $('#pc-name', dialog);
      const type = $('#pc-type', dialog);
      const auth = $('#pc-auth', dialog);
      if (name) name.value = service.name;
      if (type) { type.value = service.type || 'http'; type.dispatchEvent(new Event('change', { bubbles: true })); }
      if (auth && service.auth) { auth.value = service.auth; auth.dispatchEvent(new Event('change', { bubbles: true })); }
      const endpoint = $('#pc-endpoint', dialog);
      if (endpoint) endpoint.value = '';
      const hint = $('.pc-hint', dialog);
      if (hint) hint.textContent = service.name + ': ' + service.method + '. Enter the official HTTPS API endpoint from the provider. ' + service.detail + ' Saving the connection does not create a native provider adapter.';
      if (endpoint) endpoint.focus();
    });
  }

  function mount() {
    const panel = $('[data-settings-panel="connections"]');
    if (!panel) return;
    const root = $('.ovyx-pc-root', panel);
    if (!root || !$('.pc-hero', root) || $('.pc-catalogue', root)) return;
    styles();
    catalogue(root);
    window.addEventListener('ovyx:connection-oauth-readiness', event => { oauthReadiness = event.detail || {}; render(root); });
  }

  function boot() {
    mount();
    const observer = new MutationObserver(() => mount());
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('ovyx-settings-rendered', mount);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();