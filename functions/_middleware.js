const LAUNCH_SCRIPT = '<script defer src="/assets/ovyx-launch-polish.js?v=20261011-1"></script>';
const AI_WORKSPACE_STYLE = '<link rel="stylesheet" href="/assets/ovyx-ai-workspace.css?v=20261012-1">';
const AI_WORKSPACE_SCRIPT = '<script defer src="/assets/ovyx-ai-workspace.js?v=20261012-1"></script>';

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const response = await context.next();

  // The workspace assets are added only to the HTML shell; API and other static
  // requests remain untouched. Styles load in head, behavior loads at body end.
  if (url.pathname !== '/' && url.pathname !== '/index.html') return response;

  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (!response.ok || !contentType.includes('text/html')) return response;

  return new HTMLRewriter()
    .on('head', {
      element(element) {
        element.append(AI_WORKSPACE_STYLE, { html: true });
      },
    })
    .on('body', {
      element(element) {
        element.append(LAUNCH_SCRIPT + AI_WORKSPACE_SCRIPT, { html: true });
      },
    })
    .transform(response);
}
