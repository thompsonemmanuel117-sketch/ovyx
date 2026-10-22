const BRAND_FAVICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-labelledby="title"><title id="title">OVYX</title><defs><linearGradient id="ovyxBrandGold" x1="0" y1="1" x2="1" y2="0"><stop offset="0%" stop-color="#6d4309"/><stop offset="22%" stop-color="#c58c28"/><stop offset="48%" stop-color="#fff1b2"/><stop offset="70%" stop-color="#e8b64f"/><stop offset="100%" stop-color="#7a490c"/></linearGradient></defs><rect width="128" height="128" rx="29" fill="#0b1020"/><g transform="translate(12 12) scale(1.625)"><path d="M32 5L55 18.5V45.5L32 59L9 45.5V18.5L32 5Z" fill="none" stroke="url(#ovyxBrandGold)" stroke-linejoin="round" stroke-width="6.5"/><path d="M32 18L44 25V39L32 46L20 39V25L32 18Z" fill="none" stroke="url(#ovyxBrandGold)" stroke-linejoin="round" stroke-width="6.5"/></g></svg>';

const LAUNCH_SCRIPT = '<script defer src="/assets/ovyx-account-notifications.js?v=20261021-2"></script><script defer src="/assets/ovyx-launch-polish.js?v=20261018-2"></script><script defer src="/assets/ovyx-assistant-workspace.js?v=20261019-1"></script><script defer src="/assets/ovyx-studio-trace.js?v=20261018-3"></script><script defer src="/assets/ovyx-sentinel.js?v=20261018-4"></script><script defer src="/assets/ovyx-sentinel-avatar-3d.js?v=20261018-1"></script><script defer src="/assets/ovyx-provider-availability.js?v=20261018-2"></script><script defer src="/assets/ovyx-webstudio-reliability.js?v=20261019-2"></script><script defer src="/assets/ovyx-webstudio-research.js?v=20261019-1"></script><script defer src="/assets/ovyx-webstudio-project-branding.js?v=20261021-11"></script><script defer src="/assets/ovyx-webstudio-navigation-polish.js?v=20261021-4"></script><script defer src="/assets/ovyx-webstudio-fullstack-upgrade.js?v=20261021-2"></script><script defer src="/assets/ovyx-webstudio-project-export.js?v=20261021-5"></script><script defer src="/assets/ovyx-webstudio-code-search.js?v=20261021-7"></script><script defer src="/assets/ovyx-webstudio-apply-suggestions.js?v=20261019-1"></script><script defer src="/assets/ovyx-settings-billing-live.js?v=20261019-1"></script><script defer src="/assets/ovyx-webstudio-quality.js?v=20261021-1"></script><script defer src="/assets/ovyx-additional-ai-provider-diagnostics.js?v=20261018-2"></script><script defer src="/assets/ovyx-admin-workspace.js?v=20261018-2"></script><script defer src="/assets/ovyx-admin-controls.js?v=20261020-1"></script><script defer src="/assets/ovyx-app-studio-brand-dna.js?v=20261018-2"></script><script defer src="/assets/ovyx-app-studio-url-analyzer.js?v=20261018-5"></script><script defer src="/assets/ovyx-app-studio-link-builder.js?v=20261018-9"></script><script defer src="/assets/ovyx-app-studio-project-brain.js?v=20261018-4"></script><script defer src="/assets/ovyx-app-studio-premium-polish.js?v=20261018-3"></script><script defer src="/assets/ovyx-webstudio-cancel-safety.js?v=20261022-2"></script><script defer src="/assets/ovyx-scoped-rollback.js?v=20261022-10"></script>';

export async function onRequest(context) {
  const url = new URL(context.request.url);

  // Browser engines often fall back to /favicon.ico, including on reloads and
  // nested SPA paths. Never let an obsolete static file or cached default icon
  // answer that request: serve the same canonical OVYX mark directly.
  if ((url.pathname.toLowerCase().endsWith('/favicon.ico') || url.pathname === '/ovyx-tab-v6.svg')) {
    return new Response(BRAND_FAVICON_SVG, {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }

  const response = await context.next();
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();

  // Route-based early returns let a nested URL or refresh bypass the brand
  // fix. Rewrite every HTML response, and leave API/binary assets untouched.
  if (!contentType.includes('text/html')) return response;

  const rewritten = new HTMLRewriter()
    // Replace every pre-existing icon declaration so browsers cannot keep
    // choosing a stale project favicon or an implicit /favicon.ico fallback.
    .on('link[rel]', {
      element(element) {
        const rel = String(element.getAttribute('rel') || '').toLowerCase().split(/\s+/).filter(Boolean);
        if (rel.includes('icon')) element.remove();
      },
    })
    .on('head', {
      element(element) {
        // Put the real logo first and install the enforcement script before
        // application scripts can reintroduce an old favicon during boot.
        element.prepend('<link rel="icon" type="image/svg+xml" href="/ovyx-tab-v6.svg?v=20261021-6"><script src="/assets/ovyx-shell-favicon-lock.js?v=20261021-3"></script>', { html: true });
        element.append('<link rel="manifest" href="/manifest.json"><meta name="theme-color" content="#111827"><link rel="apple-touch-icon" href="/assets/ovyx-brand-mark.png">', { html: true });
      },
    })
    .on('body', {
      element(element) {
        element.append(LAUNCH_SCRIPT, { html: true });
      },
    })
    .transform(response);

  // Prevent an old HTML shell from winning the browser's reload/cache race.
  const headers = new Headers(rewritten.headers);
  headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  headers.set('Pragma', 'no-cache');
  headers.set('Expires', '0');
  headers.delete('content-length');
  return new Response(rewritten.body, {
    status: rewritten.status,
    statusText: rewritten.statusText,
    headers,
  });
}