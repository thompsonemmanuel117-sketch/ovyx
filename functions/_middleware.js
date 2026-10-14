const LAUNCH_SCRIPT = '<script defer src="/assets/ovyx-launch-polish.js?v=20261011-1"></script><script defer src="/assets/ovyx-assistant-workspace.js?v=20261014-2"></script><script defer src="/assets/ovyx-studio-trace.js?v=20261012-1"></script><script defer src="/assets/ovyx-sentinel.js?v=20261014-10"></script><script defer src="/assets/ovyx-sentinel-avatar-3d.js?v=20261014-3"></script><script defer src="/assets/ovyx-provider-availability.js?v=20261012-1"></script><script defer src="/assets/ovyx-webstudio-reliability.js?v=20261014-1"></script><script defer src="/assets/ovyx-webstudio-quality.js?v=20261014-1"></script><script defer src="/assets/ovyx-webstudio-quality.js?v=20261014-1"></script><script defer src="/assets/ovyx-additional-ai-provider-diagnostics.js?v=20261014-1"></script><script defer src="/assets/ovyx-admin-workspace.js?v=20261014-2"></script>';

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const response = await context.next();

  // The launch runtime is injected only into the application shell. API and
  // static asset requests pass through without HTML buffering or rewriting.
  if (url.pathname !== '/' && url.pathname !== '/index.html') return response;

  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (!response.ok || !contentType.includes('text/html')) return response;

  return new HTMLRewriter()
    .on('body', {
      element(element) {
        element.append(LAUNCH_SCRIPT, { html: true });
      },
    })
    .transform(response);
}