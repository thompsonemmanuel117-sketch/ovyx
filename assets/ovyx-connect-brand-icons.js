(function () {
  'use strict';

  // Simple Icons provides the official brand SVG for known services. For
  // arbitrary API hosts, use that host's published favicon as the identity.
  // Never inject provider-supplied HTML or execute code from a connection.
  const BRAND_SLUGS = Object.freeze({
    'google drive':'googledrive','google sheets':'googlesheets','google calendar':'googlecalendar',
    'google docs':'googledocs','google forms':'googleforms','github':'github','gitlab':'gitlab',
    'stripe':'stripe','paypal':'paypal','paystack':'paystack','flutterwave':'flutterwave',
    'opay':'opay','whatsapp':'whatsapp','twilio':'twilio','resend':'resend',
    'sendgrid':'twilio','mailgun':'mailgun','brevo':'brevo','slack':'slack','discord':'discord',
    'notion':'notion','airtable':'airtable','hubspot':'hubspot','salesforce':'salesforce',
    'shopify':'shopify','woocommerce':'woocommerce','wordpress':'wordpress','webflow':'webflow',
    'supabase':'supabase','firebase':'firebase','cloudflare':'cloudflare','vercel':'vercel',
    'openai':'openai','chatgpt':'openai','gemini':'googlegemini','google ai':'googlegemini',
    'anthropic':'anthropic','claude':'anthropic','deepseek':'deepseek','groq':'groq',
    'openrouter':'openrouter','hugging face':'huggingface','mongodb':'mongodb',
    'postgresql':'postgresql','neon':'neon','turso':'turso','redis':'redis',
    'zapier':'zapier','make.com':'make','linear':'linear','figma':'figma'
  });

  const ICON_STYLE = 'width:30px;height:30px;min-width:30px;object-fit:contain;padding:6px;border:1px solid rgba(255,255,255,.12);border-radius:10px;background:rgba(255,255,255,.045);display:block;';
  const FALLBACK = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#d6d9df" stroke-width="1.7"><circle cx="12" cy="12" r="8.5"/><path d="M3.8 12h16.4M12 3.5c2.2 2.3 3.2 5.1 3.2 8.5s-1 6.2-3.2 8.5c-2.2-2.3-3.2-5.1-3.2-8.5s1-6.2 3.2-8.5Z"/></svg>');

  function identityFor(row) {
    const text = String(row.innerText || row.textContent || '').toLowerCase();
    const links = Array.from(row.querySelectorAll('a[href]')).map(a => a.href);
    const explicit = row.getAttribute('data-provider') || row.getAttribute('data-brand') || '';
    const combined = (explicit + ' ' + text + ' ' + links.join(' ')).toLowerCase();
    for (const [name, slug] of Object.entries(BRAND_SLUGS)) {
      if (combined.includes(name)) return { name, slug, source: 'brand' };
    }
    const endpointMatch = combined.match(/https?:\/\/[^\s"'<>]+/i);
    if (endpointMatch) {
      try {
        const host = new URL(endpointMatch[0]).hostname.replace(/^www\./, '');
        return { name: host, host, source: 'favicon' };
      } catch {}
    }
    return { name: 'Connected API', source: 'generic' };
  }

  function iconFor(row) {
    const identity = identityFor(row);
    const wrap = document.createElement('span');
    wrap.className = 'ovyx-connect-brand-icon';
    wrap.setAttribute('aria-label', identity.name + ' logo');
    wrap.title = identity.name + ' logo';
    wrap.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;flex:0 0 30px;margin-right:11px;vertical-align:middle;';
    const img = document.createElement('img');
    img.alt = identity.name + ' logo';
    img.width = 30;
    img.height = 30;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.style.cssText = ICON_STYLE;
    img.src = identity.source === 'brand'
      ? 'https://cdn.simpleicons.org/' + encodeURIComponent(identity.slug)
      : identity.source === 'favicon'
        ? 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(identity.host) + '&sz=128'
        : FALLBACK;
    img.onerror = function () {
      if (img.dataset.fallbackApplied === '1') return;
      img.dataset.fallbackApplied = '1';
      img.src = FALLBACK;
    };
    wrap.appendChild(img);
    return wrap;
  }

  function decorate() {
    const actions = document.querySelectorAll('[data-v91-test], [data-v91-delete], [data-conn-test], [data-conn-delete]');
    const rows = new Set();
    actions.forEach(action => {
      let node = action;
      let candidate = null;
      for (let depth = 0; node && node !== document.body && depth < 7; depth += 1, node = node.parentElement) {
        const text = String(node.innerText || node.textContent || '');
        if (text.length > 0 && text.length < 2200 &&
            node.querySelector('[data-v91-test], [data-v91-delete], [data-conn-test], [data-conn-delete]')) {
          candidate = node;
          if (node.matches('[data-connection-id], [data-v91-connection], article, li')) break;
        }
      }
      if (candidate) rows.add(candidate);
    });
    rows.forEach(row => {
      if (row.querySelector(':scope > .ovyx-connect-brand-icon')) return;
      const icon = iconFor(row);
      const first = row.firstElementChild;
      if (first) {
        first.style.display = first.style.display || 'flex';
        first.style.alignItems = first.style.alignItems || 'center';
        first.prepend(icon);
      } else {
        row.prepend(icon);
      }
    });
  }

  function boot() {
    decorate();
    const observer = new MutationObserver(decorate);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    // The connection screen is rendered on demand; observe the same runtime
    // after settings navigation without repeatedly installing observers.
    window.addEventListener('ovyx:connections-updated', decorate);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
